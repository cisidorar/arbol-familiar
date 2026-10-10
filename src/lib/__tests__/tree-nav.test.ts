import { describe, expect, it } from "vitest";
import {
  collapseSiblings,
  decideExpand,
  emptyExpanded,
  expandDirection,
  pruneHierarchy,
  shownSiblings,
  siblingsSide,
  type HierarchyNode,
  type NavNode,
} from "../tree-nav";

const h = (id: string, ...children: HierarchyNode[]): HierarchyNode =>
  children.length ? { data: { id }, children } : { data: { id } };

const ids = (node: HierarchyNode): string[] => [node.data.id, ...(node.children ?? []).flatMap(ids)];

// Tronco con dos ramas de ancestros, cada una con tres generaciones más.
const ancestry = () =>
  h(
    "yo",
    h("papa", h("abuelo", h("bis1", h("tatara1")), h("bis2")), h("abuela", h("bis3"))),
    h("mama", h("abuelo2", h("bis4"))),
  );

describe("pruneHierarchy", () => {
  it("muestra solo las generaciones por defecto", () => {
    const root = ancestry();
    pruneHierarchy(root, 2, new Set());
    expect(ids(root).sort()).toEqual(["abuela", "abuelo", "abuelo2", "mama", "papa", "yo"]);
  });

  it("abre solo la rama pedida, no a todos los de ese nivel", () => {
    const root = ancestry();
    pruneHierarchy(root, 2, new Set(["abuelo"]));
    expect(ids(root).sort()).toEqual(["abuela", "abuelo", "abuelo2", "bis1", "bis2", "mama", "papa", "yo"]);
  });

  it("una rama abierta muestra una sola generación más", () => {
    const root = ancestry();
    pruneHierarchy(root, 2, new Set(["abuelo"]));
    expect(ids(root)).not.toContain("tatara1");
  });

  it("se puede seguir abriendo hacia arriba persona por persona", () => {
    const root = ancestry();
    pruneHierarchy(root, 2, new Set(["abuelo", "bis1"]));
    expect(ids(root)).toContain("tatara1");
    expect(ids(root)).not.toContain("bis3");
  });

  it("ignora ramas abiertas que quedaron bajo un nodo cerrado", () => {
    const root = ancestry();
    pruneHierarchy(root, 2, new Set(["bis1"]));
    expect(ids(root)).not.toContain("bis1");
  });
});

const node = (over: Partial<NavNode> & { id: string; rels: NavNode["data"]["rels"] }): NavNode => ({
  depth: over.depth ?? 0,
  is_ancestry: over.is_ancestry,
  spouse: over.spouse,
  spouses: over.spouses,
  sibling: over.sibling,
  kid: over.kid,
  parent: over.parent,
  siblingsHidden: over.siblingsHidden,
  data: { id: over.id, rels: over.rels },
});

// En un ancestro, `parent` es su hijo de la línea directa.
const lineChild = (id: string) => ({ data: { id } });

describe("decideExpand", () => {
  it("no hace nada si toda su familia está a la vista", () => {
    const n = node({ id: "a", depth: 1, is_ancestry: true, rels: { parents: ["p"], children: ["c"] } });
    expect(decideExpand(n, new Set(["a", "p", "c"]), emptyExpanded())).toEqual({ kind: "none" });
  });

  it("ancestro con padres ocultos: abre sus padres", () => {
    const n = node({ id: "a", depth: 2, is_ancestry: true, rels: { parents: ["p1", "p2"], children: ["c"] } });
    expect(decideExpand(n, new Set(["a", "c"]), emptyExpanded())).toEqual({ kind: "up" });
  });

  it("ancestro con padres a la vista y otros hijos ocultos: muestra a los hermanos de su hijo", () => {
    const n = node({
      id: "a",
      depth: 1,
      is_ancestry: true,
      parent: lineChild("c"),
      rels: { parents: ["p1"], children: ["c", "otro"] },
    });
    expect(decideExpand(n, new Set(["a", "p1", "c"]), emptyExpanded())).toEqual({ kind: "siblings", of: "c" });
  });

  it("ancestro con padres ocultos y otros hijos: primero abre los padres", () => {
    const n = node({
      id: "a",
      depth: 2,
      is_ancestry: true,
      parent: lineChild("c"),
      rels: { parents: ["p1"], children: ["c", "otro"] },
    });
    expect(decideExpand(n, new Set(["a", "c"]), emptyExpanded())).toEqual({ kind: "up" });
  });

  it("si los hermanos ya están abiertos y aun falta un hijo, hay que centrar en él", () => {
    // p. ej. el hijo que falta ya está en pantalla en otra rama y no se repite
    const n = node({
      id: "a",
      depth: 1,
      is_ancestry: true,
      parent: lineChild("c"),
      rels: { parents: ["p1"], children: ["c", "otro"] },
    });
    const expanded = emptyExpanded();
    expanded.sibs.add("c");
    expect(decideExpand(n, new Set(["a", "p1", "c"]), expanded)).toEqual({
      kind: "recenter",
      hidden: { parents: false, children: true, spouses: false },
      partly: { children: true, spouses: false },
    });
  });

  describe("hermano de la línea directa con familia propia", () => {
    const sibling = () =>
      node({ id: "h", depth: 1, sibling: true, rels: { parents: ["p1"], spouses: ["pareja"], children: ["x"] } });

    it("primero muestra a su pareja a su lado, sin cambiar de árbol", () => {
      expect(decideExpand(sibling(), new Set(["h", "p1"]), emptyExpanded())).toEqual({ kind: "partners" });
    });

    it("con la pareja ya a la vista, sus hijos se abren en la fila de abajo", () => {
      const expanded = emptyExpanded();
      expanded.partners.add("h");
      expect(decideExpand(sibling(), new Set(["h", "p1", "pareja"]), expanded)).toEqual({ kind: "kids" });
    });

    it("con sus hijos ya abiertos, lo que falte se ve centrando en él", () => {
      const expanded = emptyExpanded();
      expanded.partners.add("h");
      expanded.kids.add("h");
      expect(decideExpand(sibling(), new Set(["h", "p1", "pareja"]), expanded)).toEqual({
        kind: "recenter",
        hidden: { parents: false, children: true, spouses: false },
        partly: { children: false, spouses: true },
      });
    });

    it("sin hijos, con la pareja a la vista ya no queda nada por abrir", () => {
      const n = node({ id: "h", depth: 1, sibling: true, rels: { parents: ["p1"], spouses: ["pareja"] } });
      const expanded = emptyExpanded();
      expanded.partners.add("h");
      expect(decideExpand(n, new Set(["h", "p1", "pareja"]), expanded)).toEqual({ kind: "none" });
    });

    it("no repite la apertura si la pareja no se pudo mostrar", () => {
      const expanded = emptyExpanded();
      expanded.partners.add("h");
      expanded.kids.add("h");
      expect(decideExpand(sibling(), new Set(["h", "p1"]), expanded).kind).toBe("recenter");
    });

    it("sin pareja pero con hijos ocultos: se abren sus hijos", () => {
      const n = node({ id: "h", depth: 1, sibling: true, rels: { parents: ["p1"], children: ["x"] } });
      expect(decideExpand(n, new Set(["h", "p1"]), emptyExpanded()).kind).toBe("kids");
    });

    it("un hijo de un hermano agregado no se despliega: solo se puede centrar en él", () => {
      const n = node({ id: "k", depth: 2, kid: true, rels: { parents: ["h", "pareja"], children: ["nieto"] } });
      expect(decideExpand(n, new Set(["k", "h", "pareja"]), emptyExpanded()).kind).toBe("recenter");
    });

    it("la pareja agregada de un hermano no abre los hijos: eso lo hace su pareja", () => {
      const n = node({ id: "s", depth: 1, spouse: {}, rels: { parents: [], spouses: ["h"], children: ["x"] } });
      expect(decideExpand(n, new Set(["s", "h"]), emptyExpanded()).kind).toBe("recenter");
    });

    it("la pareja de alguien de la línea directa no se abre así (no es un hermano)", () => {
      const n = node({ id: "s", depth: 0, spouse: {}, rels: { parents: ["p1"], spouses: ["yo", "otra"] } });
      expect(decideExpand(n, new Set(["s", "yo", "p1"]), emptyExpanded())).toEqual({
        kind: "recenter",
        hidden: { parents: false, children: false, spouses: true },
        partly: { children: false, spouses: true },
      });
    });
  });

  it("descendiente con hijos ocultos: abre sus hijos", () => {
    const n = node({ id: "d", depth: 2, rels: { parents: ["x"], children: ["h"] } });
    expect(decideExpand(n, new Set(["d", "x"]), emptyExpanded())).toEqual({ kind: "down" });
  });

  it("pareja del tronco con padres ocultos: se agregan a su lado, sin centrar", () => {
    const n = node({ id: "s", depth: 0, spouse: {}, rels: { parents: ["p1", "p2"], spouses: ["yo"] } });
    expect(decideExpand(n, new Set(["s", "yo"]), emptyExpanded())).toEqual({ kind: "spouse-up" });
  });

  it("pareja del tronco: con los padres ya abiertos, no se repite (y si falta algo más, se centra)", () => {
    const n = node({ id: "s", depth: 0, spouse: {}, rels: { parents: ["p1", "p2"], spouses: ["yo", "otra"] } });
    const expanded = emptyExpanded();
    expanded.spousesUp.add("s");
    expect(decideExpand(n, new Set(["s", "yo"]), expanded)).toEqual({
      kind: "recenter",
      hidden: { parents: true, children: false, spouses: true },
      partly: { children: false, spouses: true },
    });
  });

  it("la pareja de un ancestro o descendiente (no la del tronco) con padres ocultos: también se agregan a su lado", () => {
    const n = node({ id: "s", depth: 2, spouse: {}, rels: { parents: ["p1"] } });
    expect(decideExpand(n, new Set(["s"]), emptyExpanded())).toEqual({ kind: "spouse-up" });
  });

  it("el lado 'de sangre' de una pareja ya agregada (no solo la pareja) también puede abrir sus propios padres", () => {
    // p. ej. el padre de alguien, una vez que él y su esposa ya están los
    // dos en pantalla (ver caso María Teresa → Luis Humberto + Juana).
    const n = node({ id: "h", depth: -1, sibling: true, spouses: ["esposa"], rels: { parents: ["p1", "p2"] } });
    expect(decideExpand(n, new Set(["h", "esposa"]), emptyExpanded())).toEqual({ kind: "spouse-up" });
  });

  it("lo mismo, pero no se repite si ya se pidió", () => {
    const n = node({ id: "h", depth: -1, sibling: true, spouses: ["esposa"], rels: { parents: ["p1", "p2"] } });
    const expanded = emptyExpanded();
    expanded.spousesUp.add("h");
    expect(decideExpand(n, new Set(["h", "esposa"]), expanded).kind).toBe("recenter");
  });

  it("alguien fuera de la línea directa con sus padres ya a la vista y hermanos ocultos: se agregan a su lado", () => {
    // p. ej. la pareja del tronco, ya con sus propios padres mostrados (spouse-up).
    const n = node({ id: "s", depth: 0, spouse: {}, rels: { spouses: ["yo"] }, siblingsHidden: true });
    expect(decideExpand(n, new Set(["s", "yo"]), emptyExpanded())).toEqual({ kind: "siblings", of: "s" });
  });

  it("lo mismo para un hermano ya agregado (no solo para una pareja)", () => {
    const n = node({ id: "h", depth: 1, sibling: true, rels: { parents: ["p1"] }, siblingsHidden: true });
    expect(decideExpand(n, new Set(["h", "p1"]), emptyExpanded())).toEqual({ kind: "siblings", of: "h" });
  });

  it("no se repite si ya se pidió (y si no queda nada más, no hace nada)", () => {
    const n = node({ id: "s", depth: 0, spouse: {}, rels: {}, siblingsHidden: true });
    const expanded = emptyExpanded();
    expanded.sibs.add("s");
    expect(decideExpand(n, new Set(["s"]), expanded)).toEqual({ kind: "none" });
  });

  it("no aplica a alguien de la línea directa (esa ya tiene su propio mecanismo)", () => {
    const n = node({ id: "yo", depth: 0, rels: {}, siblingsHidden: true });
    expect(decideExpand(n, new Set(["yo"]), emptyExpanded())).toEqual({ kind: "none" });
  });

  it("una ancestra sigue siendo de la línea directa aunque tenga marcada a su pareja", () => {
    // tree-layout y la librería enlazan a los dos padres de alguien entre sí;
    // eso no la convierte en "la pareja de alguien": abre a sus padres con
    // "up" (con su lugar reservado), no con "spouse-up".
    const n = node({
      id: "abuela",
      depth: 2,
      is_ancestry: true,
      spouse: {},
      parent: lineChild("papa"),
      rels: { parents: ["b1", "b2"], children: ["papa", "tio"] },
      siblingsHidden: true,
    });
    expect(decideExpand(n, new Set(["abuela", "papa"]), emptyExpanded())).toEqual({ kind: "up" });
    const expanded = emptyExpanded();
    expanded.up.add("abuela");
    expect(decideExpand(n, new Set(["abuela", "papa", "b1", "b2"]), expanded)).toEqual({ kind: "siblings", of: "papa" });
  });

  it("sin pedirlo todavía, cuenta como pendiente aunque no haya nada más oculto", () => {
    const n = node({ id: "s", depth: 0, spouse: {}, rels: {}, siblingsHidden: true });
    expect(decideExpand(n, new Set(["s"]), emptyExpanded())).toEqual({ kind: "siblings", of: "s" });
  });

  it("no repite una apertura que ya se hizo y no mostró a nadie", () => {
    const n = node({ id: "a", depth: 2, is_ancestry: true, rels: { parents: ["no-existe"] } });
    const expanded = emptyExpanded();
    expanded.up.add("a");
    expect(decideExpand(n, new Set(["a"]), expanded).kind).toBe("recenter");
  });
});

describe("expandDirection", () => {
  const at = (n: NavNode, x: number, gender?: string): NavNode => ({ ...n, x, data: { ...n.data, data: { gender } } });

  it("padres hacia arriba, hijos hacia abajo", () => {
    const n = node({ id: "a", rels: {} });
    expect(expandDirection({ kind: "up" }, n)).toBe("up");
    expect(expandDirection({ kind: "spouse-up" }, n)).toBe("up");
    expect(expandDirection({ kind: "down" }, n)).toBe("down");
  });

  it("los otros hijos de un ancestro aparecen abajo suyo", () => {
    const n = node({ id: "papa", is_ancestry: true, rels: {} });
    expect(expandDirection({ kind: "siblings", of: "yo" }, n)).toBe("down");
  });

  it("los hermanos de una pareja aparecen del lado contrario a quien la acompaña", () => {
    const right = at(node({ id: "s", spouse: { x: 0 }, rels: {} }), 100, "F");
    expect(expandDirection({ kind: "siblings", of: "s" }, right)).toBe("right");
    const left = at(node({ id: "s", spouse: { x: 100 }, rels: {} }), 0, "M");
    expect(expandDirection({ kind: "siblings", of: "s" }, left)).toBe("left");
  });

  it("la pareja de un hermano: a la derecha de él, a la izquierda de ella", () => {
    expect(expandDirection({ kind: "kids" }, at(node({ id: "h", sibling: true, rels: {} }), 0, "M"))).toBe("down");
    expect(expandDirection({ kind: "partners" }, at(node({ id: "h", sibling: true, rels: {} }), 0, "M"))).toBe("right");
    expect(expandDirection({ kind: "kids" }, at(node({ id: "h", sibling: true, rels: {} }), 0, "M"))).toBe("down");
    expect(expandDirection({ kind: "partners" }, at(node({ id: "h", sibling: true, rels: {} }), 0, "F"))).toBe("left");
  });

  it("centrar el árbol no tiene dirección; sin nada que abrir, no hay flecha", () => {
    const n = node({ id: "a", rels: {} });
    const recenter = { kind: "recenter", hidden: { parents: true, children: false, spouses: false }, partly: { children: false, spouses: false } } as const;
    expect(expandDirection(recenter, n)).toBe("recenter");
    expect(expandDirection({ kind: "none" }, n)).toBeNull();
  });
});

describe("comprimir a los hermanos", () => {
  const padre = { data: { id: "p" } };
  const yo = { data: { id: "yo" }, x: 0, parents: [padre] as unknown[] };
  const hno = (id: string, x: number, extra = {}) => ({ data: { id }, x, sibling: true, parents: [padre] as unknown[], ...extra });
  const todos = () => [yo, hno("a", 280), hno("b", 560), { data: { id: "otro" }, x: 900, sibling: true, parents: [{ data: { id: "q" } }] as unknown[] }];

  it("solo hay hermanos para comprimir si se pidieron", () => {
    expect(shownSiblings(yo, todos(), emptyExpanded())).toEqual([]);
    const e = emptyExpanded();
    e.sibs.add("yo");
    expect(shownSiblings(yo, todos(), e).map((n) => n.data.id)).toEqual(["a", "b"]);
  });

  it("sin padres a la vista no hay nada que comprimir", () => {
    const e = emptyExpanded();
    e.sibs.add("solo");
    expect(shownSiblings({ ...yo, data: { id: "solo" }, parents: [] }, todos(), e)).toEqual([]);
  });

  it("comprimir cierra a los hermanos y lo abierto en ellos, y no toca lo demás", () => {
    const e = emptyExpanded();
    ["yo", "a"].forEach((i) => e.sibs.add(i));
    e.partners.add("a");
    e.kids.add("a");
    e.spousesUp.add("esposa-a");
    e.up.add("yo");
    const sibs = [hno("a", 280, { spouses: [{ data: { id: "esposa-a" } }] })];
    collapseSiblings(e, "yo", sibs);
    expect([...e.sibs]).toEqual([]);
    expect([...e.partners, ...e.kids, ...e.spousesUp]).toEqual([]);
    expect(e.up.has("yo")).toBe(true); // sus propios padres siguen abiertos
  });

  it("los hermanos van del lado en que están", () => {
    expect(siblingsSide(yo, [hno("a", 280), hno("b", 560)])).toBe("right");
    expect(siblingsSide({ x: 600 }, [hno("a", 280), hno("b", 0)])).toBe("left");
  });
});
