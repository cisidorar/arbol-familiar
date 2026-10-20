/**
 * Completa el lugar de hechos de los hijos de Francisco González Uribe y Carlota Quintero que quedaron sin
 * lugar pero cuyo registro de FamilySearch dice dónde se inscribió (Buin, La Champa, Santiago).
 *
 * Solo escribe en hechos cuyo lugar está VACÍO: nunca cambia uno que ya tenga. Conserva la fecha, el texto, la
 * fuente y las personas relacionadas tal como están (es lo mismo que abrir el hecho en Editar y elegir el lugar).
 * El lugar de un nacimiento sale de donde se inscribió el nacimiento o el bautizo: casi seguro es donde nació,
 * pero el registro no lo dice con esas palabras. Queda en Administración → Historial de cambios.
 *
 *   npm run db:completar-lugares-hijos            (solo muestra qué haría, no escribe)
 *   npm run db:completar-lugares-hijos -- --apply (escribe)
 *   Opcional: --correo tu@correo.cl  (si no, usa el primer usuario)
 */
import dotenv from "dotenv";
import { getPool } from "../src/lib/db/pool";
import { updateEvent } from "../src/lib/data/edit";
import { dateForEditing, validateEvent } from "../src/lib/edit";

dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ quiet: true });

const APPLY = process.argv.includes("--apply");
const mailIdx = process.argv.indexOf("--correo");
const MAIL = mailIdx > 0 ? process.argv[mailIdx + 1] : null;

/** Persona (como se llama en el árbol), tipo de hecho, fecha del hecho (como está guardada), lugar y registro que lo dice. */
const LUGARES: { nombre: string; type: string; fecha: string; lugar: string; registro: string }[] = [
  { nombre: "Maria Virjinia Gonzalez Quinteros", type: "BIRT", fecha: "14 JAN 1890", lugar: "Buin", registro: "QPS6-Z74Q" },
  { nombre: "Isaias del Carmen Gonzalez Quinteros", type: "BIRT", fecha: "22 NOV 1885", lugar: "Buin", registro: "KZ7W-W5G" },
  { nombre: "Bruno González Quintero", type: "BIRT", fecha: "30 AUG 1892", lugar: "Buin", registro: "6DS6-BPV4" },
  { nombre: "Guadalupe González Quintero", type: "BIRT", fecha: "11 APR 1891", lugar: "Buin", registro: "6DSX-3LF2" },
  { nombre: "Jenoveva del Carmen Gonzalez Quinteros", type: "BIRT", fecha: "6 JAN 1894", lugar: "Buin", registro: "QLX9-Z6CB" },
  { nombre: "Jenoveva del Carmen Gonzalez Quinteros", type: "DEAT", fecha: "18 JUL 1894", lugar: "Buin", registro: "QPS6-H9T9" },
  { nombre: "Manuela del Carmen Gonzalez Quinteros", type: "BIRT", fecha: "16 OCT 1899", lugar: "Buin", registro: "KZ7W-WNV" },
  { nombre: "Manuela del Carmen Gonzalez Quinteros", type: "DEAT", fecha: "2 MAR 1900", lugar: "Buin", registro: "QPS6-C65B" },
  { nombre: "María Mercedes González Quintero", type: "BIRT", fecha: "24 SEP 1896", lugar: "Buin", registro: "KZ7C-Y5P" },
  { nombre: "Maria Salomé Gonzalez Quinteros", type: "BIRT", fecha: "27 MAR 1898", lugar: "Santiago", registro: "KZ7D-CWJ" },
  { nombre: "Lucrecia González Quintero", type: "DEAT", fecha: "13 AUG 1905", lugar: "La Champa, Paine", registro: "QLXS-CCCF" },
  { nombre: "Guadalupe del Carmen Gonzalez Quinteros", type: "DEAT", fecha: "31 DEC 1887", lugar: "Santiago", registro: "Q2TK-2JVH" },
];

const pool = getPool();

async function main() {
  const { rows: trees } = await pool.query(`select id from trees order by created_at limit 1`);
  const treeId = trees[0].id as string;
  const { rows: users } = MAIL
    ? await pool.query(`select id, name from users where lower(email) = lower($1)`, [MAIL])
    : await pool.query(`select id, name from users order by created_at limit 1`);
  if (!users[0]) throw new Error("No encontré el usuario. Usa --correo tu@correo.");
  const actor = { id: users[0].id as string, name: users[0].name as string };
  console.log(`${APPLY ? "ESCRIBIENDO" : "SIMULACRO (no escribe)"} como ${actor.name}\n`);

  let puestos = 0;
  let saltados = 0;
  for (const l of LUGARES) {
    const { rows } = await pool.query(
      `select e.id, e.event_subtype, e.date_text, e.description, pl.raw_text as place,
              src.title as source_title, src.url as source_url, src.quote as source_quote
       from events e
       join persons p on p.id = e.person_id and p.tree_id = $1
       join person_names n on n.person_id = p.id and lower(n.display_name) = lower($2)
       left join places pl on pl.id = e.place_id
       left join lateral (
         select s.title, s.url, c.transcription as quote
         from citations c join sources s on s.id = c.source_id
         where c.event_id = e.id and s.url is not null order by c.created_at limit 1
       ) src on true
       where e.event_type = $3 and e.date_text = $4`,
      [treeId, l.nombre, l.type, l.fecha],
    );
    const etiqueta = `${l.nombre} — ${l.type} ${l.fecha}`;
    if (rows.length !== 1) { console.log(`  ! ${etiqueta}: ${rows.length ? `hay ${rows.length}` : "no lo encontré"}, se salta.`); saltados++; continue; }
    const r = rows[0];
    if ((r.place as string | null)?.trim()) { console.log(`  = ${etiqueta}: ya tiene lugar (${r.place})`); saltados++; continue; }
    if (r.source_url && (r.source_url as string).includes("/ark:/") && !(r.source_url as string).includes(l.registro)) {
      console.log(`  ! ${etiqueta}: su fuente no es ${l.registro}, se salta.`); saltados++; continue;
    }
    const { rows: parts } = await pool.query(
      `select role, name_text, person_id from event_participants where event_id = $1 order by position`, [r.id]);
    const form = {
      type: l.type, subtype: r.event_subtype ?? "", date: dateForEditing(r.date_text), place: l.lugar,
      text: r.description ?? "", sourceTitle: r.source_title ?? "", sourceUrl: r.source_url ?? "", sourceQuote: r.source_quote ?? "",
      participants: parts.map((x) => ({ role: x.role as string, name: x.name_text as string, personId: x.person_id as string | null })),
    };
    const v = validateEvent(form, form.date);
    if (!v.ok) throw new Error(`${etiqueta}: ${JSON.stringify(v.errors)}`);
    console.log(`  + ${etiqueta}: lugar «${l.lugar}» (registro ${l.registro})`);
    puestos++;
    if (!APPLY) continue;
    const res = await updateEvent(treeId, r.id as string, form, actor);
    if (!res.ok) throw new Error(`${etiqueta}: ${res.error} ${JSON.stringify(res.errors ?? {})}`);
  }
  console.log(`\n${APPLY ? "Listo" : "Haría"}: ${puestos} lugares completados, ${saltados} ya tenían o se saltaron.`);
  if (!APPLY) console.log("Si está bien, corre de nuevo con: npm run db:completar-lugares-hijos -- --apply");
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => pool.end());
