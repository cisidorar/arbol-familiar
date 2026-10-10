import { parseGedcomToTree } from "./tokenize";
import { mapGedcomTree } from "./map";
import type { ParsedGedcom } from "./types";

export function parseGedcom(raw: string): ParsedGedcom {
  const tree = parseGedcomToTree(raw);
  return mapGedcomTree(tree);
}

export * from "./types";
export { parseGedcomDate } from "./dates";
