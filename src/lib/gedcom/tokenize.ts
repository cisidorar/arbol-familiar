import type { GedcomLine, GedcomNode } from "./types";

// Una línea GEDCOM: "<nivel> [@xref@] <TAG> [valor]"
const LINE_RE = /^(\d+)\s+(@[^@]+@\s+)?(\S+)(?:\s(.*))?$/;

export function tokenize(raw: string): GedcomLine[] {
  // MyHeritage exporta con BOM y CRLF; normalizamos antes de partir líneas.
  const text = raw.replace(/^﻿/, "").replace(/\r\n/g, "\n");
  const lines: GedcomLine[] = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    if (line.trim() === "") continue;
    const m = LINE_RE.exec(line);
    if (!m) {
      throw new Error(`Línea GEDCOM no reconocida: ${JSON.stringify(line)}`);
    }
    const [, levelStr, xrefRaw, tag, value] = m;
    lines.push({
      level: Number(levelStr),
      xref: xrefRaw ? xrefRaw.trim() : null,
      tag,
      value: value ?? "",
    });
  }
  return lines;
}

/**
 * Convierte la lista plana de líneas en árboles de nivel 0: uno por registro
 * (cada INDI, FAM, SOUR, HEAD...). Usa una pila para anidar según el nivel.
 */
export function buildTree(lines: GedcomLine[]): { xref: string | null; tag: string; value: string; children: GedcomNode[] }[] {
  const roots: { xref: string | null; tag: string; value: string; children: GedcomNode[] }[] = [];
  // pila de nodos abiertos, indexada por nivel
  const stack: GedcomNode[] = [];

  for (const line of lines) {
    const node: GedcomNode = { level: line.level, tag: line.tag, value: line.value, children: [] };

    if (line.level === 0) {
      roots.push({ xref: line.xref, tag: line.tag, value: line.value, children: [] });
      stack.length = 0;
      stack.push(node); // node.children === roots[last].children sería ideal; lo resolvemos abajo
      // Reemplazamos el children del root por el mismo array que iremos llenando.
      node.children = roots[roots.length - 1].children;
      continue;
    }

    // Recorta la pila hasta encontrar el padre correcto (nivel = line.level - 1)
    while (stack.length > 0 && stack[stack.length - 1].level >= line.level) {
      stack.pop();
    }
    const parent = stack[stack.length - 1];
    if (!parent) {
      throw new Error(`Línea de nivel ${line.level} sin padre: ${line.tag} ${line.value}`);
    }
    parent.children.push(node);
    stack.push(node);
  }

  return roots;
}

export function parseGedcomToTree(raw: string) {
  return buildTree(tokenize(raw));
}
