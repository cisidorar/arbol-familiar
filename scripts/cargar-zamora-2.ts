/**
 * Segunda carga de la rama de Luis Alfredo Zamora Canelo (investigación del 10 oct 2026,
 * ver claude/investigacion-rama-luis-alfredo-zamora.md en el proyecto):
 * la familia de Carmen Zamora (Pascual Zamora y Lorenza Lobo, sus hermanos, sus abuelos,
 * su matrimonio con Ricardo Saavedra y los hijos Saavedra Zamora) y los hermanos de
 * Natividad Galdamez Mandiola.
 *
 * Usa las mismas funciones que la app (addRelative, createEvent): cada cambio queda en
 * Administración → Historial de cambios. Es seguro correrlo más de una vez: salta lo que ya existe.
 *
 *   npm run db:cargar-zamora-2            (solo muestra qué haría, no escribe)
 *   npm run db:cargar-zamora-2 -- --apply (escribe)
 *   Opcional: --correo tu@correo.cl  (si no, usa el primer usuario)
 */
import "dotenv/config";
import { getPool } from "../src/lib/db/pool";
import { addRelative } from "../src/lib/data/relatives";
import { createEvent } from "../src/lib/data/edit";
import { validateEvent, validatePerson, type ParticipantForm } from "../src/lib/edit";

const APPLY = process.argv.includes("--apply");
const mailIdx = process.argv.indexOf("--correo");
const MAIL = mailIdx > 0 ? process.argv[mailIdx + 1] : null;
const FS = (id: string) => `https://www.familysearch.org/ark:/61903/1:1:${id}`;
const SE = "San Esteban, Aconcagua, Chile";
const SF = "San Felipe, Aconcagua, Chile";
const BAU = "Chile, bautismos, 1585-1932 (FamilySearch)";
const PARR = "Chile, registros parroquiales y diocesanos, 1633-2015 (FamilySearch)";
const MAT = "Chile, matrimonios, 1579-1930 (FamilySearch)";
const REG = "Chile, Registro Civil, 1880-1933 (FamilySearch)";

type Ev = {
  type: string; subtype?: string; date?: string; place?: string; text?: string;
  sourceUrl: string; sourceTitle: string; participants?: ParticipantForm[];
};
type Nuevo = { given: string; pat: string; mat: string; sex: "M" | "F"; nota?: string; hechos: Ev[] };

const pool = getPool();
let treeId = "";
let actor = { id: "", name: "" };
const cuenta = { nuevos: 0, hechos: 0, saltados: 0 };

const evForm = (e: Ev) => ({
  type: e.type, subtype: e.subtype ?? "", date: e.date ?? "", place: e.place ?? "", text: e.text ?? "",
  sourceUrl: e.sourceUrl, sourceTitle: e.sourceTitle, sourceQuote: "", participants: e.participants ?? [],
});
const display = (n: Nuevo) => [n.given, n.pat, n.mat].filter(Boolean).join(" ");

async function byName(name: string): Promise<string | null> {
  const { rows } = await pool.query(
    `select p.id from persons p join person_names n on n.person_id = p.id
     where p.tree_id = $1 and lower(n.display_name) = lower($2) group by p.id`, [treeId, name]);
  if (rows.length > 1) throw new Error(`Hay ${rows.length} personas llamadas "${name}". Revisa el árbol.`);
  return rows[0]?.id ?? null;
}
async function one(name: string) {
  const id = await byName(name);
  if (!id) throw new Error(`No encontré a "${name}" en el árbol.`);
  return id;
}
/** Padre (M) o madre (F) de alguien, si ya está en el árbol. */
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
  if (familyId) {
    // createEvent guarda el hecho en la persona; un matrimonio va en la pareja (como lo hace la ficha).
    await pool.query(
      `update events e set person_id = null, family_id = $3
       from citations c join sources s on s.id = c.source_id
       where c.event_id = e.id and e.person_id = $1 and s.url = $2 and e.event_type = 'MARR'
         and not exists (select 1 from events x where x.family_id = $3 and x.event_type = 'MARR')`,
      [personId, ev.sourceUrl, familyId]);
  }
}

/** Crea a la persona unida a un familiar (o la encuentra si ya está) y le carga sus hechos. */
async function agregar(
  n: Nuevo, relation: "parent" | "child" | "sibling" | "partner", of: string | null, otherParentId: string | null = null,
): Promise<string | null> {
  const name = display(n);
  let id = await byName(name);
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

const PASCUAL: Nuevo = {
  given: "Pascual", pat: "Zamora", mat: "Brito", sex: "M",
  nota: "Padre de Carmen Zamora (madre de Daniel). Hijo de José Antonio Zamora y Marta Brito, según su matrimonio de 1833. Su segundo apellido (Brito) sale de ese acta.",
  hechos: [],
};
const LORENZA: Nuevo = {
  given: "Lorenza", pat: "Lobo", mat: "Navarrete", sex: "F",
  nota: "Escrita también Lobos o Lovo. Hija de Andrés Lobo y Ventura Navarrete, según su matrimonio de 1833.",
  hechos: [],
};
const MARR_PASCUAL: Ev = {
  type: "MARR", date: "31 de agosto de 1833", place: SF,
  text: "Padres del novio: José Antonio Zamora y Marta Brito. Padres de la novia: Andrés Lobo y Ventura Navarrete. Hay otra entrada del 5 de julio de 1833 (FVS3-4L4), probablemente las amonestaciones.",
  sourceUrl: FS("FJ1T-DG7"), sourceTitle: MAT,
};
const ABUELOS_PASCUAL: Nuevo[] = [
  { given: "José Antonio", pat: "Zamora", mat: "", sex: "M", nota: "Padre de Pascual Zamora. Escrito también Samora. Hijos encontrados: Blas (casado con Carmen González en 1821), Estefanía (bautizada en 1811, casada con Vicente Castro Morales en 1827), Pascual (1833) y Ramón (casado con Margarita Allende en 1846), todos en San Felipe.", hechos: [] },
  { given: "Marta", pat: "Brito", mat: "", sex: "F", nota: "Madre de Pascual Zamora.", hechos: [] },
];
const ABUELOS_LORENZA: Nuevo[] = [
  { given: "Andrés", pat: "Lobo", mat: "", sex: "M", nota: "Padre de Lorenza Lobo, según el matrimonio de ella en 1833.", hechos: [] },
  { given: "Ventura", pat: "Navarrete", mat: "", sex: "F", nota: "Madre de Lorenza Lobo, según el matrimonio de ella en 1833.", hechos: [] },
];

const bau = (date: string, id: string, extra = "", place = SF, title = BAU): Ev =>
  ({ type: "BAPM", date, place, text: `Hijo/a de Pascual Zamora y Lorenza Lobo.${extra ? " " + extra : ""}`, sourceUrl: FS(id), sourceTitle: title });

/** Hermanos de Carmen: hijos de Pascual Zamora y Lorenza Lobo. */
const HERMANOS_CARMEN: Nuevo[] = [
  { given: "Manuel Eulogio", pat: "Zamora", mat: "Lobo", sex: "M", hechos: [bau("23 de mayo de 1834", "6D8Q-XNXK", "Nacido el 22 de mayo de 1834.", SF, PARR)] },
  { given: "José Antonio del Carmen", pat: "Zamora", mat: "Lobo", sex: "M", hechos: [bau("29 de junio de 1835", "FJQC-435", "Inscrito como Samora.")] },
  { given: "Eloísa", pat: "Zamora", mat: "Lobo", sex: "F", nota: "Casada en 1852 con un Antonio (Catedral de San Felipe).",
    hechos: [{ type: "DEAT", date: "5 de noviembre de 1886", place: "Los Andes, Aconcagua, Chile", text: "Inscrita en Santa Rosa de los Andes; edad estimada: nacida c. 1836.", sourceUrl: FS("Q2SL-7R8T"), sourceTitle: REG }] },
  { given: "Tomás", pat: "Zamora", mat: "Lobo", sex: "M", nota: "Nacido c. 1833 según el índice.",
    hechos: [{ type: "EVEN", subtype: "Matrimonio", date: "3 de enero de 1858", place: SF, text: "Se casó con María León. Padres: Pascual Zamora y Lorenza Lobos.", sourceUrl: FS("FVSM-SHD"), sourceTitle: MAT }] },
  { given: "Rosa", pat: "Zamora", mat: "Lobo", sex: "F",
    hechos: [bau("15 de febrero de 1839", "FJQZ-CZ9", "Nacida el 13 de febrero de 1839."),
      { type: "EVEN", subtype: "Matrimonio", date: "15 de octubre de 1867", place: SE, text: "Se casó con Ambrocio Castro.", sourceUrl: FS("FV9J-9MD"), sourceTitle: MAT }] },
  { given: "Margarita", pat: "Zamora", mat: "Lobo", sex: "F", nota: "Madrina de su sobrino nieto Manuel Jesús Zamora Galdames (1888).",
    hechos: [bau("16 de febrero de 1842", "FJQ8-SJY", "Nacida el 14 de febrero de 1842."),
      { type: "EVEN", subtype: "Matrimonio", date: "6 de julio de 1874", place: SE, text: "Se casó con José Anastasio Bernal. El acta la da nacida en Puchuncaví.", sourceUrl: FS("FV9N-RFT"), sourceTitle: MAT }] },
  { given: "Primitivo del Carmen", pat: "Zamora", mat: "Lobo", sex: "M", nota: "Se casó con María Riveras Hidalgo en Valparaíso en 1896 (Q2SG-VGM9).",
    hechos: [bau("24 de agosto de 1844", "FJQ8-YQ1")] },
  { given: "Pascual", pat: "Zamora", mat: "Lobo", sex: "M", hechos: [bau("24 de marzo de 1848", "FJRQ-D26")] },
  { given: "Florinda del Carmen", pat: "Zamora", mat: "Lobo", sex: "F", hechos: [bau("23 de marzo de 1850", "FJR3-Y58")] },
  { given: "Pascual Segundo", pat: "Zamora", mat: "Lobos", sex: "M", nota: "Nacido c. 1859 según la edad de su defunción.",
    hechos: [{ type: "DEAT", date: "30 de septiembre de 1899", place: "Santiago, Chile", text: "Padres: Pascual Zamora y Lorenza Lobos.", sourceUrl: FS("QLXM-RCFR"), sourceTitle: REG }] },
  { given: "Matilde", pat: "Zamora", mat: "Lobo", sex: "F", nota: "El índice la llama \"Matilde Zamora Zamora\".",
    hechos: [{ type: "EVEN", subtype: "Matrimonio", date: "11 de abril de 1883", place: "Los Andes, Aconcagua, Chile", text: "Se casó con Ezequiel Ponce en Santa Rosa de Lima, Los Andes. Padres: Pascual Zamora y Lorenza Lobos.", sourceUrl: FS("XS6D-VY3D"), sourceTitle: PARR }] },
];

const RICARDO: Nuevo = {
  given: "Ricardo", pat: "Saavedra", mat: "", sex: "M",
  nota: "Esposo de Carmen Zamora desde 1870. Hijo de Isabel Saavedra (escrito Saabedra en el acta).", hechos: [],
};
const MARR_RICARDO: Ev = {
  type: "MARR", date: "10 de julio de 1870", place: SE,
  text: "Madre del novio: Isabel Saavedra. Padres de la novia: Pascual Zamora y Lorenza Lovo (Lobo). Este acta es la que da los padres de Carmen.",
  sourceUrl: FS("FV9N-4Q8"), sourceTitle: MAT,
};
const SAAVEDRA: Nuevo[] = [
  { given: "José David", pat: "Saavedra", mat: "Zamora", sex: "M", nota: "Medio hermano de Daniel Zamora y padrino de Manuel Jesús Zamora Galdames (1888). Se casó con Edelmira Rosa Navea Muñoz en San Esteban en 1903 (QVM2-F1W3).",
    hechos: [{ type: "BAPM", date: "21 de noviembre de 1871", place: SE, text: "Inscrito como David Savedra, hijo de Ricardo Savedra y Carmen Zamora.", sourceUrl: FS("FJ5C-C9D"), sourceTitle: BAU }] },
  { given: "Ricardo", pat: "Saavedra", mat: "Zamora", sex: "M",
    hechos: [{ type: "BAPM", date: "25 de febrero de 1873", place: "Aconcagua, Chile", text: "Nacido el 18 de febrero de 1873.", sourceUrl: FS("FJ7Z-PVG"), sourceTitle: BAU }] },
  { given: "Sofía", pat: "Saavedra", mat: "Zamora", sex: "F",
    hechos: [{ type: "BAPM", date: "6 de octubre de 1874", place: SF, text: "Nacida el 30 de septiembre de 1874.", sourceUrl: FS("FJ9F-ZR4"), sourceTitle: BAU }] },
  { given: "Dorila del Carmen", pat: "Saavedra", mat: "Zamora", sex: "F",
    hechos: [{ type: "BAPM", date: "23 de mayo de 1880", place: SE, text: "La madre aparece como Carmen Samora.", sourceUrl: FS("FJR7-2QN"), sourceTitle: BAU }] },
];

const JULIANA: Nuevo = {
  given: "Juliana", pat: "Zamora", mat: "", sex: "F",
  nota: "PROBABLE hermana de Daniel: hija solo de Carmen Zamora, bautizada en San Esteban dos años después que él.",
  hechos: [{ type: "BAPM", date: "28 de enero de 1865", place: SE, text: "Solo figura la madre, Carmen Zamora.", sourceUrl: FS("FJ5H-TVJ"), sourceTitle: BAU }],
};

const CARMEN_BAU: Ev = {
  type: "BAPM", date: "20 de abril de 1840", place: SF,
  text: "Hija de Pascual Zamora y Lorenza Lobos. Es la madre de Daniel: se casó con Ricardo Saavedra en San Esteban en 1870 y su hijo David Saavedra fue padrino de Manuel Jesús, el hijo de Daniel.",
  sourceUrl: FS("FJQZ-VP2"), sourceTitle: BAU,
};

const DANIEL_BAU: Ev = {
  type: "BAPM", date: "13 de diciembre de 1862", place: SE,
  text: "Nacido el 10 de diciembre de 1862. Solo figura la madre, Carmen Zamora; el padre no se nombra.",
  sourceUrl: FS("FJ5H-HBH"), sourceTitle: BAU,
};

const MANUEL_BAU: Ev = {
  type: "BAPM", date: "4 de junio de 1888",
  text: "Bautizado como Manuel Jesús, nacido el 29 de mayo de 1888, hijo de Daniel Zamora (el índice dice \"Marmora\") y Natividad Galdames. El 1 de julio de 1888 de la inscripción civil sería la fecha de inscripción.",
  sourceUrl: FS("6ZHL-GK4J"), sourceTitle: PARR,
  participants: [
    { role: "Padrino", name: "José David Saavedra Zamora", personId: null },
    { role: "Madrina", name: "Margarita Zamora Lobo", personId: null },
  ],
};

const g = (x: string) => ({ given: x, pat: "Galdamez", mat: "Mandiola", sex: "M" as const });
const HERMANOS_NATIVIDAD: Nuevo[] = [
  { ...g("Marcelino"), nota: "Se casó con Ángela Vera.",
    hechos: [
      { type: "BAPM", date: "27 de abril de 1851", place: SF, text: "Hijo de Juan Galdamez y Santos Mendiola.", sourceUrl: FS("FJRQ-LBM"), sourceTitle: BAU },
      { type: "EVEN", subtype: "Matrimonio", date: "14 de septiembre de 1875", place: SE, text: "Se casó con Ángela Vera. Padres: Juan Galdamez y Santos Mindiola.", sourceUrl: FS("FV91-228"), sourceTitle: MAT },
      { type: "DEAT", date: "29 de marzo de 1899", place: SE, text: "El índice le calcula nacimiento en 1864, lo que no calza con su bautismo de 1851.", sourceUrl: FS("QVM2-FBHZ"), sourceTitle: REG },
    ] },
  { ...g("Belisario"), nota: "Nacido c. 1851 según la edad de su defunción.",
    hechos: [{ type: "DEAT", date: "17 de julio de 1901", place: SE, text: "Padres: Juan Galdames y Santos Mindiola de Galdames.", sourceUrl: FS("QVM2-NMKL"), sourceTitle: REG }] },
  { ...g("José María"), nota: "Se casó con María Sáa. El índice de su defunción lo da nacido c. 1827, muy temprano para hermano de Natividad: revisar el acta.",
    hechos: [
      { type: "EVEN", subtype: "Matrimonio", date: "7 de agosto de 1875", place: SE, text: "Se casó con María Saa. Padres: Juan Galdamez y María Mindiola.", sourceUrl: FS("FV9N-BS5"), sourceTitle: MAT },
      { type: "DEAT", date: "4 de abril de 1893", place: SF, text: "Padres: Juan Galdames y Santos Mandiola.", sourceUrl: FS("Q2SG-X1Z9"), sourceTitle: REG },
    ] },
  { ...g("Domitila"), sex: "F", nota: "Se casó con Perfecto Espinoza (Espinosa Vegas).",
    hechos: [{ type: "EVEN", subtype: "Matrimonio", date: "8 de octubre de 1888", place: SE, text: "Se casó con Perfecto Espinoza. Padres: Juan Galdamez y Santos Mandiola. Hay también una inscripción civil de 1900 (QVM2-N9JM).", sourceUrl: FS("FV91-LGS"), sourceTitle: MAT }] },
];

const MARIA_MANDIOLA_NOMBRE: Ev = {
  type: "EVEN", subtype: "Nombre en otras actas", place: SE,
  text: "En las actas de sus hijos aparece como Santos (María de los Santos) Mandiola, Mindiola o Mendiola. Posible defunción: Santos Mandiola, † 14 de febrero de 1887 en Santa Rosa de los Andes, 55 años (Q2SL-7LWM); sin confirmar que sea ella.",
  sourceUrl: FS("QVM2-N9J9"), sourceTitle: REG,
};

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

  const manuel = await one("Manuel Zamora Galdames");
  const daniel = await one("Daniel Zamora");
  const natividad = await one("Natividad Galdamez Mandiola");

  console.log("— Manuel y Daniel");
  await hecho(manuel, "Manuel Zamora Galdames", MANUEL_BAU);
  await hecho(daniel, "Daniel Zamora", DANIEL_BAU);

  console.log("\n— Carmen Zamora, madre de Daniel");
  let carmen = await parentOf(daniel, "F");
  if (!carmen) {
    carmen = await agregar({ given: "Carmen", pat: "Zamora", mat: "Lobo", sex: "F", hechos: [] }, "parent", daniel);
  } else console.log("= ya existe la madre de Daniel (Carmen Samora/Zamora)");
  if (carmen) await hecho(carmen, "Carmen Zamora", CARMEN_BAU);

  console.log("\n— Padres y abuelos de Carmen");
  let pascual = carmen ? await parentOf(carmen, "M") : null;
  if (!pascual) pascual = await agregar(PASCUAL, "parent", carmen);
  else console.log("= Carmen ya tiene padre");
  let lorenza = carmen ? await parentOf(carmen, "F") : null;
  if (!lorenza) lorenza = await agregar(LORENZA, "parent", carmen);
  else console.log("= Carmen ya tiene madre");
  if (pascual && lorenza) {
    const fam = await familyOf(pascual, lorenza);
    if (fam) await hecho(pascual, "Pascual Zamora y Lorenza Lobo", MARR_PASCUAL, fam);
  } else { console.log("  + Pascual Zamora y Lorenza Lobo: MARR 31 de agosto de 1833"); cuenta.hechos++; }
  for (const a of ABUELOS_PASCUAL) if (!pascual || !(await parentOf(pascual, a.sex))) await agregar(a, "parent", pascual);
  for (const a of ABUELOS_LORENZA) if (!lorenza || !(await parentOf(lorenza, a.sex))) await agregar(a, "parent", lorenza);

  console.log("\n— Hermanos de Carmen");
  for (const h of HERMANOS_CARMEN) await agregar(h, "child", pascual, lorenza);

  console.log("\n— Ricardo Saavedra y los hijos Saavedra Zamora");
  let ricardo = await byName("Ricardo Saavedra");
  if (!ricardo) ricardo = await agregar(RICARDO, "partner", carmen);
  else console.log("= ya existe: Ricardo Saavedra");
  if (ricardo && carmen) {
    const fam = await familyOf(ricardo, carmen);
    if (fam) await hecho(ricardo, "Ricardo Saavedra y Carmen Zamora", MARR_RICARDO, fam);
  } else { console.log("  + Ricardo Saavedra y Carmen Zamora: MARR 10 de julio de 1870"); cuenta.hechos++; }
  for (const h of SAAVEDRA) await agregar(h, "child", ricardo, carmen);
  await agregar(JULIANA, "child", carmen, null);

  console.log("\n— Hermanos de Natividad");
  const juan = await parentOf(natividad, "M");
  const maria = await parentOf(natividad, "F");
  if (!juan || !maria) throw new Error("Natividad no tiene a sus dos padres en el árbol (Juan Galdamez y Maria Mandiola).");
  await hecho(maria, "Maria Mandiola", MARIA_MANDIOLA_NOMBRE);
  for (const h of HERMANOS_NATIVIDAD) await agregar(h, "child", juan, maria);

  console.log("\n— Padrinos del bautismo de Manuel: vincularlos con las personas ya creadas");
  for (const nombre of ["José David Saavedra Zamora", "Margarita Zamora Lobo"]) {
    const id = await byName(nombre);
    const { rows: pend } = await pool.query(
      `select ep.id from event_participants ep join events e on e.id = ep.event_id
       where e.person_id = $1 and ep.name_text = $2 and ep.person_id is null`, [manuel, nombre]);
    if (!pend.length) { console.log(`= ya vinculado (o sin hecho): ${nombre}`); continue; }
    if (!id) { console.log(`  (sin vincular, ${nombre} aún no está en el árbol)`); continue; }
    console.log(`+ vincular ${nombre} como padrino/madrina del bautismo`);
    if (APPLY) await pool.query(`update event_participants set person_id = $1 where id = any($2::uuid[])`, [id, pend.map((r) => r.id)]);
  }

  console.log(`\n${APPLY ? "Listo" : "Haría"}: ${cuenta.nuevos} personas nuevas, ${cuenta.hechos} hechos nuevos, ${cuenta.saltados} ya estaban.`);
  if (!APPLY) console.log("Si está bien, corre de nuevo con: npm run db:cargar-zamora-2 -- --apply");
  await pool.end();
}
main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
