/**
 * Carga los ascendientes y hermanos de Isidora Valencia Araya (10 oct 2026),
 * leídos del Árbol Familiar de FamilySearch (claude/investigacion-jose-dolores-canelo.md).
 *
 * OJO: casi todas estas fechas vienen del árbol colaborativo, NO de actas. Cada hecho
 * lleva como fuente la ficha del árbol, y las notas dicen qué tiene fuente y qué no.
 * No carga a Isidora (1850) ni a los abuelos Araya/Araos como hechos: ver notas.
 *
 *   npm run db:cargar-valencia            (solo muestra qué haría)
 *   npm run db:cargar-valencia -- --apply (escribe)
 *   Opcional: --correo tu@correo.cl
 */
import "dotenv/config";
import { getPool } from "../src/lib/db/pool";
import { addRelative } from "../src/lib/data/relatives";
import { createEvent } from "../src/lib/data/edit";
import { validateEvent, validatePerson } from "../src/lib/edit";

const APPLY = process.argv.includes("--apply");
const mailIdx = process.argv.indexOf("--correo");
const MAIL = mailIdx > 0 ? process.argv[mailIdx + 1] : null;
const TREE = (id: string) => `https://www.familysearch.org/tree/person/details/${id}`;
const ARBOL = "Árbol Familiar de FamilySearch (colaborativo, no es un acta)";

type Ev = { type: string; subtype?: string; date?: string; place?: string; text?: string; sourceUrl: string; sourceTitle: string };
type Nuevo = { given: string; pat: string; mat: string; sex: "M" | "F"; nota?: string; hechos: Ev[] };

const pool = getPool();
let treeId = "";
let actor = { id: "", name: "" };
const cuenta = { nuevos: 0, hechos: 0, saltados: 0 };

const evForm = (e: Ev) => ({
  type: e.type, subtype: e.subtype ?? "", date: e.date ?? "", place: e.place ?? "", text: e.text ?? "",
  sourceUrl: e.sourceUrl, sourceTitle: e.sourceTitle, sourceQuote: "", participants: [],
});
const display = (n: Nuevo) => [n.given, n.pat, n.mat].filter(Boolean).join(" ");

async function byName(name: string): Promise<string | null> {
  const { rows } = await pool.query(
    `select p.id from persons p join person_names n on n.person_id = p.id
     where p.tree_id = $1 and lower(n.display_name) = lower($2) group by p.id`, [treeId, name]);
  if (rows.length > 1) throw new Error(`Hay ${rows.length} personas llamadas "${name}". Revisa el árbol.`);
  return rows[0]?.id ?? null;
}
async function parentOf(childId: string, sex: "M" | "F"): Promise<string | null> {
  const { rows } = await pool.query(
    `select p.id from families f join family_children fc on fc.family_id = f.id
     join persons p on p.id in (f.partner1_id, f.partner2_id)
     where f.tree_id = $1 and fc.child_id = $2 and p.sex = $3 limit 1`, [treeId, childId, sex]);
  return rows[0]?.id ?? null;
}
async function familyOf(a: string, b: string | null): Promise<string | null> {
  const { rows } = await pool.query(
    `select id from families where tree_id = $1
       and ((partner1_id = $2 and partner2_id is not distinct from $3::uuid)
         or (partner2_id = $2 and partner1_id is not distinct from $3::uuid))
     order by created_at limit 1`, [treeId, a, b]);
  return rows[0]?.id ?? null;
}
async function hasSource(personId: string, url: string) {
  const { rows } = await pool.query(
    `select 1 from citations c join sources s on s.id = c.source_id join events e on e.id = c.event_id
     where (e.person_id = $1 or e.family_id in (select id from families where $1 in (partner1_id, partner2_id)))
       and s.url = $2 limit 1`, [personId, url]);
  return rows.length > 0;
}

async function hecho(personId: string, quien: string, ev: Ev, familyId?: string) {
  const form = { ...evForm(ev), ...(familyId ? { familyId } : {}) };
  const v = validateEvent(form);
  if (!v.ok) throw new Error(`Hecho inválido de ${quien}: ${JSON.stringify(v.errors)}`);
  if (await hasSource(personId, ev.sourceUrl)) { console.log(`  = ya cargado: ${quien} — ${ev.subtype || ev.type} ${ev.date ?? ""}`); cuenta.saltados++; return; }
  console.log(`  + ${quien}: ${ev.subtype || ev.type} ${ev.date ?? ""}`);
  cuenta.hechos++;
  if (!APPLY) return;
  const e = await createEvent(treeId, personId, form, actor);
  if (!e.ok) throw new Error(`${quien} (hecho): ${e.error} ${JSON.stringify(e.errors ?? {})}`);
  if (familyId && ev.type === "MARR") {
    await pool.query(
      `update events e set person_id = null, family_id = $3
       from citations c join sources s on s.id = c.source_id
       where c.event_id = e.id and e.person_id = $1 and s.url = $2 and e.event_type = 'MARR'
         and not exists (select 1 from events x where x.family_id = $3 and x.event_type = 'MARR')`,
      [personId, ev.sourceUrl, familyId]);
  }
}

async function crear(n: Nuevo, relation: "parent" | "child", of: string | null, otherParentId: string | null): Promise<string | null> {
  const name = display(n);
  const person = { given: n.given, surnamePat: n.pat, surnameMat: n.mat, sex: n.sex, isLiving: false, notes: n.nota ?? "" };
  const v = validatePerson(person);
  if (!v.ok) throw new Error(`Datos inválidos en ${name}: ${JSON.stringify(v.errors)}`);
  console.log(`+ ${name} (${relation})`);
  cuenta.nuevos++;
  if (!APPLY) return null;
  if (!of) throw new Error(`Falta el familiar de ${name}`);
  const r = await addRelative(treeId, { relation, of, otherParentId, person }, actor);
  if (!r.ok) throw new Error(`${name}: ${r.error} ${JSON.stringify(r.errors ?? {})}`);
  return r.id;
}
async function hechosDe(id: string | null, n: Nuevo) {
  for (const ev of n.hechos) {
    if (id) await hecho(id, display(n), ev);
    else { console.log(`  + ${display(n)}: ${ev.subtype || ev.type} ${ev.date ?? ""}`); cuenta.hechos++; }
  }
}
/** Hijo de una pareja existente o nueva; evita duplicar si ya hay padre/madre. */
async function padreDe(hijo: string | null, sex: "M" | "F", n: Nuevo, otro: string | null): Promise<string | null> {
  const ya = hijo ? await parentOf(hijo, sex) : null;
  if (ya) { console.log(`= ya existe (${sex === "M" ? "padre" : "madre"}): ${display(n)}`); cuenta.saltados++; return ya; }
  return crear(n, "parent", hijo, otro);
}
async function pareja(
  hijo: string | null, padreN: Nuevo, madreN: Nuevo, nombrePareja: string, marr?: Ev,
): Promise<{ padre: string | null; madre: string | null }> {
  const padre = await padreDe(hijo, "M", padreN, null);
  const madre = await padreDe(hijo, "F", madreN, padre);
  await hechosDe(padre, padreN);
  await hechosDe(madre, madreN);
  if (marr) {
    const fam = padre ? await familyOf(padre, madre) : null;
    if (fam && padre) await hecho(padre, nombrePareja, marr, fam);
    else { console.log(`  + ${nombrePareja}: MARR ${marr.date ?? ""}`); cuenta.hechos++; }
  }
  return { padre, madre };
}

const P = (id: string, extra = "") => ({ sourceUrl: TREE(id), sourceTitle: ARBOL, text: extra });

// ─── Datos ───────────────────────────────────────────────────────

// Padres de Isidora: ya cargados; solo se les agregan hechos del árbol.
const PEDRO_EXTRA: Ev = { type: "EVEN", subtype: "Nacimiento estimado", date: "c. 1817", place: "Casablanca, Valparaíso, Chile", ...P("GSBB-7MH", "Según el árbol (ficha GSBB-7MH): nacimiento aproximado, sin fuentes en el nacimiento ni en la muerte.") };
const MAGDALENA_EXTRA: Ev[] = [
  { type: "BAPM", date: "noviembre de 1815", ...P("9V9D-5V6", "Según el árbol (ficha 9V9D-5V6), con 1 fuente en el nacimiento.") },
  { type: "BURI", date: "16 de noviembre de 1915", place: "Nuestra Señora del Rosario, Quilpué, Chile", ...P("9V9D-5V6", "Según el árbol, con 1 fuente en la sepultura. Habría muerto a los 100 años (nov 1915).") },
];
const MARR_PEDRO_MAGDALENA: Ev = { type: "MARR", date: "1849", place: "Lago Peñuelas, Valparaíso, Chile", ...P("GSBB-7MH", "Según el árbol; sin acta citada. Isidora (1862) es hija de esta pareja.") };

const HERMANOS: Nuevo[] = [
  { given: "Pedro José", pat: "Valencia", mat: "Araya", sex: "M", nota: "Hermano de Isidora. Árbol de FamilySearch (GNRR-SQ3): nacido 1861; sin más datos revisados.", hechos: [] },
  { given: "Clorinda Carmen", pat: "Valencia", mat: "Araya", sex: "F", nota: "Hermana de Isidora. Árbol de FamilySearch (GQBC-H71): 1863–1905; sin más datos revisados.", hechos: [] },
  { given: "Francisco Ladislao", pat: "Valencia", mat: "Araya", sex: "M", nota: "Hermano de Isidora. Árbol de FamilySearch (GN5J-S9P): nacido 1865; sin más datos revisados.", hechos: [] },
  { given: "Hortencia del Carmen", pat: "Valencia", mat: "Araya", sex: "F", nota: "Hermana de Isidora. Árbol de FamilySearch (GNRR-H71): nacida 1870; sin más datos revisados.", hechos: [] },
  { given: "María", pat: "Valencia", mat: "Araya", sex: "F", nota: "Hermana de Isidora. Árbol de FamilySearch (GNRR-8FZ): sin fechas.", hechos: [] },
  { given: "Juan", pat: "Valencia", mat: "Araya", sex: "M", nota: "Hermano de Isidora. Árbol de FamilySearch (PCPC-SKN): 1852–1852 (murió el mismo año).", hechos: [] },
];

const ARAYA_PADRE: Nuevo = { given: "Lorenzo", pat: "Araya", mat: "", sex: "M", nota: "Según el árbol de FamilySearch (GSBY-XY7), sin fechas ni fuentes. Posible padre de Magdalena Araya. DUDOSO: el árbol fecha su matrimonio con Juana Araos en 1836, 21 años después de nacer Magdalena (1815).", hechos: [] };
const ARAYA_MADRE: Nuevo = { given: "Juana", pat: "Araos", mat: "", sex: "F", nota: "Según el árbol de FamilySearch (MXH7-WMQ): nacida c. 1809, SIN NINGUNA fuente (ni el nombre). Posible madre de Magdalena Araya; el matrimonio de 1836 con Lorenzo Araya no calza con el nacimiento de Magdalena en 1815.", hechos: [] };

const JOSE_VAL: Nuevo = { given: "José", pat: "Valencia", mat: "Araya", sex: "M", nota: "Padre de Pedro Valencia Severino. Árbol de FamilySearch (9V9D-5ZT): murió antes de 1836 (sin fuente). Nacimiento sin fuente; bautizo con 1 fuente.",
  hechos: [{ type: "BAPM", date: "8 de mayo de 1780", place: "Casablanca, Valparaíso, Chile", ...P("9V9D-5ZT", "Según el árbol, con 1 fuente en el bautizo.") }] };
const TERESA: Nuevo = { given: "Teresa", pat: "Severino", mat: "Contreras", sex: "F", nota: "Madre de Pedro Valencia Severino. Árbol de FamilySearch (GSBY-P9F): nacida c. 1780, sin fuentes en las fechas y sin padres conocidos.", hechos: [] };
const MARR_JOSE_TERESA: Ev = { type: "MARR", date: "4 de noviembre de 1807", ...P("9V9D-5ZT", "Según el árbol; sin lugar ni acta citada.") };

const PABLO: Nuevo = { given: "Pablo", pat: "Valencia", mat: "Hevia", sex: "M", nota: "Padre de José Valencia Araya. Árbol de FamilySearch (9V9D-5D8): nacido c. 1752 en Quilpué; bautizo el 9 de mayo de 1752 y muerte sin fuentes. Solo el nombre tiene fuentes.", hechos: [] };
const SEGUNDA: Nuevo = { given: "Segunda de la Cruz", pat: "Araya", mat: "Sepúlveda", sex: "F", nota: "Madre de José Valencia Araya. Árbol de FamilySearch (KF21-DT7). Sus padres en el árbol: Juan Araya Alarcón e Isidora Sepúlveda Bocanegra (matrimonio 3 oct 1734); no se cargan aún.",
  hechos: [{ type: "BAPM", date: "8 de mayo de 1751", place: "Lago Peñuelas, Valparaíso, Chile", ...P("KF21-DT7", "Según el árbol, con 1 fuente en el bautizo.") }] };
const DOMINGO: Nuevo = { given: "Domingo", pat: "Valencia", mat: "Arancibia", sex: "M", nota: "Padre de Pablo Valencia Hevia. Árbol de FamilySearch (LH7J-YQZ): c. 1725–1765, con fuentes en su sepultura. También escrito Domingo Balencia / De Valencia. El árbol le da además un segundo matrimonio con María Pizarro.",
  hechos: [{ type: "BURI", date: "1 de enero de 1765", place: "San Martín de Tours, Quillota, Chile", ...P("LH7J-YQZ", "Según el árbol, con 1 fuente en la sepultura.") }] };
const MARIA_HEVIA: Nuevo = { given: "María de la Encarnación", pat: "Hevia", mat: "Briones", sex: "F", nota: "Madre de Pablo Valencia Hevia. Árbol de FamilySearch (KLXG-6LJ): c. 1732–1827 en Valparaíso, sin fuentes en las fechas.", hechos: [] };
const MARR_DOMINGO: Ev = { type: "MARR", date: "19 de mayo de 1748", place: "Quillota, Valparaíso, Chile", ...P("LH7J-YQZ", "Según el árbol; sin acta citada.") };

const JUAN_VAL: Nuevo = { given: "Juan de", pat: "Valencia", mat: "", sex: "M", nota: "Capitán. Padre de Domingo Valencia Arancibia. Árbol de FamilySearch (9V9D-52F): c. 1685–1775. CONTRADICCIÓN: tiene sepultura el 19 de agosto de 1744 (1 fuente) pero muerte en 1775 (sin fuente). Sus padres en el árbol: Loreno Balencia y Catalina Fernández; no se cargan.",
  hechos: [{ type: "BURI", date: "19 de agosto de 1744", place: "San Martín de Tours, Quillota, Chile", ...P("9V9D-52F", "Según el árbol, con 1 fuente. Choca con la muerte en 1775 que da el mismo árbol.") }] };
const JOSEFA_ARANCIBIA: Nuevo = { given: "Josefa", pat: "Arancibia", mat: "Castro", sex: "F", nota: "Madre de Domingo Valencia Arancibia. Árbol de FamilySearch (9V9D-52L): 1675–1776 (habría vivido 101 años y tenido a Domingo a los 50): fechas dudosas.", hechos: [] };
const MARR_JUAN: Ev = { type: "MARR", date: "1715", place: "Quilpué, Valparaíso, Chile", ...P("9V9D-52F", "Según el árbol; sin acta citada.") };

const CRISTOBAL: Nuevo = { given: "Cristóbal", pat: "Hevia", mat: "", sex: "M", nota: "Padre de María de la Encarnación Hevia Briones. Árbol de FamilySearch (LKQ3-K37): c. 1700, sin más datos.", hechos: [] };
const MARIA_BRIONES: Nuevo = { given: "María", pat: "Briones", mat: "", sex: "F", nota: "Madre de María de la Encarnación Hevia Briones. Árbol de FamilySearch (LKQ3-KD3): c. 1700, sin más datos.", hechos: [] };
const MARR_HEVIA: Ev = { type: "MARR", date: "26 de febrero de 1732", place: "Quillota, Valparaíso, Chile", ...P("KLXG-6LJ", "Según el árbol; sin acta citada.") };

// ─── Carga ───────────────────────────────────────────────────────

async function main() {
  // Isidora = esposa de José Dolores Canelo cuyo nombre empieza con "Isidora Valencia".
  const { rows: ref } = await pool.query(
    `select p.tree_id, p.id from persons p join person_names n on n.person_id = p.id
     where lower(n.display_name) like 'isidora valencia%'
       and exists (select 1 from families f
         join persons j on j.id in (f.partner1_id, f.partner2_id) and j.id <> p.id
         join person_names jn on jn.person_id = j.id
         where p.id in (f.partner1_id, f.partner2_id) and lower(jn.display_name) like 'josé dolores canelo%')
     group by p.tree_id, p.id`);
  if (ref.length !== 1) throw new Error(`Esperaba una Isidora Valencia casada con José Dolores Canelo y hay ${ref.length}. ¿Ya aplicaste db:cargar-canelo --apply?`);
  treeId = ref[0].tree_id as string;
  const isidora = ref[0].id as string;
  const { rows: users } = MAIL
    ? await pool.query(`select id, name from users where lower(email) = lower($1)`, [MAIL])
    : await pool.query(`select id, name from users order by created_at limit 1`);
  if (!users[0]) throw new Error("No encontré el usuario. Usa --correo tu@correo.");
  actor = { id: users[0].id as string, name: users[0].name as string };
  console.log(`${APPLY ? "ESCRIBIENDO" : "SIMULACRO (no escribe)"} como ${actor.name}\n`);

  const pedro = await parentOf(isidora, "M");
  const magdalena = await parentOf(isidora, "F");
  if (!pedro || !magdalena) throw new Error("Isidora no tiene a Pedro y Magdalena como padres en la app. Corre antes db:cargar-canelo.");

  console.log("— Pedro Valencia y Magdalena Araya");
  await hecho(pedro, "Pedro Valencia", PEDRO_EXTRA);
  for (const e of MAGDALENA_EXTRA) await hecho(magdalena, "Magdalena Araya", e);
  const famPM = await familyOf(pedro, magdalena);
  if (famPM) await hecho(pedro, "Pedro Valencia y Magdalena Araya", MARR_PEDRO_MAGDALENA, famPM);

  console.log("\n— Hermanos de Isidora");
  for (const h of HERMANOS) {
    const id = await byName(display(h));
    if (id) { console.log(`= ya existe: ${display(h)}`); cuenta.saltados++; }
    else await crear(h, "child", pedro, magdalena);
  }

  console.log("\n— Padres de Magdalena (dudosos, sin fuentes)");
  await pareja(magdalena, ARAYA_PADRE, ARAYA_MADRE, "Lorenzo Araya y Juana Araos");

  console.log("\n— Padres de Pedro: José Valencia y Teresa Severino");
  const pj = await pareja(pedro, JOSE_VAL, TERESA, "José Valencia y Teresa Severino", MARR_JOSE_TERESA);

  console.log("\n— Padres de José: Pablo Valencia y Segunda Araya");
  const pp = await pareja(pj.padre, PABLO, SEGUNDA, "Pablo Valencia y Segunda Araya");

  console.log("\n— Padres de Pablo: Domingo Valencia y María Hevia");
  const pd = await pareja(pp.padre, DOMINGO, MARIA_HEVIA, "Domingo Valencia y María Hevia", MARR_DOMINGO);

  console.log("\n— Padres de Domingo: Juan de Valencia y Josefa Arancibia");
  await pareja(pd.padre, JUAN_VAL, JOSEFA_ARANCIBIA, "Juan de Valencia y Josefa Arancibia", MARR_JUAN);

  console.log("\n— Padres de María Hevia: Cristóbal Hevia y María Briones");
  await pareja(pd.madre, CRISTOBAL, MARIA_BRIONES, "Cristóbal Hevia y María Briones", MARR_HEVIA);

  console.log(`\n${APPLY ? "Listo" : "Haría"}: ${cuenta.nuevos} personas nuevas, ${cuenta.hechos} hechos nuevos, ${cuenta.saltados} ya estaban.`);
  if (!APPLY) console.log("Si está bien, corre de nuevo con: npm run db:cargar-valencia -- --apply");
  await pool.end();
}
main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
