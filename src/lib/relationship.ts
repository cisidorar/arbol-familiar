// Calcula el parentesco en español entre dos personas del árbol, visto desde
// el "foco" (la persona centrada en el árbol): "Su bisabuela", "Su primo", etc.
// Trabaja solo con el grafo que ya tenemos en memoria (rels.parents/children/
// spouses de cada persona), sin pedir nada más al servidor.

type Person = {
  id: string;
  data: { gender?: string };
  rels: { parents: string[]; children: string[]; spouses: string[] };
};

type Code =
  | { type: "spouse" }
  | { type: "up"; n: number }
  | { type: "down"; n: number }
  | { type: "collateral"; a: number; b: number };

const LINEAL_UP: Record<number, [string, string]> = {
  1: ["padre", "madre"],
  2: ["abuelo", "abuela"],
  3: ["bisabuelo", "bisabuela"],
  4: ["tatarabuelo", "tatarabuela"],
};

const LINEAL_DOWN: Record<number, [string, string]> = {
  1: ["hijo", "hija"],
  2: ["nieto", "nieta"],
  3: ["bisnieto", "bisnieta"],
  4: ["tataranieto", "tataranieta"],
};

const COLLATERAL: Record<string, [string, string]> = {
  "1-1": ["hermano", "hermana"],
  "1-2": ["sobrino", "sobrina"],
  "2-1": ["tío", "tía"],
  "2-2": ["primo", "prima"],
  "1-3": ["sobrino nieto", "sobrina nieta"],
  "3-1": ["tío abuelo", "tía abuela"],
};

function pick(pair: [string, string] | undefined, gender: string | undefined): string {
  if (!pair) return "pariente";
  return gender === "F" ? pair[1] : pair[0];
}

/** BFS hacia arriba (solo por rels.parents): id -> generaciones desde `start` (0 = start). */
function ancestorsOf(map: Map<string, Person>, start: string): Map<string, number> {
  const dist = new Map<string, number>([[start, 0]]);
  let frontier = [start];
  let d = 0;
  while (frontier.length && d < 12) {
    d++;
    const next: string[] = [];
    for (const id of frontier) {
      for (const parentId of map.get(id)?.rels.parents ?? []) {
        if (!dist.has(parentId)) {
          dist.set(parentId, d);
          next.push(parentId);
        }
      }
    }
    frontier = next;
  }
  return dist;
}

function relationCode(map: Map<string, Person>, focusId: string, targetId: string): Code | null {
  if (focusId === targetId) return null;
  const focus = map.get(focusId);
  if (!focus) return null;

  if (focus.rels.spouses.includes(targetId)) return { type: "spouse" };

  const focusAnc = ancestorsOf(map, focusId);
  const targetAnc = ancestorsOf(map, targetId);

  const upDist = focusAnc.get(targetId);
  if (upDist) return { type: "up", n: upDist };

  const downDist = targetAnc.get(focusId);
  if (downDist) return { type: "down", n: downDist };

  let best: { a: number; b: number } | null = null;
  for (const [ancestorId, a] of focusAnc) {
    if (a === 0) continue;
    const b = targetAnc.get(ancestorId);
    if (!b) continue;
    if (!best || a + b < best.a + best.b) best = { a, b };
  }
  if (best) return { type: "collateral", a: best.a, b: best.b };

  return null;
}

function baseLabel(code: Code, gender: string | undefined): string {
  if (code.type === "spouse") return pick(["esposo", "esposa"], gender);
  if (code.type === "up") return pick(LINEAL_UP[code.n] ?? ["ancestro", "ancestra"], gender);
  if (code.type === "down") return pick(LINEAL_DOWN[code.n] ?? ["descendiente", "descendiente"], gender);
  return pick(COLLATERAL[`${code.a}-${code.b}`] ?? ["pariente lejano", "pariente lejana"], gender);
}

function inLawLabel(code: Code, gender: string | undefined): string | null {
  if (code.type === "down" && code.n === 1) return pick(["yerno", "nuera"], gender);
  if (code.type === "up" && code.n === 1) return pick(["padrastro", "madrastra"], gender);
  if (code.type === "collateral" && code.a === 1 && code.b === 1) return pick(["cuñado", "cuñada"], gender);
  return null;
}

export function describeRelationship(
  people: Person[],
  focusId: string | null,
  targetId: string | null,
): string | null {
  if (!focusId || !targetId || focusId === targetId) return null;
  const map = new Map(people.map((p) => [p.id, p]));
  const target = map.get(targetId);
  if (!target) return null;

  const code = relationCode(map, focusId, targetId);
  if (code) return "Su " + baseLabel(code, target.data.gender);

  // No es pariente de sangre ni cónyuge directo: ¿es cónyuge de alguien que
  // sí lo es? (cuñado/a, yerno/nuera, padrastro/madrastra, o genérico).
  for (const spouseId of target.rels.spouses) {
    const spouseCode = relationCode(map, focusId, spouseId);
    if (!spouseCode) continue;
    const inLaw = inLawLabel(spouseCode, target.data.gender);
    if (inLaw) return "Su " + inLaw;
    return `Cónyuge de su ${baseLabel(spouseCode, map.get(spouseId)?.data.gender)}`;
  }

  return null;
}
