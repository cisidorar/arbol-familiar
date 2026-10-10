// Cómo se cuenta, en palabras, un cambio del historial (tabla change_log).
// Lógica pura: recibe el antes y el después tal como se guardaron.

import { EDITABLE_EVENT_TYPES } from "./edit";
import { relationPhrase } from "./relatives";

export type Change = {
  entity: "person" | "event";
  action: "create" | "update" | "delete";
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};

const PERSON_FIELDS: [string, string][] = [
  ["given", "Nombres"],
  ["surnamePat", "Apellido paterno"],
  ["surnameMat", "Apellido materno"],
  ["sex", "Sexo"],
  ["isLiving", "Estado"],
  ["notes", "Notas"],
];

const EVENT_FIELDS: [string, string][] = [
  ["type", "Tipo"],
  ["subtype", "Nombre del hecho"],
  ["date", "Fecha"],
  ["place", "Lugar"],
  ["text", "Detalle"],
  ["sourceUrl", "Enlace de la fuente"],
  ["sourceTitle", "Fuente"],
  ["sourceQuote", "Cita"],
];

const SEX: Record<string, string> = { M: "Hombre", F: "Mujer", U: "Sin dato" };

function eventTypeLabel(snapshot: Record<string, unknown> | null): string {
  if (!snapshot) return "hecho";
  if (snapshot.type === "EVEN" && typeof snapshot.subtype === "string" && snapshot.subtype) return snapshot.subtype;
  return EDITABLE_EVENT_TYPES.find((t) => t.type === snapshot.type)?.label ?? "hecho";
}

function show(field: string, value: unknown): string {
  if (value == null || value === "") return "(vacío)";
  if (field === "sex") return SEX[String(value)] ?? String(value);
  if (field === "isLiving") return value ? "Viva / vivo" : "Fallecida/o";
  if (field === "type") return eventTypeLabel({ type: value });
  const text = String(value).replace(/\s+/g, " ");
  return text.length > 90 ? `${text.slice(0, 90)}…` : text;
}

function diff(fields: [string, string][], before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const [key, label] of fields) {
    const a = before[key] ?? "";
    const b = after[key] ?? "";
    if (a !== b) out.push(`${label}: ${show(key, a)} → ${show(key, b)}`);
  }
  return out;
}

function listValues(fields: [string, string][], snapshot: Record<string, unknown>): string[] {
  return fields
    .filter(([key]) => key !== "type" && key !== "subtype" && snapshot[key] != null && snapshot[key] !== "")
    .map(([key, label]) => `${label}: ${show(key, snapshot[key])}`);
}

/** Frase corta ("editó el bautismo") y el detalle campo por campo. */
export function describeChange(c: Change): { summary: string; details: string[] } {
  if (c.entity === "person" && c.action === "create") {
    // Una persona agregada desde la tarjeta de un familiar (el "+").
    const after = c.after ?? {};
    const relation = relationPhrase(after.relation, after.relatedTo);
    return {
      summary: "agregó al árbol a",
      details: [...(relation ? [relation] : []), ...listValues(PERSON_FIELDS, after)],
    };
  }
  if (c.entity === "person" && c.action === "delete") {
    return { summary: "eliminó del árbol a", details: listValues(PERSON_FIELDS, c.before ?? {}) };
  }
  if (c.entity === "person" && ("childBirthApprox" in (c.after ?? {}) || "childBirthApprox" in (c.before ?? {}))) {
    const a = c.after ?? {};
    const text = a.childBirthApprox ? `fecha tentativa: ${a.childBirthApprox}` : "quitó la fecha tentativa";
    return { summary: "anotó el nacimiento aproximado de un hijo o hija de", details: [`${a.child ?? "Hijo/a"} — ${text}`] };
  }
  if (c.entity === "person") {
    return { summary: "cambió los datos de", details: diff(PERSON_FIELDS, c.before ?? {}, c.after ?? {}) };
  }
  if (c.action === "create") {
    return { summary: `agregó «${eventTypeLabel(c.after)}» a`, details: listValues(EVENT_FIELDS, c.after ?? {}) };
  }
  if (c.action === "delete") {
    return { summary: `borró «${eventTypeLabel(c.before)}» de`, details: listValues(EVENT_FIELDS, c.before ?? {}) };
  }
  return {
    summary: `editó «${eventTypeLabel(c.after ?? c.before)}» de`,
    details: diff(EVENT_FIELDS, c.before ?? {}, c.after ?? {}),
  };
}
