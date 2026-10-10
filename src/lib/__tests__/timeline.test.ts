import { describe, expect, it } from "vitest";
import {
  describeEvent,
  displayDateText,
  eventLabel,
  isApproxDate,
  rangeEnd,
  sortTimeline,
  type TimelineEntry,
} from "../timeline";

function entry(kind: string, sortKey: string | null, title = kind): TimelineEntry {
  return {
    year: sortKey ? Number(sortKey.slice(0, 4)) : null,
    yearEnd: null,
    approx: false,
    sortKey,
    dateText: null,
    kind,
    tag: null,
    title,
    place: null,
    description: null,
    age: null,
    person: null,
    sources: [],
  };
}

describe("describeEvent: titular y etiqueta de cada hecho", () => {
  it("un trabajo se titula con lo que hacía, no con la palabra 'Ocupación'", () => {
    expect(describeEvent("OCCU", null, "Zapatería de un Celedonio Morales")).toEqual({
      title: "Zapatería de un Celedonio Morales",
      tag: "Trabajo",
      description: null,
    });
  });

  it("un cargo político no es un oficio: se etiqueta 'Cargo público'", () => {
    expect(describeEvent("OCCU", null, "Regidor municipal de Curicó").tag).toBe("Cargo público");
    expect(describeEvent("OCCU", null, "Alcaldesa de Romeral").tag).toBe("Cargo público");
    expect(describeEvent("OCCU", null, "Senador por Talca").tag).toBe("Cargo público");
  });

  it("no confunde un oficio que solo contiene esas letras", () => {
    // "administrador" contiene "ministr", "Alcaldes" es un apellido posible, etc.
    expect(describeEvent("OCCU", null, "Administrador de fundo").tag).toBe("Trabajo");
    expect(describeEvent("OCCU", null, "Agricultor").tag).toBe("Trabajo");
    expect(describeEvent("OCCU", null, "Medico").tag).toBe("Trabajo");
  });

  it("un hecho EVEN toma su categoría del TYPE, traducida", () => {
    expect(describeEvent("EVEN", "Election", "Elección municipal")).toEqual({
      title: "Elección municipal",
      tag: "Elección",
      description: null,
    });
  });

  it("un EVEN sin texto usa la categoría como titular", () => {
    expect(describeEvent("EVEN", "Alternate Birth", null)).toEqual({
      title: "Nacimiento (otra versión)",
      tag: null,
      description: null,
    });
  });

  it("un TYPE que no conocemos se muestra tal cual, no como 'Hecho'", () => {
    expect(eventLabel("EVEN", "Military Service")).toBe("Military Service");
    expect(eventLabel("EVEN", null)).toBe("Hecho");
  });

  it("los códigos de GEDCOM de matrimonio salen en palabras, no como 'MARC'", () => {
    expect(eventLabel("MARC", null)).toBe("Contrato matrimonial");
    expect(eventLabel("MARS", null)).toBe("Matrimonio");
    expect(eventLabel("MARR", null)).toBe("Matrimonio");
  });

  it("en nacimientos y defunciones el texto es un detalle, no el titular", () => {
    expect(describeEvent("DEAT", null, "Pulmonía")).toEqual({
      title: "Defunción",
      tag: null,
      description: "Pulmonía",
    });
    expect(describeEvent("BIRT", null, null).title).toBe("Nacimiento");
  });

  it("los estudios se titulan con lo estudiado", () => {
    expect(describeEvent("EDUC", null, "Ingeniero Civil Industrial")).toMatchObject({
      title: "Ingeniero Civil Industrial",
      tag: "Estudios",
    });
  });
});

describe("fechas de la columna izquierda", () => {
  it("reconoce las fechas aproximadas de GEDCOM", () => {
    expect(isApproxDate("ABT 1910")).toBe(true);
    expect(isApproxDate("est 1910")).toBe(true);
    expect(isApproxDate("1910")).toBe(false);
    expect(isApproxDate("BET 1924 AND 1930")).toBe(false);
    expect(isApproxDate(null)).toBe(false);
  });

  it("da el año final solo cuando el hecho abarca más de un año", () => {
    expect(rangeEnd(1944, "1947-12-31")).toBe(1947);
    expect(rangeEnd(1938, "1938-12-31")).toBeNull();
    expect(rangeEnd(1938, null)).toBeNull();
    expect(rangeEnd(null, "1947-12-31")).toBeNull();
  });

  it("no repite bajo el titular lo que ya dice la columna del año", () => {
    expect(displayDateText("1938", 1938)).toBeNull();
    expect(displayDateText("ABT 1910", 1910)).toBeNull();
    expect(displayDateText("BET 1944 AND 1947", 1944, 1947)).toBeNull();
  });

  it("sí muestra la fecha cuando agrega algo", () => {
    expect(displayDateText("23 JUN 1887", 1887)).toBe("23 de junio de 1887");
    expect(displayDateText("BEF 1900", 1900)).toBe("antes de 1900");
    expect(displayDateText("BET JUN 1924 AND 1930", 1924, 1930)).toBe("entre junio de 1924 y 1930");
    expect(displayDateText("19/03", null)).toBe("19/03");
    expect(displayDateText(null, 1900)).toBeNull();
  });
});

describe("sortTimeline", () => {
  const titles = (list: TimelineEntry[]) => list.map((e) => e.title);

  it("ordena por fecha completa, no solo por año", () => {
    const sorted = sortTimeline([
      entry("EVEN", "1944-11-01", "nov"),
      entry("OCCU", "1944-01-01", "ene"),
      entry("BIRT", "1887-06-23", "nace"),
    ]);
    expect(titles(sorted)).toEqual(["nace", "ene", "nov"]);
  });

  it("deja defunción y sepultura sin fecha al final, en ese orden", () => {
    const sorted = sortTimeline([
      entry("BURI", null, "sepultura"),
      entry("DEAT", null, "defunción"),
      entry("MARR", null, "matrimonio"),
      entry("BIRT", "1887-06-23", "nace"),
    ]);
    expect(titles(sorted)).toEqual(["nace", "matrimonio", "defunción", "sepultura"]);
  });

  it("un hecho sin fecha no queda después de una defunción fechada", () => {
    const sorted = sortTimeline([
      entry("DEAT", "1950-03-01", "defunción"),
      entry("MARR", null, "matrimonio"),
      entry("BIRT", "1887-06-23", "nace"),
      entry("SPOUSE_DEAT", "1960-01-01", "muere la esposa"),
    ]);
    expect(titles(sorted)).toEqual(["nace", "matrimonio", "defunción", "muere la esposa"]);
  });

  it("una defunción sin fecha va antes de una sepultura con fecha", () => {
    const sorted = sortTimeline([
      entry("BURI", "1950-03-03", "sepultura"),
      entry("DEAT", null, "defunción"),
      entry("OCCU", null, "trabajo"),
    ]);
    expect(titles(sorted)).toEqual(["trabajo", "defunción", "sepultura"]);
  });

  it("no pierde ni duplica hechos", () => {
    const all = [
      entry("BIRT", "1887-06-23"), entry("DEAT", null), entry("BURI", null),
      entry("MARR", null), entry("OCCU", "1924-01-01"), entry("BURI", "1950-01-01"),
    ];
    expect(sortTimeline(all)).toHaveLength(all.length);
    expect(new Set(sortTimeline(all)).size).toBe(all.length);
  });
});
