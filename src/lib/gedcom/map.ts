import { parseGedcomDate } from "./dates";
import type {
  GedcomNode,
  ParsedCitation,
  ParsedEvent,
  ParsedFamily,
  ParsedGedcom,
  ParsedMedia,
  ParsedName,
  ParsedPerson,
  ParsedSource,
} from "./types";

function child(node: GedcomNode, tag: string): GedcomNode | undefined {
  return node.children.find((c) => c.tag === tag);
}
function children(node: GedcomNode, tag: string): GedcomNode[] {
  return node.children.filter((c) => c.tag === tag);
}
function text(node: GedcomNode | undefined): string | null {
  return node && node.value.trim() !== "" ? node.value.trim() : null;
}

// Tipos de hecho que reconocemos como "evento" (persona o familia).
const PERSON_EVENT_TAGS = [
  "BIRT", "DEAT", "BURI", "BAPM", "RESI", "OCCU", "EDUC", "NATI", "EVEN",
];
const FAMILY_EVENT_TAGS = ["MARR", "DIV", "ENGA", "MARS", "MARC", "EVEN"];

// Marcadores internos de MyHeritage que vienen como EVEN pero no son hechos
// genealógicos (p.ej. "MYHERITAGE:REL_PARTNERS"): se descartan al vuelo.
function isInternalMarker(ev: ParsedEvent): boolean {
  return ev.type === "EVEN" && (ev.subtype?.startsWith("MYHERITAGE:") ?? false);
}

function parseEventNode(node: GedcomNode): ParsedEvent {
  const dateNode = child(node, "DATE");
  const placeNode = child(node, "PLAC");
  const noteNode = child(node, "NOTE");
  const causNode = child(node, "CAUS");
  const typeNode = child(node, "TYPE");

  // El propio tag suele traer el detalle en línea (p.ej. "1 OCCU Zapatería de un
  // Celedonio Morales" o "1 EVEN Elección municipal con 144 votos..."). GEDCOM
  // también usa esa misma posición para un simple "Y" cuando el hecho solo
  // confirma que ocurrió sin detalle (p.ej. "1 DEAT Y"), así que ese valor no
  // cuenta como texto libre.
  const ownValue = node.value.trim();
  const ownText = ownValue && ownValue.toUpperCase() !== "Y" ? ownValue : null;

  const descParts = [ownText, text(causNode), text(noteNode)].filter(Boolean);

  return {
    type: node.tag,
    subtype: text(typeNode),
    date: dateNode && dateNode.value.trim() !== "" ? parseGedcomDate(dateNode.value) : null,
    placeText: text(placeNode),
    description: descParts.length ? descParts.join(" — ") : null,
  };
}

function parseCitation(s: GedcomNode): ParsedCitation {
  const dataNode = child(s, "DATA");
  const textNode = dataNode ? child(dataNode, "TEXT") : undefined;
  const quayNode = child(s, "QUAY");
  return {
    sourceXref: s.value,
    page: text(child(s, "PAGE")),
    quay: quayNode && quayNode.value.trim() !== "" ? Number(quayNode.value.trim()) : null,
    transcription: text(textNode),
    eventType: text(child(s, "EVEN")),
  };
}

function parseCitations(node: GedcomNode): ParsedCitation[] {
  return children(node, "SOUR")
    .filter((s) => s.value.startsWith("@"))
    .map(parseCitation);
}

function parseMedia(node: GedcomNode): ParsedMedia[] {
  return children(node, "OBJE").map((o) => {
    const posNode = child(o, "_POSITION");
    let cropBox = null;
    if (posNode && posNode.value.trim()) {
      const parts = posNode.value.trim().split(/\s+/).map(Number);
      if (parts.length === 4 && parts.every((n) => !Number.isNaN(n))) {
        cropBox = { x1: parts[0], y1: parts[1], x2: parts[2], y2: parts[3] };
      }
    }
    const sizeNode = child(o, "_FILESIZE");
    return {
      form: text(child(o, "FORM")),
      fileUrl: text(child(o, "FILE")),
      fileSize: sizeNode && sizeNode.value.trim() ? Number(sizeNode.value.trim()) : null,
      title: text(child(o, "TITL")),
      isPrimary: text(child(o, "_PRIM")) === "Y" || text(child(o, "_PERSONALPHOTO")) === "Y",
      cropBox,
    };
  });
}

function parseName(node: GedcomNode): ParsedName {
  const givn = text(child(node, "GIVN"));
  const surn = text(child(node, "SURN"));
  const npfx = text(child(node, "NPFX"));
  const nsfx = text(child(node, "NSFX"));

  // SURN suele traer uno o dos apellidos separados por espacio ("Zamora Canelo").
  // Partimos en el primer espacio: paterno = primera palabra, materno = el resto.
  // Esto es una aproximación: apellidos compuestos quedan mal y se revisan a mano.
  let surnamePat: string | null = null;
  let surnameMat: string | null = null;
  if (surn) {
    const parts = surn.split(/\s+/);
    surnamePat = parts[0] ?? null;
    surnameMat = parts.slice(1).join(" ") || null;
  }

  const given = givn ?? (node.value.replace(/\/.*\//, "").trim() || null);
  const display =
    [given, surn].filter(Boolean).join(" ").trim() ||
    node.value.replace(/\//g, "").trim() ||
    "(sin nombre)"; // registro real sin NAME/GIVN/SURN, p.ej. "1 NAME  //"

  return {
    type: "birth",
    given,
    surnamePat,
    surnameMat,
    prefix: npfx,
    suffix: nsfx,
    display,
    isPrimary: true,
  };
}

function parseMarriedName(node: GedcomNode, baseName: ParsedName): ParsedName | null {
  const marnm = child(node, "_MARNM");
  if (!marnm || !marnm.value.trim()) return null;
  return {
    type: "married",
    given: baseName.given,
    surnamePat: marnm.value.trim(),
    surnameMat: null,
    prefix: null,
    suffix: null,
    display: [baseName.given, marnm.value.trim()].filter(Boolean).join(" "),
    isPrimary: false,
  };
}

function parsePerson(node: GedcomNode): ParsedPerson {
  const xref = (node as unknown as { xref?: string }).xref ?? "";
  const uidNode = child(node, "_UID");
  const sexNode = child(node, "SEX");

  const names: ParsedName[] = [];
  for (const nameNode of children(node, "NAME")) {
    const base = parseName(nameNode);
    names.push(base);
    const married = parseMarriedName(nameNode, base);
    if (married) names.push(married);
  }
  if (names.length === 0) {
    names.push({
      type: "birth", given: null, surnamePat: null, surnameMat: null,
      prefix: null, suffix: null, display: "(sin nombre)", isPrimary: true,
    });
  }

  const events: ParsedEvent[] = [];
  const citations: ParsedCitation[] = [];
  const media: ParsedMedia[] = [...parseMedia(node)];
  const famsXrefs: string[] = [];
  const famcXrefs: string[] = [];
  const raw: GedcomNode[] = [];

  const consumedChildKeys = new Set<GedcomNode>();

  for (const c of node.children) {
    if (c.tag === "NAME" || c.tag === "OBJE" || c.tag === "_UID" || c.tag === "SEX") continue;
    if (c.tag === "FAMS") {
      famsXrefs.push(c.value);
      continue;
    }
    if (c.tag === "FAMC") {
      famcXrefs.push(c.value);
      continue;
    }
    if (PERSON_EVENT_TAGS.includes(c.tag)) {
      const ev = parseEventNode(c);
      if (!isInternalMarker(ev)) events.push(ev);
      citations.push(...parseCitations(c));
      continue;
    }
    if (c.tag === "SOUR" && c.value.startsWith("@")) {
      citations.push(parseCitation(c));
      continue;
    }
    if (c.tag === "RIN" || c.tag === "_UPD") continue; // metadatos de MyHeritage, sin valor genealógico
    raw.push(c);
  }

  return {
    xref,
    gedcomUid: text(uidNode),
    sex: (text(sexNode) as "M" | "F") ?? "U",
    names,
    events,
    media,
    citations,
    famsXrefs,
    famcXrefs,
    raw,
  };
}

function parseFamily(node: GedcomNode): ParsedFamily {
  const xref = (node as unknown as { xref?: string }).xref ?? "";
  const uidNode = child(node, "_UID");
  const events: ParsedEvent[] = [];
  const childXrefs: string[] = [];
  const raw: GedcomNode[] = [];
  let husbXref: string | null = null;
  let wifeXref: string | null = null;

  for (const c of node.children) {
    if (c.tag === "HUSB") { husbXref = c.value; continue; }
    if (c.tag === "WIFE") { wifeXref = c.value; continue; }
    if (c.tag === "CHIL") { childXrefs.push(c.value); continue; }
    if (FAMILY_EVENT_TAGS.includes(c.tag)) {
      const ev = parseEventNode(c);
      // MyHeritage exporta como "MARS" (en GEDCOM, "capitulaciones") lo que
      // en este archivo es el matrimonio de la pareja: se guarda como tal.
      if (ev.type === "MARS") ev.type = "MARR";
      if (!isInternalMarker(ev)) events.push(ev);
      continue;
    }
    if (c.tag === "_UID" || c.tag === "RIN" || c.tag === "_UPD") continue;
    raw.push(c);
  }

  return { xref, gedcomUid: text(uidNode), husbXref, wifeXref, childXrefs, events, raw };
}

function parseSource(node: GedcomNode): ParsedSource {
  const xref = (node as unknown as { xref?: string }).xref ?? "";
  return {
    xref,
    title: text(child(node, "TITL")),
    author: text(child(node, "AUTH")),
    repository: text(child(node, "REPO")),
    text: text(child(node, "TEXT")),
  };
}

export function mapGedcomTree(
  roots: { xref: string | null; tag: string; value: string; children: GedcomNode[] }[],
): ParsedGedcom {
  const persons: ParsedPerson[] = [];
  const families: ParsedFamily[] = [];
  const sources: ParsedSource[] = [];
  const unrecognizedTopLevel: GedcomNode[] = [];

  for (const root of roots) {
    const node: GedcomNode = { level: 0, tag: root.tag, value: root.value, children: root.children };
    (node as unknown as { xref?: string }).xref = root.xref ?? undefined;

    if (root.tag === "INDI") persons.push(parsePerson(node));
    else if (root.tag === "FAM") families.push(parseFamily(node));
    else if (root.tag === "SOUR") sources.push(parseSource(node));
    else if (root.tag === "HEAD" || root.tag === "TRLR") continue;
    else unrecognizedTopLevel.push(node);
  }

  return { persons, families, sources, unrecognizedTopLevel };
}
