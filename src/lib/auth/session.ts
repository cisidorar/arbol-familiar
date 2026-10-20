// Sesiones guardadas en la base. Solo para el servidor (lee cookies y la
// base): no importar desde componentes de cliente.
//
// La cookie lleva un token al azar; la base, su hash. Cada pedido vuelve a
// leer la sesión, el usuario y su rol desde la base: si a alguien se le quita
// el acceso o se le cambia el rol, rige desde el pedido siguiente.

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getPool } from "../db/pool";
import { getDefaultTreeId } from "../data/tree";
import { canAdmin, canEdit, isRole, type Role } from "./roles";
import { hashToken, newToken } from "./tokens";

export const SESSION_COOKIE = "azb_session";
const SESSION_DAYS = 30;

export type Session = {
  sessionId: string;
  user: { id: string; name: string; email: string };
  treeId: string;
  role: Role;
};

export async function createSession(userId: string, remember = true): Promise<void> {
  const token = newToken();
  // Sin "mantener la sesión": vale un día y la cookie muere al cerrar el navegador.
  const expiresAt = new Date(Date.now() + (remember ? SESSION_DAYS : 1) * 24 * 60 * 60 * 1000);
  await getPool().query(`insert into sessions (user_id, token_hash, expires_at) values ($1, $2, $3)`, [
    userId,
    hashToken(token),
    expiresAt,
  ]);
  // De paso se limpian las sesiones vencidas de esta persona.
  await getPool().query(`delete from sessions where user_id = $1 and expires_at < now()`, [userId]);

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    // En producción la cookie solo viaja por https; en el Mac (http://localhost) no.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    ...(remember ? { expires: expiresAt } : {}),
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await getPool().query(`delete from sessions where token_hash = $1`, [hashToken(token)]);
  store.delete(SESSION_COOKIE);
}

/** La sesión de quien hace el pedido, o null si no entró o ya no tiene acceso al árbol. */
export const getSession = cache(async (): Promise<Session | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const treeId = await getDefaultTreeId();
  if (!treeId) return null;

  const { rows } = await getPool().query(
    `select s.id as session_id, u.id, u.name, u.email, m.role
     from sessions s
     join users u on u.id = s.user_id
     join tree_members m on m.user_id = u.id and m.tree_id = $2
     where s.token_hash = $1 and s.expires_at > now()`,
    [hashToken(token), treeId],
  );
  const row = rows[0];
  if (!row || !isRole(row.role)) return null;
  return {
    sessionId: row.session_id,
    user: { id: row.id, name: row.name, email: row.email },
    treeId,
    role: row.role,
  };
});

/** Para páginas: sin sesión manda al login. */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/** Para páginas de administración: quien no es admin vuelve al árbol. */
export async function requireAdmin(): Promise<Session> {
  const session = await requireSession();
  if (!canAdmin(session.role)) redirect("/");
  return session;
}

type ApiAuth = { session: Session; denied: null } | { session: null; denied: Response };

/**
 * Para rutas de la API: devuelve la sesión o la respuesta de rechazo ya
 * armada (401 sin sesión, 403 si el rol no alcanza).
 */
export async function apiSession(need: "read" | "edit" = "read"): Promise<ApiAuth> {
  const session = await getSession();
  if (!session) {
    return { session: null, denied: Response.json({ error: "Tienes que iniciar sesión." }, { status: 401 }) };
  }
  if (need === "edit" && !canEdit(session.role)) {
    return { session: null, denied: Response.json({ error: "Tu acceso es solo de lectura." }, { status: 403 }) };
  }
  return { session, denied: null };
}

/**
 * Un pedido que modifica datos debe venir de la propia app. La cookie ya es
 * SameSite=Lax (otro sitio no puede mandarla en un POST), y además se exige
 * que el Origin, cuando viene, sea el mismo host.
 */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
