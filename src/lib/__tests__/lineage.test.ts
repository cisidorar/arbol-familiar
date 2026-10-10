import { describe, expect, it } from "vitest";
import { kinshipPath, type GraphPerson } from "../lineage";

const p = (id: string, label: string, gender: string, parents: string[] = [], children: string[] = [], spouses: string[] = []): GraphPerson => ({
  id, data: { gender, label }, rels: { parents, children, spouses },
});
// abuela (A) + abuelo (B) → mamá (M) y tío (T); mamá + papá (P) → yo (Y); tío → prima (R); papá + (E) es otra pareja
const people = [
  p("A", "Ana Abuela", "F", [], ["M", "T"], ["B"]),
  p("B", "Beto Abuelo", "M", [], ["M", "T"], ["A"]),
  p("M", "Marta Mamá", "F", ["A", "B"], ["Y"], ["P"]),
  p("P", "Pablo Papá", "M", [], ["Y"], ["M"]),
  p("T", "Tomás Tío", "M", ["A", "B"], ["R"]),
  p("R", "Rita Prima", "F", ["T"]),
  p("Y", "Yo Misma", "F", ["M", "P"]),
  p("Z", "Zoe Lejana", "F"),
];

describe("kinshipPath", () => {
  it("sube por los padres hasta un antepasado", () => {
    const path = kinshipPath("Y", "A", people)!;
    expect(path.map((s) => s.id)).toEqual(["Y", "M", "A"]);
    expect(path[1].relation).toBe("madre de Yo");
    expect(path[2].relation).toBe("madre de Marta");
  });
  it("sube y baja para llegar a un pariente que no es antepasado", () => {
    expect(kinshipPath("Y", "R", people)!.map((s) => s.id)).toEqual(["Y", "M", "A", "T", "R"]);
    expect(kinshipPath("Y", "R", people)!.at(-1)!.relation).toBe("hija de Tomás");
  });
  it("pasa por las parejas y marca la nota del último", () => {
    const path = kinshipPath("Y", "P", people, (id) => (id === "P" ? "Cementerio X" : null))!;
    expect(path.map((s) => s.id)).toEqual(["Y", "P"]);
    expect(path.at(-1)!.place).toBe("Cementerio X");
  });
  it("devuelve null si no hay parentesco o la persona no existe", () => {
    expect(kinshipPath("Y", "Z", people)).toBeNull();
    expect(kinshipPath("Y", "nadie", people)).toBeNull();
  });
});

import { kinshipLabel } from "../lineage";
describe("kinshipLabel", () => {
  it("nombra el parentesco desde la persona", () => {
    expect(kinshipLabel("Y", "A", people)).toEqual({ label: "abuela · rama materna", distance: 2 });
    expect(kinshipLabel("Y", "T", people)?.label).toBe("tío · rama materna");
    expect(kinshipLabel("Y", "R", people)?.label).toBe("prima · rama materna");
    expect(kinshipLabel("Y", "P", people)?.label).toBe("padre · rama paterna");
    expect(kinshipLabel("Y", "Y", people)?.label).toBe("tú");
    expect(kinshipLabel("Y", "Z", people)).toBeNull();
  });
});
