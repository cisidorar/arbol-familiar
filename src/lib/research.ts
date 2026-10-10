// Hechos investigados: lo que Cas va encontrando fuera de MyHeritage (prensa,
// actas, decretos) y quiere ver en la ficha, con el enlace a cada fuente.
// Viven en `data/investigacion.json`, no en la base: así sobreviven a cada
// reimportación del GEDCOM (que borra y vuelve a crear los hechos) y se ven
// apenas se guarda el archivo.
//
// Este módulo es lógica pura: leer/validar el archivo, entender las fechas
// escritas en español y mezclar los hechos con la línea de tiempo.

import { parseGedcomDate } from "./gedcom/dates";
import type { EventForm } from "./edit";
import { displayDateText, rangeEnd, type TimelineEntry, type TimelineSource } from "./timeline";

export type ResearchDate = {
  from: string | null; // ISO aaaa-mm-dd
  to: string | null;
  year: number | null;
  /** Año final, si el hecho abarca varios años. */
  yearEnd: number | null;
  approx: boolean;
  /** Fecha en palabras, o null si no agrega nada a los años. */
  text: string | null;
};

export type ReplaceRule = { kind: string; year: number | null };

export type ResearchFact = {
  /** Identifica el hecho dentro de su persona (sale de su contenido). */
  key: string;
  date: ResearchDate | null;
  /** La fecha tal como está escrita en el archivo. */
  rawDate: string | null;
  tag: string;
  text: string;
  place: string | null;
  /** UID de otra persona del árbol relacionada con el hecho. */
  withUid: string | null;
  /** Hechos del GEDCOM que este reemplaza en la ficha. */
  replaces: ReplaceRule[];
  sources: TimelineSource[];
};

export type ResearchPerson = { uid: string; name: string | null; facts: ResearchFact[] };

export type ResearchIndex = {
  /** Hechos por UID de persona, incluidos los "enAmbos" vistos desde la otra persona. */
  byUid: Map<string, ResearchFact[]>;
  /** Personas tal como están escritas en el archivo (sin los hechos espejados). */
  people: ResearchPerson[];
  problems: string[];
};

const MONTHS: Record<string, string> = {
  ene: "JAN", enero: "JAN", feb: "FEB", febrero: "FEB", mar: "MAR", marzo: "MAR",
  abr: "APR", abril: "APR", may: "MAY", mayo: "MAY", jun: "JUN", junio: "JUN",
  jul: "JUL", julio: "JUL", ago: "AUG", agosto: "AUG", sep: "SEP", sept: "SEP",
  septiembre: "SEP", setiembre: "SEP", oct: "OCT", octubre: "OCT", nov: "NOV",
  noviembre: "NOV", dic: "DEC", diciembre: "DEC",
};
const MONTH_CODES = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** "30 de julio de 1924" | "julio de 1924" | "1924" | "1924-07-30" → fecha simple de GEDCOM. */
function simpleToGedcom(s: string): string | null {
  const t = s.trim().toLowerCase().replace(/\./g, "");

  let m = /^(\d{3,4})$/.exec(t);
  if (m) return m[1];

  m = /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/.exec(t);
  if (m) {
    const month = MONTH_CODES[Number(m[2]) - 1];
    if (!month) return null;
    return m[3] ? `${Number(m[3])} ${month} ${m[1]}` : `${month} ${m[1]}`;
  }

  m = /^(?:(\d{1,2})\s+(?:de\s+)?)?([a-zñ]+)\s+(?:de\s+)?(\d{3,4})$/.exec(t);
  if (m) {
    const month = MONTHS[m[2]];
    if (!month) return null;
    return m[1] ? `${Number(m[1])} ${month} ${m[3]}` : `${month} ${m[3]}`;
  }

  return null;
}

/**
 * Entiende una fecha escrita como en una cronología en español: "1924",
 * "c. 1910", "1944-1947", "entre 1924 y 1930", "desde 1911", "1911 en
 * adelante", "antes de 1900", "después de 1900", "década de 1920",
 * "30 de julio de 1924". También acepta la sintaxis de GEDCOM ("ABT 1910").
 * Devuelve null si no la entiende.
 */
export function parseResearchDate(raw: string): ResearchDate | null {
  const d = interpretDate(raw);
  return d && { from: d.from, to: d.to, year: d.year, yearEnd: d.yearEnd, approx: d.approx, text: d.text };
}

/**
 * Lo mismo, pero para guardar en la base: devuelve la fecha en la sintaxis de
 * GEDCOM ("ABT 1910", "BET 1924 AND 1930", "5 MAY 1891"), que es como se
 * guardan todas las fechas de los hechos, más su rango interpretado.
 */
export function spanishDateToGedcom(raw: string): { text: string; from: string | null; to: string | null } | null {
  const d = interpretDate(raw);
  if (!d) return null;
  // "1944 aprox." llega como fecha simple con la marca de aproximada aparte.
  const simple = !/^(ABT|EST|CAL|BEF|AFT|BET|FROM)\b/.test(d.gedcom);
  return { text: d.approx && simple ? `ABT ${d.gedcom}` : d.gedcom, from: d.from, to: d.to };
}

function interpretDate(raw: string): (ResearchDate & { gedcom: string }) | null {
  let t = raw.trim().replace(/\s+/g, " ");
  if (!t) return null;

  let approx = false;
  const suffix = /\s+(aprox\.?|aproximadamente)$/i.exec(t);
  if (suffix) {
    approx = true;
    t = t.slice(0, suffix.index);
  }

  let gedcom: string | null = null;
  let text: string | null | undefined;
  let m: RegExpExecArray | null;

  if ((m = /^(?:d[eé]cada de(?: los)?|años) (\d{3})0$/i.exec(t))) {
    gedcom = `BET ${m[1]}0 AND ${m[1]}9`;
    text = `década de ${m[1]}0`;
  } else if ((m = /^(?:c\.|ca\.|circa|aprox\.?|hacia|alrededor de) ?(.+)$/i.exec(t))) {
    const d = simpleToGedcom(m[1]);
    if (d) {
      gedcom = `ABT ${d}`;
      approx = true;
    }
  } else if ((m = /^antes de (.+)$/i.exec(t))) {
    const d = simpleToGedcom(m[1]);
    if (d) gedcom = `BEF ${d}`;
  } else if ((m = /^despu[eé]s de (.+)$/i.exec(t))) {
    const d = simpleToGedcom(m[1]);
    if (d) gedcom = `AFT ${d}`;
  } else if ((m = /^(?:desde|a partir de) (.+)$/i.exec(t)) || (m = /^(.+) en adelante$/i.exec(t))) {
    const d = simpleToGedcom(m[1]);
    if (d) gedcom = `FROM ${d}`;
  } else if (
    (m = /^entre (.+) y (.+)$/i.exec(t)) ||
    (m = /^de (.+) a (.+)$/i.exec(t)) ||
    (m = /^(\d{3,4}) ?[-–—] ?(\d{3,4})$/.exec(t))
  ) {
    const a = simpleToGedcom(m[1]);
    const b = simpleToGedcom(m[2]);
    if (a && b) gedcom = `BET ${a} AND ${b}`;
  } else {
    gedcom = simpleToGedcom(t);
  }

  // Última opción: que ya venga escrita como en GEDCOM.
  const parsed = parseGedcomDate(gedcom ?? t);
  if (!parsed.from && !parsed.to) return null;
  gedcom ??= t;
  approx ||= /^(ABT|EST|CAL)\b/i.test(gedcom);

  const year = Number((parsed.from ?? parsed.to)!.slice(0, 4));
  const yearEnd = parsed.from ? rangeEnd(year, parsed.to) : null;
  if (text === undefined) text = displayDateText(gedcom, year, yearEnd);
  return { from: parsed.from, to: parsed.to, year, yearEnd, approx, text, gedcom: gedcom.toUpperCase() };
}

// Cómo se puede nombrar, en "reemplaza", el hecho del GEDCOM que se sustituye.
const KIND_ALIASES: Record<string, string> = {
  nacimiento: "BIRT", defuncion: "DEAT", fallecimiento: "DEAT", muerte: "DEAT",
  sepultura: "BURI", entierro: "BURI", bautismo: "BAPM", ocupacion: "OCCU", trabajo: "OCCU",
  cargo: "OCCU", educacion: "EDUC", estudios: "EDUC", residencia: "RESI",
  nacionalidad: "NATI", matrimonio: "MARR", divorcio: "DIV", compromiso: "ENGA",
  eleccion: "EVEN", hecho: "EVEN",
};

/** "Bautismo" → "BAPM": el tipo de hecho que nombra una etiqueta, si es uno conocido. */
export function kindForLabel(label: string): string | null {
  return KIND_ALIASES[unaccent(label).toLowerCase().trim()] ?? null;
}

/** Huella corta de un texto (no criptográfica): identifica un hecho por su contenido. */
function fingerprint(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b + c, 0x85ebca6b) ^ (b >>> 13);
  }
  return (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0");
}

function unaccent(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** "ocupación 1924" | "matrimonio" | "OCCU 1924" → regla de reemplazo. */
export function parseReplaceRule(raw: string): ReplaceRule | null {
  const m = /^(\S+)(?:\s+(\d{3,4}))?$/.exec(raw.trim());
  if (!m) return null;
  const word = unaccent(m[1]).toLowerCase();
  const kind = KIND_ALIASES[word] ?? (/^[a-z_]{3,5}$/.test(word) ? word.toUpperCase() : null);
  if (!kind) return null;
  return { kind, year: m[2] ? Number(m[2]) : null };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/** Nombre del sitio de un enlace web, o null si no es un enlace http(s) válido. */
export function hostLabel(url: string): string | null {
  if (!/^https?:\/\//i.test(url)) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function parseSources(raw: unknown, where: string, problems: string[]): TimelineSource[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) {
    problems.push(`${where}: "fuentes" debe ser una lista.`);
    return [];
  }
  const out: TimelineSource[] = [];
  raw.forEach((s, i) => {
    const item = typeof s === "string" ? { url: s } : s;
    const url = isRecord(item) ? str(item.url) : null;
    // Solo enlaces web: un "javascript:..." nunca debe llegar a un href.
    const host = url ? hostLabel(url) : null;
    if (!url || !host) {
      problems.push(`${where}, fuente ${i + 1}: falta una "url" que parta con http:// o https://.`);
      return;
    }
    const rec = item as Record<string, unknown>;
    out.push({ url, title: str(rec.titulo) ?? host, quote: str(rec.cita) });
  });
  return out;
}

/** Valida el contenido de `data/investigacion.json` y lo deja indexado por persona. */
export function parseResearch(data: unknown): ResearchIndex {
  const problems: string[] = [];
  const people: ResearchPerson[] = [];
  const byUid = new Map<string, ResearchFact[]>();
  const add = (uid: string, fact: ResearchFact) => byUid.set(uid, [...(byUid.get(uid) ?? []), fact]);

  const list = isRecord(data) ? data.personas : null;
  if (!Array.isArray(list)) {
    problems.push('El archivo debe tener la forma { "personas": [ ... ] }.');
    return { byUid, people, problems };
  }

  list.forEach((p, pi) => {
    const uid = isRecord(p) ? str(p.uid) : null;
    const who = (isRecord(p) && str(p.nombre)) || `persona ${pi + 1}`;
    if (!isRecord(p) || !uid) {
      problems.push(`${who}: falta el "uid" (el identificador de la persona en el árbol).`);
      return;
    }
    if (people.some((x) => x.uid === uid)) {
      problems.push(`${who}: el uid ${uid} aparece más de una vez; junta sus hechos en una sola entrada.`);
    }
    const person: ResearchPerson = { uid, name: str(p.nombre), facts: [] };
    people.push(person);

    const facts = p.hechos ?? [];
    if (!Array.isArray(facts)) {
      problems.push(`${who}: "hechos" debe ser una lista.`);
      return;
    }

    facts.forEach((f, fi) => {
      const where = `${who}, hecho ${fi + 1}`;
      const text = isRecord(f) ? str(f.texto) : null;
      if (!isRecord(f) || !text) {
        problems.push(`${where}: falta el "texto".`);
        return;
      }

      let date: ResearchDate | null = null;
      const rawDate = str(f.fecha);
      if (rawDate) {
        date = parseResearchDate(rawDate);
        if (!date) problems.push(`${where}: no entiendo la fecha "${rawDate}"; el hecho queda sin fecha.`);
      }

      const replaces: ReplaceRule[] = [];
      const rawRules = f.reemplaza == null ? [] : Array.isArray(f.reemplaza) ? f.reemplaza : [f.reemplaza];
      for (const r of rawRules) {
        const rule = typeof r === "string" ? parseReplaceRule(r) : null;
        if (rule) replaces.push(rule);
        else problems.push(`${where}: no entiendo "reemplaza": ${JSON.stringify(r)} (ej.: "ocupación 1924").`);
      }

      const withUid = str(f.con);
      const tag = str(f.etiqueta) ?? "Investigación";
      const place = str(f.lugar);
      const fact: ResearchFact = {
        key: fingerprint(JSON.stringify([tag, text, rawDate, place])),
        date,
        rawDate,
        tag,
        text,
        place,
        withUid,
        replaces,
        sources: parseSources(f.fuentes, where, problems),
      };
      person.facts.push(fact);
      add(uid, fact);

      if (f.enAmbos === true) {
        if (withUid) add(withUid, { ...fact, withUid: uid });
        else problems.push(`${where}: "enAmbos" necesita "con" (el uid de la otra persona).`);
      }
    });
  });

  return { byUid, people, problems };
}

function replaced(entry: TimelineEntry, fact: ResearchFact, withId: string | null): boolean {
  // Lo escrito o corregido en la app nunca se esconde: manda sobre el archivo.
  if (entry.manual) return false;
  return fact.replaces.some(
    (rule) =>
      entry.kind === rule.kind &&
      (rule.year == null || entry.year === rule.year) &&
      // Si el hecho nombra a otra persona, solo reemplaza lo compartido con ella
      // (p.ej. el matrimonio con ella y no uno con otra pareja).
      (withId == null || entry.person == null || entry.person.id === withId),
  );
}

/**
 * Mezcla los hechos investigados con la línea de tiempo que sale de la base:
 * quita los hechos del GEDCOM que cada uno reemplaza y agrega los nuevos.
 * No ordena; eso lo hace `sortTimeline`.
 */
export function applyResearch(
  entries: TimelineEntry[],
  facts: ResearchFact[],
  ctx: {
    birthYear: number | null;
    /** Persona del árbol por su UID de GEDCOM (para "con"). */
    personByUid: (uid: string) => { id: string; name: string } | null;
    /**
     * Hechos (por su `key`) que ya no se muestran desde el archivo: se
     * editaron o se borraron en la app. Siguen reemplazando lo que reemplazaban.
     */
    hidden?: ReadonlySet<string>;
    /** Cómo se carga un hecho en el formulario de edición; null = no se edita en la app. */
    editForm?: (fact: ResearchFact) => EventForm | null;
  },
): TimelineEntry[] {
  let out = entries;
  const added: TimelineEntry[] = [];

  for (const fact of facts) {
    const person = fact.withUid ? ctx.personByUid(fact.withUid) : null;
    out = out.filter((e) => !replaced(e, fact, person?.id ?? null));
    if (ctx.hidden?.has(fact.key)) continue;

    const year = fact.date?.year ?? null;
    const form = ctx.editForm?.(fact) ?? null;
    added.push({
      year,
      yearEnd: fact.date?.yearEnd ?? null,
      approx: fact.date?.approx ?? false,
      sortKey: fact.date ? (fact.date.from ?? fact.date.to) : null,
      dateText: fact.date?.text ?? null,
      kind: "RESEARCH",
      tag: fact.tag,
      title: fact.text,
      place: fact.place,
      description: null,
      age: ctx.birthYear != null && year != null && year >= ctx.birthYear ? year - ctx.birthYear : null,
      person,
      sources: fact.sources,
      edit: form && { id: null, research: fact.key, form },
    });
  }

  return [...out, ...added];
}
