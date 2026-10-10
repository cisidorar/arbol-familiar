// Tipos del parser GEDCOM 5.5.1 (export de MyHeritage).

/** Una línea cruda del archivo, ya separada en sus partes. */
export interface GedcomLine {
  level: number;
  xref: string | null; // "@I1@" si la línea lo trae
  tag: string;
  value: string;
}

/** Un registro reconstruido como árbol: nivel 0 con hijos anidados. */
export interface GedcomNode {
  level: number;
  tag: string;
  value: string;
  children: GedcomNode[];
}

/** Rango de fecha interpretado a partir del texto original de GEDCOM. */
export interface ParsedDate {
  text: string; // tal como viene en el archivo
  from: string | null; // ISO yyyy-mm-dd, inicio del rango
  to: string | null; // ISO yyyy-mm-dd, fin del rango (igual a from si es exacta)
}

export interface ParsedEvent {
  type: string; // BIRT, DEAT, MARR, BURI, OCCU, EDUC, RESI, EVEN, DIV, ENGA, NATI...
  subtype: string | null; // TYPE
  date: ParsedDate | null;
  placeText: string | null;
  description: string | null; // NOTE / CAUS
}

export interface ParsedMedia {
  form: string | null;
  fileUrl: string | null;
  fileSize: number | null;
  title: string | null;
  isPrimary: boolean;
  cropBox: { x1: number; y1: number; x2: number; y2: number } | null;
}

export interface ParsedName {
  type: "birth" | "married" | "alias" | "other";
  given: string | null;
  surnamePat: string | null; // primer apellido de SURN
  surnameMat: string | null; // segundo apellido de SURN, si lo trae
  prefix: string | null;
  suffix: string | null;
  display: string;
  isPrimary: boolean;
}

export interface ParsedCitation {
  sourceXref: string;
  page: string | null;
  quay: number | null;
  transcription: string | null;
  /** Tipo de hecho que esta cita documenta (subetiqueta EVEN de MyHeritage), si viene. */
  eventType: string | null;
}

export interface ParsedPerson {
  xref: string; // "@I1@"
  gedcomUid: string | null; // _UID
  sex: "M" | "F" | "U";
  names: ParsedName[];
  events: ParsedEvent[];
  media: ParsedMedia[];
  citations: ParsedCitation[]; // citas a nivel persona (poco frecuente)
  famsXrefs: string[]; // familias donde es cónyuge
  famcXrefs: string[]; // familias donde es hijo
  raw: GedcomNode[]; // hijos de nivel 1 no reconocidos, para gedcom_raw
}

export interface ParsedFamily {
  xref: string;
  gedcomUid: string | null;
  husbXref: string | null;
  wifeXref: string | null;
  childXrefs: string[];
  events: ParsedEvent[]; // MARR, DIV, ENGA...
  raw: GedcomNode[];
}

export interface ParsedSource {
  xref: string;
  title: string | null;
  author: string | null;
  repository: string | null;
  text: string | null;
}

export interface ParsedGedcom {
  persons: ParsedPerson[];
  families: ParsedFamily[];
  sources: ParsedSource[];
  unrecognizedTopLevel: GedcomNode[]; // registros 0-level que no son INDI/FAM/SOUR/HEAD/TRLR
}
