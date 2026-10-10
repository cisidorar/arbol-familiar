import { describe, expect, it } from "vitest";
import { canonicalCemetery } from "../geo/cemeteries";

const disp = (t: string, burial = false) => canonicalCemetery(t, burial)?.display;

describe("canonicalCemetery", () => {
  it("corrige faltas y agrega la comuna", () => {
    expect(disp("Cementerio parroquian de Buin")).toBe("Cementerio Parroquial de Buin, Chile");
    expect(disp("Cementerio Catolico Santiago")).toBe("Cementerio Católico, Santiago, Chile");
    expect(disp("Cementerio Municipal Curico")).toBe("Cementerio Municipal, Curicó, Chile");
    expect(disp("Cementerio de Paine")).toBe("Cementerio de Paine, Chile");
  });
  it("es estable: aplicarlo dos veces da lo mismo", () => {
    for (const t of ["Cementerio Católico, Santiago, Chile", "Cementerio General, Santiago, Chile", "Cementerio de Paine, Chile"]) {
      expect(disp(t)).toBe(t);
    }
  });
  it("junta las distintas formas de escribir el mismo cementerio", () => {
    expect(canonicalCemetery("cementerio de buin", false)?.key).toBe(canonicalCemetery("Cementerio de Buin, Chile")?.key);
    expect(canonicalCemetery("Cementerio General de Santiago")?.key).toBe(canonicalCemetery("Cementerio General, Santiago, Chile")?.key);
  });
  it("guarda la comuna", () => {
    const c = canonicalCemetery("Cementerio de Paine");
    expect(c).toMatchObject({ kind: "cemetery", locality: "Paine" });
    expect(c?.comunaCode).toMatch(/^13/);
  });
  it("sin comuna queda como ambiguo, sin adivinar", () => {
    expect(canonicalCemetery("cementerio general")).toMatchObject({ kind: "ambiguous", display: "Cementerio General", locality: null });
  });
  it("un entierro en 'Parroquial de Buin' es el cementerio parroquial", () => {
    expect(disp("Parroquial de Buin", true)).toBe("Cementerio Parroquial de Buin, Chile");
  });
  it("separa cruz, patio y sección del cementerio", () => {
    const c = canonicalCemetery("El Almendral/cruz 158/patio 8", true);
    expect(c).toMatchObject({ kind: "unknown", detail: "cruz 158, patio 8" });
  });
  it("lo que no es un lugar o no se reconoce no se toca", () => {
    expect(canonicalCemetery("Cremado", true)?.kind).toBe("not-a-place");
    expect(canonicalCemetery("San Pedro", true)?.kind).toBe("unknown");
    expect(canonicalCemetery("Buin")).toBeNull();
  });
  it("parques de entierro con comuna", () => {
    expect(disp("Parque Santiago, Santiago", true)).toBe("Parque Santiago, Santiago, Chile");
  });
});
