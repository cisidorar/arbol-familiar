/**
 * Carga de la investigación sobre José Dolores Canelo Duarte (10 oct 2026,
 * ver claude/investigacion-jose-dolores-canelo.md en el proyecto):
 * sus padres y hermana, su primera familia (Isidora Valencia y sus hijos),
 * Petronila Montesinos con sus padres, el gemelo Pedro Pablo y la Juana de 1891.
 *
 * NO asigna madre a los hijos cuyas actas no la nombran (Juana, María, Rosa Elvira,
 * José Alberto): solo agrega una nota con la hipótesis. Tampoco toca a Digna Frez.
 *
 * Usa las mismas funciones que la app (addRelative, createEvent): cada cambio queda en
 * Administración → Historial de cambios. Seguro de correr más de una vez.
 *
 *   npm run db:cargar-canelo            (solo muestra qué haría, no escribe)
 *   npm run db:cargar-canelo -- --apply (escribe)
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
const VINA = "Viña del Mar, Valparaíso, Chile";
const REG = "Chile, Registro Civil, 1880-1933 (FamilySearch)";
const PARR = "Chile, registros parroquiales y diocesanos, 1633-2015 (FamilySearch)";

type Ev = { type: string; subtype?: string; date?: string; place?: string; text?: string; sourceUrl: string; sourceTitle: string };
type Nuevo = { given: string; pat: string; mat: string; sex: "M" | "F"; nota?: string; hechos: Ev[]; key?: string; fresh?: boolean };

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
/** Para nombres repetidos (Juana Canelo): la persona que ya tiene esa fuente. */
async function byFirstSource(fragment: string): Promise<string | null> {
  const { rows } = await pool.query(
    `select e.person_id from citations c join sources s on s.id = c.source_id join events e on e.id = c.event_id
     where e.tree_id = $1 and e.person_id is not null and s.url like $2 limit 1`, [treeId, `%${fragment}%`]);
  return rows[0]?.person_id ?? null;
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

async function agregar(
  n: Nuevo, relation: "parent" | "child" | "sibling" | "partner", of: string | null, otherParentId: string | null = null,
): Promise<string | null> {
  const name = display(n);
  // fresh: el nombre se repite en el árbol (José Canelo): no buscar por nombre, solo crear.
  let id = n.key ? await byFirstSource(n.key) : n.fresh ? null : await byName(name);
  if (id) { console.log(`= ya existe: ${name}`); cuenta.saltados++; }
  else {
    const person = { given: n.given, surnamePat: n.pat, surnameMat: n.mat, sex: n.sex, isLiving: false, notes: n.nota ?? "" };
    const v = validatePerson(person);
    if (!v.ok) throw new Error(`Datos inválidos en ${name}: ${JSON.stringify(v.errors)}`);
    console.log(`+ ${name} (${relation})`);
    cuenta.nuevos++;
    if (APPLY) {
      if (!of) throw new Error(`Falta el familiar de ${name}`);
      const r = await addRelative(treeId, { relation, of, otherParentId, person }, actor);
      if (!r.ok) throw new Error(`${name}: ${r.error} ${JSON.stringify(r.errors ?? {})}`);
      id = r.id;
    }
  }
  for (const ev of n.hechos) {
    if (id) await hecho(id, name, ev);
    else { console.log(`  + ${name}: ${ev.subtype || ev.type} ${ev.date ?? ""}`); cuenta.hechos++; }
  }
  return id;
}

// ─── Datos ───────────────────────────────────────────────────────

const CANELO_PADRE: Nuevo = { given: "José", pat: "Canelo", mat: "", sex: "M", fresh: true, nota: "Padre de José Dolores y de Juana Canelo Duarte, según el matrimonio de José Dolores (1869 y 1890) y el de Juana (1873). Sin más datos.", hechos: [] };
const DUARTE: Nuevo = { given: "Josefa", pat: "Duarte", mat: "", sex: "F", fresh: true, nota: "Madre de José Dolores y de Juana Canelo Duarte (escrita también Duartes).", hechos: [] };
const JUANA_DUARTE: Nuevo = {
  given: "Juana", pat: "Canelo", mat: "Duarte", sex: "F", nota: "Hermana de José Dolores Canelo Duarte.",
  hechos: [{ type: "EVEN", subtype: "Matrimonio", date: "28 de noviembre de 1873", place: "Doce Apóstoles, Valparaíso, Chile", text: "Se casó con Dionicio Montenegro Benítez. Padres: José Canelo y Josefa Duarte (intención del 4 de noviembre de 1873).", sourceUrl: FS("681B-93KK"), sourceTitle: PARR }],
};
const DIONICIO: Nuevo = { given: "Dionicio", pat: "Montenegro", mat: "Benítez", sex: "M", hechos: [] };

const ISIDORA: Nuevo = {
  given: "Isidora", pat: "Valencia", mat: "", sex: "F",
  nota: "Primera esposa de José Dolores Canelo. Hija de Pedro Valencia y Magdalena Araya. Edad en su defunción: 26 (civil) o 30 (parroquial).",
  hechos: [
    { type: "DEAT", date: "23 de febrero de 1888", place: VINA, text: "Certificado 167, página 56. Padres: Magdalena Araya y Pedro Valencia. Esposo: Dolores Canelo. La partida parroquial la da fallecida el 22 de febrero de 1888 y sepultada el 23.", sourceUrl: FS("Q2SG-ZFMK"), sourceTitle: REG },
    { type: "BURI", date: "23 de febrero de 1888", place: VINA, text: "Fallecida el 22 de febrero de 1888, 30 años (según la partida).", sourceUrl: FS("6F54-TB1G"), sourceTitle: PARR },
  ],
};
const MARR_ISIDORA: Ev = {
  type: "MARR", date: "3 de septiembre de 1869", place: "Lago Peñuelas, Valparaíso, Chile",
  text: "Información matrimonial del 6 de agosto de 1869 en Santa Bárbara, Casablanca. Él tenía 21 años (nacido c. 1848, Peñuelas) y ella 18. Padres de él: José Canelo y Josefa Duartes. Padres de ella: Pedro Valencia y Magdalena Araya.",
  sourceUrl: FS("X4WS-B7L7"), sourceTitle: PARR,
};
const PEDRO_VALENCIA: Nuevo = { given: "Pedro", pat: "Valencia", mat: "", sex: "M", fresh: true, hechos: [] };
const ARAYA: Nuevo = { given: "Magdalena", pat: "Araya", mat: "", sex: "F", fresh: true, hechos: [] };

const HIJOS_ISIDORA: Nuevo[] = [
  { given: "Antonio", pat: "Canelo", mat: "Valencia", sex: "M", nota: "Nacido c. 1870 según el índice.",
    hechos: [{ type: "DEAT", date: "29 de noviembre de 1885", place: VINA, text: "Padres: Dolores Canelo Duarte e Isidora Valencia.", sourceUrl: FS("Q2HM-ZYZ4"), sourceTitle: REG }] },
  { given: "Cesaria", pat: "Canelo", mat: "Valencia", sex: "F", nota: "Nacida c. 1871 (parroquial) o 1877 (civil); edad 28 al morir en 1899.",
    hechos: [
      { type: "DEAT", date: "15 de enero de 1899", place: "Quilpué, Valparaíso, Chile", text: "Padres: Isidora Valencia de Canelo y Dolores Canelo.", sourceUrl: FS("Q2HM-8NWB"), sourceTitle: REG },
      { type: "BURI", date: "16 de enero de 1899", place: "Nuestra Señora del Rosario, Quilpué, Chile", text: "28 años. Padres: Isidora Valencia y José Dolores Canelo.", sourceUrl: FS("66Z1-3CH6"), sourceTitle: PARR },
    ] },
  { given: "Horacio", pat: "Canelo", mat: "Valencia", sex: "M", nota: "Nacido c. 1882 según el índice.",
    hechos: [{ type: "DEAT", date: "2 de mayo de 1885", place: VINA, text: "Padres: Dolores Canelo Duarte e Isidora Valencia.", sourceUrl: FS("Q2HM-ZF8B"), sourceTitle: REG }] },
  { given: "Manuel", pat: "Canelo", mat: "Valencia", sex: "M", nota: "El índice civil le calcula nacimiento en 1861, imposible (sus padres se casaron en 1869); el parroquial lo da nacido c. 1884. NO es Manuel (chirigua) Canelo Frez.",
    hechos: [{ type: "DEAT", date: "22 de agosto de 1886", place: VINA, text: "Padres: Dolores Canelo Duarte e Isidora Valencia.", sourceUrl: FS("Q2HM-ZT16"), sourceTitle: REG }] },
  { given: "Rosa", pat: "Canelo", mat: "Valencia", sex: "F", nota: "Nacida c. 1878 según el índice. Murió un día después que su madre. No es Rosa Elvira.",
    hechos: [{ type: "DEAT", date: "23 de febrero de 1888", place: VINA, text: "Padres: Isidora Valencia y Dolores Canelo.", sourceUrl: FS("Q2SG-ZF3Z"), sourceTitle: REG }] },
  { given: "María Clotilde", pat: "Canelo", mat: "Valencia", sex: "F",
    hechos: [
      { type: "BIRT", date: "22 de abril de 1887", place: VINA, text: "Padres: Dolores Canelo e Isidora Valencia.", sourceUrl: FS("Q2SG-ZFP6"), sourceTitle: REG },
      { type: "DEAT", date: "12 de junio de 1917", place: "Quilpué, Valparaíso, Chile", text: "Sepultada el 13 de junio de 1917 en Nuestra Señora del Rosario, Quilpué (como Clotilde Canelo, padres Ysidora Valencia y Dolores Canelo).", sourceUrl: FS("6F6D-H5RZ"), sourceTitle: PARR },
    ] },
];

const PETRONILA_PADRE: Nuevo = { given: "Manuel", pat: "Montesinos", mat: "", sex: "M", fresh: true, nota: "Padre de Petronila Montesinos (suegro en el matrimonio de 1890).", hechos: [] };
const PETRONILA_MADRE: Nuevo = { given: "Rosario", pat: "Cortez", mat: "", sex: "F", fresh: true, nota: "Madre de Petronila Montesinos (suegra en el matrimonio de 1890).", hechos: [] };
const MARR_PETRONILA: Ev = {
  type: "MARR", date: "28 de agosto de 1890", place: "Valparaíso, Chile",
  text: "Padres del novio: José Canelo y Josefa Duarte. Padres de la novia: Manuel Montesinos y Rosario Cortez (escrita Montesinos/Montesino). Isidora Valencia había muerto en 1888.",
  sourceUrl: FS("6XFJ-PB8B"), sourceTitle: PARR,
};

const PEDRO_PABLO: Nuevo = {
  given: "Pedro Pablo", pat: "Canelo", mat: "Montecinos", sex: "M", nota: "Gemelo de Luis Alberto (ambos nacidos el 5 de junio de 1902). Murió cinco días después que él.",
  hechos: [
    { type: "BIRT", date: "5 de junio de 1902", place: VINA, text: "Certificado 220, página 11. El índice solo nombra al padre, José Dolores Canelo.", sourceUrl: FS("Q2SG-11Z4"), sourceTitle: REG },
    { type: "DEAT", date: "18 de noviembre de 1902", place: VINA, text: "Certificado 514, página 8. Padres: José Canelo y Petronila Montecinos.", sourceUrl: FS("Q2SL-21KS"), sourceTitle: REG },
  ],
};
const JUANA_1891: Nuevo = {
  given: "Juana", pat: "Canelo", mat: "", sex: "F", key: "Q24R-GQKF",
  nota: "Madre no declarada en el índice. Posiblemente murió niña: otra Juana, nacida el 17 de mayo de 1892, es hija del mismo padre. Probable madre: Petronila Montesinos (casada con José Dolores desde 1890), sin confirmar.",
  hechos: [{ type: "BIRT", date: "24 de junio de 1891", place: VINA, text: "Certificado 179, página 60. El índice solo nombra al padre, José Dolores Canelo.", sourceUrl: FS("Q24R-GQKF"), sourceTitle: REG }],
};
const JOSE_DOLORES_NACIMIENTO: Ev = {
  type: "EVEN", subtype: "Nacimiento estimado", text: "Nacido c. 1848 en Peñuelas (21 años en la información matrimonial del 6 de agosto de 1869). Hijo de José Canelo y Josefa Duartes.",
  sourceUrl: FS("X4WS-B7L7"), sourceTitle: PARR,
};

// ─── Carga ───────────────────────────────────────────────────────

async function main() {
  // El árbol es el de "José Dolores Canelo" (si la base tiene copias, no se mezcla otra).
  const { rows: ref } = await pool.query(
    `select p.tree_id, p.id from persons p join person_names n on n.person_id = p.id
     where lower(n.display_name) = 'josé dolores canelo' group by p.tree_id, p.id`);
  if (ref.length !== 1) throw new Error(`Esperaba una sola persona "José Dolores Canelo" y hay ${ref.length}. Revisa duplicados antes de cargar.`);
  treeId = ref[0].tree_id as string;
  const jose = ref[0].id as string;
  const { rows: users } = MAIL
    ? await pool.query(`select id, name from users where lower(email) = lower($1)`, [MAIL])
    : await pool.query(`select id, name from users order by created_at limit 1`);
  if (!users[0]) throw new Error("No encontré el usuario. Usa --correo tu@correo.");
  actor = { id: users[0].id as string, name: users[0].name as string };
  console.log(`${APPLY ? "ESCRIBIENDO" : "SIMULACRO (no escribe)"} como ${actor.name}\n`);

  console.log("— José Dolores: nacimiento estimado");
  await hecho(jose, "José Dolores Canelo", JOSE_DOLORES_NACIMIENTO);

  console.log("\n— Padres y hermana de José Dolores");
  const padre = (await parentOf(jose, "M")) ?? (await agregar(CANELO_PADRE, "parent", jose));
  const madre = (await parentOf(jose, "F")) ?? (await agregar(DUARTE, "parent", jose));
  if (padre && madre === null && !APPLY) console.log("  (se vincularía a Josefa Duarte con José Canelo)");
  const juanaD = await agregar(JUANA_DUARTE, "child", padre, madre);
  await agregar(DIONICIO, "partner", juanaD);

  console.log("\n— Primera familia: Isidora Valencia");
  const isidora = await agregar(ISIDORA, "partner", jose);
  if (isidora) {
    const fam = await familyOf(jose, isidora);
    if (fam) await hecho(jose, "José Dolores Canelo e Isidora Valencia", MARR_ISIDORA, fam);
    const pv = (await parentOf(isidora, "M")) ?? (await agregar(PEDRO_VALENCIA, "parent", isidora));
    if (!(await parentOf(isidora, "F"))) await agregar(ARAYA, "parent", isidora, pv);
  } else { console.log("  + José Dolores y Isidora: MARR 3 de septiembre de 1869"); cuenta.hechos++; }
  for (const h of HIJOS_ISIDORA) await agregar(h, "child", jose, isidora);

  console.log("\n— Segunda esposa: Petronila Montesinos");
  const petronila = await byName("Petronila Montecinos") ?? await byName("Petronila Montesinos");
  if (!petronila) throw new Error("No encontré a Petronila Montecinos en el árbol.");
  const famP = await familyOf(jose, petronila);
  if (famP) await hecho(jose, "José Dolores Canelo y Petronila Montesinos", MARR_PETRONILA, famP);
  const pm = (await parentOf(petronila, "M")) ?? (await agregar(PETRONILA_PADRE, "parent", petronila));
  if (!(await parentOf(petronila, "F"))) await agregar(PETRONILA_MADRE, "parent", petronila, pm);

  console.log("\n— Hijos que faltan");
  await agregar(PEDRO_PABLO, "child", jose, petronila);
  await agregar(JUANA_1891, "child", jose, null);

  console.log(`\n${APPLY ? "Listo" : "Haría"}: ${cuenta.nuevos} personas nuevas, ${cuenta.hechos} hechos nuevos, ${cuenta.saltados} ya estaban.`);
  if (!APPLY) console.log("Si está bien, corre de nuevo con: npm run db:cargar-canelo -- --apply");
  await pool.end();
}
main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
