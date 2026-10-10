import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseResearch, type ResearchIndex } from "../research";

export const RESEARCH_FILE = join("data", "investigacion.json");

const EMPTY: ResearchIndex = { byUid: new Map(), people: [], problems: [] };

let cache: { mtimeMs: number; index: ResearchIndex } | null = null;

/**
 * Lee `data/investigacion.json`. Se relee solo cuando el archivo cambia, así
 * que basta guardar el archivo y recargar la ficha para ver un hecho nuevo.
 * Si el archivo no existe o está mal escrito, la ficha sigue funcionando con
 * lo que hay en la base y el problema queda en la consola del servidor.
 */
export function loadResearch(): ResearchIndex {
  const path = join(process.cwd(), RESEARCH_FILE);
  let mtimeMs: number;
  try {
    mtimeMs = statSync(path).mtimeMs;
  } catch {
    return EMPTY;
  }
  if (cache?.mtimeMs === mtimeMs) return cache.index;

  let index: ResearchIndex;
  try {
    index = parseResearch(JSON.parse(readFileSync(path, "utf-8")));
  } catch (err) {
    index = { ...EMPTY, problems: [`No se pudo leer ${RESEARCH_FILE}: ${(err as Error).message}`] };
  }
  for (const problem of index.problems) console.warn(`[investigación] ${problem}`);
  cache = { mtimeMs, index };
  return index;
}
