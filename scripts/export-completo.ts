/**
 * Solo lectura. Vuelca TODA la base de la app a data/export-completo.json
 * (personas, nombres, hechos con lugar/fuentes/participantes, familias, hijos).
 *   npm run db:export
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { getPool } from "../src/lib/db/pool";

async function main() {
  const pool = getPool();
  const q = async (sql: string) => (await pool.query(sql)).rows;

  const personas = await q(`
    select p.id, p.tree_id, p.sex, p.is_living, p.notes, p.edited_at,
      (select json_agg(json_build_object('nombre', n.display_name, 'primario', n.is_primary))
         from person_names n where n.person_id = p.id) nombres
    from persons p`);

  const hechos = await q(`
    select e.id, e.person_id, e.family_id, e.event_type tipo, e.event_subtype sub,
      e.date_text fecha, coalesce(pl.normalized, pl.raw_text) lugar, e.description detalle,
      (select json_agg(json_build_object('titulo', s.title, 'url', s.url, 'pagina', c.page, 'cita', c.transcription))
         from citations c join sources s on s.id = c.source_id where c.event_id = e.id) fuentes,
      (select json_agg(json_build_object('rol', ep.role, 'nombre', ep.name_text, 'persona', ep.person_id) order by ep.position)
         from event_participants ep where ep.event_id = e.id) participantes
    from events e left join places pl on pl.id = e.place_id`);

  const familias = await q(`
    select f.id, f.partner1_id, f.partner2_id,
      (select json_agg(json_build_object('hijo', fc.child_id, 'aprox', fc.approx_birth_text))
         from family_children fc where fc.family_id = f.id) hijos
    from families f`);

  const cambios = await q(`
    select created_at, user_name, person_name, entity, action, after
    from change_log order by created_at desc limit 300`);

  mkdirSync("data", { recursive: true });
  writeFileSync("data/export-completo.json", JSON.stringify({ personas, hechos, familias, cambios }, null, 1));
  console.log(`Listo: ${personas.length} personas, ${hechos.length} hechos, ${familias.length} familias → data/export-completo.json`);
  await pool.end();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
