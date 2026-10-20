/**
 * Carga la búsqueda del 18 oct 2026 sobre los padres de Carlota de las Mercedes Quintero García
 * (claude/padres-carlota-quintero-18-oct.md en el proyecto), cada dato con su enlace a FamilySearch.
 *
 * 1) Matrimonio de Pedro Quintero y Pastora García (13 jul 1846): el árbol lo tenía como «Contrato
 *    matrimonial» (código MARC del GEDCOM) sin lugar ni fuente. El acta es de un matrimonio en la parroquia
 *    Inmaculada Concepción de Maipo (Buin), así que se corrige a «Matrimonio», con lugar y enlace (6YLK-NKZQ).
 * 2) Nacimiento de Carlota (5 may 1857): se le pone el enlace del bautizo (6DZY-SPK6) y el lugar (Maipo).
 *    Solo si el hecho no tiene ya una fuente.
 * 3) Defunción de Pastora García Marchan (25 feb 1885, Santiago): hecho nuevo con el enlace del Registro Civil (Q24B-YL8L).
 *
 * No toca a Pedro (no se encontró su acta de defunción) ni a los hermanos de Carlota: quedan en el documento.
 * Los cambios se hacen con createEvent / updateEvent, así que quedan en Administración → Historial de cambios.
 * Se puede correr más de una vez: salta lo que ya tiene fuente.
 *
 *   npm run db:cargar-padres-carlota            (solo muestra qué haría, no escribe)
 *   npm run db:cargar-padres-carlota -- --apply (escribe)
 *   Opcional: --correo tu@correo.cl  (si no, usa el primer usuario)
 */
import dotenv from "dotenv";
import { getPool } from "../src/lib/db/pool";
import { createEvent, updateEvent } from "../src/lib/data/edit";
import { dateForEditing, validateEvent } from "../src/lib/edit";

dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ quiet: true });

const APPLY = process.argv.includes("--apply");
const mailIdx = process.argv.indexOf("--correo");
const MAIL = mailIdx > 0 ? process.argv[mailIdx + 1] : null;
const FS = (id: string) => `https://www.familysearch.org/ark:/61903/1:1:${id}`;
const PARR = "Chile, registros parroquiales y diocesanos, 1633-2015 (FamilySearch)";
const CIVIL = "Chile, Registro Civil, 1880-1933 (FamilySearch)";

const pool = getPool();
let treeId = "";
let actor = { id: "", name: "" };

async function byName(name: string): Promise<string | null> {
  const { rows } = await pool.query(
    `select p.id from persons p join person_names n on n.person_id = p.id
     where p.tree_id = $1 and lower(n.display_name) = lower($2) group by p.id`, [treeId, name]);
  if (rows.length > 1) throw new Error(`Hay ${rows.length} personas llamadas "${name}". Revisa el árbol.`);
  return rows[0]?.id ?? null;
}

const citas = (eventId: string) =>
  pool.query(`select count(*)::int as n from citations where event_id = $1`, [eventId]).then((r) => r.rows[0].n as number);

async function matrimonioPadres() {
  const pedro = await byName("Pedro Quintero");
  const pastora = await byName("Pastora García Marchan");
  if (!pedro || !pastora) { console.log("  ! No encontré a Pedro Quintero o a Pastora García Marchan: se salta el matrimonio."); return; }
  const { rows } = await pool.query(
    `select e.id, e.event_type, e.date_text, e.description, pl.raw_text as place
     from events e join families fa on fa.id = e.family_id left join places pl on pl.id = e.place_id
     where ((fa.partner1_id = $1 and fa.partner2_id = $2) or (fa.partner1_id = $2 and fa.partner2_id = $1))
       and e.event_type in ('MARC','MARR')`, [pedro, pastora]);
  if (rows.length !== 1) { console.log(`  ! Matrimonio de Pedro y Pastora: ${rows.length ? "hay " + rows.length : "no existe"}, se salta.`); return; }
  const r = rows[0];
  if (await citas(r.id)) { console.log("  = Matrimonio de Pedro y Pastora: ya tiene fuente"); return; }
  if (r.date_text !== "13 JUL 1846") { console.log(`  ! Matrimonio de Pedro y Pastora: la fecha es ${r.date_text}, no 13 JUL 1846; se salta.`); return; }
  const form = {
    type: "MARR", subtype: "", date: dateForEditing(r.date_text),
    place: r.place ?? "Inmaculada Concepción, Maipo, Buin, Maipo, Chile",
    text: (r.description as string | null)?.trim() ||
      "Matrimonio en la parroquia Inmaculada Concepción de Maipo (Buin); el índice anota «Pedro Qintero» y «Pastora Garcia». " +
      "Padres de él: Matildo Quintero y Casilda Astudillo. Padres de ella: Isidoro (Isidro) García y Lucía Marchán.",
    sourceTitle: PARR, sourceUrl: FS("6YLK-NKZQ"), sourceQuote: "", participants: [],
  };
  const v = validateEvent(form, form.date);
  if (!v.ok) throw new Error(`Matrimonio de Pedro y Pastora: ${JSON.stringify(v.errors)}`);
  console.log(`  + Matrimonio de Pedro y Pastora: ${r.event_type} → MARR, ${form.date}, lugar «${form.place}», enlace 6YLK-NKZQ`);
  if (!APPLY) return;
  const res = await updateEvent(treeId, r.id as string, form, actor);
  if (!res.ok) throw new Error(`Matrimonio de Pedro y Pastora: ${res.error} ${JSON.stringify(res.errors ?? {})}`);
}

async function nacimientoCarlota() {
  const id = await byName("Carlota de las Mercedes Quintero García");
  if (!id) { console.log("  ! No encontré a Carlota: se salta su nacimiento."); return; }
  const { rows } = await pool.query(
    `select e.id, e.event_subtype, e.date_text, e.description, pl.raw_text as place
     from events e left join places pl on pl.id = e.place_id where e.person_id = $1 and e.event_type = 'BIRT'`, [id]);
  if (rows.length !== 1) { console.log(`  ! Nacimiento de Carlota: ${rows.length ? "hay " + rows.length : "no existe"}, se salta.`); return; }
  const r = rows[0];
  if (await citas(r.id)) { console.log("  = Nacimiento de Carlota: ya tiene fuente"); return; }
  if (r.date_text !== "5 MAY 1857") { console.log(`  ! Nacimiento de Carlota: la fecha es ${r.date_text}; se salta.`); return; }
  const form = {
    type: "BIRT", subtype: r.event_subtype ?? "", date: dateForEditing(r.date_text),
    place: (r.place as string | null) || "Maipo, Chile",
    text: (r.description as string | null)?.trim() ||
      "Registro de su bautizo en Maipo (el índice solo da el año, 1857, y su nacimiento el 5 de mayo de 1857). Hija de Pedro Quintero y Pastora García; madrina Ynés Gómez. " +
      "Ojo con las edades de otros documentos: su defunción (1920) le calcula 75 años (nacida hacia 1845), y su matrimonio de 1878 le da 15 años (nacida hacia 1863). " +
      "Los padres se casaron en 1846, así que 1845 no calza; la fecha de este bautizo es la única con día y mes.",
    sourceTitle: PARR, sourceUrl: FS("6DZY-SPK6"), sourceQuote: "", participants: [],
  };
  const v = validateEvent(form, form.date);
  if (!v.ok) throw new Error(`Nacimiento de Carlota: ${JSON.stringify(v.errors)}`);
  console.log(`  + Nacimiento de Carlota: ${form.date}, lugar «${form.place}», enlace 6DZY-SPK6`);
  if (!APPLY) return;
  const res = await updateEvent(treeId, r.id as string, form, actor);
  if (!res.ok) throw new Error(`Nacimiento de Carlota: ${res.error} ${JSON.stringify(res.errors ?? {})}`);
}

async function defuncionPastora() {
  const id = await byName("Pastora García Marchan");
  if (!id) { console.log("  ! No encontré a Pastora García Marchan: se salta su defunción."); return; }
  const dup = await pool.query(
    `select e.id from events e where e.person_id = $1 and e.event_type = 'DEAT'`, [id]);
  if (dup.rows.length) { console.log("  = Defunción de Pastora: ya tiene un hecho de defunción (revísalo a mano)"); return; }
  const form = {
    type: "DEAT", subtype: "", date: "25 de febrero de 1885", place: "Santiago, Chile",
    text: "Registro Civil, circunscripción Moneda (Santiago), certificado 733, página 323. Murió a los 68 años (nacida hacia 1817); " +
      "el acta la llama «Pastorisa Garcia Marchan», hija de Isidro García y Lucía Marchán. " +
      "El índice anota como esposo a José González: puede ser un segundo matrimonio tras la muerte de Pedro Quintero o un error del acta.",
    sourceTitle: CIVIL, sourceUrl: FS("Q24B-YL8L"), sourceQuote: "", participants: [],
  };
  const v = validateEvent(form);
  if (!v.ok) throw new Error(`Defunción de Pastora: ${JSON.stringify(v.errors)}`);
  console.log("  + Defunción de Pastora García Marchan: 25 de febrero de 1885, Santiago, enlace Q24B-YL8L");
  if (!APPLY) return;
  const res = await createEvent(treeId, id, form, actor);
  if (!res.ok) throw new Error(`Defunción de Pastora: ${res.error} ${JSON.stringify(res.errors ?? {})}`);
}

async function main() {
  const { rows: trees } = await pool.query(`select id from trees order by created_at limit 1`);
  treeId = trees[0].id as string;
  const { rows: users } = MAIL
    ? await pool.query(`select id, name from users where lower(email) = lower($1)`, [MAIL])
    : await pool.query(`select id, name from users order by created_at limit 1`);
  if (!users[0]) throw new Error("No encontré el usuario. Usa --correo tu@correo.");
  actor = { id: users[0].id as string, name: users[0].name as string };
  console.log(`${APPLY ? "ESCRIBIENDO" : "SIMULACRO (no escribe)"} como ${actor.name}\n`);

  await matrimonioPadres();
  await nacimientoCarlota();
  await defuncionPastora();

  if (!APPLY) console.log("\nSi está bien, corre de nuevo con: npm run db:cargar-padres-carlota -- --apply");
  else console.log("\nListo.");
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => pool.end());
