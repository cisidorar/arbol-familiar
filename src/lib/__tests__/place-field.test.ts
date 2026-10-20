import { describe, expect, it } from "vitest";
import { composePlace, splitPlace } from "../geo/place-text";
import { OCCUPATION_SUGGESTIONS } from "../edit";

describe("PlaceField: lugar como texto <-> región, comuna y lugar exacto", () => {
  it("reconoce la comuna al final y deja el resto como lugar exacto", () => {
    const s = splitPlace("Hospital San Vicente de Paul Recoleta, Santiago");
    expect(s).toMatchObject({ regionCode: "13", detail: "Hospital San Vicente de Paul Recoleta" });
  });

  it("prefiere la comuna que no es también provincia", () => {
    const s = splitPlace("Hospital Barros Luco, Santiago, San Miguel");
    expect(s?.detail).toBe("Hospital Barros Luco, Santiago");
    expect(s?.regionCode).toBe("13");
  });

  it("sin ninguna comuna no hay estructura (se escribe libre)", () => {
    expect(splitPlace("Mendoza, Argentina")).toBeNull();
    expect(splitPlace("")).toBeNull();
  });

  it("une el lugar exacto con la comuna sin repetirla", () => {
    expect(composePlace("Hospital Barros Luco", "San Miguel")).toBe("Hospital Barros Luco, San Miguel");
    expect(composePlace("Parroquia de Buin", "Buin")).toBe("Parroquia de Buin");
    expect(composePlace("", "Buin")).toBe("Buin");
    expect(composePlace(" fundo Escorial, ", "")).toBe("fundo Escorial");
  });
});

describe("oficios sugeridos", () => {
  it("no se repiten", () => {
    expect(new Set(OCCUPATION_SUGGESTIONS.map((x) => x.toLowerCase())).size).toBe(OCCUPATION_SUGGESTIONS.length);
  });
});
