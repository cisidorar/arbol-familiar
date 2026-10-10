import { describe, expect, it } from "vitest";
import {
  allRelativesDisplayed,
  byBirth,
  layoutAncestry,
  tightenCouples,
  treeDimensions,
  type LayoutDatum,
  type LayoutNode,
} from "../tree-layout";

const S = 280;

/** Arma una familia de prueba y el árbol tal como lo entregaría family-chart. */
function family() {
  const byId = new Map<string, LayoutDatum>();
  const person = (id: string, gender: "M" | "F", parents: string[] = [], birth_year: number | null = null) => {
    const datum: LayoutDatum = { id, data: { gender, birth_year }, rels: { parents, spouses: [], children: [] } };
    byId.set(id, datum);
    for (const p of parents) byId.get(p)!.rels.children!.push(id);
    return datum;
  };
  const couple = (a: string, b: string) => {
    byId.get(a)!.rels.spouses!.push(b);
    byId.get(b)!.rels.spouses!.push(a);
  };
  const nodes: LayoutNode[] = [];
  const show = (id: string, x: number, depth: number, parents: LayoutNode[] = []): LayoutNode => {
    const node: LayoutNode = { data: byId.get(id)!, x, y: -depth * 150, depth, is_ancestry: depth > 0, tid: id };
    if (parents.length) node.parents = parents;
    nodes.push(node);
    return node;
  };
  return { byId, person, couple, nodes, show };
}

/** Tronco con padres y los cuatro abuelos; tíos, hermanos y un medio tío fuera de pantalla. */
function threeGenerations() {
  const f = family();
  f.person("abuelo", "M");
  f.person("abuela", "F");
  f.person("abuelo2", "M");
  f.person("abuela2", "F");
  f.couple("abuelo", "abuela");
  f.couple("abuelo2", "abuela2");
  f.person("tio1", "M", ["abuelo", "abuela"], 1900);
  f.person("papa", "M", ["abuelo", "abuela"], 1905);
  f.person("tia2", "F", ["abuelo", "abuela"], 1895);
  f.person("mama", "F", ["abuelo2", "abuela2"], 1910);
  f.person("tia3", "F", ["abuelo2", "abuela2"]);
  f.person("mediotio", "M", ["abuela2"], 1899);
  f.couple("papa", "mama");
  f.person("yo", "M", ["papa", "mama"], 1935);
  f.person("hermana", "F", ["papa", "mama"], 1930);
  f.person("pareja", "F");
  f.couple("yo", "pareja");

  // Posiciones como las deja la librería: parejas pegadas, centradas.
  const trunk = f.show("yo", -S / 2, 0);
  const spouse: LayoutNode = { data: f.byId.get("pareja")!, x: S / 2, y: 0, depth: 0, spouse: trunk, tid: "pareja" };
  trunk.spouses = [spouse];
  const abuelo = f.show("abuelo", -1.5 * S, 2);
  const abuela = f.show("abuela", -0.5 * S, 2);
  const abuelo2 = f.show("abuelo2", 0.5 * S, 2);
  const abuela2 = f.show("abuela2", 1.5 * S, 2);
  const papa = f.show("papa", -S / 2, 1, [abuelo, abuela]);
  const mama = f.show("mama", S / 2, 1, [abuelo2, abuela2]);
  trunk.parents = [papa, mama];
  f.nodes.push(spouse);
  return { ...f, trunk, spouse, papa, mama, abuelo, abuela, abuelo2, abuela2 };
}

const overlapping = (nodes: LayoutNode[]) => {
  const out: string[] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (nodes[i].y === nodes[j].y && Math.abs(nodes[i].x - nodes[j].x) < S - 0.001) {
        out.push(`${nodes[i].data.id}/${nodes[j].data.id}`);
      }
    }
  }
  return out;
};

const xOf = (nodes: LayoutNode[], id: string) => nodes.find((n) => n.data.id === id)!.x;

describe("layoutAncestry", () => {
  it("sin hermanos abiertos deja a los ancestros donde los puso la librería", () => {
    const t = threeGenerations();
    const before = t.nodes.map((n) => [n.data.id, n.x]);
    const added = layoutAncestry(t.nodes, { byId: t.byId, sibsOpen: new Set(), separation: S });
    expect(added).toEqual([]);
    expect(t.nodes.map((n) => [n.data.id, n.x])).toEqual(before);
  });

  it("no mueve al tronco ni a su pareja, y los padres siguen centrados en el mismo punto", () => {
    const t = threeGenerations();
    layoutAncestry(t.nodes, { byId: t.byId, sibsOpen: new Set(["yo", "papa", "mama"]), separation: S });
    expect(t.trunk.x).toBe(-S / 2);
    expect(t.spouse.x).toBe(S / 2);
    expect((t.papa.x + t.mama.x) / 2).toBe(0);
    expect(t.mama.x - t.papa.x).toBe(S);
  });

  it("pone a los hermanos al lado de su hermano, hacia afuera de la pareja, por año de nacimiento", () => {
    const t = threeGenerations();
    const added = layoutAncestry(t.nodes, { byId: t.byId, sibsOpen: new Set(["papa", "mama"]), separation: S });
    expect(added.map((n) => n.data.id).sort()).toEqual(["mediotio", "tia2", "tia3", "tio1"]);
    // papá es el de la izquierda: sus hermanos van a su izquierda, el mayor más lejos
    expect(xOf(t.nodes, "tia2")).toBe(t.papa.x - 2 * S);
    expect(xOf(t.nodes, "tio1")).toBe(t.papa.x - S);
    // mamá es la de la derecha: los suyos a su derecha, sin año al final
    expect(xOf(t.nodes, "mediotio")).toBe(t.mama.x + S);
    expect(xOf(t.nodes, "tia3")).toBe(t.mama.x + 2 * S);
    for (const n of added) expect(n.y).toBe(t.papa.y);
  });

  it("los hermanos del tronco van del lado contrario a su pareja", () => {
    const t = threeGenerations();
    const added = layoutAncestry(t.nodes, { byId: t.byId, sibsOpen: new Set(["yo"]), separation: S });
    expect(added.map((n) => n.data.id)).toEqual(["hermana"]);
    expect(added[0].x).toBe(t.trunk.x - S);
    expect(added[0].y).toBe(t.trunk.y);
  });

  it("abre espacio: ninguna tarjeta queda encima de otra", () => {
    const t = threeGenerations();
    layoutAncestry(t.nodes, { byId: t.byId, sibsOpen: new Set(["yo", "papa", "mama"]), separation: S });
    expect(overlapping(t.nodes)).toEqual([]);
  });

  it("cada hermano queda unido a los padres que comparte (un medio hermano, solo a uno)", () => {
    const t = threeGenerations();
    const added = layoutAncestry(t.nodes, { byId: t.byId, sibsOpen: new Set(["mama"]), separation: S });
    const parentsOf = (id: string) => added.find((n) => n.data.id === id)!.parents!.map((p) => p.data.id).sort();
    expect(parentsOf("tia3")).toEqual(["abuela2", "abuelo2"]);
    expect(parentsOf("mediotio")).toEqual(["abuela2"]);
  });

  it("las parejas de ancestros siguen pegadas aunque tengan hermanos", () => {
    const t = threeGenerations();
    layoutAncestry(t.nodes, { byId: t.byId, sibsOpen: new Set(["papa", "mama"]), separation: S });
    expect(t.abuela.x - t.abuelo.x).toBe(S);
    expect(t.abuela2.x - t.abuelo2.x).toBe(S);
  });

  it("no repite a una persona que ya está en pantalla", () => {
    const t = threeGenerations();
    // la hermana del tronco ya aparece en otra parte del árbol
    t.nodes.push({ data: t.byId.get("hermana")!, x: 5 * S, y: 150, depth: 1, tid: "hermana" });
    const added = layoutAncestry(t.nodes, { byId: t.byId, sibsOpen: new Set(["yo"]), separation: S });
    expect(added).toEqual([]);
  });

  it("ignora hermanos pedidos de alguien cuyos padres no están en pantalla", () => {
    const t = threeGenerations();
    const added = layoutAncestry(t.nodes, { byId: t.byId, sibsOpen: new Set(["abuelo"]), separation: S });
    expect(added).toEqual([]);
  });

  it("con un solo padre conocido, queda sobre el hijo", () => {
    const f = family();
    f.person("madre", "F");
    f.person("yo", "M", ["madre"]);
    f.person("hermano", "M", ["madre"]);
    const trunk = f.show("yo", 100, 0);
    const madre = f.show("madre", 100, 1);
    trunk.parents = [madre];
    const added = layoutAncestry(f.nodes, { byId: f.byId, sibsOpen: new Set(["yo"]), separation: S });
    expect(madre.x).toBe(100);
    expect(added.map((n) => [n.data.id, n.x])).toEqual([["hermano", 100 - S]]);
  });
});

describe("layoutAncestry: parejas de los hermanos", () => {
  /** Tres generaciones, con pareja para dos tíos y para la hermana del tronco. */
  function withPartners() {
    const t = threeGenerations();
    t.person("esposa-tio1", "F");
    t.couple("tio1", "esposa-tio1");
    t.person("esposo-tia2", "M");
    t.couple("tia2", "esposo-tia2");
    t.person("esposo-tia2-b", "M");
    t.couple("tia2", "esposo-tia2-b");
    t.person("cunado", "M");
    t.couple("hermana", "cunado");
    return t;
  }
  const sibs = new Set(["yo", "papa", "mama"]);
  const node = (nodes: LayoutNode[], id: string) => nodes.find((n) => n.data.id === id)!;

  it("sin pedirlas, las parejas de los hermanos no aparecen", () => {
    const t = withPartners();
    const added = layoutAncestry(t.nodes, { byId: t.byId, sibsOpen: sibs, separation: S });
    expect(added.map((n) => n.data.id)).not.toContain("esposa-tio1");
    expect(added.every((n) => !n.spouses)).toBe(true);
  });

  it("muestra a la pareja pegada al hermano, en su misma fila, sin encimar nada", () => {
    const t = withPartners();
    layoutAncestry(t.nodes, { byId: t.byId, sibsOpen: sibs, partnersOpen: new Set(["tio1"]), separation: S });
    const tio = node(t.nodes, "tio1");
    const esposa = node(t.nodes, "esposa-tio1");
    expect(esposa.y).toBe(tio.y);
    expect(esposa.x - tio.x).toBeCloseTo(S, 6); // el hombre a la izquierda
    expect(overlapping(t.nodes)).toEqual([]);
  });

  it("queda enlazada como pareja (para que se dibuje la línea) y no como hermana", () => {
    const t = withPartners();
    layoutAncestry(t.nodes, { byId: t.byId, sibsOpen: sibs, partnersOpen: new Set(["tio1"]), separation: S });
    const tio = node(t.nodes, "tio1");
    const esposa = node(t.nodes, "esposa-tio1");
    expect(tio.spouses).toEqual([esposa]);
    expect(esposa.spouse).toBe(tio);
    expect(esposa.sibling).toBeUndefined();
    expect(esposa.parents).toBeUndefined();
  });

  it("una hermana con dos parejas: ellos a su izquierda, todos seguidos", () => {
    const t = withPartners();
    layoutAncestry(t.nodes, { byId: t.byId, sibsOpen: sibs, partnersOpen: new Set(["tia2"]), separation: S });
    const tia = xOf(t.nodes, "tia2");
    expect(tia - xOf(t.nodes, "esposo-tia2-b")).toBeCloseTo(S, 6);
    expect(tia - xOf(t.nodes, "esposo-tia2")).toBeCloseTo(2 * S, 6);
    expect(overlapping(t.nodes)).toEqual([]);
  });

  it("abrir parejas no desarma a las parejas de ancestros ni mueve al tronco", () => {
    const t = withPartners();
    const trunkX = t.trunk.x;
    layoutAncestry(t.nodes, {
      byId: t.byId,
      sibsOpen: sibs,
      partnersOpen: new Set(["tio1", "tia2", "tia3", "hermana"]),
      separation: S,
    });
    expect(t.trunk.x).toBe(trunkX);
    expect(t.mama.x - t.papa.x).toBeCloseTo(S, 6);
    expect(t.abuela.x - t.abuelo.x).toBeCloseTo(S, 6);
    expect(overlapping(t.nodes)).toEqual([]);
    // La hermana del tronco también puede mostrar a su pareja.
    expect(Math.abs(xOf(t.nodes, "hermana") - xOf(t.nodes, "cunado"))).toBeCloseTo(S, 6);
  });

  it("no repite a una pareja que ya está en pantalla", () => {
    const t = withPartners();
    // tio1 se casó con tia3 (hermana de la mamá): ya aparece como hermana.
    t.couple("tio1", "tia3");
    layoutAncestry(t.nodes, { byId: t.byId, sibsOpen: sibs, partnersOpen: new Set(["tio1"]), separation: S });
    expect(t.nodes.filter((n) => n.data.id === "tia3")).toHaveLength(1);
    expect(node(t.nodes, "tio1").spouses!.map((n) => n.data.id)).toEqual(["esposa-tio1"]);
    expect(overlapping(t.nodes)).toEqual([]);
  });

  it("ignora la pareja pedida de alguien que no es un hermano en pantalla", () => {
    const t = withPartners();
    const added = layoutAncestry(t.nodes, { byId: t.byId, sibsOpen: new Set(), partnersOpen: new Set(["tio1"]), separation: S });
    expect(added).toEqual([]);
  });
});

describe("layoutAncestry: padres de la pareja de alguien de la línea directa", () => {
  /** Tres generaciones, más los dos padres conocidos de la pareja del tronco. */
  function withSpouseParents() {
    const t = threeGenerations();
    t.person("suegro", "M");
    t.person("suegra", "F");
    t.couple("suegro", "suegra");
    t.byId.get("pareja")!.rels.parents = ["suegro", "suegra"];
    t.byId.get("suegro")!.rels.children = ["pareja"];
    t.byId.get("suegra")!.rels.children = ["pareja"];
    return t;
  }
  const sibs = new Set(["yo", "papa", "mama"]);
  const node = (nodes: LayoutNode[], id: string) => nodes.find((n) => n.data.id === id)!;

  it("sin pedirlos, los padres de la pareja no aparecen", () => {
    const t = withSpouseParents();
    const added = layoutAncestry(t.nodes, { byId: t.byId, sibsOpen: sibs, separation: S });
    expect(added.map((n) => n.data.id)).not.toContain("suegro");
  });

  it("al pedirlos, aparecen al lado de la pareja, sin mover al tronco ni superponerse a nada", () => {
    const t = withSpouseParents();
    const trunkX = t.trunk.x;
    const spouseX = t.spouse.x;
    const added = layoutAncestry(t.nodes, {
      byId: t.byId,
      sibsOpen: new Set(),
      spousesUpOpen: new Set(["pareja"]),
      separation: S,
    });
    expect(added.map((n) => n.data.id).sort()).toEqual(["suegra", "suegro"]);
    expect(t.trunk.x).toBe(trunkX);
    expect(t.spouse.x).toBe(spouseX);
    // Misma fila que los abuelos del tronco (una generación arriba de la pareja).
    expect(node(t.nodes, "suegro").y).toBe(t.papa.y);
    expect(node(t.nodes, "suegra").y).toBe(t.papa.y);
    expect(overlapping(t.nodes)).toEqual([]);
  });

  it("quedan enlazados como pareja, y la tarjeta de ella apunta a ellos como sus padres", () => {
    const t = withSpouseParents();
    layoutAncestry(t.nodes, { byId: t.byId, sibsOpen: sibs, spousesUpOpen: new Set(["pareja"]), separation: S });
    const suegro = node(t.nodes, "suegro");
    const suegra = node(t.nodes, "suegra");
    expect(suegro.spouses).toEqual([suegra]);
    expect(suegra.spouse).toBe(suegro);
    expect(t.spouse.parents).toEqual([suegro, suegra]);
  });

  it("ignora el pedido de alguien que no es pareja del tronco en pantalla", () => {
    const t = withSpouseParents();
    const added = layoutAncestry(t.nodes, {
      byId: t.byId,
      sibsOpen: sibs,
      spousesUpOpen: new Set(["no-es-la-pareja"]),
      separation: S,
    });
    expect(added.map((n) => n.data.id)).not.toContain("suegro");
  });

  it("sin padres conocidos, no agrega nada", () => {
    const t = threeGenerations(); // "pareja" sin padres cargados
    const added = layoutAncestry(t.nodes, {
      byId: t.byId,
      sibsOpen: new Set(),
      spousesUpOpen: new Set(["pareja"]),
      separation: S,
    });
    expect(added).toEqual([]);
  });

  it("también funciona para la pareja de un hermano, no solo la del tronco", () => {
    const t = threeGenerations();
    t.person("cunado", "M");
    t.person("suegro-h", "M");
    t.person("suegra-h", "F");
    t.couple("suegro-h", "suegra-h");
    t.couple("hermana", "cunado");
    t.byId.get("cunado")!.rels.parents = ["suegro-h", "suegra-h"];
    t.byId.get("suegro-h")!.rels.children = ["cunado"];
    t.byId.get("suegra-h")!.rels.children = ["cunado"];

    const added = layoutAncestry(t.nodes, {
      byId: t.byId,
      sibsOpen: new Set(["yo"]),
      partnersOpen: new Set(["hermana"]),
      spousesUpOpen: new Set(["cunado"]),
      separation: S,
      levelSeparation: 150,
    });
    const node = (id: string) => t.nodes.find((n) => n.data.id === id)!;
    expect(added.map((n) => n.data.id)).toEqual(expect.arrayContaining(["suegro-h", "suegra-h"]));
    const cunado = node("cunado");
    const suegroH = node("suegro-h");
    const suegraH = node("suegra-h");
    // Una generación arriba de donde está el cuñado (no hay fila de sus
    // propios padres de qué tomarla: se calcula con levelSeparation).
    expect(suegroH.y).toBe(cunado.y - 150);
    expect(suegraH.y).toBe(cunado.y - 150);
    expect(cunado.parents).toEqual([suegroH, suegraH]);
    expect(overlapping(t.nodes)).toEqual([]);
  });

  it("una vez agregada, el lado 'de sangre' de esa pareja (no solo el que la pidió) puede abrir sus propios padres", () => {
    // Caso real: María Teresa muestra a sus padres (Luis Humberto + Juana);
    // al tocar de nuevo a Luis Humberto (el lado "de sangre" de esa pareja,
    // no el que pidió mostrarla), sus propios padres se agregan a su lado,
    // sin cargar un árbol nuevo centrado en él.
    const t = threeGenerations();
    t.person("cunado", "M");
    t.person("suegro-h", "M");
    t.person("suegra-h", "F");
    t.person("bisabuelo-h", "M");
    t.person("bisabuela-h", "F");
    t.couple("suegro-h", "suegra-h");
    t.couple("bisabuelo-h", "bisabuela-h");
    t.couple("hermana", "cunado");
    t.byId.get("cunado")!.rels.parents = ["suegro-h", "suegra-h"];
    t.byId.get("suegro-h")!.rels.children = ["cunado"];
    t.byId.get("suegra-h")!.rels.children = ["cunado"];
    t.byId.get("suegro-h")!.rels.parents = ["bisabuelo-h", "bisabuela-h"];
    t.byId.get("bisabuelo-h")!.rels.children = ["suegro-h"];
    t.byId.get("bisabuela-h")!.rels.children = ["suegro-h"];

    // Primer clic: aparece el cuñado con sus padres (suegro-h/suegra-h).
    layoutAncestry(t.nodes, {
      byId: t.byId,
      sibsOpen: new Set(["yo"]),
      partnersOpen: new Set(["hermana"]),
      spousesUpOpen: new Set(["cunado"]),
      separation: S,
      levelSeparation: 150,
    });
    const node = (id: string) => t.nodes.find((n) => n.data.id === id)!;
    const suegroH = node("suegro-h");
    expect(suegroH.spouses).toEqual([node("suegra-h")]);
    expect(suegroH.spouse).toBeUndefined(); // es el lado "de sangre", no tiene `.spouse`

    // Segundo clic, en suegro-h: aparecen sus propios padres.
    const added2 = layoutAncestry(t.nodes, {
      byId: t.byId,
      sibsOpen: new Set(["yo"]),
      partnersOpen: new Set(["hermana"]),
      spousesUpOpen: new Set(["cunado", "suegro-h"]),
      separation: S,
      levelSeparation: 150,
    });
    expect(added2.map((n) => n.data.id).sort()).toEqual(["bisabuela-h", "bisabuelo-h"]);
    expect(suegroH.parents).toEqual([node("bisabuelo-h"), node("bisabuela-h")]);
    expect(overlapping(t.nodes)).toEqual([]);
  });
});

describe("layoutAncestry: hermanos de alguien fuera de la línea directa", () => {
  /** La pareja del tronco, con sus padres (y una hermana suya) cargados. */
  function withSpouseSiblings() {
    const t = threeGenerations();
    t.person("suegro", "M");
    t.person("suegra", "F");
    t.couple("suegro", "suegra");
    t.person("cuñada", "F", ["suegro", "suegra"], 1920);
    t.byId.get("pareja")!.rels.parents = ["suegro", "suegra"];
    t.byId.get("suegro")!.rels.children = ["pareja", "cuñada"];
    t.byId.get("suegra")!.rels.children = ["pareja", "cuñada"];
    return t;
  }
  const node = (nodes: LayoutNode[], id: string) => nodes.find((n) => n.data.id === id)!;

  it("sin pedirlos, los hermanos de la pareja no aparecen aunque sus padres ya se vean", () => {
    const t = withSpouseSiblings();
    const added = layoutAncestry(t.nodes, {
      byId: t.byId,
      sibsOpen: new Set(),
      spousesUpOpen: new Set(["pareja"]),
      separation: S,
    });
    expect(added.map((n) => n.data.id)).not.toContain("cuñada");
  });

  it("al pedirlos (una vez que ya se ven sus padres), aparecen a su lado sin centrar ni superponerse", () => {
    const t = withSpouseSiblings();
    const trunkX = t.trunk.x;
    const added = layoutAncestry(t.nodes, {
      byId: t.byId,
      sibsOpen: new Set(["pareja"]),
      spousesUpOpen: new Set(["pareja"]),
      separation: S,
    });
    expect(added.map((n) => n.data.id)).toEqual(expect.arrayContaining(["suegro", "suegra", "cuñada"]));
    expect(t.trunk.x).toBe(trunkX);
    const pareja = node(t.nodes, "pareja");
    const cuñada = node(t.nodes, "cuñada");
    expect(cuñada.y).toBe(pareja.y);
    expect(overlapping(t.nodes)).toEqual([]);
  });

  it("ignora el pedido de alguien cuyos padres todavía no están a la vista", () => {
    const t = withSpouseSiblings();
    const added = layoutAncestry(t.nodes, {
      byId: t.byId,
      sibsOpen: new Set(["pareja"]), // sin spousesUpOpen: sus padres no se agregan
      separation: S,
    });
    expect(added.map((n) => n.data.id)).not.toContain("cuñada");
  });

  it("no repite a alguien que ya está en pantalla", () => {
    const t = withSpouseSiblings();
    t.nodes.push({ data: t.byId.get("cuñada")!, x: 9 * S, y: 999, depth: 1, tid: "cuñada" });
    const added = layoutAncestry(t.nodes, {
      byId: t.byId,
      sibsOpen: new Set(["pareja"]),
      spousesUpOpen: new Set(["pareja"]),
      separation: S,
    });
    expect(t.nodes.filter((n) => n.data.id === "cuñada")).toHaveLength(1);
    expect(added.map((n) => n.data.id)).not.toContain("cuñada");
  });
});

describe("layoutAncestry con árboles grandes", () => {
  // Generador determinista, para que una falla se pueda repetir.
  const random = (seed: number) => () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  /** Ancestros hasta `generations`, con padres faltantes (pocos si `dense`)
   *  y familias de hasta 9 hijos al azar. */
  function bigTree(seed: number, generations: number, dense = false) {
    const rnd = random(seed);
    const f = family();
    let counter = 0;
    const open = new Set<string>();
    const openPartners = new Set<string>();
    const grow = (childId: string, child: LayoutNode, depth: number, x: number, spread: number) => {
      if (depth > generations) return;
      // Los primeros niveles siempre completos, para que haya árbol.
      const have = depth <= 2 ? 1 : rnd();
      const parentIds: string[] = [];
      if (have > (dense ? 0.01 : 0.1)) parentIds.push(`p${counter++}`);
      if (have > (dense ? 0.03 : 0.25)) parentIds.push(`p${counter++}`);
      if (!parentIds.length) return;
      parentIds.forEach((id, i) => f.person(id, parentIds.length === 2 && i === 1 ? "F" : rnd() > 0.5 ? "M" : "F"));
      if (parentIds.length === 2) f.couple(parentIds[0], parentIds[1]);
      f.byId.get(childId)!.rels.parents = parentIds;
      for (const id of parentIds) f.byId.get(id)!.rels.children!.push(childId);
      const siblings = Math.floor(rnd() * 9);
      for (let i = 0; i < siblings; i++) {
        const id = `s${counter++}`;
        f.person(id, rnd() > 0.5 ? "M" : "F", parentIds, 1800 + Math.floor(rnd() * 100));
        // Algunos hermanos con una o dos parejas, y su pareja abierta.
        const partners = rnd() > 0.6 ? (rnd() > 0.8 ? 2 : 1) : 0;
        for (let k = 0; k < partners; k++) {
          const partnerId = `c${counter++}`;
          f.person(partnerId, rnd() > 0.5 ? "M" : "F");
          f.couple(id, partnerId);
        }
        if (partners && rnd() > 0.3) openPartners.add(id);
      }
      if (rnd() > 0.3) open.add(childId);
      const parents = parentIds.map((id, i) => f.show(id, x + (i === 0 ? -1 : 1) * spread, depth));
      child.parents = parents;
      parents.forEach((p, i) => grow(parentIds[i], p, depth + 1, p.x, spread / 2));
    };
    f.person("yo", "M");
    const trunk = f.show("yo", 0, 0);
    grow("yo", trunk, 1, 0, 2 ** generations * S);
    return { ...f, trunk, open, openPartners };
  }

  it.each([1, 2, 3, 4, 5, 6, 7, 8])("semilla %i: nada se encima y las parejas quedan pegadas", (seed) => {
    const t = bigTree(seed, 7);
    const added = layoutAncestry(t.nodes, {
      byId: t.byId,
      sibsOpen: t.open,
      partnersOpen: t.openPartners,
      separation: S,
    });
    expect(overlapping(t.nodes)).toEqual([]);
    for (const n of t.nodes) {
      if (n.parents?.length === 2 && !n.sibling) {
        expect(Math.abs(n.parents[0].x - n.parents[1].x)).toBeCloseTo(S, 6);
      }
      // Cada pareja de un hermano queda en su fila, a no más de dos puestos.
      for (const partner of n.sibling ? n.spouses ?? [] : []) {
        expect(partner.y).toBe(n.y);
        expect(Math.abs(partner.x - n.x)).toBeLessThanOrEqual(2 * S + 0.001);
      }
    }
    expect(added.some((n) => n.spouse)).toBe(true);
    expect(new Set(t.nodes.map((n) => n.data.id)).size).toBe(t.nodes.length);
    expect(added.length).toBeGreaterThan(0);
  });

  it("resuelve un árbol de miles de tarjetas sin demorarse", () => {
    const t = bigTree(11, 10, true);
    const start = performance.now();
    layoutAncestry(t.nodes, { byId: t.byId, sibsOpen: t.open, partnersOpen: t.openPartners, separation: S });
    expect(t.nodes.length).toBeGreaterThan(2000);
    expect(performance.now() - start).toBeLessThan(500);
    expect(new Set(t.nodes.map((n) => n.data.id)).size).toBe(t.nodes.length);
  });
});

describe("allRelativesDisplayed / treeDimensions", () => {
  it("detecta familia inmediata fuera de pantalla", () => {
    const t = threeGenerations();
    const visible = new Set(t.nodes.map((n) => n.data.id));
    expect(allRelativesDisplayed(t.trunk, visible)).toBe(true);
    expect(allRelativesDisplayed(t.papa, visible)).toBe(false); // falta la hermana del tronco
  });

  it("mide el árbol contando las tarjetas agregadas", () => {
    const t = threeGenerations();
    const before = treeDimensions(t.nodes, S, 150);
    layoutAncestry(t.nodes, { byId: t.byId, sibsOpen: new Set(["papa", "mama"]), separation: S });
    const after = treeDimensions(t.nodes, S, 150);
    expect(before.width).toBe(4 * S);
    expect(after.width).toBeGreaterThan(before.width);
    expect(after.height).toBe(before.height);
  });
});

describe("tightenCouples: las parejas quedan juntas", () => {
  const C = 244; // distancia entre las dos tarjetas de una pareja
  const node = (nodes: LayoutNode[], id: string) => nodes.find((n) => n.data.id === id)!;
  const laidOut = (sibs: string[] = [], partners: string[] = []) => {
    const t = threeGenerations();
    layoutAncestry(t.nodes, { byId: t.byId, sibsOpen: new Set(sibs), partnersOpen: new Set(partners), separation: S });
    return t;
  };

  it("junta al tronco con su pareja sin mover el punto medio (de ahí bajan sus hijos)", () => {
    const t = laidOut();
    t.spouse.sx = 0; // como lo deja la librería: el punto medio de la pareja
    tightenCouples(t.nodes, S, C);
    expect(t.spouse.x - t.trunk.x).toBe(C);
    expect((t.spouse.x + t.trunk.x) / 2).toBe(0);
    expect(t.spouse.sx).toBe(0);
  });

  it("junta a cada pareja de ancestros sin mover el punto al que sube la línea de su hijo", () => {
    const t = laidOut();
    const mid = (a: LayoutNode, b: LayoutNode) => (a.x + b.x) / 2;
    const before = [mid(t.papa, t.mama), mid(t.abuelo, t.abuela), mid(t.abuelo2, t.abuela2)];
    tightenCouples(t.nodes, S, C);
    expect(t.mama.x - t.papa.x).toBe(C);
    expect(t.abuela.x - t.abuelo.x).toBe(C);
    expect(t.abuela2.x - t.abuelo2.x).toBe(C);
    expect([mid(t.papa, t.mama), mid(t.abuelo, t.abuela), mid(t.abuelo2, t.abuela2)]).toEqual(before);
  });

  it("los hermanos no se juntan: quedan más lejos de la pareja que la pareja entre sí", () => {
    const t = laidOut(["papa", "mama"]);
    tightenCouples(t.nodes, S, C);
    const row = t.nodes.filter((n) => n.y === t.papa.y).sort((a, b) => a.x - b.x);
    const gaps = row.slice(1).map((n, i) => n.x - row[i].x);
    const coupleIndex = row.indexOf(t.papa);
    gaps.forEach((gap, i) => {
      if (i === coupleIndex) expect(gap).toBe(C);
      else expect(gap).toBeGreaterThanOrEqual(S);
    });
  });

  it("junta también a un hermano con la pareja que se le agregó", () => {
    const t = threeGenerations();
    t.person("cunado", "M");
    t.couple("hermana", "cunado");
    layoutAncestry(t.nodes, {
      byId: t.byId,
      sibsOpen: new Set(["yo"]),
      partnersOpen: new Set(["hermana"]),
      separation: S,
    });
    tightenCouples(t.nodes, S, C);
    expect(Math.abs(node(t.nodes, "hermana").x - node(t.nodes, "cunado").x)).toBe(C);
  });

  it("aplicarlo dos veces no cambia nada", () => {
    const t = laidOut(["yo", "papa", "mama"]);
    tightenCouples(t.nodes, S, C);
    const once = t.nodes.map((n) => n.x);
    tightenCouples(t.nodes, S, C);
    expect(t.nodes.map((n) => n.x)).toEqual(once);
  });

  it("no toca a una pareja que no está lado a lado", () => {
    const t = laidOut();
    t.spouse.x = t.trunk.x + 3 * S;
    const before = [t.trunk.x, t.spouse.x];
    tightenCouples(t.nodes, S, C);
    expect([t.trunk.x, t.spouse.x]).toEqual(before);
  });

  it("con varias parejas, las líneas a los hijos bajan de donde corresponde", () => {
    const t = threeGenerations();
    t.person("otra", "F");
    t.couple("yo", "otra");
    const second: LayoutNode = { data: t.byId.get("otra")!, x: t.spouse.x + S, y: 0, depth: 0, spouse: t.trunk, tid: "otra" };
    t.trunk.spouses!.push(second);
    t.nodes.push(second);
    t.spouse.sx = 0;
    second.sx = second.x;
    tightenCouples(t.nodes, S, C);
    expect(t.spouse.x - t.trunk.x).toBe(C);
    expect(second.x - t.spouse.x).toBe(C);
    expect(t.spouse.sx).toBe((t.trunk.x + t.spouse.x) / 2);
    expect(second.sx).toBe(second.x);
  });
});

describe("layoutAncestry: aire entre familias distintas", () => {
  it("separa a los abuelos paternos de los maternos sin mover a los padres", () => {
    const plain = threeGenerations();
    layoutAncestry(plain.nodes, { byId: plain.byId, sibsOpen: new Set(), separation: S });
    const t = threeGenerations();
    layoutAncestry(t.nodes, { byId: t.byId, sibsOpen: new Set(), separation: S, familyGap: 30 });
    expect([t.papa.x, t.mama.x]).toEqual([plain.papa.x, plain.mama.x]);
    // Abuela paterna y abuelo materno son vecinos sin ser pareja ni hermanos.
    expect(plain.abuelo2.x - plain.abuela.x).toBe(S);
    expect(t.abuelo2.x - t.abuela.x).toBe(S + 60);
    // Las parejas siguen lado a lado.
    expect(t.abuela.x - t.abuelo.x).toBe(S);
    expect(t.abuela2.x - t.abuelo2.x).toBe(S);
    expect(overlapping(t.nodes)).toEqual([]);
  });
});

describe("orden de nacimiento", () => {
  const d = (birth_year: number | null, est_birth_year: number | null = null) => ({ data: { birth_year, est_birth_year } });
  it("ordena del mayor al menor, usando el año estimado si falta el real y dejando al final a quien no se le sabe", () => {
    const list = [
      { n: "concepcion", ...d(1894) },
      { n: "delfin", ...d(1887) },
      { n: "jose", ...d(null, 1892) },
      { n: "antonio", ...d(1893) },
      { n: "florindo", ...d(1889) },
      { n: "santos", ...d(1891) },
      { n: "sin-fecha", ...d(null) },
    ];
    expect([...list].sort(byBirth).map((x) => x.n)).toEqual(["delfin", "florindo", "santos", "jose", "antonio", "concepcion", "sin-fecha"]);
  });
  it("sin ninguna fecha conserva el orden que traían", () => {
    const list = [{ n: "a", ...d(null) }, { n: "b", ...d(null) }, { n: "c", ...d(null) }];
    expect([...list].sort(byBirth).map((x) => x.n)).toEqual(["a", "b", "c"]);
  });
});

describe("hijos de un hermano agregado (kidsOpen)", () => {
  function conHijos() {
    const t = threeGenerations();
    t.person("esposa-tio1", "F");
    t.couple("tio1", "esposa-tio1");
    t.person("prima2", "F", ["tio1", "esposa-tio1"], 1932);
    t.person("prima1", "F", ["tio1", "esposa-tio1"], 1928);
    t.person("primo-solo", "M", ["tio1"], 1940);
    return t;
  }
  const base = (t: ReturnType<typeof conHijos>, kids: string[]) => ({
    byId: t.byId,
    sibsOpen: new Set(["yo", "papa", "mama"]),
    partnersOpen: new Set(["tio1"]),
    kidsOpen: new Set(kids),
    separation: S,
    levelSeparation: 150,
  });
  const at = (nodes: LayoutNode[], id: string) => nodes.find((n) => n.data.id === id)!;

  it("sin pedirlos, no aparecen", () => {
    const t = conHijos();
    layoutAncestry(t.nodes, base(t, []));
    expect(t.nodes.map((n) => n.data.id)).not.toContain("prima1");
  });

  it("aparecen una fila más abajo, del mayor al menor, centrados bajo la pareja", () => {
    const t = conHijos();
    layoutAncestry(t.nodes, base(t, ["tio1"]));
    const tio = at(t.nodes, "tio1");
    const esposa = at(t.nodes, "esposa-tio1");
    const kids = ["prima1", "prima2", "primo-solo"].map((id) => at(t.nodes, id));
    kids.forEach((k) => {
      expect(k.y).toBe(tio.y + 150);
      expect(k.kid).toBe(true);
      expect(k.parents).toBeUndefined();
    });
    // Del mayor al menor dentro de la pareja; el hijo sin madre anotada va aparte (queda del lado del padre,
    // con su línea bajando de él solo) y no se mezcla entre los hijos de la pareja.
    expect(at(t.nodes, "prima1").x).toBeLessThan(at(t.nodes, "prima2").x);
    // Un hermano de un ancestro tiene a sus hijos en la fila del tronco: si
    // el lugar está tomado, se corren hacia afuera y no se encima nada.
    expect(overlapping(t.nodes)).toEqual([]);
    expect(new Set(tio.children)).toEqual(new Set(kids));
    // Los hijos de la pareja bajan de su punto medio; el hijo sin madre anotada, del tío solo.
    expect(at(t.nodes, "prima1").psx).toBeCloseTo((tio.x + esposa.x) / 2, 6);
    expect(at(t.nodes, "primo-solo").psx).toBe(tio.x);
    // De dónde bajan las líneas: el punto medio de la pareja.
    expect(esposa.sx).toBeCloseTo((tio.x + esposa.x) / 2, 6);
    expect(tio.sx).toBe(tio.x);
  });
});
