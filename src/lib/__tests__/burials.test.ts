import { describe, expect, it } from "vitest";
import { groupBurials, yearOf, type BurialRow } from "../cemeteries";

const row = (o: Partial<BurialRow> & { personId: string; personName: string; placeText: string }): BurialRow => ({
  normalized: null, locality: null, birth: null, death: null, buried: null, note: null, ...o,
});

describe("groupBurials", () => {
  it("junta las distintas formas de escribir un cementerio y ordena por cantidad", () => {
    const g = groupBurials([
      row({ personId: "1", personName: "Ana", placeText: "cementerio de buin", normalized: "Cementerio Parroquial de Buin, Chile", death: "12 MAR 1950" }),
      row({ personId: "2", personName: "Beto", placeText: "Cementerio parroquian de Buin", normalized: "Cementerio Parroquial de Buin, Chile" }),
      row({ personId: "3", personName: "Carla", placeText: "Cementerio de Paine" }),
    ]);
    expect(g).toHaveLength(2);
    expect(g[0].people.map((p) => p.name)).toEqual(["Ana", "Beto"]);
    expect(g[0].people[0].death).toBe("1950");
  });
  it("marca como incompleto lo que no se sabe dónde es", () => {
    const g = groupBurials([
      row({ personId: "1", personName: "Ana", placeText: "cementerio general" }),
      row({ personId: "2", personName: "Beto", placeText: "San Pedro" }),
      row({ personId: "3", personName: "Carla", placeText: "Cementerio de Paine" }),
    ]);
    expect(g.find((x) => x.name === "Cementerio General")?.incomplete).toBe(true);
    expect(g.find((x) => x.name === "San Pedro")?.incomplete).toBe(true);
    expect(g.find((x) => x.name.includes("Paine"))?.incomplete).toBe(false);
  });
  it("muestra la cruz o el patio, sin repetir a la misma persona", () => {
    const g = groupBurials([
      row({ personId: "1", personName: "Rosa", placeText: "El Almendral/cruz 158/patio 8" }),
      row({ personId: "1", personName: "Rosa", placeText: "El Almendral/cruz 158/patio 8" }),
      row({ personId: "2", personName: "Luis", placeText: "El Almendral", note: "Ubicación en el cementerio: patio 3" }),
    ]);
    expect(g).toHaveLength(1);
    expect(g[0].people.map((p) => [p.name, p.spot])).toEqual([["Luis", "patio 3"], ["Rosa", "cruz 158, patio 8"]]);
  });
  it("yearOf toma el año", () => {
    expect(yearOf("ABT 1890")).toBe("1890");
    expect(yearOf(null)).toBeNull();
  });
});
