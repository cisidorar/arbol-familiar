/**
 * Carga la búsqueda del 18 oct 2026 sobre los hijos de Francisco González Uribe y Carlota Quintero García
 * (claude/hijos-gonzalez-quintero-18-oct.md en el proyecto), cada hecho con su enlace a FamilySearch.
 *
 * A) Pone el enlace en hechos que ya existían sin fuente (no pisa una fuente que ya tenga el hecho):
 *    nacimiento de Isaías (KZ7W-W5G) y de María Virjinia (QPS6-Z74Q), defunción de Lucrecia (QLXS-CCCF),
 *    matrimonio de Isaías y Emma Pezoa (QPS6-MTMY).
 * B) Agrega hechos nuevos: bautizos de Bruno, Guadalupe (1891), Jenoveva, Manuela del Carmen y María Mercedes;
 *    matrimonios civiles de Bruno, Isaías (el primero, 1907), Lucrecia, María Mercedes, María Salomé y
 *    María Virjinia; y el segundo registro de defunción de Manuela del Carmen.
 *
 * NO vuelve a crear a Carlota, Carmela ni Bruno del Carmen (el primero, 1888): Cas los eliminó del árbol el
 * 14 oct. Sus registros quedan solo en el documento del proyecto. Los matrimonios van como hecho propio
 * («Matrimonio civil») en la ficha de cada hijo: no se crean los cónyuges ni los nietos.
 * Los hechos se crean con createEvent / updateEvent, así que quedan en Administración → Historial de cambios.
 * Se puede correr más de una vez: salta lo que ya tiene esa fuente.
 *
 *   npm run db:cargar-hijos-gonzalez-quintero            (solo muestra qué haría, no escribe)
 *   npm run db:cargar-hijos-gonzalez-quintero -- --apply (escribe)
 *   Opcional: --correo tu@correo.cl  (si no, usa el primer usuario)
 */
import dotenv from "dotenv";
import { getPool } from "../src/lib/db/pool";
import { createEvent, updateEvent } from "../src/lib/data/edit";
import { dateForEditing, validateEvent, type ParticipantForm } from "../src/lib/edit";

// La base está en Supabase y su dirección vive en .env.local (dotenv/config solo lee .env).
dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ quiet: true });

const APPLY = process.argv.includes("--apply");
const SOLO_VALIDAR = process.argv.includes("--solo-validar");
const mailIdx = process.argv.indexOf("--correo");
const MAIL = mailIdx > 0 ? process.argv[mailIdx + 1] : null;
const FS = (id: string) => `https://www.familysearch.org/ark:/61903/1:1:${id}`;
const PARR = "Chile, registros parroquiales y diocesanos, 1633-2015 (FamilySearch)";
const CIVIL = "Chile, Registro Civil, 1880-1933 (FamilySearch)";
const NOMBRADO = "Nombrado en el registro";
const MATRIMONIO = "Matrimonio civil";

type Ev = {
  type: string; subtype?: string; date?: string; place?: string; text?: string;
  sourceUrl: string; sourceTitle: string; participants?: ParticipantForm[];
};
type Persona = { nombre: string; hechos: Ev[] };
/** Un hecho que ya existe sin enlace: se le pone la fuente (y el texto, si no tenía). */
type Fuente = {
  nombre: string; type: string; sourceUrl: string; sourceTitle: string; text: string;
  /** Si es un hecho de la pareja (matrimonio), el nombre de la pareja. */
  conPareja?: string;
};

const pool = getPool();
let treeId = "";
let actor = { id: "", name: "" };
const cuenta = { hechos: 0, fuentes: 0, saltados: 0 };

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
     where e.person_id = $1 and e.event_type = $2 and coalesce(e.event_subtype,'') = $3 and s.url like '%' || $4 || '%' limit 1`,
    [personId, ev.type, ev.subtype ?? "", ev.sourceUrl.split(":").pop()]);
  return dup.rows.length ? "ya cargado" : null;
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

/** Pone el enlace en un hecho que existe sin fuente. */
async function fuente(personId: string, f: Fuente) {
  const params: unknown[] = [personId, f.type];
  let sql = `select e.id from events e where e.person_id = $1 and e.event_type = $2`;
  if (f.conPareja) {
    sql = `select e.id from events e join families fa on fa.id = e.family_id
           join person_names pn on pn.person_id = case when fa.partner1_id = $1 then fa.partner2_id else fa.partner1_id end and pn.is_primary
           where (fa.partner1_id = $1 or fa.partner2_id = $1) and e.event_type = $2 and lower(pn.display_name) = lower($3)`;
    params.push(f.conPareja);
  }
  const { rows } = await pool.query(sql, params);
  if (rows.length !== 1) {
    console.log(`  ! ${f.nombre}: ${f.type} — ${rows.length ? "hay " + rows.length + ", no sé cuál" : "no existe"}: se salta.`);
    cuenta.saltados++;
    return;
  }
  const id = rows[0].id as string;
  const cur = (await pool.query(
    `select e.event_subtype, e.date_text, e.description, pl.raw_text as place,
            (select count(*) from citations c where c.event_id = e.id) as citas,
            (select count(*) from event_participants ep where ep.event_id = e.id) as partes
     from events e left join places pl on pl.id = e.place_id where e.id = $1`, [id])).rows[0];
  if (Number(cur.citas) > 0) { console.log(`  = ${f.nombre} — ${f.type}: ya tiene fuente`); cuenta.saltados++; return; }
  if (Number(cur.partes) > 0) { console.log(`  ! ${f.nombre} — ${f.type}: tiene personas relacionadas, ponle el enlace a mano.`); cuenta.saltados++; return; }
  const desc = (cur.description as string | null) ?? "";
  const reemplaza = !desc.trim() || /falta ubicar el acta/i.test(desc);
  const form = {
    type: f.type, subtype: cur.event_subtype ?? "", date: dateForEditing(cur.date_text), place: cur.place ?? "",
    text: reemplaza ? f.text : desc, sourceUrl: f.sourceUrl, sourceTitle: f.sourceTitle, sourceQuote: "", participants: [],
  };
  const v = validateEvent(form, form.date);
  if (!v.ok) throw new Error(`Fuente inválida de ${f.nombre}: ${JSON.stringify(v.errors)}`);
  console.log(`  + ${f.nombre}: enlace en ${f.type} ${form.date}${reemplaza ? "" : "  (se conserva su texto)"}`);
  cuenta.fuentes++;
  if (!APPLY) return;
  const r = await updateEvent(treeId, id, form, actor);
  if (!r.ok) throw new Error(`${f.nombre} (fuente): ${r.error} ${JSON.stringify(r.errors ?? {})}`);
}

// ─── Datos ───────────────────────────────────────────────────────

const FUENTES: Fuente[] = [
  {
    nombre: "Isaias del Carmen Gonzalez Quinteros", type: "BIRT", sourceUrl: FS("KZ7W-W5G"), sourceTitle: CIVIL,
    text: "Inscripción en el Registro Civil de Buin: Isaías del Carmen, nacido el 22 de noviembre de 1885, hijo de Francisco González Uribe y Carlota Quinteros García.",
  },
  {
    nombre: "Maria Virjinia Gonzalez Quinteros", type: "BIRT", sourceUrl: FS("QPS6-Z74Q"), sourceTitle: CIVIL,
    text: "Inscripción en el Registro Civil de Buin: María Virjinia, nacida el 14 de enero de 1890. El índice anota a la madre como «Carlota González de Quinteros» (los apellidos quedaron invertidos).",
  },
  {
    nombre: "Lucrecia González Quintero", type: "DEAT", sourceUrl: FS("QLXS-CCCF"), sourceTitle: CIVIL,
    text: "Murió el 13 de agosto de 1905 en La Champa (Paine), a los 22 años, casada con Víctor Sánchez. El acta calcula su nacimiento hacia 1883; en su matrimonio de 1902 (QPSD-RC8Z) tenía 17 años (hacia 1885): las edades no calzan.",
  },
  {
    nombre: "Isaias del Carmen Gonzalez Quinteros", type: "MARR", conPareja: "Emma Pezoa Morales",
    sourceUrl: FS("QPS6-MTMY"), sourceTitle: CIVIL,
    text: "Matrimonio civil en Paine, certificado 9, página 5. Emma Pezoa Morales era hija de Juan Pezoa y Carmen Morales. Era el segundo matrimonio de Isaías: el primero, con Manuela Carrasco Lara, fue en 1907 (QLX9-Q7Z5) y ella murió en 1909. Hijos con Emma según el Registro Civil de Buin: María Isabel (nacida y fallecida el 30 de octubre de 1916, QPS6-ZXKV), Isaías Lázaro (6 de febrero de 1918, QLX9-W8MM), Leontina del Carmen (6 de mayo de 1919, QLXM-1XYH) y Emma Carlota (26 de octubre de 1920, QLX9-WZTP).",
  },
];

const PERSONAS: Persona[] = [
  {
    nombre: "Bruno González Quintero",
    hechos: [
      {
        type: "BAPM", date: "1892", place: "Buin, Chile",
        text: "Inscrito como Bruno del Carmen, nacido el 30 de agosto de 1892 según el índice (coincide con la fecha de nacimiento de la ficha; el acta indexada solo da el año del bautismo). Padres: Francisco González y Carlota «Quin…» (el apellido está cortado en el índice). Es el SEGUNDO Bruno de la familia: el primero, Bruno del Carmen, nació el 15 de octubre de 1888 en Buin (KZ7L-Z8J) y murió el 17 de diciembre de 1888 en Santiago (Q2T2-SP6F).",
        sourceUrl: FS("6DS6-BPV4"), sourceTitle: PARR,
        participants: [
          { role: NOMBRADO, name: "Eujenio Guzmán", personId: null },
          { role: NOMBRADO, name: "Antonio Figueroa", personId: null },
          { role: NOMBRADO, name: "Rita Olivares", personId: null },
        ],
      },
      {
        type: "EVEN", subtype: MATRIMONIO, date: "28 de mayo de 1918", place: "Buin, Chile",
        text: "Se casó con Esther Godoy Castañeda (Godoi en el índice), hija de Gervasio Godoy y Margarita Castañeda. Certificado 24, página 13. La información matrimonial en la parroquia es del 22 de mayo de 1918 (él 26 años, ella 22): https://www.familysearch.org/ark:/61903/1:1:X4WS-QJ32. Hija según el Registro Civil de Buin: Victoria del Carmen González Godoy, nacida el 9 de mayo de 1919 (QLX9-Z6QQ).",
        sourceUrl: FS("QLX9-Q7DC"), sourceTitle: CIVIL,
      },
    ],
  },
  {
    nombre: "Guadalupe González Quintero",
    hechos: [{
      type: "BAPM", date: "18 de abril de 1891", place: "Buin, Chile",
      text: "Inscrita como Guadalupe del Carmen, nacida el 11 de abril de 1891 (coincide con la fecha de nacimiento de la ficha). Hijos de Francisco González y Carlota Quinteros. Es la segunda Guadalupe: la primera, Guadalupe del Carmen, murió de 4 años el 31 de diciembre de 1887 (Q2TK-2JVH). Sin defunción encontrada para esta.",
      sourceUrl: FS("6DSX-3LF2"), sourceTitle: PARR,
      participants: [
        { role: NOMBRADO, name: "José Herrera", personId: null },
        { role: NOMBRADO, name: "Petronila García", personId: null },
        { role: NOMBRADO, name: "Leoncio Salas", personId: null },
      ],
    }],
  },
  {
    nombre: "Isaias del Carmen Gonzalez Quinteros",
    hechos: [{
      type: "EVEN", subtype: MATRIMONIO, date: "23 de septiembre de 1907", place: "Buin, Chile",
      text: "Primer matrimonio de Isaías: con Manuela Carrasco Lara, hija de Pedro Carrasco y Francisca Lara. Certificado 75, página 38 (otro registro del mismo matrimonio: https://www.familysearch.org/ark:/61903/1:1:QLX9-Q787). Hijo según el Registro Civil de La Champa: Daniel Segundo Isaías González Carrasco, nacido el 2 de diciembre de 1908 (QGNM-DH7B). Manuela murió el 29 de enero de 1909 en Providencia, a los 21 años (QLX9-8PVG). Isaías volvió a casarse en 1912 con Emma Pezoa Morales.",
      sourceUrl: FS("QLX9-Q7Z5"), sourceTitle: CIVIL,
    }],
  },
  {
    nombre: "Jenoveva del Carmen Gonzalez Quinteros",
    hechos: [{
      type: "BAPM", date: "23 de enero de 1894", place: "Buin, Chile",
      text: "Inscrita como Genoveva del Carmen, nacida el 6 de enero de 1894. Hija de Francisco González y Carlota «Menteros» (Quinteros). Otros nombres en el registro, sin rol indexado: Gabino Parraquirrez, Isabel Chávez (el índice dice «Isabael») y «Vicano» (probablemente el vicario). Murió ese mismo año, el 18 de julio de 1894.",
      sourceUrl: FS("6DSF-GCF1"), sourceTitle: PARR,
      participants: [
        { role: NOMBRADO, name: "Gabino Parraquirrez", personId: null },
        { role: NOMBRADO, name: "Isabel Chávez", personId: null },
      ],
    }],
  },
  {
    nombre: "Lucrecia González Quintero",
    hechos: [{
      type: "EVEN", subtype: MATRIMONIO, date: "17 de enero de 1902", place: "Buin, Chile",
      text: "Se casó con Víctor Sánchez Yáñez, hijo de Cornelio Sánchez y Lucía Yáñez. Certificado 17, página 3. Edades en el acta: ella 17 años (QPWX-X4KD) y él 20 (QPWX-X4KH). El matrimonio religioso, en Buin, aparece sin fecha legible en el índice (https://www.familysearch.org/ark:/61903/1:1:XS6D-3GTQ). Murió tres años después, el 13 de agosto de 1905.",
      sourceUrl: FS("QPSD-RC8Z"), sourceTitle: CIVIL,
    }],
  },
  {
    nombre: "Manuela del Carmen Gonzalez Quinteros",
    hechos: [
      {
        type: "BAPM", date: "20 de agosto de 1899", place: "Buin, Chile",
        text: "Inscrita como Manuela del Carmen, hija de Francisco González y Carlota Quinteros. El índice anota su nacimiento «16 de julio» con el año mal transcrito; el Registro Civil (KZ7W-WNV) dice 16 de octubre de 1899, que es la fecha de la ficha. Como el bautizo fue el 20 de agosto, el 16 de octubre puede ser la fecha de la inscripción civil y no la del nacimiento: confirmar en la imagen. Murió el 2 de marzo de 1900, a los pocos meses de nacer. Aparecen los mismos José Herrera y Petronila García que en el bautizo de Guadalupe (1891).",
        sourceUrl: FS("6ZT5-7J11"), sourceTitle: PARR,
        participants: [
          { role: NOMBRADO, name: "José Herrera", personId: null },
          { role: NOMBRADO, name: "Florián Leyton", personId: null },
          { role: NOMBRADO, name: "Petronila García", personId: null },
          { role: NOMBRADO, name: "Rudencia Contardo", personId: null },
        ],
      },
      {
        type: "EVEN", subtype: "Segundo registro de defunción", date: "10 de marzo de 1900", place: "Buin, Chile",
        text: "El índice trae otro registro de defunción de Manuela del Carmen, de 0 años, hija de Francisco González y Carlota Quinteros, con fecha 10 de marzo de 1900. El que está en su defunción (QPS6-C65B) dice 2 de marzo de 1900. Lo más probable es que sea el mismo fallecimiento inscrito dos veces o con la fecha mal leída: ver las imágenes.",
        sourceUrl: FS("QLX9-DLD6"), sourceTitle: CIVIL,
      },
    ],
  },
  {
    nombre: "María Mercedes González Quintero",
    hechos: [
      {
        type: "BAPM", date: "19 de octubre de 1896", place: "Buin, Chile",
        text: "Inscrita como María Mercedes, nacida el 24 de septiembre de 1896 (la fecha de la ficha). El Registro Civil (KZ7C-Y5P, el enlace de su nacimiento) dice 29 de octubre de 1896: probablemente es la fecha de la inscripción civil y no la del parto. El mismo bautizo está indexado dos veces: https://www.familysearch.org/ark:/61903/1:1:6DSF-R4PZ. Otros nombres en el registro, sin rol indexado: Belisario Gorena, Agustina Gorena (Lorena en una de las dos), Moisés Valdés e Ismael Chávez.",
        sourceUrl: FS("6DSF-PPLN"), sourceTitle: PARR,
        participants: [
          { role: NOMBRADO, name: "Belisario Gorena", personId: null },
          { role: NOMBRADO, name: "Agustina Gorena", personId: null },
          { role: NOMBRADO, name: "Moisés Valdés", personId: null },
          { role: NOMBRADO, name: "Ismael Chávez", personId: null },
        ],
      },
      {
        type: "EVEN", subtype: MATRIMONIO, date: "19 de julio de 1920", place: "Paine, Chile",
        text: "Se casó con Juan Nicolás de la Cruz Guzmán Ríos (nacido el 7 de abril de 1895 en Buin, KZ7C-LY9), hijo de Quintín Guzmán e Irene Ríos. Certificado 28, página 15. Hijo según el Registro Civil de Paine: José Roberto Guzmán González, nacido el 5 de septiembre de 1920 (QPSD-TH2F).",
        sourceUrl: FS("QPSD-YYRP"), sourceTitle: CIVIL,
      },
    ],
  },
  {
    nombre: "Maria Salomé Gonzalez Quinteros",
    hechos: [{
      type: "EVEN", subtype: MATRIMONIO, date: "22 de octubre de 1919", place: "Paine, Chile",
      text: "Se casó con Víctor Manuel Cornejo Astudillo, hijo de Bartolomé Cornejo y María Astudillo. Certificado 37, página 4. Su nacimiento también está indexado en el Registro Civil de Santiago, 27 de marzo de 1898 (https://www.familysearch.org/ark:/61903/1:1:KZ7D-CWJ).",
      sourceUrl: FS("QPS6-MTQV"), sourceTitle: CIVIL,
    }],
  },
  {
    nombre: "Maria Virjinia Gonzalez Quinteros",
    hechos: [{
      type: "EVEN", subtype: MATRIMONIO, date: "4 de enero de 1912", place: "La Champa, Paine, Chile",
      text: "Se casó con Manuel Jesús Quinteros Pérez, hijo de Manuel Quinteros y Rosario Pérez. Certificado 1, página 1. Hijos según el Registro Civil de Paine: los mellizos Víctor Manuel (QPSD-THVR) y Arsenio del Carmen (QPS6-6GBF), nacidos el 14 de diciembre de 1913; Uberlinda Brígida, 20 de agosto de 1915 (QPS6-HNSY); Olga del Carmen, 2 de agosto de 1917 (QPS6-MCWS); Filomena Lila, 16 de diciembre de 1918 (QPS6-ZJJH); y Hortencia Aurelia, 2 de octubre de 1919 (QPS6-44VD).",
      sourceUrl: FS("QPS6-MFYD"), sourceTitle: CIVIL,
    }],
  },
];

// ─── Carga ───────────────────────────────────────────────────────

async function main() {
  // Valida todo antes de tocar la base.
  for (const p of PERSONAS) for (const ev of p.hechos) {
    const v = validateEvent(evForm(ev));
    if (!v.ok) throw new Error(`Hecho inválido de ${p.nombre}: ${JSON.stringify(v.errors)}`);
  }
  for (const f of FUENTES) {
    const v = validateEvent({ type: f.type, text: f.text, sourceUrl: f.sourceUrl, sourceTitle: f.sourceTitle, participants: [] });
    if (!v.ok) throw new Error(`Fuente inválida de ${f.nombre}: ${JSON.stringify(v.errors)}`);
  }
  if (SOLO_VALIDAR) {
    console.log(`Los ${PERSONAS.reduce((n, p) => n + p.hechos.length, 0)} hechos nuevos y los ${FUENTES.length} enlaces son válidos.`);
    return;
  }

  const { rows: trees } = await pool.query(`select id from trees order by created_at limit 1`);
  treeId = trees[0].id as string;
  const { rows: users } = MAIL
    ? await pool.query(`select id, name from users where lower(email) = lower($1)`, [MAIL])
    : await pool.query(`select id, name from users order by created_at limit 1`);
  if (!users[0]) throw new Error("No encontré el usuario. Usa --correo tu@correo.");
  actor = { id: users[0].id as string, name: users[0].name as string };
  console.log(`${APPLY ? "ESCRIBIENDO" : "SIMULACRO (no escribe)"} como ${actor.name}\n`);

  console.log("— Enlaces en hechos que ya existían");
  for (const f of FUENTES) {
    const id = await byName(f.nombre);
    if (!id) { console.log(`! No encontré a "${f.nombre}" en el árbol: se salta.`); continue; }
    await fuente(id, f);
  }

  for (const p of PERSONAS) {
    const id = await byName(p.nombre);
    if (!id) { console.log(`! No encontré a "${p.nombre}" en el árbol: se salta.`); continue; }
    console.log(`— ${p.nombre}`);
    for (const ev of p.hechos) await hecho(id, p.nombre, ev);
  }

  console.log(`\n${APPLY ? "Listo" : "Haría"}: ${cuenta.fuentes} enlaces en hechos existentes, ${cuenta.hechos} hechos nuevos, ${cuenta.saltados} ya estaban o se saltaron.`);
  if (!APPLY) console.log("Si está bien, corre de nuevo con: npm run db:cargar-hijos-gonzalez-quintero -- --apply");
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => pool.end());
