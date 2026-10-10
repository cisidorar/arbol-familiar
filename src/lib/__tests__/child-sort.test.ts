import { describe, expect, it } from "vitest";
import { makeChildSort, type LayoutDatum } from "../tree-layout";

const mk = (id: string, birth: number | null, parents: string[], spouses: string[] = []): LayoutDatum => ({
  id,
  data: { birth_year: birth },
  rels: { parents, spouses },
});

describe("makeChildSort", () => {
  it("agrupa a los hijos por pareja y dentro de cada una por nacimiento", () => {
    const jose = mk("J", 1848, [], ["I", "P", "D"]);
    const kids = [
      mk("a", 1895, ["J", "D"]),
      mk("b", 1887, ["J", "I"]),
      mk("c", 1893, ["J", "P"]),
      mk("d", 1892, ["J"]),
      mk("e", 1871, ["J", "I"]),
      mk("f", 1902, ["J", "P"]),
      mk("g", null, ["J", "D"]),
    ];
    const all = new Map([[jose.id, jose], ...kids.map((k) => [k.id, k] as const)]);
    const sorted = [...kids].sort(makeChildSort((id) => all.get(id)));
    // Isidora (I), Petronila (P), Digna (D) en el orden de sus parejas; sin pareja anotada, al final.
    expect(sorted.map((k) => k.id)).toEqual(["e", "b", "c", "f", "a", "g", "d"]);
  });

  it("con una sola pareja ordena solo por nacimiento", () => {
    const j = mk("J", 1900, [], ["M"]);
    const kids = [mk("x", 1930, ["J", "M"]), mk("y", 1925, ["J", "M"])];
    const all = new Map([[j.id, j], ...kids.map((k) => [k.id, k] as const)]);
    expect([...kids].sort(makeChildSort((id) => all.get(id))).map((k) => k.id)).toEqual(["y", "x"]);
  });
});
