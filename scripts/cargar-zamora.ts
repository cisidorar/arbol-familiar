/**
 * Carga lo investigado el 9 oct 2026 sobre la rama de Luis Alfredo Zamora Canelo
 * (ver claude/investigacion-rama-luis-alfredo-zamora.md en el proyecto).
 * Usa las mismas funciones que la app (addRelative, createEvent), así cada cambio
 * queda en Administración → Historial de cambios, a nombre de la cuenta indicada.
 * Es seguro correrlo más de una vez: salta lo que ya existe.
 *
 *   npm run db:cargar-zamora            (solo muestra qué haría, no escribe)
 *   npm run db:cargar-zamora -- --apply (escribe)
 *   Opcional: --correo tu@correo.cl  (si no, usa el primer usuario)
 */
import "dotenv/config";
import { getPool } from "../src/lib/db/pool";
import { addRelative } from "../src/lib/data/relatives";
import { createEvent } from "../src/lib/data/edit";
import { validateEvent, validatePerson } from "../src/lib/edit";

const APPLY = process.argv.includes("--apply");
const mailIdx = process.argv.indexOf("--correo");
const MAIL = mailIdx > 0 ? process.argv[mailIdx + 1] : null;
const FS = (id: string) => `https://www.familysearch.org/ark:/61903/1:1:${id}`;
const FSTREE = (id: string) => `https://www.familysearch.org/es/tree/person/details/${id}`;
const SE = "San Esteban, Aconcagua, Chile";
const VINA = "Viña del Mar, Valparaíso, Chile";

type Ev = { type: string; subtype?: string; date?: string; place?: string; text?: string; sourceUrl: string; sourceTitle: string };
type Hijo = { given: string; sex: "M" | "F"; birth: Ev; nota: string };

const REG = "Chile, Registro Civil, 1880-1933 (FamilySearch)";
const HERMANOS: Hijo[] = [
  { given: "Luis Roberto", sex: "M", nota: "Aparece como \"Luis Roberto Samora\" en el índice (9JT8-HMV).",
    birth: { type: "BIRT", date: "1881", place: SE, text: "Año según su bautismo indexado.", sourceUrl: FSTREE("9JT8-HMV"), sourceTitle: "Luis Roberto Samora, árbol de FamilySearch" } },
  { given: "Viterbo Rosario", sex: "M", nota: "Nombre y año según su bautismo indexado (9JTD-4K8).",
    birth: { type: "BIRT", date: "1883", place: SE, text: "Año según su bautismo indexado.", sourceUrl: FSTREE("9JTD-4K8"), sourceTitle: "Viterbo Rosario Zamora, árbol de FamilySearch" } },
  { given: "Cármen", sex: "F", nota: "Inscrita como \"Cármen Zamora y Galdamez\".",
    birth: { type: "BIRT", date: "12 de noviembre de 1885", place: SE, text: "Certificado 392, página 220.", sourceUrl: FS("Q2SP-W1WT"), sourceTitle: REG } },
  { given: "Miguel", sex: "M", nota: "El índice lo da como \"Miguel Zamora Mandiola\" (con el apellido de la abuela materna): el acta es Q245-FFF2 y Q2S2-ZBNF.",
    birth: { type: "BIRT", date: "1892", place: SE, text: "Año según el índice; falta ver el acta.", sourceUrl: FS("Q245-FFF2"), sourceTitle: REG } },
];

// Hechos para personas que ya están en el árbol (se buscan por su nombre tal cual sale).
const HECHOS: { persona: string; ev: Ev }[] = [
  { persona: "Regina Zamora Galdamez", ev: { type: "EVEN", subtype: "Inscripción civil de nacimiento", date: "5 de diciembre de 1893", place: SE,
      text: "Inscrita como \"Rejina Zamora Galdamez\" (certificado 449, página 225): es la misma Regina del árbol.",
      sourceUrl: FS("Q2SL-WSD7"), sourceTitle: REG } },
  { persona: "Pedro Zamora Galdamez", ev: { type: "EVEN", subtype: "Inscripción civil de nacimiento", date: "25 de julio de 1901", place: SE,
      text: "Certificado 252, página 53. El árbol lo da nacido el 21 de julio de 1901: probablemente el 25 es la fecha de la inscripción. Falta ver el acta.",
      sourceUrl: FS("KRS8-622"), sourceTitle: REG } },
  { persona: "Daniel Zamora", ev: { type: "BAPM", date: "13 de diciembre de 1862", place: SE,
      text: "Solo figura la madre, Carmen Zamora; el padre no se nombra. Falta confirmar con la imagen que sea el mismo Daniel casado en 1881.",
      sourceUrl: FS("FJ5H-HBH"), sourceTitle: "Chile, bautismos, 1585-1932 (FamilySearch)" } },
  { persona: "Manuel Zamora Galdames", ev: { type: "BIRT", date: "1 de julio de 1888", place: SE,
      text: "PROBABLE: acta de Manuel Jesús Zamora Galdamez, hijo de Daniel Zamora y Natividad Galdamez (certificado 234, página 79). Falta confirmar que sea él con su matrimonio o defunción.",
      sourceUrl: FS("Q2SP-4SH3"), sourceTitle: REG } },
  { persona: "Rosa Elvira Canelo Frez", ev: { type: "EVEN", subtype: "Inscripción civil de nacimiento", date: "2 de marzo de 1896", place: VINA,
      text: "Certificado 100, página 51. El índice solo nombra al padre, José Canelo: no figura la madre. Falta ver la imagen.",
      sourceUrl: FS("Q2HM-Z8XJ"), sourceTitle: REG } },
  { persona: "José Canelo", ev: { type: "EVEN", subtype: "Otra hija inscrita como suya", date: "5 de enero de 1895", place: VINA,
      text: "María Canelo, nacida ese día en Viña del Mar (certificado 16, página 9). Solo figura él como padre, igual que en el acta de Rosa Elvira. Probable hermana de Rosa Elvira; falta confirmar.",
      sourceUrl: FS("Q2HM-Z47C"), sourceTitle: REG } },
];

const pool = getPool();

async function one(name: string, treeId: string) {
  const { rows } = await pool.query(
    `select p.id from persons p join person_names n on n.person_id = p.id
     where p.tree_id = $1 and n.display_name = $2 group by p.id`, [treeId, name]);
  if (rows.length !== 1) throw new Error(`Esperaba una sola persona llamada "${name}" y hay ${rows.length}. Revisa el árbol.`);
  return rows[0].id as string;
}
const evForm = (e: Ev) => ({ type: e.type, subtype: e.subtype ?? "", date: e.date ?? "", place: e.place ?? "", text: e.text ?? "", sourceUrl: e.sourceUrl, sourceTitle: e.sourceTitle });
async function hasSource(personId: string, url: string) {
  const { rows } = await pool.query(
    `select 1 from citations c join sources s on s.id = c.source_id join events e on e.id = c.event_id
     where e.person_id = $1 and s.url = $2 limit 1`, [personId, url]);
  return rows.length > 0;
}

async function main() {
  const { rows: trees } = await pool.query(`select id from trees order by created_at limit 1`);
  const treeId = trees[0].id as string;
  const { rows: users } = MAIL
    ? await pool.query(`select id, name from users where lower(email) = lower($1)`, [MAIL])
    : await pool.query(`select id, name from users order by created_at limit 1`);
  if (!users[0]) throw new Error("No encontré el usuario. Usa --correo tu@correo.");
  const actor = { id: users[0].id as string, name: users[0].name as string };
  console.log(`${APPLY ? "ESCRIBIENDO" : "SIMULACRO (no escribe)"} como ${actor.name}\n`);

  const manuel = await one("Manuel Zamora Galdames", treeId);
  let nuevos = 0, hechos = 0, saltados = 0;

  for (const h of HERMANOS) {
    const display = `${h.given} Zamora Galdamez`;
    const { rows: ya } = await pool.query(
      `select p.id from persons p join person_names n on n.person_id = p.id
       where p.tree_id = $1 and lower(n.display_name) = lower($2)`, [treeId, display]);
    if (ya.length) { console.log(`= ya existe: ${display}`); saltados++; continue; }
    const person = { given: h.given, surnamePat: "Zamora", surnameMat: "Galdamez", sex: h.sex, isLiving: false, notes: h.nota };
    const v1 = validatePerson(person), v2 = validateEvent(evForm(h.birth));
    if (!v1.ok || !v2.ok) throw new Error(`Datos inválidos en ${display}: ${JSON.stringify(!v1.ok ? v1.errors : !v2.ok ? v2.errors : "")}`);
    console.log(`+ hermano de Manuel: ${display} (${h.birth.date})`);
    nuevos++;
    if (!APPLY) continue;
    const r = await addRelative(treeId, { relation: "sibling", of: manuel, person }, actor);
    if (!r.ok) throw new Error(`${display}: ${r.error} ${JSON.stringify(r.errors ?? {})}`);
    const e = await createEvent(treeId, r.id, evForm(h.birth), actor);
    if (!e.ok) throw new Error(`${display} (hecho): ${e.error} ${JSON.stringify(e.errors ?? {})}`);
  }

  for (const { persona, ev } of HECHOS) {
    const id = await one(persona, treeId);
    const v = validateEvent(evForm(ev));
    if (!v.ok) throw new Error(`Hecho inválido de ${persona}: ${JSON.stringify(v.errors)}`);
    if (await hasSource(id, ev.sourceUrl)) { console.log(`= ya cargado: ${persona} — ${ev.type} ${ev.date}`); saltados++; continue; }
    console.log(`+ hecho para ${persona}: ${ev.subtype ?? ev.type} ${ev.date}`);
    hechos++;
    if (!APPLY) continue;
    const e = await createEvent(treeId, id, evForm(ev), actor);
    if (!e.ok) throw new Error(`${persona}: ${e.error} ${JSON.stringify(e.errors ?? {})}`);
  }
  console.log(`\n${APPLY ? "Listo" : "Haría"}: ${nuevos} personas nuevas, ${hechos} hechos nuevos, ${saltados} ya estaban.`);
  if (!APPLY) console.log("Si está bien, corre de nuevo con: npm run db:cargar-zamora -- --apply");
  await pool.end();
}
main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
