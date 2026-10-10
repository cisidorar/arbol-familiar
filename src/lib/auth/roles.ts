// Roles de un árbol (tabla tree_members) y qué permite cada uno.

export const ROLES = ["admin", "editor", "lector"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrador",
  editor: "Editor",
  lector: "Lector",
};

export const ROLE_HELP: Record<Role, string> = {
  admin: "Ve, edita, invita gente y maneja los accesos.",
  editor: "Ve y edita la información de las personas.",
  lector: "Solo ve el árbol y las fichas.",
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function canEdit(role: Role): boolean {
  return role === "admin" || role === "editor";
}

export function canAdmin(role: Role): boolean {
  return role === "admin";
}

export function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email : null;
}
