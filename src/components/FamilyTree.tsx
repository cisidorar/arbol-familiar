"use client";

import { useEffect, useRef } from "react";
import "family-chart/styles/family-chart.css";
import {
  collapseSiblings,
  decideExpand,
  emptyExpanded,
  expandDirection,
  pruneHierarchy,
  pruneToLine,
  shownSiblings,
  siblingsSide,
  type ExpandAction,
  type Expanded,
} from "@/lib/tree-nav";
import { countCrossings, pathWithJumps } from "@/lib/link-jumps";
import { allRelativesDisplayed, layoutAncestry, makeChildSort, tightenCouples, treeDimensions, type LayoutDatum } from "@/lib/tree-layout";

type ChartDatum = {
  id: string;
  data: {
    gender: "M" | "F";
    first_name: string;
    last_name: string;
    label: string;
    birth_year: number | null;
    est_birth_year?: number | null;
    death_year: number | null;
    is_living: boolean;
    is_child: boolean;
    needs_review?: boolean;
  };
  rels: { parents: string[]; children: string[]; spouses: string[] };
};

interface Props {
  data: ChartDatum[];
  mainId: string | null;
  /** Si el tronco es un antepasado lejano de quien mira: el camino de
   *  descendientes desde el tronco hasta esa persona. El árbol se muestra
   *  comprimido a esa línea (el resto de la familia queda cerrado). */
  line?: string[] | null;
  /** Cambia cuando se editó una persona: hay que redibujar las tarjetas. */
  version: number;
  /** Sube para volver el árbol a su vista de partida: ramas cerradas y encuadre completo. */
  resetKey?: number;
  onSelectPerson: (id: string) => void;
  /** Pide centrar el árbol en otra persona. El tronco lo guarda quien usa
   *  este componente (para poder ofrecer "volver"), acá solo se avisa. */
  onRecenter: (id: string) => void;
  /** Si se pasa, cada tarjeta lleva un "+" para agregarle un familiar; se
   *  avisa de quién y dónde quedó el botón en la pantalla (para abrir el
   *  menú a su lado). Solo para quien puede editar. */
  onAddRelative?: (id: string, rect: DOMRect) => void;
}

// Generaciones que se ven hacia arriba y hacia abajo del tronco antes de
// abrir ninguna rama a mano.
const DEFAULT_DEPTH = 2;

// Las líneas que no son de pareja (de un hijo a sus padres) family-chart las
// dibuja con una curva suavizada (d3.curveBasis). Cuando varios hermanos
// comparten el mismo tramo final hacia sus padres, cada línea es su propia
// curva: aunque terminan en los mismos puntos, la curva se dobla distinto
// según de dónde viene cada una, así que ese tramo compartido no queda
// exactamente encima y se ve como dos líneas en vez de una. Reemplazamos esa
// curva por segmentos rectos (mismos puntos, solo sin suavizar): un tramo
// recto entre los mismos dos puntos siempre cae exactamente igual sin
// importar de dónde venía la línea antes, así que el tramo compartido queda
// perfecto. `stroke-linejoin: round` en globals.css redondea los codos para
// que no se vean en ángulo recto.
/** Cuánto se baja (px, hacia los hijos) la barra de los padres de una pareja. */
const SPOUSE_BAR_SHIFT = 26;

/**
 * Las rectas ya calculadas por árbol, mientras las curvas de la librería no cambien: el
 * cálculo (grupos, alturas, cruces) no se repite en cada cuadro de la animación.
 */
const straightCache = new WeakMap<HTMLElement, { sig: string; targets: (string | null)[] }>();

type LinkDatum = {
  curve?: boolean; spouse?: boolean; d?: [number, number][];
  is_ancestry?: boolean;
  source?: { spouse?: unknown };
};
const datumOf = (path: SVGPathElement) => (path as unknown as { __data__?: LinkDatum }).__data__;

/** Reemplaza las curvas de la librería por líneas rectas (ver comentario arriba). */
function straightenLinks(container: HTMLElement) {
  const paths = Array.from(container.querySelectorAll<SVGPathElement>(".links_view path.link"));
  const sig = paths
    .map((p) => {
      const d = datumOf(p);
      return `${d?.is_ancestry ? "a" : "p"}${d?.source?.spouse ? "s" : ""}${d?.d?.map((q) => `${Math.round(q[0])},${Math.round(q[1])}`).join(" ") ?? "-"}`;
    })
    .join("|");
  let entry = straightCache.get(container);
  if (!entry || entry.sig !== sig) {
    entry = { sig, targets: computeStraightTargets(paths) };
    straightCache.set(container, entry);
  }
  paths.forEach((path, i) => {
    const target = entry.targets[i];
    if (target && path.getAttribute("d") !== target) path.setAttribute("d", target);
  });
}

function computeStraightTargets(paths: SVGPathElement[]): (string | null)[] {
  // Todos los hijos de unos mismos padres terminan su línea en el mismo punto
  // (el punto medio entre los dos padres): sirve de identificador del grupo.
  // Las líneas van del hijo al punto medio de sus padres, sean los de la línea directa, los
  // de un hermano agregado o los hijos de alguien que baja.
  const groupKey = (d: LinkDatum) => {
    const end = d.d?.[d.d.length - 1];
    return end ? `${Math.round(end[0])},${Math.round(end[1])}` : "";
  };

  // Cada grupo de hermanos (los hijos de unos mismos padres) comparte una barra
  // horizontal. La librería pone todas las barras de una misma fila a la misma
  // altura, así que si dos familias distintas tienen tramos que se solapan
  // (p. ej. los padres de dos parejas que entraron por matrimonio, o los de
  // una pareja y los de la persona principal), las barras se funden en una
  // sola y parece que los cuatro padres lo son de todos los hijos. Cada grupo
  // recibe su propia altura: primero la de siempre (la línea directa, en su
  // lugar; las parejas, bajadas SPOUSE_BAR_SHIFT) y, si choca con otra barra
  // que se solapa a los lados, la primera alternativa libre.
  // Los hermanos de una pareja (que `layoutAncestry` agrega como tarjetas
  // aparte) cuelgan de los mismos padres y comparten el grupo, así que bajan
  // junto con ella.
  type Group = { key: string; minX: number; maxX: number; barY: number; spouseSide: boolean };
  const groups = new Map<string, Group>();
  for (const path of paths) {
    const datum = datumOf(path);
    if (!datum?.curve || datum.spouse || !datum.d || datum.d.length < 6) continue;
    const key = groupKey(datum);
    const xs = [datum.d[0][0], datum.d[datum.d.length - 1][0]];
    let g = groups.get(key);
    if (!g) {
      g = { key, minX: Infinity, maxX: -Infinity, barY: datum.d[1][1], spouseSide: false };
      groups.set(key, g);
    }
    g.minX = Math.min(g.minX, ...xs);
    g.maxX = Math.max(g.maxX, ...xs);
    if (datum.source?.spouse) g.spouseSide = true;
  }

  const BLOOD_OFFSETS = [0, -13, 13, -26];
  const SPOUSE_OFFSETS = [SPOUSE_BAR_SHIFT, 13, -13, -26];
  const placed: { y: number; minX: number; maxX: number }[] = [];
  const offsetOf = new Map<string, number>();
  const ordered = [...groups.values()].sort(
    (a, b) => Number(a.spouseSide) - Number(b.spouseSide) || a.minX - b.minX,
  );
  for (const g of ordered) {
    const options = g.spouseSide ? SPOUSE_OFFSETS : BLOOD_OFFSETS;
    const free = options.find((off) =>
      placed.every(
        (p) => Math.abs(p.y - (g.barY + off)) >= 9 || p.maxX < g.minX - 60 || p.minX > g.maxX + 60,
      ),
    );
    const off = free ?? options[0];
    offsetOf.set(g.key, off);
    placed.push({ y: g.barY + off, minX: g.minX, maxX: g.maxX });
  }

  const targets: (string | null)[] = paths.map(() => null);
  const build = () => {
    const lines: { i: number; key: string; pts: [number, number][] }[] = [];
    paths.forEach((path, i) => {
      const datum = datumOf(path);
      if (!datum?.curve || datum.spouse || !datum.d) return;
      const key = groupKey(datum);
      const dy = offsetOf.get(key) ?? 0;
      const pts = dy
        ? datum.d.map(([x, y], j): [number, number] => (j >= 1 && j <= 4 ? [x, y + dy] : [x, y]))
        : datum.d;
      lines.push({ i, key, pts });
    });
    return lines;
  };

  // Dos grupos de barras vecinas que se solapan (los hijos de una pareja y los que el padre tuvo
  // con otra persona) se cruzan sí o sí, pero según cuál barra quede arriba se cruzan más o menos
  // veces: se prueba el orden contrario y se deja el que cruza menos.
  let lines = build();
  const crossingsOf = (keys: string[]) => {
    const mine = lines.filter((l) => keys.includes(l.key));
    return mine.reduce(
      (sum, l) => sum + countCrossings(l.pts, lines.filter((o) => o !== l).map((o) => o.pts)),
      0,
    );
  };
  const gs = ordered;
  for (let a = 0; a < gs.length; a++) {
    for (let b = a + 1; b < gs.length; b++) {
      const ga = gs[a];
      const gb = gs[b];
      const ya = ga.barY + (offsetOf.get(ga.key) ?? 0);
      const yb = gb.barY + (offsetOf.get(gb.key) ?? 0);
      if (Math.abs(ya - yb) >= 40 || Math.abs(ya - yb) < 1) continue;
      if (ga.maxX < gb.minX - 6 || gb.maxX < ga.minX - 6) continue;
      const before = crossingsOf([ga.key, gb.key]);
      if (!before) continue;
      const offA = offsetOf.get(ga.key) ?? 0;
      const offB = offsetOf.get(gb.key) ?? 0;
      offsetOf.set(ga.key, yb - ga.barY);
      offsetOf.set(gb.key, ya - gb.barY);
      const swapped = build();
      const keep = lines;
      lines = swapped;
      if (crossingsOf([ga.key, gb.key]) >= before) {
        lines = keep;
        offsetOf.set(ga.key, offA);
        offsetOf.set(gb.key, offB);
      }
    }
  }

  // Donde una línea cruza a otra, la horizontal se corta un instante (ver link-jumps.ts).
  for (const l of lines) {
    targets[l.i] = pathWithJumps(l.pts, lines.filter((o) => o !== l).map((o) => o.pts));
  }
  return targets;
}

// Medidas del árbol, en px. Una tarjeta mide CARD_WIDTH de ancho.
const CARD_WIDTH = 230;
/** De una tarjeta a la de al lado (hermanos): deja 70 entre ellas. */
const CARD_PITCH = 300;
/** De una tarjeta a la de su pareja: deja 14 entre ellas. */
const COUPLE_PITCH = 244;
/** Aire extra del lado de afuera de cada rama de ancestros. */
const FAMILY_GAP = 30;
/** De una generación a la siguiente. */
const ROW_PITCH = 176;

/** Texto del ícono de "más familia": dice qué va a pasar al hacer clic. */
function miniTreeHint(action: ExpandAction, name: string): string {
  if (action.kind === "up") return `Ver los padres de ${name}`;
  if (action.kind === "down") return `Ver los hijos de ${name}`;
  if (action.kind === "siblings") return `Ver los otros hijos de ${name}`;
  if (action.kind === "partners") return `Ver la pareja de ${name}`;
  if (action.kind === "spouse-up") return `Ver los padres de ${name}`;
  if (action.kind === "recenter") {
    const parts = [
      action.hidden.parents && "sus padres",
      action.hidden.children && (action.partly.children ? "sus otros hijos" : "sus hijos"),
      action.hidden.spouses && (action.partly.spouses ? "su otra pareja" : "su pareja"),
    ].filter((p): p is string => Boolean(p));
    const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} y ${parts[parts.length - 1]}` : parts[0];
    return `Centrar el árbol en ${name} para ver a ${list}`;
  }
  return "";
}

// family-chart lee "birth_year_label" literal del campo data; lo derivamos
// acá porque la librería no formatea fechas por nosotros.
function setYearLabels(data: ChartDatum[]) {
  for (const d of data as any[]) {
    const y = d.data.birth_year;
    const dy = d.data.death_year;
    d.data.birth_year_label = y ? (dy ? `${y}–${dy}` : `n. ${y}`) : d.data.is_living ? "" : "†";
  }
}

/**
 * En el teléfono "ver todo" deja las tarjetas diminutas e ilegibles: se acerca
 * hasta un tamaño que se lee y se centra en el tronco (con el dedo se puede
 * mover y acercar o alejar). En pantallas anchas no hace nada.
 */
let f3Lib: any = null; // la librería, cargada la primera vez que se dibuja el árbol
const PHONE_MAX_WIDTH = 640;
const PHONE_MIN_SCALE = 0.8;
function readableOnPhone(chart: any, container: HTMLElement | null, transitionTime: number) {
  if (!container || container.clientWidth >= PHONE_MAX_WIDTH) return;
  const svg = chart.svg as any;
  const tree = chart.store?.getTree?.();
  const main = tree?.data?.[0];
  if (!svg || !main) return;
  const rect = svg.getBoundingClientRect();
  // La vista todavía no llega al "ver todo" (la librería la mueve de forma asíncrona): se calcula contra el árbol entero.
  const fitK = Math.min(rect.width / tree.dim.width, rect.height / tree.dim.height, 1);
  if (fitK >= PHONE_MIN_SCALE) return;
  f3Lib?.handlers.cardToMiddle({
    datum: { x: main.x, y: main.y },
    svg,
    svg_dim: { width: rect.width, height: rect.height },
    scale: PHONE_MIN_SCALE,
    transition_time: transitionTime,
  });
}

export default function FamilyTree({ data, mainId, line = null, version, resetKey = 0, onSelectPerson, onRecenter, onAddRelative }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const lineRef = useRef<string[] | null>(line);
  lineRef.current = line;
  const onSelectRef = useRef(onSelectPerson);
  onSelectRef.current = onSelectPerson;
  const onRecenterRef = useRef(onRecenter);
  onRecenterRef.current = onRecenter;
  const onAddRelativeRef = useRef(onAddRelative);
  onAddRelativeRef.current = onAddRelative;

  // El "tronco" es la persona que fijamos como centro del árbol (mainId).
  // Para cada tronco recordamos qué ramas se abrieron a mano, así al volver
  // a un tronco anterior el árbol reaparece tal como se había dejado.
  const expandedByTrunkRef = useRef(new Map<string, Expanded>());
  const lastMainIdRef = useRef<string | null>(null);

  // Las líneas se redibujan en cada clic/transición de la librería, así que
  // esto corre todo el tiempo mientras el árbol está en pantalla (no solo
  // tras un clic puntual). El costo es mínimo: por cuadro, solo compara el
  // atributo `d` ya puesto contra el que queremos y no toca nada si ya
  // coincide (ver straightenLinks arriba).
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      if (containerRef.current) straightenLinks(containerRef.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const f3 = await import("family-chart");
      f3Lib = f3;
      if (cancelled || !containerRef.current) return;

      const chart = f3.createChart(containerRef.current, data as any);
      chartRef.current = chart;
      // Fase 2 es solo lectura: no mostramos las tarjetas "+" de agregar
      // pariente que family-chart ofrece por defecto (eso llega en fase 3).
      chart.setSingleParentEmptyCard(false);

      // Tarjetas más anchas y con más separación: con nombres y apellidos
      // compuestos (frecuentes en este árbol) el tamaño por defecto los corta.
      // Entre dos hermanos queda un espacio claro; una pareja, en cambio, va
      // casi pegada (COUPLE_PITCH) para que se lea como un grupo, y dos
      // familias distintas que quedan vecinas llevan aire extra (FAMILY_GAP).
      chart.setCardXSpacing(CARD_PITCH);
      chart.setCardYSpacing(ROW_PITCH);
      // Hermanos de mayor a menor edad (por año de nacimiento, o el estimado).
      // Con varias parejas, cada grupo de hijos queda bajo su madre/padre (ver makeChildSort).
      let sortIndex = new Map<string, LayoutDatum>();
      const childSort = makeChildSort((id) => {
        if (sortIndex.size !== (data as any[]).length) sortIndex = new Map((data as any[]).map((d) => [d.id, d]));
        return sortIndex.get(id);
      });
      chart.setSortChildrenFunction((a, b) => childSort(a as never, b as never));

      const expandedFor = (trunkId: string): Expanded => {
        const byTrunk = expandedByTrunkRef.current;
        let expanded = byTrunk.get(trunkId);
        if (!expanded) {
          expanded = emptyExpanded();
          byTrunk.set(trunkId, expanded);
        }
        // Un árbol abierto antes de una actualización (recarga en caliente)
        // conserva ramas guardadas sin los conjuntos nuevos.
        expanded.kids ??= new Set();
        return expanded;
      };
      const currentExpanded = () => expandedFor(chart.store.getMainId() as string);

      // Con 251 personas, mostrar el árbol completo de una persona muy
      // conectada satura la pantalla. Arrancamos mostrando solo 2
      // generaciones hacia arriba y hacia abajo del tronco, y cada rama se
      // abre por separado. No usamos setAncestryDepth/setProgenyDepth de la
      // librería porque ese límite es global: al subirlo para ver los padres
      // de una persona se abrían los de todos los ancestros de su nivel.
      // La raíz de la jerarquía que llega acá es el tronco.
      chart.setModifyTreeHierarchy((root: any, isAncestry: boolean) => {
        const expanded = expandedFor(root.data.id);
        const line = lineRef.current;
        if (!isAncestry && line && line[0] === root.data.id) pruneToLine(root, DEFAULT_DEPTH, expanded.down, line);
        else pruneHierarchy(root, DEFAULT_DEPTH, isAncestry ? expanded.up : expanded.down);
      });

      // Ids de las personas que el árbol calculado tiene en pantalla.
      let idsOfTree: unknown = null;
      let ids = new Set<string>();
      const visibleIds = () => {
        const tree = chart.store.getTree() as any;
        if (tree !== idsOfTree) {
          idsOfTree = tree;
          ids = new Set<string>((tree?.data ?? []).map((n: any) => n.data.id));
        }
        return ids;
      };
      // Para alguien fuera de la línea directa (un hermano agregado, o una
      // pareja a la que ya se le mostraron sus padres): ¿hay más hijos de
      // esos mismos padres que todavía no están en pantalla? `d.parents`
      // son las tarjetas que le puso `layoutAncestry`, con los datos
      // completos de cada padre (incluida su lista de hijos).
      const siblingsHiddenFor = (d: any): boolean => {
        const parents = d.parents as any[] | undefined;
        if (!parents?.length) return false;
        const visible = visibleIds();
        return parents.some((p) =>
          (p.data.rels.children ?? []).some((cid: string) => cid !== d.data.id && !visible.has(cid)),
        );
      };
      const actionFor = (d: any) => decideExpand({ ...d, siblingsHidden: siblingsHiddenFor(d) }, visibleIds(), currentExpanded());

      // La librería no dibuja a los hermanos de la línea directa (los otros
      // hijos de un ancestro). Justo después de que calcula el árbol y antes
      // de que lo pinte, agregamos esas tarjetas y reacomodamos a los
      // ancestros para hacerles lugar (ver tree-layout.ts).
      // `data` crece cuando se agrega a alguien desde una tarjeta: el índice
      // se rearma si cambió la cantidad.
      let byId = new Map<string, LayoutDatum>();
      chart.setBeforeUpdate(() => {
        const tree = chart.store.getTree() as any;
        if (!tree) return;
        if (byId.size !== data.length) byId = new Map((data as any[]).map((d) => [d.id, d]));
        const { node_separation, level_separation } = chart.store.state as any;
        layoutAncestry(tree.data, {
          byId,
          sibsOpen: expandedFor(tree.main_id).sibs,
          partnersOpen: expandedFor(tree.main_id).partners,
          spousesUpOpen: expandedFor(tree.main_id).spousesUp,
          kidsOpen: expandedFor(tree.main_id).kids,
          separation: node_separation,
          familyGap: FAMILY_GAP,
          levelSeparation: level_separation,
        });
        tightenCouples(tree.data, node_separation, COUPLE_PITCH);
        idsOfTree = null;
        const visible = visibleIds();
        for (const node of tree.data) node.all_rels_displayed = allRelativesDisplayed(node, visible);
        tree.dim = treeDimensions(tree.data, node_separation, level_separation);
      });

      // Redibuja sin que la tarjeta en la que se hizo clic se mueva de su
      // lugar en pantalla: al abrir una rama el árbol se ensancha y las
      // tarjetas se corren, así que se desplaza la vista lo mismo en sentido
      // contrario. En un árbol grande, perder de vista la tarjeta recién
      // tocada obliga a buscarla de nuevo.
      const updateKeepingInPlace = (d: any) => {
        const before = { x: d.x, y: d.y };
        chart.updateTree({ tree_position: "inherit" });
        const tree = chart.store.getTree() as any;
        const after = tree?.data.find(
          (n: any) => n.data.id === d.data.id && Boolean(n.spouse) === Boolean(d.spouse),
        );
        // d3-zoom guarda la transformación actual en `__zoom` del elemento
        // que escucha el zoom (el contenedor del svg).
        const view = (chart.svg.parentNode as any)?.__zoom as { k: number; x: number; y: number } | undefined;
        if (!after || !view) return;
        const dx = after.x - before.x;
        const dy = after.y - before.y;
        if (!dx && !dy) return;
        const x = view.x - view.k * dx;
        const y = view.y - view.k * dy;
        // cardToMiddle es la única función de la librería que mueve la vista
        // a una posición dada; se le pide "centrar el punto (0,0)" en un
        // lienzo cuyo centro es justo el desplazamiento que queremos.
        (f3 as any).handlers.cardToMiddle({
          datum: { x: 0, y: 0 },
          svg: chart.svg,
          svg_dim: { width: 2 * x, height: 2 * y },
          scale: view.k,
          transition_time: (chart.store.state as any).transition_time,
        });
      };

      const card = chart
        .setCardHtml()
        .setCardDisplay([["first_name", "last_name"], ["birth_year_label"]])
        .setOnCardClick((e: Event, d: any) => {
          // El ícono de "más familia" vive dentro de la tarjeta, así que su
          // clic llega acá también. Lo distinguimos: el ícono solo navega,
          // el resto de la tarjeta además abre la ficha de la persona.
          // El "+" también vive dentro de la tarjeta: solo abre su menú.
          const addButton = (e.target as Element | null)?.closest?.(".card-add");
          if (addButton) {
            onAddRelativeRef.current?.(d.data.id, addButton.getBoundingClientRect());
            return;
          }
          // "Comprimir": oculta de nuevo a los hermanos desplegados al lado.
          const collapseButton = (e.target as Element | null)?.closest?.(".card-collapse");
          if (collapseButton) {
            const nodes = ((chart.store.getTree() as any)?.data ?? []) as any[];
            collapseSiblings(currentExpanded(), d.data.id, shownSiblings(d, nodes, currentExpanded()));
            updateKeepingInPlace(d);
            return;
          }
          const onMiniTree = Boolean((e.target as Element | null)?.closest?.(".mini-tree"));
          if (!onMiniTree) onSelectRef.current(d.data.id);

          const action = actionFor(d);
          const expanded = currentExpanded();
          if (action.kind === "up") {
            // Se abren sus padres y, con ellos, sus hermanos: la familia en
            // la que nació. Solo la suya, no la de todos los de su nivel.
            expanded.up.add(d.data.id);
            expanded.sibs.add(d.data.id);
            updateKeepingInPlace(d);
          } else if (action.kind === "down") {
            expanded.down.add(d.data.id);
            updateKeepingInPlace(d);
          } else if (action.kind === "partners") {
            // La pareja de un hermano: aparece a su lado, en el mismo árbol.
            expanded.partners.add(d.data.id);
            updateKeepingInPlace(d);
          } else if (action.kind === "kids") {
            // Los hijos de un hermano: aparecen en la fila de abajo, bajo él
            // y su pareja, sin cambiar de árbol (ver layoutAncestry).
            expanded.kids.add(d.data.id);
            updateKeepingInPlace(d);
          } else if (action.kind === "spouse-up") {
            // Los padres de su pareja: aparecen a su lado, sin mover el
            // árbol (ver layoutAncestry).
            expanded.spousesUp.add(d.data.id);
            updateKeepingInPlace(d);
          } else if (action.kind === "siblings" && onMiniTree) {
            // Los otros hijos de un ancestro: aparecen al lado del hijo que
            // ya estaba en pantalla.
            expanded.sibs.add(action.of);
            updateKeepingInPlace(d);
          } else if (action.kind === "recenter" && onMiniTree) {
            // Familia que no se puede dibujar desde este tronco (los padres
            // de un cónyuge, otra pareja, los hijos de un hermano). Solo el
            // ícono cambia el tronco; abrir una ficha nunca mueve el árbol.
            onRecenterRef.current(d.data.id);
          }
        })
        .setOnCardUpdate(function (this: HTMLElement, d: any) {
          // Muerte infantil: silueta de niño/a en vez de adulto (ver globals.css,
          // clase .card-child combinada con .card-male/.card-female).
          this.querySelector(".card")?.classList.toggle("card-child", Boolean(d.data.data.is_child));

          // «Hay un documento por revisar» (se prende en la ficha): borde ámbar y una insignia.
          const review = Boolean(d.data.data.needs_review);
          this.querySelector(".card")?.classList.toggle("card-review", review);
          {
            const el = this.querySelector(".card");
            let flag = el?.querySelector<HTMLElement>(".card-review-flag") ?? null;
            if (el && review && !flag) {
              flag = document.createElement("div");
              flag.className = "card-review-flag";
              flag.setAttribute("title", "Hay un documento por revisar (ábrelo en la ficha)");
              flag.setAttribute("aria-label", "Hay un documento por revisar");
              el.appendChild(flag);
            } else if (!review) {
              flag?.remove();
            }
          }

          // El "+" para agregarle un familiar (solo si quien entró puede editar).
          const cardEl = this.querySelector(".card");
          if (cardEl && onAddRelativeRef.current && !cardEl.querySelector(".card-add")) {
            const add = document.createElement("div");
            add.className = "card-add";
            add.setAttribute("role", "button");
            add.setAttribute("aria-haspopup", "menu");
            add.setAttribute("aria-label", `Agregar un familiar de ${d.data.data.label}`);
            add.setAttribute("title", "Agregar hijo, hermano, padre o madre, o pareja");
            cardEl.appendChild(add);
          }

          // "Comprimir": solo en la tarjeta que tiene hermanos desplegados.
          if (cardEl) {
            const nodes = ((chart.store.getTree() as any)?.data ?? []) as any[];
            const shown = shownSiblings(d, nodes, currentExpanded());
            let collapse = cardEl.querySelector<HTMLElement>(".card-collapse");
            if (!shown.length) {
              collapse?.remove();
            } else {
              if (!collapse) {
                collapse = document.createElement("div");
                collapse.className = "card-collapse";
                collapse.setAttribute("role", "button");
                cardEl.appendChild(collapse);
              }
              collapse.setAttribute("data-side", siblingsSide(d, shown));
              const label = `Comprimir a los hermanos de ${d.data.data.label}`;
              collapse.setAttribute("title", label);
              collapse.setAttribute("aria-label", label);
            }
          }

          const mini = this.querySelector(".mini-tree");
          if (!mini) return;
          const action = actionFor(d);
          const hint = miniTreeHint(action, d.data.data.label);
          // Dónde va el control y hacia dónde apunta: hacia donde aparece lo
          // que abre (ver globals.css).
          mini.setAttribute("data-dir", expandDirection(action, d) ?? "recenter");
          mini.setAttribute("title", hint);
          mini.setAttribute("role", "button");
          mini.setAttribute("aria-label", hint);
        });

      setYearLabels(data);

      // Sin fotos por ahora (fase 0 pendiente: los enlaces de MyHeritage están
      // vencidos). "rect" muestra solo texto, sin ícono de imagen rota.
      card.setStyle("rect").setCardDim({ w: CARD_WIDTH, h: 98, height_auto: false });

      // Ícono pequeño en las tarjetas que tienen más familia de la que se
      // ve: la señal visual de que se puede abrir haciendo clic ahí.
      card.setMiniTree(true);

      chart.setOrientationVertical();
      if (mainId) {
        chart.updateMainId?.(mainId);
        lastMainIdRef.current = mainId;
      }

      // La primera carga no debe animarse de a poco (se sentía lenta con 251
      // personas apareciendo en cascada): aparece de inmediato y recién desde
      // ahí quedan activas las transiciones, más cortas, para los clics.
      chart.setTransitionTime(0);
      chart.updateTree({ initial: true, tree_position: "fit" });
      readableOnPhone(chart, containerRef.current, 0);
      chart.setTransitionTime(400);
    })();

    return () => {
      cancelled = true;
      if (containerRef.current) containerRef.current.innerHTML = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // mainId solo cambia por una acción explícita (buscador, un enlace del
  // panel, el ícono de "más familia" o "volver"): ahí sí vale la pena volver
  // a centrar. Las ramas abiertas de ese tronco, si las había, se conservan.
  useEffect(() => {
    if (!chartRef.current || !mainId || mainId === lastMainIdRef.current) return;
    lastMainIdRef.current = mainId;
    chartRef.current.updateMainId?.(mainId);
    // Con la línea hasta quien mira, el árbol queda largo hacia abajo: se
    // encuadra entero para que se vea todo el camino.
    chartRef.current.updateTree({ tree_position: lineRef.current ? "fit" : "main_to_middle" });
    if (lineRef.current) readableOnPhone(chartRef.current, containerRef.current, 400);
  }, [mainId]);

  // "Archivo Zamora Balcázar" (el título): se cierran todas las ramas que se abrieron a mano
  // y el árbol vuelve a verse entero, centrado, como al entrar.
  const firstResetRef = useRef(true);
  useEffect(() => {
    if (firstResetRef.current) {
      firstResetRef.current = false;
      return;
    }
    const chart = chartRef.current;
    if (!chart) return;
    expandedByTrunkRef.current.clear();
    if (mainId) {
      lastMainIdRef.current = mainId;
      chart.updateMainId?.(mainId);
    }
    chart.updateTree({ tree_position: "fit" });
    readableOnPhone(chart, containerRef.current, 400);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  // Se editó una persona: sus datos ya cambiaron en `data` (el mismo objeto
  // que usa el árbol), solo falta volver a pintar las tarjetas, sin mover la vista.
  useEffect(() => {
    if (!chartRef.current || version === 0) return;
    setYearLabels(data);
    chartRef.current.updateTree({ tree_position: "inherit" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  return <div ref={containerRef} className="f3 relative h-full w-full overflow-hidden pt-20" />;
}
