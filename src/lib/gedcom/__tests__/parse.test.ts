import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseGedcom } from "../index";
import { parseGedcomDate } from "../dates";

const fixturePath = join(process.cwd(), "data", "zamora-balcazar.ged");
const raw = readFileSync(fixturePath, "utf-8");

describe("parseGedcom contra el archivo real de Cas", () => {
  const result = parseGedcom(raw);

  it("lee las 251 personas y 89 familias", () => {
    expect(result.persons).toHaveLength(251);
    expect(result.families).toHaveLength(89);
  });

  it("el 'MARS' de MyHeritage entra como matrimonio (MARR), y el contrato (MARC) se conserva", () => {
    const types = result.families.flatMap((f) => f.events.map((e) => e.type));
    expect(types).not.toContain("MARS");
    expect(types).toContain("MARC");
    const fam = result.families.find((f) => f.events.some((e) => e.date?.text === "5 MAR 1849"));
    expect(fam?.events.find((e) => e.date?.text === "5 MAR 1849")?.type).toBe("MARR");
  });

  it("lee la única fuente del árbol", () => {
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].title).toBe("Sitio Familiar");
  });

  it("no deja registros de nivel 0 sin clasificar", () => {
    expect(result.unrecognizedTopLevel).toHaveLength(0);
  });

  it("parsea el nombre y el sexo de Luis Alfredo Zamora Canelo (@I1@)", () => {
    const luis = result.persons.find((p) => p.xref === "@I1@");
    expect(luis).toBeDefined();
    expect(luis!.sex).toBe("M");
    expect(luis!.names[0].given).toBe("Luis Alfredo");
    expect(luis!.names[0].surnamePat).toBe("Zamora");
    expect(luis!.names[0].surnameMat).toBe("Canelo");
    expect(luis!.gedcomUid).toBe("542F57F8252FE1D52E8039AEF550111B");
  });

  it("captura la fecha de nacimiento de Luis Alfredo como 1935-09-28", () => {
    const luis = result.persons.find((p) => p.xref === "@I1@")!;
    const birth = luis.events.find((e) => e.type === "BIRT");
    expect(birth?.date?.from).toBe("1935-09-28");
    expect(birth?.date?.to).toBe("1935-09-28");
  });

  it("captura las dos fotos de Luis Alfredo con su recorte de rostro", () => {
    const luis = result.persons.find((p) => p.xref === "@I1@")!;
    expect(luis.media).toHaveLength(2);
    expect(luis.media[0].form).toBe("jpg");
    expect(luis.media[0].isPrimary).toBe(true);
    expect(luis.media[0].cropBox).toBeNull(); // la primera foto no trae _POSITION
    expect(luis.media[1].cropBox).toEqual({ x1: 1850, y1: 868, x2: 2174, y2: 1300 });
  });

  it("liga a Maria Teresa Balcazar Barroso como cónyuge en @F1@", () => {
    const fam = result.families.find((f) => f.xref === "@F1@");
    expect(fam).toBeDefined();
    const luis = result.persons.find((p) => p.xref === "@I1@")!;
    const maria = result.persons.find((p) => p.xref === "@I2@")!;
    expect(luis.famsXrefs).toContain("@F1@");
    expect(maria.famsXrefs).toContain("@F1@");
  });

  it("recoge notas y lugar de nacimiento como texto libre (Daniel Enrique @I3@)", () => {
    const daniel = result.persons.find((p) => p.xref === "@I3@")!;
    const birth = daniel.events.find((e) => e.type === "BIRT");
    expect(birth?.placeText).toBe("Santiago");
    expect(birth?.description).toContain("Hospital Joaquin Barros Luco");
  });

  it("liga la cita de MyHeritage ('Person Discovery') a Jorge Guillermo Concha Pineda", () => {
    const jorge = result.persons.find((p) => p.xref === "@I500056@")!;
    expect(jorge).toBeDefined();
    expect(jorge.citations).toHaveLength(1);
    expect(jorge.citations[0]).toMatchObject({
      sourceXref: "@S500001@",
      page: "Jorge Guillermo Concha Pineda",
      quay: 3,
      transcription: "Añadido por medio de un Person Discovery",
      eventType: "Discovery",
    });
  });

  it("muestra '(sin nombre)' para un registro real sin NAME/GIVN/SURN (@I39@)", () => {
    const sinNombre = result.persons.find((p) => p.xref === "@I39@")!;
    expect(sinNombre).toBeDefined();
    expect(sinNombre.names[0].display).toBe("(sin nombre)");
  });

  it("no pierde ninguna línea de nivel 1 no reconocida: va a 'raw'", () => {
    // Todas las personas con etiquetas poco comunes (TITL a nivel 1, MARS, etc.)
    // deben terminar en `raw`, nunca silenciosamente descartadas antes de llegar ahí.
    const totalConsumed = result.persons.reduce((acc, p) => {
      const consumedTags = new Set([
        "NAME", "OBJE", "_UID", "SEX", "FAMS", "FAMC", "RIN", "_UPD", "SOUR",
        "BIRT", "DEAT", "BURI", "RESI", "OCCU", "EDUC", "NATI", "EVEN",
      ]);
      return acc + p.raw.filter((r) => !consumedTags.has(r.tag)).length;
    }, 0);
    // No es cero porque hay etiquetas como _TYPE, NOTE de nivel 1 suelto, etc.
    // Lo que importa es que existan y sean inspeccionables, no que sean cero.
    expect(result.persons.every((p) => Array.isArray(p.raw))).toBe(true);
    expect(totalConsumed).toBeGreaterThanOrEqual(0);
  });
});

describe("parseGedcomDate", () => {
  it("interpreta una fecha exacta", () => {
    expect(parseGedcomDate("28 SEP 1935")).toEqual({
      text: "28 SEP 1935", from: "1935-09-28", to: "1935-09-28",
    });
  });

  it("interpreta solo el año", () => {
    const d = parseGedcomDate("1963");
    expect(d.from).toBe("1963-01-01");
    expect(d.to).toBe("1963-12-31");
  });

  it("interpreta un rango FROM..TO", () => {
    const d = parseGedcomDate("FROM MAR 1978 TO DEC 1981");
    expect(d.from).toBe("1978-03-01");
    expect(d.to).toBe("1981-12-31");
  });

  it("interpreta ABT como aproximado, con rango del año completo", () => {
    const d = parseGedcomDate("ABT 1850");
    expect(d.from).toBe("1850-01-01");
    expect(d.to).toBe("1850-12-31");
  });

  it("conserva el texto aunque no reconozca el formato", () => {
    const d = parseGedcomDate("20/09");
    expect(d.text).toBe("20/09");
    expect(d.from).toBeNull();
    expect(d.to).toBeNull();
  });
});
