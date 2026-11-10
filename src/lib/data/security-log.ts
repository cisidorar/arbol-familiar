// Registro de seguridad (tabla security_log). Solo para el servidor.
//
// Escribir en el registro nunca debe impedir entrar ni administrar: si la tabla
// todavía no existe (migración sin correr) o la base falla, se sigue sin registrar.

import { headers } from "next/headers";
import { getPool } from "../db/pool";

export type SecurityEvent =
  | "entrada"
  | "entrada_fallida"
  | "entrada_bloqueada"
  | "conexion_limitada"
  | "salida"
  | "invitacion_creada"
  | "invitacion_aceptada"
  | "invitacion_cancelada"
  | "invitacion_reenviada"
  | "enlace_contrasena_creado"
  | "contrasena_cambiada"
  | "rol_cambiado"
  | "acceso_quitado"
  | "vinculo_cambiado";

/** Intentos fallidos desde una misma conexión antes de frenarla. */
export const MAX_FAILED_PER_IP = 20;
export const IP_WINDOW_MINUTES = 15;

/** La IP de quien hace el pedido. En Vercel la pone la plataforma en x-real-ip / x-forwarded-for. */
export async function clientIp(): Promise<string | null> {
  const h = await headers();
  const ip = h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0];
  return ip?.trim().slice(0, 64) || null;
}

export async function logSecurity(
  event: SecurityEvent,
  opts: { userId?: string | null; email?: string | null; ip?: string | null; detail?: Record<string, unknown> } = {},
): Promise<void> {
  try {
    const ip = opts.ip === undefined ? await clientIp() : opts.ip;
    await getPool().query(
      `insert into security_log (event, user_id, email, ip, detail) values ($1, $2, $3, $4, $5)`,
      [event, opts.userId ?? null, opts.email ?? null, ip, opts.detail ? JSON.stringify(opts.detail) : null],
    );
  } catch {
    // Sin registro, pero sin romper lo que se estaba haciendo.
  }
}

/** ¿Esta conexión ya falló demasiadas veces en los últimos minutos? */
export async function ipIsLimited(ip: string | null): Promise<boolean> {
  if (!ip) return false;
  try {
    const { rows } = await getPool().query(
      `select count(*)::int as n from security_log
       where ip = $1 and event in ('entrada_fallida', 'entrada_bloqueada') and created_at > now() - make_interval(mins => $2)`,
      [ip, IP_WINDOW_MINUTES],
    );
    return rows[0].n >= MAX_FAILED_PER_IP;
  } catch {
    return false;
  }
}

export type SecurityRow = {
  id: string;
  when: string;
  event: SecurityEvent;
  userName: string | null;
  email: string | null;
  ip: string | null;
  detail: Record<string, unknown> | null;
};

export async function listSecurityLog(limit = 100): Promise<SecurityRow[]> {
  try {
    const { rows } = await getPool().query(
      `select l.id::text, to_char(l.created_at at time zone 'America/Santiago', 'YYYY-MM-DD HH24:MI') as "when",
              l.event, u.name as "userName", l.email, l.ip, l.detail
       from security_log l left join users u on u.id = l.user_id
       order by l.created_at desc, l.id desc
       limit $1`,
      [limit],
    );
    return rows as SecurityRow[];
  } catch {
    return [];
  }
}

/** Intentos de entrada fallidos (o frenados) en las últimas 24 horas. */
export async function countFailedLastDay(): Promise<number> {
  try {
    const { rows } = await getPool().query(
      `select count(*)::int as n from security_log
       where event in ('entrada_fallida', 'entrada_bloqueada', 'conexion_limitada') and created_at > now() - interval '24 hours'`,
    );
    return rows[0].n;
  } catch {
    return 0;
  }
}
