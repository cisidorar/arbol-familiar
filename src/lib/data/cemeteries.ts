// Los entierros del árbol, para la página de cementerios.

import { getPool } from "../db/pool";
import { groupBurials, type BurialRow, type CemeteryGroup } from "../cemeteries";

export async function getCemeteries(treeId: string): Promise<CemeteryGroup[]> {
  const { rows } = await getPool().query(
    `select e.person_id, pl.raw_text, pl.normalized, pl.locality, pl.comuna_code, pl.region_code, e.date_text as buried, e.description as note,
            (select pn.display_name from person_names pn where pn.person_id = e.person_id
               order by (pn.name_type = 'birth') desc, pn.id limit 1) as person_name,
            (select b.date_text from events b where b.person_id = e.person_id and b.event_type = 'BIRT' and b.date_text is not null limit 1) as birth,
            (select d.date_text from events d where d.person_id = e.person_id and d.event_type = 'DEAT' and d.date_text is not null limit 1) as death
       from events e
       join places pl on pl.id = e.place_id
      where e.tree_id = $1 and e.event_type = 'BURI' and e.person_id is not null and btrim(pl.raw_text) <> ''
      order by e.date_from nulls last`,
    [treeId],
  );
  const input: BurialRow[] = rows
    .filter((r) => r.person_name)
    .map((r) => ({
      personId: r.person_id, personName: r.person_name, placeText: r.raw_text, normalized: r.normalized,
      locality: r.locality, comunaCode: r.comuna_code, regionCode: r.region_code, birth: r.birth, death: r.death, buried: r.buried, note: r.note,
    }));
  return groupBurials(input);
}
