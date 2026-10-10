"use server";

// Acciones de la pantalla de administración. Cada una vuelve a comprobar en
// el servidor que quien la llama es administrador: esconder el botón no basta.

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { canAdmin, isRole, normalizeEmail } from "@/lib/auth/roles";
import { getSession } from "@/lib/auth/session";
import {
  createInvitation,
  createPasswordReset,
  removeMember,
  revokeInvitation,
  setMemberRole,
} from "@/lib/data/users";

export type AdminState = { error?: string; link?: string; linkFor?: string } | undefined;

async function adminSession() {
  const session = await getSession();
  return session && canAdmin(session.role) ? session : null;
}

async function linkFor(token: string): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}/invitacion/${token}`;
}

const NOT_ALLOWED = { error: "Solo un administrador puede hacer esto." };

export async function invite(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const session = await adminSession();
  if (!session) return NOT_ALLOWED;
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const role = formData.get("role");
  if (!email) return { error: "Ese correo no parece válido." };
  if (!isRole(role)) return { error: "Elige un rol." };

  const result = await createInvitation({ treeId: session.treeId, email, role, invitedBy: session.user.id });
  if (!result.ok) return { error: result.error };
  revalidatePath("/admin");
  return { link: await linkFor(result.token), linkFor: email };
}

export async function passwordResetLink(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const session = await adminSession();
  if (!session) return NOT_ALLOWED;
  const userId = String(formData.get("userId") ?? "");
  const result = await createPasswordReset({ treeId: session.treeId, userId, invitedBy: session.user.id });
  if (!result.ok) return { error: result.error };
  revalidatePath("/admin");
  return { link: await linkFor(result.token), linkFor: String(formData.get("label") ?? "") };
}

export async function changeRole(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const session = await adminSession();
  if (!session) return NOT_ALLOWED;
  const userId = String(formData.get("userId") ?? "");
  const role = formData.get("role");
  if (!isRole(role)) return { error: "Elige un rol." };
  if (userId === session.user.id) return { error: "No puedes cambiar tu propio rol." };
  const error = await setMemberRole(session.treeId, userId, role);
  revalidatePath("/admin");
  return error ? { error } : undefined;
}

export async function removeAccess(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const session = await adminSession();
  if (!session) return NOT_ALLOWED;
  const userId = String(formData.get("userId") ?? "");
  if (userId === session.user.id) return { error: "No puedes quitarte el acceso a ti misma/o." };
  const error = await removeMember(session.treeId, userId);
  revalidatePath("/admin");
  return error ? { error } : undefined;
}

export async function cancelInvitation(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const session = await adminSession();
  if (!session) return NOT_ALLOWED;
  await revokeInvitation(session.treeId, String(formData.get("invitationId") ?? ""));
  revalidatePath("/admin");
  return undefined;
}
