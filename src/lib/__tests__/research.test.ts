import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseGedcom } from "../gedcom";
import { researchFactForm, validateEvent } from "../edit";
import { applyResearch, parseReplaceRule, parseResearch, parseResearchDate } from "../research";
import type { TimelineEntry } from "../timeline";

describe("parseResearchDate: fechas escritas como en una cronología", () => {
  it("año solo", () => {
    expect(parseResearchDate("1924")).toEqual({
      from: "1924-01-01", to: "1924-12-31", year: 1924, yearEnd: null, approx: false, text: null,
    });
  });

  it.each(["c. 1910", "c.1910", "ca. 1910", "circa 1910", "aprox. 1910", "hacia 1910", "1910 aprox."])(
    "aproximada: %s",
    (raw) => {
      expect(parseResearchDate(raw)).toMatchObject({ year: 1910, approx: true, text: null });
    },
  );

  it.each(["1944-1947", "1944–1947", "1944 - 1947", "entre 1944 y 1947", "de 1944 a 1947"])(
    "rango de años: %s",
    (raw) => {
      expect(parseResearchDate(raw)).toMatchObject({
        from: "1944-01-01", to: "1947-12-31", year: 1944, yearEnd: 1947, approx: false, text: null,
      });
    },
  );

  it("rango aproximado", () => {
    expect(parseResearchDate("1944–1947 aprox.")).toMatchObject({ year: 1944, yearEnd: 1947, approx: true });
  });

  it.each(["desde 1911", "1911 en adelante", "a partir de 1911"])("abierta hacia adelante: %s", (raw) => {
    expect(parseResearchDate(raw)).toMatchObject({
      from: "1911-01-01", to: null, year: 1911, yearEnd: null, text: "desde 1911",
    });
  });

  it("antes y después", () => {
    expect(parseResearchDate("antes de 1900")).toMatchObject({ from: null, year: 1900, text: "antes de 1900" });
    expect(parseResearchDate("después de 1900")).toMatchObject({ to: null, year: 1900, text: "después de 1900" });
    expect(parseResearchDate("despues de 1900")).toMatchObject({ year: 1900 });
  });

  it("década", () => {
    expect(parseResearchDate("década de 1920")).toEqual({
      from: "1920-01-01", to: "1929-12-31", year: 1920, yearEnd: 1929, approx: false, text: "década de 1920",
    });
    expect(parseResearchDate("decada de 1920")).toMatchObject({ year: 1920, yearEnd: 1929 });
  });

  it("fecha completa en español o ISO", () => {
    const expected = { from: "1924-07-30", to: "1924-07-30", year: 1924, text: "30 de julio de 1924" };
    expect(parseResearchDate("30 de julio de 1924")).toMatchObject(expected);
    expect(parseResearchDate("30 jul 1924")).toMatchObject(expected);
    expect(parseResearchDate("1924-07-30")).toMatchObject(expected);
    expect(parseResearchDate("julio de 1924")).toMatchObject({
      from: "1924-07-01", to: "1924-07-31", text: "julio de 1924",
    });
  });

  it("también acepta la sintaxis de GEDCOM", () => {
    expect(parseResearchDate("ABT 1910")).toMatchObject({ year: 1910, approx: true, text: null });
    expect(parseResearchDate("BET 1924 AND 1930")).toMatchObject({ year: 1924, yearEnd: 1930 });
  });

  it("devuelve null si no entiende, en vez de inventar", () => {
    expect(parseResearchDate("hace mucho")).toBeNull();
    expect(parseResearchDate("")).toBeNull();
    expect(parseResearchDate("30 de brumario de 1924")).toBeNull();
  });
});

describe("parseReplaceRule", () => {
  it("acepta el nombre en español, con o sin tilde, y el año", () => {
    expect(parseReplaceRule("ocupación 1924")).toEqual({ kind: "OCCU", year: 1924 });
    expect(parseReplaceRule("Ocupacion 1924")).toEqual({ kind: "OCCU", year: 1924 });
    expect(parseReplaceRule("matrimonio")).toEqual({ kind: "MARR", year: null });
    expect(parseReplaceRule("elección 1938")).toEqual({ kind: "EVEN", year: 1938 });
  });

  it("acepta la etiqueta de GEDCOM", () => {
    expect(parseReplaceRule("OCCU 1924")).toEqual({ kind: "OCCU", year: 1924 });
    expect(parseReplaceRule("BURI")).toEqual({ kind: "BURI", year: null });
  });

  it("rechaza lo que no entiende", () => {
    expect(parseReplaceRule("el trabajo de 1924")).toBeNull();
    expect(parseReplaceRule("")).toBeNull();
  });
});

describe("parseResearch: validación del archivo", () => {
  const good = {
    personas: [
      {
        uid: "A",
        nombre: "Ana",
        hechos: [
          {
            fecha: "1924",
            etiqueta: "Trabajo",
            texto: "Abre una zapatería.",
            lugar: "Curicó",
            reemplaza: ["ocupación 1924"],
            fuentes: [{ titulo: "El diario", url: "https://example.org/a.pdf", cita: "dice así" }],
          },
        ],
      },
    ],
  };

  it("lee un hecho completo", () => {
    const { byUid, problems } = parseResearch(good);
    expect(problems).toEqual([]);
    expect(byUid.get("A")).toEqual([
      {
        key: expect.stringMatching(/^[0-9a-f]{16}$/),
        date: { from: "1924-01-01", to: "1924-12-31", year: 1924, yearEnd: null, approx: false, text: null },
        rawDate: "1924",
        tag: "Trabajo",
        text: "Abre una zapatería.",
        place: "Curicó",
        withUid: null,
        replaces: [{ kind: "OCCU", year: 1924 }],
        sources: [{ title: "El diario", url: "https://example.org/a.pdf", quote: "dice así" }],
      },
    ]);
  });

  it("una fuente puede ser solo el enlace; se titula con el sitio", () => {
    const { byUid, problems } = parseResearch({
      personas: [{ uid: "A", hechos: [{ texto: "x", fuentes: ["https://www.bcn.cl/algo"] }] }],
    });
    expect(problems).toEqual([]);
    expect(byUid.get("A")![0].sources).toEqual([{ title: "bcn.cl", url: "https://www.bcn.cl/algo", quote: null }]);
  });

  it("descarta enlaces que no son web (nunca un javascript: en un href)", () => {
    const { byUid, problems } = parseResearch({
      personas: [
        { uid: "A", hechos: [{ texto: "x", fuentes: [{ url: "javascript:alert(1)" }, { url: "no es un link" }, {}] }] },
      ],
    });
    expect(byUid.get("A")![0].sources).toEqual([]);
    expect(problems).toHaveLength(3);
  });

  it("un hecho con 'enAmbos' aparece también en la otra persona, apuntando de vuelta", () => {
    const { byUid, people, problems } = parseResearch({
      personas: [{ uid: "A", hechos: [{ texto: "Probable matrimonio.", con: "B", enAmbos: true }] }],
    });
    expect(problems).toEqual([]);
    expect(byUid.get("A")![0].withUid).toBe("B");
    expect(byUid.get("B")![0]).toMatchObject({ text: "Probable matrimonio.", withUid: "A" });
    // ...pero en el archivo sigue siendo un hecho de una sola persona.
    expect(people).toHaveLength(1);
    expect(people[0].facts).toHaveLength(1);
  });

  it("avisa de cada problema sin botar el resto del archivo", () => {
    const { byUid, problems } = parseResearch({
      personas: [
        { nombre: "Sin uid", hechos: [{ texto: "x" }] },
        {
          uid: "A",
          nombre: "Ana",
          hechos: [
            { fecha: "1924" }, // sin texto
            { texto: "fecha rara", fecha: "hace mucho" },
            { texto: "regla rara", reemplaza: "el de antes de la guerra" },
            { texto: "espejo sin persona", enAmbos: true },
            { texto: "bueno", fecha: "1930" },
          ],
        },
      ],
    });
    expect(problems).toHaveLength(5);
    expect(problems[0]).toContain("Sin uid");
    expect(problems[1]).toContain("Ana, hecho 1");
    // Los hechos con un problema menor igual se muestran (sin fecha, sin reemplazo).
    expect(byUid.get("A")!.map((f) => f.text)).toEqual(["fecha rara", "regla rara", "espejo sin persona", "bueno"]);
    expect(byUid.get("A")![0].date).toBeNull();
  });

  it("rechaza un archivo que no tiene la forma esperada", () => {
    expect(parseResearch([]).problems).toHaveLength(1);
    expect(parseResearch(null).problems).toHaveLength(1);
    expect(parseResearch({ personas: "no" }).problems).toHaveLength(1);
  });

  it("avisa si una persona está dos veces", () => {
    const { problems } = parseResearch({ personas: [{ uid: "A", hechos: [] }, { uid: "A", hechos: [] }] });
    expect(problems).toHaveLength(1);
  });
});

describe("applyResearch", () => {
  function entry(kind: string, year: number | null, person: TimelineEntry["person"] = null): TimelineEntry {
    return {
      year, yearEnd: null, approx: false, sortKey: year ? `${year}-01-01` : null, dateText: null, kind,
      tag: null, title: kind, place: null, description: null, age: null, person, sources: [],
    };
  }
  const sara = { id: "id-sara", name: "Sara" };
  const otra = { id: "id-otra", name: "Otra" };
  const ctx = { birthYear: 1887, personByUid: (uid: string) => (uid === "SARA" ? sara : null) };
  const fact = (raw: Record<string, unknown>) =>
    parseResearch({ personas: [{ uid: "X", hechos: [raw] }] }).byUid.get("X")!;

  it("agrega el hecho con su edad, etiqueta y fuentes", () => {
    const out = applyResearch(
      [entry("BIRT", 1887)],
      fact({ fecha: "1924", etiqueta: "Comercio", texto: "Saquean su zapatería.", fuentes: ["https://bcn.cl/x"] }),
      ctx,
    );
    expect(out).toHaveLength(2);
    expect(out[1]).toMatchObject({
      kind: "RESEARCH", year: 1924, age: 37, tag: "Comercio", title: "Saquean su zapatería.",
      sortKey: "1924-01-01", sources: [{ url: "https://bcn.cl/x" }],
    });
  });

  it("reemplaza solo el hecho del tipo y año indicados", () => {
    const out = applyResearch(
      [entry("OCCU", 1924), entry("OCCU", 1944), entry("EVEN", 1924)],
      fact({ fecha: "1924", texto: "nuevo", reemplaza: "ocupación 1924" }),
      ctx,
    );
    expect(out.map((e) => `${e.kind} ${e.year}`)).toEqual(["OCCU 1944", "EVEN 1924", "RESEARCH 1924"]);
  });

  it("sin año, reemplaza todos los de ese tipo", () => {
    const out = applyResearch(
      [entry("OCCU", 1924), entry("OCCU", 1944)],
      fact({ texto: "nuevo", reemplaza: "ocupación" }),
      ctx,
    );
    expect(out.map((e) => e.kind)).toEqual(["RESEARCH"]);
  });

  it("con 'con', reemplaza solo el matrimonio con esa persona y la muestra", () => {
    const out = applyResearch(
      [entry("MARR", null, sara), entry("MARR", 1930, otra)],
      fact({ fecha: "c. 1910", texto: "Probable matrimonio.", con: "SARA", reemplaza: "matrimonio" }),
      ctx,
    );
    expect(out.map((e) => [e.kind, e.person?.name])).toEqual([["MARR", "Otra"], ["RESEARCH", "Sara"]]);
    expect(out[1]).toMatchObject({ year: 1910, approx: true });
  });

  it("si la otra persona no está en el árbol, igual muestra el hecho", () => {
    const out = applyResearch([], fact({ texto: "x", con: "NADIE" }), ctx);
    expect(out[0].person).toBeNull();
  });

  it("un hecho sin fecha queda sin año ni edad", () => {
    const out = applyResearch([], fact({ texto: "x" }), ctx);
    expect(out[0]).toMatchObject({ year: null, sortKey: null, age: null });
  });

  it("no calcula edades negativas ni cuando no hay nacimiento", () => {
    expect(applyResearch([], fact({ texto: "x", fecha: "1850" }), ctx)[0].age).toBeNull();
    expect(applyResearch([], fact({ texto: "x", fecha: "1924" }), { ...ctx, birthYear: null })[0].age).toBeNull();
  });

  it("no modifica la lista original", () => {
    const original = [entry("OCCU", 1924)];
    applyResearch(original, fact({ texto: "nuevo", reemplaza: "ocupación" }), ctx);
    expect(original).toHaveLength(1);
  });

  it("un hecho ya editado o borrado en la app no se muestra, pero sigue reemplazando", () => {
    const facts = fact({ fecha: "1924", texto: "nuevo", reemplaza: "ocupación 1924" });
    const out = applyResearch([entry("OCCU", 1924), entry("OCCU", 1944)], facts, {
      ...ctx,
      hidden: new Set([facts[0].key]),
    });
    expect(out.map((e) => `${e.kind} ${e.year}`)).toEqual(["OCCU 1944"]);
  });

  it("nunca esconde un hecho escrito o corregido en la app", () => {
    const manual = { ...entry("BAPM", 1891), manual: true };
    const out = applyResearch([manual, entry("BAPM", 1891)], fact({ texto: "x", reemplaza: "bautismo" }), ctx);
    expect(out.map((e) => [e.kind, e.manual ?? false])).toEqual([["BAPM", true], ["RESEARCH", false]]);
  });

  it("ofrece editar el hecho solo si quien llama dice cómo se carga en el formulario", () => {
    const facts = fact({ fecha: "5 de mayo de 1891", etiqueta: "Bautismo", texto: "Bautizada." });
    expect(applyResearch([], facts, ctx)[0].edit).toBeFalsy();
    const out = applyResearch([], facts, { ...ctx, editForm: researchFactForm });
    expect(out[0].edit).toMatchObject({ id: null, research: facts[0].key, form: { type: "BAPM", date: "5 de mayo de 1891" } });
  });
});

describe("la clave de un hecho", () => {
  const keys = (hechos: Record<string, unknown>[]) =>
    parseResearch({ personas: [{ uid: "X", hechos }] }).byUid.get("X")!.map((f) => f.key);

  it("sale de su contenido: no cambia al reordenar ni al agregar otros hechos", () => {
    const a = { fecha: "1924", etiqueta: "Comercio", texto: "Saquean su zapatería." };
    const b = { fecha: "1938", etiqueta: "Elección", texto: "Candidato a regidor." };
    const [ka, kb] = keys([a, b]);
    expect(ka).toMatch(/^[0-9a-f]{16}$/);
    expect(ka).not.toBe(kb);
    expect(keys([b, { texto: "otro" }, a])).toEqual([kb, expect.any(String), ka]);
  });

  it("cambia si cambia el texto, la fecha, la etiqueta o el lugar", () => {
    const base = { fecha: "1924", etiqueta: "Comercio", texto: "Saquean su zapatería.", lugar: "Curicó" };
    const all = keys([base, { ...base, texto: "Otra cosa." }, { ...base, fecha: "1925" }, { ...base, etiqueta: "Barrio" }, { ...base, lugar: "Talca" }]);
    expect(new Set(all).size).toBe(5);
  });
});

describe("data/investigacion.json (el archivo real)", () => {
  const index = parseResearch(JSON.parse(readFileSync(join(process.cwd(), "data", "investigacion.json"), "utf-8")));
  const gedcom = parseGedcom(readFileSync(join(process.cwd(), "data", "zamora-balcazar.ged"), "utf-8"));
  const uids = new Set(gedcom.persons.map((p) => p.gedcomUid));

  it("no tiene problemas de formato", () => {
    expect(index.problems).toEqual([]);
  });

  it("cada hecho de una persona tiene una clave distinta", () => {
    for (const [uid, facts] of index.byUid) {
      expect(new Set(facts.map((f) => f.key)).size, `hechos de ${uid}`).toBe(facts.length);
    }
  });

  it("todo hecho editable se puede guardar tal cual está escrito", () => {
    for (const person of index.people) {
      for (const f of person.facts) {
        const form = researchFactForm(f);
        if (form) expect(validateEvent(form), `"${f.text}" de ${person.name}`).toMatchObject({ ok: true });
      }
    }
  });

  it("todas las personas nombradas existen en el árbol", () => {
    for (const person of index.people) {
      expect(uids.has(person.uid), `uid de ${person.name}`).toBe(true);
      for (const f of person.facts) {
        if (f.withUid) expect(uids.has(f.withUid), `"con" en un hecho de ${person.name}`).toBe(true);
      }
    }
  });
});
