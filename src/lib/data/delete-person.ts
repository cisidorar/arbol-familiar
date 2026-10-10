// Eliminar a una persona del árbol, con todo lo suyo (nombres, hechos, lugar
// como hijo/a). Las uniones en que figuraba quedan sin ella; si una unión se
// queda sin nadie o con una sola persona y sin hijos, se borra también. Los
// hijos de la persona NO se borran: quedan con su otro padre o madre.
//
// Queda en el historial con lo que se borró. Sin comprobar permisos: lo hace
// quien llama (la ruta de la API).

import { logChange, transaction, type Actor } from "./edit";

export type DeletePersonResult =
  | { ok: true; name: string | null }
  | { ok: false; status: 404 | 409; error: string };

export async function deletePerson(treeId: string, personId: string, actor: Actor): Promise<DeletePersonResult> {
  return transaction<DeletePersonResult>(async (client) => {
    const { rows } = await client.query(
      `select p.id, p.sex, p.is_living, p.gedcom_uid, n.display_name, n.given_names, n.surname_pat, n.surname_mat,
              (select count(*)::int from events e where e.person_id = p.id) as events
       from persons p
       left join person_names n on n.person_id = p.id and n.is_primary
       where p.tree_id = $1 and p.id = $2
       for update of p`,
      [treeId, personId],
    );
    const person = rows[0];
    if (!person) return { ok: false, status: 404, error: "No se encontró a esa persona. Puede que alguien ya la haya eliminado." };

    const { rows: linked } = await client.query(`select 1 from users where person_id = $1 limit 1`, [personId]);
    if (linked[0]) {
      return {
        ok: false, status: 409,
        error: "Esta persona es la ficha de alguien que usa el archivo. Cambia primero a qué persona está vinculada esa cuenta.",
      };
    }

    // Uniones afectadas, para limpiar las que queden vacías.
    const { rows: fams } = await client.query(
      `select id from families where tree_id = $1 and (partner1_id = $2 or partner2_id = $2
         or id in (select family_id from family_children where child_id = $2))`,
      [treeId, personId],
    );

    await logChange(client, {
      treeId, actor, personId, entity: "person", entityId: personId, action: "delete",
      before: {
        given: person.given_names, surnamePat: person.surname_pat, surnameMat: person.surname_mat,
        sex: person.sex, isLiving: person.is_living, events: person.events,
      },
      after: null,
    });

    if (person.gedcom_uid) {
      await client.query(
        `insert into deleted_persons (tree_id, gedcom_uid) values ($1, $2) on conflict do nothing`,
        [treeId, person.gedcom_uid],
      );
    }
    await client.query(`delete from persons where id = $1`, [personId]);

    for (const f of fams) {
      await client.query(
        `delete from families f
         where f.id = $1
           and not exists (select 1 from family_children fc where fc.family_id = f.id)
           and ((f.partner1_id is null)::int + (f.partner2_id is null)::int) >= 1`,
        [f.id],
      );
    }
    return { ok: true, name: person.display_name ?? null };
  });
}
