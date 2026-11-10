import { describe, expect, it } from "vitest";
import { nameKey, withoutTheory } from "../data/theory";
import { PORTADA } from "../portada-contenido";

describe("withoutTheory", () => {
  it("saca las entradas que nombran a alguien que es teoría, sin importar tildes ni mayúsculas", () => {
    const theory = new Set([nameKey("roque galdames gonzalez"), nameKey("Andrés Lobo")]);
    const left = withoutTheory(PORTADA.hallazgos, theory).map((h) => h.titulo);
    expect(left).not.toContain("Un capitán de 1664");
    expect(left).not.toContain("El testamento de Bartola Galdames");
    expect(left).not.toContain("Dos familias grandes de San Felipe");
    expect(left).toContain("Pabla Araya, la madre de Juan");
    expect(withoutTheory(PORTADA.destacados, theory)[0]?.nombre).toBe("Pabla Araya");
  });
  it("sin teoría, se muestra todo", () => {
    expect(withoutTheory(PORTADA.hallazgos, new Set())).toHaveLength(PORTADA.hallazgos.length);
  });
});
