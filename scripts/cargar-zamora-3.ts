/**
 * Tercera carga de la rama Zamora (investigación del 14 oct 2026, ver
 * claude/nacimientos-zamora-lobo-14-oct.md en el proyecto): fechas de nacimiento / bautismo
 * y de sepultura de Lorenza Lobo, sus padres (Andrés Lobo y Ventura) y los padres de Pascual
 * (José Antonio Zamora y Marta Brito), cada una con su fuente de FamilySearch.
 *
 * Solo agrega hechos a personas que YA están en el árbol (las creó cargar-zamora-2). No crea gente.
 * Las fechas que no vienen de un bautizo van como aproximadas ("c. 1760") y el texto lo dice.
 * Usa createEvent (queda en Administración → Historial de cambios). Se puede correr más de una vez:
 * salta lo que ya existe.
 *
 *   npm run db:cargar-zamora-3            (solo muestra qué haría, no escribe)
 *   npm run db:cargar-zamora-3 -- --apply (escribe)
 *   Opcional: --correo tu@correo.cl  (si no, usa el primer usuario)
 */
import dotenv from "dotenv";
import { getPool } from "../src/lib/db/pool";
import { createEvent } from "../src/lib/data/edit";
import { validateEvent, type ParticipantForm } from "../src/lib/edit";

// La base está en Supabase y su dirección vive en .env.local (dotenv/config solo lee .env).
dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ quiet: true });

const APPLY = process.argv.includes("--apply");
const mailIdx = process.argv.indexOf("--correo");
const MAIL = mailIdx > 0 ? process.argv[mailIdx + 1] : null;
const FS = (id: string) => `https://www.familysearch.org/ark:/61903/1:1:${id}`;
const SF = "San Felipe, Aconcagua, Chile";
const BAU = "Chile, bautismos, 1585-1932 (FamilySearch)";
const PARR = "Chile, registros parroquiales y diocesanos, 1633-2015 (FamilySearch)";
const DEF = "Chile, defunciones, 1700-1920 (FamilySearch)";
const ARBOL = "Árbol Familiar de FamilySearch (fecha sin fuente propia)";

type Ev = {
  type: string; subtype?: string; date?: string; place?: string; text?: string;
  sourceUrl: string; sourceTitle: string; participants?: ParticipantForm[];
};
type Persona = { nombre: string; hechos: Ev[] };

const pool = getPool();
let treeId = "";
let actor = { id: "", name: "" };
const cuenta = { hechos: 0, saltados: 0 };

const evForm = (e: Ev) => ({
  type: e.type, subtype: e.subtype ?? "", date: e.date ?? "", place: e.place ?? "", text: e.text ?? "",
  sourceUrl: e.sourceUrl, sourceTitle: e.sourceTitle, sourceQuote: "", participants: e.participants ?? [],
});

async function byName(name: string): Promise<string | null> {
  const { rows } = await pool.query(
    `select p.id from persons p join person_names n on n.person_id = p.id
     where p.tree_id = $1 and lower(n.display_name) = lower($2) group by p.id`, [treeId, name]);
  if (rows.length > 1) throw new Error(`Hay ${rows.length} personas llamadas "${name}". Revisa el árbol.`);
  return rows[0]?.id ?? null;
}

/** ¿Ya tiene este tipo de hecho con esta fuente? (o, si es único como el nacimiento, ya tiene uno con fecha) */
async function yaTiene(personId: string, ev: Ev): Promise<string | null> {
  const dup = await pool.query(
    `select 1 from citations c join sources s on s.id = c.source_id join events e on e.id = c.event_id
     where e.person_id = $1 and e.event_type = $2 and coalesce(e.event_subtype,'') = $3 and s.url = $4 limit 1`,
    [personId, ev.type, ev.subtype ?? "", ev.sourceUrl]);
  if (dup.rows.length) return "ya cargado";
  if (ev.type === "BIRT" || ev.type === "BURI" || ev.type === "DEAT") {
    const otro = await pool.query(
      `select date_text from events where person_id = $1 and event_type = $2 limit 1`, [personId, ev.type]);
    if (otro.rows.length) return `ya tiene ${ev.type} (${otro.rows[0].date_text ?? "sin fecha"}): revísalo a mano`;
  }
  return null;
}

async function hecho(personId: string, quien: string, ev: Ev) {
  const form = evForm(ev);
  const v = validateEvent(form);
  if (!v.ok) throw new Error(`Hecho inválido de ${quien}: ${JSON.stringify(v.errors)}`);
  const motivo = await yaTiene(personId, ev);
  if (motivo) { console.log(`  = ${quien} — ${ev.subtype || ev.type} ${ev.date ?? ""}: ${motivo}`); cuenta.saltados++; return; }
  console.log(`  + ${quien}: ${ev.subtype || ev.type} ${ev.date ?? ""}`);
  cuenta.hechos++;
  if (!APPLY) return;
  const e = await createEvent(treeId, personId, form, actor);
  if (!e.ok) throw new Error(`${quien} (hecho): ${e.error} ${JSON.stringify(e.errors ?? {})}`);
}

// ─── Datos ───────────────────────────────────────────────────────

const PADRINOS_LORENZA: ParticipantForm[] = [
  { role: "Padrino", name: "Manuel Carrasco", personId: null },
  { role: "Madrina", name: "Teresa Córdova", personId: null },
  { role: "Padrino", name: "Agustín Ximenes", personId: null },
  { role: "Madrina", name: "Toribia Lovo", personId: null },
];

const PERSONAS: Persona[] = [
  {
    nombre: "Lorenza Lobo Navarrete",
    hechos: [
      {
        type: "BIRT", date: "septiembre de 1810", place: SF,
        text: "Mes de nacimiento según el acta de bautismo indexada en 'registros parroquiales' (el índice la llama María Lorenza Española; \"Española\" es la calidad, no un apellido). Sin día.",
        sourceUrl: FS("6D8W-78GG"), sourceTitle: PARR,
      },
      {
        type: "BAPM", date: "25 de mayo de 1811", place: SF,
        text: "Hija de Andrés Lovo (Lobo) y Ventura Aumada (Ahumada). La misma acta está indexada también como María Lorensa Lovo en la colección de bautismos 1585-1932 (FJGZ-7TL, https://www.familysearch.org/ark:/61903/1:1:FJGZ-7TL).",
        sourceUrl: FS("6D8W-78GG"), sourceTitle: PARR, participants: PADRINOS_LORENZA,
      },
    ],
  },
  {
    nombre: "Andrés Lobo",
    hechos: [{
      type: "BAPM", date: "30 de noviembre de 1781", place: SF,
      text: "Inscrito como Joseph Andres Lovo. Hijo de Norverto (Norberto) Lovo e Ysavel (Isabel) Muños (Muñoz). Es el que figura como José Andrés Lobo Muñoz en el árbol de FamilySearch (LH14-G53, 1781–1838). Se asume que es el padre de Lorenza porque coinciden el nombre, el lugar y los hijos en el árbol; el acta de bautismo no lo dice.",
      sourceUrl: FS("FJT3-C9R"), sourceTitle: BAU,
    }],
  },
  {
    nombre: "Ventura Navarrete",
    hechos: [
      {
        type: "BAPM", date: "25 de febrero de 1781", place: SF,
        text: "Inscrita como Buenaventura Aumada (Ahumada). Hija de Francisco Aumada y Narcisa Herrera. Es la que figura como Buena Ventura Ahumada Herrera en el árbol de FamilySearch (LH14-GY6, 1781–1851). Coincide con su entierro de 1851 (70 años).",
        sourceUrl: FS("FJTS-ZH7"), sourceTitle: BAU,
      },
      {
        type: "EVEN", subtype: "Nombre en otras actas", place: SF,
        text: "En los bautizos de sus hijos y en su entierro aparece como Ahumada / Aumada (también Auma, Aunada); en el matrimonio de Pascual Zamora (1833) y en el de otra hija, Mercedes, como Navarrete / Nabarreta. Apellido sin resolver: el árbol de la app usa Navarrete, el de FamilySearch usa Ahumada Herrera.",
        sourceUrl: FS("FJ1T-DG7"), sourceTitle: "Chile, matrimonios, 1579-1930 (FamilySearch)",
      },
      {
        type: "BURI", date: "23 de junio de 1851", place: SF,
        text: "Esposa de Andrés Lobo, 70 años, nacida c. 1781. El acta no nombra cementerio.",
        sourceUrl: FS("FVS8-GYM"), sourceTitle: DEF,
      },
    ],
  },
  {
    nombre: "José Antonio Zamora",
    hechos: [
      {
        type: "BIRT", date: "c. 1760",
        text: "FECHA APROXIMADA: calculada por el índice a partir de la edad en su entierro; no hay bautismo indexado. Hipótesis débil sin cargar: un Joseph Antonio Zamora bautizado el 9 de febrero de 1765 en San Felipe, hijo de Francisco Zamora y Juana Zerna; no coincide con 1760 y nada lo une a Marta Brito.",
        sourceUrl: FS("FVSZ-8YY"), sourceTitle: DEF,
      },
      {
        type: "BURI", date: "24 de marzo de 1840", place: SF,
        text: "Esposo de Marta Brito, 80 años. El lugar original del acta es \"San Felipe, Valparaíso, Chile\" (la región); el índice lo normalizó mal a \"Valparaíso, Aconcagua\". El acta no nombra cementerio.",
        sourceUrl: FS("FVSZ-8YY"), sourceTitle: DEF,
      },
    ],
  },
  {
    nombre: "Marta Brito",
    hechos: [
      {
        type: "BIRT", date: "c. 1769",
        text: "FECHA APROXIMADA: año calculado por el índice a partir de la edad en su entierro; no hay bautismo indexado. El árbol de FamilySearch (942P-5RR) dice además \"aprox. 1754\", sin fuente; 1769 calza mejor con sus hijos (Estefanía, bautizada en 1811). Padres según ese árbol, sin fuente: Juan Brito e Isabel Olivares.",
        sourceUrl: FS("FVSZ-92N"), sourceTitle: DEF,
      },
      {
        type: "BURI", date: "18 de mayo de 1859", place: "Catemu, Aconcagua, Chile",
        text: "Esposa de José Antonio Zamora (escrito Samora), 90 años. El acta no nombra cementerio.",
        sourceUrl: FS("FVSZ-92N"), sourceTitle: DEF,
      },
    ],
  },
  {
    nombre: "Pascual Zamora Brito",
    hechos: [{
      type: "BIRT", date: "c. 1813",
      text: "FECHA APROXIMADA, sin acta: es la que trae el árbol de FamilySearch (9JNQ-86R) y no tiene fuente propia. No hay bautismo ni defunción indexados (los entierros de un Pascual Zamora en Valparaíso son de otros hombres: otras esposas). Por su matrimonio en 1833 tendría al menos unos 18 años.",
      sourceUrl: "https://www.familysearch.org/tree/person/details/9JNQ-86R", sourceTitle: ARBOL,
    }],
  },
];

// ─── Carga ───────────────────────────────────────────────────────

async function main() {
  const { rows: trees } = await pool.query(`select id from trees order by created_at limit 1`);
  treeId = trees[0].id as string;
  const { rows: users } = MAIL
    ? await pool.query(`select id, name from users where lower(email) = lower($1)`, [MAIL])
    : await pool.query(`select id, name from users order by created_at limit 1`);
  if (!users[0]) throw new Error("No encontré el usuario. Usa --correo tu@correo.");
  actor = { id: users[0].id as string, name: users[0].name as string };
  console.log(`${APPLY ? "ESCRIBIENDO" : "SIMULACRO (no escribe)"} como ${actor.name}\n`);

  for (const p of PERSONAS) {
    const id = await byName(p.nombre);
    if (!id) { console.log(`! No encontré a "${p.nombre}" en el árbol: se salta (¿corriste db:cargar-zamora-2 --apply?)`); continue; }
    console.log(`— ${p.nombre}`);
    for (const ev of p.hechos) await hecho(id, p.nombre, ev);
  }

  console.log(`\n${APPLY ? "Listo" : "Haría"}: ${cuenta.hechos} hechos nuevos, ${cuenta.saltados} ya estaban.`);
  if (!APPLY) console.log("Si está bien, corre de nuevo con: npm run db:cargar-zamora-3 -- --apply");
  await pool.end();
}
main().catch((e) => {
  const sub = e?.errors?.map((x: Error) => x.message).join("; ");
  console.error("ERROR:", e?.message || sub || e?.code || e);
  if (!process.env.DATABASE_URL) console.error("No hay DATABASE_URL: revisa que exista .env.local en esta carpeta.");
  process.exit(1);
});
