"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import PersonPicker, { type PersonRef } from "./PersonPicker";
import {
  filterTasks,
  groupByVenue,
  isClosed,
  openByVenue,
  progress,
  sortTasks,
  STATUSES,
  statusLabel,
  VENUES,
  type Task,
  type TaskFilter,
  type TaskStatus,
  type Venue,
} from "@/lib/tasks";

type Draft = {
  id: string | null;
  title: string;
  venue: Venue;
  status: TaskStatus;
  person: PersonRef | null;
  askText: string;
  reference: string;
  sourceUrl: string;
  hypothesis: string;
  result: string;
};

const EMPTY: Draft = {
  id: null, title: "", venue: "registro_civil_oficina", status: "open", person: null,
  askText: "", reference: "", sourceUrl: "", hypothesis: "", result: "",
};

function draftOf(t: Task): Draft {
  return {
    id: t.id, title: t.title, venue: t.venue, status: t.status,
    person: t.personId ? { id: t.personId, name: t.personName ?? "(sin nombre)" } : null,
    askText: t.askText ?? "", reference: t.reference ?? "", sourceUrl: t.sourceUrl ?? "",
    hypothesis: t.hypothesis ?? "", result: t.result ?? "",
  };
}

/** Lo que se manda a la API para guardar un pendiente (con el estado o el resultado cambiados). */
function bodyOf(t: Task, change: Partial<Pick<Task, "status" | "result">> = {}) {
  return {
    title: t.title, venue: t.venue, status: t.status, personId: t.personId, askText: t.askText,
    reference: t.reference, sourceUrl: t.sourceUrl, hypothesis: t.hypothesis, result: t.result, ...change,
  };
}

type Change = Partial<Pick<Task, "status" | "result">>;

const field =
  "w-full rounded-lg border border-[#cfc8b8] bg-white px-3 py-2 text-sm text-[#1f1d1a] placeholder:text-[#9a9486] focus:border-[#1a1917] focus:outline-none";
const fieldLabel = "mb-1 block text-xs font-semibold uppercase tracking-wide text-[#6b6558]";
const ghostButton =
  "rounded-lg border border-[#cfc8b8] bg-white px-3.5 py-2 text-sm font-medium text-[#1f1d1a] hover:bg-[#f1ede2]";
const primaryButton =
  "rounded-lg bg-[#1a1917] px-3.5 py-2 text-sm font-semibold text-[#f5f2ea] hover:bg-black disabled:opacity-60";
const eyebrow = "text-xs font-semibold uppercase tracking-wide text-[#6b6558]";

/** Color de cada estado: en la etiqueta de la tarjeta y en el botón elegido. */
const STATUS_STYLE: Record<TaskStatus, { pill: string; dot: string }> = {
  open: { pill: "bg-[#ece7da] text-[#4f4a3f]", dot: "bg-[#a39c8b]" },
  in_progress: { pill: "bg-amber-100 text-amber-900", dot: "bg-amber-500" },
  resolved: { pill: "bg-emerald-100 text-emerald-900", dot: "bg-emerald-600" },
  dropped: { pill: "bg-slate-200 text-slate-700", dot: "bg-slate-500" },
};

function StatusPill({ status, className = "" }: { status: TaskStatus; className?: string }) {
  const style = STATUS_STYLE[status];
  return (
    <span className={`items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${style.pill} ${className}`}>
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {statusLabel(status)}
    </span>
  );
}

function TaskForm({
  initial, onCancel, onSaved,
}: { initial: Draft; onCancel: () => void; onSaved: (t: Task, isNew: boolean) => void }) {
  const [d, setD] = useState<Draft>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const ref = useRef<HTMLFormElement>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const venue = VENUES.find((v) => v.key === d.venue);

  // El formulario puede abrirse fuera de la vista (desde el botón flotante o el panel de detalle).
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError(null); setErrors({});
    const body = {
      title: d.title, venue: d.venue, status: d.status, personId: d.person?.id ?? null,
      askText: d.askText, reference: d.reference, sourceUrl: d.sourceUrl, hypothesis: d.hypothesis, result: d.result,
    };
    try {
      const res = await fetch(d.id ? `/api/tasks/${d.id}` : "/api/tasks", {
        method: d.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "No se pudo guardar."); setErrors(json.errors ?? {}); return; }
      onSaved(json.task as Task, !d.id);
    } catch {
      setError("No se pudo guardar. Revisa la conexión.");
    } finally {
      setSaving(false);
    }
  };

  const err = (k: string) => errors[k] && <p className="mt-1 text-xs text-red-700">{errors[k]}</p>;

  return (
    <form ref={ref} onSubmit={save} className="space-y-4 rounded-2xl border-2 border-[#1a1917] bg-white p-4 shadow-sm sm:p-5 print:hidden">
      <p className="text-base font-semibold text-[#1f1d1a]">{d.id ? "Editar pendiente" : "Nuevo pendiente"}</p>
      <div>
        <label className={fieldLabel} htmlFor="t-title">Qué hay que averiguar</label>
        <input id="t-title" autoFocus className={field} value={d.title} onChange={(e) => set("title", e.target.value)} placeholder="Ej.: Pedir la defunción de Germán Barroso" />
        {err("title")}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={fieldLabel} htmlFor="t-venue">Dónde se hace</label>
          <select id="t-venue" className={field} value={d.venue} onChange={(e) => set("venue", e.target.value as Venue)}>
            {VENUES.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
          </select>
          {venue?.help && <p className="mt-1 text-xs text-[#6b6558]">{venue.help}</p>}
          {err("venue")}
        </div>
        <div>
          <span className={fieldLabel}>De quién es (opcional)</span>
          <PersonPicker value={d.person} onChange={(p) => set("person", p)} />
          {err("personId")}
        </div>
      </div>
      <div>
        <label className={fieldLabel} htmlFor="t-ask">Qué pedir</label>
        <textarea id="t-ask" rows={2} className={field} value={d.askText} onChange={(e) => set("askText", e.target.value)} placeholder="El texto tal como lo dirías o mostrarías en la ventanilla" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={fieldLabel} htmlFor="t-ref">Datos para pedirlo</label>
          <textarea id="t-ref" rows={2} className={field} value={d.reference} onChange={(e) => set("reference", e.target.value)} placeholder="Nombre completo, fecha, circunscripción, nº de inscripción…" />
        </div>
        <div>
          <label className={fieldLabel} htmlFor="t-hyp">Qué espero saber</label>
          <textarea id="t-hyp" rows={2} className={field} value={d.hypothesis} onChange={(e) => set("hypothesis", e.target.value)} />
        </div>
      </div>
      <div>
        <label className={fieldLabel} htmlFor="t-url">Enlace del registro (opcional)</label>
        <input id="t-url" className={field} value={d.sourceUrl} onChange={(e) => set("sourceUrl", e.target.value)} placeholder="https://www.familysearch.org/ark:/…" />
        {err("sourceUrl")}
      </div>
      {error && <p role="alert" className="text-sm font-medium text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className={primaryButton}>{saving ? "Guardando…" : "Guardar"}</button>
        <button type="button" onClick={onCancel} className={ghostButton}>Cancelar</button>
      </div>
    </form>
  );
}

/** Una fila de detalle: etiqueta arriba (o a la izquierda en la lista ancha) y el texto. */
function Detail({ label, stacked, children }: { label: string; stacked: boolean; children: React.ReactNode }) {
  return (
    <div className={stacked ? "space-y-1" : "grid gap-x-4 gap-y-1 sm:grid-cols-[7.5rem_1fr]"}>
      <dt className={`${eyebrow} pt-0.5 text-[#8a8475]`}>{label}</dt>
      <dd className="whitespace-pre-line text-sm leading-relaxed text-[#2b2823]">{children}</dd>
    </div>
  );
}

/**
 * Lo que hay que pedir, el estado y la nota de un pendiente. Se usa dentro de la
 * tarjeta (teléfono y pantallas medianas) y en el panel de la derecha (pantallas anchas).
 */
function TaskDetails({ task, canEdit, stacked, onSave, onEdit, onDelete }: {
  task: Task;
  canEdit: boolean;
  /** Etiquetas arriba del texto (panel angosto) en vez de a la izquierda. */
  stacked: boolean;
  onSave: (change: Change) => Promise<boolean>;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [result, setResult] = useState(task.result ?? "");
  const [copied, setCopied] = useState(false);
  const [savedNote, setSavedNote] = useState(false);
  const resultChanged = result.trim() !== (task.result ?? "").trim();

  const copy = async () => {
    if (!task.askText) return;
    try {
      await navigator.clipboard.writeText(task.askText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* sin permiso para el portapapeles: el texto igual se puede seleccionar a mano */
    }
  };

  return (
    <>
      <dl className="space-y-3.5">
        {task.askText && (
          <Detail label="Qué pedir" stacked={stacked}>
            <span className="block rounded-lg border border-[#e2dccd] bg-white px-3 py-2">{task.askText}</span>
            <button type="button" onClick={copy} className="mt-1.5 rounded-md py-1 text-xs font-medium text-[#6b6558] underline underline-offset-2 hover:text-[#1f1d1a] print:hidden">
              {copied ? "Copiado" : "Copiar texto"}
            </button>
          </Detail>
        )}
        {task.reference && <Detail label="Datos" stacked={stacked}>{task.reference}</Detail>}
        {task.hypothesis && <Detail label="Espero saber" stacked={stacked}>{task.hypothesis}</Detail>}
        {task.sourceUrl && (
          <Detail label="Registro" stacked={stacked}>
            <a href={task.sourceUrl} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1 rounded-lg border border-[#cfc8b8] bg-white px-3 py-2 text-sm font-medium text-[#1f1d1a] hover:bg-[#f1ede2] sm:inline-flex print:hidden">
              Abrir el registro <span aria-hidden="true">↗</span>
            </a>
            <span className="hidden break-all text-xs print:block">{task.sourceUrl}</span>
          </Detail>
        )}
        {!task.askText && !task.reference && !task.hypothesis && !task.sourceUrl && (
          <p className="text-sm text-[#6b6558]">Sin más detalles.{canEdit ? " Puedes agregarlos con «Editar»." : ""}</p>
        )}

        {canEdit && (
          <div className="print:hidden">
            <Detail label="Estado" stacked={stacked}>
              {/* En el teléfono, cuatro botones grandes de dos en dos. */}
              <span className="grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap">
                {STATUSES.map((s) => {
                  const on = s.key === task.status;
                  return (
                    <button
                      key={s.key}
                      type="button"
                      aria-pressed={on}
                      onClick={() => !on && onSave({ status: s.key })}
                      className={`rounded-full border px-3 py-2 text-sm font-medium sm:py-1 sm:text-xs ${
                        on ? `border-transparent ${STATUS_STYLE[s.key].pill} ring-2 ring-[#1a1917]/70` : "border-[#cfc8b8] bg-white text-[#4f4a3f] hover:bg-[#f1ede2]"
                      }`}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </span>
            </Detail>
          </div>
        )}

        {canEdit ? (
          <div className="print:hidden">
            <Detail label="Qué encontré" stacked={stacked}>
              <textarea
                rows={stacked ? 4 : 2}
                value={result}
                onChange={(e) => { setResult(e.target.value); setSavedNote(false); }}
                placeholder="Anota aquí lo que conseguiste: nombres, fechas, nº de inscripción…"
                aria-label="Qué encontré"
                className={field}
              />
              <span className="mt-1.5 flex items-center gap-3">
                <button
                  type="button"
                  disabled={!resultChanged}
                  onClick={async () => { if (await onSave({ result: result.trim() || null })) setSavedNote(true); }}
                  className="rounded-lg bg-[#1a1917] px-3 py-2 text-xs font-semibold text-[#f5f2ea] hover:bg-black disabled:opacity-40 sm:py-1.5"
                >
                  Guardar nota
                </button>
                {savedNote && !resultChanged && <span className="text-xs text-emerald-700">Guardado</span>}
              </span>
            </Detail>
          </div>
        ) : (
          task.result && <Detail label="Qué se encontró" stacked={stacked}>{task.result}</Detail>
        )}
        {/* En papel: lo ya anotado y espacio para escribir a mano. */}
        {canEdit && task.result && <div className="hidden print:block"><Detail label="Qué encontré" stacked={false}>{task.result}</Detail></div>}
        <div aria-hidden="true" className="hidden h-10 border-b border-dashed border-gray-400 print:block" />
      </dl>

      {canEdit && (
        <div className="mt-4 flex gap-5 border-t border-[#ece7da] pt-3 text-sm sm:text-xs print:hidden">
          <button type="button" onClick={onEdit} className="py-1 font-medium text-[#4f4a3f] underline underline-offset-2 hover:text-[#1f1d1a]">Editar</button>
          <button type="button" onClick={onDelete} className="py-1 font-medium text-red-700 underline underline-offset-2 hover:text-red-900">Borrar</button>
        </div>
      )}
    </>
  );
}

function TaskRow({ task, canEdit, open, selected, onToggle, onSelect, onEdit, onSave, onDelete }: {
  task: Task;
  canEdit: boolean;
  /** Desplegado dentro de la lista (teléfono y pantallas medianas). */
  open: boolean;
  /** Es el que se ve en el panel de la derecha (pantallas anchas). */
  selected: boolean;
  onToggle: () => void;
  onSelect: () => void;
  onEdit: () => void;
  onSave: (change: Change) => Promise<boolean>;
  onDelete: () => void;
}) {
  const closed = isClosed(task.status);
  const done = task.status === "resolved";

  // Flechas arriba y abajo: pasan al pendiente anterior o siguiente (y el panel lo muestra).
  const move = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const rows = [...document.querySelectorAll<HTMLButtonElement>("[data-task-row]")];
    const next = rows[rows.indexOf(e.currentTarget) + (e.key === "ArrowDown" ? 1 : -1)];
    if (next) {
      e.preventDefault();
      next.focus();
    }
  };

  return (
    <li
      className={`overflow-hidden rounded-xl border bg-white print:break-inside-avoid print:border-gray-400 ${
        open ? "max-xl:border-[#1a1917] max-xl:shadow-md" : ""
      } ${selected ? "xl:border-[#1a1917] xl:shadow-md" : ""} border-[#e2dccd] shadow-sm`}
    >
      <div className="flex items-start gap-1 py-1.5 pl-2 pr-3 sm:pl-2.5">
        {/* En papel, un cuadrito para marcar a mano. */}
        <span aria-hidden="true" className="ml-2 mt-2.5 hidden h-4 w-4 shrink-0 border-2 border-gray-700 print:block" />
        {canEdit && (
          // El área que se toca es más grande que el círculo que se ve.
          <button
            type="button"
            onClick={() => onSave({ status: done ? "open" : "resolved" })}
            aria-label={done ? "Volver a dejar como pendiente" : "Marcar como conseguido"}
            title={done ? "Volver a dejar como pendiente" : "Marcar como conseguido"}
            className="group/check flex h-11 w-10 shrink-0 items-center justify-center print:hidden"
          >
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs font-bold ${
                done
                  ? "border-emerald-600 bg-emerald-600 text-white"
                  : "border-[#b9b2a1] text-transparent group-hover/check:border-emerald-600 group-hover/check:text-emerald-600"
              }`}
            >
              ✓
            </span>
          </button>
        )}
        <button
          type="button"
          data-task-row
          onClick={onToggle}
          onFocus={onSelect}
          onKeyDown={move}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-start gap-3 rounded-lg py-2 pl-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-[#1a1917]/40"
        >
          <span className="min-w-0 flex-1">
            <span className={`block font-medium leading-snug ${closed ? "text-[#8a8475] line-through" : "text-[#1f1d1a]"}`}>{task.title}</span>
            <span className="mt-0.5 block text-xs text-[#6b6558]">{task.personName ?? "Sin persona asociada"}</span>
            {/* En el teléfono el estado va debajo, para no quitarle ancho al título. */}
            <StatusPill status={task.status} className="mt-1.5 inline-flex sm:hidden" />
          </span>
          <StatusPill status={task.status} className="mt-0.5 hidden shrink-0 sm:flex" />
          <span aria-hidden="true" className={`mt-0.5 shrink-0 text-[#8a8475] transition-transform xl:hidden print:hidden ${open ? "rotate-180" : ""}`}>▾</span>
          <span aria-hidden="true" className={`mt-0.5 hidden shrink-0 xl:block print:hidden ${selected ? "text-[#1a1917]" : "text-[#c9c3b4]"}`}>›</span>
        </button>
      </div>

      {/* En pantallas anchas el detalle va en el panel de la derecha; en papel, siempre aquí. */}
      <div className={`${open ? "block xl:hidden" : "hidden"} border-t border-[#ece7da] bg-[#fbfaf6] px-4 py-4 print:block! print:bg-white`}>
        <TaskDetails task={task} canEdit={canEdit} stacked={false} onSave={onSave} onEdit={onEdit} onDelete={onDelete} />
      </div>
    </li>
  );
}

export default function TaskList({ initial, canEdit, person }: { initial: Task[]; canEdit: boolean; person: PersonRef | null }) {
  const [tasks, setTasks] = useState<Task[]>(initial);
  const [filter, setFilter] = useState<TaskFilter>({ venue: "all", query: "", showClosed: false });
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Al cerrar un pendiente desaparece de la lista: este aviso lo dice y deja deshacerlo.
  const [undo, setUndo] = useState<{ task: Task; previous: TaskStatus } | null>(null);

  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 8000);
    return () => clearTimeout(t);
  }, [undo]);

  const visible = useMemo(() => sortTasks(filterTasks(tasks, filter)), [tasks, filter]);
  const groups = groupByVenue(visible);
  const counts = openByVenue(tasks);
  const prog = progress(tasks);
  const openTotal = prog.total - prog.closed;
  const activeVenue = filter.venue === "all" ? null : VENUES.find((v) => v.key === filter.venue);
  const allOpen = visible.length > 0 && visible.every((t) => openIds.has(t.id));
  // El del panel de la derecha: el elegido o, si ya no está a la vista, el primero de la lista.
  const selected = visible.find((t) => t.id === selectedId) ?? groups[0]?.tasks[0] ?? null;

  const toggle = (id: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const saved = (t: Task, isNew: boolean) => {
    setTasks((prev) => (isNew ? [...prev, t] : prev.map((x) => (x.id === t.id ? t : x))));
    setCreating(false);
    setEditingId(null);
    setOpenIds((prev) => new Set(prev).add(t.id));
    setSelectedId(t.id);
  };

  const save = async (task: Task, change: Change): Promise<boolean> => {
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyOf(task, change)),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "No se pudo guardar el cambio."); return false; }
      const updated = json.task as Task;
      setTasks((prev) => prev.map((x) => (x.id === task.id ? updated : x)));
      if (change.status && isClosed(updated.status) && !isClosed(task.status) && !filter.showClosed) {
        setUndo({ task: updated, previous: task.status });
      } else if (change.status) {
        setUndo(null);
      }
      return true;
    } catch {
      setError("No se pudo guardar el cambio. Revisa la conexión.");
      return false;
    }
  };

  const remove = async (task: Task) => {
    if (!window.confirm(`¿Borrar el pendiente «${task.title}»?`)) return;
    const res = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
    if (!res.ok) { setError("No se pudo borrar."); return; }
    setTasks((prev) => prev.filter((x) => x.id !== task.id));
  };

  const startCreating = () => { setCreating(true); setEditingId(null); };
  const startEditing = (id: string) => { setEditingId(id); setCreating(false); };

  // Filtro de lugar: fichas en fila en el teléfono, lista vertical en la barra lateral.
  const venueButton = (on: boolean) =>
    `flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3.5 py-2 text-sm lg:w-full lg:justify-between lg:rounded-lg lg:px-3 ${
      on
        ? "border-[#1a1917] bg-[#1a1917] font-semibold text-[#f5f2ea]"
        : "border-[#cfc8b8] bg-white text-[#2b2823] hover:bg-[#f1ede2] lg:border-transparent lg:bg-transparent lg:hover:bg-[#ece7da]"
    }`;
  const badge = (on: boolean) =>
    `rounded-full px-1.5 text-xs font-semibold ${on ? "bg-white/20 text-[#f5f2ea]" : "bg-[#ece7da] text-[#4f4a3f] lg:bg-[#e2dccd]"}`;

  const showClosedToggle = (
    <label className="flex cursor-pointer items-center gap-2 py-1 text-sm text-[#2b2823]">
      <input type="checkbox" className="h-4 w-4 accent-[#1a1917]" checked={filter.showClosed} onChange={(e) => setFilter({ ...filter, showClosed: e.target.checked })} />
      Ver también los resueltos
    </label>
  );

  return (
    <div className="lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start lg:gap-8 xl:grid-cols-[16rem_minmax(0,1fr)_minmax(0,27rem)]">
      {/* ── Barra lateral (en el teléfono sus partes van una debajo de otra, arriba de la lista) ── */}
      <aside className="contents lg:sticky lg:top-6 lg:block print:hidden">
        <div className="mb-4 rounded-2xl border border-[#e2dccd] bg-white p-4 lg:mb-6 print:hidden">
          <p className="text-sm text-[#2b2823]">
            <span className="text-2xl font-semibold text-[#1f1d1a]">{openTotal}</span>{" "}
            {openTotal === 1 ? "pendiente por hacer" : "pendientes por hacer"}
            {person ? ` de ${person.name}` : ""}
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#ece7da]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={prog.percent} aria-label="Avance">
            <div className="h-full rounded-full bg-emerald-600" style={{ width: `${prog.percent}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-[#6b6558]">{prog.closed} de {prog.total} resueltos</p>
        </div>

        {/* En el teléfono queda fija arriba al bajar por la lista. */}
        <div className="sticky top-0 z-10 -mx-4 mb-3 bg-[#f6f3ec]/95 px-4 py-2 backdrop-blur-sm sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:mb-5 lg:bg-transparent lg:p-0 lg:backdrop-blur-none print:hidden">
          <p className={`${eyebrow} mb-2`}>¿Dónde vas a hacerlo?</p>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:mx-0 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:p-0 [&::-webkit-scrollbar]:hidden">
            <button type="button" aria-pressed={filter.venue === "all"} onClick={() => setFilter({ ...filter, venue: "all" })} className={venueButton(filter.venue === "all")}>
              Todos <span className={badge(filter.venue === "all")}>{openTotal}</span>
            </button>
            {VENUES.filter((v) => tasks.some((t) => t.venue === v.key)).map((v) => {
              const on = filter.venue === v.key;
              return (
                <button key={v.key} type="button" aria-pressed={on} onClick={() => setFilter({ ...filter, venue: v.key })} className={venueButton(on)}>
                  {v.short} <span className={badge(on)}>{counts.get(v.key) ?? 0}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="hidden space-y-2 border-t border-[#e2dccd] pt-4 lg:block print:hidden">
          {showClosedToggle}
          <button type="button" onClick={() => window.print()} className={`${ghostButton} w-full`} title="Imprime los pendientes que estás viendo, con espacio para anotar">
            Imprimir esta lista
          </button>
        </div>
      </aside>

      {/* ── Lista ── */}
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <input
            type="search"
            value={filter.query}
            onChange={(e) => setFilter({ ...filter, query: e.target.value })}
            placeholder="Buscar por persona o palabra…"
            aria-label="Buscar en los pendientes"
            className={`${field} min-w-[12rem] flex-1 py-2.5 sm:py-2`}
          />
          {canEdit && (
            <button type="button" onClick={startCreating} className={`${primaryButton} hidden lg:block`}>
              + Nuevo pendiente
            </button>
          )}
          <div className="flex w-full items-center justify-between lg:hidden">
            {showClosedToggle}
            <button type="button" onClick={() => window.print()} className="py-1 text-sm font-medium text-[#4f4a3f] underline underline-offset-2">
              Imprimir
            </button>
          </div>
        </div>

        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-800">{error}</p>}
        {creating && (
          <TaskForm
            initial={{ ...EMPTY, person, venue: filter.venue === "all" ? EMPTY.venue : filter.venue }}
            onCancel={() => setCreating(false)}
            onSaved={saved}
          />
        )}

        {/* Título de la hoja impresa */}
        <p className="hidden text-lg font-semibold print:block">
          Pendientes de investigación{activeVenue ? ` · ${activeVenue.label}` : ""}{person ? ` · ${person.name}` : ""}
        </p>

        {activeVenue?.help && (
          <p className="rounded-xl border border-[#e2dccd] bg-[#fbfaf6] px-4 py-3 text-sm text-[#2b2823]">
            <span className="font-semibold">{activeVenue.label}.</span> {activeVenue.help}
          </p>
        )}

        {visible.length > 0 && (
          <div className="flex items-center justify-between text-xs text-[#6b6558] print:hidden">
            <span>
              {visible.length === 1 ? "1 pendiente" : `${visible.length} pendientes`}
              <span className="xl:hidden"> · toca uno para ver qué pedir</span>
              <span className="hidden xl:inline"> · con las flechas ↑ ↓ pasas de uno a otro</span>
            </span>
            <button
              type="button"
              onClick={() => setOpenIds(allOpen ? new Set() : new Set(visible.map((t) => t.id)))}
              className="py-1 font-medium underline underline-offset-2 hover:text-[#1f1d1a] xl:hidden"
            >
              {allOpen ? "Cerrar todos" : "Abrir todos"}
            </button>
          </div>
        )}

        {visible.length === 0 && !creating && (
          <div className="rounded-xl border border-dashed border-[#cfc8b8] p-8 text-center text-sm text-[#6b6558]">
            {tasks.length === 0 ? (
              <p>Todavía no hay pendientes.{canEdit ? " Crea el primero con «+ Nuevo pendiente»." : ""}</p>
            ) : (
              <>
                <p>No hay pendientes que coincidan con lo que elegiste.</p>
                <button
                  type="button"
                  onClick={() => setFilter({ venue: "all", query: "", showClosed: true })}
                  className="mt-2 font-medium text-[#1f1d1a] underline underline-offset-2"
                >
                  Ver todos, también los resueltos
                </button>
              </>
            )}
          </div>
        )}

        {groups.map((g) => (
          <section key={g.venue}>
            {/* Con un lugar elegido el título sobra: ya está en el filtro y en la nota de arriba. */}
            {!activeVenue && (
              <div className="mb-2 mt-1">
                <h2 className="text-base font-semibold text-[#1f1d1a]">
                  {g.label} <span className="font-normal text-[#8a8475]">· {g.tasks.length}</span>
                </h2>
                {g.help && <p className="text-xs text-[#6b6558]">{g.help}</p>}
              </div>
            )}
            <ul className="space-y-2">
              {g.tasks.map((t) =>
                editingId === t.id ? (
                  <li key={t.id}>
                    <TaskForm initial={draftOf(t)} onCancel={() => setEditingId(null)} onSaved={saved} />
                  </li>
                ) : (
                  <TaskRow
                    key={t.id}
                    task={t}
                    canEdit={canEdit}
                    open={openIds.has(t.id)}
                    selected={selected?.id === t.id}
                    onToggle={() => { toggle(t.id); setSelectedId(t.id); }}
                    onSelect={() => setSelectedId(t.id)}
                    onEdit={() => startEditing(t.id)}
                    onSave={(change) => save(t, change)}
                    onDelete={() => remove(t)}
                  />
                ),
              )}
            </ul>
          </section>
        ))}
        {/* Hueco para que el botón flotante no tape el último pendiente. */}
        {canEdit && <div aria-hidden="true" className="h-16 lg:hidden print:hidden" />}
      </div>

      {/* ── Panel de detalle (solo pantallas anchas) ── */}
      <aside className="hidden xl:sticky xl:top-6 xl:block xl:max-h-[calc(100vh-3rem)] xl:overflow-y-auto print:hidden!">
        {selected ? (
          <div className="rounded-2xl border border-[#e2dccd] bg-white p-5 shadow-sm">
            <p className={eyebrow}>{VENUES.find((v) => v.key === selected.venue)?.label}</p>
            <h2 className={`mt-1 text-lg font-semibold leading-snug ${isClosed(selected.status) ? "text-[#8a8475] line-through" : "text-[#1f1d1a]"}`}>
              {selected.title}
            </h2>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[#6b6558]">
              {selected.personName ?? "Sin persona asociada"}
              {selected.personId && !person && (
                <Link href={`/pendientes?persona=${selected.personId}`} className="text-xs underline underline-offset-2 hover:text-[#1f1d1a]">
                  ver solo los suyos
                </Link>
              )}
            </p>
            <div className="mt-4 border-t border-[#ece7da] pt-4">
              {/* key: al cambiar de pendiente, la nota a medio escribir no pasa al siguiente. */}
              <TaskDetails
                key={selected.id}
                task={selected}
                canEdit={canEdit}
                stacked
                onSave={(change) => save(selected, change)}
                onEdit={() => startEditing(selected.id)}
                onDelete={() => remove(selected)}
              />
            </div>
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-[#cfc8b8] p-6 text-center text-sm text-[#6b6558]">
            Elige un pendiente de la lista para ver qué pedir.
          </p>
        )}
      </aside>

      {/* ── Botón flotante para crear (teléfono y pantallas medianas) ── */}
      {canEdit && !creating && (
        <button
          type="button"
          onClick={startCreating}
          className="fixed bottom-4 right-4 z-20 rounded-full bg-[#1a1917] px-5 py-3 text-sm font-semibold text-[#f5f2ea] shadow-lg hover:bg-black lg:hidden print:hidden"
        >
          + Nuevo
        </button>
      )}

      {undo && (
        <div role="status" className="fixed inset-x-0 bottom-20 z-30 flex justify-center px-4 lg:bottom-4 print:hidden">
          <div className="flex max-w-xl items-center gap-3 rounded-full bg-[#1a1917] py-2 pl-4 pr-2 text-sm text-[#f5f2ea] shadow-lg">
            <span className="min-w-0 truncate">
              Quedó como {statusLabel(undo.task.status).toLowerCase()}: «{undo.task.title}»
            </span>
            <button
              type="button"
              onClick={() => { const u = undo; setUndo(null); void save(u.task, { status: u.previous }); }}
              className="shrink-0 rounded-full bg-[#f5f2ea] px-3 py-1.5 text-xs font-semibold text-[#1a1917] hover:bg-white"
            >
              Deshacer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
