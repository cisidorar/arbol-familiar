/**
 * Navegación del árbol: qué generaciones se muestran y qué pasa cuando se
 * pide "ver más familia" de una tarjeta.
 *
 * family-chart solo sabe dibujar, a partir del "tronco" (la persona
 * central), sus ancestros directos hacia arriba y sus descendientes con sus
 * cónyuges hacia abajo. Eso deja dos clases de familia oculta:
 *
 *  1. La que ocultamos nosotros para no saturar la pantalla (los padres de
 *     un ancestro en el borde superior, los hijos de un descendiente en el
 *     borde inferior). Se revela abriendo SOLO esa rama, sin mover nada: el
 *     límite de generaciones de la librería es global (abre a todos los de
 *     ese nivel a la vez), por eso no se usa y la poda se hace acá.
 *  2. Los hermanos de la línea directa (los otros hijos de un ancestro). La
 *     librería no los dibuja; los agregamos nosotros al lado de su hermano
 *     (ver tree-layout.ts), también rama por rama.
 *  3. La pareja de uno de esos hermanos: también la agregamos nosotros, a
 *     su lado, al pedirla.
 *  3b. Los padres de una pareja (de cualquiera de la línea directa, no solo
 *      del tronco), o los de uno de los dos lados de una pareja ya agregada
 *      por el punto 3 (p. ej. el padre de alguien, una vez que él y su
 *      esposa están los dos en pantalla): se agregan igual, a su lado, al
 *      pedirlos, en vez de cargar un árbol nuevo centrado en esa persona.
 *  3c. Una vez que los padres de alguien fuera de la línea directa están a
 *      la vista (un hermano agregado, o una pareja con el punto 3b ya
 *      hecho), sus propios hermanos (los otros hijos de esos padres) se
 *      agregan igual, a su lado.
 *  3d. Los hijos de un hermano agregado (con sus parejas ya a la vista): se
 *      agregan igual, en la fila de abajo, bajo la pareja, al pedirlos.
 *  4. La que no se puede dibujar desde este tronco: otra pareja de alguien,
 *     los hijos de los hijos de un hermano, los abuelos (o hermanos) de una
 *     pareja. La única forma de verla es volver a centrar el árbol en esa
 *     persona.
 *
 * Todo en este archivo es puro (sin DOM ni librería) para poder probarlo.
 */

/** Ramas abiertas a mano, por id de persona. */
export interface Expanded {
  /** Personas cuyos padres se muestran aunque estén sobre el límite. */
  up: Set<string>;
  /** Personas cuyos hijos se muestran aunque estén bajo el límite. */
  down: Set<string>;
  /** Personas (de la línea directa, o fuera de ella con sus padres ya a la
   *  vista) cuyos hermanos se muestran a su lado. */
  sibs: Set<string>;
  /** Hermanos cuya pareja se muestra a su lado. */
  partners: Set<string>;
  /** Parejas (de cualquiera de la línea directa) cuyos propios padres se
   *  muestran a su lado, sin centrar el árbol en ellas (ver "spouse-up" más
   *  abajo). */
  spousesUp: Set<string>;
  /** Hermanos agregados (del tronco o de sus ancestros) cuyos hijos se
   *  muestran bajo ellos. */
  kids: Set<string>;
}

export const emptyExpanded = (): Expanded => ({
  up: new Set(),
  down: new Set(),
  sibs: new Set(),
  partners: new Set(),
  spousesUp: new Set(),
  kids: new Set(),
});

/** Nodo de la jerarquía de d3 que family-chart arma antes de posicionar. */
export interface HierarchyNode {
  data: { id: string };
  children?: HierarchyNode[];
}

/**
 * Poda la jerarquía (de ancestros o de descendientes) que family-chart está
 * por dibujar: se ven `defaultDepth` generaciones desde el tronco y, más
 * allá, solo las ramas abiertas a mano. En la jerarquía de ancestros los
 * "children" de un nodo son sus padres.
 */
export function pruneHierarchy(
  root: HierarchyNode,
  defaultDepth: number,
  expandedIds: ReadonlySet<string>,
): void {
  const walk = (node: HierarchyNode, depth: number) => {
    if (!node.children) return;
    if (depth >= defaultDepth && !expandedIds.has(node.data.id)) {
      delete node.children;
      return;
    }
    for (const child of node.children) walk(child, depth + 1);
  };
  walk(root, 0);
}

/**
 * Camino de descendientes desde `trunkId` hasta `viewerId` (ambos incluidos),
 * por el camino más corto. Sirve para "comprimir" el árbol de un ancestro
 * lejano hasta quien mira. Devuelve null si `viewerId` no desciende de él o si
 * está a menos de `minSteps` generaciones (un padre o un abuelo se ven bien con
 * su familia a la vista).
 */
export function lineToViewer(
  rels: ReadonlyMap<string, { children?: string[] }>,
  trunkId: string,
  viewerId: string,
  minSteps = 2,
): string[] | null {
  if (trunkId === viewerId) return null;
  const from = new Map<string, string | null>([[trunkId, null]]);
  const queue = [trunkId];
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    if (id === viewerId) break;
    for (const child of rels.get(id)?.children ?? []) {
      if (!child || from.has(child) || !rels.has(child)) continue;
      from.set(child, id);
      queue.push(child);
    }
  }
  if (!from.has(viewerId)) return null;
  const path: string[] = [];
  for (let at: string | null = viewerId; at; at = from.get(at) ?? null) path.unshift(at);
  return path.length - 1 >= minSteps ? path : null;
}

/**
 * Como `pruneHierarchy` para los descendientes, pero con una "línea" fija
 * (el camino hasta quien mira): de cada persona de la línea solo se ve a su
 * hijo de la línea, sin límite de generaciones, y se acabó la rama en quien
 * mira. Lo demás se abre persona por persona (`expandedIds`): al abrir a
 * alguien de la línea se ven todos sus hijos, con el límite de siempre.
 */
export function pruneToLine(
  root: HierarchyNode,
  defaultDepth: number,
  expandedIds: ReadonlySet<string>,
  line: readonly string[],
): void {
  const onLine = new Set(line);
  const walk = (node: HierarchyNode, depth: number) => {
    if (!node.children) return;
    if (onLine.has(node.data.id) && !expandedIds.has(node.data.id)) {
      const keep = node.children.filter((c) => onLine.has(c.data.id));
      if (keep.length) node.children = keep;
      else delete node.children;
      for (const child of node.children ?? []) walk(child, depth + 1);
      return;
    }
    if (depth >= defaultDepth && !expandedIds.has(node.data.id)) {
      delete node.children;
      return;
    }
    for (const child of node.children) walk(child, depth + 1);
  };
  walk(root, 0);
}

/** Tarjeta del árbol ya calculado, tal como la entrega family-chart. */
export interface NavNode {
  depth: number;
  is_ancestry?: boolean;
  /** Presente cuando la tarjeta es un cónyuge agregado, no línea directa. */
  spouse?: unknown;
  /** Presente cuando la tarjeta es un hermano agregado por tree-layout. */
  sibling?: boolean;
  /** Presente cuando la tarjeta es un hijo de un hermano agregado (los pone
   *  tree-layout bajo su padre): no es de la línea directa y no se despliega
   *  desde acá, solo se puede centrar el árbol en él. */
  kid?: boolean;
  /** Su(s) pareja(s), cuando las tiene (tronco, u otra tarjeta agregada que
   *  sea el lado "de sangre" de una pareja armada por tree-layout). Junto
   *  con `spouse` sirve para saber si tiene algún punto de apoyo desde el
   *  que agregar, a su lado, a sus propios padres. */
  spouses?: unknown[];
  /** En un ancestro, su hijo de la línea directa (la tarjeta de abajo). */
  parent?: { data: { id: string } } | null;
  /** Hay hijos de sus mismos padres (sus hermanos) que todavía no se
   *  muestran. Solo tiene sentido fuera de la línea directa (un hermano
   *  agregado, o la pareja de alguien una vez que se piden sus padres): a
   *  la línea directa ya la cubre la acción "siblings" de más arriba. */
  siblingsHidden?: boolean;
  x?: number;
  data: {
    id: string;
    data?: { gender?: string };
    rels: { parents?: string[]; spouses?: string[]; children?: string[] };
  };
}

export type ExpandAction =
  /** Abrir los padres de esta persona (solo los suyos). */
  | { kind: "up" }
  /** Abrir los hijos de esta persona (solo los suyos). */
  | { kind: "down" }
  /** Mostrar los otros hijos de este ancestro: los hermanos de `of`, que es
   *  su hijo de la línea directa. */
  | { kind: "siblings"; of: string }
  /** Mostrar, a su lado, la pareja de este hermano de la línea directa. */
  | { kind: "partners" }
  /** Mostrar, en la fila de abajo, los hijos de este hermano agregado. */
  | { kind: "kids" }
  /** Mostrar, arriba suyo, a los padres de la pareja de alguien de la línea
   *  directa: sin centrar el árbol en ella, a su lado. */
  | { kind: "spouse-up" }
  /** Solo se puede ver centrando el árbol en esta persona; `hidden` dice
   *  qué parte de su familia falta en pantalla y `partly`, de cuál ya se ve
   *  una parte (para decir "sus otros hijos" y no "sus hijos"). */
  | {
      kind: "recenter";
      hidden: { parents: boolean; children: boolean; spouses: boolean };
      partly: { children: boolean; spouses: boolean };
    }
  /** No hay familia oculta. */
  | { kind: "none" };

export function decideExpand(
  node: NavNode,
  visibleIds: ReadonlySet<string>,
  expanded: Expanded,
): ExpandAction {
  const rels = node.data.rels;
  const id = node.data.id;
  const anyHidden = (ids?: string[]) => (ids ?? []).some((rel) => Boolean(rel) && !visibleIds.has(rel));
  const anyVisible = (ids?: string[]) => (ids ?? []).some((rel) => visibleIds.has(rel));

  const hiddenParents = anyHidden(rels.parents);
  const hiddenChildren = anyHidden(rels.children);
  const hiddenSpouses = anyHidden(rels.spouses);
  // Un ancestro es siempre de la línea directa, tenga los campos que tenga
  // (la librería y tree-layout le ponen a su pareja de ancestro).
  const inDirectLine = Boolean(node.is_ancestry) || (!node.spouse && !node.sibling && !node.kid);
  // Si ya se pidió, no cuenta como algo pendiente (aunque layoutAncestry no
  // haya podido mostrar a nadie, p. ej. porque ya estaban en pantalla). A la
  // línea directa la cubre su propio mecanismo (más abajo).
  const siblingsStillHidden = !inDirectLine && Boolean(node.siblingsHidden) && !expanded.sibs.has(id);
  if (!hiddenParents && !hiddenChildren && !hiddenSpouses && !siblingsStillHidden) return { kind: "none" };

  if (inDirectLine) {
    const isTrunk = node.depth === 0;
    // El `has` evita un clic sin efecto si la rama ya está abierta y aun así
    // falta alguien (un id que apunta a una persona que no está en los datos).
    if ((node.is_ancestry || isTrunk) && hiddenParents && !expanded.up.has(id)) {
      return { kind: "up" };
    }
    if (!node.is_ancestry && hiddenChildren && !expanded.down.has(id)) {
      return { kind: "down" };
    }
    const lineChild = node.parent?.data.id;
    if (node.is_ancestry && hiddenChildren && lineChild && !expanded.sibs.has(lineChild)) {
      return { kind: "siblings", of: lineChild };
    }
  }
  // Un hermano puede mostrar a su pareja ahí mismo; sus hijos, en cambio,
  // no caben en la fila de abajo (es la de la línea directa).
  if (!inDirectLine && node.sibling && hiddenSpouses && !expanded.partners.has(id)) {
    return { kind: "partners" };
  }
  // Alguien fuera de la línea directa con una pareja a su lado (la pareja
  // misma, o el lado "de sangre" de una pareja ya agregada, p. ej. el padre
  // de María Teresa una vez que él y su esposa están los dos en pantalla):
  // sus propios padres sí se pueden agregar, a su lado (ver layoutAncestry),
  // sin centrar el árbol en ella.
  if (!inDirectLine && (node.spouse || node.spouses?.length) && hiddenParents && !expanded.spousesUp.has(id)) {
    return { kind: "spouse-up" };
  }
  // Alguien fuera de la línea directa con sus propios padres ya en pantalla
  // (un hermano agregado, o la pareja de alguien una vez que se piden sus
  // padres): también puede mostrar a sus propios hermanos, a su lado.
  if (siblingsStillHidden) {
    return { kind: "siblings", of: id };
  }
  // Los hijos de un hermano agregado: caben en la fila de abajo, bajo él y
  // su pareja (ver layoutAncestry).
  if (!inDirectLine && node.sibling && !node.spouse && hiddenChildren && !expanded.kids?.has(id)) {
    return { kind: "kids" };
  }
  return {
    kind: "recenter",
    hidden: { parents: hiddenParents, children: hiddenChildren, spouses: hiddenSpouses },
    partly: { children: anyVisible(rels.children), spouses: anyVisible(rels.spouses) },
  };
}

/** Hacia dónde aparece lo que abre una acción: decide dónde va (y hacia
 *  dónde apunta) la flecha de la tarjeta. "recenter" no abre nada en su
 *  lugar: cambia de árbol, y lleva otro ícono. */
export type ExpandDirection = "up" | "down" | "left" | "right" | "recenter";

export function expandDirection(
  action: ExpandAction,
  node: NavNode & { spouse?: unknown; spouses?: unknown[] },
): ExpandDirection | null {
  const female = node.data.data?.gender === "F";
  switch (action.kind) {
    case "up":
    case "spouse-up":
      return "up";
    case "down":
    case "kids":
      return "down";
    case "siblings": {
      // Desde un ancestro: sus otros hijos, en la fila de abajo.
      if (action.of !== node.data.id) return "down";
      // Sus propios hermanos: del lado contrario a su pareja (igual que los
      // ubica layoutAncestry).
      const partner = (node.spouse ?? node.spouses?.[0]) as { x?: number } | undefined;
      if (partner?.x !== undefined && node.x !== undefined) return partner.x > node.x ? "left" : "right";
      return female ? "right" : "left";
    }
    case "partners":
      // En una pareja el hombre va a la izquierda (ver addSiblings).
      return female ? "left" : "right";
    case "recenter":
      return "recenter";
    default:
      return null;
  }
}

/** Una tarjeta con lo mínimo que hace falta para saber qué hermanos tiene a su lado. */
type SiblingCard = { data: { id: string }; x?: number; sibling?: boolean; parents?: unknown[]; spouses?: { data: { id: string } }[] };

/**
 * Los hermanos que esta tarjeta tiene desplegados a su lado: los que
 * `layoutAncestry` agregó (marcados `sibling`) y que comparten sus padres.
 * Sirve para ofrecer "comprimir"; vacío si no se pidieron o no hay.
 */
export function shownSiblings<T extends SiblingCard>(node: T, nodes: readonly T[], expanded: Expanded): T[] {
  const parents = node.parents;
  if (!parents?.length || !expanded.sibs.has(node.data.id)) return [];
  return nodes.filter((n) => n !== node && n.sibling && n.parents?.some((p) => parents.includes(p)));
}

/**
 * Vuelve a ocultar a los hermanos de `id` y todo lo que se hubiera abierto en
 * ellos (su pareja, sus hijos, los padres de su pareja…): al desplegarlos de
 * nuevo vuelven cerrados. Los padres de `id` no se tocan.
 */
export function collapseSiblings(expanded: Expanded, id: string, siblings: readonly SiblingCard[]): void {
  expanded.sibs.delete(id);
  for (const sib of siblings) {
    const own = [sib.data.id, ...(sib.spouses ?? []).map((s) => s.data.id)];
    for (const who of own) {
      expanded.sibs.delete(who);
      expanded.partners.delete(who);
      expanded.spousesUp.delete(who);
      expanded.kids.delete(who);
      expanded.up.delete(who);
      expanded.down.delete(who);
    }
  }
}

/** Del lado de la tarjeta en que están sus hermanos desplegados. */
export function siblingsSide(node: { x?: number }, siblings: readonly { x?: number }[]): "left" | "right" {
  const xs = siblings.map((s) => s.x).filter((x): x is number => typeof x === "number");
  if (!xs.length || node.x === undefined) return "right";
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return mean >= node.x ? "right" : "left";
}
