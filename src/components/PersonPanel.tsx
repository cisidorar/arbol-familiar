"use client";

import AddParticipant, { type NewParticipantPayload } from "./AddParticipant";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { REVIEW_KINDS, type EventForm, type PersonForm } from "@/lib/edit";
import { describeRelationship } from "@/lib/relationship";
import { TOMB_UNKNOWN, cremadoText, isCremationPlace } from "@/lib/cemetery-text";
import { buttonClass } from "./ui";
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
  placeInfo?: { name: string; comuna: string | null; region: string | null } | null;
  description: string | null;
  age: number | null;
  person: { id: string; name: string } | null;
  sources: TimelineSource[];
  participants?: { id?: string; role: string; name: string; personId: string | null }[];
  /** Solo los hechos que se pueden editar: guardados en la base (id) o del archivo de investigación. */
  edit?: { id: string | null; research: string | null; form: EventForm } | null;
  /** Marcado «por revisar» (la fuente solo se puede ver en persona, por ejemplo). */
  needsReview?: boolean;
  reviewNote?: string | null;
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
  /** Solo administradores: puede marcar hechos «por revisar». */
  canReview?: boolean;
  timeline: TimelineEntry[];
  /** Uniones en las que es pareja (de ahí salen las parejas para un matrimonio nuevo). */
  familiesAsPartner?: {
    id: string;
    partner1_id: string | null;
    partner2_id: string | null;
    partner1_name: string | null;
    partner2_name: string | null;
    union_type?: string | null;
    family_events: { event_type: string }[] | null;
  }[];
}

/** Lo que devuelve el servidor al guardar: la ficha y la tarjeta del árbol ya actualizadas. */
type SaveResponse = { person: PersonDetail; card: Record<string, unknown> | null };

function formatEdited(iso: string): string {
  return new Date(iso).toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric" });
}

function PersonChip({ name, onClick, color }: { name: string; onClick: () => void; color?: string }) {
  return (
    <button
      onClick={onClick}
      className="group mt-2 flex min-h-12 items-center gap-2.5 rounded-xl border-2 border-adobe-2 bg-white px-3 py-2 text-left hover:border-ink"
    >
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-adobe-2 text-gris"
        style={color ? { backgroundColor: `${color}1a`, color } : undefined}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8" />
        </svg>
      </span>
      <span className="text-base text-ink">{name}</span>
    </button>
  );
}

function SourceLink({ source, context }: { source: TimelineSource; context?: string }) {
  return (
    <li>
      <a
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
        title={source.url}
        className="group flex max-w-full items-start gap-3 rounded-xl border-2 border-adobe-2 bg-white px-3.5 py-2.5 text-base leading-snug text-ink transition hover:border-ink"
      >
        <span className="mt-0.5 shrink-0 rounded-md bg-adobe-2 px-2 py-0.5 text-base font-bold text-ink">Fuente</span>
        <span className="min-w-0 flex-1">
          {context && <span className="block text-base font-medium text-gris">{context}</span>}
          {source.title}
        </span>
        <span className="shrink-0 text-gris group-hover:text-ink" aria-hidden="true">
          ↗
        </span>
      </a>
      {source.quote && (
        <p className="mt-2 rounded-lg bg-adobe-2/60 px-3 py-2 text-base italic leading-relaxed text-gris">
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
        className="mt-1.5 min-h-11 text-base font-medium text-ink underline decoration-2 underline-offset-4 hover:text-teja"
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
      className="mt-2 rounded-xl border-2 border-adobe-2 bg-white p-3"
      onSubmit={(ev) => { ev.preventDefault(); save(value); }}
    >
      <label className="block text-base font-bold text-ink" htmlFor="child-approx">
        Fecha aproximada de nacimiento
      </label>
      <input
        id="child-approx"
        autoFocus
        value={value}
        onChange={(ev) => setValue(ev.target.value)}
        placeholder="Por ejemplo: 1885, c. 1885 o entre 1884 y 1887"
        className="mt-1 min-h-12 w-full rounded-lg border-2 border-[#8f8a80] bg-white px-3 py-2 text-base text-ink focus:border-ink"
      />
      <p className="mt-1 text-base text-gris">Se anota solo aquí, en la ficha del padre o madre; la ficha del hijo o hija no cambia.</p>
      {error && <p role="alert" className="mt-1 text-base font-bold text-aviso">{error}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="submit" disabled={saving} className={buttonClass("principal")}>
          {saving ? "Guardando…" : "Guardar"}
        </button>
        <button type="button" onClick={() => setOpen(false)} disabled={saving} className={buttonClass("secundario")}>
          Cancelar
        </button>
        {initial && (
          <button type="button" onClick={() => save("")} disabled={saving} className="min-h-12 px-3 text-base font-bold text-aviso underline decoration-2 underline-offset-4">
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
  dotColor,
  onNavigate,
  onChildDate,
  ownerName,
  onAddParticipant,
}: {
  entry: TimelineEntry;
  accentColor: string;
  /** Color del punto de la línea de vida: rosado o azul según el sexo de la persona a la que se refiere el hecho. */
  dotColor?: string;
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
    <li className="group/item flex gap-3 px-5 sm:gap-4 sm:px-7">
      <div className="w-[5.5rem] shrink-0 pt-5 text-right">
        {e.year != null ? (
          <div className="font-maquina text-xl leading-none text-ink">
            {e.approx && <span className="mr-1 font-body text-base font-normal text-gris">c.</span>}
            {e.year}
          </div>
        ) : e.kind === "OCCU" ? null : (
          // El oficio casi nunca tiene fecha: no se marca "s/f" en cada uno.
          <div className="font-maquina text-base leading-[20px] text-gris" title="Sin fecha">
            s/f
          </div>
        )}
        {e.yearEnd != null && <div className="mt-1 font-maquina text-base leading-tight text-gris">–{e.yearEnd}</div>}
        {e.age != null && <div className="mt-1 text-base text-gris">Edad: unos {e.age}</div>}
      </div>
      {/* Riel de la línea de vida: un punto por hecho, unidos por una línea. */}
      <div className="relative w-5 shrink-0" aria-hidden="true">
        <span className="absolute bottom-0 left-1/2 top-0 w-0.5 -translate-x-1/2 bg-ink/25 group-first/item:top-6 group-last/item:bottom-auto group-last/item:h-6" />
        <span
          className="absolute left-1/2 top-[1.15rem] h-4 w-4 -translate-x-1/2 rounded-full border-[3px] bg-white"
          style={{ borderColor: dotColor ?? accentColor, boxShadow: `0 0 0 3px ${dotColor ?? accentColor}22` }}
        />
      </div>
      <div className="min-w-0 flex-1 pb-6 pt-5">
        {e.tag && (
          <p className="mb-1 text-base font-bold uppercase leading-none tracking-wide text-burdeos">
            {e.tag}
          </p>
        )}
        <p className={`text-base text-ink ${e.tag ? "leading-snug" : "font-bold uppercase tracking-wide"}`}>
          {e.title}
          {e.person && !e.tag ? ":" : ""}
        </p>
        {e.person && <PersonChip name={e.person.name} color={dotColor} onClick={() => onNavigate(e.person!.id)} />}
        {e.childApprox && onChildDate && (
          <ChildApproxDate
            key={e.childApprox.date}
            initial={e.childApprox.date}
            onSave={(date) => onChildDate(e.childApprox!.childId, date)}
          />
        )}
        {detail && <p className="mt-1.5 text-base text-ink">{detail}</p>}
        {e.description && <p className="mt-1.5 whitespace-pre-line text-base text-ink">{e.description}</p>}
        {e.participants && e.participants.length > 0 && (
          <ul className="mt-2 flex flex-col items-start gap-1">
            {e.participants.map((part, pi) =>
              part.personId ? (
                <li key={pi}>
                  <PersonChip name={`${part.role}: ${part.name}`} onClick={() => onNavigate(part.personId!)} />
                </li>
              ) : (
                <li key={pi} className="w-full text-base text-gris">
                  {part.role}: {part.name}
                  <span className="ml-1">(sin vincular)</span>
                  {onAddParticipant && part.id && e.edit?.id && addingParticipant !== part.id && (
                    <button
                      type="button"
                      onClick={() => setAddingParticipant(part.id!)}
                      className="ml-2 min-h-11 font-bold text-ink underline decoration-2 underline-offset-4 hover:text-teja"
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
          <ul className="mt-3 flex flex-col items-stretch gap-2.5">
            {e.sources.map((s) => (
              <SourceLink key={s.url} source={s} />
            ))}
          </ul>
        )}
        {e.needsReview && (
          <p className="mt-3 inline-flex items-center gap-2 rounded-full border-2 border-teja bg-white px-3.5 py-1.5 text-base font-bold text-ink">
            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-teja" />
            {REVIEW_KINDS.find((k) => k.key === e.edit?.form.review)?.label ?? "Por revisar"}
          </p>
        )}
        {e.needsReview && e.reviewNote && (
          <p className="mt-2 whitespace-pre-line break-words rounded-xl border-2 border-teja bg-white px-3.5 py-2.5 text-base leading-snug text-ink">
            {e.reviewNote}
          </p>
        )}
      </div>
    </li>
  );
}

const cleanPlace = (p: string | null | undefined) => p?.replace(/,\s*Chile$/i, "").trim() || null;
const hasDay = (t: string | null) => !!t && /^\d{1,2}\b/.test(t.trim());
/** Dos líneas para un dato de la ficha: la fecha exacta arriba si se sabe; si no, el lugar arriba y la fecha debajo. */
function factLines(e?: TimelineEntry | null): { main: string; sub: string | null } | null {
  if (!e) return null;
  const place = cleanPlace(e.place);
  const date = e.dateText ?? (e.year != null ? String(e.year) : null);
  if (!place && !date) return null;
  if (hasDay(date)) return { main: date!, sub: place };
  return { main: place ?? date!, sub: place ? date : null };
}
const yearsLine = (born: number | null | undefined, died: number | null | undefined) =>
  born || died ? `${born ?? "?"} – ${died ?? "?"}` : null;

type Tab = "vida" | "familia" | "fuentes";

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
  const [tab, setTab] = useState<Tab>("vida");
  const [withFamily, setWithFamily] = useState(true);
  // "Más": las acciones menos usadas, para que la línea de vida quede a la vista.
  const [moreOpen, setMoreOpen] = useState(false);
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

  // Eliminar a la persona (desde el formulario de edición, escribiendo su nombre para confirmar).
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
    setDeleteError(null);
    setEditing(null);
    setJustSaved(false);
    setTab("vida");
    setMoreOpen(false);
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

  // Cambia el tipo de una unión (casados / sin matrimonio / no se sabe).
  const [unionBusy, setUnionBusy] = useState(false);
  const [unionError, setUnionError] = useState<string | null>(null);
  const changeUnion = async (familyId: string, unionType: string) => {
    if (!person) return;
    setUnionBusy(true);
    setUnionError(null);
    try {
      const res = await fetch(`/api/families/${familyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId: person.id, unionType }),
      });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setUnionError(json?.error ?? "No se pudo guardar.");
        return;
      }
      const saved = json as SaveResponse;
      setPerson(saved.person);
      if (saved.card) onPersonChanged(saved.person.id, saved.card);
    } catch {
      setUnionError("No se pudo guardar: revisa tu conexión y prueba de nuevo.");
    } finally {
      setUnionBusy(false);
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
  // Escape: cierra primero "Más"; si se está editando, pregunta antes de descartar (requestClose); si no, cierra la ficha.
  const moreOpenRef = useRef(false);
  moreOpenRef.current = moreOpen;
  useEffect(() => {
    if (!open) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape" || ev.defaultPrevented) return;
      // Un diálogo o menú encima de la ficha (agregar familiar, confirmaciones) maneja su propio Escape.
      if ((ev.target as HTMLElement | null)?.closest?.("[role='dialog'], [role='menu'], [role='alertdialog']")) return;
      if (editing) formRef.current?.requestClose();
      else if (moreOpenRef.current) setMoreOpen(false);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);
  // Clic fuera de la ficha: se cierra. Sin velo encima, para poder mover y acercar el mapa con la ficha abierta:
  // solo cuenta un clic (no un arrastre) sobre una zona vacía, no sobre tarjetas, botones ni enlaces.
  const asideRef = useRef<HTMLElement>(null);
  // El foco entra a la ficha al abrirla. Al cerrarla vuelve a la tarjeta: eso lo hace quien tiene el árbol (TreeApp),
  // porque la librería redibuja las tarjetas y la que tenía el foco ya no existe.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (personId && !wasOpenRef.current) {
      wasOpenRef.current = true;
      const timer = setTimeout(() => asideRef.current?.focus({ preventScroll: true }), 60);
      return () => clearTimeout(timer);
    }
    if (!personId) wasOpenRef.current = false;
  }, [personId]);
  useEffect(() => {
    if (!open || editing) return;
    let down: { x: number; y: number } | null = null;
    const onDown = (ev: PointerEvent) => {
      down = { x: ev.clientX, y: ev.clientY };
    };
    const onUp = (ev: PointerEvent) => {
      const d = down;
      down = null;
      const t = ev.target as HTMLElement | null;
      if (!d || !t || asideRef.current?.contains(t)) return;
      if (Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > 5) return;
      if (t.closest(".card, .card-inner, [data-id], button, a, input, select, textarea, summary, label, [role='dialog']")) return;
      onClose();
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointerup", onUp, true);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointerup", onUp, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);
  const accentColor = person?.sex === "F" ? "#c44f72" : person?.sex === "M" ? "#3f7fcb" : "#8a97a8";
  // Lo decide la tarjeta del árbol (se actualiza al guardar la ficha).
  const isChild = Boolean(personId && data.find((d) => d.id === personId)?.data?.is_child);

  const byId = useMemo(() => new Map<string, any>(data.map((d) => [d.id, d])), [data]);
  const sexColorOf = (sex?: string) => (sex === "F" ? "#c44f72" : sex === "M" ? "#3f7fcb" : "#8a97a8");
  const initialOf = (name: string) => name.trim().charAt(0).toUpperCase();

  // Datos de la persona que se resumen arriba de la ficha.
  const own = (k: string) => person?.timeline.find((t) => t.kind === k && !t.person);
  const born = own("BIRT")?.year ?? own("BAPM")?.year ?? null;
  const died = own("DEAT")?.year ?? null;
  const ageText = !person ? null : person.isLiving ? (born ? `${new Date().getFullYear() - born} años` : null) : born && died ? `unos ${died - born} años` : null;
  const burial = own("BURI");
  const info = burial?.placeInfo ?? null;
  const site = info?.name || cleanPlace(burial?.place) || null;
  const where = [info?.comuna, info?.region ? (/^regi[oó]n/i.test(info.region) ? info.region : `Región ${info.region}`) : null].filter(Boolean).join(" · ");
  // "Ubicación en el cementerio: cruz 158, patio 8" → "cruz 158, patio 8"
  const tomb = burial?.description?.replace(/^ubicaci[oó]n en el cementerio:\s*/i, "").trim() || null;
  const fem = person?.sex === "F";

  const meRels = person ? byId.get(person.id)?.rels : null;
  const spouseIds: string[] = meRels?.spouses ?? [];
  const parentIds: string[] = meRels?.parents ?? [];
  const childIds: string[] = meRels?.children ?? [];
  const jobs = (person?.timeline ?? []).filter((t) => t.kind === "OCCU" && !t.person).map((t) => t.title);
  const birthFact = factLines(own("BIRT"));
  const deathFact = person && !person.isLiving ? factLines(own("DEAT")) : null;
  // Una pareja puede tener hijos sin haberse casado: esas uniones se marcan como
  // "sin matrimonio" y se rotulan "Pareja" en vez de "Esposo/Esposa".
  const unionTypeOf = (spouseId: string) =>
    (person?.familiesAsPartner ?? []).find((f) => f.partner1_id === spouseId || f.partner2_id === spouseId)?.union_type ?? "marriage";
  const allUnmarried = spouseIds.length > 0 && spouseIds.every((id) => unionTypeOf(id) === "partnership");
  const spouseLabel = allUnmarried
    ? spouseIds.length > 1 ? "Parejas" : "Pareja"
    : spouseIds.length > 1 ? "Parejas" : byId.get(spouseIds[0])?.data?.gender === "F" ? "Esposa" : "Esposo";

  const visibleTimeline = (person?.timeline ?? []).filter((e) => person?.isLiving || !(e.kind === "BURI" && !e.person && e.place));
  const ownCount = visibleTimeline.filter((e) => !e.person).length;
  const familyFacts = visibleTimeline.length - ownCount;
  const shownTimeline = withFamily ? visibleTimeline : visibleTimeline.filter((e) => !e.person);
  const sourcesAll = (() => {
    const seen = new Set<string>();
    const list: { source: TimelineSource; context: string }[] = [];
    for (const e of person?.timeline ?? []) {
      for (const src of e.sources) {
        if (seen.has(src.url)) continue;
        seen.add(src.url);
        list.push({ source: src, context: [e.tag ?? e.title.replace(/[.:]$/, ""), e.year].filter(Boolean).join(" · ") });
      }
    }
    return list;
  })();
  const familyCount = parentIds.length + spouseIds.length + childIds.length;

  const personCard = (id: string, sub: string | null) => {
    const d = byId.get(id);
    if (!d) return null;
    const color = sexColorOf(d.data?.gender);
    return (
      <li key={id}>
        <button
          type="button"
          onClick={() => onNavigate(id)}
          className="flex min-h-12 w-full items-center gap-4 rounded-2xl border-2 border-adobe-2 bg-white px-4 py-3.5 text-left transition hover:border-ink"
        >
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-lg font-semibold" style={{ backgroundColor: `${color}1a`, color }} aria-hidden="true">
            {initialOf(d.data?.label ?? "?")}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-bold leading-snug text-ink">{d.data?.label}</span>
            {sub && <span className="mt-0.5 block text-base text-gris">{sub}</span>}
          </span>
          <span aria-hidden="true" className="text-xl text-gris">→</span>
        </button>
      </li>
    );
  };
  const kinText = (id: string) => {
    if (!homeId) return null;
    const r = describeRelationship(data, homeId, id);
    return r ? r.replace(/^Su /, "tu ").replace(/^Sus /, "tus ") : null;
  };
  const familySection = (title: string, ids: string[], subOf: (id: string) => string | null) =>
    ids.length > 0 && (
      <section key={title} className="mt-6 first:mt-0">
        <h3 className="mb-2.5 text-base font-bold uppercase tracking-wide text-gris">{title}</h3>
        <ul className="space-y-2.5">{ids.map((id) => personCard(id, subOf(id)))}</ul>
      </section>
    );
  const marriedIn = (spouseId: string) => person?.timeline.find((t) => (t.kind === "MARR" || t.kind === "MARS") && t.person?.id === spouseId)?.year ?? null;
  const childBirth = (childId: string) => person?.timeline.find((t) => t.kind === "CHILD_BIRT" && t.person?.id === childId);

  const btnOutline = buttonClass("secundario");

  return (
    <>
    {/* Mientras se edita, el árbol queda detrás de un velo: no se cambia de persona a medio escribir. */}
    {editing && <div className="fixed inset-0 z-[25] bg-ink/40" aria-hidden="true" />}
    {/* Clic fuera de la ficha: se cierra (menos al editar, para no perder lo escrito). */}
    <aside
      ref={asideRef}
      tabIndex={-1}
      aria-label={person ? `Ficha de ${person.displayName}` : "Ficha de la persona"}
      className={`album outline-none fixed right-0 top-0 z-30 flex h-full w-full flex-col border-l-2 border-ink shadow-xl transition-transform duration-300 ease-out sm:top-[72px] sm:h-[calc(100%-72px)] ${editing ? "sm:z-[26]" : "sm:z-[15]"} sm:max-w-[34rem] lg:max-w-[40rem] ${
        open ? "translate-x-0" : "pointer-events-none translate-x-full"
      }`}
    >
      {editing ? (
        <div className="flex shrink-0 items-start justify-between gap-3 border-b-2 border-ink bg-adobe px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="zb-etiqueta">Editando la ficha de</p>
            <h2 className="mt-1 break-words font-slab text-2xl font-bold leading-tight text-ink sm:text-3xl">{person?.displayName ?? ""}</h2>
          </div>
          <button
            onClick={() => formRef.current?.requestClose()}
            className={buttonClass("secundario", "shrink-0")}
          >
            <span aria-hidden="true">✕</span> Cerrar
          </button>
        </div>
      ) : null}

      {person && editing && basicsForm ? (
        <FichaForm
          key={person.id}
          ref={formRef}
          person={basicsForm}
          facts={editableFacts}
          notEditable={notEditable}
          partners={partnerChoices}
          startWithNew={editing.startWithNew}
          canReview={Boolean(person.canReview)}
          onSave={save}
          onClose={() => setEditing(null)}
          footer={
            onPersonDeleted ? (
              <DeleteZone name={person.displayName} deleting={deleting} error={deleteError} onDelete={remove} />
            ) : null
          }
        />
      ) : (
        <>
          <div className="flex-1 overflow-y-auto">
            {/* Encabezado */}
            <div className="px-5 pb-1 pt-4 sm:px-7 sm:pt-6">
              <div className="flex items-start gap-4 sm:gap-5">
                <span
                  className="grid h-14 w-14 shrink-0 place-items-center rounded-full text-2xl font-semibold sm:h-16 sm:w-16"
                  style={{ backgroundColor: `${accentColor}1a`, color: accentColor }}
                  aria-hidden="true"
                >
                  {isChild ? (
                    <svg viewBox="0 0 24 24" fill={accentColor} className="h-8 w-8" aria-label="Murió en la infancia">
                      {person?.sex === "F" && (<><circle cx="7.3" cy="8.3" r="1.9" /><circle cx="16.7" cy="8.3" r="1.9" /></>)}
                      <circle cx="12" cy="8" r={person?.sex === "F" ? 4.3 : 5} />
                      <path d="M8 20c0-2.8 1.8-5 4-5s4 2.2 4 5z" />
                    </svg>
                  ) : (
                    initialOf(person?.displayName ?? "")
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  {(person?.displayName || loading) && (
                    <h2 className="font-slab text-2xl font-bold leading-tight text-ink sm:text-3xl">{person?.displayName ?? "Cargando…"}</h2>
                  )}
                  {relationship && (
                    <p className="mt-1.5 text-lg font-bold text-burdeos">
                      {relationship}
                    </p>
                  )}
                  {person && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <span className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-base font-medium ${person.isLiving ? "bg-parra/10 text-parra" : "bg-burdeos/10 text-burdeos"}`}>
                        <span className={`h-2.5 w-2.5 rounded-full ${person.isLiving ? "bg-parra" : "bg-burdeos"}`} />
                        {person.isLiving ? (fem ? "Viva" : "Vivo") : fem ? "Fallecida" : person.sex === "M" ? "Fallecido" : "Fallecida/o"}
                      </span>
                      <span className="text-base text-gris">
                        <span className="font-maquina tabular-nums">{person.isLiving ? (born ? `n. ${born}` : "") : yearsLine(born, died) ?? ""}</span>
                        {ageText && <> · {ageText}</>}
                      </span>
                    </div>
                  )}
                </div>
                <button
                  onClick={onClose}
                  aria-label="Cerrar"
                  className="grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 border-ink bg-white text-lg text-ink hover:bg-adobe-2"
                >
                  ✕
                </button>
              </div>
            </div>

            {person && (
              <div className="space-y-3 px-5 pb-4 pt-3 sm:space-y-4 sm:pb-5 sm:pt-5 sm:px-7">
                {/* Sepultura */}
                {!person.isLiving &&
                  (isCremationPlace(site) ? (
                    <div className="rounded-2xl border-2 border-adobe-2 bg-white px-5 py-4">
                      <p className="text-base text-gris">Cremación</p>
                      <p className="text-xl font-bold text-burdeos">{cremadoText(person.sex)}</p>
                      <p className="mt-1 text-base text-gris">No hay tumba que visitar.</p>
                    </div>
                  ) : site ? (
                    <div className="flex flex-wrap items-center gap-4 rounded-2xl border-2 border-adobe-2 bg-white px-5 py-4">
                      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-burdeos/10 text-burdeos" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
                          <path d="M7 21V9a5 5 0 0 1 10 0v12" /><path d="M4 21h16" /><path d="M12 8v5M9.75 10.25h4.5" />
                        </svg>
                      </span>
                      <div className="min-w-0 flex-1 basis-48">
                        <p className="text-base text-gris">{fem ? "Sepultada en" : person.sex === "M" ? "Sepultado en" : "Sepultura"}</p>
                        <p className="font-slab text-xl font-bold leading-snug text-ink">{site}</p>
                        {where ? <p className="text-base text-gris">{where}</p> : canEdit ? <p className="text-base font-bold text-teja">Falta anotar la comuna</p> : null}
                        <p className="mt-0.5 text-base">
                          <span className="font-bold">Tumba: </span>
                          {tomb ? <span className="font-bold">{tomb}</span> : <span className="text-gris">{TOMB_UNKNOWN}</span>}
                        </p>
                        <a href={`/cementerios?p=${person.id}`} className="mt-1 inline-flex min-h-11 items-center font-bold text-ink underline decoration-2 underline-offset-4 hover:text-teja">
                          Ver en la guía de cementerios
                        </a>
                      </div>
                      {where && (
                        <a
                          href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent([site, info?.comuna, "Chile"].filter(Boolean).join(", "))}`}
                          target="_blank"
                          rel="noreferrer"
                          className={buttonClass("secundario", "shrink-0")}
                        >
                          Cómo llegar <span aria-hidden="true">↗</span>
                        </a>
                      )}
                    </div>
                  ) : canEdit ? (
                    <button
                      onClick={() => setEditing({ startWithNew: true })}
                      className="flex min-h-12 w-full items-center gap-2 rounded-2xl border-2 border-dashed border-ink/40 px-5 py-4 text-base text-ink hover:border-ink hover:bg-white"
                    >
                      <span aria-hidden="true">+</span> Agregar dónde está sepultad{fem ? "a" : person.sex === "M" ? "o" : "a/o"}
                    </button>
                  ) : null)}

                {/* Datos clave */}
                {(birthFact || deathFact || jobs.length > 0 || spouseIds.length > 0) && (() => {
                  const cells: React.ReactNode[] = [];
                  const label = (t: string) => <p className="text-base text-gris">{t}</p>;
                  if (birthFact) cells.push(<div key="b">{label("Nació")}<p className="mt-1 text-lg font-bold leading-snug text-ink">{birthFact.main}</p>{birthFact.sub && <p className="mt-1 text-base text-gris">{birthFact.sub}</p>}</div>);
                  if (deathFact) cells.push(<div key="d">{label(fem ? "Murió" : "Murió")}<p className="mt-1 text-lg font-bold leading-snug text-ink">{deathFact.main}</p>{deathFact.sub && <p className="mt-1 text-base text-gris">{deathFact.sub}</p>}</div>);
                  if (jobs.length > 0) cells.push(<div key="j">{label("Trabajo")}<p className="mt-1 text-lg font-bold leading-snug text-ink">{jobs.join(", ")}</p></div>);
                  if (spouseIds.length > 0)
                    cells.push(
                      <div key="s">
                        {label(spouseLabel)}
                        {spouseIds.map((id) => (
                          <button key={id} type="button" onClick={() => onNavigate(id)} className="mt-1 block min-h-11 text-left text-lg font-bold leading-snug text-ink underline decoration-2 underline-offset-4 hover:text-teja">
                            {byId.get(id)?.data?.label}
                          </button>
                        ))}
                        {childIds.length > 0 && <p className="mt-1 text-base text-gris">{childIds.length === 1 ? "1 hijo/a" : `${childIds.length} hijos`}</p>}
                      </div>,
                    );
                  // Con un solo dato, una sola columna; con más, de a dos (y se rellena el hueco si queda uno suelto).
                  const single = cells.length === 1;
                  if (!single && cells.length % 2 === 1) cells.push(<div key="pad" />);
                  return (
                    <div className={`grid ${single ? "grid-cols-1" : "grid-cols-2"} gap-px overflow-hidden rounded-2xl border-2 border-adobe-2 bg-adobe-2`}>
                      {cells.map((c, i) => (
                        <div key={i} className="bg-white p-3 sm:p-5">{c}</div>
                      ))}
                    </div>
                  );
                })()}

                {/* Acciones: las principales a la vista; el resto, bajo "Más". */}
                <div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    {canEdit && (
                      <button onClick={() => setEditing({ startWithNew: false })} className={buttonClass("principal")}>
                        Editar
                      </button>
                    )}
                    {person.id !== mainId && (
                      <button onClick={() => onNavigate(person.id)} className={btnOutline} aria-label="Centrar el árbol en esta persona">
                        <span className="sm:hidden">Centrar</span>
                        <span className="hidden sm:inline">Centrar el árbol</span>
                      </button>
                    )}
                    <button type="button" aria-expanded={moreOpen} onClick={() => setMoreOpen((o) => !o)} className={btnOutline}>
                      Más <span aria-hidden="true">{moreOpen ? "▴" : "▾"}</span>
                    </button>
                  </div>
                  {moreOpen && (
                    <div className="mt-2.5 flex flex-wrap gap-2.5">
                      {canEdit && (
                        <button onClick={() => setEditing({ startWithNew: true })} className={btnOutline}>
                          <span aria-hidden="true" className="leading-none">+</span> Agregar un hecho
                        </button>
                      )}
                      <a href={`/persona/${person.id}`} className={btnOutline}>
                        Página de la ficha
                      </a>
                      <a href={`/mapa?persona=${person.id}`} className={btnOutline}>
                        Mapa de antepasados
                      </a>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Pestañas */}
            {person && (
              <div role="tablist" className="sticky top-0 z-10 mt-1 flex gap-1 overflow-x-auto border-b-2 border-adobe-2 bg-adobe px-4 sm:px-6">
                {([["vida", "Línea de vida", visibleTimeline.length], ["familia", "Familia", familyCount], ["fuentes", "Fuentes", sourcesAll.length]] as const).map(([key, label, n]) => (
                  <button
                    key={key}
                    role="tab"
                    aria-selected={tab === key}
                    onClick={() => setTab(key)}
                    className={`-mb-px shrink-0 border-b-[3px] px-3 py-3.5 text-lg font-bold transition ${tab === key ? "border-burdeos text-ink" : "border-transparent text-gris hover:text-ink"}`}
                  >
                    {label} <span className="ml-0.5 font-maquina text-base font-normal text-gris">{n}</span>
                  </button>
                ))}
              </div>
            )}

            {loading && <p className="p-5 text-base text-gris">Cargando…</p>}

            {justSaved && (
              <p role="status" className="border-b-2 border-parra bg-parra/10 px-5 py-2.5 text-base font-bold text-parra">
                ✓ Cambios guardados
              </p>
            )}

            {person && tab === "vida" && (
              <>
                {person.notes && (
                  <div className="border-b-2 border-adobe-2 px-5 py-4 sm:px-7">
                    <p className="text-base font-bold uppercase tracking-wide text-gris">Notas</p>
                    <p className="mt-1 whitespace-pre-line text-base leading-relaxed text-ink">{person.notes}</p>
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-1 pt-5 sm:px-7">
                  <p className="text-base text-gris">
                    {visibleTimeline.length === 1 ? "1 hecho" : `${visibleTimeline.length} hechos`}
                    {familyFacts > 0 && <> · {ownCount} suyos y {familyFacts} de su familia</>}
                  </p>
                  {familyFacts > 0 && (
                    <label className="flex cursor-pointer items-center gap-2.5 text-base text-ink">
                      <input type="checkbox" className="h-6 w-6 accent-burdeos" checked={withFamily} onChange={(e) => setWithFamily(e.target.checked)} />
                      Incluir hechos de la familia
                    </label>
                  )}
                </div>
                <ul className="pb-2 pt-3">
                  {shownTimeline.length === 0 && <li className="px-7 py-5 text-base text-gris">Sin hechos registrados</li>}
                  {shownTimeline.map((e, i) => (
                    <TimelineItem
                      key={e.edit?.id ?? e.edit?.research ?? i}
                      entry={e}
                      accentColor={accentColor}
                      dotColor={e.person ? sexColorOf(byId.get(e.person.id)?.data?.gender) : accentColor}
                      onNavigate={onNavigate}
                      onChildDate={canEdit ? saveChildDate : undefined}
                      ownerName={person.displayName}
                      onAddParticipant={canEdit ? addParticipant : undefined}
                    />
                  ))}
                </ul>
              </>
            )}

            {person && tab === "familia" && (
              <div className="px-5 py-6 sm:px-7">
                {familyCount === 0 && <p className="text-base text-gris">{data.length ? "Sin familiares en el árbol." : "Cargando…"}</p>}
                {familySection("Padres", parentIds, (id) => yearsLine(byId.get(id)?.data?.birth_year, byId.get(id)?.data?.death_year))}
                {familySection(spouseIds.length > 1 ? "Parejas" : spouseLabel, spouseIds, (id) => {
                  const y = marriedIn(id);
                  const d = byId.get(id)?.data;
                  const unmarried = unionTypeOf(id) === "partnership";
                  return [unmarried ? "sin matrimonio" : y ? `Casados en ${y}` : null, d?.death_year ? `murió en ${d.death_year}` : d?.birth_year ? `n. ${d.birth_year}` : null].filter(Boolean).join(" · ") || null;
                })}
                {canEdit && (person.familiesAsPartner ?? []).some((f) => f.partner1_id && f.partner2_id) && (
                  <div className="mt-3 rounded-2xl border-2 border-dashed border-ink/40 px-4 py-3">
                    <p className="text-base font-bold text-ink">Tipo de unión</p>
                    <p className="mb-2 text-base text-gris">Una pareja puede tener hijos sin haberse casado.</p>
                    <ul className="space-y-2">
                      {(person.familiesAsPartner ?? [])
                        .filter((f) => f.partner1_id && f.partner2_id)
                        .map((f) => {
                          const other = f.partner1_id === person.id ? f.partner2_name : f.partner1_name;
                          const current = f.union_type ?? "marriage";
                          return (
                            <li key={f.id} className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-base text-ink">{other ?? "(sin nombre)"}</span>
                              <span className="inline-flex flex-wrap overflow-hidden rounded-2xl border-2 border-ink text-base font-bold">
                                {([["marriage", "Casados"], ["partnership", "Sin matrimonio"], ["unknown", "No se sabe"]] as const).map(([value, text]) => (
                                  <button
                                    key={value}
                                    type="button"
                                    disabled={unionBusy}
                                    onClick={() => changeUnion(f.id, value)}
                                    aria-pressed={current === value}
                                    className={`min-h-11 px-4 py-1.5 ${current === value ? "bg-burdeos text-white" : "bg-white text-ink hover:bg-adobe-2"}`}
                                  >
                                    {text}
                                  </button>
                                ))}
                              </span>
                            </li>
                          );
                        })}
                    </ul>
                    {unionError && <p role="alert" className="mt-2 text-base font-bold text-aviso">{unionError}</p>}
                  </div>
                )}
                {familySection("Hijos", childIds, (id) => {
                  const d = byId.get(id)?.data;
                  const ev = childBirth(id);
                  return [d?.birth_year ? `n. ${d.birth_year}` : null, cleanPlace(ev?.place), kinText(id)].filter(Boolean).join(" · ") || null;
                })}
              </div>
            )}

            {person && tab === "fuentes" && (
              <div className="px-5 py-6 sm:px-7">
                {sourcesAll.length === 0 ? (
                  <p className="text-base text-gris">Sin fuentes registradas todavía.</p>
                ) : (
                  <ul className="space-y-4">
                    {sourcesAll.map(({ source, context }) => (
                      <SourceLink key={source.url} source={source} context={context} />
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="shrink-0 border-t-2 border-adobe-2 px-5 py-3.5 text-base text-gris sm:px-7">
            <div className="flex items-center justify-between gap-3">
              <span>
                {person?.edited
                  ? `Editado${person.edited.by ? ` por ${person.edited.by}` : ""} el ${formatEdited(person.edited.at)}`
                  : "Archivo Zamora Balcázar"}
              </span>
            </div>
          </div>
        </>
      )}
    </aside>
    </>
  );
}

/** Al final del formulario de edición: eliminar a la persona, escribiendo su nombre para confirmar. */
function DeleteZone({ name, deleting, error, onDelete }: { name: string; deleting: boolean; error: string | null; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const norm = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const first = name.trim().split(/\s+/)[0] ?? "";
  const ok = first !== "" && norm(typed) === norm(first);
  return (
    <div className="mx-5 mb-6 mt-4 border-t-2 border-adobe-2 pt-5 sm:mx-7">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="min-h-12 text-base font-bold text-aviso underline decoration-2 underline-offset-4 hover:text-ink">
          Eliminar a esta persona del árbol…
        </button>
      ) : (
        <div role="alertdialog" aria-label="Confirmar eliminación" className="rounded-xl border-2 border-aviso bg-white p-4 text-ink">
          <p className="text-[1.125rem] font-bold">¿Eliminar a {name} del árbol?</p>
          <p className="mt-1 text-base text-ink">
            Se borran sus datos y hechos. Sus hijos y demás familiares se quedan en el árbol. Queda anotado en el historial.
          </p>
          <label className="mt-3 block text-base">
            Para confirmar, escribe <strong>{first}</strong>:
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              className="mt-1.5 block min-h-12 w-full rounded-lg border-2 border-[#8f8a80] bg-white px-3 text-[1.125rem] text-ink focus:border-aviso"
            />
          </label>
          {error && <p role="alert" className="mt-2 text-base font-medium">{error}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={onDelete} disabled={!ok || deleting} className="min-h-12 rounded-full bg-aviso px-5 text-base font-bold text-white hover:bg-ink disabled:opacity-40">
              {deleting ? "Eliminando…" : "Sí, eliminar"}
            </button>
            <button type="button" onClick={() => { setOpen(false); setTyped(""); }} disabled={deleting} className={buttonClass("secundario")}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
