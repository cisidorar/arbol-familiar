/**
 * Carga los pendientes de investigación que salieron de la investigación de
 * la rama de María Teresa (6 oct 2026). Es seguro correrlo más de una vez:
 * cada pendiente tiene una clave (seed_key) y los que ya existen se saltan.
 * Los que Cas ya cambió o cerró en la app no se tocan.
 *
 *   npm run db:seed-pendientes -- --dry     (solo muestra qué haría)
 *   npm run db:seed-pendientes
 *
 * Requiere haber corrido antes `npm run db:migrate` (migración 0009).
 */
import "dotenv/config";
import type { Venue } from "../src/lib/tasks";
import { getPool } from "../src/lib/db/pool";

type Seed = {
  key: string;
  person?: string; // nombre completo tal como sale en el árbol
  venue: Venue;
  title: string;
  ask?: string;
  ref?: string;
  url?: string;
  hope?: string;
};

const FS = (id: string) => `https://www.familysearch.org/ark:/61903/1:1:${id}`;

const SEEDS: Seed[] = [
  // ── FamilySearch con la cuenta de Cas: las imágenes de las actas ──────────
  {
    key: "fs-matrimonio-juan-clorinda-1897", person: "Juan Balcazar Araya", venue: "familysearch_casa",
    title: "Abrir la imagen del matrimonio religioso de Juan y Clorinda (27 dic 1897, Buin)",
    ask: "Ver la imagen del acta y anotar oficio, edades, domicilio y testigos de los dos.",
    ref: "Parroquia Santos Ángeles Custodios, Buin.", url: FS("XS6D-MMXF"),
    hope: "El oficio de Juan (peón, gañán, inquilino) y dónde vivían.",
  },
  {
    key: "fs-defuncion-juan-1913", person: "Juan Balcazar Araya", venue: "familysearch_casa",
    title: "Abrir la imagen de la defunción de Juan Balcázar (27 ago 1913, Santiago)",
    ask: "Ver la imagen del acta: oficio, domicilio, quién declara la muerte.",
    ref: "Registro Civil, Santiago, 1913.", url: FS("Q24B-P111"),
    hope: "Oficio y domicilio al morir.",
  },
  {
    key: "fs-matrimonio-isidoro-pabla-1849", person: "Isidoro Balcazar Bravo", venue: "familysearch_casa",
    title: "Abrir la imagen del matrimonio de Isidoro Balcázar y Pabla Araya (5 mar 1849)",
    ask: "Ver la imagen del acta: edades, lugar de origen, si él era viudo, testigos y padres.",
    ref: "Parroquia Inmaculada Concepción de Maipo, 1849. Es un registro parroquial: puede no abrirse desde la casa.",
    url: FS("6Y5Z-NBHG"), hope: "Confirmar su nacimiento hacia 1829 y conocer su origen.",
  },
  {
    key: "fs-nacimiento-luis-humberto-1913", person: "Luis Humberto Erasmo Balcazar González", venue: "familysearch_casa",
    title: "Abrir la imagen del nacimiento de Luis Humberto Erasmo (16 dic 1913, Paine)",
    ask: "Ver la imagen del acta: quién lo inscribe, dónde vivían y el oficio del declarante.",
    ref: "Registro Civil, Paine, 1913.", url: FS("QPS6-HNQX"),
    hope: "Dónde vivía la familia cuatro meses después de morir Juan.",
  },
  {
    key: "fs-bautismo-juan-j-1865", person: "Juan Balcazar Araya", venue: "familysearch_casa",
    title: "Ver si «Juan J.» (n. 25 may 1865, Maipo) es Juan Balcázar Araya",
    ask: "Abrir la imagen del bautismo y mirar los nombres completos de los padres.",
    ref: "Parroquia de Maipo, 1865. Registro parroquial.", url: FS("6D83-4Q6B"),
    hope: "Un bautismo para Juan. Hoy solo sabemos que nació entre 1868 y 1872 por edades de los registros.",
  },
  {
    key: "fs-matrimonio-gonzalez-quintero-1878", person: "Carlota de las Mercedes Quintero García", venue: "familysearch_casa",
    title: "Abrir las imágenes del matrimonio González–Quintero (23 jul 1878) y su información previa",
    ask: "Ver las imágenes y anotar los padres de Carlota, el oficio de los novios y los testigos.",
    ref: "Inmaculada Concepción de Maipo. Información matrimonial del 23 jun 1878.", url: FS("XS66-TC7F"),
    hope: "Los padres de Carlota (Pedro Quintero y Pastora García) con más detalle.",
  },
  {
    key: "fs-hijos-martina-lobos", person: "Martina Balcázar Araya", venue: "familysearch_casa",
    title: "Nombrar a los hijos de Martina Balcázar y Pascual Lobos",
    ask: "Abrir el registro y anotar los nombres y fechas de sus al menos 6 hijos.",
    ref: "Pascual Lobos murió el 1 ene 1894 en Buin.", url: FS("X4W9-CRNK"),
    hope: "Los nombres de los hijos, para agregarlos al árbol.",
  },
  {
    key: "fs-gregorio-bartola-olguin", person: "Gregorio Balcazar (Valcaza)", venue: "familysearch_casa",
    title: "Aclarar si «Gregorio Balcázar casado con Bartola Olguín» es un hijo o el mismo Gregorio",
    ask: "Abrir el registro y mirar la edad y los padres: el índice lo da nacido en 1807.",
    ref: "Parroquia de Maipo.", url: FS("XS6Z-8769"),
    hope: "Saber si hay otro hijo de Gregorio y Dominga o si es el padre en otro matrimonio.",
  },
  {
    key: "fs-defuncion-leoncio", person: "Leoncio González Quintero", venue: "familysearch_casa",
    title: "Ubicar el acta de defunción de Leoncio González Quintero (9 nov 1892)",
    ask: "Buscar la inscripción de defunción y anotar el enlace.", hope: "Confirmar fecha, edad y lugar.",
  },
  {
    key: "fs-defuncion-lucrecia", person: "Lucrecia González Quintero", venue: "familysearch_casa",
    title: "Ubicar el acta de defunción de Lucrecia González Quintero (13 ago 1905)",
    ask: "Buscar la inscripción de defunción y anotar el enlace.", hope: "Confirmar fecha, edad y lugar.",
  },
  {
    key: "fs-defuncion-pascual-lobos", person: "Pascual Lobos", venue: "familysearch_casa",
    title: "Ubicar el acta de defunción de Pascual Lobos (1 ene 1894, Buin)",
    ask: "Buscar la inscripción de defunción y anotar el enlace.", hope: "Confirmar fecha, edad y oficio.",
  },
  {
    key: "fs-centro-parroquiales", venue: "familysearch_centro",
    title: "Probar en un centro de FamilySearch los registros parroquiales que desde la casa no se abren",
    ask: "Desde la casa, abrir cada enlace; los que aparezcan bloqueados se ven en un centro o biblioteca afiliada.",
    ref: "Enlaces: 6D83-B7RW, 6DZB-19VM, XS66-PMFH, XS6X-79H7, 6DZ5-JQJL, 6DZ5-RCF3, 6DHV-J79H, 6DHH-YL96, 6D8X-6V6X, 6BJ3-QHFV.",
    hope: "Oficios y domicilios de la familia Balcázar, que solo están en las imágenes.",
  },

  // ── Registro Civil en línea ──────────────────────────────────────────────
  {
    key: "rc-linea-matrimonio-luis", person: "Luis Humberto Erasmo Balcazar González", venue: "registro_civil_linea",
    title: "Pedir el certificado de matrimonio de Luis Balcázar González (1936)",
    ask: "En registrocivil.cl con Clave Única: certificado de matrimonio, usando el RUN de Luis.",
    ref: "El RUN de Luis aparece en el certificado de nacimiento de María Teresa Balcázar Barroso (como RUN del padre). No se guarda en la app.",
    hope: "El nombre de Juana y, con suerte, su RUN.",
  },
  {
    key: "rc-linea-defuncion-luis", person: "Luis Humberto Erasmo Balcazar González", venue: "registro_civil_linea",
    title: "Pedir el certificado de defunción de Luis Balcázar González (29 oct 1999)",
    ask: "En registrocivil.cl con Clave Única: certificado de defunción, con el RUN de Luis.",
    hope: "El nombre y quizá el RUN de su esposa, Juana.",
  },
  {
    key: "rc-linea-defuncion-juana", person: "Juana del Carmen Barroso Ruz", venue: "registro_civil_linea",
    title: "Pedir el certificado de defunción de Juana Barroso Ruz (3 ene 2008)",
    ask: "En registrocivil.cl, certificado de defunción; necesita el RUN de Juana.",
    ref: "Murió en Santiago el 3 de enero de 2008.", hope: "Sus padres y su último domicilio.",
  },

  // ── Registro Civil, en una oficina ───────────────────────────────────────
  {
    key: "rc-oficina-matrimonio-1936", person: "Juana del Carmen Barroso Ruz", venue: "registro_civil_oficina",
    title: "Pedir la copia íntegra del matrimonio de Luis Balcázar y Juana Barroso (1936, Portales)",
    ask: "«Quisiera la copia íntegra de la inscripción de matrimonio de Luis Balcázar González y Juana del Carmen Barroso Ruz, circunscripción Portales, año 1936.»",
    ref: "Llevar carnet. No hace falta el RUN. Indicar nombres completos, año y circunscripción.",
    hope: "Los padres de Germán Barroso y de María del Carmen Ruz, con edades y oficios.",
  },
  {
    key: "rc-oficina-nacimiento-juana", person: "Juana del Carmen Barroso Ruz", venue: "registro_civil_oficina",
    title: "Pedir la copia íntegra del nacimiento de Juana Barroso Ruz (29 sep 1910, Romeral)",
    ask: "«La copia íntegra de la inscripción de nacimiento de Juana del Carmen Barroso Ruz, nacida el 29 de septiembre de 1910 en Romeral, Curicó.»",
    ref: "Llevar carnet. Si no la encuentran, pedir que busquen en Curicó o en los libros de 1910 y 1911.",
    hope: "Nombre completo y edad de Germán Barroso y de María del Carmen Ruz, y su domicilio en 1910.",
  },
  {
    key: "rc-oficina-defuncion-maria-del-carmen", person: "Maria del Carmen Ruz Martínez", venue: "registro_civil_oficina",
    title: "Pedir la defunción de María del Carmen Ruz Martínez (31 ene 1987, Santiago)",
    ask: "«La copia de la inscripción de defunción de María del Carmen Ruz Martínez, fallecida el 31 de enero de 1987 en Santiago.»",
    ref: "Llevar carnet y, si se tiene, el RUN.", hope: "Su último domicilio, oficio y cónyuge declarado.",
  },

  // ── Familia ──────────────────────────────────────────────────────────────
  {
    key: "fam-llegada-santiago-maria-del-carmen", person: "Maria del Carmen Ruz Martínez", venue: "familia",
    title: "Preguntar cuándo llegó María del Carmen Ruz a Santiago y en qué casa trabajó",
    ask: "Dato conocido: llegó a trabajar como cocinera en una casa cerca del Parque Bustamante.",
    hope: "Año de llegada, nombre de la familia o dirección, y si ya vivía con Germán Barroso.",
  },
  {
    key: "fam-papeles-juana", person: "Juana del Carmen Barroso Ruz", venue: "familia",
    title: "Buscar los papeles de Juana: RUN, defunción, libreta de familia, posesión efectiva",
    ask: "Preguntar en la familia quién guarda los papeles de Juana y de Luis.",
    hope: "El RUN de Juana (para pedir sus certificados en línea) y datos de sus padres.",
  },
  {
    key: "fam-german-barroso", person: "Germán Barroso", venue: "familia",
    title: "Preguntar qué sabe la familia de Germán Barroso y su origen en San Juan, Argentina",
    ask: "Nombre completo, año de llegada a Chile, hermanos, a qué se dedicaba, dónde murió.",
    hope: "Pistas para buscar en registros de San Juan, Argentina.",
  },

  // ── Parroquia o Arzobispado ──────────────────────────────────────────────
  {
    key: "par-matrimonio-gregorio-dominga", person: "Gregorio Balcazar (Valcaza)", venue: "parroquia",
    title: "Buscar el matrimonio de Gregorio Balcázar y Dominga Bravo (anterior a 1829)",
    ask: "Consultar en la parroquia de Maipo y en el Archivo del Arzobispado de Santiago si hay libros de matrimonios de antes de 1829.",
    hope: "Fecha del matrimonio y los padres de Gregorio y de Dominga.",
  },

  // ── Cementerio ───────────────────────────────────────────────────────────
  {
    key: "cem-sepulturas-sin-fecha", person: "Pabla Araya Zuñiga", venue: "cementerio",
    title: "Pedir las sepulturas sin fecha de Isidoro, Pabla y Clorinda",
    ask: "Pedir el registro de sepultura en el Cementerio de Paine y en el cementerio parroquial de Buin.",
    ref: "Isidoro murió el 24 oct 1900; Pabla, el 22 ago 1909 en el Escorial; Clorinda, el 22 mar 1915 en Paine.",
    hope: "Fecha de sepultura y número de sitio.",
  },
];

async function main() {
  const dry = process.argv.includes("--dry");
  const pool = getPool();

  const { rows: trees } = await pool.query(`select id from trees order by created_at limit 1`);
  if (!trees[0]) throw new Error("No hay ningún árbol importado.");
  const treeId = trees[0].id as string;

  const { rows: existing } = await pool.query(
    `select seed_key from research_tasks where tree_id = $1 and seed_key is not null`,
    [treeId],
  );
  const have = new Set(existing.map((r) => r.seed_key as string));

  let created = 0;
  let skipped = 0;
  const missing: string[] = [];

  for (const s of SEEDS) {
    if (have.has(s.key)) { skipped++; continue; }

    let personId: string | null = null;
    if (s.person) {
      const { rows } = await pool.query(
        `select p.id from persons p join person_names n on n.person_id = p.id and n.is_primary
         where p.tree_id = $1 and n.display_name = $2`,
        [treeId, s.person],
      );
      if (rows.length === 1) personId = rows[0].id as string;
      else missing.push(`${s.person} (${rows.length} coincidencias) → «${s.title}»`);
    }

    console.log(`${dry ? "[dry] " : ""}+ ${s.title}`);
    if (!dry) {
      await pool.query(
        `insert into research_tasks (tree_id, person_id, question, hypothesis, status, venue, ask_text, reference, source_url, seed_key)
         values ($1, $2, $3, $4, 'open', $5, $6, $7, $8, $9)`,
        [treeId, personId, s.title, s.hope ?? null, s.venue, s.ask ?? null, s.ref ?? null, s.url ?? null, s.key],
      );
    }
    created++;
  }

  console.log(`\n${dry ? "Crearía" : "Creados"}: ${created} · ya estaban: ${skipped}`);
  if (missing.length) {
    console.log("\nSin persona vinculada (se crean igual, pero sin enlace a una ficha):");
    for (const m of missing) console.log(`  - ${m}`);
  }
  await pool.end();
}

main().catch((err) => {
  if ((err as { code?: string }).code === "42703") {
    console.error("Falta la migración 0009: corre primero `npm run db:migrate`.");
  } else {
    console.error(err);
  }
  process.exit(1);
});
