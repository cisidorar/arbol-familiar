"use server";

// Acciones de la pantalla de administración. Cada una vuelve a comprobar en
// el servidor que quien la llama es administrador: esconder el botón no basta.

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { ROLE_LABELS, canAdmin, isRole, normalizeEmail } from "@/lib/auth/roles";
import { getSession } from "@/lib/auth/session";
import { getPool } from "@/lib/db/pool";
import { logSecurity } from "@/lib/data/security-log";
import {
  INVITE_VALID_DAYS,
  RESET_VALID_HOURS,
  createInvitation,
  createPasswordReset,
  linkUserToPerson,
  markInvitationSent,
  removeMember,
  renewInvitation,
  revokeInvitation,
  setMemberRole,
} from "@/lib/data/users";
import { inviteEmail, mailConfigured, resetEmail, sendMail } from "@/lib/mail";

export type AdminState =
  | {
      error?: string;
      /** Aviso de que la acción salió bien (ej. «Ahora es Editor»). */
      ok?: string;
      link?: string;
      linkFor?: string;
      /** El correo salió. */
      sent?: boolean;
      /** Se intentó mandar el correo y falló (el enlace igual se muestra para copiarlo). */
      mailError?: string;
    }
  | undefined;

async function adminSession() {
  const session = await getSession();
  return session && canAdmin(session.role) ? session : null;
}

async function linkFor(token: string): Promise<string> {
  // APP_URL fija el dominio de los enlaces (en Vercel: https://<tu dominio>). Sin ella se deduce del pedido.
  const base = process.env.APP_URL?.replace(/\/+$/, "");
  if (base) return `${base}/invitacion/${token}`;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}/invitacion/${token}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Id de persona del formulario, solo si existe en este árbol. */
async function treePersonId(treeId: string, raw: FormDataEntryValue | null): Promise<string | null | "invalid"> {
  const id = String(raw ?? "");
  if (!id) return null;
  if (!UUID.test(id)) return "invalid";
  const { rows } = await getPool().query(`select 1 from persons where id = $1 and tree_id = $2`, [id, treeId]);
  return rows.length ? id : "invalid";
}

const NOT_ALLOWED = { error: "Solo un administrador puede hacer esto." };

/** Manda el correo de una invitación o enlace de contraseña y anota el resultado. */
async function deliver(
  invitationId: string,
  to: string,
  mail: { subject: string; html: string; text: string },
): Promise<Pick<NonNullable<AdminState>, "sent" | "mailError">> {
  if (!mailConfigured()) return {};
  const result = await sendMail({ to, ...mail });
  await markInvitationSent(invitationId, result.ok ? null : result.error);
  return result.ok ? { sent: true } : { mailError: result.error };
}

export async function invite(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const session = await adminSession();
  if (!session) return NOT_ALLOWED;
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const role = formData.get("role");
  if (!email) return { error: "Ese correo no parece válido." };
  if (!isRole(role)) return { error: "Elige un rol." };

  // Solo se invita a quien ya existe en el árbol: si no está, primero se agrega.
  const personId = await treePersonId(session.treeId, formData.get("personId"));
  if (personId === null) return { error: "Elige quién es en el árbol. Si todavía no está, agrégalo primero." };
  if (personId === "invalid") return { error: "No encontré a ese familiar en el árbol." };
  // Solo entra quien vive: una persona marcada como fallecida no puede tener cuenta.
  const living = await getPool().query(`select is_living from persons where id = $1`, [personId]);
  if (!living.rows[0]?.is_living) return { error: "Solo se puede invitar a personas marcadas como vivas. Si está vivo, márcalo así en su ficha." };

  const result = await createInvitation({ treeId: session.treeId, email, role, invitedBy: session.user.id, personId });
  if (!result.ok) return { error: result.error };
  await logSecurity("invitacion_creada", { userId: session.user.id, email, detail: { role, personId } });
  const link = await linkFor(result.token);
  const personName = personId ? await personNameOf(personId) : null;
  const delivery = await deliver(result.id, email, inviteEmail({ inviter: session.user.name, link, days: INVITE_VALID_DAYS, personName }));
  revalidatePath("/admin");
  return { link, linkFor: email, ...delivery };
}

export async function passwordResetLink(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const session = await adminSession();
  if (!session) return NOT_ALLOWED;
  const userId = String(formData.get("userId") ?? "");
  const result = await createPasswordReset({ treeId: session.treeId, userId, invitedBy: session.user.id });
  if (!result.ok) return { error: result.error };
  await logSecurity("enlace_contrasena_creado", { userId: session.user.id, detail: { para: userId } });
  const link = await linkFor(result.token);
  const { rows } = await getPool().query(`select name, email from users where id = $1`, [userId]);
  const delivery = rows[0] ? await deliver(result.id, rows[0].email, resetEmail({ name: rows[0].name, link, hours: RESET_VALID_HOURS })) : {};
  revalidatePath("/admin");
  return { link, linkFor: String(formData.get("label") ?? ""), ...delivery };
}

export async function changeRole(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const session = await adminSession();
  if (!session) return NOT_ALLOWED;
  const userId = String(formData.get("userId") ?? "");
  const role = formData.get("role");
  if (!isRole(role)) return { error: "Elige un rol." };
  if (userId === session.user.id) return { error: "No puedes cambiar tu propio rol." };
  const error = await setMemberRole(session.treeId, userId, role);
  if (!error) await logSecurity("rol_cambiado", { userId: session.user.id, detail: { para: userId, role } });
  revalidatePath("/admin");
  return error ? { error } : { ok: `Listo: ahora es ${ROLE_LABELS[role].toLowerCase()}.` };
}

export async function removeAccess(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const session = await adminSession();
  if (!session) return NOT_ALLOWED;
  const userId = String(formData.get("userId") ?? "");
  if (userId === session.user.id) return { error: "No puedes quitarte el acceso a ti misma/o." };
  const error = await removeMember(session.treeId, userId);
  if (!error) await logSecurity("acceso_quitado", { userId: session.user.id, detail: { para: userId } });
  revalidatePath("/admin");
  return error ? { error } : undefined;
}

/** Reenviar: enlace nuevo, plazo nuevo y otro correo. El enlace anterior deja de servir. */
export async function resendInvitation(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const session = await adminSession();
  if (!session) return NOT_ALLOWED;
  const result = await renewInvitation(session.treeId, String(formData.get("invitationId") ?? ""));
  if (!result.ok) return { error: result.error };
  await logSecurity("invitacion_reenviada", { userId: session.user.id, email: result.email, detail: { invitationId: result.id } });
  const link = await linkFor(result.token);
  const mail =
    result.kind === "reset"
      ? resetEmail({ name: result.userName ?? "", link, hours: RESET_VALID_HOURS })
      : inviteEmail({ inviter: session.user.name, link, days: INVITE_VALID_DAYS, personName: result.personName });
  const delivery = await deliver(result.id, result.email, mail);
  revalidatePath("/admin");
  return { link, linkFor: result.email, ...delivery };
}

async function personNameOf(personId: string): Promise<string | null> {
  const { rows } = await getPool().query(`select display_name from person_names where person_id = $1 and is_primary`, [personId]);
  return rows[0]?.display_name ?? null;
}

export async function cancelInvitation(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const session = await adminSession();
  if (!session) return NOT_ALLOWED;
  const invitationId = String(formData.get("invitationId") ?? "");
  await revokeInvitation(session.treeId, invitationId);
  await logSecurity("invitacion_cancelada", { userId: session.user.id, detail: { invitationId } });
  revalidatePath("/admin");
  return undefined;
}

/** El administrador cambia (o quita, con el campo vacío) a qué persona del árbol corresponde una cuenta. */
export async function linkMember(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const session = await adminSession();
  if (!session) return NOT_ALLOWED;
  const userId = String(formData.get("userId") ?? "");
  const { rows } = await getPool().query(`select 1 from tree_members where tree_id = $1 and user_id = $2`, [session.treeId, userId]);
  if (!rows.length) return { error: "Esa cuenta no está en el archivo." };
  const personId = await treePersonId(session.treeId, formData.get("personId"));
  if (personId === "invalid") return { error: "No encontré a ese familiar en el árbol." };
  await linkUserToPerson(userId, personId);
  await logSecurity("vinculo_cambiado", { userId: session.user.id, detail: { para: userId, personId } });
  revalidatePath("/admin");
  revalidatePath("/", "layout");
  return undefined;
}
