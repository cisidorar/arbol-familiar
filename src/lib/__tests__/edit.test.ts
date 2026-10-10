import { describe, expect, it } from "vitest";
import {
  approxAgeAtDeath,
  dateForEditing,
  diedAsChild,
  researchFactForm,
  validateEvent,
  validatePerson,
  withApproxAge,
} from "../edit";
import { parseResearch, spanishDateToGedcom } from "../research";

describe("validatePerson", () => {
  const base = { given: "María del Carmen", surnamePat: "Ruz", surnameMat: "Martínez", sex: "F", isLiving: false, notes: "" };

  it("acepta datos completos y arma el nombre para mostrar", () => {
    const r = validatePerson(base);
    expect(r.ok && r.value).toEqual({
      given: "María del Carmen", surnamePat: "Ruz", surnameMat: "Martínez",
      displayName: "María del Carmen Ruz Martínez", sex: "F", isLiving: false, notes: null,
    });
  });

  it("limpia espacios de más y conserva los saltos de línea de las notas", () => {
    const r = validatePerson({ ...base, given: "  María   del Carmen ", notes: " línea uno \r\nlínea dos\n\n\n\nfin " });
    expect(r.ok && r.value.given).toBe("María del Carmen");
    expect(r.ok && r.value.notes).toBe("línea uno \nlínea dos\n\nfin");
  });

  it("exige algún nombre o apellido", () => {
    const r = validatePerson({ ...base, given: " ", surnamePat: "", surnameMat: "" });
    expect(!r.ok && r.errors.given).toBeTruthy();
    expect(validatePerson({ ...base, given: "", surnameMat: "" }).ok).toBe(true); // solo un apellido basta
  });

  it("rechaza un sexo inventado, un estado que no es sí/no y cualquier cosa que no sea un objeto", () => {
    expect(validatePerson({ ...base, sex: "X" }).ok).toBe(false);
    expect(validatePerson({ ...base, isLiving: "false" }).ok).toBe(false);
    expect(validatePerson(null).ok).toBe(false);
    expect(validatePerson("hola").ok).toBe(false);
  });
});

describe("validateEvent", () => {
  const base = { type: "BAPM", subtype: "", date: "5 de mayo de 1891", place: "Iglesia parroquial de San José, Curicó", text: "Padrino: José del Carmen López", sourceTitle: "", sourceUrl: "", sourceQuote: "" };

  it("convierte la fecha escrita en español a la sintaxis de GEDCOM con su rango", () => {
    const r = validateEvent(base);
    expect(r.ok && r.value.date).toEqual({ text: "5 MAY 1891", from: "1891-05-05", to: "1891-05-05" });
    expect(r.ok && r.value.place).toBe("Iglesia parroquial de San José, Curicó");
    expect(r.ok && r.value.source).toBeNull();
  });

  it("entiende las formas habituales de fecha", () => {
    const text = (date: string) => {
      const r = validateEvent({ ...base, date });
      return r.ok && r.value.date && r.value.date !== "keep" ? r.value.date.text : null;
    };
    expect(text("1891")).toBe("1891");
    expect(text("mayo de 1891")).toBe("MAY 1891");
    expect(text("c. 1910")).toBe("ABT 1910");
    expect(text("1944 aprox.")).toBe("ABT 1944");
    expect(text("1944-1947")).toBe("BET 1944 AND 1947");
    expect(text("antes de 1900")).toBe("BEF 1900");
    expect(text("desde 1911")).toBe("FROM 1911");
    expect(text("década de 1920")).toBe("BET 1920 AND 1929");
  });

  it("rechaza una fecha que no entiende, con un mensaje para ese campo", () => {
    const r = validateEvent({ ...base, date: "el otro día" });
    expect(!r.ok && r.errors.date).toMatch(/No entiendo/);
  });

  it("al editar, la fecha sin tocar se conserva tal cual aunque no se pueda interpretar", () => {
    const r = validateEvent({ ...base, date: "19/03" }, "19/03");
    expect(r.ok && r.value.date).toBe("keep");
    // …pero si no es la que estaba, se valida como cualquier otra
    expect(validateEvent({ ...base, date: "19/03" }, "20/03").ok).toBe(false);
    expect(validateEvent({ ...base, date: "19/03" }).ok).toBe(false);
  });

  it("un hecho puede no tener fecha, pero no puede estar vacío", () => {
    const sinFecha = validateEvent({ ...base, date: "" });
    expect(sinFecha.ok && sinFecha.value.date).toBeNull();
    const vacio = validateEvent({ ...base, date: "", place: "", text: " " });
    expect(!vacio.ok && vacio.errors.text).toBeTruthy();
  });

  it("solo acepta los tipos de hecho conocidos", () => {
    // El matrimonio (y divorcio, compromiso) es de la familia, no de una sola
    // persona, pero se guarda con las mismas reglas: se acepta como tipo.
    expect(validateEvent({ ...base, type: "MARR" }).ok).toBe(true);
    expect(validateEvent({ ...base, type: "DROP TABLE" }).ok).toBe(false);
    expect(validateEvent({ ...base, type: undefined }).ok).toBe(false);
  });

  it('"Otro hecho" necesita nombre; los demás tipos lo ignoran', () => {
    const sinNombre = validateEvent({ ...base, type: "EVEN" });
    expect(!sinNombre.ok && sinNombre.errors.subtype).toBeTruthy();
    const conNombre = validateEvent({ ...base, type: "EVEN", subtype: "Servicio militar" });
    expect(conNombre.ok && conNombre.value.subtype).toBe("Servicio militar");
    const bautismo = validateEvent({ ...base, subtype: "se ignora" });
    expect(bautismo.ok && bautismo.value.subtype).toBeNull();
  });

  it("la fuente necesita un enlace web; nunca pasa un javascript:", () => {
    const ok = validateEvent({ ...base, sourceUrl: "https://www.familysearch.org/ark:/1", sourceQuote: "bautizó a María" });
    expect(ok.ok && ok.value.source).toEqual({ url: "https://www.familysearch.org/ark:/1", title: "familysearch.org", quote: "bautizó a María" });

    const js = validateEvent({ ...base, sourceUrl: "javascript:alert(1)" });
    expect(!js.ok && js.errors.sourceUrl).toBeTruthy();
    const sinEnlace = validateEvent({ ...base, sourceTitle: "Libro de bautismos" });
    expect(!sinEnlace.ok && sinEnlace.errors.sourceUrl).toMatch(/Falta el enlace/);
  });

  it("recorta textos desmedidos en vez de guardarlos enteros", () => {
    const r = validateEvent({ ...base, place: "x".repeat(5000), text: "y".repeat(5000) });
    expect(r.ok && r.value.place?.length).toBe(200);
    expect(r.ok && r.value.description?.length).toBe(2000);
  });
});

describe("la fecha va y vuelve sin cambiar", () => {
  // Lo que se guarda (GEDCOM) se muestra en español en el formulario; si la
  // persona guarda sin tocarla, o la reescribe igual, debe quedar la misma.
  it.each([
    "1891", "MAY 1891", "5 MAY 1891", "ABT 1910", "ABT 23 JUN 1887", "BEF 1900", "AFT 1900",
    "BET 1924 AND 1930", "BET 5 MAY 1891 AND 1893", "FROM 1911",
  ])("%s", (gedcom) => {
    expect(spanishDateToGedcom(dateForEditing(gedcom))?.text).toBe(gedcom);
  });

  it("sin fecha guardada, el campo queda vacío", () => {
    expect(dateForEditing(null)).toBe("");
  });
});

describe("diedAsChild", () => {
  it("marca a quien murió antes de los 12 años y a nadie sin ambas fechas", () => {
    expect(diedAsChild(1901, 1901)).toBe(true);
    expect(diedAsChild(1883, 1894)).toBe(true);
    expect(diedAsChild(1883, 1895)).toBe(false);
    expect(diedAsChild(null, 1901)).toBe(false);
    expect(diedAsChild(1901, null)).toBe(false);
    expect(diedAsChild(1901, 1890)).toBe(false); // fechas incoherentes: no se adivina
  });

  it("sin nacimiento conocido, vale la edad aproximada anotada en la defunción", () => {
    expect(diedAsChild(null, 1898, 6)).toBe(true);
    expect(diedAsChild(null, null, 6)).toBe(true); // ni siquiera hace falta el año de la muerte
    expect(diedAsChild(null, 1898, 12)).toBe(false);
    expect(diedAsChild(null, 1898, 67)).toBe(false);
    expect(diedAsChild(null, 1898, null)).toBe(false);
  });

  it("con las dos fechas, mandan las fechas y no la nota", () => {
    expect(diedAsChild(1850, 1917, 6)).toBe(false);
    expect(diedAsChild(1892, 1898, 67)).toBe(true);
  });
});

describe("edad aproximada al morir: una línea dentro del detalle de la defunción", () => {
  it("la lee de donde esté en el detalle", () => {
    expect(approxAgeAtDeath("Edad aproximada al morir: 6 años (nacería aprox. en 1892).")).toBe(6);
    expect(approxAgeAtDeath("Caída de caballo\nEdad aproximada al morir: 67 años.")).toBe(67);
    expect(approxAgeAtDeath("Caída de caballo")).toBeNull();
    expect(approxAgeAtDeath(null)).toBeNull();
  });

  it("la agrega, la cambia y la quita sin tocar el resto del detalle", () => {
    const first = withApproxAge("Caída de caballo", 67, 1917);
    expect(first).toBe("Caída de caballo\nEdad aproximada al morir: 67 años (nacería aprox. en 1850).");
    expect(withApproxAge(first, 6, 1917)).toBe("Caída de caballo\nEdad aproximada al morir: 6 años (nacería aprox. en 1911).");
    expect(withApproxAge(first, null, 1917)).toBe("Caída de caballo");
    expect(withApproxAge("", 6, null)).toBe("Edad aproximada al morir: 6 años.");
    expect(approxAgeAtDeath(withApproxAge("", 6, 1898))).toBe(6);
  });
});

describe("researchFactForm: un hecho de investigacion.json cargado en el formulario", () => {
  const fact = (raw: Record<string, unknown>) =>
    parseResearch({ personas: [{ uid: "X", hechos: [raw] }] }).byUid.get("X")![0];

  it("una etiqueta que nombra un tipo conocido usa ese tipo", () => {
    expect(
      researchFactForm(fact({ fecha: "5 de mayo de 1891", etiqueta: "Bautismo", texto: "Bautizada.", lugar: "Curicó" })),
    ).toEqual({
      type: "BAPM", subtype: "", date: "5 de mayo de 1891", place: "Curicó", text: "Bautizada.",
      sourceTitle: "", sourceUrl: "", sourceQuote: "", participants: [],
    });
  });

  it("cualquier otra etiqueta queda como «Otro hecho» con ese nombre, y conserva la fecha como se escribió", () => {
    expect(researchFactForm(fact({ fecha: "década de 1920", etiqueta: "Barrio", texto: "Vive en Yungay." }))).toMatchObject({
      type: "EVEN", subtype: "Barrio", date: "década de 1920", text: "Vive en Yungay.",
    });
    expect(researchFactForm(fact({ etiqueta: "Elección", texto: "Candidato." }))).toMatchObject({ type: "EVEN", subtype: "Elección" });
  });

  it("lleva la primera fuente", () => {
    const form = researchFactForm(
      fact({ texto: "x", fuentes: [{ titulo: "Senado, 1924", url: "https://bcn.cl/x", cita: "fué asaltada" }] }),
    );
    expect(form).toMatchObject({ sourceTitle: "Senado, 1924", sourceUrl: "https://bcn.cl/x", sourceQuote: "fué asaltada" });
  });

  it("un hecho que nombra a otra persona no se edita en la app", () => {
    expect(researchFactForm(fact({ texto: "Probable matrimonio.", con: "SARA" }))).toBeNull();
  });
});
