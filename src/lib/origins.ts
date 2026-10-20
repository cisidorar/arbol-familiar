// Mapa de orígenes: de dónde vienen los antepasados de una persona.
// Lógica pura (sin base de datos ni React) para probarla sola; la usan la
// página del mapa (servidor) y el mapa interactivo (navegador).

import { foreignCountry, resolveComuna, type PlaceColumns } from "./geo/places";

/** Cómo se sabe dónde fue: el nacimiento manda; si falta, el bautismo; si falta, el matrimonio. */
export type Basis = "birth" | "baptism" | "marriage";
export const BASIS_ORDER: Basis[] = ["birth", "baptism", "marriage"];
export const BASIS_LABELS: Record<Basis, string> = {
  birth: "nacimiento",
  baptism: "bautismo (estimado)",
  marriage: "matrimonio (estimado)",
};

export type PlaceFacts = Partial<Record<Basis, PlaceColumns & { rawText: string }>>;

export type Origin =
  | { kind: "comuna"; code: string; regionCode: string; basis: Basis; label: string }
  | { kind: "abroad"; country: string; basis: Basis; label: string }
  | { kind: "unlocated"; basis: Basis; label: string }
  | { kind: "none" };

/** El origen de una persona. `birthOnly` ignora el bautismo y el matrimonio. */
export function pickOrigin(facts: PlaceFacts | undefined, birthOnly = false): Origin {
  if (!facts) return { kind: "none" };
  for (const basis of birthOnly ? (["birth"] as Basis[]) : BASIS_ORDER) {
    const place = facts[basis];
    if (!place || !place.rawText.trim()) continue;
    const label = place.rawText.trim();
    const abroad = foreignCountry(place);
    if (abroad) return { kind: "abroad", country: abroad, basis, label };
    const comuna = resolveComuna(place);
    if (comuna) return { kind: "comuna", code: comuna.code, regionCode: comuna.regionCode, basis, label };
    return { kind: "unlocated", basis, label };
  }
  return { kind: "none" };
}

export type Branch = "paterna" | "materna";

export type Ancestor = {
  id: string;
  name: string;
  /** 1 = padres, 2 = abuelos, 3 = bisabuelos… */
  generation: number;
  /** Por qué lado de la persona viene (null solo para la persona misma). */
  branch: Branch;
  relation: string;
  origin: Origin;
  /** El hijo/a (más cercano a la persona) por el que se llegó a este antepasado: sirve para armar el camino. */
  childId: string;
  /** Es hermano/a de un antepasado (tío, tío abuelo…), no antepasado directo: su camino baja desde el padre o madre (`childId`). */
  lateral?: boolean;
};

const LINEAL: Record<number, [string, string]> = {
  1: ["padre", "madre"],
  2: ["abuelo", "abuela"],
  3: ["bisabuelo", "bisabuela"],
  4: ["tatarabuelo", "tatarabuela"],
  5: ["trastatarabuelo", "trastatarabuela"],
};

export function relationLabel(generation: number, gender: string | undefined): string {
  const pair = LINEAL[generation];
  if (pair) return gender === "F" ? pair[1] : pair[0];
  return `${gender === "F" ? "antepasada" : "antepasado"} de la generación ${generation}`;
}

type PersonNode = {
  id: string;
  data: { gender?: string; label?: string };
  rels: { parents: string[]; children?: string[] };
};

/**
 * Los antepasados directos de `rootId`, por generación, con el lado (paterno
 * o materno) por el que llegan. Cada persona aparece una vez, en su primera
 * (menor) generación, aunque el árbol tenga un antepasado repetido.
 */
export function collectAncestors(
  rootId: string,
  people: PersonNode[],
  facts: ReadonlyMap<string, PlaceFacts>,
  maxGeneration = 12,
): Ancestor[] {
  const byId = new Map(people.map((p) => [p.id, p]));
  const root = byId.get(rootId);
  if (!root) return [];

  const out: Ancestor[] = [];
  const seen = new Set<string>([rootId]);
  // Cada elemento lleva el lado por el que se llegó a él.
  let frontier: { id: string; branch: Branch | null }[] = [{ id: rootId, branch: null }];

  for (let gen = 1; gen <= maxGeneration && frontier.length; gen++) {
    const next: { id: string; branch: Branch | null }[] = [];
    for (const { id, branch } of frontier) {
      for (const parentId of byId.get(id)?.rels.parents ?? []) {
        const parent = byId.get(parentId);
        if (!parent || seen.has(parentId)) continue;
        seen.add(parentId);
        // En la primera generación el lado lo da el sexo del padre o madre.
        const side: Branch = branch ?? (parent.data.gender === "F" ? "materna" : "paterna");
        out.push({
          id: parentId,
          name: parent.data.label ?? "(sin nombre)",
          generation: gen,
          branch: side,
          relation: relationLabel(gen, parent.data.gender),
          origin: pickOrigin(facts.get(parentId)),
          childId: id,
        });
        next.push({ id: parentId, branch: side });
      }
    }
    frontier = next;
  }

  // Los hermanos de cada antepasado (tíos, tíos abuelos…): los otros hijos de sus padres.
  const direct = [...out];
  for (const a of direct) {
    for (const parentId of byId.get(a.id)?.rels.parents ?? []) {
      for (const sibId of byId.get(parentId)?.rels.children ?? []) {
        const sib = byId.get(sibId);
        if (!sib || seen.has(sibId)) continue;
        seen.add(sibId);
        out.push({
          id: sibId,
          name: sib.data.label ?? "(sin nombre)",
          generation: a.generation,
          branch: a.branch,
          relation: siblingLabel(a.generation, sib.data.gender),
          origin: pickOrigin(facts.get(sibId)),
          childId: parentId,
          lateral: true,
        });
      }
    }
  }
  return out;
}

function siblingLabel(generation: number, gender: string | undefined): string {
  const f = gender === "F";
  if (generation === 1) return f ? "tía" : "tío";
  if (generation === 2) return f ? "tía abuela" : "tío abuelo";
  if (generation === 3) return f ? "tía bisabuela" : "tío bisabuelo";
  return f ? "hermana de antepasado" : "hermano de antepasado";
}

export type Filters = {
  /** Última generación que se cuenta (2 = abuelos). */
  maxGeneration: number;
  /** Primera generación que se cuenta (por defecto 1 = padres). Con min = max se ve una sola generación. */
  minGeneration?: number;
  branch: "all" | Branch;
  /** Ignora los lugares estimados por bautismo o matrimonio. */
  birthOnly: boolean;
};

export type ComunaSummary = {
  code: string;
  regionCode: string;
  count: number;
  /** Cuántos de esos son por nacimiento (los demás son estimados). */
  birthCount: number;
  people: Ancestor[];
};

export type Summary = {
  total: number;
  byComuna: Map<string, ComunaSummary>;
  byRegion: Map<string, number>;
  abroad: Ancestor[];
  unlocated: Ancestor[];
  none: Ancestor[];
};

export function summarize(ancestors: Ancestor[], filters: Filters): Summary {
  const byComuna = new Map<string, ComunaSummary>();
  const byRegion = new Map<string, number>();
  const abroad: Ancestor[] = [];
  const unlocated: Ancestor[] = [];
  const none: Ancestor[] = [];
  let total = 0;

  for (const a of ancestors) {
    if (a.generation > filters.maxGeneration || a.generation < (filters.minGeneration ?? 1)) continue;
    if (filters.branch !== "all" && a.branch !== filters.branch) continue;
    total++;

    // Con "solo nacimientos", lo que sale de otro dato se vuelve a ver como "sin lugar".
    const o = filters.birthOnly && a.origin.kind !== "none" && a.origin.basis !== "birth" ? ({ kind: "none" } as const) : a.origin;

    if (o.kind === "comuna") {
      const cur =
        byComuna.get(o.code) ?? { code: o.code, regionCode: o.regionCode, count: 0, birthCount: 0, people: [] };
      cur.count++;
      if (o.basis === "birth") cur.birthCount++;
      cur.people.push(a);
      byComuna.set(o.code, cur);
      byRegion.set(o.regionCode, (byRegion.get(o.regionCode) ?? 0) + 1);
    } else if (o.kind === "abroad") abroad.push(a);
    else if (o.kind === "unlocated") unlocated.push(a);
    else none.push(a);
  }
  return { total, byComuna, byRegion, abroad, unlocated, none };
}

/** La cantidad más alta de antepasados en una sola comuna (para la escala de color). */
export function maxPerComuna(summary: Summary): number {
  let max = 0;
  for (const c of summary.byComuna.values()) max = Math.max(max, c.count);
  return max;
}

/** Cuántas generaciones hay en total (para el selector de generación). */
export function generationCount(ancestors: Ancestor[]): number {
  return ancestors.reduce((m, a) => Math.max(m, a.generation), 0);
}

const GENERATION_NAMES: Record<number, string> = {
  1: "Padres", 2: "Abuelos", 3: "Bisabuelos", 4: "Tatarabuelos", 5: "Trastatarabuelos",
};

/** "Abuelos", "Bisabuelos"… y "Generación 6" cuando ya no hay nombre de uso común. */
export function generationLabel(generation: number): string {
  return GENERATION_NAMES[generation] ?? `Generación ${generation}`;
}

/** Los antepasados agrupados por generación, de la más cercana a la más lejana. */
export function groupByGeneration(list: Ancestor[]): { generation: number; label: string; people: Ancestor[] }[] {
  const gens = [...new Set(list.map((a) => a.generation))].sort((a, b) => a - b);
  return gens.map((g) => ({ generation: g, label: generationLabel(g), people: list.filter((a) => a.generation === g) }));
}

/** Las regiones con más antepasados, de mayor a menor: [código, cantidad]. */
export function topRegions(summary: Summary, limit = 3): [string, number][] {
  return [...summary.byRegion.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit);
}

/** Cuántos tienen algún lugar conocido (en Chile o fuera) sobre el total filtrado. */
export function locatedCount(summary: Summary): number {
  return summary.total - summary.none.length;
}

/**
 * Qué es el antepasado para la persona del mapa, en palabras de la familia:
 * "Su tatarabuelo, por parte de su mamá". `tercera` = false dice "tu" (es el mapa de quien mira).
 */
export function ancestorPhrase(a: Pick<Ancestor, "relation" | "branch" | "generation">, tercera = false): string {
  const poss = tercera ? "su" : "tu";
  if (a.generation === 1 && !(a.relation === "tío" || a.relation === "tía")) {
    return `${poss.charAt(0).toUpperCase()}${poss.slice(1)} ${a.relation === "madre" ? "mamá" : a.relation === "padre" ? "papá" : a.relation}`;
  }
  const lado = a.branch === "materna" ? "mamá" : "papá";
  return `${poss.charAt(0).toUpperCase()}${poss.slice(1)} ${a.relation}, por parte de ${poss} ${lado}`;
}
