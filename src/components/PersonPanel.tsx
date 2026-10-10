"use client";

import AddParticipant, { type NewParticipantPayload } from "./AddParticipant";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { EventForm, PersonForm } from "@/lib/edit";
import { describeRelationship } from "@/lib/relationship";
import {
  FichaForm,
  type EditableFact,
  type PartnerChoice,
  type FichaFormHandle,
  type FichaPayload,
  type SaveOutcome,
} from "./PersonEditor";

interface TimelineSource {
  title: string;
  url: string;
  quote: string | null;
}

interface TimelineEntry {
  year: number | null;
  yearEnd: number | null;
  approx: boolean;
  dateText: string | null;
  kind: string;
  tag: string | null;
  title: string;
  place: string | null;
  description: string | null;
  age: number | null;
  person: { id: string; name: string } | null;
  sources: TimelineSource[];
  participants?: { id?: string; role: string; name: string; personId: string | null }[];
  /** Solo los hechos que se pueden editar: guardados en la base (id) o del archivo de investigación. */
  edit?: { id: string | null; research: string | null; form: EventForm } | null;
  /** Nacimiento de un hijo/a sin fecha propia: se puede anotar una tentativa acá. */
  childApprox?: { childId: string; date: string } | null;
}

interface PersonDetail {
  id: string;
  displayName: string;
  sex: string;
  isLiving: boolean;
  given: string;
  surnamePat: string;
  surnameMat: string;
  notes: string;
  edited: { at: string; by: string | null } | null;
  canEdit: boolean;
  timeline: TimelineEntry[];
  /** Uniones en las que es pareja (de ahí salen las parejas para un matrimonio nuevo). */
  familiesAsPartner?: {
    id: string;
    partner1_id: string | null;
    partner2_id: string | null;
    partner1_name: string | null;
    partner2_name: string | null;
    family_events: { event_type: string }[] | null;
  }[];
}

/** Lo que devuelve el servidor al guardar: la ficha y la tarjeta del árbol ya actualizadas. */
type SaveResponse = { person: PersonDetail; card: Record<string, unknown> | null };

function formatEdited(iso: string): string {
  return new Date(iso).toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric" });
}

function PersonChip({ name, onClick }: { name: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group mt-1.5 flex items-center gap-2 rounded-lg border border-gray-100 bg-white px-2 py-1.5 text-left hover:border-blue-200 hover:bg-blue-50/50"
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-400">
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8" />
        </svg>
      </span>
      <span className="text-sm text-gray-700 group-hover:text-blue-700">{name}</span>
    </button>
  );
}

function SourceLink({ source }: { source: TimelineSource }) {
  return (
    <li>
      <a
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
        title={source.url}
        className="group inline-flex max-w-full items-start gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs leading-snug text-gray-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="mt-px h-3.5 w-3.5 shrink-0 text-gray-400 group-hover:text-blue-500"
          aria-hidden="true"
        >
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M14 3v5h5M9 13h6M9 17h4" />
        </svg>
        <span className="min-w-0">{source.title}</span>
        <span className="shrink-0 text-gray-400 group-hover:text-blue-500" aria-hidden="true">
          ↗
        </span>
      </a>
      {source.quote && (
        <p className="mt-1.5 border-l-2 border-gray-200 pl-2.5 text-xs italic leading-relaxed text-gray-500">
          “{source.quote}”
        </p>
      )}
    </li>
  );
}

/** Anotar (o corregir) la fecha tentativa de nacimiento de un hijo/a, solo en esta ficha. */
function ChildApproxDate({
  initial,
  onSave,
}: {
  initial: string;
  onSave: (date: string) => Promise<string | null>;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => { setValue(initial); setError(null); setOpen(true); }}
        className="mt-1.5 text-xs font-medium text-gray-500 underline decoration-gray-300 underline-offset-2 hover:text-gray-800"
      >
        {initial ? "Cambiar la fecha aproximada" : "Agregar fecha aproximada"}
      </button>
    );
  }
  const save = async (date: string) => {
    setSaving(true);
    const err = await onSave(date);
    setSaving(false);
    if (err) setError(err);
    else setOpen(false);
  };
  return (
    <form
      className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-2.5"
      onSubmit={(ev) => { ev.preventDefault(); save(value); }}
    >
      <label className="block text-xs font-medium text-gray-600" htmlFor="child-approx">
        Fecha aproximada de nacimiento
      </label>
      <input
        id="child-approx"
        autoFocus
        value={value}
        onChange={(ev) => setValue(ev.target.value)}
        placeholder="Por ejemplo: 1885, c. 1885 o entre 1884 y 1887"
        className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm"
      />
      <p className="mt-1 text-[11px] text-gray-500">Se anota solo aquí, en la ficha del padre o madre; la ficha del hijo o hija no cambia.</p>
      {error && <p role="alert" className="mt-1 text-xs font-medium text-red-700">{error}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="submit" disabled={saving} className="rounded-md bg-black px-3 py-1 text-xs font-medium text-white disabled:opacity-60">
          {saving ? "Guardando…" : "Guardar"}
        </button>
        <button type="button" onClick={() => setOpen(false)} disabled={saving} className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700">
          Cancelar
        </button>
        {initial && (
          <button type="button" onClick={() => save("")} disabled={saving} className="rounded-md px-2 py-1 text-xs font-medium text-red-700 underline">
            Quitar
          </button>
        )}
      </div>
    </form>
  );
}

function TimelineItem({
  entry: e,
  accentColor,
  onNavigate,
  onChildDate,
  ownerName,
  onAddParticipant,
}: {
  entry: TimelineEntry;
  accentColor: string;
  onNavigate: (id: string) => void;
  /** Solo si se puede editar: guarda la fecha tentativa; devuelve el error, o null si salió bien. */
  onChildDate?: (childId: string, date: string) => Promise<string | null>;
  ownerName?: string;
  /** Solo si se puede editar: agrega al árbol a un padrino/testigo sin vincular; devuelve el error, o null si salió bien. */
  onAddParticipant?: (eventId: string, participantId: string, payload: NewParticipantPayload) => Promise<string | null>;
}) {
  const [addingParticipant, setAddingParticipant] = useState<string | null>(null);
  const detail = [e.dateText, e.place].filter(Boolean).join(" · ");
  return (
    <li className="flex gap-4 border-b border-gray-100 px-5 py-4 last:border-0">
      <div className="w-16 shrink-0 text-right">
        {e.year != null ? (
          <div className="text-lg font-semibold leading-none text-gray-800">
            {e.approx && <span className="mr-1 text-xs font-normal text-gray-400">c.</span>}
            {e.year}
          </div>
        ) : (
          <div className="text-sm leading-[18px] text-gray-300" title="Sin fecha">
            s/f
          </div>
        )}
        {e.yearEnd != null && (
          <div className="mt-0.5 text-xs font-medium leading-tight text-gray-500">–{e.yearEnd}</div>
        )}
        {e.age != null && <div className="mt-1 text-[11px] text-gray-400">Edad ~{e.age}</div>}
      </div>
      <div className="min-w-0 flex-1">
        {e.tag && (
          <p
            className="mb-1 text-[10.5px] font-semibold uppercase leading-none tracking-wider"
            style={{ color: accentColor }}
          >
            {e.tag}
          </p>
        )}
        <p className={`text-sm text-gray-900 ${e.tag ? "leading-snug" : "font-semibold"}`}>
          {e.title}
          {e.person && !e.tag ? ":" : ""}
        </p>
        {e.person && <PersonChip name={e.person.name} onClick={() => onNavigate(e.person!.id)} />}
        {e.childApprox && onChildDate && (
          <ChildApproxDate
            key={e.childApprox.date}
            initial={e.childApprox.date}
            onSave={(date) => onChildDate(e.childApprox!.childId, date)}
          />
        )}
        {detail && <p className="mt-1 text-xs text-gray-500">{detail}</p>}
        {e.description && <p className="mt-1 whitespace-pre-line text-xs text-gray-500">{e.description}</p>}
        {e.participants && e.participants.length > 0 && (
          <ul className="mt-2 flex flex-col items-start gap-1">
            {e.participants.map((part, pi) =>
              part.personId ? (
                <li key={pi}>
                  <PersonChip name={`${part.role}: ${part.name}`} onClick={() => onNavigate(part.personId!)} />
                </li>
              ) : (
                <li key={pi} className="w-full text-xs text-gray-500">
                  {part.role}: {part.name}
                  <span className="ml-1 text-gray-400">(sin vincular)</span>
                  {onAddParticipant && part.id && e.edit?.id && addingParticipant !== part.id && (
                    <button
                      type="button"
                      onClick={() => setAddingParticipant(part.id!)}
                      className="ml-2 font-medium text-gray-700 underline decoration-gray-300 underline-offset-2 hover:text-gray-900"
                    >
                      Agregar al árbol
                    </button>
                  )}
                  {onAddParticipant && part.id && e.edit?.id && addingParticipant === part.id && (
                    <AddParticipant
                      name={part.name}
                      role={part.role}
                      ownerName={ownerName ?? "esta persona"}
                      onCancel={() => setAddingParticipant(null)}
                      onSubmit={async (payload) => {
                        const problem = await onAddParticipant(e.edit!.id!, part.id!, payload);
                        if (!problem) setAddingParticipant(null);
                        return problem;
                      }}
                    />
                  )}
                </li>
              ),
            )}
          </ul>
        )}
        {e.sources.length > 0 && (
          <ul className="mt-2 flex flex-col items-start gap-1.5">
            {e.sources.map((s) => (
              <SourceLink key={s.url} source={s} />
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

export default function PersonPanel({
  personId,
  mainId,
  homeId,
  data,
  onClose,
  onNavigate,
  onPersonChanged,
  onPersonDeleted,
  onTreeData,
}: {
  personId: string | null;
  mainId: string | null;
  /** La persona vinculada a la cuenta que entró: el parentesco ("Su padre",
   *  "Su prima"…) siempre se cuenta desde ella, aunque el árbol esté
   *  centrado en otra persona. Sin cuenta vinculada, se cuenta desde el
   *  tronco actual. */
  homeId?: string | null;
  data: any[];
  onClose: () => void;
  onNavigate: (id: string) => void;
  /** Avisa que se guardó un cambio, con la tarjeta del árbol ya actualizada. */
  onPersonChanged: (id: string, card: Record<string, unknown>) => void;
  /** Avisa que se eliminó a la persona, con los datos del árbol ya al día. */
  onPersonDeleted?: (id: string, fresh: any[]) => void;
  /** Avisa que llegaron datos del árbol al día (se agregó a alguien desde un hecho). */
  onTreeData?: (fresh: any[]) => void;
}) {
  const router = useRouter();
  const [person, setPerson] = useState<PersonDetail | null>(null);
  const [loading, setLoading] = useState(false);
  // El formulario de "Editar" (o null si la ficha solo se está leyendo).
  const [editing, setEditing] = useState<{ startWithNew: boolean } | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const formRef = useRef<FichaFormHandle>(null);
  /** Guarda la fecha tentativa de un hijo/a; devuelve el error, o null si salió bien. */
  const saveChildDate = async (childId: string, date: string): Promise<string | null> => {
    if (!person) return "No se pudo guardar.";
    try {
      const res = await fetch(`/api/persons/${person.id}/child-birth`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ childId, date }),
      });
      if (res.status === 401) {
        router.push("/login");
        return "Tu sesión venció. Vuelve a entrar.";
      }
      const json = await res.json().catch(() => null);
      if (!res.ok) return json?.errors?.date ?? json?.error ?? "No se pudo guardar.";
      setPerson(json.person);
      return null;
    } catch {
      return "No se pudo guardar: revisa tu conexión y prueba de nuevo.";
    }
  };

  /** Agrega al árbol a un padrino/testigo sin vincular y lo deja vinculado en el hecho; devuelve el error, o null. */
  const addParticipant = async (eventId: string, participantId: string, payload: NewParticipantPayload): Promise<string | null> => {
    if (!person) return "No se pudo guardar.";
    try {
      const res = await fetch(`/api/events/${eventId}/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId: person.id, participantId, person: payload.person, relation: payload.relation, of: payload.relation ? person.id : undefined }),
      });
      if (res.status === 401) {
        router.push("/login");
        return "Tu sesión venció. Vuelve a entrar.";
      }
      const json = await res.json().catch(() => null);
      if (!res.ok) return Object.values(json?.errors ?? {})[0] as string ?? json?.error ?? "No se pudo agregar.";
      setPerson(json.person);
      if (json.data) onTreeData?.(json.data);
      if (json.card) onPersonChanged(json.person.id, json.card);
      return null;
    } catch {
      return "No se pudo agregar: revisa tu conexión y prueba de nuevo.";
    }
  };

  // Eliminar a la persona: pide confirmar antes.
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const remove = async () => {
    if (!person || !onPersonDeleted) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/persons/${person.id}`, { method: "DELETE" });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setDeleteError(json?.error ?? "No se pudo eliminar.");
        return;
      }
      onPersonDeleted(person.id, json.data);
    } catch {
      setDeleteError("No se pudo eliminar: revisa tu conexión y prueba de nuevo.");
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => {
    setConfirmDelete(false);
    setDeleteError(null);
    setEditing(null);
    setJustSaved(false);
    if (!personId) {
      setPerson(null);
      return;
    }
    setLoading(true);
    setPerson(null);
    fetch(`/api/persons/${personId}`)
      .then((r) => {
        // La sesión venció o se quitó el acceso: de vuelta a la pantalla de entrada.
        if (r.status === 401) router.push("/login");
        return r.ok ? r.json() : null;
      })
      .then((data) => setPerson(data))
      .finally(() => setLoading(false));
  }, [personId, router]);

  /** Manda la ficha editada al servidor y, si entra, refresca la ficha y la tarjeta del árbol. */
  const save = async (payload: FichaPayload): Promise<SaveOutcome> => {
    if (!person) return { ok: false, error: "No se pudo guardar." };
    try {
      const res = await fetch(`/api/persons/${person.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.status === 401) {
        router.push("/login");
        return { ok: false, error: "Tu sesión venció. Vuelve a entrar." };
      }
      const json = await res.json().catch(() => null);
      if (!res.ok) return { ok: false, error: json?.error ?? "No se pudo guardar.", fields: json?.fields };
      const saved = json as SaveResponse;
      setPerson(saved.person);
      if (saved.card) onPersonChanged(saved.person.id, saved.card);
      setEditing(null);
      setJustSaved(true);
      return { ok: true };
    } catch {
      return { ok: false, error: "No se pudo guardar: revisa tu conexión y prueba de nuevo." };
    }
  };

  // El aviso de "guardado" se va solo.
  useEffect(() => {
    if (!justSaved) return;
    const timer = setTimeout(() => setJustSaved(false), 4000);
    return () => clearTimeout(timer);
  }, [justSaved]);

  const canEdit = Boolean(person?.canEdit);
  const basicsForm: PersonForm | null = person && {
    given: person.given,
    surnamePat: person.surnamePat,
    surnameMat: person.surnameMat,
    sex: person.sex === "M" || person.sex === "F" ? person.sex : "U",
    isLiving: person.isLiving,
    notes: person.notes,
  };
  // Lo que entra al formulario (en el orden de la ficha) y lo que la ficha muestra pero no se edita aquí.
  const editableFacts: EditableFact[] = (person?.timeline ?? []).flatMap((e) =>
    e.edit
      ? [
          {
            key: e.edit.id ?? `inv-${e.edit.research}`,
            id: e.edit.id,
            research: e.edit.research,
            form: e.edit.form,
            // Un matrimonio (o similar) nombra al cónyuge: ayuda a distinguirlo si hay más de uno.
            hint: e.person ? `con ${e.person.name}` : undefined,
          },
        ]
      : [],
  );
  // Parejas con quienes se puede registrar un matrimonio nuevo: las uniones
  // con sus dos integrantes en el árbol.
  const partnerChoices: PartnerChoice[] = (person?.familiesAsPartner ?? [])
    .filter((f) => f.partner1_id && f.partner2_id)
    .map((f) => ({
      familyId: f.id,
      name: (f.partner1_id === person?.id ? f.partner2_name : f.partner1_name) ?? "(sin nombre)",
      hasMarriage: (f.family_events ?? []).some((e) => e.event_type === "MARR"),
    }));
  const notEditable = (person?.timeline ?? [])
    .filter((e) => !e.edit)
    .map((e) => {
      const title = e.title.replace(/[.:]$/, "");
      // "Matrimonio con Germán Barroso", "Nacimiento de la hija: Juana…"
      const label = !e.person ? title : / con$/.test(title) ? `${title} ${e.person.name}` : `${title}: ${e.person.name}`;
      return e.year ? `${label} (${e.year})` : label;
    });

  // Siempre desde la persona vinculada a la cuenta, no desde el tronco
  // actual del árbol (que cambia al navegar o centrar en alguien más).
  const relationshipFocusId = homeId ?? mainId;
  const relationship = useMemo(
    () => (personId ? describeRelationship(data, relationshipFocusId, personId) : null),
    [data, relationshipFocusId, personId],
  );

  const open = Boolean(personId);
  const accentColor = person?.sex === "F" ? "#c44f72" : person?.sex === "M" ? "#3f7fcb" : "#8a97a8";
  // Lo decide la tarjeta del árbol (se actualiza al guardar la ficha).
  const isChild = Boolean(personId && data.find((d) => d.id === personId)?.data?.is_child);

  return (
    <>
    {/* Mientras se edita, el árbol queda detrás de un velo: no se cambia de persona a medio escribir. */}
    {editing && <div className="fixed inset-0 z-[25] bg-gray-900/30" aria-hidden="true" />}
    <aside
      className={`fixed right-0 top-0 z-30 flex h-full w-full max-w-md flex-col border-l border-gray-200 bg-white shadow-xl transition-transform duration-300 ease-out ${
        open ? "translate-x-0" : "pointer-events-none translate-x-full"
      }`}
    >
      <div className="h-1.5 w-full shrink-0" style={{ backgroundColor: accentColor }} />

      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-100 p-5">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
            style={{ backgroundColor: `${accentColor}1a` }}
          >
            {/* Quien murió de niño lleva la misma silueta infantil que su tarjeta del árbol. */}
            {isChild ? (
              <svg viewBox="0 0 24 24" fill={accentColor} className="h-6 w-6" aria-label="Murió en la infancia">
                {person?.sex === "F" && (
                  <>
                    <circle cx="7.3" cy="8.3" r="1.9" />
                    <circle cx="16.7" cy="8.3" r="1.9" />
                  </>
                )}
                <circle cx="12" cy="8" r={person?.sex === "F" ? 4.3 : 5} />
                <path d="M8 20c0-2.8 1.8-5 4-5s4 2.2 4 5z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill={accentColor} className="h-6 w-6">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8" />
              </svg>
            )}
          </span>
          <div className="min-w-0">
            {editing && (
              <p className="mb-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-gray-500">Editando la ficha de</p>
            )}
            <h2 className="text-lg font-semibold leading-tight text-gray-900">
              {person?.displayName ?? (loading ? "Cargando…" : "")}
            </h2>
            {relationship && !editing && (
              <p className="mt-0.5 text-sm font-medium" style={{ color: accentColor }}>
                {relationship}
              </p>
            )}
            {person && !editing && (
              <span
                className={`mt-1.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  person.isLiving ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${person.isLiving ? "bg-emerald-500" : "bg-gray-400"}`} />
                {person.isLiving ? "Viva / vivo" : "Fallecida/o"}
              </span>
            )}
            {person && !editing && canEdit && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => setEditing({ startWithNew: false })}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-black px-3.5 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
                  </svg>
                  Editar
                </button>
                <button
                  onClick={() => setEditing({ startWithNew: true })}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3.5 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  <span aria-hidden="true" className="leading-none">+</span>
                  Agregar un hecho
                </button>
              </div>
            )}
            {person && !editing && canEdit && onPersonDeleted && (
              confirmDelete ? (
                <div role="alertdialog" aria-label="Confirmar eliminación" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                  <p className="font-medium">¿Eliminar a {person.displayName} del árbol?</p>
                  <p className="mt-1 text-xs text-red-800">
                    Se borran sus datos y hechos. Sus hijos y demás familiares se quedan en el árbol. Queda anotado en el historial.
                  </p>
                  {deleteError && <p role="alert" className="mt-2 text-xs font-medium">{deleteError}</p>}
                  <div className="mt-2.5 flex gap-2">
                    <button
                      onClick={remove}
                      disabled={deleting}
                      className="rounded-lg bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-60"
                    >
                      {deleting ? "Eliminando…" : "Sí, eliminar"}
                    </button>
                    <button
                      onClick={() => { setConfirmDelete(false); setDeleteError(null); }}
                      disabled={deleting}
                      className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="mt-2.5 block text-xs font-medium text-red-700/80 underline decoration-red-200 underline-offset-2 hover:text-red-800"
                >
                  Eliminar a esta persona
                </button>
              )
            )}
            {person && !editing && (
              <a
                href={`/pendientes?persona=${person.id}`}
                className="mt-2.5 block text-xs font-medium text-gray-500 underline decoration-gray-300 underline-offset-2 hover:text-gray-800"
              >
                Pendientes de investigación de esta persona
              </a>
            )}
            {person && !editing && (
              <a
                href={`/mapa?persona=${person.id}`}
                className="mt-1.5 block text-xs font-medium text-gray-500 underline decoration-gray-300 underline-offset-2 hover:text-gray-800"
              >
                Ver mapa de sus antepasados
              </a>
            )}
            {person && !editing && person.id !== mainId && (
              <button
                onClick={() => onNavigate(person.id)}
                className="mt-2.5 block text-xs font-medium text-gray-500 underline decoration-gray-300 underline-offset-2 hover:text-gray-800"
              >
                Centrar el árbol en esta persona
              </button>
            )}
          </div>
        </div>
        <button
          onClick={() => (editing ? formRef.current?.requestClose() : onClose())}
          aria-label={editing ? "Cancelar la edición" : "Cerrar"}
          className="shrink-0 rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
        >
          ✕
        </button>
      </div>

      {person && editing && basicsForm ? (
        <FichaForm
          key={person.id}
          ref={formRef}
          person={basicsForm}
          facts={editableFacts}
          notEditable={notEditable}
          partners={partnerChoices}
          startWithNew={editing.startWithNew}
          onSave={save}
          onClose={() => setEditing(null)}
        />
      ) : (
        <>
          <div className="flex-1 overflow-y-auto">
            {loading && <p className="p-5 text-sm text-gray-400">Cargando…</p>}

            {justSaved && (
              <p role="status" className="border-b border-emerald-100 bg-emerald-50 px-5 py-2.5 text-sm font-medium text-emerald-800">
                ✓ Cambios guardados
              </p>
            )}

            {person?.notes && (
              <div className="border-b border-gray-100 px-5 py-4">
                <p className="text-[10.5px] font-semibold uppercase tracking-wider text-gray-400">Notas</p>
                <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-gray-700">{person.notes}</p>
              </div>
            )}

            {person && (
              <ul>
                {person.timeline.length === 0 && <li className="p-5 text-sm text-gray-400">Sin hechos registrados</li>}
                {person.timeline.map((e, i) => (
                  <TimelineItem
                    key={e.edit?.id ?? e.edit?.research ?? i}
                    entry={e}
                    accentColor={accentColor}
                    onNavigate={onNavigate}
                    onChildDate={canEdit ? saveChildDate : undefined}
                    ownerName={person.displayName}
                    onAddParticipant={canEdit ? addParticipant : undefined}
                  />
                ))}
              </ul>
            )}
          </div>

          <div className="shrink-0 border-t border-gray-100 px-5 py-3 text-center text-[11px] text-gray-400">
            {person?.edited
              ? `Editado${person.edited.by ? ` por ${person.edited.by}` : ""} el ${formatEdited(person.edited.at)}`
              : "Archivo Zamora Balcázar"}
          </div>
        </>
      )}
    </aside>
    </>
  );
}
