// Padrinos, testigos y demás "personas relacionadas" de un hecho que quedaron
// solo con su nombre: esto los agrega al árbol y los vincula con el hecho,
// en un paso (el botón "Agregar al árbol" de la ficha).
import { getPool } from "../db/pool";
import { validatePerson } from "../edit";
import { validateRelative } from "../relatives";
import { logChange, transaction, type Actor } from "./edit";
import { addRelative } from "./relatives";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PromoteInput = {
  person?: unknown;
  /** Opcional: de quién es familiar la persona nueva (normalmente, de la dueña del hecho). */
  relation?: unknown;
  of?: unknown;
};

type Fail = { ok: false; status: 400 | 404 | 409; error: string; errors?: Record<string, string> };
type Result = { ok: true; personId: string } | Fail;

/**
 * Crea a la persona (con el nombre, sexo y parentesco que dé quien edita) y la deja
 * vinculada en esa fila de personas relacionadas del hecho. Si el parentesco falla
 * (por ejemplo, "hermano" de alguien sin padres), no se crea nada.
 */
export async function promoteParticipant(
  treeId: string,
  eventId: string,
  participantId: string,
  input: PromoteInput,
  actor: Actor,
): Promise<Result> {
  if (!UUID.test(eventId) || !UUID.test(participantId)) return { ok: false, status: 404, error: "No se encontró." };
  const person = validatePerson(input.person);
  if (!person.ok) return { ok: false, status: 400, error: "Revisa los campos marcados.", errors: person.errors };

  const { rows } = await getPool().query(
    `select id, person_id from event_participants where tree_id = $1 and event_id = $2 and id = $3`,
    [treeId, eventId, participantId],
  );
  if (!rows[0]) return { ok: false, status: 404, error: "Esa persona ya no figura en el hecho." };
  if (rows[0].person_id) return { ok: false, status: 409, error: "Ya está vinculada con el árbol." };

  let personId: string;
  if (input.relation) {
    const check = validateRelative({ relation: input.relation, of: input.of, person: input.person });
    if (!check.ok) return { ok: false, status: 400, error: "Revisa los campos marcados.", errors: check.errors };
    const added = await addRelative(treeId, { relation: input.relation, of: input.of, person: input.person }, actor);
    if (!added.ok) return { ok: false, status: added.status, error: added.error, errors: added.errors };
    personId = added.id;
  } else {
    personId = await transaction(async (client) => {
      const v = person.value;
      const { rows: created } = await client.query(
        `insert into persons (tree_id, sex, is_living, living_reason, notes, edited_at, edited_by)
         values ($1, $2, $3, 'manual', $4, now(), $5) returning id`,
        [treeId, v.sex, v.isLiving, v.notes, actor.id],
      );
      const id = created[0].id as string;
      await client.query(
        `insert into person_names (person_id, given_names, surname_pat, surname_mat, display_name, is_primary)
         values ($1, $2, $3, $4, $5, true)`,
        [id, v.given, v.surnamePat, v.surnameMat, v.displayName],
      );
      await logChange(client, {
        treeId, actor, personId: id, entity: "person", entityId: id, action: "create", before: null,
        after: { given: v.given, surnamePat: v.surnamePat, surnameMat: v.surnameMat, sex: v.sex, isLiving: v.isLiving, relation: null, relatedTo: null },
      });
      return id;
    });
  }

  await transaction(async (client) => {
    await client.query(`update event_participants set person_id = $1 where id = $2 and person_id is null`, [personId, participantId]);
    await client.query(`update events set updated_at = now(), updated_by = $2 where id = $1`, [eventId, actor.id]);
  });
  return { ok: true, personId };
}
