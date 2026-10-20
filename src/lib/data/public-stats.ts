// Cifras generales para la portada pública. Solo agregados (cuántas personas,
// cuántas generaciones, el año más antiguo): nada que identifique a nadie.
import { getPool } from "../db/pool";

export type PublicStats = { people: number; generations: number | null; oldestYear: number | null };

export async function getPublicStats(treeId: string): Promise<PublicStats | null> {
  try {
    const pool = getPool();
    const [people, gens, oldest] = await Promise.all([
      pool.query(`select count(*)::int as n from persons where tree_id = $1`, [treeId]),
      // Generaciones = la cadena más larga de padres a hijos (con tope por si hubiera un ciclo).
      pool.query(
        `with recursive edges as (
           select v.parent, fc.child_id as child
           from families f
           cross join lateral (values (f.partner1_id), (f.partner2_id)) as v(parent)
           join family_children fc on fc.family_id = f.id
           where f.tree_id = $1 and v.parent is not null
         ),
         chain(person, depth) as (
           select p.id, 1 from persons p
           where p.tree_id = $1 and not exists (select 1 from edges e where e.child = p.id)
           union all
           select e.child, c.depth + 1 from chain c join edges e on e.parent = c.person where c.depth < 30
         )
         select coalesce(max(depth), 0)::int as n from chain`,
        [treeId],
      ),
      pool.query(
        `select min(extract(year from date_from))::int as y from events
         where tree_id = $1 and date_from is not null and extract(year from date_from) >= 1500`,
        [treeId],
      ),
    ]);
    return {
      people: people.rows[0].n,
      generations: gens.rows[0].n > 0 ? gens.rows[0].n : null,
      oldestYear: oldest.rows[0].y ?? null,
    };
  } catch {
    return null;
  }
}

