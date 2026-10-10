// Usuarios, invitaciones y accesos. No depende de Next (lo usa también el
// script scripts/usuarios.ts), solo de la base.

import { getPool } from "../db/pool";
import { hashPassword, verifyPassword } from "../auth/password";
import { hashToken, newToken } from "../auth/tokens";
import type { Role } from "../auth/roles";

const MAX_FAILED_LOGINS = 8;
const LOCK_MINUTES = 15;
const INVITE_DAYS = 14;
const RESET_HOURS = 48;

// Hash de relleno: cuando el correo no existe igual se calcula un hash, para
// que la respuesta tarde lo mismo y no delate qué correos tienen cuenta.
let dummyHash: Promise<string> | null = null;

/**
 * ¿Está lista la base para entrar? Sirve para que la pantalla de entrada
 * explique qué falta en vez de fallar: recién instalado el login no existen
 * las tablas de usuarios (falta la migración) o no hay ningún usuario todavía.
 */
export async function getSetupState(): Promise<"needs-migration" | "needs-admin" | "ready"> {
  const pool = getPool();
  const { rows } = await pool.query(`select to_regclass('public.users') as users`);
  if (!rows[0].users) return "needs-migration";
  const { rows: someone } = await pool.query(`select 1 from users limit 1`);
  return someone.length ? "ready" : "needs-admin";
}

export type LoginResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "invalid" | "locked" };

export async function attemptLogin(email: string, password: string): Promise<LoginResult> {
  const pool = getPool();
  const { rows } = await pool.query(
    `select id, password_hash, locked_until > now() as locked from users where lower(email) = $1`,
    [email],
  );
  const user = rows[0];
  if (!user) {
    dummyHash ??= hashPassword("relleno-sin-uso");
    await verifyPassword(password, await dummyHash);
    return { ok: false, reason: "invalid" };
  }
  if (user.locked) return { ok: false, reason: "locked" };

  if (!(await verifyPassword(password, user.password_hash))) {
    await pool.query(
      `update users set
         failed_logins = failed_logins + 1,
         locked_until = case when failed_logins + 1 >= $2 then now() + make_interval(mins => $3) else locked_until end
       where id = $1`,
      [user.id, MAX_FAILED_LOGINS, LOCK_MINUTES],
    );
    return { ok: false, reason: "invalid" };
  }

  await pool.query(`update users set failed_logins = 0, locked_until = null where id = $1`, [user.id]);
  return { ok: true, userId: user.id };
}

/** Crea el usuario (o le cambia la contraseña si ya existe) y le da el rol en el árbol. */
export async function upsertUserWithRole(opts: {
  treeId: string;
  email: string;
  name: string;
  password: string;
  role: Role;
}): Promise<string> {
  const pool = getPool();
  const passwordHash = await hashPassword(opts.password);
  const { rows } = await pool.query(
    `insert into users (email, name, password_hash) values ($1, $2, $3)
     on conflict (lower(email)) do update set
       name = excluded.name, password_hash = excluded.password_hash, failed_logins = 0, locked_until = null
     returning id`,
    [opts.email, opts.name, passwordHash],
  );
  const userId = rows[0].id as string;
  await pool.query(
    `insert into tree_members (tree_id, user_id, role) values ($1, $2, $3)
     on conflict (tree_id, user_id) do update set role = excluded.role`,
    [opts.treeId, userId, opts.role],
  );
  return userId;
}

export type Member = { id: string; name: string; email: string; role: Role; since: string };

export async function listMembers(treeId: string): Promise<Member[]> {
  const { rows } = await getPool().query(
    `select u.id, u.name, u.email, m.role, to_char(m.invited_at, 'YYYY-MM-DD') as since
     from tree_members m join users u on u.id = m.user_id
     where m.tree_id = $1
     order by m.invited_at`,
    [treeId],
  );
  return rows as Member[];
}

export type PendingInvitation = { id: string; kind: "invite" | "reset"; email: string; role: Role; expires: string };

export async function listPendingInvitations(treeId: string): Promise<PendingInvitation[]> {
  const { rows } = await getPool().query(
    `select id, kind, email, role, to_char(expires_at, 'YYYY-MM-DD') as expires
     from invitations
     where tree_id = $1 and used_at is null and expires_at > now()
     order by created_at desc`,
    [treeId],
  );
  return rows as PendingInvitation[];
}

export type InviteResult = { ok: true; token: string } | { ok: false; error: string };

/** Invita a un correo nuevo. Devuelve el token: el enlace se muestra una sola vez. */
export async function createInvitation(opts: {
  treeId: string;
  email: string;
  role: Role;
  invitedBy: string | null;
}): Promise<InviteResult> {
  const pool = getPool();
  const { rows: members } = await pool.query(
    `select 1 from tree_members m join users u on u.id = m.user_id
     where m.tree_id = $1 and lower(u.email) = $2`,
    [opts.treeId, opts.email],
  );
  if (members.length) return { ok: false, error: "Esa persona ya tiene acceso." };

  // Una invitación vigente por correo: la anterior deja de servir.
  await pool.query(
    `delete from invitations where tree_id = $1 and email = $2 and kind = 'invite' and used_at is null`,
    [opts.treeId, opts.email],
  );
  const token = newToken();
  await pool.query(
    `insert into invitations (tree_id, kind, email, role, token_hash, invited_by, expires_at)
     values ($1, 'invite', $2, $3, $4, $5, now() + make_interval(days => $6))`,
    [opts.treeId, opts.email, opts.role, hashToken(token), opts.invitedBy, INVITE_DAYS],
  );
  return { ok: true, token };
}

/** Enlace para que alguien que ya tiene cuenta ponga una contraseña nueva. */
export async function createPasswordReset(opts: {
  treeId: string;
  userId: string;
  invitedBy: string | null;
}): Promise<InviteResult> {
  const pool = getPool();
  const { rows } = await pool.query(
    `select u.email, m.role from tree_members m join users u on u.id = m.user_id
     where m.tree_id = $1 and u.id = $2`,
    [opts.treeId, opts.userId],
  );
  if (!rows[0]) return { ok: false, error: "Esa persona ya no tiene acceso." };
  await pool.query(
    `delete from invitations where tree_id = $1 and email = $2 and kind = 'reset' and used_at is null`,
    [opts.treeId, rows[0].email],
  );
  const token = newToken();
  await pool.query(
    `insert into invitations (tree_id, kind, email, role, token_hash, invited_by, expires_at)
     values ($1, 'reset', $2, $3, $4, $5, now() + make_interval(hours => $6))`,
    [opts.treeId, rows[0].email, rows[0].role, hashToken(token), opts.invitedBy, RESET_HOURS],
  );
  return { ok: true, token };
}

export type InvitationInfo = { kind: "invite" | "reset"; email: string; role: Role; userName: string | null };

/** Lo que muestra la página del enlace, o null si el enlace no existe, venció o ya se usó. */
export async function getInvitation(token: string): Promise<InvitationInfo | null> {
  const { rows } = await getPool().query(
    `select i.kind, i.email, i.role, u.name as user_name
     from invitations i
     left join users u on lower(u.email) = i.email
     where i.token_hash = $1 and i.used_at is null and i.expires_at > now()`,
    [hashToken(token)],
  );
  const r = rows[0];
  return r ? { kind: r.kind, email: r.email, role: r.role, userName: r.user_name } : null;
}

export type AcceptResult = { ok: true; userId: string } | { ok: false; error: string };

/** Usa el enlace: crea la cuenta (invitación) o cambia la contraseña (reset). Una sola vez. */
export async function acceptInvitation(token: string, name: string, password: string): Promise<AcceptResult> {
  const passwordHash = await hashPassword(password);
  const client = await getPool().connect();
  try {
    await client.query("begin");
    // "for update": dos pestañas con el mismo enlace no pueden usarlo a la vez.
    const { rows } = await client.query(
      `select id, tree_id, kind, email, role from invitations
       where token_hash = $1 and used_at is null and expires_at > now()
       for update`,
      [hashToken(token)],
    );
    const inv = rows[0];
    if (!inv) {
      await client.query("rollback");
      return { ok: false, error: "Este enlace ya no sirve: venció o ya se usó. Pide uno nuevo." };
    }

    let userId: string;
    if (inv.kind === "reset") {
      const res = await client.query(
        `update users set password_hash = $2, failed_logins = 0, locked_until = null
         where lower(email) = $1 returning id`,
        [inv.email, passwordHash],
      );
      if (!res.rows[0]) {
        await client.query("rollback");
        return { ok: false, error: "Esa cuenta ya no existe." };
      }
      userId = res.rows[0].id;
      // Contraseña nueva: se cierran las sesiones que estuvieran abiertas.
      await client.query(`delete from sessions where user_id = $1`, [userId]);
    } else {
      const res = await client.query(
        `insert into users (email, name, password_hash) values ($1, $2, $3)
         on conflict (lower(email)) do update set name = excluded.name, password_hash = excluded.password_hash
         returning id`,
        [inv.email, name, passwordHash],
      );
      userId = res.rows[0].id;
      await client.query(
        `insert into tree_members (tree_id, user_id, role) values ($1, $2, $3)
         on conflict (tree_id, user_id) do update set role = excluded.role`,
        [inv.tree_id, userId, inv.role],
      );
    }
    await client.query(`update invitations set used_at = now() where id = $1`, [inv.id]);
    await client.query("commit");
    return { ok: true, userId };
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

export async function revokeInvitation(treeId: string, invitationId: string): Promise<void> {
  await getPool().query(`delete from invitations where tree_id = $1 and id = $2 and used_at is null`, [
    treeId,
    invitationId,
  ]);
}

async function adminCount(treeId: string): Promise<number> {
  const { rows } = await getPool().query(
    `select count(*)::int as n from tree_members where tree_id = $1 and role = 'admin'`,
    [treeId],
  );
  return rows[0].n;
}

/** Cambia el rol. El árbol nunca se queda sin administrador. */
export async function setMemberRole(treeId: string, userId: string, role: Role): Promise<string | null> {
  const pool = getPool();
  const { rows } = await pool.query(`select role from tree_members where tree_id = $1 and user_id = $2`, [
    treeId,
    userId,
  ]);
  if (!rows[0]) return "Esa persona ya no tiene acceso.";
  if (rows[0].role === "admin" && role !== "admin" && (await adminCount(treeId)) <= 1) {
    return "Tiene que quedar al menos un administrador.";
  }
  await pool.query(`update tree_members set role = $3 where tree_id = $1 and user_id = $2`, [treeId, userId, role]);
  return null;
}

/** Quita el acceso al árbol y cierra sus sesiones. La cuenta y el historial quedan. */
export async function removeMember(treeId: string, userId: string): Promise<string | null> {
  const pool = getPool();
  const { rows } = await pool.query(`select role from tree_members where tree_id = $1 and user_id = $2`, [
    treeId,
    userId,
  ]);
  if (!rows[0]) return null;
  if (rows[0].role === "admin" && (await adminCount(treeId)) <= 1) {
    return "Tiene que quedar al menos un administrador.";
  }
  await pool.query(`delete from tree_members where tree_id = $1 and user_id = $2`, [treeId, userId]);
  await pool.query(`delete from sessions where user_id = $1`, [userId]);
  return null;
}

export type ChangeRow = {
  id: string;
  when: string;
  userName: string;
  personId: string | null;
  personName: string | null;
  entity: "person" | "event";
  action: "create" | "update" | "delete";
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};

export async function listChanges(treeId: string, limit = 100): Promise<ChangeRow[]> {
  const { rows } = await getPool().query(
    `select id::text, to_char(created_at at time zone 'America/Santiago', 'YYYY-MM-DD HH24:MI') as "when",
            user_name as "userName", person_id as "personId", person_name as "personName",
            entity, action, before, after
     from change_log
     where tree_id = $1
     order by created_at desc, id desc
     limit $2`,
    [treeId, limit],
  );
  return rows as ChangeRow[];
}

/** La persona del árbol con la que está vinculado el usuario (o null). */
export async function getLinkedPersonId(userId: string): Promise<string | null> {
  try {
    const { rows } = await getPool().query(`select person_id from users where id = $1`, [userId]);
    return rows[0]?.person_id ?? null;
  } catch (err) {
    // La columna llega con la migración 0003: sin ella nadie está vinculado todavía.
    if ((err as { code?: string }).code === "42703") return null;
    throw err;
  }
}

export type PersonMatch = { id: string; displayName: string; birth: string | null };

/** Personas del árbol cuyo nombre contiene el texto (sin tildes ni mayúsculas). */
export async function findPersonsByName(treeId: string, text: string): Promise<PersonMatch[]> {
  const key = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const { rows } = await getPool().query(
    `select p.id, n.display_name,
            (select to_char(date_from, 'YYYY') from events e where e.person_id = p.id and e.event_type = 'BIRT'
             order by e.date_from nulls last, e.id limit 1) as birth
     from persons p join person_names n on n.person_id = p.id and n.is_primary
     where p.tree_id = $1 and n.search_key like '%' || $2 || '%'
     order by n.display_name limit 20`,
    [treeId, key],
  );
  return rows.map((r) => ({ id: r.id, displayName: r.display_name, birth: r.birth }));
}

/** Vincula (o desvincula con null) a un usuario con una persona del árbol. */
export async function linkUserToPerson(userId: string, personId: string | null): Promise<void> {
  await getPool().query(`update users set person_id = $2 where id = $1`, [userId, personId]);
}
