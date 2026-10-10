"use client";

// El "+" de una tarjeta: primero un menú con los familiares que se le
// pueden agregar a esa persona y, al elegir uno, un formulario corto con lo
// mínimo para crearlo. El resto (hechos, fuentes, notas) se completa después
// en su ficha, que se abre al guardar.

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { validatePerson } from "@/lib/edit";
import {
  LIVING_CUTOFF_YEARS,
  otherParentChoices,
  relationTitle,
  relativeDefaults,
  relativeOptions,
  yearOfTypedDate,
  type Relation,
  type RelativeDatum,
} from "@/lib/relatives";
import { DateField } from "./PersonEditor";

/** A quién se le agrega el familiar y dónde está su "+" en la pantalla. */
export type AddTarget = { personId: string; rect: { left: number; top: number; right: number; bottom: number } };

const inputClass =
  "mt-1 w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10 aria-[invalid=true]:border-red-400";
const labelClass = "block text-xs font-medium text-gray-600";

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 text-xs text-red-600">
      {message}
    </p>
  );
}

const MENU_WIDTH = 256;

function Menu({
  target,
  of,
  byId,
  onPick,
  onClose,
}: {
  target: AddTarget;
  of: RelativeDatum;
  byId: ReadonlyMap<string, RelativeDatum>;
  onPick: (relation: Relation) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const options = relativeOptions(of, byId);
  // Al lado del "+", sin salirse de la pantalla.
  const [pos, setPos] = useState({ left: target.rect.right + 6, top: target.rect.top });
  useLayoutEffect(() => {
    const height = ref.current?.offsetHeight ?? 0;
    const left = Math.max(8, Math.min(target.rect.right + 6, window.innerWidth - MENU_WIDTH - 8));
    const top = Math.max(8, Math.min(target.rect.top, window.innerHeight - height - 8));
    setPos({ left, top });
    ref.current?.querySelector<HTMLElement>("button:not(:disabled)")?.focus();
  }, [target]);

  useEffect(() => {
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent) {
        if (e.key === "Escape") onClose();
        return;
      }
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    // El árbol se puede mover o acercar con el menú abierto: se cierra para
    // que no quede flotando lejos de su tarjeta.
    document.addEventListener("mousedown", close);
    document.addEventListener("wheel", close, { passive: true });
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("wheel", close);
      document.removeEventListener("keydown", close);
    };
  }, [onClose]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = [...(ref.current?.querySelectorAll<HTMLElement>("button:not(:disabled)") ?? [])];
    const index = items.indexOf(document.activeElement as HTMLElement);
    items[(index + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
  };

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={`Agregar un familiar de ${of.data.label ?? "esta persona"}`}
      onKeyDown={onKeyDown}
      style={{ left: pos.left, top: pos.top, width: MENU_WIDTH }}
      className="fixed z-40 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 text-sm text-gray-900 shadow-xl"
    >
      <p className="truncate border-b border-gray-100 px-3.5 pb-2 pt-1.5 text-xs text-gray-500">
        Agregar a la familia de <span className="font-medium text-gray-700">{of.data.label}</span>
      </p>
      {options.map((option) => (
        <button
          key={option.relation}
          type="button"
          role="menuitem"
          disabled={Boolean(option.blocked)}
          onClick={() => onPick(option.relation)}
          className="block w-full px-3.5 py-2 text-left outline-none hover:bg-gray-50 focus-visible:bg-gray-100 disabled:cursor-not-allowed disabled:hover:bg-white"
        >
          <span className={option.blocked ? "text-gray-400" : undefined}>{option.label}</span>
          {option.blocked && <span className="block text-xs text-gray-400">{option.blocked}</span>}
        </button>
      ))}
    </div>
  );
}

type FormState = {
  given: string;
  surnamePat: string;
  surnameMat: string;
  sex: string;
  isLiving: boolean;
  birthDate: string;
};

function Form({
  relation,
  of,
  byId,
  onCancel,
  onAdded,
}: {
  relation: Relation;
  of: RelativeDatum;
  byId: ReadonlyMap<string, RelativeDatum>;
  onCancel: () => void;
  onAdded: (id: string, data: unknown[]) => void;
}) {
  const uid = useId();
  const dialogRef = useRef<HTMLFormElement>(null);
  const partners = useMemo(() => (relation === "child" ? otherParentChoices(of, byId) : []), [relation, of, byId]);
  const [otherParentId, setOtherParentId] = useState(partners[0]?.id ?? "");
  const defaultsFor = (otherId: string) => relativeDefaults(relation, of, byId.get(otherId) ?? null, byId);
  const [form, setForm] = useState<FormState>(() => {
    const d = defaultsFor(partners[0]?.id ?? "");
    return { given: "", surnamePat: d.surnamePat, surnameMat: d.surnameMat, sex: d.sex, isLiving: d.isLiving, birthDate: "" };
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => (e[field] ? { ...e, [field]: "" } : e));
  };

  // El estado propuesto sigue a la fecha de nacimiento (quien nació hace más
  // de cien años parte como fallecido), hasta que se elige uno a mano.
  const livingTouched = useRef(false);
  const setBirthDate = (value: string) => {
    set("birthDate", value);
    const year = yearOfTypedDate(value);
    if (year === null || livingTouched.current) return;
    setForm((f) => ({ ...f, isLiving: new Date().getFullYear() - year <= LIVING_CUTOFF_YEARS }));
  };

  // Al cambiar con quién lo tuvo, los apellidos propuestos cambian con él,
  // salvo los que ya se corrigieron a mano.
  const changeOtherParent = (id: string) => {
    const before = defaultsFor(otherParentId);
    const after = defaultsFor(id);
    setOtherParentId(id);
    setForm((f) => ({
      ...f,
      surnamePat: f.surnamePat === before.surnamePat ? after.surnamePat : f.surnamePat,
      surnameMat: f.surnameMat === before.surnameMat ? after.surnameMat : f.surnameMat,
    }));
  };

  useEffect(() => {
    dialogRef.current?.querySelector<HTMLElement>("input")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const person = {
      given: form.given, surnamePat: form.surnamePat, surnameMat: form.surnameMat,
      sex: form.sex, isLiving: form.isLiving, notes: "",
    };
    const check = validatePerson(person);
    if (!check.ok) {
      setErrors(check.errors);
      setFailure(null);
      dialogRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    setSaving(true);
    setFailure(null);
    try {
      const response = await fetch("/api/persons", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          relation,
          of: of.id,
          otherParentId: relation === "child" ? otherParentId || null : null,
          person,
          birthDate: form.birthDate,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setErrors(body?.errors ?? {});
        setFailure(body?.error ?? "No se pudo guardar. Inténtalo de nuevo.");
        return;
      }
      onAdded(body.id, body.data);
    } catch {
      setFailure("No se pudo guardar: revisa tu conexión e inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  const title = relationTitle(relation, of, byId);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-gray-900/40 p-4 sm:items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving) onCancel();
      }}
    >
      <form
        ref={dialogRef}
        onSubmit={submit}
        noValidate
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-title`}
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"
      >
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Agregar al árbol</p>
        <h2 id={`${uid}-title`} className="mt-0.5 text-lg font-semibold leading-snug text-gray-900">
          {title}
        </h2>

        <div className="mt-4 flex flex-col gap-3">
          {relation === "child" && partners.length > 0 && (
            <div>
              <label htmlFor={`${uid}-other`} className={labelClass}>
                Lo tuvo con
              </label>
              <select
                id={`${uid}-other`}
                value={otherParentId}
                onChange={(e) => changeOtherParent(e.target.value)}
                aria-invalid={Boolean(errors.otherParentId)}
                className={inputClass}
              >
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.data.label}
                  </option>
                ))}
                <option value="">Otra persona, o no se sabe</option>
              </select>
              <FieldError id={`${uid}-other-error`} message={errors.otherParentId} />
            </div>
          )}

          <div>
            <label htmlFor={`${uid}-given`} className={labelClass}>
              Nombres
            </label>
            <input
              id={`${uid}-given`}
              value={form.given}
              onChange={(e) => set("given", e.target.value)}
              aria-invalid={Boolean(errors.given)}
              aria-describedby={errors.given ? `${uid}-given-error` : undefined}
              autoComplete="off"
              className={inputClass}
            />
            <FieldError id={`${uid}-given-error`} message={errors.given} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={`${uid}-pat`} className={labelClass}>
                Apellido paterno
              </label>
              <input
                id={`${uid}-pat`}
                value={form.surnamePat}
                onChange={(e) => set("surnamePat", e.target.value)}
                autoComplete="off"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor={`${uid}-mat`} className={labelClass}>
                Apellido materno
              </label>
              <input
                id={`${uid}-mat`}
                value={form.surnameMat}
                onChange={(e) => set("surnameMat", e.target.value)}
                autoComplete="off"
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={`${uid}-sex`} className={labelClass}>
                Sexo
              </label>
              <select
                id={`${uid}-sex`}
                value={form.sex}
                onChange={(e) => set("sex", e.target.value)}
                aria-invalid={Boolean(errors.sex)}
                aria-describedby={errors.sex ? `${uid}-sex-error` : undefined}
                className={inputClass}
              >
                {form.sex === "" && (
                  <option value="" disabled>
                    Elige…
                  </option>
                )}
                <option value="F">Mujer</option>
                <option value="M">Hombre</option>
                <option value="U">Sin dato</option>
              </select>
              <FieldError id={`${uid}-sex-error`} message={errors.sex} />
            </div>
            <div>
              <label htmlFor={`${uid}-living`} className={labelClass}>
                Estado
              </label>
              <select
                id={`${uid}-living`}
                value={form.isLiving ? "1" : "0"}
                onChange={(e) => {
                  livingTouched.current = true;
                  set("isLiving", e.target.value === "1");
                }}
                className={inputClass}
              >
                <option value="1">Viva / vivo</option>
                <option value="0">Fallecida/o</option>
              </select>
            </div>
          </div>

          <div>
            <span className={labelClass}>Nacimiento (si se sabe)</span>
            <DateField
              idPrefix={`${uid}-birth`}
              value={form.birthDate}
              onChange={setBirthDate}
              error={errors.birthDate}
            />
          </div>
        </div>

        {failure && (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {failure}
          </p>
        )}

        <p className="mt-4 text-xs text-gray-500">Después se abre su ficha para completar el resto.</p>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Agregando…" : "Agregar"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}

export default function AddRelative({
  target,
  data,
  onClose,
  onAdded,
}: {
  target: AddTarget;
  data: RelativeDatum[];
  onClose: () => void;
  /** La persona ya está guardada: su id y los datos del árbol al día. */
  onAdded: (id: string, data: unknown[]) => void;
}) {
  const [relation, setRelation] = useState<Relation | null>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const byId = useMemo(() => new Map(data.map((d) => [d.id, d])), [data, data.length]);
  const of = byId.get(target.personId);
  if (!of) return null;

  return relation ? (
    <Form relation={relation} of={of} byId={byId} onCancel={onClose} onAdded={onAdded} />
  ) : (
    <Menu target={target} of={of} byId={byId} onPick={setRelation} onClose={onClose} />
  );
}
