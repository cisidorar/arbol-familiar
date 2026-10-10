// Dónde nació (o se bautizó, o se casó) cada persona del árbol, para el mapa de orígenes.

import { getPool } from "../db/pool";
import type { PlaceFacts } from "../origins";

type Row = {
  person_id: string;
  event_type: "BIRT" | "BAPM" | "MARR";
  raw_text: string;
  locality: string | null;
  admin1: string | null;
  country: string | null;
  comuna_code?: string | null;
  region_code?: string | null;
};

const query = (withCodes: boolean) => `
  select x.person_id, x.event_type, pl.raw_text, pl.locality, pl.admin1, pl.country
         ${withCodes ? ", pl.comuna_code, pl.region_code" : ""}
  from (
    select e.person_id, e.event_type, e.place_id, e.date_from from events e
      where e.tree_id = $1 and e.person_id is not null and e.event_type in ('BIRT', 'BAPM')
    union all
    select p.pid as person_id, e.event_type, e.place_id, e.date_from
      from events e
      join families f on f.id = e.family_id
      cross join lateral (values (f.partner1_id), (f.partner2_id)) as p(pid)
      where e.tree_id = $1 and e.event_type = 'MARR' and p.pid is not null
  ) x
  join places pl on pl.id = x.place_id
  order by x.date_from nulls last`;

/** Lugares conocidos de cada persona, por nacimiento, bautismo y matrimonio (el primero con lugar de cada tipo). */
export async function getPersonFacts(treeId: string): Promise<Map<string, PlaceFacts>> {
  let rows: Row[];
  try {
    rows = (await getPool().query(query(true), [treeId])).rows;
  } catch (err) {
    // Sin la migración 0009 los lugares aún no tienen código de comuna: se reconocen por el nombre.
    if ((err as { code?: string }).code !== "42703") throw err;
    rows = (await getPool().query(query(false), [treeId])).rows;
  }
  const out = new Map<string, PlaceFacts>();
  const key = { BIRT: "birth", BAPM: "baptism", MARR: "marriage" } as const;
  for (const r of rows) {
    if (!r.raw_text?.trim()) continue;
    const facts = out.get(r.person_id) ?? {};
    const basis = key[r.event_type];
    if (!facts[basis]) {
      facts[basis] = {
        rawText: r.raw_text,
        locality: r.locality,
        admin1: r.admin1,
        country: r.country,
        comunaCode: r.comuna_code ?? null,
        regionCode: r.region_code ?? null,
      };
    }
    out.set(r.person_id, facts);
  }
  return out;
}
