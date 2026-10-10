// Edición de una persona desde la app: qué se puede editar y cómo se valida
// lo que llega del formulario. Lógica pura (sin base de datos ni React) para
// poder probarla sola; la usan tanto el formulario como el servidor, que
// nunca confía en lo que validó el navegador.

import { formatDateText } from "./gedcom/dates";
import { hostLabel, kindForLabel, spanishDateToGedcom, type ResearchFact } from "./research";

/** Hechos que se pueden agregar o editar a mano, en el orden del selector. */
export const EDITABLE_EVENT_TYPES = [
  { type: "BIRT", label: "Nacimiento", textLabel: "Detalle", textHint: "Hospital, circunstancias…" },
  { type: "BAPM", label: "Bautismo", textLabel: "Detalle", textHint: "Padrinos, parroquia…" },
  { type: "DEAT", label: "Defunción", textLabel: "Causa o detalle", textHint: "" },
  { type: "BURI", label: "Sepultura", textLabel: "Detalle", textHint: "" },
  { type: "RESI", label: "Residencia", textLabel: "Detalle", textHint: "Dirección, con quién vivía…" },
  { type: "OCCU", label: "Trabajo u oficio", textLabel: "Qué hacía", textHint: "Zapatero, regidor municipal de Curicó…" },
  { type: "EDUC", label: "Estudios", textLabel: "Qué estudió", textHint: "" },
  { type: "NATI", label: "Nacionalidad", textLabel: "Nacionalidad", textHint: "" },
  { type: "EVEN", label: "Otro hecho", textLabel: "Qué pasó", textHint: "" },
  // Hechos de familia (de la pareja, no de una sola persona): se muestran y
  // editan igual desde la ficha de cualquiera de los dos. Al agregar uno
  // nuevo solo se ofrece el matrimonio, y pide elegir con quién (así queda
  // ligado a la familia); el divorcio y el compromiso solo se corrigen.
  { type: "MARR", label: "Matrimonio", textLabel: "Detalle", textHint: "Testigos, régimen matrimonial…" },
  { type: "DIV", label: "Divorcio", textLabel: "Detalle", textHint: "" },
  { type: "ENGA", label: "Compromiso", textLabel: "Detalle", textHint: "" },
] as const;

export type EditableEventType = (typeof EDITABLE_EVENT_TYPES)[number]["type"];

const EVENT_TYPE_SET = new Set<string>(EDITABLE_EVENT_TYPES.map((t) => t.type));

// Hechos que una persona tiene una sola vez: se ofrece editar el que hay en
// vez de agregar otro.
export const SINGLE_EVENT_TYPES = new Set<string>(["BIRT", "DEAT", "BURI"]);

/** Hechos de la familia (pareja), no de una persona sola: ver nota arriba. */
export const FAMILY_EVENT_TYPES = new Set<string>(["MARR", "DIV", "ENGA"]);

/** De los hechos de familia, los que se pueden agregar nuevos desde una ficha (eligiendo con quién). */
export const NEW_FAMILY_EVENT_TYPES = new Set<string>(["MARR"]);

/** Los datos de un hecho tal como se muestran en el formulario. */
/** Una persona relacionada con el hecho (padrino, testigo…): vinculada al árbol o no todavía. */
export type ParticipantForm = { role: string; name: string; personId: string | null };

export type EventForm = {
  type: string;
  /** Para "Otro hecho": su nombre ("Servicio militar"). */
  subtype: string;
  /** Fecha como la escribe una persona: "5 de mayo de 1891", "c. 1910", "1944-1947". */
  date: string;
  place: string;
  text: string;
  sourceTitle: string;
  sourceUrl: string;
  sourceQuote: string;
  participants: ParticipantForm[];
  /** Solo en un hecho de familia nuevo (matrimonio): con qué familia (pareja) se guarda. */
  familyId?: string;
};

export const EMPTY_EVENT_FORM: EventForm = {
  type: "BAPM", subtype: "", date: "", place: "", text: "", sourceTitle: "", sourceUrl: "", sourceQuote: "", participants: [],
};

/**
 * Un hecho de data/investigacion.json tal como se carga en el formulario.
 * Los que nombran a otra persona ("con") no se editan en la app: perderían
 * ese vínculo.
 */
export function researchFactForm(fact: ResearchFact): EventForm | null {
  if (fact.withUid) return null;
  const kind = kindForLabel(fact.tag);
  const type = kind && kind !== "EVEN" && EVENT_TYPE_SET.has(kind) ? kind : "EVEN";
  const source = fact.sources[0];
  return {
    type,
    subtype: type === "EVEN" ? fact.tag : "",
    date: fact.rawDate ?? "",
    place: fact.place ?? "",
    text: fact.text,
    sourceTitle: source?.title ?? "",
    sourceUrl: source?.url ?? "",
    sourceQuote: source?.quote ?? "",
    participants: [],
  };
}

export type EventValues = {
  type: EditableEventType;
  subtype: string | null;
  /** null = sin fecha. `keep` = no se tocó: se deja la que ya estaba guardada. */
  date: { text: string; from: string | null; to: string | null } | "keep" | null;
  place: string | null;
  description: string | null;
  source: { title: string; url: string; quote: string | null } | null;
  participants: { role: string; name: string; personId: string | null }[];
};

export type PersonForm = {
  given: string;
  surnamePat: string;
  surnameMat: string;
  sex: string;
  isLiving: boolean;
  notes: string;
};

export type PersonValues = {
  given: string | null;
  surnamePat: string | null;
  surnameMat: string | null;
  displayName: string;
  sex: "M" | "F" | "U";
  isLiving: boolean;
  notes: string | null;
};

export type Validation<T> = { ok: true; value: T } | { ok: false; errors: Record<string, string> };

function clean(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
}

/** Texto largo: conserva los saltos de línea. */
function cleanLong(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return t ? t.slice(0, max) : null;
}

export function buildDisplayName(given: string | null, surnamePat: string | null, surnameMat: string | null): string {
  return [given, surnamePat, surnameMat].filter(Boolean).join(" ");
}

export function validatePerson(input: unknown): Validation<PersonValues> {
  const o = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const errors: Record<string, string> = {};

  const given = clean(o.given, 120);
  const surnamePat = clean(o.surnamePat, 80);
  const surnameMat = clean(o.surnameMat, 80);
  const displayName = buildDisplayName(given, surnamePat, surnameMat);
  if (!displayName) errors.given = "Escribe al menos un nombre o un apellido.";

  const sex = o.sex === "M" || o.sex === "F" || o.sex === "U" ? o.sex : null;
  if (!sex) errors.sex = "Elige una opción.";

  if (typeof o.isLiving !== "boolean") errors.isLiving = "Indica si vive o falleció.";

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      given, surnamePat, surnameMat, displayName,
      sex: sex!,
      isLiving: o.isLiving as boolean,
      notes: cleanLong(o.notes, 5000),
    },
  };
}

/** La fecha guardada (sintaxis GEDCOM), como se muestra para editarla. */
export function dateForEditing(gedcomText: string | null): string {
  return gedcomText ? formatDateText(gedcomText) : "";
}

/**
 * Valida un hecho. `currentDate` es la fecha que el formulario mostraba al
 * abrirse (dateForEditing de la guardada): si no cambió, la guardada no se
 * toca, aunque sea una que no sabemos interpretar ("19/03", sin año).
 */
export function validateEvent(input: unknown, currentDate: string | null = null): Validation<EventValues> {
  const o = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const errors: Record<string, string> = {};

  const type = typeof o.type === "string" && EVENT_TYPE_SET.has(o.type) ? (o.type as EditableEventType) : null;
  if (!type) errors.type = "Elige qué tipo de hecho es.";

  const subtype = clean(o.subtype, 80);
  if (type === "EVEN" && !subtype) errors.subtype = "Ponle un nombre al hecho (por ejemplo, Servicio militar).";

  const rawDate = clean(o.date, 80);
  let date: EventValues["date"] = null;
  if (rawDate) {
    if (currentDate != null && rawDate === currentDate.trim()) {
      date = "keep";
    } else {
      const parsed = spanishDateToGedcom(rawDate);
      if (parsed) date = parsed;
      else errors.date = 'No entiendo esa fecha. Prueba "5 de mayo de 1891", "1891", "c. 1910" o "1944-1947".';
    }
  }

  const place = clean(o.place, 200);
  const description = cleanLong(o.text, 2000);
  if (type && !rawDate && !place && !description) {
    errors.text = "Completa al menos la fecha, el lugar o el detalle.";
  }

  const MAX_PARTICIPANTS = 20;
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let participants: EventValues["participants"] = [];
  if (o.participants != null) {
    if (!Array.isArray(o.participants) || o.participants.length > MAX_PARTICIPANTS) {
      errors.participants = "Revisa las personas relacionadas.";
    } else {
      participants = o.participants
        .map((raw) => {
          const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
          const role = clean(r.role, 60);
          const name = clean(r.name, 150);
          const personId = typeof r.personId === "string" && UUID_RE.test(r.personId) ? r.personId : null;
          if (!name) return null;
          return { role: role ?? "Relacionado/a", name, personId };
        })
        .filter((p): p is { role: string; name: string; personId: string | null } => p !== null);
    }
  }

  let source: EventValues["source"] = null;
  const url = clean(o.sourceUrl, 2000);
  const title = clean(o.sourceTitle, 300);
  const quote = cleanLong(o.sourceQuote, 1500);
  if (url) {
    const host = hostLabel(url);
    if (!host) errors.sourceUrl = "El enlace debe partir con http:// o https://.";
    else source = { url, title: title ?? host, quote };
  } else if (title || quote) {
    errors.sourceUrl = "Falta el enlace de la fuente.";
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: { type: type!, subtype: type === "EVEN" ? subtype : null, date, place, description, source, participants },
  };
}

/** Marca si la persona murió siendo niña/o, igual que la tarjeta del árbol. */
export const CHILD_DEATH_MAX_AGE = 12;

export function diedAsChild(
  birthYear: number | null,
  deathYear: number | null,
  approxAge: number | null = null,
): boolean {
  // Con las dos fechas, mandan las fechas; sin nacimiento conocido, vale la
  // edad aproximada anotada en la defunción.
  if (birthYear != null && deathYear != null) {
    const age = deathYear - birthYear;
    return age >= 0 && age < CHILD_DEATH_MAX_AGE;
  }
  if (birthYear == null && approxAge != null) return approxAge >= 0 && approxAge < CHILD_DEATH_MAX_AGE;
  return false;
}

// La edad aproximada al morir no tiene columna propia: es una línea dentro del
// detalle de la defunción, que el formulario escribe y mantiene. Se reconoce
// por su prefijo.
const APPROX_AGE_RE = /Edad aproximada al morir: (\d+) años/;
const APPROX_AGE_LINE_RE = /\n?Edad aproximada al morir: \d+ años[^\n]*\.?$/;

/** La edad anotada en el detalle de una defunción, o null si no hay. */
export function approxAgeAtDeath(text: string | null | undefined): number | null {
  const m = text ? APPROX_AGE_RE.exec(text) : null;
  return m ? Number(m[1]) : null;
}

/** El detalle con la línea de la edad puesta, cambiada o quitada (age null). */
export function withApproxAge(text: string, age: number | null, deathYear: number | null): string {
  const rest = text.replace(APPROX_AGE_LINE_RE, "").trimEnd();
  if (age == null) return rest;
  const note = deathYear
    ? `Edad aproximada al morir: ${age} años (nacería aprox. en ${deathYear - age}).`
    : `Edad aproximada al morir: ${age} años.`;
  return rest ? `${rest}\n${note}` : note;
}
