// Contraseñas: nunca se guardan, solo su hash con scrypt (viene con Node, sin
// dependencias). Formato: scrypt$N$r$p$sal$hash, con sal y hash en base64url,
// para poder subir el costo más adelante sin invalidar las ya guardadas.

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const N = 32768; // costo de CPU/memoria (2^15)
const R = 8;
const P = 1;
const KEY_LENGTH = 32;

export const MIN_PASSWORD_LENGTH = 10;

function derive(password: string, salt: Buffer, n: number, r: number, p: number, length: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // maxmem: scrypt necesita ~128·N·r bytes; el límite por defecto de Node (32 MB) queda justo.
    scrypt(password.normalize("NFKC"), salt, length, { N: n, r, p, maxmem: 256 * n * r }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, N, R, P, KEY_LENGTH);
  return ["scrypt", N, R, P, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [n, r, p] = parts.slice(1, 4).map(Number);
  if (![n, r, p].every((x) => Number.isInteger(x) && x > 0)) return false;
  const salt = Buffer.from(parts[4], "base64url");
  const expected = Buffer.from(parts[5], "base64url");
  if (!salt.length || !expected.length) return false;
  const actual = await derive(password, salt, n, r, p, expected.length);
  return timingSafeEqual(actual, expected);
}

/** Por qué no sirve una contraseña nueva, o null si sirve. */
export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  if (password.length > 200) return "La contraseña es demasiado larga.";
  return null;
}
