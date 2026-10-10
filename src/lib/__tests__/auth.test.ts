import { describe, expect, it } from "vitest";
import { hashPassword, passwordProblem, verifyPassword } from "../auth/password";
import { canAdmin, canEdit, isRole, normalizeEmail } from "../auth/roles";
import { hashToken, newToken } from "../auth/tokens";

describe("contraseñas", () => {
  it("el hash verifica la contraseña correcta y rechaza cualquier otra", async () => {
    const hash = await hashPassword("una clave bien larga");
    expect(await verifyPassword("una clave bien larga", hash)).toBe(true);
    expect(await verifyPassword("una clave bien largA", hash)).toBe(false);
    expect(await verifyPassword("", hash)).toBe(false);
  });

  it("nunca guarda la contraseña y usa una sal distinta cada vez", async () => {
    const a = await hashPassword("misma-clave-123");
    const b = await hashPassword("misma-clave-123");
    expect(a).not.toContain("misma-clave-123");
    expect(a).not.toBe(b);
    expect(a.startsWith("scrypt$")).toBe(true);
  });

  it("un hash mal formado no verifica (y no revienta)", async () => {
    for (const bad of ["", "texto", "scrypt$1$2", "md5$1$1$1$aa$bb", "scrypt$0$8$1$aa$bb", "scrypt$x$8$1$aa$bb"]) {
      expect(await verifyPassword("lo que sea", bad)).toBe(false);
    }
  });

  it("exige un largo mínimo", () => {
    expect(passwordProblem("corta")).toMatch(/al menos 10/);
    expect(passwordProblem("diez-letra")).toBeNull();
    expect(passwordProblem("x".repeat(201))).toMatch(/larga/);
  });
});

describe("tokens", () => {
  it("son largos, distintos entre sí y su hash no es el token", () => {
    const a = newToken();
    const b = newToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(43); // 32 bytes en base64url
    expect(hashToken(a)).toHaveLength(64);
    expect(hashToken(a)).not.toContain(a);
    expect(hashToken(a)).toBe(hashToken(a));
    expect(hashToken(a)).not.toBe(hashToken(b));
  });
});

describe("roles", () => {
  it("solo admin y editor editan; solo admin administra", () => {
    expect([canEdit("admin"), canEdit("editor"), canEdit("lector")]).toEqual([true, true, false]);
    expect([canAdmin("admin"), canAdmin("editor"), canAdmin("lector")]).toEqual([true, false, false]);
  });

  it("no acepta roles inventados", () => {
    expect(isRole("admin")).toBe(true);
    expect(isRole("superadmin")).toBe(false);
    expect(isRole(null)).toBe(false);
  });

  it("normaliza el correo y rechaza lo que no lo es", () => {
    expect(normalizeEmail("  Tia.Rosa@Prueba.CL ")).toBe("tia.rosa@prueba.cl");
    expect(normalizeEmail("sin-arroba")).toBeNull();
    expect(normalizeEmail("a@b")).toBeNull();
    expect(normalizeEmail("dos palabras@x.cl")).toBeNull();
  });
});
