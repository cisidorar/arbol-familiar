"use client";

// El formulario de "Editar" de la ficha: muestra todo lo que la ficha tiene
// ahora (los datos de la persona y cada hecho) listo para corregir, y lo
// guarda junto con un solo botón. Valida con las mismas reglas que el
// servidor (src/lib/edit.ts) para avisar al tiro, pero quien decide es el
// servidor.

import { useEffect, useId, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import {
  EDITABLE_EVENT_TYPES,
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

const inputClass =
  "mt-1 w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10 aria-[invalid=true]:border-red-400";
const labelClass = "block text-xs font-medium text-gray-600";
const sectionTitle = "text-[11px] font-semibold uppercase tracking-wider text-gray-500";

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
    <p id={id} className="mt-1 text-xs text-red-600">
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
        Edad aproximada al morir (para estimar su nacimiento)
      </label>
      <div className="mt-1 flex items-center gap-2">
        <input
          id={`${uid}-age`}
          type="number"
          min={0}
          max={130}
          value={age}
          onChange={(e) => apply(e.target.value)}
          placeholder="años"
          className="w-24 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10"
        />
        {birthYear !== null && <span className="text-xs text-gray-500">→ nacería aprox. en {birthYear}</span>}
        {!deathYear && age && <span className="text-xs text-gray-400">(falta el año de la fecha para estimarlo)</span>}
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
        <div className="mt-1 grid grid-cols-[4.5rem_7.5rem_5.5rem] gap-2">
          <select
            id={`${idPrefix}-day`}
            aria-label="Día"
            value={simple.day}
            disabled={!simple.month}
            onChange={(e) => setAndEmit({ ...simple, day: e.target.value })}
            className={`${inputClass} disabled:bg-gray-100 disabled:text-gray-400`}
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
            className={inputClass}
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
            className={inputClass}
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

      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        {mode === "simple" ? (
          <label className="flex items-center gap-1.5 text-xs text-gray-500">
            <input
              type="checkbox"
              checked={simple.approx}
              onChange={(e) => setAndEmit({ ...simple, approx: e.target.checked })}
              className="h-3.5 w-3.5 rounded border-gray-300"
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
          className="text-[11px] font-medium text-gray-500 underline decoration-gray-300 underline-offset-2 hover:text-gray-900"
        >
          {mode === "simple" ? "¿Rango, antes/después o década? Escríbela" : "Elegirla con los desplegables"}
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

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-gray-200 bg-white p-2.5">
      <div className="flex items-start gap-2">
        <input
          value={value.role}
          onChange={(e) => onChange({ role: e.target.value })}
          placeholder="Padrino, madrina…"
          className="w-28 shrink-0 rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs text-gray-900 outline-none placeholder:text-gray-400 focus:border-gray-900"
        />
        <div ref={boxRef} className="relative min-w-0 flex-1">
          <input
            value={value.name}
            onChange={(e) => {
              onChange({ name: e.target.value, personId: null });
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder="Nombre"
            className={`w-full rounded-md border px-2 py-1.5 text-xs text-gray-900 outline-none placeholder:text-gray-400 focus:border-gray-900 ${
              value.personId ? "border-emerald-300 bg-emerald-50" : "border-gray-200 bg-white"
            }`}
          />
          {showDropdown && (
            <ul className="absolute left-0 top-full z-10 mt-1 max-h-48 w-full min-w-[14rem] overflow-auto rounded-lg border border-gray-200 bg-white py-1 text-xs shadow-lg">
              {searching && <li className="px-2.5 py-1.5 text-gray-400">Buscando…</li>}
              {!searching && results.length === 0 && (
                <li className="px-2.5 py-1.5 text-gray-400">Nadie en el árbol con ese nombre: queda pendiente.</li>
              )}
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange({ name: r.displayName, personId: r.id });
                      setOpen(false);
                    }}
                    className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left hover:bg-gray-50"
                  >
                    <span className="min-w-0 truncate">{r.displayName}</span>
                    <span className="shrink-0 text-gray-400">
                      {r.birthYear ?? "s/f"}
                      {!r.isLiving && " †"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Quitar persona"
          className="shrink-0 rounded-md px-1.5 py-1.5 text-xs text-gray-400 hover:bg-red-50 hover:text-red-600"
        >
          ✕
        </button>
      </div>
      {value.personId ? (
        <p className="text-[11px] text-emerald-700">
          ✓ Vinculada con el árbol.{" "}
          <button type="button" onClick={() => onChange({ personId: null })} className="underline underline-offset-2">
            Desvincular
          </button>
        </p>
      ) : (
        value.name.trim() && (
          <p className="text-[11px] text-gray-400">
            Sin vincular: se guarda el nombre y se puede buscar y vincular más adelante.
          </p>
        )
      )}
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
    <fieldset className="flex flex-col gap-2.5 rounded-lg border border-gray-200 bg-gray-50/70 p-3">
      <legend className="px-1 text-xs font-medium text-gray-600">Personas relacionadas (padrinos, testigos…)</legend>
      {participants.length === 0 && <p className="text-xs text-gray-400">Nadie agregado todavía.</p>}
      <div className="flex flex-col gap-2">
        {participants.map((p, i) => (
          <ParticipantRow
            key={i}
            value={p}
            onChange={(patch) => onChange(participants.map((item, idx) => (idx === i ? { ...item, ...patch } : item)))}
            onRemove={() => onChange(participants.filter((_, idx) => idx !== i))}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...participants, { role: "", name: "", personId: null }])}
        className="self-start text-xs font-medium text-gray-600 underline decoration-gray-300 underline-offset-2 hover:text-gray-900"
      >
        + Agregar una persona
      </button>
    </fieldset>
  );
}

function FactCard({
  item,
  errors,
  takenTypes,
  partners,
  autoFocus,
  onChange,
  onParticipantsChange,
  onRemove,
  onRestore,
}: {
  item: Item;
  errors: FieldErrors;
  /** Hechos únicos (nacimiento, defunción, sepultura) que ya ocupa otro recuadro. */
  takenTypes: Set<string>;
  /** Parejas con quienes se puede registrar un matrimonio nuevo. */
  partners: PartnerChoice[];
  autoFocus: boolean;
  onChange: (field: keyof EventForm, value: string) => void;
  onParticipantsChange: (participants: ParticipantForm[]) => void;
  onRemove: () => void;
  onRestore: () => void;
}) {
  const uid = useId();
  const { form } = item;
  const isNew = item.initial === null;
  const [showSource, setShowSource] = useState(Boolean(form.sourceUrl || form.sourceTitle || form.sourceQuote));
  const cardRef = useRef<HTMLDivElement>(null);
  const typeInfo = EDITABLE_EVENT_TYPES.find((t) => t.type === form.type) ?? EDITABLE_EVENT_TYPES[0];
  const sourceOpen = showSource || Boolean(errors.sourceUrl);
  // Un matrimonio (o similar) es de la pareja, no de esta persona sola: no
  // cambia de tipo desde acá, y tampoco se ofrece al agregar un hecho nuevo.
  const isFamilyFact = FAMILY_EVENT_TYPES.has(form.type) && !isNew;

  // Un hecho recién agregado queda a la vista y listo para escribir.
  useEffect(() => {
    if (!autoFocus) return;
    cardRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    cardRef.current?.querySelector<HTMLElement>("select, input")?.focus({ preventScroll: true });
  }, [autoFocus]);

  if (item.removed) {
    const summary = [form.date, form.place].filter(Boolean).join(" · ");
    return (
      <div className="flex items-center gap-3 rounded-xl border border-dashed border-red-200 bg-red-50/60 px-3.5 py-2.5">
        <p className="min-w-0 flex-1 text-xs text-red-800">
          <span className="font-semibold line-through">{typeLabel(form)}</span>
          {summary && <span className="line-through"> · {summary}</span>}
          <span className="block text-red-700">Se borrará al guardar.</span>
        </p>
        <button
          type="button"
          onClick={onRestore}
          className="shrink-0 rounded-lg border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
        >
          Deshacer
        </button>
      </div>
    );
  }

  return (
    <div ref={cardRef} data-fact={item.key} className="rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm">
      <div className="flex items-center gap-2">
        {isFamilyFact ? (
          // Un matrimonio (y similares) no cambia de tipo desde una ficha: es
          // de la pareja, se corrige el que ya hay, no se convierte en otro.
          <span className="rounded-lg bg-gray-100 px-2.5 py-1 text-sm font-semibold text-gray-900">{typeInfo.label}</span>
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
              className="min-w-0 max-w-full rounded-lg border border-gray-200 bg-gray-50 py-1 pl-2 pr-7 text-sm font-semibold text-gray-900 outline-none hover:border-gray-300 focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10 aria-[invalid=true]:border-red-400"
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
        {item.hint && <span className="truncate text-xs text-gray-500">{item.hint}</span>}
        {isNew && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">Nuevo</span>}
        <button
          type="button"
          onClick={onRemove}
          className="ml-auto shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-gray-500 hover:bg-red-50 hover:text-red-700"
        >
          Quitar
        </button>
      </div>
      <FieldError id={`${uid}-type-error`} message={errors.type} />

      <div className="mt-3 flex flex-col gap-3">
        {isNew && form.type === "MARR" && (
          <div>
            <label htmlFor={`${uid}-family`} className={labelClass}>
              Con quién se casó
            </label>
            {partners.length === 0 ? (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Todavía no tiene una pareja en el árbol. Primero agrégala con el «+» de su tarjeta (Agregar pareja) y
                después registra el matrimonio.
              </p>
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

        <div>
          <span className={labelClass}>Fecha</span>
          <DateField
            idPrefix={`${uid}-date`}
            value={form.date}
            onChange={(v) => onChange("date", v)}
            error={errors.date}
          />
        </div>

        <div>
          <label htmlFor={`${uid}-place`} className={labelClass}>
            Lugar
          </label>
          <input
            id={`${uid}-place`}
            value={form.place}
            onChange={(e) => onChange("place", e.target.value)}
            placeholder="p. ej. Parroquia de San José, Curicó"
            className={inputClass}
          />
        </div>

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

        {form.type === "DEAT" && (
          <ApproxAgeAtDeath date={form.date} text={form.text} onChangeText={(t) => onChange("text", t)} />
        )}

        <ParticipantsField
          participants={form.participants}
          onChange={(participants) => onParticipantsChange(participants)}
        />

        {sourceOpen ? (
          <fieldset className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50/70 p-3">
            <legend className="px-1 text-xs font-medium text-gray-600">Fuente (de dónde salió el dato)</legend>
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
          <button
            type="button"
            onClick={() => setShowSource(true)}
            className="self-start text-xs font-medium text-gray-600 underline decoration-gray-300 underline-offset-2 hover:text-gray-900"
          >
            + Agregar la fuente (enlace)
          </button>
        )}
      </div>
    </div>
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
  onSave,
  onClose,
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
  onSave: (payload: FichaPayload) => Promise<SaveOutcome>;
  /** Salir del formulario sin guardar. */
  onClose: () => void;
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
      const field = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
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
    if (count) showFirstError();
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

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto bg-gray-50 px-5 py-4">
        <h3 className={sectionTitle}>Datos de la persona</h3>
        <div className="mt-2 flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm">
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
          <div className="grid grid-cols-2 gap-3">
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
          <div className="grid grid-cols-2 gap-3">
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
                <option value="0">Fallecida/o</option>
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

        <h3 className={`${sectionTitle} mt-6`}>Hechos de su vida</h3>
        <div className="mt-2 flex flex-col gap-3">
          {items.length === 0 && <p className="text-sm text-gray-500">Todavía no tiene hechos. Agrega el primero.</p>}
          {items.map((item) => (
            <FactCard
              key={item.key}
              item={item}
              errors={eventErrors[item.key] ?? {}}
              takenTypes={usedSingleTypes(item.key)}
              partners={partners}
              autoFocus={focusKey === item.key}
              onChange={(field, value) => setFactField(item, field, value)}
              onParticipantsChange={(participants) => patchItem(item.key, { form: { ...item.form, participants } })}
              onRemove={() => removeItem(item)}
              onRestore={() => patchItem(item.key, { removed: false })}
            />
          ))}
          <button
            type="button"
            onClick={addItem}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-700 hover:border-gray-400 hover:bg-gray-50"
          >
            <span aria-hidden="true" className="text-base leading-none">+</span>
            Agregar un hecho
          </button>
        </div>

        {notEditable.length > 0 && (
          <div className="mt-6 rounded-xl border border-gray-200 bg-white/70 p-3.5 text-xs leading-relaxed text-gray-500">
            <p className="font-medium text-gray-600">No se cambian desde aquí</p>
            <ul className="mt-1 list-disc pl-4">
              {notEditable.map((label) => (
                <li key={label}>{label}</li>
              ))}
            </ul>
            <p className="mt-1.5">El nacimiento o la muerte de otra persona se corrige en su propia ficha.</p>
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-gray-200 bg-white px-5 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
        {error && (
          <p role="alert" className="mb-2.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        )}
        {confirmDiscard ? (
          <div>
            <p className="text-sm font-medium text-gray-800">¿Salir sin guardar los cambios?</p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmDiscard(false)}
                className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
              >
                Seguir editando
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
              >
                Salir sin guardar
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Guardando…" : "Guardar cambios"}
            </button>
            <button
              type="button"
              onClick={requestClose}
              disabled={saving}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              Cancelar
            </button>
            <span className="ml-auto text-right text-[11px] leading-tight text-gray-400">
              {dirty ? "Hay cambios sin guardar" : "Sin cambios todavía"}
            </span>
          </div>
        )}
      </div>
    </form>
  );
}
