// Teoría: quienes están arriba de un vínculo marcado como teoría (padres sin acta que lo confirme) y todos sus
// antepasados. En el árbol se muestran en otro color; en lo que se le cuenta a la familia (portada, novedades,
// cifras) no se dan por hechos, así que se dejan fuera.
import { getPool } from "../db/pool";

/** CTE `theory(id)` (para usar después de `with recursive`). Espera el id del árbol en `$1`. */
export const THEORY_CTE = `theory(id) as (
  select v.parent
  from persons c
  join family_children fc on fc.child_id = c.id
  join families f on f.id = fc.family_id
  cross join lateral (values (f.partner1_id), (f.partner2_id)) as v(parent)
  where c.tree_id = $1 and c.parents_theory and v.parent is not null
  union
  select v.parent
  from theory t
  join family_children fc on fc.child_id = t.id
  join families f on f.id = fc.family_id
  cross join lateral (values (f.partner1_id), (f.partner2_id)) as v(parent)
  where v.parent is not null
)`;

/** Nombre comparable: sin tildes, en minúsculas y con los espacios justos. */
export function nameKey(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Los nombres (comparables con `nameKey`) de quienes son teoría. Si la consulta falla, ninguno. */
export async function getTheoryNameKeys(treeId: string): Promise<Set<string>> {
  try {
    const { rows } = await getPool().query(
      `with recursive ${THEORY_CTE}
       select distinct n.display_name from theory t join person_names n on n.person_id = t.id and n.is_primary`,
      [treeId],
    );
    return new Set(rows.map((r) => nameKey(String(r.display_name ?? ""))).filter(Boolean));
  } catch {
    return new Set();
  }
}

/** Deja fuera lo que habla de alguien que es teoría (cada entrada nombra a sus personas en `personas`). */
export function withoutTheory<T extends { personas?: readonly string[] }>(items: readonly T[], theory: ReadonlySet<string>): T[] {
  return items.filter((it) => !(it.personas ?? []).some((p) => theory.has(nameKey(p))));
}
