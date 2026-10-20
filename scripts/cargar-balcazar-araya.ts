/**
 * Carga la búsqueda del 18 oct 2026 sobre los antepasados de Juan Balcázar Araya
 * (claude/antepasados-juan-balcazar-araya-18-oct.md en el proyecto): tres bautizos de FamilySearch
 * que faltaban en la ficha, cada uno con su enlace al registro.
 *
 *  - Juan Balcazar Araya: bautizo de "Juan de la Cruz", Maipo 1868 (6DZP-HGW6).
 *  - Pabla Araya Zuñiga: bautizo de "Paula", Codegua 1829, madre Anastasia Araya (6D54-WNH5).
 *  - Josefa Balcázar Bravo: bautizo de "María Josefa", Maipo 1846, y su nacimiento aprox. (6DZB-2LK9).
 *
 * No crea personas ni cambia familias. NO reemplaza a los padres de Pabla (Belisario Araya y Pabla Zuñiga,
 * que salen solo de su defunción de 1909) por Anastacia Araya: eso queda anotado en el texto del bautizo
 * y se decide a mano. Los bautizos de Juan y de Pabla quedan con el pendiente "ir a revisarlo en persona
 * a FamilySearch" (se quita con «Ya lo revisé»). Los hechos se crean con createEvent, así que quedan en
 * Administración → Historial de cambios. Se puede correr más de una vez: salta lo que ya tiene esa fuente.
 *
 *   npm run db:cargar-balcazar-araya            (solo muestra qué haría, no escribe)
 *   npm run db:cargar-balcazar-araya -- --apply (escribe)
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
const SOLO_VALIDAR = process.argv.includes("--solo-validar");
const mailIdx = process.argv.indexOf("--correo");
const MAIL = mailIdx > 0 ? process.argv[mailIdx + 1] : null;
const FS = (id: string) => `https://www.familysearch.org/ark:/61903/1:1:${id}`;
const PARR = "Chile, registros parroquiales y diocesanos, 1633-2015 (FamilySearch)";
const PENDIENTE = "familysearch_presencial";

type Ev = {
  type: string; subtype?: string; date?: string; place?: string; text?: string;
  sourceUrl: string; sourceTitle: string; participants?: ParticipantForm[];
  /** Deja el hecho como pendiente de revisar en persona. */
  pendiente?: boolean;
  /** Comentario que se ve junto al pendiente (qué hay que mirar en el acta). */
  comentario?: string;
};
type Persona = { nombre: string; hechos: Ev[] };

const pool = getPool();
let treeId = "";
let actor = { id: "", name: "" };
const cuenta = { hechos: 0, saltados: 0, pendientes: 0 };

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

/** ¿Ya tiene este tipo de hecho con esta fuente? */
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
  console.log(`  + ${quien}: ${ev.subtype || ev.type} ${ev.date ?? ""}${ev.pendiente ? "  (pendiente: revisar en persona)" : ""}`);
  cuenta.hechos++;
  if (ev.pendiente) cuenta.pendientes++;
  if (!APPLY) return;
  const e = await createEvent(treeId, personId, form, actor);
  if (!e.ok) throw new Error(`${quien} (hecho): ${e.error} ${JSON.stringify(e.errors ?? {})}`);
  if (ev.pendiente) {
    // createEvent solo guarda el pendiente si quien edita es administrador en una sesión web; acá se pone directo.
    await pool.query(
      `update events e set needs_review = true, review_kind = $4, review_note = $5
         from citations c join sources s on s.id = c.source_id
        where c.event_id = e.id and e.person_id = $1 and e.event_type = $2 and s.url = $3`,
      [personId, ev.type, ev.sourceUrl, PENDIENTE, ev.comentario ?? null]);
  }
}

// ─── Datos ───────────────────────────────────────────────────────

const PERSONAS: Persona[] = [
  {
    nombre: "Juan Balcazar Araya",
    hechos: [{
      type: "BAPM", date: "1868", place: "Maipo, Chile", pendiente: true,
      comentario: "En la imagen del acta: confirmar la edad de los padres, los abuelos y las notas al margen. Es el bautizo más probable de Juan, no seguro.",
      text: "Inscrito como Juan de la Cruz, nacido el 29 de agosto de 1868 según el índice (el acta indexada solo da el año del bautizo). Hijo de Isidoro «Bancasa» (Balcázar) y Paula Araya. Otros nombres en el registro, sin rol indexado: Santiago Landela, Lara, Eufenia Acevedo, José Ignacio Rojas. Es el bautizo MÁS PROBABLE de Juan, no seguro: calza con su defunción de 1913 (nacido en 1868) y es mejor candidato que el \"Juan J.\" de 1865. Falta ver la imagen del acta para confirmar la edad de los padres, los abuelos y las notas al margen.",
      sourceUrl: FS("6DZP-HGW6"), sourceTitle: PARR,
    }],
  },
  {
    nombre: "Pabla Araya Zuñiga",
    hechos: [{
      type: "BAPM", date: "1829", place: "Codegua, O'Higgins, Chile", pendiente: true,
      comentario: "Ver si el acta nombra al padre. Su defunción de 1909 dice Belisario Araya y Pabla Zuñiga, pero este bautizo y su matrimonio nombran solo a la madre, Anastasia Araya.",
      text: "Inscrita como Paula, nacida el 15 de enero de 1829 según el índice (el acta indexada solo da el año del bautizo). El índice nombra SOLO a la madre, Anastasia Araya, sin padre: apunta a hija natural. Calza con el matrimonio de 1849 con Isidoro (6Y5Z-NBHG), que nombra solo a la madre Anastacia Araya, y con los 80 años de su defunción de 1909. Esa defunción (QLXS-MDPD) dice que sus padres eran Belisario Araya y Pabla Zuñiga, declarado por otra persona 60 años después: queda en duda. Posible madre (hipótesis): Anastacia Araya, c. 1794–1888, hija de Francisco Araya y Mercedes Sereciano, casada con Nazario Soto (Q2TK-PQY3). Otros nombres en el registro, sin rol indexado: Pedro José Ona, Eugenio Pinto, Agustina ?, José López.",
      sourceUrl: FS("6D54-WNH5"), sourceTitle: PARR,
      participants: [
        { role: "Padrino", name: "Juan García", personId: null },
        { role: "Madrina", name: "Agustina Barraza", personId: null },
      ],
    }],
  },
  {
    nombre: "Josefa Balcázar Bravo",
    hechos: [
      {
        type: "BIRT", date: "c. 1844",
        text: "FECHA APROXIMADA: año calculado por el índice del bautizo de María Josefa (6DZB-2LK9), hija de Gregorio «Balcasó» y Dominga Bravo. Casi seguro es la misma Josefa que se casó con Juan Evangelista Navarro en 1876: el acta de ese matrimonio (XS6X-MJTZ, https://www.familysearch.org/ark:/61903/1:1:XS6X-MJTZ) nombra a Gregorio Valcaza y Dominga Bravo como sus padres, igual que este bautizo; solo falta confirmarlo con la imagen.",
        sourceUrl: FS("6DZB-2LK9"), sourceTitle: PARR,
      },
      {
        type: "BAPM", date: "1846", place: "Maipo, Chile",
        text: "Inscrita como María Josefa, nacida en 1844 según el índice, hija de Gregorio «Balcasó» (Balcázar) y Dominga Bravo. Otros nombres en el registro, sin rol indexado: Luís Reyes, Lorenzo García, Dolores Garas, Domingo Juan.",
        sourceUrl: FS("6DZB-2LK9"), sourceTitle: PARR,
      },
    ],
  },
];

// ─── Carga ───────────────────────────────────────────────────────

async function main() {
  // Valida todos los hechos antes de tocar la base.
  for (const p of PERSONAS) for (const ev of p.hechos) {
    const v = validateEvent(evForm(ev));
    if (!v.ok) throw new Error(`Hecho inválido de ${p.nombre}: ${JSON.stringify(v.errors)}`);
  }
  if (SOLO_VALIDAR) { console.log(`Los ${PERSONAS.reduce((n, p) => n + p.hechos.length, 0)} hechos son válidos.`); return; }

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
    if (!id) { console.log(`! No encontré a "${p.nombre}" en el árbol: se salta.`); continue; }
    console.log(`— ${p.nombre}`);
    for (const ev of p.hechos) await hecho(id, p.nombre, ev);
  }

  console.log(`\n${APPLY ? "Listo" : "Haría"}: ${cuenta.hechos} hechos nuevos (${cuenta.pendientes} como pendiente), ${cuenta.saltados} ya estaban.`);
  if (!APPLY) console.log("Si está bien, corre de nuevo con: npm run db:cargar-balcazar-araya -- --apply");
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => pool.end());
