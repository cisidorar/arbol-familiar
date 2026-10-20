import { describe, expect, it } from "vitest";
import { foreignCountry, regionCodeOf, resolveComuna } from "../geo/places";
import {
  collectAncestors,
  generationLabel,
  groupByGeneration,
  locatedCount,
  pickOrigin,
  summarize,
  topRegions,
  type PlaceFacts,
} from "../origins";

const place = (rawText: string, extra: object = {}) => ({ rawText, ...extra });

describe("resolveComuna", () => {
  it("en 'Hospital X, Santiago, San Miguel' la comuna es San Miguel, no Santiago", () => {
    expect(resolveComuna({ rawText: "Hospital Barros Luco Trudeau, Santiago, San Miguel" })?.code).toBe("13130");
    expect(resolveComuna({ rawText: "Santiago" })?.code).toBe("13101");
  });

  it("reconoce el nombre de una comuna aunque el lugar no esté estandarizado", () => {
    expect(resolveComuna({ rawText: "Romeral, Curicó, Maule, Chile" })?.code).toBe("07306");
  });
  it("usa locality y región cuando están", () => {
    expect(resolveComuna({ locality: "Buin", admin1: "Región Metropolitana", rawText: "Buin, Maipo" })?.code).toBe("13402");
  });
  it("el código guardado manda sobre el texto", () => {
    expect(resolveComuna({ comunaCode: "05301", rawText: "Curicó" })?.code).toBe("05301");
  });
  it("devuelve null si el texto no es una comuna", () => {
    expect(resolveComuna({ rawText: "Culitrín" })).toBeNull();
  });
});

describe("regionCodeOf / foreignCountry", () => {
  it("convierte nombres de región", () => {
    expect(regionCodeOf("Región Metropolitana")).toBe("13");
    expect(regionCodeOf("Valparaíso")).toBe("05");
    expect(regionCodeOf("Biobío")).toBe("08");
    expect(regionCodeOf(null)).toBeNull();
  });
  it("detecta el extranjero", () => {
    expect(foreignCountry({ country: "Argentina" })).toBe("Argentina");
    expect(foreignCountry({ rawText: "San Juan, Argentina" })).toBe("Argentina");
    expect(foreignCountry({ country: "Chile", rawText: "Buin" })).toBeNull();
  });
});

describe("pickOrigin", () => {
  it("el nacimiento manda sobre bautismo y matrimonio", () => {
    const f: PlaceFacts = { birth: place("Romeral"), baptism: place("Buin"), marriage: place("Santiago") };
    const o = pickOrigin(f);
    expect(o.kind === "comuna" && o.code).toBe("07306");
    expect(o.kind !== "none" && o.basis).toBe("birth");
  });
  it("sin nacimiento usa el bautismo y lo marca como estimado", () => {
    const o = pickOrigin({ baptism: place("Buin") });
    expect(o.kind !== "none" && o.basis).toBe("baptism");
  });
  it("birthOnly ignora lo estimado", () => {
    expect(pickOrigin({ baptism: place("Buin") }, true).kind).toBe("none");
  });
  it("nunca usa defunción o entierro (no existen en PlaceFacts)", () => {
    expect(pickOrigin(undefined).kind).toBe("none");
  });
  it("separa extranjero y sin comuna", () => {
    expect(pickOrigin({ birth: place("San Juan, Argentina") }).kind).toBe("abroad");
    expect(pickOrigin({ birth: place("Culitrín") }).kind).toBe("unlocated");
  });
});

const node = (id: string, gender: string, parents: string[] = []) => ({
  id, data: { gender, label: id }, rels: { parents },
});

describe("collectAncestors + summarize", () => {
  const people = [
    node("yo", "F", ["papa", "mama"]),
    node("papa", "M", ["abuelo"]),
    node("mama", "F", ["abuela"]),
    node("abuelo", "M"),
    node("abuela", "F"),
  ];
  const facts = new Map<string, PlaceFacts>([
    ["papa", { birth: place("Buin") }],
    ["abuelo", { birth: place("Romeral") }],
    ["abuela", { baptism: place("Romeral") }],
  ]);
  const anc = collectAncestors("yo", people, facts);

  it("asigna generación, rama y parentesco", () => {
    const by = Object.fromEntries(anc.map((a) => [a.id, a]));
    expect(by.papa).toMatchObject({ generation: 1, branch: "paterna", relation: "padre" });
    expect(by.abuela).toMatchObject({ generation: 2, branch: "materna", relation: "abuela" });
  });
  it("cuenta por comuna y separa los sin lugar", () => {
    const s = summarize(anc, { maxGeneration: 9, branch: "all", birthOnly: false });
    expect(s.byComuna.get("07306")?.count).toBe(2);
    expect(s.byComuna.get("07306")?.birthCount).toBe(1);
    expect(s.none.map((a) => a.id)).toEqual(["mama"]);
  });
  it("filtra por generación, rama y solo nacimientos", () => {
    expect(summarize(anc, { maxGeneration: 1, branch: "all", birthOnly: false }).total).toBe(2);
    // Una sola generación: con min = max = 2 solo cuentan los abuelos, no los padres.
    expect(summarize(anc, { minGeneration: 2, maxGeneration: 2, branch: "all", birthOnly: false }).total).toBe(anc.filter((a) => a.generation === 2).length);
    expect(summarize(anc, { maxGeneration: 9, branch: "materna", birthOnly: false }).total).toBe(2);
    const b = summarize(anc, { maxGeneration: 9, branch: "all", birthOnly: true });
    expect(b.byComuna.get("07306")?.count).toBe(1);
    expect(b.none.length).toBe(2);
  });
  it("un antepasado repetido cuenta una sola vez", () => {
    const rep = [node("yo", "F", ["a", "b"]), node("a", "M", ["x"]), node("b", "F", ["x"]), node("x", "M")];
    expect(collectAncestors("yo", rep, new Map()).filter((a) => a.id === "x")).toHaveLength(1);
  });
});

describe("resumen para la pantalla", () => {
  const people = [
    node("yo", "F", ["papa", "mama"]),
    node("papa", "M", ["abuelo"]),
    node("mama", "F", ["abuela"]),
    node("abuelo", "M"),
    node("abuela", "F"),
  ];
  const facts = new Map<string, PlaceFacts>([
    ["papa", { birth: place("Buin") }],
    ["abuelo", { birth: place("Romeral") }],
    ["abuela", { birth: place("Curicó") }],
    ["mama", { birth: place("San Juan, Argentina") }],
  ]);
  const anc = collectAncestors("yo", people, facts);
  const s = summarize(anc, { maxGeneration: 9, branch: "all", birthOnly: false });

  it("nombra las generaciones", () => {
    expect(generationLabel(2)).toBe("Abuelos");
    expect(generationLabel(6)).toBe("Generación 6");
  });
  it("agrupa por generación, de la más cercana a la más lejana", () => {
    expect(groupByGeneration(anc).map((g) => [g.label, g.people.length])).toEqual([["Padres", 2], ["Abuelos", 2]]);
  });
  it("ordena las regiones por cantidad", () => {
    expect(topRegions(s)).toEqual([["07", 2], ["13", 1]]);
    expect(topRegions(s, 1)).toEqual([["07", 2]]);
  });
  it("cuenta como ubicados también a los del extranjero", () => {
    expect(locatedCount(s)).toBe(4);
  });
});

import { ancestorPhrase } from "../origins";
describe("ancestorPhrase", () => {
  it("dice qué es cada antepasado en palabras", () => {
    expect(ancestorPhrase({ relation: "madre", branch: "materna", generation: 1 })).toBe("Tu mamá");
    expect(ancestorPhrase({ relation: "padre", branch: "paterna", generation: 1 }, true)).toBe("Su papá");
    expect(ancestorPhrase({ relation: "tatarabuelo", branch: "materna", generation: 4 }, true)).toBe("Su tatarabuelo, por parte de su mamá");
    expect(ancestorPhrase({ relation: "abuela", branch: "paterna", generation: 2 })).toBe("Tu abuela, por parte de tu papá");
    expect(ancestorPhrase({ relation: "tía", branch: "materna", generation: 1 })).toBe("Tu tía, por parte de tu mamá");
  });
});
