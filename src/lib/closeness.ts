// Una sola regla para "qué tan cerca está esta persona de quien mira".
// La usan el árbol, el buscador y las listas para decidir qué mostrar primero
// y qué plegar. Trabaja con el grafo en memoria (parents/children/spouses).
//
//  - directo: él mismo, su pareja, sus ancestros y sus descendientes.
//  - cercano: hermanos, tíos y tíos abuelos, sobrinos, primos hermanos
//    (y las parejas de todos ellos).
//  - otro: el resto de la familia.
//
// `rama` es el abuelo/a de quien mira por cuya línea se llega a la persona
// (null si no cuelga de ninguno de sus cuatro abuelos).

export type ClosenessPerson = {
  id: string;
  rels: { parents: string[]; children: string[]; spouses: string[] };
};

export type ClosenessLevel = "directo" | "cercano" | "otro";

export type Closeness = {
  level: ClosenessLevel;
  /** Menor = más cerca (0 él mismo). Sirve para ordenar. */
  score: number;
  /** Id del abuelo/a de quien mira por cuya línea se llega, o null. */
  rama: string | null;
};

function ancestorDistances(map: Map<string, ClosenessPerson>, start: string): Map<string, number> {
  const dist = new Map<string, number>([[start, 0]]);
  let frontier = [start];
  for (let d = 1; frontier.length && d <= 14; d++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const p of map.get(id)?.rels.parents ?? []) {
        if (!dist.has(p) && map.has(p)) {
          dist.set(p, d);
          next.push(p);
        }
      }
    }
    frontier = next;
  }
  return dist;
}

/** Abuelos/as de `viewerId` (ids de los padres de sus padres). */
export function grandparentsOf(map: Map<string, ClosenessPerson>, viewerId: string): string[] {
  const out: string[] = [];
  for (const p of map.get(viewerId)?.rels.parents ?? []) {
    for (const g of map.get(p)?.rels.parents ?? []) if (!out.includes(g)) out.push(g);
  }
  return out;
}

function blood(
  map: Map<string, ClosenessPerson>,
  viewerAnc: Map<string, number>,
  grandparents: string[],
  targetId: string,
): Closeness | null {
  const targetAnc = ancestorDistances(map, targetId);

  const up = viewerAnc.get(targetId);
  if (up) {
    const rama = grandparents.find((g) => ancestorDistances(map, g).has(targetId)) ?? null;
    return { level: "directo", score: up, rama };
  }
  const down = targetAnc.get([...viewerAnc.keys()][0]);
  if (down) {
    return { level: "directo", score: down, rama: null };
  }

  let best: { a: number; b: number; via: string } | null = null;
  for (const [anc, a] of viewerAnc) {
    if (a === 0) continue;
    const b = targetAnc.get(anc);
    if (!b) continue;
    if (!best || a + b < best.a + best.b) best = { a, b, via: anc };
  }
  if (!best) return null;
  const cercano = best.a <= 3 && best.b <= 3 && best.a + best.b <= 4;
  const rama =
    grandparents.find((g) => g === best!.via || ancestorDistances(map, g).has(best!.via)) ?? null;
  return { level: cercano ? "cercano" : "otro", score: best.a + best.b + 1, rama };
}

export function closeness(
  people: readonly ClosenessPerson[] | Map<string, ClosenessPerson>,
  viewerId: string,
  targetId: string,
): Closeness | null {
  const map = people instanceof Map ? people : new Map(people.map((p) => [p.id, p]));
  if (!map.has(viewerId) || !map.has(targetId)) return null;
  if (viewerId === targetId) return { level: "directo", score: 0, rama: null };

  const viewerAnc = ancestorDistances(map, viewerId);
  const grandparents = grandparentsOf(map, viewerId);

  const own = blood(map, viewerAnc, grandparents, targetId);
  if (own) return own;

  // Sin lazo de sangre: la pareja de alguien hereda su cercanía (un paso más lejos).
  let best: Closeness | null = null;
  for (const s of map.get(targetId)?.rels.spouses ?? []) {
    const c = s === viewerId ? { level: "directo" as const, score: 0, rama: null } : blood(map, viewerAnc, grandparents, s);
    if (c && (!best || c.score < best.score)) best = c;
  }
  return best ? { ...best, score: best.score + 0.5 } : null;
}

/** Ordena de más cerca a más lejos; los que no tienen lazo van al final. */
export function sortByCloseness<T extends { id: string }>(
  people: readonly ClosenessPerson[] | Map<string, ClosenessPerson>,
  viewerId: string,
  items: readonly T[],
): T[] {
  const map = people instanceof Map ? people : new Map(people.map((p) => [p.id, p]));
  const score = (id: string) => closeness(map, viewerId, id)?.score ?? Infinity;
  return [...items].sort((a, b) => score(a.id) - score(b.id));
}

/** Texto corto para la ficha: "Línea directa · rama de Bartola Galdames". */
export function closenessLabel(c: Closeness | null, ramaName?: string | null): string | null {
  if (!c || c.score === 0) return null;
  const base = c.level === "directo" ? "Línea directa" : c.level === "cercano" ? "Pariente cercano" : "Familia extendida";
  return ramaName ? `${base} · rama de ${ramaName}` : base;
}
