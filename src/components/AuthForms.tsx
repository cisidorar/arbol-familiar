"use client";

import { useActionState } from "react";
import { acceptInvite, login } from "@/app/actions/auth";

// Fila de la ficha: etiqueta a la izquierda, línea para escribir a la derecha
// (en el celular la etiqueta pasa arriba).
const rowClass = "grid items-end gap-x-4 gap-y-1 sm:grid-cols-[10rem_1fr]";
const labelClass = "pb-1 text-[15px] font-bold";
const inputClass =
  "w-full border-0 border-b-2 border-dotted border-[#7a756a] bg-transparent px-0 py-1 text-[15px] text-[#1f1d1a] outline-none transition-colors focus:border-solid focus:border-[#b3261e]";
const hintClass = "text-xs text-[#7a756a] sm:col-start-2";
const buttonClass =
  "border-[3px] border-[#1f1d1a] bg-transparent px-6 py-2 text-[15px] font-bold uppercase tracking-[0.2em] text-[#1f1d1a] hover:bg-[#1f1d1a] hover:text-[#f5f2ea] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b3261e] disabled:cursor-not-allowed disabled:opacity-60";

function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="border-l-4 border-[#b3261e] pl-3 text-sm text-[#b3261e]">
      {message}
    </p>
  );
}

function Submit({ pending, idle, busy }: { pending: boolean; idle: string; busy: string }) {
  return (
    <div className="flex justify-end">
      <button type="submit" disabled={pending} className={buttonClass}>
        [ {pending ? busy : idle} ]
      </button>
    </div>
  );
}

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} className="flex flex-col gap-6">
      <div className={rowClass}>
        <label htmlFor="email" className={labelClass}>
          Correo:
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          autoFocus
          defaultValue={state?.email}
          className={inputClass}
        />
      </div>
      <div className={rowClass}>
        <label htmlFor="password" className={labelClass}>
          Contraseña:
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={inputClass}
        />
      </div>
      <FormError message={state?.error} />
      <Submit pending={pending} idle="Entrar" busy="Entrando…" />
    </form>
  );
}

export function AcceptInviteForm({
  token,
  kind,
  email,
  minLength,
}: {
  token: string;
  kind: "invite" | "reset";
  email: string;
  minLength: number;
}) {
  const [state, action, pending] = useActionState(acceptInvite, undefined);
  return (
    <form action={action} className="flex flex-col gap-6">
      <input type="hidden" name="token" value={token} />
      <div className={rowClass}>
        <span className={labelClass}>Correo:</span>
        <p className="break-all border-b-2 border-dotted border-[#7a756a] py-1 text-[15px]">{email}</p>
        {/* Para que el navegador guarde la contraseña junto al correo correcto. */}
        <input type="hidden" name="username" autoComplete="username" value={email} readOnly />
      </div>
      {kind === "invite" && (
        <div className={rowClass}>
          <label htmlFor="name" className={labelClass}>
            Tu nombre:
          </label>
          <input
            id="name"
            name="name"
            autoComplete="name"
            required
            maxLength={80}
            autoFocus
            defaultValue={state?.name}
            className={inputClass}
          />
          <p className={hintClass}>Aparece junto a los cambios que hagas.</p>
        </div>
      )}
      <div className={rowClass}>
        <label htmlFor="password" className={labelClass}>
          {kind === "reset" ? "Contraseña nueva:" : "Contraseña:"}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={minLength}
          className={inputClass}
        />
        <p className={hintClass}>Al menos {minLength} caracteres.</p>
      </div>
      <div className={rowClass}>
        <label htmlFor="confirm" className={labelClass}>
          Repítela:
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={minLength}
          className={inputClass}
        />
      </div>
      <FormError message={state?.error} />
      <Submit
        pending={pending}
        idle={kind === "reset" ? "Guardar y entrar" : "Crear cuenta y entrar"}
        busy="Guardando…"
      />
    </form>
  );
}
