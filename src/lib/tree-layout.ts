/**
 * Posiciones de la mitad de arriba del árbol (los ancestros del tronco) y
 * de los hermanos de la línea directa.
 *
 * family-chart no dibuja a los hermanos de un ancestro: de cada pareja de
 * ancestros solo muestra al hijo que lleva al tronco. Acá se agregan esas
 * tarjetas y, como ocupan lugar, se recalcula la posición horizontal de
 * todos los ancestros para que nada se encime.
 *
 * Un hermano puede además mostrar a su pareja a su lado (la familia que
 * formó), sin tener que centrar el árbol en él.
 *
 * El reparto es por "cajas": cada ancestro reserva un ancho que alcanza para
 * su fila (él, sus hermanos y las parejas de estos) y para todo lo que tiene
 * arriba. En una pareja
 * las cajas van pegadas, con cada uno en el borde que da a su pareja y sus
 * hermanos hacia afuera. Dos ramas nunca comparten espacio, así que abrir
 * una no puede montarse sobre otra por grande que sea.
 *
 * Todo en este archivo es puro (sin DOM ni librería) para poder probarlo.
 */

export interface LayoutDatum {
  id: string;
  data: { gender?: string; birth_year?: number | null; est_birth_year?: number | null };
  rels: { parents?: string[]; spouses?: string[]; children?: string[] };
}

/** Tarjeta del árbol calculado por family-chart (solo lo que usamos). */
export interface LayoutNode {
  data: LayoutDatum;
  x: number;
  y: number;
  depth: number;
  is_ancestry?: boolean;
  /** Presente en una tarjeta de cónyuge agregada: de quién es pareja. */
  spouse?: LayoutNode;
  sibling?: boolean;
  /** Hijo/a de un hermano agregado (lo pone `kidsOpen`). */
  kid?: boolean;
  /** Sus hijos en pantalla (solo un hermano agregado con `kidsOpen`): de
   *  acá la librería dibuja las líneas hacia ellos. */
  children?: LayoutNode[];
  /** Tarjetas de sus padres, cuando están en pantalla. */
  parents?: LayoutNode[];
  /** Tarjetas de sus parejas (solo en el tronco y sus descendientes). */
  spouses?: LayoutNode[];
  /** En un ancestro, el otro padre del mismo hijo (lo pone la librería). */
  coparent?: LayoutNode;
  /** En una tarjeta de pareja de la librería: de dónde bajan las líneas a
   *  los hijos (el punto medio de la pareja). */
  sx?: number;
  tid?: string;
  /** Desde dónde aparece la tarjeta al animarse. */
  psx?: number;
  psy?: number;
  all_rels_displayed?: boolean;
}

type Side = "L" | "R";

/** Año en que nació, o el estimado (por la edad anotada al morir); null si no se sabe. */
export const birthOrderYear = (d: { birth_year?: number | null; est_birth_year?: number | null }) =>
  d.birth_year ?? d.est_birth_year ?? null;

/** Orden de nacimiento: el mayor primero; a quien no se le sabe el año, al final. */
export const byBirth = (a: { data: Parameters<typeof birthOrderYear>[0] }, b: { data: Parameters<typeof birthOrderYear>[0] }) =>
  (birthOrderYear(a.data) ?? Infinity) - (birthOrderYear(b.data) ?? Infinity) || 0;

/**
 * Orden de los hijos de alguien con varias parejas: primero por pareja (en el orden en que se
 * dibujan a su lado), así cada grupo de hijos queda bajo su madre/padre; dentro de cada pareja,
 * por nacimiento. Los hijos sin la otra pareja anotada van al final.
 */
export function makeChildSort(lookup: (id: string) => LayoutDatum | undefined) {
  return (a: LayoutDatum, b: LayoutDatum) => {
    const pa = a.rels.parents ?? [];
    const pb = b.rels.parents ?? [];
    const shared = pa.find((p) => pb.includes(p) && (lookup(p)?.rels.spouses?.length ?? 0) > 1);
    if (shared) {
      const spouses = lookup(shared)!.rels.spouses ?? [];
      const idx = (ps: string[]) => {
        const other = ps.find((q) => q !== shared);
        const i = other ? spouses.indexOf(other) : -1;
        return i < 0 ? spouses.length : i;
      };
      const d = idx(pa) - idx(pb);
      if (d) return d;
    }
    return byBirth(a, b);
  };
}

/** Un hermano con las parejas suyas que se muestran a su lado. */
type SiblingUnit = { datum: LayoutDatum; partners: LayoutDatum[] };

/**
 * Reubica a los ancestros de `nodes[0]` (el tronco) y agrega a `nodes` las
 * tarjetas de hermanos de quienes estén en `sibsOpen` y, para los hermanos
 * que estén en `partnersOpen`, las de sus parejas. Devuelve las tarjetas
 * agregadas. `separation` es la distancia horizontal entre dos tarjetas.
 */
export function layoutAncestry(
  nodes: LayoutNode[],
  opts: {
    byId: ReadonlyMap<string, LayoutDatum>;
    sibsOpen: ReadonlySet<string>;
    /** Hermanos (por id) cuya pareja se muestra a su lado. */
    partnersOpen?: ReadonlySet<string>;
    /** Parejas de alguien de la línea directa (por id) cuyos propios padres
     *  se agregan a su lado. */
    spousesUpOpen?: ReadonlySet<string>;
    /** Hermanos agregados (por id) cuyos hijos se muestran en la fila de abajo. */
    kidsOpen?: ReadonlySet<string>;
    separation: number;
    /** Aire extra del lado de afuera de cada rama de ancestros, para que dos
     *  familias distintas que quedan vecinas en una fila no parezcan una
     *  sola fila de hermanos. */
    familyGap?: number;
    /** Distancia vertical entre generaciones: para ubicar, arriba de una
     *  pareja agregada así, la fila de sus padres (que la librería no
     *  calculó). */
    levelSeparation?: number;
  },
): LayoutNode[] {
  const trunk = nodes[0];
  if (!trunk) return [];
  const S = opts.separation;
  const half = S / 2;

  // Primero se fija todo lo que depende de las posiciones que dejó la
  // librería (el orden de cada pareja) y quiénes son los hermanos de cada
  // uno, antes de mover nada. Una persona se dibuja una sola vez: si ya está
  // en pantalla (o ya la tomó otra rama) no se repite como hermano.
  const visible = new Set(nodes.map((n) => n.data.id));
  const parentsOf = new Map<LayoutNode, LayoutNode[]>();
  const siblingsOf = new Map<LayoutNode, SiblingUnit[]>();
  const line: LayoutNode[] = [];
  const seen = new Set<LayoutNode>();
  const queue = [trunk];
  while (queue.length) {
    const node = queue.shift()!;
    if (seen.has(node)) continue;
    seen.add(node);
    line.push(node);
    const parents = [...(node.parents ?? [])].sort((a, b) => a.x - b.x);
    parentsOf.set(node, parents);
    queue.push(...parents);
  }
  for (const node of line) {
    const parents = parentsOf.get(node)!;
    // La línea entre una pareja de ancestros sale del enlace `coparent` que
    // les pone la librería: se asegura acá por si no quedó armado. (No se
    // usa `spouse`/`spouses`: eso marca a la pareja agregada de alguien, que
    // se navega distinto que un ancestro.)
    if (parents.length === 2) {
      parents[0].coparent ??= parents[1];
      parents[1].coparent ??= parents[0];
    }
    const found: LayoutDatum[] = [];
    if (parents.length && opts.sibsOpen.has(node.data.id)) {
      for (const parent of parents) {
        for (const childId of parent.data.rels.children ?? []) {
          const datum = opts.byId.get(childId);
          if (!datum || visible.has(childId)) continue;
          visible.add(childId);
          found.push(datum);
        }
      }
      found.sort(byBirth);
    }
    siblingsOf.set(node, found.map((datum) => ({ datum, partners: [] })));
  }
  // Las parejas se buscan después de saber quiénes son todos los hermanos:
  // así, si la pareja de uno ya está en pantalla por otro lado, no se repite.
  for (const units of siblingsOf.values()) {
    for (const unit of units) {
      if (!opts.partnersOpen?.has(unit.datum.id)) continue;
      for (const partnerId of unit.datum.rels.spouses ?? []) {
        const partner = opts.byId.get(partnerId);
        if (!partner || visible.has(partnerId)) continue;
        visible.add(partnerId);
        unit.partners.push(partner);
      }
    }
  }
  // Tarjetas que ocupa una fila de hermanos (cada uno con sus parejas).
  const slots = (units: SiblingUnit[]) => units.reduce((sum, u) => sum + 1 + u.partners.length, 0);

  const widths = new Map<LayoutNode, number>();
  const width = (node: LayoutNode): number => {
    const known = widths.get(node);
    if (known !== undefined) return known;
    // El aire extra queda del lado de afuera: cada uno va pegado al borde
    // de su caja que da a su pareja, y sus hermanos se abren hacia el otro.
    const row = (1 + slots(siblingsOf.get(node)!)) * S + (opts.familyGap ?? 0);
    const above = parentsOf.get(node)!.reduce((sum, p) => sum + width(p), 0);
    const w = Math.max(row, above);
    widths.set(node, w);
    return w;
  };

  // Hombre a la izquierda de la pareja y mujer a la derecha, como los deja
  // la librería; con un solo padre conocido, el lado lo decide su género.
  const sideOf = (node: LayoutNode, index: number, count: number): Side => {
    if (count > 1) return index === 0 ? "L" : "R";
    return node.data.data.gender === "F" ? "R" : "L";
  };

  const added: LayoutNode[] = [];
  const addSiblings = (node: LayoutNode, side: Side, edge: number) => {
    const units = siblingsOf.get(node)!;
    // Igual que los hermanos del tronco que arma la librería: fuera de la
    // numeración de generaciones, para que no se tomen por el tronco.
    const depth = node.depth === 0 ? -1 : node.depth;
    // La fila se llena de izquierda a derecha, de mayor a menor, pegada a
    // `edge` por el lado que corresponda.
    let x = side === "L" ? edge - S * slots(units) : edge + S;
    for (const { datum, partners } of units) {
      // Dentro de cada pareja, el hombre a la izquierda como en el resto del árbol.
      const siblingFirst = datum.data.gender !== "F";
      const siblingX = siblingFirst ? x : x + S * partners.length;
      const sibling: LayoutNode = {
        data: datum,
        sibling: true,
        depth,
        x: siblingX,
        y: node.y,
        parents: (node.parents ?? []).filter((p) => (datum.rels.parents ?? []).includes(p.data.id)),
        psx: node.x,
        psy: node.y,
        tid: datum.id,
      };
      added.push(sibling);
      if (partners.length) {
        // `spouses` hace que la librería dibuje la línea que une a la pareja.
        sibling.spouses = partners.map((partner, i) => ({
          data: partner,
          spouse: sibling,
          depth,
          x: siblingFirst ? x + S * (i + 1) : x + S * i,
          y: node.y,
          psx: siblingX,
          psy: node.y,
          tid: partner.id,
        }));
        added.push(...sibling.spouses);
      }
      x += S * (1 + partners.length);
    }
  };

  // Dónde empieza el grupo de padres para quedar centrado sobre `x`: con
  // pareja, la unión de las dos cajas cae sobre `x`; con uno solo, él mismo.
  const groupLeft = (parents: LayoutNode[], x: number): number => {
    const first = parents[0];
    if (parents.length > 1) return x - width(first);
    return sideOf(first, 0, 1) === "L" ? x + half - width(first) : x - half;
  };

  const placeGroup = (parents: LayoutNode[], left: number) => {
    let cursor = left;
    parents.forEach((parent, i) => {
      place(parent, cursor, sideOf(parent, i, parents.length));
      cursor += width(parent);
    });
  };

  const place = (node: LayoutNode, boxLeft: number, side: Side) => {
    const boxRight = boxLeft + width(node);
    node.x = side === "L" ? boxRight - half : boxLeft + half;
    addSiblings(node, side, node.x);

    const parents = parentsOf.get(node)!;
    if (!parents.length) return;
    const groupWidth = parents.reduce((sum, p) => sum + width(p), 0);
    // Lo más centrado posible sobre el hijo, pero sin salirse de su caja.
    const left = Math.min(Math.max(groupLeft(parents, node.x), boxLeft), boxRight - groupWidth);
    placeGroup(parents, left);
  };

  // El tronco y todo lo de abajo quedan donde los puso la librería. Sus
  // padres conservan el punto sobre el que estaban centrados.
  const trunkParents = parentsOf.get(trunk)!;
  if (trunkParents.length) {
    const anchor =
      trunkParents.length > 1 ? (trunkParents[0].x + trunkParents[1].x) / 2 : trunkParents[0].x;
    placeGroup(trunkParents, groupLeft(trunkParents, anchor));
  }

  // Hermanos del tronco: en su misma fila, del lado contrario a sus parejas.
  const row = [trunk.x, ...(trunk.spouses ?? []).map((s) => s.x)];
  const spouseX = trunk.spouses?.[0]?.x;
  const trunkSide: Side =
    spouseX !== undefined ? (spouseX > trunk.x ? "L" : "R") : sideOf(trunk, 0, 1);
  addSiblings(trunk, trunkSide, trunkSide === "L" ? Math.min(...row) : Math.max(...row));

  // Los padres de la pareja de alguien de la línea directa (el tronco o
  // cualquiera de sus descendientes o ancestros): la librería no los puede
  // calcular (solo sube por la línea directa de sangre), así que se agregan
  // a mano. No van centrados sobre su tarjeta: ese lugar puede estar ocupado
  // por los padres de quien sí es de la línea directa, así que se agregan
  // hacia afuera, del lado contrario a su pareja, igual que los hermanos se
  // agregan del lado contrario a su pareja. Un solo nivel (sus padres, no
  // sus abuelos ni sus hermanos): para ver más hay que centrar el árbol en
  // ellos. Se busca entre `nodes` (que ya trae, planas, todas las tarjetas
  // de cónyuge nativas de la librería, de cualquier profundidad) y `added`
  // (las que se acaban de agregar acá mismo, como la pareja de un hermano).
  if (opts.spousesUpOpen?.size) {
    // Lo que ya ocupa cada fila (por y), para no encimarse con los padres
    // del tronco (u otra pareja agregada así): si el lugar de al lado ya
    // está tomado, el grupo entero se corre una tanda más hacia afuera.
    const occupiedAt = new Map<number, number[]>();
    for (const n of [...nodes, ...added]) {
      occupiedAt.set(n.y, [...(occupiedAt.get(n.y) ?? []), n.x]);
    }
    const collides = (y: number, x: number) => (occupiedAt.get(y) ?? []).some((ox) => Math.abs(ox - x) < S - 1);

    // Cola que crece mientras se recorre: una tarjeta recién agregada (p.
    // ej. Luis Humberto, agregado porque María Teresa pidió ver a sus
    // padres) puede tener ella misma un pedido pendiente (ver a SUS
    // propios padres). Con un `for...of` sobre una foto fija no se volvía a
    // pasar por ella en la misma pasada y había que tocarla una segunda vez
    // para que recién ahí funcionara; con índice sobre un arreglo que se va
    // extendiendo si se alcanza a procesar en la misma vuelta.
    const queue: LayoutNode[] = [...nodes, ...added];
    for (let i = 0; i < queue.length; i++) {
      const spouseNode = queue[i];
      // `spouse` (singular) marca a la tarjeta de pareja agregada; `spouses`
      // (plural) marca al otro lado, el "de sangre" (p. ej. el tronco, o el
      // padre de alguien una vez que él y su esposa están los dos en
      // pantalla). Cualquiera de los dos puede pedir sus propios padres,
      // usando al otro como referencia de posición.
      const bloodPartner = spouseNode.spouse ?? spouseNode.spouses?.[0];
      if (!bloodPartner || !opts.spousesUpOpen.has(spouseNode.data.id)) continue;
      const parents = (spouseNode.data.rels.parents ?? [])
        .map((pid) => opts.byId.get(pid))
        .filter((d): d is LayoutDatum => d !== undefined && !visible.has(d.id))
        .sort((a, b) => (a.data.gender === "F" ? 1 : 0) - (b.data.gender === "F" ? 1 : 0));
      if (!parents.length) continue;
      for (const d of parents) visible.add(d.id);

      const side: Side = spouseNode.x > bloodPartner.x ? "R" : "L";
      // Si su pareja ya muestra a sus propios padres, se alinean con esa
      // fila (p. ej. los padres de la esposa del tronco, con los del
      // tronco); si no, una generación arriba de donde está la pareja.
      const referenceY = bloodPartner.parents?.[0]?.y ?? spouseNode.y - (opts.levelSeparation ?? S);
      let step = 0;
      let centers: number[] = [];
      do {
        const left =
          side === "L" ? spouseNode.x - S * (parents.length + step) : spouseNode.x + S * (1 + step);
        centers = parents.map((_, i) => left + S * i + half);
        step++;
      } while (centers.some((x) => collides(referenceY, x)) && step < 20);
      for (const x of centers) {
        occupiedAt.set(referenceY, [...(occupiedAt.get(referenceY) ?? []), x]);
      }

      const parentNodes: LayoutNode[] = parents.map((datum, i) => ({
        data: datum,
        sibling: true,
        depth: -1,
        x: centers[i],
        y: referenceY,
        psx: spouseNode.x,
        psy: spouseNode.y,
        tid: datum.id,
      }));
      if (parentNodes.length === 2) {
        parentNodes[1].spouse = parentNodes[0];
        parentNodes[0].spouses = [parentNodes[1]];
      }
      // Esto es lo que hace que la librería dibuje la línea hacia sus padres
      // (ver createLinks/handleAncestrySide en family-chart): basta con que
      // la tarjeta de la pareja tenga esta lista.
      spouseNode.parents = parentNodes;
      added.push(...parentNodes);
      queue.push(...parentNodes);
    }
  }

  // Los hermanos de alguien fuera de la línea directa, una vez que ya se
  // muestran sus padres (un hermano agregado más arriba, o la pareja de
  // alguien a la que se le acaban de agregar los suyos): los otros hijos de
  // esos mismos padres, a su lado. La línea directa ya tiene su propio
  // mecanismo (`sibsOpen` sobre `line`, más arriba); esto es lo mismo pero
  // para quien no está en esa cadena, así que no tiene `.parents` propios
  // calculados por la librería y hay que usar los que se le pusieron a mano.
  if (opts.sibsOpen.size) {
    const handledIds = new Set(line.map((n) => n.data.id));
    const occupiedAt = new Map<number, number[]>();
    for (const n of [...nodes, ...added]) {
      occupiedAt.set(n.y, [...(occupiedAt.get(n.y) ?? []), n.x]);
    }
    const collides = (y: number, x: number) => (occupiedAt.get(y) ?? []).some((ox) => Math.abs(ox - x) < S - 1);

    for (const node of [...nodes, ...added]) {
      if (handledIds.has(node.data.id)) continue;
      if (!node.parents?.length || !opts.sibsOpen.has(node.data.id)) continue;
      const found: LayoutDatum[] = [];
      for (const parent of node.parents) {
        for (const childId of parent.data.rels.children ?? []) {
          const datum = opts.byId.get(childId);
          if (!datum || visible.has(childId)) continue;
          visible.add(childId);
          found.push(datum);
        }
      }
      if (!found.length) continue;
      found.sort(byBirth);

      // Hacia afuera de su propia pareja, si tiene una ya a la vista; si no,
      // según su género, como en el resto del árbol.
      const partnerX = node.spouse?.x ?? node.spouses?.[0]?.x;
      const side: Side =
        partnerX !== undefined ? (partnerX > node.x ? "L" : "R") : node.data.data.gender === "F" ? "R" : "L";

      let x = side === "L" ? node.x - S : node.x + S;
      for (const datum of found) {
        while (collides(node.y, x)) x += side === "L" ? -S : S;
        const sibling: LayoutNode = {
          data: datum,
          sibling: true,
          depth: node.depth,
          x,
          y: node.y,
          parents: (node.parents ?? []).filter((p) => (datum.rels.parents ?? []).includes(p.data.id)),
          psx: node.x,
          psy: node.y,
          tid: datum.id,
        };
        occupiedAt.set(node.y, [...(occupiedAt.get(node.y) ?? []), x]);
        added.push(sibling);
        x += side === "L" ? -S : S;
      }
    }
  }

  // Los hijos de un hermano agregado: en la fila de abajo, centrados bajo él
  // y su pareja (si se muestra). Ese lugar puede estar tomado por la
  // descendencia de la línea directa, así que el grupo entero se corre hacia
  // afuera (del lado en que está el hermano) hasta encontrar sitio.
  if (opts.kidsOpen?.size) {
    const occupiedAt = new Map<number, number[]>();
    for (const n of [...nodes, ...added]) {
      occupiedAt.set(n.y, [...(occupiedAt.get(n.y) ?? []), n.x]);
    }
    const collides = (y: number, x: number) => (occupiedAt.get(y) ?? []).some((ox) => Math.abs(ox - x) < S - 1);

    for (const node of [...added]) {
      if (!node.sibling || node.spouse || !opts.kidsOpen.has(node.data.id)) continue;
      const found: LayoutDatum[] = [];
      for (const childId of node.data.rels.children ?? []) {
        const datum = opts.byId.get(childId);
        if (!datum || visible.has(childId)) continue;
        visible.add(childId);
        found.push(datum);
      }
      if (!found.length) continue;
      // Con varias uniones, cada hijo baja de SU pareja: de la pareja que se muestra a su lado,
      // o de él solo si su otro padre/madre no se muestra o no se sabe (así no parece hijo/a de
      // quien está al lado). Los grupos van contiguos, en el orden de las parejas.
      const shown = node.spouses ?? [];
      const partnersRight = shown.length ? shown[0].x > node.x : true;
      const groupOf = (d: LayoutDatum) => {
        const other = (d.rels.parents ?? []).find((q) => q !== node.data.id);
        const i = other ? shown.findIndex((sp) => sp.data.id === other) : -1;
        return i < 0 ? (partnersRight ? -1 : shown.length) : i;
      };
      found.sort((a, b) => groupOf(a) - groupOf(b) || byBirth(a, b));

      const partner = node.spouses?.[0];
      const mid = partner ? (node.x + partner.x) / 2 : node.x;
      // De dónde bajan las líneas: del punto medio de la pareja, o de él solo.
      node.sx = node.x;
      node.spouses?.forEach((sp, i) => {
        sp.sx = i === 0 ? mid : sp.x;
      });

      const y = node.y + (opts.levelSeparation ?? S);
      const dir = node.x < (node.psx ?? node.x) ? -1 : 1;
      const start = mid - ((found.length - 1) * S) / 2;
      let shift = 0;
      while (found.some((_, i) => collides(y, start + shift + i * S)) && shift < S * 60) shift += S * dir;

      const kids: LayoutNode[] = found.map((datum, i) => ({
        data: datum,
        kid: true,
        depth: node.depth + 1,
        x: start + shift + i * S,
        y,
        // De dónde baja su línea: punto medio de la 1.ª pareja, la 2.ª+ pareja sola, o él solo.
        psx: (() => {
          const g = groupOf(datum);
          return g < 0 || g >= shown.length ? node.x : g === 0 ? mid : shown[g].x;
        })(),
        psy: node.y,
        tid: datum.id,
      }));
      for (const k of kids) occupiedAt.set(y, [...(occupiedAt.get(y) ?? []), k.x]);
      node.children = kids;
      added.push(...kids);
    }
  }

  nodes.push(...added);
  return added;
}

/** ¿Está en pantalla toda la familia inmediata de esta tarjeta? */
export function allRelativesDisplayed(node: LayoutNode, visibleIds: ReadonlySet<string>): boolean {
  const r = node.data.rels;
  const direct = [...(r.parents ?? []), ...(r.spouses ?? []), ...(r.children ?? [])].filter(Boolean);
  if (!direct.every((id) => visibleIds.has(id))) return false;
  // Alguien fuera de la línea directa (un hermano agregado, o una pareja con
  // sus propios padres ya mostrados) puede además mostrar a sus propios
  // hermanos: `node.parents` son las tarjetas que le puso layoutAncestry, con
  // la lista completa de hijos de cada padre. Si falta alguno, todavía queda
  // algo por ver, aunque `rels` ya esté completo. La línea directa tiene su
  // propio mecanismo para esto (ver decideExpand) y no entra acá: su propio
  // `.parents` es el de la librería, no refleja una acción pendiente en su
  // propia tarjeta.
  if (node.is_ancestry || (!node.sibling && !node.spouse)) return true;
  const siblingIds = (node.parents ?? []).flatMap((p) => p.data.rels.children ?? []);
  return siblingIds.every((id) => id === node.data.id || visibleIds.has(id));
}

/**
 * Junta a cada pareja: sus tarjetas quedan a `couplePitch` una de otra en
 * vez de a `separation`, sin mover el punto medio (de donde bajan las líneas
 * a los hijos y adonde suben las de sus propios padres). Así una pareja se
 * lee como un grupo y se distingue de dos hermanos, que siguen a
 * `separation`; el espacio que se gana queda entre la pareja y sus vecinos.
 * Se aplica al final, sobre todas las tarjetas (las de la librería y las
 * agregadas acá). Volver a aplicarlo no cambia nada.
 */
export function tightenCouples(nodes: LayoutNode[], separation: number, couplePitch: number): void {
  if (!(couplePitch < separation)) return;
  const moved = new Set<LayoutNode>();
  for (const node of nodes) {
    const partners = node.spouses?.length
      ? node.spouses
      : node.coparent && node.x < node.coparent.x
        ? [node.coparent]
        : [];
    const group = [node, ...partners.filter((p) => p.y === node.y)].sort((a, b) => a.x - b.x);
    if (group.length < 2 || group.some((n) => moved.has(n))) continue;
    // Solo si están uno al lado del otro, sin nadie en el medio.
    const contiguous = group.every((n, i) => i === 0 || Math.abs(n.x - group[i - 1].x - separation) < 1);
    if (!contiguous) continue;
    const center = (group[0].x + group[group.length - 1].x) / 2;
    group.forEach((n, i) => {
      n.x = center + (i - (group.length - 1) / 2) * couplePitch;
      moved.add(n);
    });
    // La librería guarda en cada pareja suya de dónde bajan las líneas a los
    // hijos: de entre los dos con la primera, y de la propia tarjeta con las
    // demás.
    node.spouses?.forEach((spouse, i) => {
      if (typeof spouse.sx === "number") spouse.sx = i === 0 ? (node.x + spouse.x) / 2 : spouse.x;
    });
    // Y en la persona misma, de dónde bajan las de los hijos sin otro padre
    // conocido: de su propia tarjeta.
    if (typeof node.sx === "number") node.sx = node.x;
  }
}

/** Tamaño del árbol, en el mismo formato que usa family-chart para encuadrarlo. */
export function treeDimensions(nodes: LayoutNode[], separationX: number, separationY: number) {
  const xs = nodes.map((n) => n.x);
  const ys = nodes.map((n) => n.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    width: Math.max(...xs) - minX + separationX,
    height: Math.max(...ys) - minY + separationY,
    x_off: -minX + separationX / 2,
    y_off: -minY + separationY / 2,
  };
}
