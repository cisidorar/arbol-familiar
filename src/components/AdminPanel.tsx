"use client";

// Piezas interactivas de la pantalla de administración. Cada formulario llama
// a una acción de servidor (src/app/actions/admin.ts), que vuelve a comprobar
// que quien la llama es administrador.

import { startTransition, useActionState, useState } from "react";
import {
  cancelInvitation,
  changeRole,
  invite,
  passwordResetLink,
  removeAccess,
  type AdminState,
} from "@/app/actions/admin";
import { ROLES, ROLE_HELP, ROLE_LABELS, type Role } from "@/lib/auth/roles";

const inputClass =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10";
const primaryButton =
  "rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60";
const linkButton =
  "text-xs font-medium text-gray-600 underline decoration-gray-300 underline-offset-2 hover:text-gray-900 disabled:opacity-60";

function ErrorText({ state }: { state: AdminState }) {
  if (!state?.error) return null;
  return (
    <p role="alert" className="text-xs text-red-600">
      {state.error}
    </p>
  );
}

/** El enlace recién creado. Se muestra una sola vez: en la base solo queda su hash. */
function LinkBox({ state, note }: { state: AdminState; note: string }) {
  const [copied, setCopied] = useState(false);
  if (!state?.link) return null;
  const link = state.link;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sin permiso para copiar: el enlace queda seleccionable a mano.
    }
  };
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5">
      <p className="text-sm font-medium text-emerald-900">
        Enlace listo{state.linkFor ? ` para ${state.linkFor}` : ""}
      </p>
      <p className="mt-0.5 text-xs leading-relaxed text-emerald-800">{note}</p>
      <div className="mt-2.5 flex items-center gap-2">
        <input
          readOnly
          value={link}
          aria-label="Enlace"
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 font-mono text-xs text-gray-800"
        />
        <button type="button" onClick={copy} className="shrink-0 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800">
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
    </div>
  );
}

export function InviteForm() {
  const [state, action, pending] = useActionState(invite, undefined);
  const [role, setRole] = useState<Role>("editor");
  return (
    <div className="flex flex-col gap-3">
      {/* Se envía a mano (no con action=) para que el formulario no se vacíe solo al terminar. */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const formData = new FormData(e.currentTarget);
          startTransition(() => action(formData));
        }}
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <div className="min-w-0 flex-1">
          <label htmlFor="invite-email" className="mb-1 block text-xs font-medium text-gray-600">
            Correo
          </label>
          <input id="invite-email" name="email" type="email" required placeholder="nombre@correo.com" className={inputClass} />
        </div>
        <div className="sm:w-44">
          <label htmlFor="invite-role" className="mb-1 block text-xs font-medium text-gray-600">
            Entra como
          </label>
          <select id="invite-role" name="role" value={role} onChange={(e) => setRole(e.target.value as Role)} className={inputClass}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" disabled={pending} className={primaryButton}>
          {pending ? "Creando…" : "Crear invitación"}
        </button>
      </form>
      <p className="text-xs text-gray-500">
        {ROLE_LABELS[role]}: {ROLE_HELP[role].toLowerCase()}
      </p>
      <ErrorText state={state} />
      <LinkBox
        state={state}
        note="Mándaselo por WhatsApp o correo. Sirve una sola vez, vence en 14 días y no se vuelve a mostrar: cópialo ahora."
      />
    </div>
  );
}

export function MemberRow({
  member,
  isSelf,
}: {
  member: { id: string; name: string; email: string; role: Role; since: string };
  isSelf: boolean;
}) {
  const [roleState, roleAction, rolePending] = useActionState(changeRole, undefined);
  const [resetState, resetAction, resetPending] = useActionState(passwordResetLink, undefined);
  const [removeState, removeAction, removePending] = useActionState(removeAccess, undefined);
  const [confirmRemove, setConfirmRemove] = useState(false);
  // Mientras se guarda se muestra el rol elegido; después, el que diga el
  // servidor (si rechazó el cambio, el selector vuelve solo al rol real).
  const [pendingRole, setPendingRole] = useState<Role | null>(null);
  const role = rolePending && pendingRole ? pendingRole : member.role;

  return (
    <li className="flex flex-col gap-2.5 px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-gray-900">
            {member.name}
            {isSelf && <span className="ml-2 text-xs font-normal text-gray-400">(tú)</span>}
          </p>
          <p className="truncate text-xs text-gray-500">{member.email}</p>
        </div>
        {isSelf ? (
          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
            {ROLE_LABELS[member.role]}
          </span>
        ) : (
          <select
            aria-label={`Rol de ${member.name}`}
            value={role}
            disabled={rolePending}
            onChange={(e) => {
              const next = e.target.value as Role;
              setPendingRole(next);
              const formData = new FormData();
              formData.set("userId", member.id);
              formData.set("role", next);
              startTransition(() => roleAction(formData));
            }}
            className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-800"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <form action={resetAction}>
          <input type="hidden" name="userId" value={member.id} />
          <input type="hidden" name="label" value={member.name} />
          <button type="submit" disabled={resetPending} className={linkButton}>
            {resetPending ? "Creando…" : "Enlace para nueva contraseña"}
          </button>
        </form>
        {!isSelf &&
          (confirmRemove ? (
            <form action={removeAction} className="flex items-center gap-2">
              <input type="hidden" name="userId" value={member.id} />
              <span className="text-xs text-red-700">¿Quitarle el acceso?</span>
              <button type="submit" disabled={removePending} className="rounded-md bg-red-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60">
                Sí, quitar
              </button>
              <button type="button" onClick={() => setConfirmRemove(false)} className={linkButton}>
                No
              </button>
            </form>
          ) : (
            <button type="button" onClick={() => setConfirmRemove(true)} className="text-xs font-medium text-red-600 underline decoration-red-200 underline-offset-2 hover:text-red-800">
              Quitar acceso
            </button>
          ))}
      </div>

      <ErrorText state={roleState} />
      <ErrorText state={resetState} />
      <ErrorText state={removeState} />
      <LinkBox
        state={resetState}
        note="Con este enlace elige una contraseña nueva. Sirve una sola vez, vence en 48 horas y no se vuelve a mostrar."
      />
    </li>
  );
}

export function InvitationRow({
  invitation,
}: {
  invitation: { id: string; kind: "invite" | "reset"; email: string; role: Role; expires: string };
}) {
  const [, action, pending] = useActionState(cancelInvitation, undefined);
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-gray-900">{invitation.email}</p>
        <p className="text-xs text-gray-500">
          {invitation.kind === "reset" ? "Cambio de contraseña" : `Invitación como ${ROLE_LABELS[invitation.role].toLowerCase()}`} · vence el{" "}
          {invitation.expires.split("-").reverse().join("/")}
        </p>
      </div>
      <form action={action}>
        <input type="hidden" name="invitationId" value={invitation.id} />
        <button type="submit" disabled={pending} className={linkButton}>
          Anular
        </button>
      </form>
    </li>
  );
}
