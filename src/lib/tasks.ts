// Pendientes de investigación: lo que hay que pedir o mirar fuera de la app.
// Lógica pura (sin base de datos ni React) para probarla sola; la usan el
// formulario, el servidor y la vista para imprimir.

export const VENUES = [
  {
    key: "registro_civil_linea",
    label: "Registro Civil en línea",
    short: "Registro Civil en línea",
    help: "Certificados que se descargan en registrocivil.cl con RUN y Clave Única.",
  },
  {
    key: "registro_civil_oficina",
    label: "Registro Civil, en una oficina",
    short: "Oficina del Registro Civil",
    help: "Copia íntegra de una inscripción; sirve sin RUN, con tu carnet.",
  },
  {
    key: "familysearch_casa",
    label: "FamilySearch con tu cuenta",
    short: "FamilySearch en casa",
    help: "Abrir la imagen del acta desde la casa, con sesión iniciada.",
  },
  {
    key: "familysearch_centro",
    label: "Centro de FamilySearch",
    short: "Centro de FamilySearch",
    help: "Imágenes que desde la casa aparecen bloqueadas y solo se ven en un centro.",
  },
  { key: "familia", label: "Familia", short: "Familia", help: "Preguntar o buscar papeles en casa." },
  { key: "parroquia", label: "Parroquia o Arzobispado", short: "Parroquia", help: "Libros sacramentales que no están en línea." },
  { key: "cementerio", label: "Cementerio", short: "Cementerio", help: "Registro de sepultura." },
  { key: "otro", label: "Otro", short: "Otro", help: "" },
] as const;

export type Venue = (typeof VENUES)[number]["key"];
const VENUE_SET = new Set<string>(VENUES.map((v) => v.key));

export const STATUSES = [
  { key: "open", label: "Pendiente" },
  { key: "in_progress", label: "Pedido" },
  { key: "resolved", label: "Conseguido" },
  { key: "dropped", label: "No existe" },
] as const;

export type TaskStatus = (typeof STATUSES)[number]["key"];
const STATUS_SET = new Set<string>(STATUSES.map((s) => s.key));

export function venueLabel(key: string): string {
  return VENUES.find((v) => v.key === key)?.label ?? key;
}

export function statusLabel(key: string): string {
  return STATUSES.find((s) => s.key === key)?.label ?? key;
}

export type TaskValues = {
  personId: string | null;
  title: string;
  venue: Venue;
  status: TaskStatus;
  askText: string | null;
  reference: string | null;
  sourceUrl: string | null;
  hypothesis: string | null;
  result: string | null;
};

export type Task = TaskValues & {
  id: string;
  personName: string | null;
  createdAt: string;
  updatedAt: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function clean(raw: unknown, max: number): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim().replace(/\r\n/g, "\n");
  return t ? t.slice(0, max) : null;
}

export type TaskValidation =
  | { ok: true; value: TaskValues }
  | { ok: false; errors: Record<string, string> };

export function validateTask(input: unknown): TaskValidation {
  const o = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const errors: Record<string, string> = {};

  const title = clean(o.title, 200);
  if (!title) errors.title = "Escribe qué hay que averiguar.";

  const venue = typeof o.venue === "string" && VENUE_SET.has(o.venue) ? (o.venue as Venue) : null;
  if (!venue) errors.venue = "Elige dónde se hace.";

  const status: TaskStatus =
    typeof o.status === "string" && STATUS_SET.has(o.status) ? (o.status as TaskStatus) : "open";

  let personId: string | null = null;
  if (o.personId != null && o.personId !== "") {
    if (typeof o.personId === "string" && UUID.test(o.personId)) personId = o.personId;
    else errors.personId = "Elige la persona de la lista.";
  }

  let sourceUrl: string | null = null;
  const url = clean(o.sourceUrl, 2000);
  if (url) {
    if (/^https?:\/\/\S+$/i.test(url)) sourceUrl = url;
    else errors.sourceUrl = "El enlace debe partir con http:// o https://.";
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      personId,
      title: title!,
      venue: venue!,
      status,
      askText: clean(o.askText, 2000),
      reference: clean(o.reference, 2000),
      sourceUrl,
      hypothesis: clean(o.hypothesis, 2000),
      result: clean(o.result, 5000),
    },
  };
}

/** Los pendientes agrupados por dónde se hacen, en el orden de VENUES; las listas vacías no salen. */
export function groupByVenue<T extends { venue: string }>(tasks: T[]): { venue: Venue; label: string; help: string; tasks: T[] }[] {
  return VENUES.map((v) => ({
    venue: v.key,
    label: v.label,
    help: v.help,
    tasks: tasks.filter((t) => t.venue === v.key),
  })).filter((g) => g.tasks.length > 0);
}

/** Los que siguen abiertos (pendientes o pedidos) van antes; dentro de cada grupo, por fecha de creación. */
export function sortTasks<T extends { status: string; createdAt: string }>(tasks: T[]): T[] {
  const rank = (s: string) => (s === "open" ? 0 : s === "in_progress" ? 1 : 2);
  return [...tasks].sort((a, b) => rank(a.status) - rank(b.status) || a.createdAt.localeCompare(b.createdAt));
}

/** Cuántos quedan por hacer (pendientes + pedidos). */
export function openCount(tasks: { status: string }[]): number {
  return tasks.filter((t) => t.status === "open" || t.status === "in_progress").length;
}

/** Está cerrado: se consiguió o se confirmó que no existe. */
export function isClosed(status: string): boolean {
  return status === "resolved" || status === "dropped";
}

/** Sin tildes ni mayúsculas, para buscar. */
function fold(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export type TaskFilter = {
  /** "all" o la clave de un lugar. */
  venue: "all" | Venue;
  /** Texto libre: busca en el título, la persona y los detalles. */
  query: string;
  /** Incluye los conseguidos y los que no existen. */
  showClosed: boolean;
};

export function filterTasks<T extends Pick<Task, "venue" | "status" | "title" | "personName" | "askText" | "reference" | "hypothesis" | "result">>(
  tasks: T[],
  f: TaskFilter,
): T[] {
  const words = fold(f.query).split(/\s+/).filter(Boolean);
  return tasks.filter((t) => {
    if (f.venue !== "all" && t.venue !== f.venue) return false;
    if (!f.showClosed && isClosed(t.status)) return false;
    if (!words.length) return true;
    const hay = fold([t.title, t.personName, t.askText, t.reference, t.hypothesis, t.result].filter(Boolean).join(" "));
    return words.every((w) => hay.includes(w));
  });
}

/** Cuántos pendientes abiertos hay en cada lugar (para los contadores de los filtros). */
export function openByVenue(tasks: { venue: string; status: string }[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const t of tasks) if (!isClosed(t.status)) out.set(t.venue, (out.get(t.venue) ?? 0) + 1);
  return out;
}

/** Avance: cuántos están cerrados sobre el total. */
export function progress(tasks: { status: string }[]): { closed: number; total: number; percent: number } {
  const closed = tasks.filter((t) => isClosed(t.status)).length;
  return { closed, total: tasks.length, percent: tasks.length ? Math.round((closed / tasks.length) * 100) : 0 };
}
