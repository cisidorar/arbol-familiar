import type { ParsedDate } from "./types";

const MONTHS: Record<string, string> = {
  JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
  JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12",
};

/** Intenta leer "DD MON YYYY" | "MON YYYY" | "YYYY" y devuelve {iso, precision}. */
function parseSimpleDate(s: string): { iso: string; precision: "day" | "month" | "year" } | null {
  const t = s.trim().toUpperCase();

  let m = /^(\d{1,2})\s+([A-Z]{3})\s+(\d{3,4})$/.exec(t);
  if (m) {
    const [, d, mon, y] = m;
    const month = MONTHS[mon];
    if (!month) return null;
    return { iso: `${y.padStart(4, "0")}-${month}-${d.padStart(2, "0")}`, precision: "day" };
  }

  m = /^([A-Z]{3})\s+(\d{3,4})$/.exec(t);
  if (m) {
    const [, mon, y] = m;
    const month = MONTHS[mon];
    if (!month) return null;
    return { iso: `${y.padStart(4, "0")}-${month}-01`, precision: "month" };
  }

  m = /^(\d{3,4})$/.exec(t);
  if (m) {
    const [, y] = m;
    return { iso: `${y.padStart(4, "0")}-01-01`, precision: "year" };
  }

  // DD/MM/YYYY o DD/MM (sin año: no podemos anclar un rango, se deja sin interpretar)
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{3,4})$/.exec(t);
  if (m) {
    const [, d, mo, y] = m;
    return { iso: `${y.padStart(4, "0")}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`, precision: "day" };
  }

  return null;
}

function endOfPrecision(iso: string, precision: "day" | "month" | "year"): string {
  const [y, mo, d] = iso.split("-").map(Number);
  if (precision === "day") return iso;
  if (precision === "month") {
    const lastDay = new Date(y, mo, 0).getDate();
    return `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  }
  return `${String(y).padStart(4, "0")}-12-31`;
}

const MONTHS_ES: Record<string, string> = {
  JAN: "enero", FEB: "febrero", MAR: "marzo", APR: "abril", MAY: "mayo", JUN: "junio",
  JUL: "julio", AUG: "agosto", SEP: "septiembre", OCT: "octubre", NOV: "noviembre", DEC: "diciembre",
};

/** Igual que parseSimpleDate pero devuelve la frase en español en vez del ISO. */
function formatSimpleDate(s: string): string | null {
  const t = s.trim().toUpperCase();

  let m = /^(\d{1,2})\s+([A-Z]{3})\s+(\d{3,4})$/.exec(t);
  if (m) {
    const [, d, mon, y] = m;
    const month = MONTHS_ES[mon];
    if (!month) return null;
    return `${Number(d)} de ${month} de ${y}`;
  }

  m = /^([A-Z]{3})\s+(\d{3,4})$/.exec(t);
  if (m) {
    const [, mon, y] = m;
    const month = MONTHS_ES[mon];
    if (!month) return null;
    return `${month} de ${y}`;
  }

  m = /^(\d{3,4})$/.exec(t);
  if (m) return m[1];

  m = /^(\d{1,2})\/(\d{1,2})\/(\d{3,4})$/.exec(t);
  if (m) {
    const [, d, mo, y] = m;
    const monthNames = Object.values(MONTHS_ES);
    const month = monthNames[Number(mo) - 1];
    if (!month) return null;
    return `${Number(d)} de ${month} de ${y}`;
  }

  return null;
}

/**
 * Traduce el texto de fecha de GEDCOM (que guardamos tal como viene, en
 * inglés y con sus códigos: "BET 1924 AND 1930", "ABT 1950", "23 JUN 1887")
 * a una frase legible en español. Si no reconoce el formato, devuelve el
 * texto original tal cual en vez de inventarlo.
 */
export function formatDateText(raw: string): string {
  const text = raw.trim();
  const upper = text.toUpperCase();

  let m = /^(?:ABT|EST|CAL)\.?\s+(.+)$/.exec(upper);
  if (m) {
    const d = formatSimpleDate(m[1]);
    if (d) return `aprox. ${d}`;
  }

  m = /^BEF\.?\s+(.+)$/.exec(upper);
  if (m) {
    const d = formatSimpleDate(m[1]);
    if (d) return `antes de ${d}`;
  }

  m = /^AFT\.?\s+(.+)$/.exec(upper);
  if (m) {
    const d = formatSimpleDate(m[1]);
    if (d) return `después de ${d}`;
  }

  m = /^BET\.?\s+(.+)\s+AND\s+(.+)$/.exec(upper);
  if (m) {
    const from = formatSimpleDate(m[1]);
    const to = formatSimpleDate(m[2]);
    if (from && to) return `entre ${from} y ${to}`;
    if (from) return `desde ${from}`;
    if (to) return `hasta ${to}`;
  }

  m = /^FROM\s+(.+?)\s+TO\s+(.+)$/.exec(upper);
  if (m) {
    const from = formatSimpleDate(m[1]);
    const to = formatSimpleDate(m[2]);
    if (from && to) return `entre ${from} y ${to}`;
    if (from) return `desde ${from}`;
    if (to) return `hasta ${to}`;
  }

  m = /^FROM\s+(.+)$/.exec(upper);
  if (m) {
    const d = formatSimpleDate(m[1]);
    if (d) return `desde ${d}`;
  }

  const simple = formatSimpleDate(text);
  if (simple) return simple;

  return text;
}

/**
 * Interpreta una fecha GEDCOM tal como viene (incluye prefijos ABT/BEF/AFT/
 * BET..AND/FROM..TO). Siempre conserva el texto original; from/to quedan en
 * null cuando el formato no se reconoce (p.ej. "20/09" sin año).
 */
export function parseGedcomDate(raw: string): ParsedDate {
  const text = raw.trim();
  const upper = text.toUpperCase();

  let m = /^(?:ABT|EST|CAL)\.?\s+(.+)$/.exec(upper);
  if (m) {
    const d = parseSimpleDate(m[1]);
    if (d) return { text, from: d.iso, to: endOfPrecision(d.iso, d.precision) };
  }

  m = /^BEF\.?\s+(.+)$/.exec(upper);
  if (m) {
    const d = parseSimpleDate(m[1]);
    if (d) return { text, from: null, to: d.iso };
  }

  m = /^AFT\.?\s+(.+)$/.exec(upper);
  if (m) {
    const d = parseSimpleDate(m[1]);
    if (d) return { text, from: d.iso, to: null };
  }

  m = /^BET\.?\s+(.+)\s+AND\s+(.+)$/.exec(upper);
  if (m) {
    const from = parseSimpleDate(m[1]);
    const to = parseSimpleDate(m[2]);
    if (from || to) {
      return {
        text,
        from: from ? from.iso : null,
        to: to ? endOfPrecision(to.iso, to.precision) : null,
      };
    }
  }

  m = /^FROM\s+(.+?)\s+TO\s+(.+)$/.exec(upper);
  if (m) {
    const from = parseSimpleDate(m[1]);
    const to = parseSimpleDate(m[2]);
    if (from || to) {
      return {
        text,
        from: from ? from.iso : null,
        to: to ? endOfPrecision(to.iso, to.precision) : null,
      };
    }
  }

  m = /^FROM\s+(.+)$/.exec(upper);
  if (m) {
    const d = parseSimpleDate(m[1]);
    if (d) return { text, from: d.iso, to: null };
  }

  const simple = parseSimpleDate(upper);
  if (simple) {
    return { text, from: simple.iso, to: endOfPrecision(simple.iso, simple.precision) };
  }

  // No reconocida: se guarda el texto igual, sin rango.
  return { text, from: null, to: null };
}
