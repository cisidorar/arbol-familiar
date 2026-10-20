import { describe, expect, it } from "vitest";
import { countCrossings, pathWithJumps, type Pt } from "../link-jumps";

// Hija de la pareja: sube hasta su barra (y=505), va a la derecha y sube por la bajada de la pareja (x=787).
const hija: Pt[] = [[327, 590], [327, 505], [787, 505], [787, 311]];
// Hijo de José solo: su barra (y=477) va de la bajada de José (x=518) hasta su hijo (x=1052).
const medio: Pt[] = [[1052, 590], [1052, 477], [518, 477], [518, 418]];

describe("pathWithJumps", () => {
  it("corta la horizontal donde otra línea la atraviesa de lado a lado", () => {
    const d = pathWithJumps(medio, [hija]);
    // La bajada de la pareja (x=787) pasa por la barra y=477: la barra se parte ahí.
    expect(d).toContain("L794,477 M780,477");
    // La hija no se corta: su barra (y=505) no la cruza ninguna vertical de `medio`.
    expect(pathWithJumps(hija, [medio])).not.toContain("M780");
    expect(pathWithJumps(hija, [medio]).match(/M/g)).toHaveLength(1);
  });

  it("no corta una unión en T (la vertical termina en la barra)", () => {
    const hermano: Pt[] = [[600, 590], [600, 505], [787, 505], [787, 311]];
    const d = pathWithJumps(hija, [hermano]);
    expect(d.match(/M/g)).toHaveLength(1);
  });

  it("sin otras líneas deja el trazo recto de siempre", () => {
    expect(pathWithJumps(hija, [])).toBe("M327,590 L327,505 L787,505 L787,311");
  });

  it("los saltos van en orden aunque la línea vaya hacia la izquierda", () => {
    const a: Pt[] = [[900, 400], [100, 400]];
    const v1: Pt[] = [[300, 300], [300, 500]];
    const v2: Pt[] = [[600, 300], [600, 500]];
    const d = pathWithJumps(a, [v1, v2]);
    expect(d).toBe("M900,400 L607,400 M593,400 L307,400 M293,400 L100,400");
  });

  it("ignora puntos repetidos", () => {
    const d = pathWithJumps([[0, 0], [0, 0], [0, 50], [0, 50], [80, 50]], []);
    expect(d).toBe("M0,0 L0,50 L80,50");
  });
});

describe("countCrossings", () => {
  it("cuenta los cruces de lado a lado y no las uniones en T", () => {
    expect(countCrossings(hija, [medio])).toBe(1);
    expect(countCrossings(medio, [hija])).toBe(1);
    const hermano: Pt[] = [[600, 590], [600, 505], [787, 505], [787, 311]];
    expect(countCrossings(hija, [hermano])).toBe(0);
  });
});
