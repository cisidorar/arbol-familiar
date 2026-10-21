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


export type PublicSurname = {
  surname: string;
  /** Cuántas personas del archivo llevan este apellido (paterno). */
  people: number;
  /** El nacimiento más antiguo conocido (siempre anterior a 1930). */
  since: number;
  /** Dónde nacieron más de ellos (solo nacimientos anteriores a 1930). */
  place: string | null;
};

/**
 * Los apellidos que sigue el archivo, para la portada pública. Solo agregados:
 * cuántas personas, desde qué año y en qué comuna se concentran. Los años y
 * lugares salen solo de nacimientos anteriores a 1930, para no insinuar nada
 * de personas vivas.
 */
export async function getPublicSurnames(treeId: string, limit = 8): Promise<PublicSurname[]> {
  try {
    const { rows } = await getPool().query(
      `with s as (
         select p.id, initcap(lower(trim(n.surname_pat))) as sur,
                lower(immutable_unaccent(trim(n.surname_pat))) as k
         from persons p
         join person_names n on n.person_id = p.id and n.is_primary
         where p.tree_id = $1 and coalesce(trim(n.surname_pat), '') <> ''
       ),
       old as (
         select s.k, s.id, extract(year from e.date_from)::int as y
         from s
         join events e on e.person_id = s.id and e.event_type in ('BIRT', 'CHR', 'BAPM') and e.date_from is not null
         where extract(year from e.date_from) between 1500 and 1929
       )
       select s.k,
              mode() within group (order by s.sur) as surname,
              count(distinct s.id)::int as people,
              (select min(o.y) from old o where o.k = s.k) as since,
              (select array_agg(distinct o.id) from old o where o.k = s.k) as old_ids
       from s
       group by s.k
       having count(distinct s.id) >= 3
       order by count(distinct s.id) desc, s.k
       limit $2`,
      [treeId, limit * 3],
    );
    // La comuna donde más nacieron (con la misma lectura de lugares que el mapa).
    const [{ getPersonFacts }, { pickOrigin }, { comunasOfRegion }] = await Promise.all([
      import("./origins"),
      import("../origins"),
      import("../geo"),
    ]);
    const facts = await getPersonFacts(treeId);
    // Solo apellidos con antepasados nacidos antes de 1930: así no aparecen ramas de pura gente viva.
    return rows.filter((r) => r.since != null).slice(0, limit).map((r) => {
      const tally = new Map<string, { n: number; region: string }>();
      for (const id of (r.old_ids ?? []) as string[]) {
        const o = pickOrigin(facts.get(id), true);
        if (o.kind !== "comuna") continue;
        const cur = tally.get(o.code) ?? { n: 0, region: o.regionCode };
        cur.n++;
        tally.set(o.code, cur);
      }
      const best = [...tally.entries()].sort((a, b) => b[1].n - a[1].n)[0];
      const place = best ? comunasOfRegion(best[1].region).find((c) => c.code === best[0])?.name ?? null : null;
      return { surname: r.surname, people: r.people, since: r.since ?? null, place };
    });
  } catch {
    return [];
  }
}
