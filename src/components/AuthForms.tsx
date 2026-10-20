"use client";

import { useActionState, useState } from "react";
import { acceptInvite, login } from "@/app/actions/auth";
import { Button, Field, Notice } from "./ui";

// Pantallas de entrada con la guía de estilo: campos con borde, un solo botón
// negro y mensajes en tono de conversación.

function Submit({ pending, idle, busy }: { pending: boolean; idle: string; busy: string }) {
  return (
    <div className="pt-2">
      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {pending ? busy : idle}
      </Button>
    </div>
  );
}

/** Casilla con palabras: mostrar lo que se escribe, para quien no ve bien los puntos. */
function ShowPassword({ shown, onChange }: { shown: boolean; onChange: (shown: boolean) => void }) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center gap-3 text-[1.0625rem]">
      <input
        type="checkbox"
        checked={shown}
        onChange={(e) => onChange(e.target.checked)}
        className="h-6 w-6 accent-ink"
      />
      Mostrar lo que escribo
    </label>
  );
}

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  const [shown, setShown] = useState(false);
  return (
    <form action={action} className="flex flex-col gap-5">
      <Field
        id="email"
        name="email"
        label="Tu correo"
        type="email"
        autoComplete="username"
        required
        autoFocus
        defaultValue={state?.email}
      />
      <div className="flex flex-col gap-1">
        <Field
          id="password"
          name="password"
          label="Tu contraseña"
          type={shown ? "text" : "password"}
          autoComplete="current-password"
          required
        />
        <ShowPassword shown={shown} onChange={setShown} />
      </div>
      {state?.error && <Notice kind="aviso">{state.error}</Notice>}
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
  const [shown, setShown] = useState(false);
  const type = shown ? "text" : "password";
  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="token" value={token} />
      <div className="flex flex-col gap-1.5">
        <span className="text-[1.125rem] font-bold">Tu correo</span>
        <p className="break-all rounded-lg bg-paper px-3.5 py-3 text-[1.125rem]">{email}</p>
        {/* Para que el navegador guarde la contraseña junto al correo correcto. */}
        <input type="hidden" name="username" autoComplete="username" value={email} readOnly />
      </div>
      {kind === "invite" && (
        <Field
          id="name"
          name="name"
          label="Tu nombre"
          autoComplete="name"
          required
          maxLength={80}
          autoFocus
          defaultValue={state?.name}
          hint="Aparece junto a los cambios que hagas."
        />
      )}
      <Field
        id="password"
        name="password"
        label={kind === "reset" ? "Tu contraseña nueva" : "Elige una contraseña"}
        type={type}
        autoComplete="new-password"
        required
        minLength={minLength}
        hint={`Al menos ${minLength} letras o números.`}
      />
      <Field
        id="confirm"
        name="confirm"
        label="Escríbela otra vez"
        type={type}
        autoComplete="new-password"
        required
        minLength={minLength}
      />
      <ShowPassword shown={shown} onChange={setShown} />
      {state?.error && <Notice kind="aviso">{state.error}</Notice>}
      <Submit
        pending={pending}
        idle={kind === "reset" ? "Guardar y entrar" : "Crear mi cuenta y entrar"}
        busy="Guardando…"
      />
    </form>
  );
}
