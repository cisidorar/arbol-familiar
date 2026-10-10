// Cómo se presenta cada hecho en la línea de tiempo de la ficha. Lógica pura
// (sin base de datos ni React) para poder probarla sola.

import type { EventForm } from "./edit";
import { formatDateText } from "./gedcom/dates";

export type TimelineSource = { title: string; url: string; quote: string | null };

export type TimelineEntry = {
  /** Año que se muestra grande a la izquierda; null = sin fecha ("s/f"). */
  year: number | null;
  /** Año final cuando el hecho abarca varios años: se muestra "1944 –1947". */
  yearEnd: number | null;
  /** Fecha aproximada: se muestra "c. 1910". */
  approx: boolean;
  /** Fecha ISO (aaaa-mm-dd) para ordenar; null = sin fecha. */
  sortKey: string | null;
  /** Fecha en palabras, solo cuando dice algo más que el año de la izquierda. */
  dateText: string | null;
  /** BIRT, DEAT, OCCU, EVEN, MARR, CHILD_BIRT, SPOUSE_DEAT... o RESEARCH. */
  kind: string;
  /** Etiqueta chica sobre el titular ("Trabajo", "Cargo público"); null si el titular ya es la categoría. */
  tag: string | null;
  /** Titular: la frase del hecho, o el nombre de la categoría si no hay frase. */
  title: string;
  place: string | null;
  description: string | null;
  age: number | null;
  person: { id: string; name: string } | null;
  sources: TimelineSource[];
  /** Personas relacionadas con el hecho (padrinos, testigos…): vinculadas al árbol o solo su nombre. */
  participants?: { id?: string; role: string; name: string; personId: string | null }[];
  /**
   * Solo los hechos que se pueden editar en la app, y cómo se cargan en el
   * formulario. `id` = hecho guardado en la base; `research` = hecho que
   * todavía vive en data/investigacion.json (pasa a la base al editarlo).
   */
  edit?: { id: string | null; research: string | null; form: EventForm } | null;
  /** Escrito o corregido en la app: el archivo de investigación no lo reemplaza. */
  manual?: boolean;
  /** Nacimiento de un hijo/a sin fecha propia: se le puede anotar una tentativa (solo en la ficha de los padres). */
  childApprox?: { childId: string; date: string } | null;
};

const EVENT_LABELS: Record<string, string> = {
  BIRT: "Nacimiento", DEAT: "Defunción", BURI: "Sepultura", BAPM: "Bautismo",
  RESI: "Residencia", OCCU: "Trabajo", EDUC: "Estudios", NATI: "Nacionalidad",
  EVEN: "Hecho",
  MARR: "Matrimonio", DIV: "Divorcio", ENGA: "Compromiso",
  // Códigos de GEDCOM que no son de los de arriba: en palabras, no como
  // "MARC con:" (MARS se importa como matrimonio; si quedara alguno, igual).
  MARS: "Matrimonio", MARC: "Contrato matrimonial", MARB: "Amonestaciones", MARL: "Licencia matrimonial",
  ANUL: "Anulación", CHR: "Bautizo", CREM: "Cremación", PROB: "Testamento", WILL: "Testamento",
  CENS: "Censo", IMMI: "Inmigración", EMIG: "Emigración", GRAD: "Graduación", RETI: "Jubilación",
  CONF: "Confirmación", FCOM: "Primera comunión",
};

// Los hechos "EVEN" de GEDCOM no tienen categoría propia: la trae su TYPE
// (p.ej. "Election"). Acá se traduce; si no lo conocemos, se muestra el TYPE
// tal como viene, que dice más que un "Hecho" genérico.
const EVEN_TYPE_LABELS: Record<string, string> = {
  Election: "Elección",
  "Alternate Birth": "Nacimiento (otra versión)",
  Separation: "Separación",
};

// En GEDCOM todo trabajo es "OCCU", pero un cargo de elección o designación
// política no es un oficio: se etiqueta aparte.
const PUBLIC_OFFICE =
  /(^|[^\p{L}])(regidor|regidora|alcalde|alcaldesa|concejal|concejala|diputado|diputada|senador|senadora|intendente|gobernador|gobernadora|subdelegado|subdelegada|ministro|ministra)([^\p{L}]|$)/iu;

// Hechos cuyo texto libre ES el hecho ("Regidor municipal de Curicó"), a
// diferencia de un nacimiento o una defunción, donde el texto es un detalle
// (la clínica, la causa) y el titular sigue siendo la categoría.
const NARRATED = new Set(["OCCU", "EDUC", "EVEN"]);

export function eventLabel(eventType: string, subtype: string | null, description?: string | null): string {
  if (eventType === "EVEN" && subtype) return EVEN_TYPE_LABELS[subtype] ?? subtype;
  if (eventType === "OCCU" && description && PUBLIC_OFFICE.test(description)) return "Cargo público";
  return EVENT_LABELS[eventType] ?? eventType;
}

/** Titular, etiqueta y detalle de un hecho que viene del GEDCOM. */
export function describeEvent(
  eventType: string,
  subtype: string | null,
  description: string | null,
): { title: string; tag: string | null; description: string | null } {
  const label = eventLabel(eventType, subtype, description);
  if (description && NARRATED.has(eventType)) {
    return { title: description, tag: label, description: null };
  }
  return { title: label, tag: null, description };
}

/** ¿El texto de fecha de GEDCOM dice "aproximadamente"? (ABT/EST/CAL) */
export function isApproxDate(rawText: string | null): boolean {
  return rawText != null && /^\s*(ABT|EST|CAL)\b/i.test(rawText);
}

/** Año final de un rango, solo si es posterior al inicial. */
export function rangeEnd(year: number | null, dateTo: string | null): number | null {
  if (year == null || !dateTo) return null;
  const end = Number(dateTo.slice(0, 4));
  return end > year ? end : null;
}

/**
 * Fecha en palabras para mostrar bajo el titular. Se omite cuando no agrega
 * nada a lo que ya se ve a la izquierda: el mismo año, "aprox." ese año (a la
 * izquierda ya dice "c. 1910") o el mismo rango de años ("1944 –1947").
 */
export function displayDateText(
  rawText: string | null,
  year: number | null,
  yearEnd: number | null = null,
): string | null {
  if (!rawText) return null;
  const formatted = formatDateText(rawText);
  if (year != null) {
    const shownAtLeft = [String(year), `aprox. ${year}`];
    if (yearEnd != null) shownAtLeft.push(`entre ${year} y ${yearEnd}`);
    if (shownAtLeft.includes(formatted)) return null;
  }
  return formatted;
}

const END_OF_LIFE: Record<string, number> = { DEAT: 1, BURI: 2 };

/**
 * Ordena la línea de tiempo: primero lo fechado, por fecha. Lo que no tiene
 * fecha va al final, pero nunca después de la muerte: un matrimonio sin fecha
 * se muestra antes de la defunción y la sepultura, y estas cierran la lista.
 */
export function sortTimeline(entries: TimelineEntry[]): TimelineEntry[] {
  const dated = entries
    .filter((e) => e.sortKey != null)
    .sort((a, b) => (a.sortKey! < b.sortKey! ? -1 : a.sortKey! > b.sortKey! ? 1 : 0));
  const undated = entries.filter((e) => e.sortKey == null);
  const undatedLife = undated.filter((e) => !(e.kind in END_OF_LIFE));
  const undatedDeath = undated.filter((e) => e.kind === "DEAT");
  const undatedBurial = undated.filter((e) => e.kind === "BURI");

  const firstEnd = dated.findIndex((e) => e.kind in END_OF_LIFE);
  const head = firstEnd === -1 ? dated : dated.slice(0, firstEnd);
  const tail = firstEnd === -1 ? [] : dated.slice(firstEnd);

  // Una defunción sin fecha igual va antes de la sepultura, tenga esta fecha o no.
  const burial = tail.findIndex((e) => e.kind === "BURI");
  const end =
    burial === -1
      ? [...tail, ...undatedDeath]
      : [...tail.slice(0, burial), ...undatedDeath, ...tail.slice(burial)];

  return [...head, ...undatedLife, ...end, ...undatedBurial];
}
