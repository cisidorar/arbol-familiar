export type Pt = [number, number];

/**
 * Cuando una línea del árbol cruza a otra (p. ej. la bajada de una pareja corta la
 * barra de los hijos que un padre tuvo con otra mujer), las dos tienen el mismo
 * color y el cruce parece una unión: se lee como si fueran de la misma familia.
 * Para que se vea que solo se cruzan, la línea horizontal se corta un instante
 * ("salto") justo donde pasa la vertical, como en un plano eléctrico.
 *
 * Solo cuenta como cruce el que atraviesa de verdad: si la vertical termina en
 * la horizontal (una "T", como cada hijo que cuelga de su barra) es una unión y
 * no se toca.
 */
export const JUMP_GAP = 7;

const EPS = 0.75;
/** Margen mínimo a cada lado para considerar que la vertical atraviesa. */
const THROUGH = 3;

type Seg = { x1: number; y1: number; x2: number; y2: number };

function segmentsOf(pts: Pt[]): Seg[] {
  const out: Seg[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    if (Math.abs(x1 - x2) < EPS && Math.abs(y1 - y2) < EPS) continue;
    out.push({ x1, y1, x2, y2 });
  }
  return out;
}

const isHorizontal = (s: Seg) => Math.abs(s.y1 - s.y2) < EPS && Math.abs(s.x1 - s.x2) >= EPS;
const isVertical = (s: Seg) => Math.abs(s.x1 - s.x2) < EPS && Math.abs(s.y1 - s.y2) >= EPS;

/** Posiciones x donde las verticales de `others` atraviesan la horizontal `h`. */
function crossingsOf(h: Seg, others: Seg[][]): number[] {
  const left = Math.min(h.x1, h.x2);
  const right = Math.max(h.x1, h.x2);
  const xs: number[] = [];
  for (const segs of others) {
    for (const v of segs) {
      if (!isVertical(v)) continue;
      const top = Math.min(v.y1, v.y2);
      const bottom = Math.max(v.y1, v.y2);
      const throughY = top < h.y1 - THROUGH && bottom > h.y1 + THROUGH;
      const insideX = v.x1 > left + JUMP_GAP + 1 && v.x1 < right - JUMP_GAP - 1;
      if (throughY && insideX) xs.push(v.x1);
    }
  }
  return [...new Set(xs.map((x) => Math.round(x)))].sort((a, b) => a - b);
}

/** El trazo recto de `pts` con un salto en cada cruce con las líneas de `others`. */
export function pathWithJumps(pts: Pt[], others: Pt[][], gap = JUMP_GAP): string {
  const mine = segmentsOf(pts);
  if (!mine.length) return pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`).join(" ");
  const otherSegs = others.map(segmentsOf);
  let d = `M${mine[0].x1},${mine[0].y1}`;
  let cursor: Pt = [mine[0].x1, mine[0].y1];
  for (const s of mine) {
    // Si hubo un salto de línea (puntos repetidos), seguimos desde donde empieza este tramo.
    if (Math.abs(cursor[0] - s.x1) > EPS || Math.abs(cursor[1] - s.y1) > EPS) d += ` L${s.x1},${s.y1}`;
    if (isHorizontal(s)) {
      const dir = s.x2 > s.x1 ? 1 : -1;
      const xs = crossingsOf(s, otherSegs);
      if (dir < 0) xs.reverse();
      for (const x of xs) {
        d += ` L${x - dir * gap},${s.y1} M${x + dir * gap},${s.y1}`;
      }
    }
    d += ` L${s.x2},${s.y2}`;
    cursor = [s.x2, s.y2];
  }
  return d;
}

/** Cuántas veces la línea `pts` cruza de lado a lado a las de `others` (en cualquiera de los dos sentidos). */
export function countCrossings(pts: Pt[], others: Pt[][]): number {
  const mine = segmentsOf(pts);
  const otherSegs = others.map(segmentsOf);
  let n = 0;
  // Las horizontales de esta línea contra las verticales de las otras.
  for (const s of mine) if (isHorizontal(s)) n += crossingsOf(s, otherSegs).length;
  // Las verticales de esta línea contra las horizontales de las otras.
  for (const v of mine) {
    if (!isVertical(v)) continue;
    const top = Math.min(v.y1, v.y2);
    const bottom = Math.max(v.y1, v.y2);
    for (const segs of otherSegs) {
      for (const h of segs) {
        if (!isHorizontal(h)) continue;
        const left = Math.min(h.x1, h.x2);
        const right = Math.max(h.x1, h.x2);
        if (top < h.y1 - THROUGH && bottom > h.y1 + THROUGH && v.x1 > left + JUMP_GAP + 1 && v.x1 < right - JUMP_GAP - 1) n++;
      }
    }
  }
  return n;
}
