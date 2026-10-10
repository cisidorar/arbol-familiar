// Fecha tentativa del nacimiento de un hijo/a, anotada desde la ficha de su
// padre o madre. Se guarda en el vínculo familia–hijo: la ficha del hijo/a no
// cambia. Sin comprobar permisos (lo hace la ruta de la API).

import { validateChildBirthApprox } from "../relatives";
import { logChange, transaction, type Actor } from "./edit";

export type ChildBirthResult =
  | { ok: true }
  | { ok: false; status: 400 | 404; error: string; errors?: Record<string, string> };

export async function setChildBirthApprox(
  treeId: string,
  parentId: string,
  childId: string,
  rawDate: unknown,
  actor: Actor,
): Promise<ChildBirthResult> {
  const v = validateChildBirthApprox(rawDate);
  if (!v.ok) return { ok: false, status: 400, error: "Revisa la fecha.", errors: v.errors };

  return transaction<ChildBirthResult>(async (client) => {
    const { rows } = await client.query(
      `select fc.family_id, fc.approx_birth_text, n.display_name
       from family_children fc
       join families f on f.id = fc.family_id
       left join person_names n on n.person_id = fc.child_id and n.is_primary
       where f.tree_id = $1 and fc.child_id = $2 and (f.partner1_id = $3 or f.partner2_id = $3)
       for update of fc`,
      [treeId, childId, parentId],
    );
    if (!rows.length) return { ok: false, status: 404, error: "No se encontró a ese hijo o hija en esta familia." };

    await client.query(
      `update family_children fc set approx_birth_text = $3, approx_birth_from = $4
       from families f
       where f.id = fc.family_id and f.tree_id = $1 and fc.child_id = $2 and (f.partner1_id = $5 or f.partner2_id = $5)`,
      [treeId, childId, v.value?.text ?? null, v.value?.from ?? null, parentId],
    );
    await client.query(`update persons set edited_at = now(), edited_by = $2 where id = $1`, [parentId, actor.id]);
    await logChange(client, {
      treeId, actor, personId: parentId, entity: "person", entityId: parentId, action: "update",
      before: { childBirthApprox: rows[0].approx_birth_text ?? null, child: rows[0].display_name ?? null },
      after: { childBirthApprox: v.value?.text ?? null, child: rows[0].display_name ?? null },
    });
    return { ok: true };
  });
}
