// El camino entre dos personas del árbol, para la animación "Ver camino".
// Lógica pura (sin React ni base de datos).

import { relationLabel, type Ancestor } from "./origins";

export type LineageStep = {
  id: string;
  name: string;
  /** Qué es esta persona en el camino ("madre de Catalina", "bisabuela · rama materna"). */
  relation: string;
  /** Un lugar o dato para mostrar debajo (el origen, el cementerio…). */
  place: string | null;
  estimated: boolean;
};

/** El camino de `rootId` hasta el antepasado `target`, de la persona hacia arriba. */
export function buildAncestorSteps(rootId: string, rootName: string, ancestors: Ancestor[], target: Ancestor): LineageStep[] {
  const byId = new Map(ancestors.map((a) => [a.id, a]));
  const up: LineageStep[] = [];
  let cur: Ancestor | undefined = target;
  while (cur) {
    up.push({
      id: cur.id,
      name: cur.name,
      relation: `${cur.relation} · rama ${cur.branch}`,
      place: cur.origin.kind === "none" ? null : cur.origin.label,
      estimated: cur.origin.kind !== "none" && cur.origin.basis !== "birth",
    });
    cur = cur.childId === rootId ? undefined : byId.get(cur.childId);
  }
  return [{ id: rootId, name: rootName, relation: "Punto de partida", place: null, estimated: false }, ...up.reverse()];
}

export type GraphPerson = {
  id: string;
  data: { gender?: string; label?: string };
  rels: { parents: string[]; children: string[]; spouses: string[] };
};

type Via = "parent" | "child" | "spouse";

const WORDS: Record<Via, [string, string]> = {
  parent: ["padre", "madre"],
  child: ["hijo", "hija"],
  spouse: ["pareja", "pareja"],
};

type Link = { id: string; via: Via | null; from: string | null };

/** El camino más corto (BFS) de rootId a targetId; a igualdad de largo, prefiere subir por los padres. */
function findChain(rootId: string, targetId: string, byId: Map<string, GraphPerson>): Link[] | null {
  if (!byId.has(rootId) || !byId.has(targetId)) return null;
  const prev = new Map<string, { from: string; via: Via } | null>([[rootId, null]]);
  let frontier = [rootId];
  while (frontier.length && !prev.has(targetId)) {
    const next: string[] = [];
    for (const id of frontier) {
      const p = byId.get(id)!;
      const edges: [string[], Via][] = [[p.rels.parents, "parent"], [p.rels.spouses, "spouse"], [p.rels.children, "child"]];
      for (const [ids, via] of edges) {
        for (const other of ids) {
          if (prev.has(other) || !byId.has(other)) continue;
          prev.set(other, { from: id, via });
          next.push(other);
        }
      }
    }
    frontier = next;
  }
  if (!prev.has(targetId)) return null;
  const chain: Link[] = [];
  let cur: string | undefined = targetId;
  while (cur) {
    const step: { from: string; via: Via } | null = prev.get(cur) ?? null;
    chain.push({ id: cur, via: step?.via ?? null, from: step?.from ?? null });
    cur = step?.from;
  }
  return chain.reverse();
}

/**
 * El camino más corto de `rootId` a `targetId` pasando por padres, hijos y parejas
 * (cada paso dice cómo se llega: "madre de …", "hija de …", "pareja de …"). Null si no hay.
 * A igualdad de largo se prefiere subir por los padres, así que a un antepasado se llega en línea recta.
 */
export function kinshipPath(rootId: string, targetId: string, people: GraphPerson[], note?: (id: string) => string | null): LineageStep[] | null {
  const byId = new Map(people.map((p) => [p.id, p]));
  const chain = findChain(rootId, targetId, byId);
  if (!chain) return null;
  // Con el primer nombre basta, salvo que dos personas del camino se llamen igual (Catalina y su mamá Catalina).
  const firstOf = (id: string) => (byId.get(id)?.data.label ?? "").split(" ")[0] || "…";
  const firsts = chain.map((c) => firstOf(c.id));
  const first = (id: string) => (firsts.filter((f) => f === firstOf(id)).length > 1 ? byId.get(id)?.data.label ?? "…" : firstOf(id));
  return chain.map((c) => {
    const person = byId.get(c.id)!;
    const female = person.data.gender === "F";
    return {
      id: c.id,
      name: person.data.label ?? "(sin nombre)",
      relation: c.via && c.from ? `${WORDS[c.via][female ? 1 : 0]} de ${first(c.from)}` : "Punto de partida",
      place: note?.(c.id) ?? null,
      estimated: false,
    };
  });
}

export type Kinship = {
  /** "tatarabuelo · rama materna", "hermana de tu abuelo", "prima"… */
  label: string;
  /** Pasos en el árbol (para ordenar: los más cercanos primero). */
  distance: number;
};

const g = (female: boolean, m: string, f: string) => (female ? f : m);

/** Qué es `targetId` para `rootId`, en palabras. Null si no hay parentesco en el árbol. */
export function kinshipLabel(rootId: string, targetId: string, people: GraphPerson[] | Map<string, GraphPerson>): Kinship | null {
  const byId = people instanceof Map ? people : new Map(people.map((p) => [p.id, p]));
  const chain = findChain(rootId, targetId, byId);
  if (!chain) return null;
  const distance = chain.length - 1;
  if (distance === 0) return { label: "tú", distance };
  const vias = chain.slice(1).map((c) => c.via!);
  const female = byId.get(targetId)?.data.gender === "F";
  const genderOf = (id: string) => byId.get(id)?.data.gender;
  const ups = vias.findIndex((v) => v !== "parent");
  const n = ups === -1 ? vias.length : ups; // generaciones que se sube
  const rest = vias.slice(n);
  const branch = n > 0 ? ` · rama ${genderOf(chain[1].id) === "F" ? "materna" : "paterna"}` : "";
  const ancestorAt = (k: number) => relationLabel(k, genderOf(chain[k].id));

  let label: string | null = null;
  if (!rest.length) label = relationLabel(n, genderOf(targetId)) + branch;
  else if (rest.length === 1 && rest[0] === "spouse") label = n === 0 ? g(female, "tu pareja", "tu pareja") : `pareja de tu ${ancestorAt(n)}${branch}`;
  else if (rest.every((v) => v === "child")) {
    const k = rest.length;
    if (n === 0) label = k === 1 ? g(female, "hijo", "hija") : k === 2 ? g(female, "nieto", "nieta") : `descendiente (${k} generaciones)`;
    else if (k === 1)
      label =
        n === 1 ? g(female, "hermano", "hermana")
        : n === 2 ? g(female, "tío", "tía") + branch
        : n === 3 ? g(female, "tío abuelo", "tía abuela") + branch
        : `${g(female, "hermano", "hermana")} de tu ${ancestorAt(n - 1)}${branch}`;
    else if (n === 1 && k === 2) label = g(female, "sobrino", "sobrina");
    else if (n === 2 && k === 2) label = g(female, "primo", "prima") + branch;
    else if (n >= 3 && k === 2) label = `${g(female, "primo", "prima")} de tu ${ancestorAt(n - 2)}${branch}`;
    else if (n === 3 && k === 3) label = g(female, "primo segundo", "prima segunda") + branch;
    else if (n === 2 && k === 3) label = `${g(female, "hijo", "hija")} de tu ${g(genderOf(chain[n + 2].id) === "F", "primo", "prima")}${branch}`;
  }
  return { label: label ?? `pariente (${distance} pasos en el árbol)`, distance };
}
