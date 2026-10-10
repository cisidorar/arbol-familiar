// Tokens de sesión y de invitación: al navegador (o al enlace) va el token
// al azar; en la base solo queda su hash. Con una copia de la base nadie
// puede armar una cookie válida ni reusar un enlace.

import { createHash, randomBytes } from "node:crypto";

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
