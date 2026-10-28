"use client";

// El formulario de "Editar" de la ficha: muestra todo lo que la ficha tiene
// ahora (los datos de la persona y cada hecho) listo para corregir, y lo
// guarda junto con un solo botón. Valida con las mismas reglas que el
// servidor (src/lib/edit.ts) para avisar al tiro, pero quien decide es el
// servidor.

import BurialPlaceField from "./BurialPlaceField";
import PlaceField from "./PlaceField";
import { Notice, buttonClass } from "./ui";
import { useEffect, useId, useImperativeHandle, useMemo, useRef, useState, type ReactNode, type Ref } from "react";
import {
  EDITABLE_EVENT_TYPES,
  OCCUPATION_SUGGESTIONS,
  REVIEW_KINDS,
  EMPTY_EVENT_FORM,
  FAMILY_EVENT_TYPES,
  NEW_FAMILY_EVENT_TYPES,
  SINGLE_EVENT_TYPES,
  approxAgeAtDeath,
  validateEvent,
  validatePerson,
  withApproxAge,
  type EventForm,
  type ParticipantForm,
  type PersonForm,
} from "@/lib/edit";

type FieldErrors = Record<string, string>;

/** Errores por campo: los de la persona y los de cada hecho (por su clave). */
export type FichaFieldErrors = { person?: FieldErrors; events?: Record<string, FieldErrors> };

export type SaveOutcome = { ok: true } | { ok: false; error: string; fields?: FichaFieldErrors };

/** Un hecho de la ficha que se puede editar. */
export type EditableFact = {
  key: string;
  /** Hecho guardado en la base. */
  id: string | null;
  /** Hecho que todavía vive en data/investigacion.json. */
  research: string | null;
  form: EventForm;
  /** Para un hecho de familia (matrimonio…): "con Fulano de Tal". */
  hint?: string;
};

export type FichaPayload = {
  person: PersonForm;
  events: { key: string; id: string | null; research: string | null; remove?: true; form?: EventForm }[];
};

type Item = {
  key: string;
  id: string | null;
  research: string | null;
  /** Como estaba al abrir el formulario; null = hecho nuevo. */
  initial: EventForm | null;
  form: EventForm;
  removed: boolean;
  /** Para un hecho de familia (matrimonio…): "con Fulano de Tal". */
  hint?: string;
};

// Guía de estilo: texto de 18 px, campos y botones de al menos 48 px.
const inputClass =
  "mt-1.5 min-h-12 w-full rounded-lg border-2 border-[#8f8a80] bg-white px-3.5 py-2 text-[1.125rem] text-ink outline-none placeholder:text-gris/70 focus:border-ink focus:ring-4 focus:ring-ink/15 aria-[invalid=true]:border-aviso disabled:bg-adobe-2 disabled:text-gris";
const labelClass = "block text-base font-bold text-ink";
const sectionTitle = "text-base font-bold uppercase tracking-wide text-gris";
const textLink = "min-h-11 py-2 text-base font-bold text-ink underline decoration-2 underline-offset-4 hover:text-terra";
const dangerLink = "min-h-11 shrink-0 px-3 py-2 text-base font-semibold text-aviso underline decoration-2 underline-offset-4 hover:opacity-80";
const subBox = "flex flex-col gap-4 rounded-xl border-2 border-adobe-2 bg-white p-4";
const outlineBtn = buttonClass("secundario");

/** Una pareja de la persona, para elegir con quién fue un matrimonio nuevo. */
export type PartnerChoice = { familyId: string; name: string; hasMarriage: boolean };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const isBlank = (f: EventForm) =>
  !f.date.trim() && !f.place.trim() && !f.text.trim() && !f.subtype.trim() && !f.sourceUrl.trim() && !f.sourceTitle.trim() &&
  !f.sourceQuote.trim() && f.participants.length === 0 && !(f.type === "MARR" && f.familyId);

function typeLabel(form: EventForm): string {
  if (form.type === "EVEN" && form.subtype.trim()) return form.subtype.trim();
  return EDITABLE_EVENT_TYPES.find((t) => t.type === form.type)?.label ?? "Hecho";
}

/** Cuántas líneas darle a un texto para que se lea entero sin tener que desplazarlo. */
function rowsFor(text: string, min: number): number {
  const lines = text.split("\n").reduce((n, line) => n + Math.max(1, Math.ceil(line.length / 42)), 0);
  return Math.min(10, Math.max(min, lines));
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 text-base font-bold text-aviso">
      <span aria-hidden="true">⚠ </span>
      {message}
    </p>
  );
}

const MONTH_NAMES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
function daysInMonth(month: number, year: string): number {
  if (!month) return 31;
  if (month === 2) return year && /^\d{4}$/.test(year) ? (isLeap(Number(year)) ? 29 : 28) : 29;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

type SimpleDate = { day: string; month: string; year: string; approx: boolean };

/** "5 de mayo de 1891" | "mayo de 1891" | "1891" | "aprox. 1910" → sus partes, o null si es una fecha más compleja (rango, "antes de"…). */
function parseSimpleDate(raw: string): SimpleDate | null {
  let t = raw.trim();
  if (!t) return { day: "", month: "", year: "", approx: false };
  let approx = false;
  let m = /^aprox\.\s*(.+)$/i.exec(t);
  if (m) {
    approx = true;
    t = m[1];
  }
  m = /^(\d{1,2}) de ([a-zñáéíóú]+) de (\d{3,4})$/i.exec(t);
  if (m) {
    const month = MONTH_NAMES.indexOf(m[2].toLowerCase()) + 1;
    return month ? { day: String(Number(m[1])), month: String(month), year: m[3], approx } : null;
  }
  m = /^([a-zñáéíóú]+) de (\d{3,4})$/i.exec(t);
  if (m) {
    const month = MONTH_NAMES.indexOf(m[1].toLowerCase()) + 1;
    return month ? { day: "", month: String(month), year: m[2], approx } : null;
  }
  m = /^(\d{3,4})$/.exec(t);
  return m ? { day: "", month: "", year: m[1], approx } : null;
}

function buildSimpleDate({ day, month, year, approx }: SimpleDate): string {
  if (!year) return "";
  const m = Number(month);
  const text = day && m ? `${Number(day)} de ${MONTH_NAMES[m - 1]} de ${year}` : m ? `${MONTH_NAMES[m - 1]} de ${year}` : year;
  return approx ? `aprox. ${text}` : text;
}

// Para cuando no se sabe cuándo nació alguien pero sí cuándo y, a veces, a
// qué edad murió: con esa edad aproximada se puede estimar el año de
// nacimiento, dato útil para seguir investigando (y, si murió de niño, la
// tarjeta lleva la silueta infantil). No agrega un campo nuevo a la base: la
// nota queda escrita, a la vista, en el mismo cuadro de "Causa o detalle"
// (ver approxAgeAtDeath / withApproxAge en lib/edit.ts).
function ApproxAgeAtDeath({
  date,
  text,
  onChangeText,
}: {
  date: string;
  text: string;
  onChangeText: (text: string) => void;
}) {
  const uid = useId();
  const deathYear = Number(parseSimpleDate(date)?.year || "");
  const [age, setAge] = useState(() => String(approxAgeAtDeath(text) ?? ""));
  const birthYear = age && deathYear ? deathYear - Number(age) : null;

  const apply = (raw: string) => {
    setAge(raw);
    const n = Number(raw);
    const valid = raw !== "" && Number.isFinite(n) && n >= 0;
    onChangeText(withApproxAge(text, valid ? n : null, deathYear || null));
  };

  return (
    <div>
      <label htmlFor={`${uid}-age`} className={labelClass}>
        Edad aproximada al morir
      </label>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        <input
          id={`${uid}-age`}
          type="number"
          min={0}
          max={130}
          value={age}
          onChange={(e) => apply(e.target.value)}
          placeholder="años"
          className="min-h-12 w-28 rounded-lg border-2 border-[#8f8a80] bg-white px-3.5 py-2 text-[1.125rem] text-ink outline-none placeholder:text-gris/70 focus:border-ink focus:ring-4 focus:ring-ink/15"
        />
        {birthYear !== null && <span className="text-base text-gris">→ nacería aprox. en {birthYear}</span>}
        {!deathYear && age && <span className="text-base text-gris">(falta el año de la fecha para estimarlo)</span>}
      </div>
    </div>
  );
}

/**
 * La fecha se elige con desplegables (día, mes, año) en vez de escribirla, para
 * no confundirse con el formato. Un enlace la cambia a texto libre para los
 * casos que un calendario no puede decir: rangos, "antes de", "década de"…
 */
export function DateField({
  idPrefix,
  value,
  onChange,
  error,
}: {
  idPrefix: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const initial = useMemo(() => parseSimpleDate(value), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [mode, setMode] = useState<"simple" | "text">(initial ? "simple" : "text");
  const [simple, setSimple] = useState<SimpleDate>(initial ?? { day: "", month: "", year: "", approx: false });
  const [text, setText] = useState(value);

  const setAndEmit = (next: SimpleDate) => {
    setSimple(next);
    onChange(buildSimpleDate(next));
  };

  const maxDay = daysInMonth(Number(simple.month), simple.year);

  return (
    <div>
      {mode === "simple" ? (
        <div className="mt-1.5 grid grid-cols-[4.75rem_minmax(0,1fr)_6rem] gap-2.5">
          <select
            id={`${idPrefix}-day`}
            aria-label="Día"
            value={simple.day}
            onChange={(e) => setAndEmit({ ...simple, day: e.target.value })}
            className={`${inputClass} mt-0 px-2.5`}
          >
            <option value="">Día</option>
            {Array.from({ length: maxDay }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <select
            id={`${idPrefix}-month`}
            aria-label="Mes"
            value={simple.month}
            onChange={(e) => {
              const month = e.target.value;
              const day = simple.day && Number(simple.day) > daysInMonth(Number(month), simple.year) ? "" : simple.day;
              setAndEmit({ ...simple, month, day });
            }}
            className={`${inputClass} mt-0 px-2.5`}
          >
            <option value="">Mes</option>
            {MONTH_NAMES.map((n, i) => (
              <option key={n} value={i + 1}>
                {cap(n)}
              </option>
            ))}
          </select>
          <input
            id={`${idPrefix}-year`}
            aria-label="Año"
            inputMode="numeric"
            value={simple.year}
            onChange={(e) => setAndEmit({ ...simple, year: e.target.value.replace(/[^\d]/g, "").slice(0, 4) })}
            placeholder="Año"
            aria-invalid={Boolean(error)}
            className={`${inputClass} mt-0 px-2.5`}
          />
        </div>
      ) : (
        <input
          id={`${idPrefix}-text`}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            onChange(e.target.value);
          }}
          placeholder="entre 1944 y 1947 · antes de 1900 · década de 1920"
          aria-invalid={Boolean(error)}
          className={inputClass}
        />
      )}

      {mode === "simple" && simple.day && !simple.month && (
        <p className="mt-2 text-base text-gris" role="status">
          Falta elegir el mes para que se guarde el día {simple.day}.
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-0">
        {mode === "simple" ? (
          <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-base text-ink">
            <input
              type="checkbox"
              checked={simple.approx}
              onChange={(e) => setAndEmit({ ...simple, approx: e.target.checked })}
              className="h-6 w-6 rounded accent-ink"
            />
            Fecha aproximada
          </label>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={() => {
            if (mode === "simple") {
              setText(buildSimpleDate(simple));
              setMode("text");
            } else {
              const parsed = parseSimpleDate(text);
              setSimple(parsed ?? { day: "", month: "", year: "", approx: false });
              setMode("simple");
            }
          }}
          className={textLink}
        >
          {mode === "simple" ? "¿Rango, antes o década? Escríbela" : "Elegirla con los desplegables"}
        </button>
      </div>
      <FieldError id={`${idPrefix}-error`} message={error} />
    </div>
  );
}

type PersonMatch = { id: string; displayName: string; birthYear: number | null; isLiving: boolean };

/** Una fila de "persona relacionada": su rol, su nombre, y si ya está vinculada con alguien del árbol. */
function ParticipantRow({
  value,
  onChange,
  onRemove,
}: {
  value: ParticipantForm;
  onChange: (patch: Partial<ParticipantForm>) => void;
  onRemove: () => void;
}) {
  const [results, setResults] = useState<PersonMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.personId || value.name.trim().length < 2) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/persons/search?q=${encodeURIComponent(value.name)}`);
        const json = res.ok ? await res.json() : { results: [] };
        setResults(json.results ?? []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value.name, value.personId]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const showDropdown = open && !value.personId && value.name.trim().length >= 2;
  const field = `${inputClass} mt-0`;

  return (
    <div className="flex flex-col gap-3 rounded-xl border-2 border-adobe-2 bg-white p-3.5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[11rem_minmax(0,1fr)]">
        <input
          value={value.role}
          onChange={(e) => onChange({ role: e.target.value })}
          placeholder="Padrino, madrina…"
          aria-label="Qué fue (padrino, testigo…)"
          className={field}
        />
        <div ref={boxRef} className="relative min-w-0">
          <input
            value={value.name}
            onChange={(e) => {
              onChange({ name: e.target.value, personId: null });
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder="Nombre"
            aria-label="Nombre de la persona"
            className={`${field} ${value.personId ? "border-listo bg-parra/10" : ""}`}
          />
          {showDropdown && (
            <ul className="absolute left-0 top-full z-10 mt-1 max-h-60 w-full min-w-[14rem] overflow-auto rounded-xl border-2 border-line bg-white py-1 text-base shadow-lg">
              {searching && <li className="px-3.5 py-2.5 text-gris">Buscando…</li>}
              {!searching && results.length === 0 && (
                <li className="px-3.5 py-2.5 text-gris">Nadie en el árbol con ese nombre: queda pendiente.</li>
              )}
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange({ name: r.displayName, personId: r.id });
                      setOpen(false);
                    }}
                    className="flex min-h-12 w-full items-center justify-between gap-3 px-3.5 py-2 text-left hover:bg-paper"
                  >
                    <span className="min-w-0 truncate font-bold">{r.displayName}</span>
                    <span className="shrink-0 text-gris">
                      {r.birthYear ?? "s/f"}
                      {!r.isLiving && " †"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4">
        {value.personId ? (
          <p className="text-base font-bold text-listo">
            <span aria-hidden="true">✓ </span>Vinculada con el árbol.{" "}
            <button type="button" onClick={() => onChange({ personId: null })} className="underline decoration-2 underline-offset-4">
              Desvincular
            </button>
          </p>
        ) : value.name.trim() ? (
          <p className="text-base text-gris">Sin vincular: se guarda el nombre y se puede vincular después.</p>
        ) : (
          <span />
        )}
        <button type="button" onClick={onRemove} className={dangerLink}>
          Quitar
        </button>
      </div>
    </div>
  );
}

/**
 * Oficio de la persona: se escribe o se elige con un toque entre los más comunes en
 * las actas. Un acta anota el oficio de ese momento, así que se explica que cada
 * documento puede traer uno distinto (y que se agrega un hecho por cada uno).
 */
function OccupationField({
  id,
  value,
  onChange,
  error,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  const current = value.trim().toLowerCase();
  const picked = (name: string) => current.split(/\s*,\s*/).includes(name.toLowerCase());
  // Un toque elige el oficio; otro toque en el mismo lo quita; si ya hay otro escrito, se suma.
  const toggle = (name: string) => {
    if (picked(name)) {
      onChange(
        value
          .split(/\s*,\s*/)
          .filter((x) => x.trim() && x.trim().toLowerCase() !== name.toLowerCase())
          .join(", "),
      );
    } else {
      onChange(value.trim() ? `${value.trim().replace(/,\s*$/, "")}, ${name}` : name);
    }
  };
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        Oficio u ocupación
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rowsFor(value, 1)}
        placeholder="Escríbelo como lo anota el documento: peón, zapatero, regidor municipal de Curicó…"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : `${id}-help`}
        className={`${inputClass} mt-1.5`}
      />
      <FieldError id={`${id}-error`} message={error} />
      <div className="mt-2.5 flex flex-wrap gap-2" role="group" aria-label="Oficios frecuentes">
        {OCCUPATION_SUGGESTIONS.map((name) => {
          const on = picked(name);
          return (
            <button
              key={name}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(name)}
              className={`min-h-11 rounded-full border-2 px-4 py-1 text-base transition ${
                on
                  ? "border-burdeos bg-burdeos font-bold text-white"
                  : "border-ink/40 bg-white text-ink hover:border-ink"
              }`}
            >
              {name}
            </button>
          );
        })}
      </div>
      <p id={`${id}-help`} className="mt-2.5 text-base leading-snug text-gris">
        Cada documento anota el oficio de ese momento: alguien puede figurar como peón en un acta y como labrador en otra.
        Agrega un hecho por cada documento, cada uno con su fuente.
      </p>
    </div>
  );
}

function ParticipantsField({
  participants,
  onChange,
}: {
  participants: ParticipantForm[];
  onChange: (participants: ParticipantForm[]) => void;
}) {
  return (
    <fieldset className={subBox}>
      <legend className="px-1 text-base font-semibold text-ink">Personas relacionadas (padrinos, testigos…)</legend>
      {participants.length === 0 && <p className="zb-apoyo">Nadie agregado todavía.</p>}
      {participants.length > 0 && (
        <div className="flex flex-col gap-3">
          {participants.map((p, i) => (
            <ParticipantRow
              key={i}
              value={p}
              onChange={(patch) => onChange(participants.map((item, idx) => (idx === i ? { ...item, ...patch } : item)))}
              onRemove={() => onChange(participants.filter((_, idx) => idx !== i))}
            />
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => onChange([...participants, { role: "", name: "", personId: null }])}
        className={outlineBtn + " self-start"}
      >
        + Agregar una persona
      </button>
    </fieldset>
  );
}

/** Año que se muestra a la izquierda de un hecho (el de su fecha, si se puede leer). */
function yearOfDate(date: string): { year: string | null; approx: boolean } {
  const m = /\b(\d{4})\b/.exec(date);
  return { year: m ? m[1] : null, approx: /aprox|antes|después|entre|década/i.test(date) };
}

/**
 * Una fila de la línea de vida: el año a la izquierda, un punto en el riel y el
 * contenido a la derecha, igual que en la ficha (ver TimelineRow en PersonPanel).
 */
function TimelineRow({
  year,
  approx,
  dotColor,
  hideYearOnPhone,
  rowRef,
  factKey,
  children,
}: {
  year: string | null;
  approx: boolean;
  dotColor: string;
  hideYearOnPhone?: boolean;
  rowRef?: Ref<HTMLLIElement>;
  factKey: string;
  children: React.ReactNode;
}) {
  return (
    <li ref={rowRef} data-fact={factKey} className="group/item flex gap-3 px-5 sm:gap-4 sm:px-7">
      <div className={`w-[4.5rem] shrink-0 pt-5 text-right ${hideYearOnPhone ? "hidden sm:block" : ""}`}>
        {year ? (
          <div className="font-maquina text-xl leading-none text-ink">
            {approx && <span className="mr-1 font-body text-base font-normal text-gris">c.</span>}
            {year}
          </div>
        ) : (
          <div className="font-maquina text-base leading-[20px] text-gris" title="Sin fecha">
            s/f
          </div>
        )}
      </div>
      <div className="relative w-5 shrink-0" aria-hidden="true">
        <span className="absolute bottom-0 left-1/2 top-0 w-0.5 -translate-x-1/2 bg-ink/25 group-first/item:top-6 group-last/item:bottom-auto group-last/item:h-6" />
        <span
          className="absolute left-1/2 top-[1.15rem] h-4 w-4 -translate-x-1/2 rounded-full border-[3px] bg-white"
          style={{ borderColor: dotColor, boxShadow: `0 0 0 3px ${dotColor}22` }}
        />
      </div>
      <div className="min-w-0 flex-1 pb-6 pt-5">{children}</div>
    </li>
  );
}

function FactCard({
  item,
  errors,
  takenTypes,
  partners,
  autoFocus,
  dotColor,
  onChange,
  onParticipantsChange,
  onRemove,
  onRestore,
  canReview,
}: {
  item: Item;
  errors: FieldErrors;
  /** Hechos únicos (nacimiento, defunción, sepultura) que ya ocupa otro recuadro. */
  takenTypes: Set<string>;
  /** Parejas con quienes se puede registrar un matrimonio nuevo. */
  partners: PartnerChoice[];
  autoFocus: boolean;
  /** Color del punto del riel (según el sexo de la persona, como en la ficha). */
  dotColor: string;
  onChange: (field: keyof EventForm, value: string) => void;
  onParticipantsChange: (participants: ParticipantForm[]) => void;
  onRemove: () => void;
  onRestore: () => void;
  /** Solo administradores: se ofrece marcar el hecho como pendiente. */
  canReview: boolean;
}) {
  const uid = useId();
  const { form } = item;
  const isNew = item.initial === null;
  const [showSource, setShowSource] = useState(Boolean(form.sourceUrl || form.sourceTitle || form.sourceQuote));
  // Un hecho guardado se ve como en la ficha; se abre para corregirlo con "Cambiar".
  const [open, setOpen] = useState(isNew);
  const rowRef = useRef<HTMLLIElement>(null);
  const typeInfo = EDITABLE_EVENT_TYPES.find((t) => t.type === form.type) ?? EDITABLE_EVENT_TYPES[0];
  const hasErrors = Object.keys(errors).length > 0;
  const isJob = form.type === "OCCU";
  const structuredPlace = form.type === "DEAT" || form.type === "BIRT";
  const expanded = open || hasErrors;
  const sourceOpen = showSource || Boolean(errors.sourceUrl);
  const changed = !isNew && item.initial !== null && !same(form, item.initial);
  const { year, approx } = yearOfDate(form.date);
  const dot = hasErrors ? "#b3261e" : dotColor;
  // Un matrimonio (o similar) es de la pareja, no de esta persona sola: no
  // cambia de tipo desde acá, y tampoco se ofrece al agregar un hecho nuevo.
  // Tampoco se cambia el tipo de un hecho que esta lista no sabe nombrar.
  const isFamilyFact = !isNew && (FAMILY_EVENT_TYPES.has(form.type) || !EDITABLE_EVENT_TYPES.some((t) => t.type === form.type));

  // Un hecho recién agregado queda a la vista y listo para escribir.
  useEffect(() => {
    if (!autoFocus) return;
    rowRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    rowRef.current?.querySelector<HTMLElement>("select, input")?.focus({ preventScroll: true });
  }, [autoFocus]);

  if (item.removed) {
    const summary = [form.date, form.place].filter(Boolean).join(" · ");
    return (
      <TimelineRow year={year} approx={approx} dotColor="#8f8a80" rowRef={rowRef} factKey={item.key}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border-2 border-dashed border-aviso bg-white px-4 py-3">
          <p className="min-w-0 flex-1 text-base leading-snug text-ink">
            <span className="font-bold uppercase tracking-wide line-through">{typeLabel(form)}</span>
            {summary && <span className="line-through"> · {summary}</span>}
            <span className="block font-semibold text-aviso">Se borrará al guardar.</span>
          </p>
          <button type="button" onClick={onRestore} className={outlineBtn}>
            Deshacer
          </button>
        </div>
      </TimelineRow>
    );
  }

  if (!expanded) {
    const detail = [form.date, form.place].filter(Boolean).join(" · ");
    const linked = form.participants.filter((p) => p.name.trim());
    const hasSource = Boolean(form.sourceUrl || form.sourceTitle);
    return (
      <TimelineRow year={year} approx={approx} dotColor={dot} rowRef={rowRef} factKey={item.key}>
        <div className="flex flex-col items-start gap-3 sm:flex-row">
          <div className="min-w-0 flex-1">
            <p className="text-base font-bold uppercase tracking-wide text-ink">
              {typeLabel(form)}
              {item.hint && <span className="font-normal normal-case tracking-normal text-gris"> · {item.hint}</span>}
              {changed && (
                <span className="ml-2 rounded-full bg-teja/10 px-2 py-0.5 align-middle text-base font-bold normal-case tracking-normal text-teja">
                  Con cambios
                </span>
              )}
            </p>
            {detail && <p className="mt-1.5 text-base text-ink">{detail}</p>}
            {form.text.trim() && <p className="mt-1.5 whitespace-pre-line text-base text-ink">{form.text}</p>}
            {linked.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1 text-base text-ink">
                {linked.map((pt, i) => (
                  <li key={i}>
                    {pt.role ? `${pt.role}: ` : ""}
                    {pt.name}
                    {pt.personId ? <span className="ml-1 text-listo">✓</span> : <span className="ml-1 text-gris">(sin vincular)</span>}
                  </li>
                ))}
              </ul>
            )}
            {hasSource && (
              <div className="mt-3 flex max-w-full items-start gap-3 rounded-xl border-2 border-adobe-2 bg-white px-3.5 py-2.5 text-base leading-snug text-ink">
                <span className="mt-0.5 shrink-0 rounded-md bg-adobe-2 px-2 py-0.5 text-base font-bold text-ink">Fuente</span>
                <span className="min-w-0 flex-1 break-words">{form.sourceTitle || form.sourceUrl}</span>
              </div>
            )}
          </div>
          <button type="button" onClick={() => setOpen(true)} className={`${outlineBtn} shrink-0`}>
            Cambiar
          </button>
        </div>
      </TimelineRow>
    );
  }

  return (
    <TimelineRow year={year} approx={approx} dotColor={dot} hideYearOnPhone rowRef={rowRef} factKey={item.key}>
      <div className="rounded-xl border-2 border-adobe-2 bg-white p-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {isFamilyFact ? (
            // Un matrimonio (y similares) no cambia de tipo desde una ficha: es
            // de la pareja, se corrige el que ya hay, no se convierte en otro.
            <span className="text-base font-bold uppercase tracking-wide text-ink">{typeLabel(form)}</span>
          ) : (
            <>
              <label htmlFor={`${uid}-type`} className="sr-only">
                Tipo de hecho
              </label>
              <select
                id={`${uid}-type`}
                value={form.type}
                onChange={(e) => onChange("type", e.target.value)}
                aria-invalid={Boolean(errors.type)}
                aria-describedby={errors.type ? `${uid}-type-error` : undefined}
                className="min-h-11 min-w-0 max-w-full rounded-lg border-2 border-[#8f8a80] bg-white py-2 pl-3 pr-9 text-base font-bold text-ink outline-none focus:border-ink focus:ring-4 focus:ring-ink/15 aria-[invalid=true]:border-aviso"
              >
                {form.type === "" && (
                  <option value="" disabled>
                    Elige qué hecho es…
                  </option>
                )}
                {EDITABLE_EVENT_TYPES.filter((t) => !FAMILY_EVENT_TYPES.has(t.type) || NEW_FAMILY_EVENT_TYPES.has(t.type)).map((t) => {
                  const taken = SINGLE_EVENT_TYPES.has(t.type) && takenTypes.has(t.type);
                  return (
                    <option key={t.type} value={t.type} disabled={taken}>
                      {t.label}
                      {taken ? " (ya está)" : ""}
                    </option>
                  );
                })}
              </select>
            </>
          )}
          {item.hint && <span className="min-w-0 truncate text-base text-gris">{item.hint}</span>}
          {isNew && <span className="rounded-full bg-parra/10 px-2.5 py-0.5 text-base font-bold text-parra">Nuevo</span>}
          <div className="ml-auto flex items-center">
            {!isNew && !hasErrors && (
              <button type="button" onClick={() => setOpen(false)} className="min-h-11 px-3 py-2 text-base font-semibold text-ink underline decoration-2 underline-offset-4 hover:text-terra">
                Cerrar
              </button>
            )}
            <button type="button" onClick={onRemove} className={dangerLink}>
              Quitar
            </button>
          </div>
        </div>
        <FieldError id={`${uid}-type-error`} message={errors.type} />

      <div className="mt-4 flex flex-col gap-5">
        {isNew && form.type === "MARR" && (
          <div>
            <label htmlFor={`${uid}-family`} className={labelClass}>
              Con quién se casó
            </label>
            {partners.length === 0 ? (
              <div className="mt-1.5">
                <Notice kind="aviso">
                  Todavía no tiene una pareja en el árbol. Primero agrégala con el «+» de su tarjeta (Agregar pareja) y
                  después registra el matrimonio.
                </Notice>
              </div>
            ) : (
              <select
                id={`${uid}-family`}
                value={form.familyId ?? ""}
                onChange={(e) => onChange("familyId", e.target.value)}
                aria-invalid={Boolean(errors.familyId)}
                aria-describedby={errors.familyId ? `${uid}-family-error` : undefined}
                className={inputClass}
              >
                <option value="" disabled>
                  Elige a su pareja…
                </option>
                {partners.map((p) => (
                  <option key={p.familyId} value={p.familyId} disabled={p.hasMarriage}>
                    {p.name}
                    {p.hasMarriage ? " (ya tiene matrimonio)" : ""}
                  </option>
                ))}
              </select>
            )}
            <FieldError id={`${uid}-family-error`} message={errors.familyId} />
          </div>
        )}
        {form.type === "EVEN" && (
          <div>
            <label htmlFor={`${uid}-subtype`} className={labelClass}>
              Nombre del hecho
            </label>
            <input
              id={`${uid}-subtype`}
              value={form.subtype}
              onChange={(e) => onChange("subtype", e.target.value)}
              placeholder="Servicio militar, Confirmación, Viaje…"
              aria-invalid={Boolean(errors.subtype)}
              aria-describedby={errors.subtype ? `${uid}-subtype-error` : undefined}
              className={inputClass}
            />
            <FieldError id={`${uid}-subtype-error`} message={errors.subtype} />
          </div>
        )}

        {isJob && (
          // El oficio va primero: es lo que se busca al leer la ficha.
          <OccupationField
            id={`${uid}-text`}
            value={form.text}
            onChange={(v) => onChange("text", v)}
            error={errors.text}
          />
        )}

        {form.type === "BURI" ? (
          // La sepultura no pide fecha: importa en qué cementerio está.
          <BurialPlaceField id={`${uid}-place`} value={form.place} onChange={(v) => onChange("place", v)} />
        ) : (
          <>
            <div>
              <span className={labelClass}>{isJob ? "¿Cuándo?" : "Fecha"}</span>
              {isJob && (
                <p className="mt-0.5 text-base text-gris">
                  El año del documento donde aparece (un acta de matrimonio, un registro civil…) o el período en que lo ejerció.
                </p>
              )}
              <DateField
                idPrefix={`${uid}-date`}
                value={form.date}
                onChange={(v) => onChange("date", v)}
                error={errors.date}
              />
            </div>

            <div>
              {structuredPlace ? (
                // Dónde nació o murió: región y comuna de una lista (como los cementerios) y el lugar exacto aparte.
                <PlaceField
                  id={`${uid}-place`}
                  value={form.place}
                  onChange={(v) => onChange("place", v)}
                  label={form.type === "DEAT" ? "Dónde murió" : "Dónde nació"}
                  detailHint={form.type === "DEAT" ? "Hospital San Vicente de Paul, domicilio, fundo…" : "Hospital, domicilio, fundo…"}
                />
              ) : (
                <>
                  <label htmlFor={`${uid}-place`} className={labelClass}>
                    {isJob ? "Dónde trabajaba" : "Lugar"}
                  </label>
                  <input
                    id={`${uid}-place`}
                    value={form.place}
                    onChange={(e) => onChange("place", e.target.value)}
                    placeholder={isJob ? "p. ej. Hacienda Escorial, Buin" : "p. ej. Parroquia de San José, Curicó"}
                    className={inputClass}
                  />
                </>
              )}
            </div>
          </>
        )}

        {!isJob && (
          <div>
            <label htmlFor={`${uid}-text`} className={labelClass}>
              {typeInfo.textLabel}
            </label>
            <textarea
              id={`${uid}-text`}
              value={form.text}
              onChange={(e) => onChange("text", e.target.value)}
              rows={rowsFor(form.text, 2)}
              placeholder={typeInfo.textHint}
              aria-invalid={Boolean(errors.text)}
              aria-describedby={errors.text ? `${uid}-text-error` : undefined}
              className={inputClass}
            />
            <FieldError id={`${uid}-text-error`} message={errors.text} />
          </div>
        )}

        {form.type === "DEAT" && (
          <ApproxAgeAtDeath date={form.date} text={form.text} onChangeText={(t) => onChange("text", t)} />
        )}

        <ParticipantsField
          participants={form.participants}
          onChange={(participants) => onParticipantsChange(participants)}
        />

        {sourceOpen ? (
          <fieldset className={subBox}>
            <legend className="px-1 text-base font-semibold text-ink">Fuente (de dónde salió el dato)</legend>
            <div>
              <label htmlFor={`${uid}-surl`} className={labelClass}>
                Enlace
              </label>
              <input
                id={`${uid}-surl`}
                value={form.sourceUrl}
                onChange={(e) => onChange("sourceUrl", e.target.value)}
                placeholder="https://…"
                inputMode="url"
                aria-invalid={Boolean(errors.sourceUrl)}
                aria-describedby={errors.sourceUrl ? `${uid}-surl-error` : undefined}
                className={inputClass}
              />
              <FieldError id={`${uid}-surl-error`} message={errors.sourceUrl} />
            </div>
            <div>
              <label htmlFor={`${uid}-stitle`} className={labelClass}>
                Qué es
              </label>
              <input
                id={`${uid}-stitle`}
                value={form.sourceTitle}
                onChange={(e) => onChange("sourceTitle", e.target.value)}
                placeholder="Registro de bautismos, parroquia de Curicó, 1891"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor={`${uid}-squote`} className={labelClass}>
                Cita textual (opcional)
              </label>
              <textarea
                id={`${uid}-squote`}
                value={form.sourceQuote}
                onChange={(e) => onChange("sourceQuote", e.target.value)}
                rows={rowsFor(form.sourceQuote, 2)}
                className={inputClass}
              />
            </div>
          </fieldset>
        ) : (
          <button type="button" onClick={() => setShowSource(true)} className={outlineBtn + " self-start"}>
            + Agregar la fuente (enlace)
          </button>
        )}

        {canReview && (
          <div className={`rounded-xl border-2 p-4 ${form.review ? "border-teja bg-white" : "border-adobe-2 bg-white"}`}>
            <label htmlFor={`${uid}-review`} className={labelClass}>
              Pendiente
            </label>
            <select
              id={`${uid}-review`}
              value={form.review ?? ""}
              onChange={(e) => onChange("review", e.target.value)}
              className={inputClass}
            >
              <option value="">Ninguno</option>
              {REVIEW_KINDS.map((k) => (
                <option key={k.key} value={k.key}>
                  {k.label}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-base text-gris">
              {REVIEW_KINDS.find((k) => k.key === form.review)?.hint ??
                "Si queda marcado, la persona se señala en el árbol y el hecho aparece en la pestaña Pendientes."}
            </p>
            {form.review ? (
              <div className="mt-3">
                <label htmlFor={`${uid}-review-note`} className={labelClass}>
                  Comentario (opcional)
                </label>
                <textarea
                  id={`${uid}-review-note`}
                  value={form.reviewNote ?? ""}
                  onChange={(e) => onChange("reviewNote", e.target.value)}
                  rows={rowsFor(form.reviewNote ?? "", 3)}
                  maxLength={600}
                  placeholder="p. ej. Ver si el acta confirma la edad de los padres"
                  className={inputClass}
                />
                <p className="mt-1.5 text-base text-gris">Se muestra en Pendientes y en la ficha, para acordarte qué buscar.</p>
              </div>
            ) : null}
          </div>
        )}
      </div>
      </div>
    </TimelineRow>
  );
}

/** Lo que la ficha puede pedirle al formulario desde fuera. */
export type FichaFormHandle = {
  /** Lo mismo que "Cancelar": si hay cambios sin guardar, pregunta antes de salir. */
  requestClose: () => void;
};

export function FichaForm({
  ref,
  person,
  facts,
  notEditable,
  partners = [],
  startWithNew,
  startTab,
  canReview = false,
  onSave,
  onClose,
  footer,
}: {
  ref?: Ref<FichaFormHandle>;
  person: PersonForm;
  facts: EditableFact[];
  /** Lo que la ficha muestra pero no se cambia desde aquí (matrimonio, hijos…). */
  notEditable: string[];
  /** Parejas de la persona, para elegir con quién fue un matrimonio nuevo. */
  partners?: PartnerChoice[];
  /** Abrir ya con un hecho nuevo en blanco (botón "Agregar un hecho"). */
  startWithNew: boolean;
  /** Pestaña con la que se abre (por ejemplo "vida" para llegar directo a los hechos, como la sepultura). */
  startTab?: "datos" | "vida";
  /** Solo administradores: cada hecho puede marcarse como pendiente. */
  canReview?: boolean;
  onSave: (payload: FichaPayload) => Promise<SaveOutcome>;
  /** Salir del formulario sin guardar. */
  onClose: () => void;
  /** Lo que va al final del formulario (por ejemplo, eliminar a la persona). */
  footer?: ReactNode;
}) {
  const uid = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const nextKey = useRef(startWithNew ? 1 : 0);
  const blankItem = (n: number): Item => ({
    key: `nuevo-${n}`,
    id: null,
    research: null,
    initial: null,
    // Sin tipo elegido: quien agrega el hecho dice qué es, no se asume ninguno.
    form: { ...EMPTY_EVENT_FORM, type: "" },
    removed: false,
  });

  const [personForm, setPersonForm] = useState<PersonForm>(person);
  const [items, setItems] = useState<Item[]>(() => [
    ...facts.map((f) => ({ key: f.key, id: f.id, research: f.research, initial: f.form, form: f.form, removed: false, hint: f.hint })),
    ...(startWithNew ? [blankItem(0)] : []),
  ]);
  const [focusKey, setFocusKey] = useState<string | null>(startWithNew ? "nuevo-0" : null);
  const [personErrors, setPersonErrors] = useState<FieldErrors>({});
  const [eventErrors, setEventErrors] = useState<Record<string, FieldErrors>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [tab, setTab] = useState<"datos" | "vida">(startWithNew ? "vida" : startTab ?? "datos");

  const changedItems = useMemo(
    () =>
      items.filter((it) => {
        if (it.initial === null) return !it.removed && !isBlank(it.form);
        return it.removed || !same(it.form, it.initial);
      }),
    [items],
  );
  const dirty = !same(personForm, person) || changedItems.length > 0;

  const requestClose = () => {
    if (saving) return;
    if (dirty) setConfirmDiscard(true);
    else onClose();
  };
  // La ✕ de la ficha pide lo mismo que "Cancelar".
  useImperativeHandle(ref, () => ({ requestClose }));

  const setPersonField = <K extends keyof PersonForm>(key: K, value: PersonForm[K]) => {
    setPersonForm((f) => ({ ...f, [key]: value }));
    setError(null);
    // Al corregir un campo se borra su aviso: ya no describe lo que hay escrito.
    if (personErrors[key]) setPersonErrors((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => k !== key)));
  };
  const patchItem = (key: string, patch: Partial<Item>) =>
    setItems((list) => list.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  const setFactField = (item: Item, field: keyof EventForm, value: string) => {
    const next = { ...item.form, [field]: value };
    // Con una sola pareja posible, el matrimonio ya queda con ella.
    if (field === "type" && value === "MARR" && !next.familyId) {
      const open = partners.filter((p) => !p.hasMarriage);
      if (open.length === 1) next.familyId = open[0].familyId;
    }
    patchItem(item.key, { form: next });
    setError(null);
    if (eventErrors[item.key]?.[field]) {
      setEventErrors((prev) => ({
        ...prev,
        [item.key]: Object.fromEntries(Object.entries(prev[item.key]).filter(([k]) => k !== field)),
      }));
    }
  };
  const removeItem = (item: Item) => {
    // Un hecho nuevo que se quita simplemente desaparece; uno guardado queda marcado y se puede deshacer.
    if (item.initial === null) setItems((list) => list.filter((it) => it.key !== item.key));
    else patchItem(item.key, { removed: true });
    setEventErrors((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => k !== item.key)));
  };
  const addItem = () => {
    const item = blankItem(nextKey.current++);
    setItems((list) => [...list, item]);
    setFocusKey(item.key);
  };

  /** Deja a la vista (y con el cursor) el primer campo con error. */
  const showFirstError = () => {
    requestAnimationFrame(() => {
      // Solo cuenta lo que está a la vista (la otra pestaña queda oculta).
      const field = Array.from(formRef.current?.querySelectorAll<HTMLElement>('[aria-invalid="true"]') ?? []).find((el) => el.offsetParent !== null);
      field?.scrollIntoView({ block: "center", behavior: "smooth" });
      field?.focus({ preventScroll: true });
    });
  };

  const fail = (message: string, fields?: FichaFieldErrors) => {
    const p = fields?.person ?? {};
    const ev = fields?.events ?? {};
    setPersonErrors(p);
    setEventErrors(ev);
    const count = Object.keys(p).length + Object.values(ev).reduce((n, e) => n + Object.keys(e).length, 0);
    setError(count ? `No se guardó: hay ${count === 1 ? "un campo" : `${count} campos`} por revisar.` : message);
    if (count) {
      // Se abre la pestaña donde está el primer error, antes de buscarlo.
      setTab(Object.keys(p).length ? "datos" : "vida");
      showFirstError();
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!dirty) return onClose();

    const fields: FichaFieldErrors = {};
    const personCheck = validatePerson(personForm);
    if (!personCheck.ok) fields.person = personCheck.errors;
    for (const it of changedItems) {
      if (it.removed) continue;
      // La fecha de un hecho guardado que no se tocó se acepta tal cual (puede ser una que no sabemos leer).
      const check = validateEvent(it.form, it.id ? it.initial!.date : null);
      if (!check.ok) (fields.events ??= {})[it.key] = check.errors;
    }
    if (fields.person || fields.events) return fail("", fields);

    setSaving(true);
    setError(null);
    setPersonErrors({});
    setEventErrors({});
    const result = await onSave({
      person: personForm,
      events: changedItems.map((it) =>
        it.removed
          ? { key: it.key, id: it.id, research: it.research, remove: true as const }
          : { key: it.key, id: it.id, research: it.research, form: it.form },
      ),
    });
    setSaving(false);
    if (!result.ok) fail(result.error, result.fields);
  };

  const usedSingleTypes = (except: string) =>
    new Set(items.filter((it) => it.key !== except && !it.removed && SINGLE_EVENT_TYPES.has(it.form.type)).map((it) => it.form.type));

  const personChanged = !same(personForm, person);
  const unsaved = [
    personChanged && "los datos de la persona",
    changedItems.length > 0 && `${changedItems.length} ${changedItems.length === 1 ? "hecho" : "hechos"}`,
  ]
    .filter(Boolean)
    .join(" y ");

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
      {/* Pestañas, como en la ficha: los datos de la persona y su línea de vida. */}
      <div role="tablist" className="flex shrink-0 gap-1 overflow-x-auto border-b-2 border-adobe-2 bg-adobe px-4 sm:px-6">
        {([["datos", "Datos", null], ["vida", "Línea de vida", items.filter((it) => !it.removed).length]] as const).map(([key, label, n]) => {
          const bad = key === "datos" ? Object.keys(personErrors).length > 0 : Object.keys(eventErrors).length > 0;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`-mb-px shrink-0 border-b-[3px] px-3 py-3.5 text-lg font-bold transition ${tab === key ? "border-burdeos text-ink" : "border-transparent text-gris hover:text-ink"}`}
            >
              {label}
              {n !== null && <span className="ml-1.5 text-base font-normal text-gris">{n}</span>}
              {bad && <span aria-label="hay campos por revisar" className="ml-1.5 text-aviso">⚠</span>}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto bg-white">
        <div role="tabpanel" hidden={tab !== "datos"} className="px-5 py-6 sm:px-7">
          <h3 className={sectionTitle}>Datos de la persona</h3>
          <div className="mt-3 flex flex-col gap-5">
          <div>
            <label htmlFor={`${uid}-given`} className={labelClass}>
              Nombres
            </label>
            <input
              id={`${uid}-given`}
              value={personForm.given}
              onChange={(e) => setPersonField("given", e.target.value)}
              aria-invalid={Boolean(personErrors.given)}
              aria-describedby={personErrors.given ? `${uid}-given-error` : undefined}
              className={inputClass}
            />
            <FieldError id={`${uid}-given-error`} message={personErrors.given} />
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor={`${uid}-pat`} className={labelClass}>
                Apellido paterno
              </label>
              <input id={`${uid}-pat`} value={personForm.surnamePat} onChange={(e) => setPersonField("surnamePat", e.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor={`${uid}-mat`} className={labelClass}>
                Apellido materno
              </label>
              <input id={`${uid}-mat`} value={personForm.surnameMat} onChange={(e) => setPersonField("surnameMat", e.target.value)} className={inputClass} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor={`${uid}-sex`} className={labelClass}>
                Sexo
              </label>
              <select
                id={`${uid}-sex`}
                value={personForm.sex}
                onChange={(e) => setPersonField("sex", e.target.value)}
                aria-invalid={Boolean(personErrors.sex)}
                className={inputClass}
              >
                <option value="F">Mujer</option>
                <option value="M">Hombre</option>
                <option value="U">Sin dato</option>
              </select>
              <FieldError id={`${uid}-sex-error`} message={personErrors.sex} />
            </div>
            <div>
              <label htmlFor={`${uid}-living`} className={labelClass}>
                Estado
              </label>
              <select
                id={`${uid}-living`}
                value={personForm.isLiving ? "1" : "0"}
                onChange={(e) => setPersonField("isLiving", e.target.value === "1")}
                className={inputClass}
              >
                <option value="1">Viva / vivo</option>
                <option value="0">{personForm.sex === "F" ? "Fallecida" : personForm.sex === "M" ? "Fallecido" : "Fallecida/o"}</option>
              </select>
            </div>
          </div>
          <div>
            <label htmlFor={`${uid}-notes`} className={labelClass}>
              Notas
            </label>
            <textarea
              id={`${uid}-notes`}
              value={personForm.notes}
              onChange={(e) => setPersonField("notes", e.target.value)}
              rows={rowsFor(personForm.notes, 2)}
              placeholder="Apodos, recuerdos, lo que no cabe en un hecho con fecha…"
              className={inputClass}
            />
          </div>
          </div>
          {footer}
        </div>

        <div role="tabpanel" hidden={tab !== "vida"} className="pb-4 pt-2">
          {items.length === 0 && <p className="px-5 pt-4 text-base text-gris sm:px-7">Todavía no tiene hechos. Agrega el primero.</p>}
          <ul>
            {items.map((item) => (
              <FactCard
                key={item.key}
                item={item}
                errors={eventErrors[item.key] ?? {}}
                takenTypes={usedSingleTypes(item.key)}
                partners={partners}
                canReview={canReview}
                autoFocus={focusKey === item.key}
                dotColor={personForm.sex === "F" ? "#c44f72" : personForm.sex === "M" ? "#3f7fcb" : "#8f8a80"}
                onChange={(field, value) => setFactField(item, field, value)}
                onParticipantsChange={(participants) => patchItem(item.key, { form: { ...item.form, participants } })}
                onRemove={() => removeItem(item)}
                onRestore={() => patchItem(item.key, { removed: false })}
              />
            ))}
          </ul>
          <div className="px-5 pt-1 sm:px-7">
            <button type="button" onClick={addItem} className={`${outlineBtn} w-full border-dashed`}>
              <span aria-hidden="true">+</span> Agregar un hecho
            </button>
          </div>
        {notEditable.length > 0 && (
          <div className="mx-5 mb-6 mt-2 rounded-xl border-2 border-adobe-2 bg-white p-4 text-base leading-relaxed text-gris sm:mx-7">
            <p className="font-semibold text-ink">No se cambian desde aquí</p>
            <ul className="mt-1.5 list-disc pl-5">
              {notEditable.map((label) => (
                <li key={label}>{label}</li>
              ))}
            </ul>
            <p className="mt-2">El nacimiento o la muerte de otra persona se corrige en su propia ficha.</p>
          </div>
        )}
        </div>
      </div>

      <div className="shrink-0 border-t-2 border-adobe-2 bg-adobe px-4 py-3.5 shadow-[0_-6px_16px_rgba(0,0,0,0.05)] sm:px-6">
        {error && (
          <div className="mb-3">
            <Notice kind="aviso">{error}</Notice>
          </div>
        )}
        {confirmDiscard ? (
          <div>
            <p className="text-[1.25rem] font-bold text-ink">¿Salir sin guardar los cambios?</p>
            <div className="mt-3 flex flex-wrap gap-3">
              <button type="button" onClick={() => setConfirmDiscard(false)} className={buttonClass("principal")}>
                Seguir editando
              </button>
              <button type="button" onClick={onClose} className={buttonClass("secundario", "text-aviso! border-aviso!")}>
                Salir sin guardar
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="mb-2.5 flex items-center gap-2 text-base" aria-live="polite">
              {dirty ? (
                <>
                  <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full bg-terra" />
                  <span className="font-bold text-ink">Sin guardar: {unsaved}</span>
                </>
              ) : (
                <span className="text-gris">Todavía no has cambiado nada.</span>
              )}
            </p>
            <div className="flex flex-wrap gap-3">
              <button type="submit" disabled={saving || !dirty} className={buttonClass("principal", "flex-1 whitespace-nowrap px-5 sm:flex-none sm:px-7")}>
                {saving ? "Guardando…" : "Guardar cambios"}
              </button>
              <button type="button" onClick={requestClose} disabled={saving} className={buttonClass("secundario", "px-5 sm:px-6")}>
                Cancelar
              </button>
            </div>
          </>
        )}
      </div>
    </form>
  );
}
