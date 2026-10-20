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
import { Button, Field, Initial, Notice, buttonClass } from "./ui";

const selectClass =
  "min-h-12 w-full rounded-lg border-2 border-[#8f8a80] bg-white px-3 py-2 text-[1.125rem] text-ink focus:border-hombre";

function ErrorText({ state }: { state: AdminState }) {
  if (!state?.error) return null;
  return <Notice kind="aviso">{state.error}</Notice>;
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
    <Notice kind="listo">
      <p className="font-bold">Enlace listo{state.linkFor ? ` para ${state.linkFor}` : ""}</p>
      <p className="zb-apoyo mt-0.5 !text-ink">{note}</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          readOnly
          value={link}
          aria-label="Enlace"
          onFocus={(e) => e.currentTarget.select()}
          className="min-h-12 min-w-0 flex-1 rounded-lg border-2 border-[#8f8a80] bg-white px-3 font-mono text-base text-ink"
        />
        <Button onClick={copy} className="sm:shrink-0">
          {copied ? "✓ Copiado" : "Copiar enlace"}
        </Button>
      </div>
    </Notice>
  );
}

export function InviteForm() {
  const [state, action, pending] = useActionState(invite, undefined);
  const [role, setRole] = useState<Role>("editor");
  return (
    <div className="flex flex-col gap-4">
      {/* Se envía a mano (no con action=) para que el formulario no se vacíe solo al terminar. */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const formData = new FormData(e.currentTarget);
          startTransition(() => action(formData));
        }}
        className="flex flex-col gap-4"
      >
        <Field id="invite-email" name="email" type="email" required label="Correo de la persona" placeholder="nombre@correo.com" />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="invite-role" className="text-[1.125rem] font-bold">
            Qué podrá hacer
          </label>
          <select id="invite-role" name="role" value={role} onChange={(e) => setRole(e.target.value as Role)} className={selectClass}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          <p className="zb-apoyo">
            {ROLE_LABELS[role]}: {ROLE_HELP[role].toLowerCase()}
          </p>
        </div>
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? "Creando…" : "Crear invitación"}
          </Button>
        </div>
      </form>
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
    <li className="flex flex-col gap-3 px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <Initial name={member.name} />
        <div className="min-w-0 flex-1">
          <p className="zb-nombre break-words">
            {member.name}
            {isSelf && <span className="zb-apoyo ml-2 font-normal">(tú)</span>}
          </p>
          <p className="zb-apoyo break-all">{member.email}</p>
        </div>
        {isSelf ? (
          <span className="rounded-full bg-paper px-4 py-2 text-base font-bold text-gris">{ROLE_LABELS[member.role]}</span>
        ) : (
          <select
            aria-label={`Qué puede hacer ${member.name}`}
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
            className={`${selectClass} sm:w-52`}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <form action={resetAction}>
          <input type="hidden" name="userId" value={member.id} />
          <input type="hidden" name="label" value={member.name} />
          <button type="submit" disabled={resetPending} className={buttonClass("enlace")}>
            {resetPending ? "Creando…" : "Enlace para nueva contraseña"}
          </button>
        </form>
        {!isSelf &&
          (confirmRemove ? (
            <form action={removeAction} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="userId" value={member.id} />
              <span className="font-bold text-aviso">¿Quitarle el acceso?</span>
              <button
                type="submit"
                disabled={removePending}
                className={buttonClass("secundario", "!border-aviso !bg-aviso !text-white hover:!bg-[#8f1d17]")}
              >
                Sí, quitar acceso
              </button>
              <button type="button" onClick={() => setConfirmRemove(false)} className={buttonClass("secundario")}>
                No, dejarlo
              </button>
            </form>
          ) : (
            <button type="button" onClick={() => setConfirmRemove(true)} className={buttonClass("enlace", "!text-aviso")}>
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
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4 sm:px-5">
      <div className="min-w-0 flex-1">
        <p className="zb-nombre break-all">{invitation.email}</p>
        <p className="zb-apoyo">
          {invitation.kind === "reset" ? "Cambio de contraseña" : `Invitación como ${ROLE_LABELS[invitation.role].toLowerCase()}`} · vence el{" "}
          {invitation.expires.split("-").reverse().join("/")}
        </p>
      </div>
      <form action={action}>
        <input type="hidden" name="invitationId" value={invitation.id} />
        <button type="submit" disabled={pending} className={buttonClass("secundario")}>
          Anular enlace
        </button>
      </form>
    </li>
  );
}
