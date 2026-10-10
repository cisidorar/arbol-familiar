import { describe, expect, it } from "vitest";
import { describeChange } from "../changes";

describe("describeChange", () => {
  it("datos de la persona: solo lista los campos que cambiaron", () => {
    const { summary, details } = describeChange({
      entity: "person", action: "update",
      before: { given: "Maria del Carmen", surnamePat: "Ruz", surnameMat: "Martínez", sex: "F", isLiving: false, notes: null },
      after: { given: "María del Carmen", surnamePat: "Ruz", surnameMat: "Martínez", sex: "F", isLiving: false, notes: "Le decían Carmela." },
    });
    expect(summary).toBe("cambió los datos de");
    expect(details).toEqual(["Nombres: Maria del Carmen → María del Carmen", "Notas: (vacío) → Le decían Carmela."]);
  });

  it("traduce sexo y estado", () => {
    const { details } = describeChange({
      entity: "person", action: "update",
      before: { sex: "U", isLiving: true }, after: { sex: "F", isLiving: false },
    });
    expect(details).toEqual(["Sexo: Sin dato → Mujer", "Estado: Viva / vivo → Fallecida/o"]);
  });

  it("hecho agregado: nombra el tipo y lista lo que trae", () => {
    const { summary, details } = describeChange({
      entity: "event", action: "create", before: null,
      after: { type: "BAPM", subtype: "", date: "5 de mayo de 1891", place: "Curicó", text: "", sourceTitle: "", sourceUrl: "", sourceQuote: "" },
    });
    expect(summary).toBe("agregó «Bautismo» a");
    expect(details).toEqual(["Fecha: 5 de mayo de 1891", "Lugar: Curicó"]);
  });

  it("hecho editado: antes → después, y un tipo propio usa su nombre", () => {
    const { summary, details } = describeChange({
      entity: "event", action: "update",
      before: { type: "EVEN", subtype: "Servicio militar", date: "1910", place: "", text: "" },
      after: { type: "EVEN", subtype: "Servicio militar", date: "aprox. 1911", place: "Talca", text: "" },
    });
    expect(summary).toBe("editó «Servicio militar» de");
    expect(details).toEqual(["Fecha: 1910 → aprox. 1911", "Lugar: (vacío) → Talca"]);
  });

  it("hecho borrado: queda a la vista lo que se borró", () => {
    const { summary, details } = describeChange({
      entity: "event", action: "delete", after: null,
      before: { type: "OCCU", subtype: "", date: "aprox. 1915", place: "Curicó", text: "Costurera" },
    });
    expect(summary).toBe("borró «Trabajo u oficio» de");
    expect(details).toEqual(["Fecha: aprox. 1915", "Lugar: Curicó", "Detalle: Costurera"]);
  });

  it("acorta los textos largos", () => {
    const { details } = describeChange({
      entity: "event", action: "create", before: null, after: { type: "OCCU", text: "a".repeat(300) },
    });
    expect(details[0].length).toBeLessThan(110);
    expect(details[0].endsWith("…")).toBe(true);
  });
});

describe("eliminar a una persona", () => {
  it("se cuenta como eliminada, con lo que tenía", () => {
    const r = describeChange({ entity: "person", action: "delete", before: { given: "José", surnamePat: "Balcazar", sex: "M", isLiving: false }, after: null });
    expect(r.summary).toBe("eliminó del árbol a");
    expect(r.details).toContain("Nombres: José");
  });
});
