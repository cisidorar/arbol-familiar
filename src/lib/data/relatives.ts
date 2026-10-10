// Agregar a una persona nueva ya unida a un familiar (el "+" de una tarjeta):
// se crea la persona y su lugar en la familia en una sola transacción.
//
// Las familias de la base son uniones: `partner1_id` (el hombre, como el HUSB
// del GEDCOM), `partner2_id` (la mujer) y sus hijos en `family_children`. De
// ahí el árbol deduce quién es padre, hijo, hermano o pareja de quién.

import type { PoolClient } from "pg";
import { validateRelative, type RelativeValues } from "../relatives";
import { insertEvent, logChange, transaction, type Actor } from "./edit";

export type AddRelativeResult =
  | { ok: true; id: string }
  | { ok: false; status: 400 | 404 | 409; error: string; errors?: Record<string, string> };

type Sex = "M" | "F" | "U";

/** En qué lugar de una unión va cada uno: el hombre primero, como en el GEDCOM. */
function slots(a: { id: string; sex: Sex }, b: { id: string; sex: Sex } | null): [string | null, string | null] {
  if (!b) return a.sex === "F" ? [null, a.id] : [a.id, null];
  if (a.sex === "F" && b.sex !== "F") return [b.id, a.id];
  return [a.id, b.id];
}

async function createFamily(client: PoolClient, treeId: string, partner1: string | null, partner2: string | null) {
  const { rows } = await client.query(
    `insert into families (tree_id, partner1_id, partner2_id) values ($1, $2, $3) returning id`,
    [treeId, partner1, partner2],
  );
  return rows[0].id as string;
}

async function addChild(client: PoolClient, familyId: string, childId: string) {
  await client.query(`insert into family_children (family_id, child_id) values ($1, $2) on conflict do nothing`, [
    familyId,
    childId,
  ]);
}

/** Las familias en las que esta persona es hija, primero las que tienen a los dos padres. */
async function familiesAsChild(client: PoolClient, treeId: string, personId: string) {
  const { rows } = await client.query(
    `select f.id, f.partner1_id, f.partner2_id
     from families f
     join family_children fc on fc.family_id = f.id
     where f.tree_id = $1 and fc.child_id = $2
     order by (f.partner1_id is not null)::int + (f.partner2_id is not null)::int desc, f.created_at, f.id
     for update of f`,
    [treeId, personId],
  );
  return rows as { id: string; partner1_id: string | null; partner2_id: string | null }[];
}

async function link(
  client: PoolClient,
  treeId: string,
  v: RelativeValues,
  of: { id: string; sex: Sex },
  created: { id: string; sex: Sex },
): Promise<AddRelativeResult | null> {
  if (v.relation === "partner") {
    const [p1, p2] = slots(of, created);
    await createFamily(client, treeId, p1, p2);
    return null;
  }

  if (v.relation === "child") {
    let other: { id: string; sex: Sex } | null = null;
    if (v.otherParentId) {
      // El otro padre o madre tiene que ser una pareja suya: así el hijo
      // queda en la familia de los dos, no en una inventada.
      const { rows } = await client.query(
        `select p.id, p.sex from persons p
         where p.tree_id = $1 and p.id = $2 and exists (
           select 1 from families f where f.tree_id = $1
             and ((f.partner1_id = $2 and f.partner2_id = $3) or (f.partner1_id = $3 and f.partner2_id = $2)))`,
        [treeId, v.otherParentId, of.id],
      );
      if (!rows[0]) {
        return {
          ok: false, status: 400, error: "Revisa los campos marcados.",
          errors: { otherParentId: "Esa persona ya no figura como su pareja. Elige de nuevo." },
        };
      }
      other = { id: rows[0].id, sex: rows[0].sex ?? "U" };
    }
    const { rows: existing } = await client.query(
      `select id from families
       where tree_id = $1
         and ((partner1_id = $2 and partner2_id is not distinct from $3::uuid)
           or (partner2_id = $2 and partner1_id is not distinct from $3::uuid))
       order by created_at, id limit 1
       for update`,
      [treeId, of.id, other?.id ?? null],
    );
    const familyId = existing[0]?.id ?? (await createFamily(client, treeId, ...slots(of, other)));
    await addChild(client, familyId, created.id);
    return null;
  }

  const families = await familiesAsChild(client, treeId, of.id);

  if (v.relation === "sibling") {
    const family = families.find((f) => f.partner1_id || f.partner2_id);
    if (!family) {
      return {
        ok: false, status: 409,
        error: "Primero agrega a su padre o a su madre: los hermanos se unen por ellos.",
      };
    }
    await addChild(client, family.id, created.id);
    return null;
  }

  // Padre o madre: ocupa el lugar libre de la familia en la que ya es hijo
  // (y queda como padre o madre también de sus hermanos); si no tiene
  // familia, se arma una.
  const open = families.find((f) => !f.partner1_id || !f.partner2_id);
  if (!open && families.length) {
    return { ok: false, status: 409, error: "Ya tiene registrados a su padre y a su madre." };
  }
  if (!open) {
    const familyId = await createFamily(client, treeId, ...slots(created, null));
    await addChild(client, familyId, of.id);
    return null;
  }
  const preferSecond = created.sex === "F";
  const column =
    preferSecond && !open.partner2_id ? "partner2_id" : !open.partner1_id ? "partner1_id" : "partner2_id";
  await client.query(`update families set ${column} = $2 where id = $1`, [open.id, created.id]);
  return null;
}

export async function addRelative(treeId: string, input: unknown, actor: Actor): Promise<AddRelativeResult> {
  const validation = validateRelative(input);
  if (!validation.ok) {
    return { ok: false, status: 400, error: "Revisa los campos marcados.", errors: validation.errors };
  }
  const v = validation.value;

  return transaction<AddRelativeResult>(async (client) => {
    const { rows: found } = await client.query(
      `select p.id, p.sex, n.display_name
       from persons p
       left join person_names n on n.person_id = p.id and n.is_primary
       where p.tree_id = $1 and p.id = $2
       for update of p`,
      [treeId, v.of],
    );
    if (!found[0]) {
      return { ok: false, status: 404, error: "No se encontró a esa persona. Puede que alguien la haya borrado." };
    }
    const of = { id: found[0].id as string, sex: (found[0].sex ?? "U") as Sex };

    const { rows } = await client.query(
      `insert into persons (tree_id, sex, is_living, living_reason, notes, edited_at, edited_by)
       values ($1, $2, $3, 'manual', $4, now(), $5)
       returning id`,
      [treeId, v.person.sex, v.person.isLiving, v.person.notes, actor.id],
    );
    const created = { id: rows[0].id as string, sex: v.person.sex as Sex };
    await client.query(
      `insert into person_names (person_id, given_names, surname_pat, surname_mat, display_name, is_primary)
       values ($1, $2, $3, $4, $5, true)`,
      [created.id, v.person.given, v.person.surnamePat, v.person.surnameMat, v.person.displayName],
    );

    const problem = await link(client, treeId, v, of, created);
    if (problem) {
      // Deshace también la persona recién creada.
      throw new Rollback(problem);
    }

    await logChange(client, {
      treeId, actor, personId: created.id, entity: "person", entityId: created.id, action: "create",
      before: null,
      after: {
        given: v.person.given, surnamePat: v.person.surnamePat, surnameMat: v.person.surnameMat,
        sex: v.person.sex, isLiving: v.person.isLiving,
        relation: v.relation, relatedTo: found[0].display_name ?? null,
      },
    });
    if (v.birth) await insertEvent(client, treeId, created.id, v.birth, actor);

    return { ok: true, id: created.id };
  }).catch((err) => {
    if (err instanceof Rollback) return err.result;
    throw err;
  });
}

/** Para salir de la transacción deshaciendo todo, con la respuesta que corresponde. */
class Rollback extends Error {
  constructor(readonly result: AddRelativeResult) {
    super("rollback");
  }
}
