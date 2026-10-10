import { describe, expect, it } from "vitest";
import { describeChange } from "../changes";
import {
  otherParentChoices,
  relationTitle,
  relativeDefaults,
  relativeOptions,
  validateChildBirthApprox,
  validateRelative,
  yearOfTypedDate,
  type RelativeDatum,
} from "../relatives";

const person = (
  id: string,
  gender: "M" | "F",
  surname_pat: string,
  surname_mat: string,
  rels: RelativeDatum["rels"] = {},
  extra: Partial<RelativeDatum["data"]> = {},
): RelativeDatum => ({
  id,
  data: { gender, label: `${id} ${surname_pat} ${surname_mat}`.trim(), surname_pat, surname_mat, is_living: false, ...extra },
  rels: { parents: [], spouses: [], children: [], ...rels },
});

const family = () => {
  const people = [
    person("juan", "M", "Balcazar", "Araya", { spouses: ["clorinda"], children: ["luis"] }),
    person("clorinda", "F", "González", "Quinteros", { spouses: ["juan"], children: ["luis"] }),
    person("luis", "M", "Balcazar", "González", { parents: ["juan", "clorinda"] }),
    person("sola", "F", "Rojas", "Pino"),
    person("hija", "F", "Soto", "Rojas", { parents: ["sola"] }),
  ];
  return new Map(people.map((p) => [p.id, p]));
};

describe("relativeOptions", () => {
  const byId = family();
  const option = (id: string, relation: string) => relativeOptions(byId.get(id)!, byId).find((o) => o.relation === relation)!;

  it("a cualquiera se le puede agregar un hijo o una pareja", () => {
    expect(option("sola", "child").blocked).toBeNull();
    expect(option("sola", "partner").blocked).toBeNull();
  });

  it("un hermano necesita al menos un padre conocido, y lo dice en vez de esconder la opción", () => {
    expect(option("luis", "sibling").blocked).toBeNull();
    expect(option("hija", "sibling").blocked).toBeNull();
    expect(option("sola", "sibling").blocked).toMatch(/padre o a su madre/);
  });

  it("no ofrece un tercer padre, y nombra al que falta", () => {
    expect(option("luis", "parent").blocked).toMatch(/Ya tiene/);
    expect(option("sola", "parent")).toMatchObject({ blocked: null, label: "Agregar a su padre o madre" });
    expect(option("hija", "parent")).toMatchObject({ blocked: null, label: "Agregar a su padre" });
  });
});

describe("relativeDefaults", () => {
  const byId = family();
  const of = (id: string) => byId.get(id)!;

  it("un hijo lleva el apellido paterno del padre y el paterno de la madre, sea quien sea desde donde se agrega", () => {
    expect(relativeDefaults("child", of("juan"), of("clorinda"), byId)).toMatchObject({ surnamePat: "Balcazar", surnameMat: "González", sex: "" });
    expect(relativeDefaults("child", of("clorinda"), of("juan"), byId)).toMatchObject({ surnamePat: "Balcazar", surnameMat: "González" });
  });

  it("sin el otro padre conocido, solo propone el apellido que sí se sabe", () => {
    expect(relativeDefaults("child", of("sola"), null, byId)).toMatchObject({ surnamePat: "", surnameMat: "Rojas" });
    expect(relativeDefaults("child", of("juan"), null, byId)).toMatchObject({ surnamePat: "Balcazar", surnameMat: "" });
  });

  it("un hermano comparte los dos apellidos", () => {
    expect(relativeDefaults("sibling", of("luis"), null, byId)).toMatchObject({ surnamePat: "Balcazar", surnameMat: "González" });
  });

  it("el padre lleva el apellido paterno de su hijo; la madre, el materno", () => {
    expect(relativeDefaults("parent", of("sola"), null, byId)).toMatchObject({ sex: "M", surnamePat: "Rojas", surnameMat: "" });
    // "hija" ya tiene madre: falta el padre.
    expect(relativeDefaults("parent", of("hija"), null, byId)).toMatchObject({ sex: "M", surnamePat: "Soto" });
    const conPadre = new Map(byId);
    conPadre.set("x", person("x", "M", "Soto", "Rojas", { parents: ["juan"] }));
    expect(relativeDefaults("parent", conPadre.get("x")!, null, conPadre)).toMatchObject({ sex: "F", surnamePat: "Rojas" });
  });

  it("la pareja parte con el otro sexo y sin apellidos", () => {
    expect(relativeDefaults("partner", of("sola"), null, byId)).toMatchObject({ sex: "M", surnamePat: "", surnameMat: "" });
  });

  it("el estado parte del de su familiar; un hijo puede vivir aunque su padre haya muerto, salvo que sea de hace mucho", () => {
    expect(relativeDefaults("sibling", of("luis"), null, byId).isLiving).toBe(false);
    const viva = person("v", "F", "A", "B", {}, { is_living: true });
    expect(relativeDefaults("sibling", viva, null, byId).isLiving).toBe(true);
    const abuelo = person("a", "M", "A", "B", {}, { is_living: false, birth_year: 1913 });
    expect(relativeDefaults("child", abuelo, null, byId, 2026).isLiving).toBe(true);
    const tatara = person("t", "M", "A", "B", {}, { is_living: false, birth_year: 1810 });
    expect(relativeDefaults("child", tatara, null, byId, 2026).isLiving).toBe(false);
    // Sin fecha de nacimiento, decide cuándo murió; sin ninguna fecha, fallecido.
    const reciente = person("r", "F", "A", "B", {}, { is_living: false, death_year: 2008 });
    expect(relativeDefaults("child", reciente, null, byId, 2026).isLiving).toBe(true);
    expect(relativeDefaults("child", of("juan"), null, byId, 2026).isLiving).toBe(false);
  });
});

describe("otherParentChoices / relationTitle", () => {
  const byId = family();
  it("ofrece a sus parejas como el otro padre o madre", () => {
    expect(otherParentChoices(byId.get("juan")!, byId).map((p) => p.id)).toEqual(["clorinda"]);
    expect(otherParentChoices(byId.get("sola")!, byId)).toEqual([]);
  });
  it("el título dice qué se agrega y a quién", () => {
    expect(relationTitle("child", byId.get("juan")!, byId)).toBe("Hijo o hija de juan Balcazar Araya");
    expect(relationTitle("parent", byId.get("hija")!, byId)).toBe("Padre de hija Soto Rojas");
    expect(relationTitle("parent", byId.get("sola")!, byId)).toBe("Padre o madre de sola Rojas Pino");
  });
});

describe("validateRelative", () => {
  const OF = "11111111-1111-4111-8111-111111111111";
  const OTHER = "22222222-2222-4222-8222-222222222222";
  const base = {
    relation: "child",
    of: OF,
    otherParentId: OTHER,
    person: { given: "Pedro", surnamePat: "Balcazar", surnameMat: "Araya", sex: "M", isLiving: false, notes: "" },
    birthDate: "",
  };

  it("acepta un pedido completo", () => {
    const r = validateRelative(base);
    expect(r.ok && r.value).toMatchObject({ relation: "child", of: OF, otherParentId: OTHER, birth: null });
    expect(r.ok && r.value.person.displayName).toBe("Pedro Balcazar Araya");
  });

  it("interpreta la fecha de nacimiento como en cualquier hecho", () => {
    const r = validateRelative({ ...base, birthDate: "aprox. 1850" });
    expect(r.ok && r.value.birth).toMatchObject({ type: "BIRT", date: { text: "ABT 1850" } });
    const bad = validateRelative({ ...base, birthDate: "antier" });
    expect(!bad.ok && bad.errors.birthDate).toBeTruthy();
  });

  it("el otro padre es opcional, pero no puede ser cualquier cosa ni la misma persona", () => {
    expect(validateRelative({ ...base, otherParentId: null }).ok).toBe(true);
    expect(validateRelative({ ...base, otherParentId: "" }).ok).toBe(true);
    expect(validateRelative({ ...base, otherParentId: "x" }).ok).toBe(false);
    expect(validateRelative({ ...base, otherParentId: OF }).ok).toBe(false);
  });

  it("fuera de un hijo, el otro padre se ignora", () => {
    const r = validateRelative({ ...base, relation: "sibling" });
    expect(r.ok && r.value.otherParentId).toBeNull();
  });

  it("rechaza un parentesco inventado, un id que no es tal y una persona sin nombre ni sexo", () => {
    expect(validateRelative({ ...base, relation: "primo" }).ok).toBe(false);
    expect(validateRelative({ ...base, of: "1 or 1=1" }).ok).toBe(false);
    const r = validateRelative({ ...base, person: { given: " ", surnamePat: "", surnameMat: "", sex: "", isLiving: true } });
    expect(!r.ok && r.errors).toMatchObject({ given: expect.any(String), sex: expect.any(String) });
    expect(validateRelative(null).ok).toBe(false);
  });
});

describe("historial: una persona agregada", () => {
  it("dice quién se agregó y como qué", () => {
    const d = describeChange({
      entity: "person",
      action: "create",
      before: null,
      after: { given: "Pedro", surnamePat: "Balcazar", surnameMat: null, sex: "M", isLiving: false, relation: "child", relatedTo: "Isidoro Balcazar Bravo" },
    });
    expect(d.summary).toBe("agregó al árbol a");
    expect(d.details[0]).toBe("Como hijo o hija de Isidoro Balcazar Bravo");
    expect(d.details).toContain("Nombres: Pedro");
    expect(d.details).toContain("Sexo: Hombre");
  });
});

describe("yearOfTypedDate", () => {
  it("saca el año de las formas en que se escribe una fecha", () => {
    expect(yearOfTypedDate("1908")).toBe(1908);
    expect(yearOfTypedDate("5 de mayo de 1908")).toBe(1908);
    expect(yearOfTypedDate("aprox. 1908")).toBe(1908);
    expect(yearOfTypedDate("")).toBeNull();
    expect(yearOfTypedDate("mayo")).toBeNull();
  });
});

describe("validateChildBirthApprox", () => {
  it("un año suelto se guarda como aproximado", () => {
    const r = validateChildBirthApprox("1885");
    expect(r).toEqual({ ok: true, value: { text: "ABT 1885", from: expect.stringMatching(/^1885/) } });
  });
  it("respeta 'c.' y los rangos", () => {
    expect(validateChildBirthApprox("c. 1885")).toMatchObject({ ok: true, value: { text: "ABT 1885" } });
    expect(validateChildBirthApprox("entre 1884 y 1887")).toMatchObject({ ok: true, value: { text: "BET 1884 AND 1887" } });
  });
  it("vacío = quitarla; basura = error", () => {
    expect(validateChildBirthApprox("  ")).toEqual({ ok: true, value: null });
    expect(validateChildBirthApprox("antier")).toMatchObject({ ok: false });
  });
});
