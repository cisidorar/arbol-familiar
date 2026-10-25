import { describe, expect, it } from "vitest";
import { priorityOf, type ReviewPerson } from "../data/review";

const person = (over: Partial<ReviewPerson> = {}): ReviewPerson => ({
  id: "p", name: "Juan Pérez", birthYear: 1850, deathYear: 1920, isLiving: false, parentsKnown: false, ...over,
});

describe("priorityOf", () => {
  it("un bautismo con fuente de alguien sin padres es de prioridad alta y lo dice", () => {
    const r = priorityOf("BAPM", [person()], true);
    expect(r.level).toBe("alta");
    expect(r.reason).toContain("padres de Juan");
  });
  it("si ya están sus padres baja a media", () => {
    expect(priorityOf("BAPM", [person({ parentsKnown: true })], true).level).toBe("media");
  });
  it("un hecho suelto sin fuente es de prioridad baja", () => {
    expect(priorityOf("EVEN", [person({ parentsKnown: true })], false).level).toBe("baja");
  });
  it("un matrimonio nombra a los padres de los dos", () => {
    const r = priorityOf("MARR", [person({ name: "Juan X" }), person({ name: "Rosa Y" })], false);
    expect(r.reason).toContain("Juan y Rosa");
    expect(r.level).toBe("alta");
  });
  it("gana la que más puede responder", () => {
    expect(priorityOf("DEAT", [person()], true).score).toBeGreaterThan(priorityOf("DEAT", [person({ parentsKnown: true })], true).score);
  });
});
