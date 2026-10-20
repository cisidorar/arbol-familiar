/**
 * Carga la búsqueda del 18 oct 2026 sobre Gregorio Balcázar y Dominga Bravo, los padres de Isidoro
 * (claude/gregorio-balcazar-18-oct.md en el proyecto). Cada hecho lleva el enlace al registro de FamilySearch.
 *
 * Personas nuevas (con quien se unen):
 *  - Gregorio Balcázar Bravo (c. 1830–1880), hermano de Isidoro, y su esposa Bartola Olguín (matrimonio 1866).
 *  - María Olguín, madre de Bartola (solo se la nombra en el matrimonio).
 *  - Francisco (1875) y Elena (1879) Balcázar Olguín, hijos de los dos.
 *  - Rosario de los Dolores Balcázar Bravo (bautizo de 1824): HIPÓTESIS, queda con pendiente.
 * Hechos en personas que ya existen:
 *  - Eugenio Balcázar Bravo: bautizo de 1824 como "Eugenio de los Dolores": HIPÓTESIS que choca con su
 *    defunción de 1886 (45 años); queda con pendiente.
 *  - Gregorio Balcazar y Dominga Bravo: cómo aparecen sus nombres en otras actas y, en Gregorio, sus padrinazgos en Maipo.
 *
 * Los dos bautizos de 1824 y todo lo "aproximado" lo dicen en el texto. Los hechos de 1824 quedan con el
 * pendiente "ir a revisarlo en persona a FamilySearch" (se quita con «Ya lo revisé»). Todo usa addRelative y
 * createEvent, así que queda en Administración → Historial de cambios. Se puede correr más de una vez:
 * salta lo que ya existe.
 *
 *   npm run db:cargar-balcazar-gregorio            (solo muestra qué haría, no escribe)
 *   npm run db:cargar-balcazar-gregorio -- --apply (escribe)
 *   Opcional: --correo tu@correo.cl  (si no, usa el primer usuario)
 */
import dotenv from "dotenv";
import { getPool } from "../src/lib/db/pool";
import { addRelative } from "../src/lib/data/relatives";
import { createEvent } from "../src/lib/data/edit";
import { validateEvent, validatePerson, type ParticipantForm } from "../src/lib/edit";

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
type Nuevo = { given: string; pat: string; mat: string; sex: "M" | "F"; nota: string; hechos: Ev[] };

const pool = getPool();
let treeId = "";
let actor = { id: "", name: "" };
const cuenta = { nuevos: 0, hechos: 0, saltados: 0, pendientes: 0 };

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
async function familyOf(a: string, b: string | null): Promise<string | null> {
  const { rows } = await pool.query(
    `select id from families where tree_id = $1
       and ((partner1_id = $2 and partner2_id is not distinct from $3::uuid)
         or (partner2_id = $2 and partner1_id is not distinct from $3::uuid))
     order by created_at limit 1`, [treeId, a, b]);
  return rows[0]?.id ?? null;
}

/** ¿La persona (o sus familias) ya tiene un hecho de este tipo con esta fuente? */
async function yaTiene(personId: string, ev: Ev): Promise<boolean> {
  const { rows } = await pool.query(
    `select 1 from citations c join sources s on s.id = c.source_id join events e on e.id = c.event_id
     where (e.person_id = $1 or e.family_id in (select id from families where $1 in (partner1_id, partner2_id)))
       and e.event_type = $2 and coalesce(e.event_subtype,'') = $3 and s.url = $4 limit 1`,
    [personId, ev.type, ev.subtype ?? "", ev.sourceUrl]);
  return rows.length > 0;
}

async function hecho(personId: string | null, quien: string, ev: Ev, familyId?: string) {
  const form = { ...evForm(ev), ...(familyId ? { familyId } : {}) };
  const v = validateEvent(form);
  if (!v.ok) throw new Error(`Hecho inválido de ${quien}: ${JSON.stringify(v.errors)}`);
  if (personId && (await yaTiene(personId, ev))) {
    console.log(`  = ya cargado: ${quien} — ${ev.subtype || ev.type} ${ev.date ?? ""}`); cuenta.saltados++; return;
  }
  console.log(`  + ${quien}: ${ev.subtype || ev.type} ${ev.date ?? ""}${ev.pendiente ? "  (pendiente: revisar en persona)" : ""}`);
  cuenta.hechos++;
  if (ev.pendiente) cuenta.pendientes++;
  if (!APPLY) return;
  if (!personId) throw new Error(`Falta la persona de ${quien}`);
  const e = await createEvent(treeId, personId, form, actor);
  if (!e.ok) throw new Error(`${quien} (hecho): ${e.error} ${JSON.stringify(e.errors ?? {})}`);
  if (familyId && ev.type === "MARR") {
    // El matrimonio es de la pareja: se pasa del hijo/hija a la familia.
    await pool.query(
      `update events e set person_id = null, family_id = $3
       from citations c join sources s on s.id = c.source_id
       where c.event_id = e.id and e.person_id = $1 and s.url = $2 and e.event_type = 'MARR'
         and not exists (select 1 from events x where x.family_id = $3 and x.event_type = 'MARR')`,
      [personId, ev.sourceUrl, familyId]);
  }
  if (ev.pendiente) {
    // createEvent solo guarda el pendiente si quien edita es administrador en una sesión web; acá se pone directo.
    await pool.query(
      `update events e set needs_review = true, review_kind = $4, review_note = $5
         from citations c join sources s on s.id = c.source_id
        where c.event_id = e.id and e.person_id = $1 and e.event_type = $2 and s.url = $3`,
      [personId, ev.type, ev.sourceUrl, PENDIENTE, ev.comentario ?? null]);
  }
}

/** La persona con este nombre o, si no está, la crea unida a `of` (en el simulacro devuelve null). */
async function crear(
  n: Nuevo, relation: "parent" | "child" | "sibling" | "partner", of: string | null, ofName: string, otherParentId: string | null = null,
): Promise<string | null> {
  const name = display(n);
  const ya = await byName(name);
  if (ya) { console.log(`= ya existe: ${name}`); cuenta.saltados++; return ya; }
  const person = { given: n.given, surnamePat: n.pat, surnameMat: n.mat, sex: n.sex, isLiving: false, notes: n.nota };
  const v = validatePerson(person);
  if (!v.ok) throw new Error(`Datos inválidos en ${name}: ${JSON.stringify(v.errors)}`);
  console.log(`+ ${name} (${relation} de ${ofName})`);
  cuenta.nuevos++;
  if (!APPLY) return null;
  if (!of) throw new Error(`Falta ${ofName} para agregar a ${name}`);
  const r = await addRelative(treeId, { relation, of, otherParentId, person }, actor);
  if (!r.ok) throw new Error(`${name}: ${r.error} ${JSON.stringify(r.errors ?? {})}`);
  return r.id;
}

// ─── Datos ───────────────────────────────────────────────────────

const NOMBRADO = "Nombrado en el registro";

const GREGORIO_HIJO: Nuevo = {
  given: "Gregorio", pat: "Balcázar", mat: "Bravo", sex: "M",
  nota: "Hijo de Gregorio Balcázar (escrito Valcasa/Valcaza) y Dominga Bravo según su matrimonio de 1866 (XS6Z-8769). Nacimiento sin acta: c. 1830 por los 50 años de su sepultura. No es el padre de Isidoro: el matrimonio lo da de 59 años (nacido en 1807), pero esa edad no calza con sus hijos de 1875 y 1879.",
  hechos: [
    {
      type: "BIRT", date: "c. 1830", place: "Maipo, Chile",
      text: "FECHA APROXIMADA: calculada por el índice a partir de los 50 años de su sepultura (1880). El matrimonio de 1866 lo da de 59 años (nacido en 1807), que no calza con tener hijos en 1875 y 1879 ni con que su madre Dominga tuviera hijos hasta 1849: la edad del matrimonio está mal leída. No apareció su bautizo. Queda a un año del nacimiento estimado de su hermano Isidoro (c. 1829): alguna de las dos fechas está corrida.",
      sourceUrl: FS("62D5-YWFD"), sourceTitle: PARR,
    },
    {
      type: "DEAT", date: "16 de noviembre de 1880",
      text: "Fecha de defunción que trae el registro de sepultura; murió a los 50 años. No dice dónde murió.",
      sourceUrl: FS("62D5-YWFD"), sourceTitle: PARR,
    },
    {
      type: "BURI", date: "17 de noviembre de 1880", place: "San Isidro Labrador, Santiago, Chile",
      text: "Esposo de Bartola Olguín, 50 años. El índice no nombra cementerio.",
      sourceUrl: FS("62D5-YWFD"), sourceTitle: PARR,
    },
  ],
};
const MARR_GREGORIO: Ev = {
  type: "MARR", date: "1 de mayo de 1866", place: "Maipo, Chile",
  text: "Los dos novios figuran solteros y de 59 años (nacidos en 1807), edad que no puede ser: tuvieron hijos en 1875 y 1879. Padres del novio: Gregorio Valcasa y Dominga Bravo. Madre de la novia: María Olquin (Olguín). Otros nombres en el registro, sin rol indexado: Maurimo Manreira, Constancio Godoi.",
  sourceUrl: FS("XS6Z-8769"), sourceTitle: PARR,
};

const BARTOLA: Nuevo = {
  given: "Bartola", pat: "Olguín", mat: "", sex: "F",
  nota: "Esposa de Gregorio Balcázar Bravo (matrimonio del 1 de mayo de 1866, XS6Z-8769; escrita Olquin y Olguin en otras actas). El matrimonio la da de 59 años (nacida en 1807 en Maipo), que no calza con hijos en 1875 y 1879: edad dudosa. Sin bautizo ni defunción ubicados.",
  hechos: [],
};
const MARIA_OLGUIN: Nuevo = {
  given: "María", pat: "Olguín", mat: "", sex: "F",
  nota: "Madre de Bartola Olguín: solo se la nombra en el matrimonio de su hija en 1866 (XS6Z-8769, escrita Olquin). Sin más datos.",
  hechos: [{
    type: "EVEN", subtype: "Nombrada en el matrimonio de su hija", date: "1 de mayo de 1866", place: "Maipo, Chile",
    text: "Figura como madre de la novia, Bartola Olguín, en el matrimonio con Gregorio Balcázar Bravo.",
    sourceUrl: FS("XS6Z-8769"), sourceTitle: PARR,
  }],
};

const FRANCISCO: Nuevo = {
  given: "Francisco", pat: "Balcázar", mat: "Olguín", sex: "M",
  nota: "Hijo de Gregorio Balcázar Bravo (escrito Valcaza) y Bartola Olguín, según su bautizo en Paine (6D8M-P8VX).",
  hechos: [], // se arma en main(): sus padrinos se enlazan con personas ya cargadas
};
const ELENA: Nuevo = {
  given: "Elena", pat: "Balcázar", mat: "Olguín", sex: "F",
  nota: "Hija de Gregorio Balcázar Bravo (escrito Valcaza) y Bartola Olguín, según su bautizo en Maipo (6D8X-BC2V).",
  hechos: [
    {
      type: "BIRT", date: "18 de septiembre de 1879", place: "Maipo, Chile",
      text: "Fecha de nacimiento que da el índice del bautizo (el acta indexada solo da el año del bautizo).",
      sourceUrl: FS("6D8X-BC2V"), sourceTitle: PARR,
    },
    {
      type: "BAPM", date: "1879", place: "Maipo, Chile",
      text: "Hija de Gregorio Valcaza (Balcázar) y Bartola Olguín. Otros nombres en el registro, sin rol indexado: Pedro Nolasco Núñez, Ramón Saavedra, Capás, Juan de Dios Jiménez, Rafaela Miranda, José Ignacio Rojas.",
      sourceUrl: FS("6D8X-BC2V"), sourceTitle: PARR,
    },
  ],
};

const ROSARIO: Nuevo = {
  given: "Rosario de los Dolores", pat: "Balcázar", mat: "Bravo", sex: "F",
  nota: "HIPÓTESIS: posible hija de Gregorio Balcázar y Dominga Bravo, bautizada en Maipo en 1824 (6D56-JMPT). El índice no le da apellido ni nombra a Gregorio: solo anota como progenitores a «Domingo Bravo» (forma en que Dominga aparece mal escrita en otras actas) y a «Matea Balcasar D. Juan». Falta ver la imagen del acta.",
  hechos: [{
    type: "BAPM", date: "1824", place: "Maipo, Chile", pendiente: true,
    comentario: "Hipótesis: ver en la imagen si «Matea Balcasar» y «Domingo Bravo» son Gregorio y Dominga; el índice no nombra a Gregorio.",
    text: "HIPÓTESIS, sin comprobar. Inscrita como Santa Rosario de los Dolores. Progenitores según el índice: «Domingo Bravo» (probablemente Dominga) y «Matea Balcasar D. Juan». Aparece también Mateo Moraga (sin rol indexado), el mismo nombre que en «Eugenio de los Dolores Valcasar» (6D5N-SK4Q, https://www.familysearch.org/ark:/61903/1:1:6D5N-SK4Q), cuyo bautizo parece del mismo día: podrían ser mellizos. Falta ver la imagen del acta.",
    sourceUrl: FS("6D56-JMPT"), sourceTitle: PARR,
    participants: [{ role: NOMBRADO, name: "Mateo Moraga", personId: null }],
  }],
};

const EUGENIO_1824: Ev = {
  type: "BAPM", date: "1824", place: "Maipo, Chile", pendiente: true,
  comentario: "Hipótesis: la edad no calza con su defunción de 1886 (45 años). Ver la fecha real en la imagen.",
  text: "HIPÓTESIS, sin comprobar. Inscrito como Eugenio de los Dolores Valcasar, hijo de «Grego Valcasar» y Dominga «Urabo» (Bravo). El índice no trae fecha (dice «mismo día mes y año», o sea el de la entrada anterior); 1824 sale del bautizo de Santa Rosario de los Dolores (6D56-JMPT, https://www.familysearch.org/ark:/61903/1:1:6D56-JMPT), con el mismo nombre en el registro (Mateo Moraga). CONTRADICCIÓN: su defunción de 1886 lo da de 45 años (nacido c. 1841); con este bautizo tendría 62. Falta ver la imagen del acta.",
  sourceUrl: FS("6D5N-SK4Q"), sourceTitle: PARR,
  participants: [
    { role: "Padrino", name: "José Araya", personId: null },
    { role: NOMBRADO, name: "Mateo Moraga", personId: null },
  ],
};

const GREGORIO_NOMBRES: Ev = {
  type: "EVEN", subtype: "Nombre en otras actas",
  text: "En los registros aparece como Gregorio Valcasa (matrimonio de su hijo Gregorio, 1866), Valcaza (matrimonios de sus hijos Josefa, Eugenio y Andrés), Valcazar (bautizo de José Gregorio, 1841), «Grego Valcasar» (bautizo de Eugenio de los Dolores) y «Balcasó» (bautizo de María Josefa, 1846), además de Balcazar. Para buscarlo en el índice de FamilySearch hay que probar todas. No se ha encontrado su bautizo, su matrimonio ni su defunción.",
  sourceUrl: FS("XS6Z-8769"), sourceTitle: PARR,
};
const GREGORIO_PADRINO: Ev = {
  type: "EVEN", subtype: "Padrino de bautizos en Maipo", date: "1833-1847", place: "Maipo, Chile",
  text: "Figura entre los nombres de estos bautizos de Maipo, a veces con Dominga Bravo, sin que el índice diga su papel: Santos (28 may 1834, https://www.familysearch.org/ark:/61903/1:1:6D83-J19K), José Mateo (29 sep 1838, https://www.familysearch.org/ark:/61903/1:1:6D83-16SW), María del Carmen (1838, https://www.familysearch.org/ark:/61903/1:1:6D83-16SZ), Eustaquio (feb 1841, https://www.familysearch.org/ark:/61903/1:1:6DZ1-MJWM), Eustaquia y Antonia (1843, https://www.familysearch.org/ark:/61903/1:1:6DZB-1F48 y https://www.familysearch.org/ark:/61903/1:1:6DZB-1F4S), Eulogia (1842, https://www.familysearch.org/ark:/61903/1:1:6DZB-GCC1) y Juana María (1847, Pirque, https://www.familysearch.org/ark:/61903/1:1:6D8Q-7X4H). Aparece con las mismas personas (Josefa Aguilera, Blas González, Ramón Sánchez) una y otra vez: su círculo en Maipo.",
  sourceUrl: FS("6D83-J19K"), sourceTitle: PARR,
};
const DOMINGA_NOMBRES: Ev = {
  type: "EVEN", subtype: "Nombre en otras actas",
  text: "En el índice aparece escrita «Domingo Bravo» (bautizo de José Gregorio, 1841), «Dominga Urabo» (bautizo de Eugenio de los Dolores, https://www.familysearch.org/ark:/61903/1:1:6D5N-SK4Q) y «Dominga Brabo» (bautizo de Francisca, 1834, https://www.familysearch.org/ark:/61903/1:1:6D83-B7RW). Posibles parientes suyos, sin relación indicada: Carmen Bravo Aguilera (madre de José Mateo y María del Carmen, 1838, https://www.familysearch.org/ark:/61903/1:1:6D83-16SW) y José Brabo y Bacilia Brabo (padrinos de Francisca, 1834). No se ha encontrado su bautizo, su matrimonio ni su defunción.",
  sourceUrl: FS("6DZB-19VM"), sourceTitle: PARR,
};

// ─── Carga ───────────────────────────────────────────────────────

async function main() {
  const todos: [string, Ev][] = [
    ...GREGORIO_HIJO.hechos.map((e): [string, Ev] => [display(GREGORIO_HIJO), e]),
    ["Gregorio y Bartola", MARR_GREGORIO],
    ...MARIA_OLGUIN.hechos.map((e): [string, Ev] => [display(MARIA_OLGUIN), e]),
    ...ELENA.hechos.map((e): [string, Ev] => [display(ELENA), e]),
    ...ROSARIO.hechos.map((e): [string, Ev] => [display(ROSARIO), e]),
    ["Eugenio", EUGENIO_1824], ["Gregorio", GREGORIO_NOMBRES], ["Gregorio", GREGORIO_PADRINO], ["Dominga", DOMINGA_NOMBRES],
  ];
  for (const [quien, ev] of todos) {
    const v = validateEvent(evForm(ev));
    if (!v.ok) throw new Error(`Hecho inválido de ${quien}: ${JSON.stringify(v.errors)}`);
  }
  for (const n of [GREGORIO_HIJO, BARTOLA, MARIA_OLGUIN, FRANCISCO, ELENA, ROSARIO]) {
    const v = validatePerson({ given: n.given, surnamePat: n.pat, surnameMat: n.mat, sex: n.sex, isLiving: false, notes: n.nota });
    if (!v.ok) throw new Error(`Datos inválidos en ${display(n)}: ${JSON.stringify(v.errors)}`);
  }
  if (SOLO_VALIDAR) { console.log(`Los ${todos.length} hechos y las 6 personas son válidos.`); return; }

  const { rows: trees } = await pool.query(`select id from trees order by created_at limit 1`);
  treeId = trees[0].id as string;
  const { rows: users } = MAIL
    ? await pool.query(`select id, name from users where lower(email) = lower($1)`, [MAIL])
    : await pool.query(`select id, name from users order by created_at limit 1`);
  if (!users[0]) throw new Error("No encontré el usuario. Usa --correo tu@correo.");
  actor = { id: users[0].id as string, name: users[0].name as string };
  console.log(`${APPLY ? "ESCRIBIENDO" : "SIMULACRO (no escribe)"} como ${actor.name}\n`);

  const isidoro = await byName("Isidoro Balcazar Bravo");
  const gregorioPadre = await byName("Gregorio Balcazar");
  const dominga = await byName("Dominga Bravo");
  const eugenio = await byName("Eugenio Balcázar Bravo");
  if (!isidoro || !gregorioPadre || !dominga) throw new Error("Faltan Isidoro, Gregorio o Dominga en el árbol.");

  // Hermanos de Isidoro
  console.log("— Gregorio Balcázar Bravo y su familia");
  const gregorioHijo = await crear(GREGORIO_HIJO, "sibling", isidoro, "Isidoro Balcazar Bravo");
  for (const ev of GREGORIO_HIJO.hechos) await hecho(gregorioHijo, display(GREGORIO_HIJO), ev);

  const bartola = await crear(BARTOLA, "partner", gregorioHijo, display(GREGORIO_HIJO));
  const fam = gregorioHijo && bartola ? await familyOf(gregorioHijo, bartola) : null;
  if (gregorioHijo && fam) await hecho(gregorioHijo, "Gregorio y Bartola", MARR_GREGORIO, fam);
  else { console.log(`  + Gregorio y Bartola: MARR ${MARR_GREGORIO.date}`); cuenta.hechos++; }

  const mariaOlguin = await crear(MARIA_OLGUIN, "parent", bartola, display(BARTOLA));
  for (const ev of MARIA_OLGUIN.hechos) await hecho(mariaOlguin, display(MARIA_OLGUIN), ev);

  // Los padrinos del bautizo de Francisco son su tío Andrés Avelino y su esposa: se enlazan si ya están.
  const andres = await byName("Andrés Avelino Balcázar Bravo");
  const rosarioMiranda = await byName("Rosario Miranda");
  const francisco = await crear(FRANCISCO, "child", gregorioHijo, display(GREGORIO_HIJO), bartola);
  const FRANCISCO_HECHOS: Ev[] = [
    {
      type: "BIRT", date: "22 de septiembre de 1875", place: "Paine, Chile",
      text: "Fecha de nacimiento que da el índice del bautizo (el acta indexada solo da el año del bautizo). El índice pone Paine en «O'Higgins»: es Paine, de la provincia de Maipo.",
      sourceUrl: FS("6D8M-P8VX"), sourceTitle: PARR,
    },
    {
      type: "BAPM", date: "1875", place: "Paine, Chile",
      text: "Hijo de Gregorio Valcaza (Balcázar) y Bartola Olguín. Entre los nombres del registro, sin rol indexado, están Andrés Balcaza y Rosario Miranda (probablemente su tío Andrés Avelino Balcázar Bravo y su esposa), además de Rafael Guzmán, P. F., Capás y José Ignacio Rojas.",
      sourceUrl: FS("6D8M-P8VX"), sourceTitle: PARR,
      participants: [
        { role: NOMBRADO, name: "Andrés Balcaza", personId: andres },
        { role: NOMBRADO, name: "Rosario Miranda", personId: rosarioMiranda },
      ],
    },
  ];
  for (const ev of FRANCISCO_HECHOS) await hecho(francisco, display(FRANCISCO), ev);

  const elena = await crear(ELENA, "child", gregorioHijo, display(GREGORIO_HIJO), bartola);
  for (const ev of ELENA.hechos) await hecho(elena, display(ELENA), ev);

  console.log("\n— Bautizos de 1824 (hipótesis)");
  const rosario = await crear(ROSARIO, "sibling", isidoro, "Isidoro Balcazar Bravo");
  for (const ev of ROSARIO.hechos) await hecho(rosario, display(ROSARIO), ev);
  if (eugenio) await hecho(eugenio, "Eugenio Balcázar Bravo", EUGENIO_1824);
  else console.log("! No encontré a Eugenio Balcázar Bravo: se salta su bautizo de 1824.");

  console.log("\n— Nombres y padrinazgos de los padres");
  await hecho(gregorioPadre, "Gregorio Balcazar", GREGORIO_NOMBRES);
  await hecho(gregorioPadre, "Gregorio Balcazar", GREGORIO_PADRINO);
  await hecho(dominga, "Dominga Bravo", DOMINGA_NOMBRES);

  console.log(`\n${APPLY ? "Listo" : "Haría"}: ${cuenta.nuevos} personas nuevas, ${cuenta.hechos} hechos nuevos (${cuenta.pendientes} como pendiente), ${cuenta.saltados} ya estaban.`);
  if (!APPLY) console.log("Si está bien, corre de nuevo con: npm run db:cargar-balcazar-gregorio -- --apply");
}

main()
  .then(() => pool.end())
  .catch((e) => {
    const sub = e?.errors?.map((x: Error) => x.message).join("; ");
    console.error("ERROR:", e?.message || sub || e?.code || e);
    if (!process.env.DATABASE_URL) console.error("No hay DATABASE_URL: revisa que exista .env.local en esta carpeta.");
    process.exit(1);
  });
