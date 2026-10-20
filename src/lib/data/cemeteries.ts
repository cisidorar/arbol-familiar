// Los entierros del árbol, para la página de cementerios.

import { getPool } from "../db/pool";
import { groupBurials, type BurialRow, type CemeteryGroup } from "../cemeteries";
import { COMUNAS, normName } from "../geo/places";
import { KNOWN_CEMETERIES } from "../geo/cemeteries-catalog";

export async function getCemeteries(treeId: string): Promise<CemeteryGroup[]> {
  const { rows } = await getPool().query(
    `select e.id as event_id, e.person_id, pl.raw_text, pl.normalized, pl.locality, pl.comuna_code, pl.region_code, e.date_text as buried, e.description as note,
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
      eventId: r.event_id, personId: r.person_id, personName: r.person_name, placeText: r.raw_text, normalized: r.normalized,
      locality: r.locality, comunaCode: r.comuna_code, regionCode: r.region_code, birth: r.birth, death: r.death, buried: r.buried, note: r.note,
    }));
  return groupBurials(input);
}

export type CemeteryOption = {
  /** Lo que se guarda como lugar (el nombre estándar). */
  value: string;
  /** Cómo se muestra en la lista (sin la comuna ni "Chile"). */
  label: string;
  comunaCode: string | null;
  regionCode: string | null;
  /** Las distintas formas en que está escrito en el árbol (para reconocer el que ya tiene una persona). */
  raws: string[];
  /** Cuántas personas están sepultadas ahí. */
  n: number;
};

/** Todos los cementerios: los clasificados en el árbol más los conocidos de la lista fija. */
export async function listCemeteryOptions(treeId: string): Promise<CemeteryOption[]> {
  const { rows } = await getPool().query(
    `select pl.raw_text, pl.normalized, pl.comuna_code, pl.region_code,
            count(e.id) filter (where e.event_type = 'BURI')::int as n
       from places pl left join events e on e.place_id = pl.id
      where pl.tree_id = $1 and pl.place_kind = 'cemetery' and btrim(pl.raw_text) <> ''
      group by pl.id`,
    [treeId],
  );
  const byValue = new Map<string, CemeteryOption>();
  for (const r of rows) {
    const value = (r.normalized ?? r.raw_text) as string;
    const key = normName(value);
    const cur = byValue.get(key);
    if (cur) {
      cur.n += r.n;
      if (!cur.raws.includes(r.raw_text)) cur.raws.push(r.raw_text);
    } else {
      byValue.set(key, {
        value,
        label: value.replace(/,\s*Chile$/i, "").replace(/,\s*[^,]+$/, (m) => (r.comuna_code ? "" : m)),
        comunaCode: r.comuna_code ?? null,
        regionCode: r.region_code ?? null,
        raws: [r.raw_text],
        n: r.n,
      });
    }
  }
  for (const [name, code] of KNOWN_CEMETERIES) {
    const c = COMUNAS.find((x) => x[0] === code);
    if (!c) continue;
    const value = `${name}, ${c[1]}, Chile`;
    const key = normName(value);
    if (!byValue.has(key)) byValue.set(key, { value, label: name, comunaCode: c[0], regionCode: c[2], raws: [], n: 0 });
  }
  return [...byValue.values()].sort((a, b) => a.label.localeCompare(b.label, "es"));
}
