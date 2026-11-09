import { describe, expect, it } from "vitest";
import { closeness, closenessLabel, showClosenessLine, grandparentsOf, sortByCloseness, type ClosenessPerson } from "../closeness";

function fam(spec: Record<string, { p?: string[]; s?: string[] }>): ClosenessPerson[] {
  const kids: Record<string, string[]> = {};
  for (const [id, v] of Object.entries(spec)) for (const p of v.p ?? []) (kids[p] ??= []).push(id);
  return Object.entries(spec).map(([id, v]) => ({
    id,
    rels: { parents: v.p ?? [], spouses: v.s ?? [], children: kids[id] ?? [] },
  }));
}

// yo <- mama, papa ; mama <- abuela, abuelo ; papa <- abuelaP, abuelo2
// tia = hermana de mama ; prima = hija de tia ; hermano = hijo de mama
// bisa = padre de abuela ; tio2 = hermano de bisa (lejano)
const people = fam({
  yo: { p: ["mama", "papa"] },
  hermano: { p: ["mama", "papa"] },
  mama: { p: ["abuela", "abuelo"] },
  papa: { p: ["abuelaP", "abuelo2"] },
  tia: { p: ["abuela", "abuelo"], s: ["tio"] },
  tio: { s: ["tia"] },
  prima: { p: ["tia", "tio"] },
  abuela: { p: ["bisa", "bisaM"] },
  abuelo: {},
  abuelaP: {},
  abuelo2: {},
  bisa: {},
  bisaM: {},
  hermBisa: { p: ["bisa", "bisaM"] },
  hijoHermBisa: { p: ["hermBisa"] },
  nietoHermBisa: { p: ["hijoHermBisa"] },
  nieto: { p: ["yo"] },
});

describe("closeness", () => {
  it("él mismo, ancestros y descendientes son directos", () => {
    expect(closeness(people, "yo", "yo")?.level).toBe("directo");
    expect(closeness(people, "yo", "bisa")?.level).toBe("directo");
    expect(closeness(people, "yo", "nieto")?.level).toBe("directo");
  });
  it("hermanos, tíos y primos hermanos son cercanos", () => {
    for (const id of ["hermano", "tia", "prima"]) expect(closeness(people, "yo", id)?.level).toBe("cercano");
  });
  it("la pareja de un cercano hereda la cercanía", () => {
    expect(closeness(people, "yo", "tio")?.level).toBe("cercano");
  });
  it("tíos abuelos y sus hijos son cercanos", () => {
    expect(closeness(people, "yo", "hermBisa")?.level).toBe("cercano");
    expect(closeness(people, "yo", "hijoHermBisa")?.level).toBe("cercano");
  });
  it("los nietos de los tíos abuelos (primos segundos) son otro", () => {
    expect(closeness(people, "yo", "nietoHermBisa")?.level).toBe("otro");
  });
  it("indica la rama del abuelo/a", () => {
    expect(grandparentsOf(new Map(people.map((p) => [p.id, p])), "yo").sort()).toEqual(["abuela", "abuelaP", "abuelo", "abuelo2"]);
    expect(closeness(people, "yo", "bisa")?.rama).toBe("abuela");
    expect(closeness(people, "yo", "prima")?.rama).toBe("abuela");
  });
  it("sin lazo devuelve null y ordena al final", () => {
    const withStranger = [...people, ...fam({ ajeno: {} })];
    expect(closeness(withStranger, "yo", "ajeno")).toBeNull();
    const order = sortByCloseness(withStranger, "yo", [{ id: "ajeno" }, { id: "prima" }, { id: "mama" }]);
    expect(order.map((o) => o.id)).toEqual(["mama", "prima", "ajeno"]);
  });
  it("arma el texto de la ficha", () => {
    expect(closenessLabel(closeness(people, "yo", "prima"), "Ana")).toBe("Pariente cercano · rama de Ana");
    expect(closenessLabel(closeness(people, "yo", "yo"))).toBeNull();
    expect(closenessLabel(null)).toBeNull();
  });
  it("la línea de cercanía solo aparece cuando suma", () => {
    const prima = closeness(people, "yo", "prima");
    expect(showClosenessLine(prima, "Tu prima, por parte de tu mamá")).toBe(false);
    expect(showClosenessLine(prima, "Tu prima")).toBe(true);
    expect(showClosenessLine(closeness(people, "yo", "nietoHermBisa"), "Pariente lejano")).toBe(true);
    expect(showClosenessLine(closeness(people, "yo", "mama"), "Tu mamá")).toBe(false);
  });
});
