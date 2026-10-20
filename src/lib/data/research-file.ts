import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getPool } from "../db/pool";
import { parseResearch, type ResearchIndex } from "../research";

export const RESEARCH_FILE = join("data", "investigacion.json");

const EMPTY: ResearchIndex = { byUid: new Map(), people: [], problems: [] };
const TTL_MS = 30_000;

const cache = new Map<string, { at: number; index: ResearchIndex }>();

/**
 * Hechos investigados de un árbol. Vienen de la tabla `research_files` (así
 * funcionan también publicada la app); si la base aún no los tiene, se lee
 * `data/investigacion.json` si existe (desarrollo local). Se relee cada 30
 * segundos. Si algo falla, la ficha sigue con lo que hay en la base y el
 * problema queda en la consola del servidor.
 */
export async function loadResearch(treeId: string): Promise<ResearchIndex> {
  const hit = cache.get(treeId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.index;

  let index: ResearchIndex;
  try {
    const { rows } = await getPool().query(`select content from research_files where tree_id = $1`, [treeId]);
    if (rows[0]) {
      index = parseResearch(rows[0].content);
    } else {
      try {
        index = parseResearch(JSON.parse(readFileSync(join(process.cwd(), RESEARCH_FILE), "utf-8")));
      } catch {
        index = EMPTY;
      }
    }
  } catch (err) {
    index = { ...EMPTY, problems: [`No se pudo leer la investigación: ${(err as Error).message}`] };
  }
  for (const problem of index.problems) console.warn(`[investigación] ${problem}`);
  cache.set(treeId, { at: Date.now(), index });
  return index;
}
