// Piezas de la guía de estilo ("Un archivo que toda la familia pueda usar").
// Botones de al menos 48 px, texto de 18 px (nunca menos de 16), un botón negro
// por pantalla, íconos siempre con su palabra y mensajes en tono de conversación.

import Link from "next/link";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

/* ---------- Botones ---------- */

type Variant = "principal" | "secundario" | "enlace";

const BUTTON_BASE =
  "inline-flex min-h-12 items-center justify-center gap-2 text-[1.125rem] font-bold leading-tight transition-colors disabled:cursor-not-allowed disabled:opacity-60";
const BUTTON_VARIANT: Record<Variant, string> = {
  // Uno por pantalla: la acción principal.
  principal: "rounded-full border-2 border-ink bg-ink px-7 py-2 text-white hover:bg-gris hover:border-gris",
  secundario: "rounded-full border-2 border-ink bg-white px-6 py-2 text-ink hover:bg-paper",
  enlace: "px-3 py-2 text-ink underline decoration-2 underline-offset-4 hover:text-terra",
};

export function buttonClass(variant: Variant = "principal", extra = ""): string {
  return `${BUTTON_BASE} ${BUTTON_VARIANT[variant]} ${extra}`.trim();
}

export function Button({
  variant = "principal",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type="button" {...props} className={buttonClass(variant, className)} />;
}

export function LinkButton({
  href,
  variant = "secundario",
  className = "",
  children,
}: {
  href: string;
  variant?: Variant;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={buttonClass(variant, className)}>
      {children}
    </Link>
  );
}

/* ---------- Campos de texto ---------- */

export function Field({
  id,
  label,
  hint,
  error,
  className = "",
  ...input
}: { id: string; label: string; hint?: string; error?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, "id">) {
  const describedBy = [hint ? `${id}-ayuda` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[1.125rem] font-bold">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...input}
        className={`min-h-12 w-full rounded-lg border-2 bg-white px-3.5 py-2 text-[1.125rem] text-ink placeholder:text-gris/70 ${
          error ? "border-aviso" : "border-[#8f8a80] focus:border-hombre"
        } ${className}`}
      />
      {hint && (
        <p id={`${id}-ayuda`} className="zb-apoyo">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-base font-bold text-aviso">
          <span aria-hidden="true">⚠ </span>
          {error}
        </p>
      )}
    </div>
  );
}

/* ---------- Avisos ---------- */

type NoticeKind = "info" | "listo" | "aviso";

const NOTICE: Record<NoticeKind, { box: string; icon: string; mark: string; label: string }> = {
  info: { box: "bg-paper", icon: "bg-ink text-white", mark: "i", label: "Información" },
  listo: { box: "bg-[#e5f1ea]", icon: "bg-listo text-white", mark: "✓", label: "Listo" },
  aviso: { box: "bg-[#fbebe8]", icon: "bg-aviso text-white", mark: "!", label: "Atención" },
};

export function Notice({ kind = "info", children }: { kind?: NoticeKind; children: ReactNode }) {
  const n = NOTICE[kind];
  return (
    <div
      role={kind === "aviso" ? "alert" : "status"}
      className={`flex items-start gap-3 rounded-xl px-4 py-3.5 text-[1.0625rem] leading-snug ${n.box}`}
    >
      <span
        aria-label={n.label}
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-base font-bold ${n.icon}`}
      >
        {n.mark}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/* ---------- Filtro de opciones (Ambas / Paterna / Materna) ---------- */

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap rounded-full border-2 border-line bg-white p-1">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`min-h-11 rounded-full px-5 text-[1.0625rem] font-bold transition-colors ${
              on ? "bg-ink text-white" : "text-ink hover:bg-paper"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Persona ---------- */

/** Inicial en un cuadrado redondeado, como el logo: azul para hombres, rosa para mujeres. */
export function Initial({ name, sex, size = 48 }: { name: string; sex?: string | null; size?: number }) {
  const tone =
    sex === "M" ? "bg-[#dce7f6] text-hombre" : sex === "F" ? "bg-[#f6dde7] text-mujer" : "bg-paper text-gris";
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className={`flex shrink-0 items-center justify-center rounded-xl text-[1.375rem] font-bold uppercase ${tone}`}
    >
      {name.trim().charAt(0) || "?"}
    </span>
  );
}

/** Toda la tarjeta se puede tocar, no solo el nombre. */
export function PersonCard({
  href,
  name,
  sex,
  relation,
  years,
  action = "Ver ficha",
}: {
  href: string;
  name: string;
  sex?: string | null;
  /** Ej.: "Su tatarabuelo, por parte de su mamá". */
  relation?: string;
  /** Ej.: "1868 – 1913". */
  years?: string;
  action?: string;
}) {
  const detail = [relation, years].filter(Boolean).join(" · ");
  return (
    <Link
      href={href}
      className="flex min-h-[4.5rem] items-center gap-4 rounded-2xl border-2 border-line bg-white px-4 py-3 transition-colors hover:border-ink"
    >
      <Initial name={name} sex={sex} />
      <span className="min-w-0 flex-1">
        <span className="zb-nombre block">{name}</span>
        {detail && <span className="zb-apoyo block">{detail}</span>}
      </span>
      <span className="shrink-0 font-bold underline decoration-2 underline-offset-4">{action} →</span>
    </Link>
  );
}

/* ---------- Títulos de pantalla ---------- */

export function PageTitle({ children, intro }: { children: ReactNode; intro?: ReactNode }) {
  return (
    <div>
      <h1 className="zb-titulo">{children}</h1>
      {intro && <p className="zb-texto mt-3 max-w-[46rem] text-gris">{intro}</p>}
    </div>
  );
}
