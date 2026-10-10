/**
 * Estandariza los lugares guardados en `places` (nacimientos, defunciones,
 * entierros, matrimonios, etc.): llena `normalized`, `locality`, `admin1` y
 * `country` a partir del texto original del GEDCOM (`raw_text`), sin tocarlo
 * ni fusionar filas. Es idempotente: se puede correr de nuevo después de
 * reimportar.
 *
 * Uso: npm run db:normalize-places
 *      npm run db:normalize-places -- --dry   (solo muestra qué haría)
 *
 * Los lugares demasiado ambiguos para adivinar (p. ej. "Cementerio general"
 * sin ciudad, o "San Pedro") quedan con normalized = una versión prolija del
 * texto pero SIN locality/admin1/country, y salen listados al final bajo
 * "Pendientes de revisar con Cas" para que ella los complete a mano
 * (actualizando el mapa de este archivo y corriendo de nuevo).
 */
import "dotenv/config";
import { Pool } from "pg";
import { COMUNAS, foreignCountry, resolveComuna } from "../src/lib/geo/places";
import { pgConfig } from "../src/lib/db/config";

type PlaceFix = {
  normalized: string;
  locality?: string;
  admin1?: string;
  country?: string;
  /** No se guarda en la base; solo para el reporte en consola. */
  review?: string;
};

// Mapa raw_text (tal cual sale en el GEDCOM) -> forma estandarizada.
// Claves en minúscula y sin espacios sobrantes para que "Cementerio general",
// "cementerio general" y "Cementerio general " caigan en la misma entrada.
const FIXES: Record<string, PlaceFix> = {
  // — Lugares nuevos del 9 oct 2026 —
  "agricultor": { normalized: "Agricultor", review: "es un oficio, no un lugar: conviene pasarlo al detalle del hecho" },
  "obrero agricultor": { normalized: "Obrero agricultor", review: "es un oficio, no un lugar: conviene pasarlo al detalle del hecho" },
  "cementerio buin": {
    normalized: "Cementerio de Buin, Chile",
    locality: "Buin", admin1: "Región Metropolitana", country: "Chile",
  },
  "cerca del parque bustamante, santiago": {
    normalized: "Cerca del Parque Bustamante, Providencia, Chile",
    locality: "Providencia", admin1: "Región Metropolitana", country: "Chile",
    review: "el Parque Bustamante está en Providencia — confirmar",
  },
  "clínica indisa, santiago, providencia": {
    normalized: "Clínica Indisa, Providencia, Chile",
    locality: "Providencia", admin1: "Región Metropolitana", country: "Chile",
  },
  "clínica madre hijo, santiago, santiago": {
    normalized: "Clínica Madre Hijo, Santiago, Chile",
    locality: "Santiago", admin1: "Región Metropolitana", country: "Chile",
  },
  "escorial hacienda": {
    normalized: "El Escorial, Paine, Chile",
    locality: "Paine", admin1: "Región Metropolitana", country: "Chile",
    review: "asumí el fundo El Escorial de Paine, igual que \"Escorial\" — confirmar",
  },
  "escorial, hacienda": {
    normalized: "El Escorial, Paine, Chile",
    locality: "Paine", admin1: "Región Metropolitana", country: "Chile",
    review: "asumí el fundo El Escorial de Paine, igual que \"Escorial\" — confirmar",
  },
  "hospital barros luco trudeau, santiago, san miguel": {
    normalized: "Hospital Barros Luco Trudeau, San Miguel, Chile",
    locality: "San Miguel", admin1: "Región Metropolitana", country: "Chile",
  },
  "ñuñoa, santiago, metropolitana de santiago, chile": {
    normalized: "Ñuñoa, Chile",
    locality: "Ñuñoa", admin1: "Región Metropolitana", country: "Chile",
  },
  "quillota uno, viña del mar, valparaíso, aconcagua, chile": {
    normalized: "Viña del Mar, Chile",
    locality: "Viña del Mar", admin1: "Valparaíso", country: "Chile",
    review: "\"Quillota Uno\" parece un resto de otro dato; el acta civil de Rosa Elvira Canelo (1896) es de Viña del Mar — confirmar",
  },
  "romeral, cúrico": {
    normalized: "Romeral, Curicó, Chile",
    locality: "Romeral", admin1: "Maule", country: "Chile",
  },
  "santa inés, peñaflor": {
    normalized: "Santa Inés, Peñaflor, Chile",
    locality: "Peñaflor", admin1: "Región Metropolitana", country: "Chile",
  },
  "argentina": { normalized: "Argentina", country: "Argentina" },
  "buin": { normalized: "Buin, Chile", locality: "Buin", admin1: "Región Metropolitana", country: "Chile" },
  "bóveda del carmen, curico": {
    normalized: "Bóveda del Carmen, Curicó, Chile",
    locality: "Curicó", admin1: "Maule", country: "Chile",
  },
  "calle de la placilla": {
    normalized: "Calle de la Placilla, San Esteban, Chile",
    locality: "San Esteban", admin1: "Valparaíso", country: "Chile",
    review: "comuna deducida: el acta civil de Pedro Zamora Galdamez (1901) es de San Esteban — confirmar",
  },
  "calle del colegio n.º 8, santiago": {
    normalized: "Calle del Colegio N.º 8, Santiago, Chile",
    locality: "Santiago", admin1: "Región Metropolitana", country: "Chile",
  },
  "cancha del llano": {
    normalized: "Cancha del Llano, San Esteban, Chile",
    locality: "San Esteban", admin1: "Valparaíso", country: "Chile",
    review: "comuna deducida: el acta civil de Regina/Rejina Zamora Galdamez (1893) es de San Esteban — confirmar",
  },
  "viña del mar, valparaíso, chile": {
    normalized: "Viña del Mar, Chile",
    locality: "Viña del Mar", admin1: "Valparaíso", country: "Chile",
  },
  "cementerio catolico santiago": {
    normalized: "Cementerio Católico, Santiago, Chile",
    locality: "Santiago", admin1: "Región Metropolitana", country: "Chile",
    review: "¿es el mismo lugar físico que \"Cementerio General de Santiago\" (cambió de nombre en 1883) o un cementerio distinto? Si es el mismo, dime y les pongo el mismo normalized.",
  },
  "cementerio general de santiago": {
    normalized: "Cementerio General, Santiago, Chile",
    locality: "Santiago", admin1: "Región Metropolitana", country: "Chile",
  },
  "cementerio metropolitano": {
    normalized: "Cementerio Metropolitano, Santiago, Chile",
    locality: "Santiago", admin1: "Región Metropolitana", country: "Chile",
    review: "asumí Santiago (La Pintana) por ser el más conocido con ese nombre — confirmar",
  },
  "cementerio municipal curico": {
    normalized: "Cementerio Municipal, Curicó, Chile",
    locality: "Curicó", admin1: "Maule", country: "Chile",
  },
  "cementerio de paine": {
    normalized: "Cementerio de Paine, Chile",
    locality: "Paine", admin1: "Región Metropolitana", country: "Chile",
  },
  "cementerio general": {
    normalized: "Cementerio General",
    review: "sin ciudad — ¿es el de Santiago, o el de otra comuna (Curicó, Buin)? Junta las filas \"Cementerio general\" y \"cementerio general\" (ya comparten esta entrada).",
  },
  "cementerio parroquian de buin": {
    normalized: "Cementerio Parroquial de Buin, Chile",
    locality: "Buin", admin1: "Región Metropolitana", country: "Chile",
    review: "¿es el mismo lugar que \"cementerio de buin\" (más abajo)? asumí que sí y les puse el mismo normalized — confirmar o separar",
  },
  "cementerio de buin": {
    // Mismo normalized que "Cementerio parroquian de Buin": en un pueblo como
    // Buin lo más probable es que sea el mismo único cementerio.
    normalized: "Cementerio Parroquial de Buin, Chile",
    locality: "Buin", admin1: "Región Metropolitana", country: "Chile",
    review: "ver nota en \"Cementerio parroquian de Buin\"",
  },
  "circunscripción portales, santiago": {
    normalized: "Circunscripción Portales, Santiago, Chile",
    locality: "Santiago", admin1: "Región Metropolitana", country: "Chile",
  },
  "clínica bupa": {
    normalized: "Clínica Bupa",
    review: "sin ciudad — ¿cuál sede?",
  },
  "colegio claretiano (santiago)": {
    normalized: "Colegio Claretiano, Santiago, Chile",
    locality: "Santiago", admin1: "Región Metropolitana", country: "Chile",
  },
  "concepcion": { normalized: "Concepción, Chile", locality: "Concepción", admin1: "Biobío", country: "Chile" },
  "concepcion, chile": { normalized: "Concepción, Chile", locality: "Concepción", admin1: "Biobío", country: "Chile" },
  "concepciã³n, chile": {
    // Mojibake: el GEDCOM/importador rompió el acento de "Concepción".
    normalized: "Concepción, Chile", locality: "Concepción", admin1: "Biobío", country: "Chile",
    review: "este venía con el acento roto (problema de codificación al leer el GEDCOM) — vale la pena revisar si hay más lugares con el mismo problema en el archivo original",
  },
  "concepción": { normalized: "Concepción, Chile", locality: "Concepción", admin1: "Biobío", country: "Chile" },
  "cremado": {
    normalized: "Cremado",
    review: "esto no es un lugar, es cómo se dispuso del cuerpo — probablemente no debería vivir en \"places\" sino como detalle del hecho de defunción/entierro. Lo dejo igual por ahora, no se toca solo.",
  },
  "culitrín": { normalized: "Culitrín, Paine, Chile", locality: "Paine", admin1: "Región Metropolitana", country: "Chile" },
  "curico": { normalized: "Curicó, Chile", locality: "Curicó", admin1: "Maule", country: "Chile" },
  "el almendral": {
    normalized: "El Almendral, Valparaíso, Chile",
    locality: "Valparaíso", admin1: "Valparaíso", country: "Chile",
    review: "asumí el barrio histórico de Valparaíso — confirmar",
  },
  "el almendral/cruz 158/patio 8": {
    normalized: "El Almendral, Valparaíso, Chile (cruz 158, patio 8)",
    locality: "Valparaíso", admin1: "Valparaíso", country: "Chile",
    review: "mismo lugar que \"El Almendral\" con el detalle de la tumba — confirmar",
  },
  "escorial": {
    normalized: "El Escorial, Paine, Chile",
    locality: "Paine", admin1: "Región Metropolitana", country: "Chile",
    review: "asumí el fundo El Escorial de Paine (quien murió ahí fue sepultada en el Cementerio de Paine) — confirmar",
  },
  "escuela basica nro. 56": { normalized: "Escuela Básica N.º 56", review: "sin ciudad asociada" },
  "escuela industrial anglochilena de electrotecnia 107": {
    normalized: "Escuela Industrial Anglo-Chilena de Electrotecnia N.º 107",
    review: "sin ciudad asociada (probablemente Santiago)",
  },
  "francia": { normalized: "Francia", country: "Francia" },
  "hacienda chada": {
    normalized: "Hacienda Chada, Paine, Chile",
    locality: "Paine", admin1: "Región Metropolitana", country: "Chile",
  },
  "hospital el pino, san bernardo": {
    normalized: "Hospital El Pino, San Bernardo, Chile",
    locality: "San Bernardo", admin1: "Región Metropolitana", country: "Chile",
  },
  "hospital moneda, santiago": {
    normalized: "Hospital Moneda, Santiago, Chile",
    locality: "Santiago", admin1: "Región Metropolitana", country: "Chile",
  },
  "iglesia parroquial de san josé, curicó": {
    normalized: "Iglesia Parroquial de San José, Curicó, Chile",
    locality: "Curicó", admin1: "Maule", country: "Chile",
  },
  "inmaculada concepción, maipo, buin, maipo, chile": {
    normalized: "Iglesia Inmaculada Concepción, Buin, Chile",
    locality: "Buin", admin1: "Región Metropolitana", country: "Chile",
  },
  "la cisterna": { normalized: "La Cisterna, Santiago, Chile", locality: "La Cisterna", admin1: "Región Metropolitana", country: "Chile" },
  "las condes": { normalized: "Las Condes, Santiago, Chile", locality: "Las Condes", admin1: "Región Metropolitana", country: "Chile" },
  "los andes": { normalized: "Los Andes, Chile", locality: "Los Andes", admin1: "Valparaíso", country: "Chile" },
  "maule, curicó, curicó": {
    normalized: "Maule, Curicó, Chile",
    locality: "Curicó", admin1: "Maule", country: "Chile",
    review: "el GEDCOM repite \"Curicó\" dos veces — probablemente un error de tipeo al exportar",
  },
  "newcastle upon tyne, england": {
    normalized: "Newcastle upon Tyne, Inglaterra, Reino Unido",
    locality: "Newcastle upon Tyne", admin1: "England", country: "Reino Unido",
  },
  "paine, maipo": { normalized: "Paine, Chile", locality: "Paine", admin1: "Región Metropolitana", country: "Chile" },
  "parque santiago, santiago": {
    normalized: "Parque Santiago, Santiago, Chile",
    locality: "Santiago", admin1: "Región Metropolitana", country: "Chile",
    review: "¿es el cementerio \"Parque del Recuerdo\" u otro con ese nombre? confirmar nombre exacto",
  },
  "parque del recuerdo": {
    normalized: "Parque del Recuerdo, Chile",
    country: "Chile",
    review: "la cadena Parque del Recuerdo tiene varias sedes — ¿cuál?",
  },
  "parroquial de buin": {
    normalized: "Parroquia de Buin, Chile",
    locality: "Buin", admin1: "Región Metropolitana", country: "Chile",
    review: "¿es la iglesia (para un bautismo/matrimonio) o el mismo cementerio que \"Cementerio parroquian de Buin\"? lo dejé como parroquia/iglesia — confirmar",
  },
  "peñalolen": { normalized: "Peñalolén, Santiago, Chile", locality: "Peñalolén", admin1: "Región Metropolitana", country: "Chile" },
  "potrero grande": { normalized: "Potrero Grande", review: "hay varios lugares con este nombre en Chile — ¿cuál?" },
  "providencia": { normalized: "Providencia, Santiago, Chile", locality: "Providencia", admin1: "Región Metropolitana", country: "Chile" },
  "quillota uno": { normalized: "Quillota", review: "\"Uno\" al final parece un resto de otro dato pegado — confirmar" },
  "romeral, curicó": { normalized: "Romeral, Curicó, Chile", locality: "Romeral", admin1: "Maule", country: "Chile" },
  "san carlos": { normalized: "San Carlos", review: "¿San Carlos (Ñuble) o San Carlos de Apoquindo (Santiago)?" },
  "san esteban, aconcagua, chile": {
    normalized: "San Esteban, Los Andes, Chile",
    locality: "San Esteban", admin1: "Valparaíso", country: "Chile",
  },
  "san fernando": { normalized: "San Fernando, Chile", locality: "San Fernando", admin1: "O'Higgins", country: "Chile" },
  "san juan, argentina": { normalized: "San Juan, Argentina", locality: "San Juan", country: "Argentina" },
  "san pedro": { normalized: "San Pedro", review: "hay varios San Pedro en Chile — ¿cuál?" },
  "santa maria": { normalized: "Santa María, Chile", locality: "Santa María", admin1: "Valparaíso", country: "Chile" },
  "santiago": { normalized: "Santiago, Chile", locality: "Santiago", admin1: "Región Metropolitana", country: "Chile" },
  "santiago, chile": { normalized: "Santiago, Chile", locality: "Santiago", admin1: "Región Metropolitana", country: "Chile" },
  "talcahuano": { normalized: "Talcahuano, Chile", locality: "Talcahuano", admin1: "Biobío", country: "Chile" },
  "temuco": { normalized: "Temuco, Chile", locality: "Temuco", admin1: "Araucanía", country: "Chile" },
  "universidad nacional andrés bello": {
    normalized: "Universidad Andrés Bello, Santiago, Chile",
    locality: "Santiago", admin1: "Región Metropolitana", country: "Chile",
    review: "\"Nacional\" no corresponde al nombre real de la universidad — revisado el texto, no el dato",
  },
  "universidad de santiago (ex ut)": {
    normalized: "Universidad de Santiago de Chile",
    locality: "Santiago", admin1: "Región Metropolitana", country: "Chile",
  },
  "universidad de santiago de chile": {
    normalized: "Universidad de Santiago de Chile",
    locality: "Santiago", admin1: "Región Metropolitana", country: "Chile",
  },
  "valdivia": { normalized: "Valdivia, Chile", locality: "Valdivia", admin1: "Los Ríos", country: "Chile" },
  "villarrica": { normalized: "Villarrica, Chile", locality: "Villarrica", admin1: "Araucanía", country: "Chile" },
  "calles freire, vidal, carmen y yungay": {
    normalized: "Cuadrante Freire–Vidal–Carmen–Yungay, Curicó, Chile",
    locality: "Curicó", admin1: "Maule", country: "Chile",
    review: "asumí Curicó por el decreto mencionado en el plan del proyecto — confirmar",
  },
  "independencia": {
    normalized: "Independencia, Santiago, Chile",
    locality: "Independencia", admin1: "Región Metropolitana", country: "Chile",
  },
  // Lugares agregados con la carga de la investigación de la rama de María Teresa (oct 2026).
  "parroquia santos ángeles custodios, buin": { normalized: "Parroquia Santos Ángeles Custodios, Buin, Chile", locality: "Buin", admin1: "Región Metropolitana", country: "Chile" },
  "independencia, santiago": { normalized: "Independencia, Santiago, Chile", locality: "Independencia", admin1: "Región Metropolitana", country: "Chile" },
  "nuestra señora de la estampa, independencia, santiago": { normalized: "Parroquia Nuestra Señora de la Estampa, Independencia, Santiago, Chile", locality: "Independencia", admin1: "Región Metropolitana", country: "Chile" },
  "parroquia santa ana, santiago": { normalized: "Parroquia Santa Ana, Santiago, Chile", locality: "Santiago", admin1: "Región Metropolitana", country: "Chile" },
  "recoleta, santiago": { normalized: "Recoleta, Santiago, Chile", locality: "Santiago", admin1: "Región Metropolitana", country: "Chile" },
  "san bernardo": { normalized: "San Bernardo, Chile", locality: "San Bernardo", admin1: "Región Metropolitana", country: "Chile" },
  "maipo": { normalized: "Maipo, Buin, Chile", locality: "Buin", admin1: "Región Metropolitana", country: "Chile" },
  "pirque": { normalized: "Pirque, Chile", locality: "Pirque", admin1: "Región Metropolitana", country: "Chile" },
  "colina": { normalized: "Colina, Chile", locality: "Colina", admin1: "Región Metropolitana", country: "Chile" },
  "paine": { normalized: "Paine, Chile", locality: "Paine", admin1: "Región Metropolitana", country: "Chile" },
  "duao": { normalized: "Duao, Maule, Chile", locality: "Duao", admin1: "Maule", country: "Chile", review: "hay más de un Duao en el Maule; el bautismo de Ana Luisa Ruz (1901) no dice cuál — confirmar" },
};

// Este texto largo no es un lugar — es una nota que quedó pegada en el campo
// PLAC de un hecho por error de captura. Se detecta por longitud, no se
// intenta "normalizar" como si fuera un lugar.
const NOT_A_PLACE_MIN_LENGTH = 80;

async function main() {
  const dry = process.argv.includes("--dry");
  const pool = new Pool(pgConfig());

  const { rows: places } = await pool.query<{ id: string; raw_text: string }>(
    `select id, raw_text from places order by raw_text`,
  );

  let updated = 0;
  const reviewLines: string[] = [];
  const unmapped: string[] = [];

  for (const place of places) {
    const key = place.raw_text.trim().toLowerCase();

    if (place.raw_text.trim().length >= NOT_A_PLACE_MIN_LENGTH) {
      reviewLines.push(`- "${place.raw_text.slice(0, 60)}…" → esto parece ser una NOTA, no un lugar. No se tocó.`);
      continue;
    }

    const fix = FIXES[key];
    if (!fix) {
      // Lugar nuevo que no está en la lista: si el texto nombra una comuna sin ambigüedad
      // ("Santa María, San Felipe, Aconcagua, Chile"), se asigna sola para que salga en el mapa.
      const auto = foreignCountry({ rawText: place.raw_text }) ? null : resolveComuna({ rawText: place.raw_text });
      if (!auto) { unmapped.push(place.raw_text); continue; }
      const nombre = COMUNAS.find((c) => c[0] === auto.code)?.[1] ?? null;
      if (!dry) {
        await pool.query(
          `update places set normalized = coalesce(normalized, raw_text), locality = $2, country = 'Chile',
                            comuna_code = $3, region_code = $4 where id = $1`,
          [place.id, nombre, auto.code, auto.regionCode],
        );
      }
      updated++;
      reviewLines.push(`- "${place.raw_text}" → comuna ${nombre} (asignada sola por el nombre; revisa que sea la correcta).`);
      continue;
    }

    // Código oficial de la comuna (para el mapa de orígenes); solo para lugares de Chile.
    const comuna = fix.country === "Chile" ? resolveComuna({ locality: fix.locality, admin1: fix.admin1 }) : null;

    if (!dry) {
      await pool.query(
        `update places set normalized = $2, locality = $3, admin1 = $4, country = $5,
                          comuna_code = $6, region_code = $7 where id = $1`,
        [place.id, fix.normalized, fix.locality ?? null, fix.admin1 ?? null, fix.country ?? null,
         comuna?.code ?? null, comuna?.regionCode ?? null],
      );
    }
    updated++;
    if (fix.country === "Chile" && fix.locality && !comuna) {
      reviewLines.push(`- "${place.raw_text}": no encontré la comuna "${fix.locality}" en el listado oficial; no saldrá en el mapa.`);
    }
    if (fix.review) {
      reviewLines.push(`- "${place.raw_text}" → "${fix.normalized}": ${fix.review}`);
    }
  }

  console.log(`${dry ? "[dry-run] " : ""}${updated} lugares estandarizados de ${places.length}.`);

  if (unmapped.length) {
    console.log(`\n${unmapped.length} lugares nuevos sin mapa (no estaban en la lista original de 69 — probablemente un GEDCOM reimportado con datos nuevos):`);
    for (const u of unmapped) console.log(`  - "${u}"`);
  }

  if (reviewLines.length) {
    console.log(`\nPendientes de revisar con Cas (quedaron con un texto prolijo pero sin confirmar ciudad/lugar exacto):`);
    for (const line of reviewLines) console.log(`  ${line}`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
