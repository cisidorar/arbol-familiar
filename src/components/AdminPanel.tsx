"use client";

// Piezas interactivas de la pantalla de administración. Cada formulario llama
// a una acción de servidor (src/app/actions/admin.ts), que vuelve a comprobar
// que quien la llama es administrador.

import { startTransition, useActionState, useMemo, useState } from "react";
import {
  cancelInvitation,
  changeRole,
  invite,
  linkMember,
  passwordResetLink,
  removeAccess,
  resendInvitation,
  type AdminState,
} from "@/app/actions/admin";
import type { InvitationRowData, InvitationStatus } from "@/lib/data/users";
import { ROLES, ROLE_HELP, ROLE_LABELS, type Role } from "@/lib/auth/roles";
import PersonPicker, { type PersonRef } from "./PersonPicker";
import { Button, Field, Initial, Notice, buttonClass } from "./ui";

const selectClass =
  "min-h-12 w-full rounded-lg border-2 border-[#8f8a80] bg-white px-3 py-2 text-[1.125rem] text-ink focus:border-hombre";

function ErrorText({ state }: { state: AdminState }) {
  if (state?.error) return <Notice kind="aviso">{state.error}</Notice>;
  if (state?.ok) return <Notice kind="listo">{state.ok}</Notice>;
  return null;
}

/**
 * El enlace recién creado. Se muestra una sola vez: en la base solo queda su hash.
 * Si el correo salió, se avisa y el enlace queda de respaldo (por si no le llega).
 */
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
      <p className="font-bold">
        {state.sent ? `Correo enviado${state.linkFor ? ` a ${state.linkFor}` : ""}` : `Enlace listo${state.linkFor ? ` para ${state.linkFor}` : ""}`}
      </p>
      {state.mailError && (
        <p className="zb-apoyo mt-0.5 !text-aviso">
          No se pudo mandar el correo ({state.mailError}). Copia el enlace y mándaselo por WhatsApp.
        </p>
      )}
      <p className="zb-apoyo mt-0.5 !text-ink">
        {state.sent ? "Por si no le llega (que revise spam), también puedes copiar el enlace. " : ""}
        {note}
      </p>
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
  const [role, setRole] = useState<Role>("lector");
  const [person, setPerson] = useState<PersonRef | null>(null);
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
          <span className="text-[1.125rem] font-bold">¿Quién es en el árbol?</span>
          <PersonPicker value={person} onChange={setPerson} placeholder="Escribe su nombre" />
          <input type="hidden" name="personId" value={person?.id ?? ""} />
          <p className="zb-apoyo">Obligatorio: solo se invita a quien ya está en el árbol. Si no aparece, agrégalo primero. Al entrar verá el archivo desde su propia persona.</p>
        </div>
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
          <Button type="submit" disabled={pending || !person}>
            {pending ? "Enviando…" : "Enviar invitación"}
          </Button>
          {!person && <p className="zb-apoyo mt-2">Elige primero quién es en el árbol para poder enviarla.</p>}
        </div>
      </form>
      <ErrorText state={state} />
      <LinkBox
        state={state}
        note="Sirve una sola vez, vence en 7 días y no se vuelve a mostrar."
      />
    </div>
  );
}

export function MemberRow({
  member,
  isSelf,
}: {
  member: { id: string; name: string; email: string; role: Role; since: string; personId: string | null; personName: string | null };
  isSelf: boolean;
}) {
  const [roleState, roleAction, rolePending] = useActionState(changeRole, undefined);
  const [resetState, resetAction, resetPending] = useActionState(passwordResetLink, undefined);
  const [removeState, removeAction, removePending] = useActionState(removeAccess, undefined);
  const [linkState, linkAction, linkPending] = useActionState(linkMember, undefined);
  const [changingLink, setChangingLink] = useState(false);
  const [newPerson, setNewPerson] = useState<PersonRef | null>(null);
  const saveLink = (personId: string) => {
    const formData = new FormData();
    formData.set("userId", member.id);
    formData.set("personId", personId);
    startTransition(() => {
      linkAction(formData);
      setChangingLink(false);
      setNewPerson(null);
    });
  };
  const [confirmRemove, setConfirmRemove] = useState(false);
  // El rol elegido queda como borrador hasta apretar «Guardar»: un clic o un
  // scroll sobre el selector no debe dar ni quitar permisos por accidente.
  const [draftRole, setDraftRole] = useState<Role>(member.role);
  const role = draftRole;
  const changed = role !== member.role;
  const saveRole = () => {
    const formData = new FormData();
    formData.set("userId", member.id);
    formData.set("role", role);
    startTransition(() => roleAction(formData));
  };

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
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label={`Qué puede hacer ${member.name}`}
              value={role}
              disabled={rolePending}
              onChange={(e) => setDraftRole(e.target.value as Role)}
              className={`${selectClass} sm:w-44`}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
            {changed && (
              <>
                <Button disabled={rolePending} onClick={saveRole}>
                  {rolePending ? "Guardando…" : "Guardar"}
                </Button>
                <button type="button" disabled={rolePending} onClick={() => setDraftRole(member.role)} className={buttonClass("enlace")}>
                  Cancelar
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {changed && role === "admin" && (
        <Notice kind="aviso">
          {member.name} podrá invitar gente, cambiar roles y quitar accesos, igual que tú. Revisa bien antes de guardar.
        </Notice>
      )}

      <p className="zb-apoyo">
        En el árbol: <span className="font-bold text-ink">{member.personName ?? "sin vincular"}</span>
      </p>

      <details className="group">
        <summary className={`${buttonClass("enlace")} w-fit cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
          <span aria-hidden="true" className="inline-block transition-transform group-open:rotate-90">▸</span>
          <span className="sr-only">{member.name}: </span>Administrar
        </summary>
      <div className="mt-2 flex flex-col gap-3 rounded-xl bg-paper px-4 py-3">
      <div className="flex flex-col gap-2">
        <button type="button" onClick={() => setChangingLink((o) => !o)} className={buttonClass("enlace", "w-fit")}>
          {changingLink ? "Cancelar" : member.personName ? "Cambiar la persona del árbol" : "Vincular con una persona del árbol"}
        </button>
        {changingLink && (
          <div className="flex flex-col gap-2">
            <PersonPicker value={newPerson} onChange={setNewPerson} placeholder="Escribe su nombre" />
            <div className="flex flex-wrap gap-2">
              {newPerson && (
                <Button type="button" disabled={linkPending} onClick={() => saveLink(newPerson.id)}>
                  Vincular con {newPerson.name}
                </Button>
              )}
              {member.personName && (
                <button type="button" disabled={linkPending} onClick={() => saveLink("")} className={buttonClass("secundario")}>
                  Quitar el vínculo
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <form action={resetAction}>
          <input type="hidden" name="userId" value={member.id} />
          <input type="hidden" name="label" value={member.name} />
          <button type="submit" disabled={resetPending} className={buttonClass("enlace")}>
            {resetPending ? "Enviando…" : "Mandar enlace para nueva contraseña"}
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

      </div>
      </details>

      <ErrorText state={roleState} />
      <ErrorText state={resetState} />
      <ErrorText state={removeState} />
      <ErrorText state={linkState} />
      <LinkBox
        state={resetState}
        note="Con este enlace elige una contraseña nueva. Sirve una sola vez, vence en 48 horas y no se vuelve a mostrar."
      />
    </li>
  );
}

const STATUS: Record<InvitationStatus, { label: string; tone: string }> = {
  creada: { label: "Creada, sin correo", tone: "bg-adobe-2 text-ink" },
  enviada: { label: "Correo enviado", tone: "bg-[#dce7f6] text-hombre" },
  abierta: { label: "Abrió el enlace", tone: "bg-trigo text-ink" },
  no_enviada: { label: "No se pudo enviar", tone: "bg-aviso text-white" },
  aceptada: { label: "Aceptada", tone: "bg-parra text-adobe" },
  vencida: { label: "Vencida", tone: "bg-paper text-gris" },
  anulada: { label: "Anulada", tone: "bg-paper text-gris" },
};
const OPEN = new Set<InvitationStatus>(["creada", "enviada", "abierta", "no_enviada"]);
const date = (d: string) => d.split("-").reverse().join("/");

function InvitationRow({ invitation }: { invitation: InvitationRowData }) {
  const [cancelState, cancelAction, cancelPending] = useActionState(cancelInvitation, undefined);
  const [resendState, resendAction, resendPending] = useActionState(resendInvitation, undefined);
  const st = STATUS[invitation.status];
  const canResend = OPEN.has(invitation.status) || invitation.status === "vencida";
  const what =
    invitation.kind === "reset"
      ? "Contraseña nueva"
      : `Invitación como ${ROLE_LABELS[invitation.role].toLowerCase()}${invitation.personName ? ` · será ${invitation.personName}` : ""}`;
  return (
    <li className="flex flex-col gap-2 px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="zb-nombre break-all">{invitation.email}</p>
          <p className="zb-apoyo">{what}</p>
          <p className="zb-apoyo tabular-nums">
            Creada el {date(invitation.created)}
            {invitation.invitedBy ? ` por ${invitation.invitedBy}` : ""}
            {OPEN.has(invitation.status) ? ` · vence el ${date(invitation.expires)}` : ""}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-base font-bold ${st.tone}`}>{st.label}</span>
      </div>
      {invitation.status === "no_enviada" && invitation.sendError && <p className="zb-apoyo !text-aviso">Motivo: {invitation.sendError}</p>}
      {canResend && (
        <div className="flex flex-wrap gap-2">
          <form action={resendAction}>
            <input type="hidden" name="invitationId" value={invitation.id} />
            <button type="submit" disabled={resendPending} className={buttonClass("secundario")}>
              {resendPending ? "Reenviando…" : "Reenviar"}
            </button>
          </form>
          {OPEN.has(invitation.status) && (
            <form action={cancelAction}>
              <input type="hidden" name="invitationId" value={invitation.id} />
              <button type="submit" disabled={cancelPending} className={buttonClass("enlace", "!text-aviso")}>
                Anular
              </button>
            </form>
          )}
        </div>
      )}
      <ErrorText state={resendState} />
      <ErrorText state={cancelState} />
      <LinkBox state={resendState} note="El enlace anterior ya no sirve. Este también es de un solo uso." />
    </li>
  );
}

/** Invitaciones vigentes arriba; las cerradas (aceptadas, anuladas, vencidas) plegadas abajo. */
export function InvitationsList({ invitations }: { invitations: InvitationRowData[] }) {
  const open = invitations.filter((i) => OPEN.has(i.status));
  const closed = invitations.filter((i) => !OPEN.has(i.status));
  if (!invitations.length) return <p className="zb-apoyo">Sin invitaciones en los últimos 60 días. Cuando invites a alguien, aquí verás si le llegó.</p>;
  return (
    <div className="flex flex-col gap-4">
      {open.length > 0 ? (
        <ul className="overflow-hidden rounded-2xl border-2 border-line bg-white divide-y-2 divide-line">
          {open.map((i) => (
            <InvitationRow key={i.id} invitation={i} />
          ))}
        </ul>
      ) : (
        <p className="zb-apoyo">No hay invitaciones esperando respuesta.</p>
      )}
      {closed.length > 0 && (
        <details className="rounded-2xl border-2 border-line bg-white">
          <summary className="cursor-pointer px-5 py-4 text-[1.125rem] font-bold">Cerradas en los últimos 60 días ({closed.length})</summary>
          <ul className="divide-y-2 divide-line border-t-2 border-line">
            {closed.map((i) => (
              <InvitationRow key={i.id} invitation={i} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

type MemberData = { id: string; name: string; email: string; role: Role; since: string; personId: string | null; personName: string | null };

const fold = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Personas con acceso: buscador y grupos por rol (administradores, editores, lectores). */
export function MembersList({ members, selfId }: { members: MemberData[]; selfId: string }) {
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const q = fold(query.trim());
    return q ? members.filter((m) => fold(`${m.name} ${m.email} ${m.personName ?? ""}`).includes(q)) : members;
  }, [members, query]);
  const groups = ROLES.map((r) => ({ role: r, people: shown.filter((m) => m.role === r).sort((a, b) => a.name.localeCompare(b.name, "es")) })).filter(
    (g) => g.people.length > 0,
  );
  const GROUP_TITLE: Record<Role, string> = { admin: "Administradores", editor: "Editores", lector: "Lectores" };
  return (
    <div className="flex flex-col gap-4">
      {members.length > 5 && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="member-search" className="text-[1.125rem] font-bold">
            Buscar
          </label>
          <input
            id="member-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nombre, correo o persona del árbol"
            className="min-h-12 w-full rounded-lg border-2 border-[#8f8a80] bg-white px-3 text-[1.125rem] text-ink focus:border-hombre"
          />
        </div>
      )}
      {groups.length === 0 && <p className="zb-apoyo">Nadie coincide con «{query}».</p>}
      {groups.map((g) => (
        <section key={g.role} aria-label={GROUP_TITLE[g.role]}>
          {groups.length > 1 && (
            <h3 className="zb-apoyo mb-2 font-bold uppercase tracking-wide !text-burdeos">
              {GROUP_TITLE[g.role]} ({g.people.length})
            </h3>
          )}
          <ul className="overflow-hidden rounded-2xl border-2 border-line bg-white divide-y-2 divide-line">
            {g.people.map((m) => (
              <MemberRow key={m.id} member={m} isSelf={m.id === selfId} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
