/**
 * Solo lectura. Vuelca a data/export-ancestros.json los ancestros de una
 * persona (con hermanos, parejas, hechos, lugares y notas) tal como están en
 * la base de la app.
 *   npx tsx scripts/export-ancestros.ts "Luis Alfredo Zamora Canelo"
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { getPool } from "../src/lib/db/pool";

async function main() {
  const nombre = process.argv[2] ?? "Luis Alfredo Zamora Canelo";
  const pool = getPool();
  const { rows: start } = await pool.query(
    `select person_id from person_names where search_key like lower(immutable_unaccent($1)) || '%' limit 1`,
    [nombre],
  );
  if (!start.length) throw new Error("No encontré a " + nombre);
  const { rows: ids } = await pool.query(
    `with recursive a(id, gen) as (
       select $1::uuid, 0
       union
       select p.pid, a.gen + 1
       from a
       join family_children fc on fc.child_id = a.id
       join families f on f.id = fc.family_id
       cross join lateral (values (f.partner1_id), (f.partner2_id)) p(pid)
       where p.pid is not null and a.gen < 12
     ) select id, min(gen) gen from a group by id`,
    [start[0].person_id],
  );
  const idList = ids.map((r) => r.id);
  const gen = Object.fromEntries(ids.map((r) => [r.id, r.gen]));
  const { rows: personas } = await pool.query(
    `select p.id, p.sex, p.notes, p.gedcom_uid,
       (select display_name from person_names n where n.person_id=p.id order by is_primary desc limit 1) nombre,
       (select json_agg(json_build_object('tipo',e.event_type,'sub',e.event_subtype,'fecha',e.date_text,'lugar',coalesce(pl.normalized,pl.raw_text),'detalle',e.description) order by e.date_from)
          from events e left join places pl on pl.id=e.place_id where e.person_id=p.id) hechos,
       (select json_agg(json_build_object('familia',fc.family_id,'padre',f.partner1_id,'madre',f.partner2_id))
          from family_children fc join families f on f.id=fc.family_id where fc.child_id=p.id) padres
     from persons p where p.id = any($1::uuid[])`,
    [idList],
  );
  const { rows: familias } = await pool.query(
    `select f.id, f.partner1_id, f.partner2_id,
       (select json_agg(json_build_object('fecha',e.date_text,'lugar',coalesce(pl.normalized,pl.raw_text),'detalle',e.description,'tipo',e.event_type))
          from events e left join places pl on pl.id=e.place_id where e.family_id=f.id) hechos,
       (select json_agg(child_id) from family_children where family_id=f.id) hijos
     from families f where f.partner1_id = any($1::uuid[]) or f.partner2_id = any($1::uuid[])`,
    [idList],
  );
  const out = personas.map((p) => ({ ...p, generacion: gen[p.id] }));
  writeFileSync("data/export-ancestros.json", JSON.stringify({ personas: out, familias }, null, 1));
  console.log(`Listo: ${out.length} personas, ${familias.length} familias → data/export-ancestros.json`);
  await pool.end();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
