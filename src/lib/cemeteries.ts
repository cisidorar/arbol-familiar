// Cementerios: quiénes están sepultados en cada uno. Lógica pura (sin base de datos)
// para probarla sola; la usa la página /cementerios.

import { canonicalCemetery } from "./geo/cemeteries";
import { normName } from "./geo/places";

export type BurialRow = {
  /** El hecho de sepultura (para anotar la ubicación de la tumba). */
  eventId?: string | null;
  personId: string;
  personName: string;
  placeText: string;
  normalized: string | null;
  locality: string | null;
  comunaCode?: string | null;
  regionCode?: string | null;
  birth: string | null;
  death: string | null;
  /** Fecha del entierro, si se anotó. */
  buried: string | null;
  /** Nota del entierro ("Ubicación en el cementerio: cruz 158, patio 8"). */
  note: string | null;
};

export type Burial = {
  eventId: string | null;
  personId: string;
  name: string;
  birth: string | null;
  death: string | null;
  buried: string | null;
  /** Dónde dentro del cementerio (cruz, patio, sección…), si se sabe. */
  spot: string | null;
  /** Qué es para la persona del usuario ("tatarabuelo · rama materna"); lo llena la página. */
  relation?: string | null;
  /** "M" / "F" (o null si no se sabe); lo llena la página. */
  sex?: string | null;
  /** Pasos en el árbol hasta la persona del usuario (para ordenar); lo llena la página. */
  distance?: number | null;
};

export type CemeteryGroup = {
  /** Sirve para la dirección (?lugar=) y para reconocer el mismo cementerio escrito de distintas maneras. */
  key: string;
  name: string;
  locality: string | null;
  comunaCode: string | null;
  regionCode: string | null;
  /** Hay un lugar anotado pero no se sabe qué cementerio es, o no dice la comuna. */
  incomplete: boolean;
  people: Burial[];
};

const SPOT_PREFIX = /^ubicaci[oó]n en el cementerio:\s*/i;

/** Un año o fecha corta para mostrar: toma el primer año de cuatro cifras del texto. */
export function yearOf(text: string | null): string | null {
  const m = text ? /\b(1[0-9]{3}|20[0-9]{2})\b/.exec(text) : null;
  return m ? m[1] : null;
}

/** Junta los entierros por cementerio (las distintas formas de escribirlo cuentan como uno). */
export function groupBurials(rows: BurialRow[]): CemeteryGroup[] {
  const groups = new Map<string, CemeteryGroup>();
  for (const r of rows) {
    const info = canonicalCemetery(r.normalized ?? r.placeText, true) ?? canonicalCemetery(r.placeText, true);
    const known = info && (info.kind === "cemetery" || info.kind === "ambiguous");
    const site = (info?.display ?? r.placeText).replace(/,\s*Chile$/i, "");
    const key = info && info.kind !== "not-a-place" ? info.key : normName(r.placeText);
    const detail = info?.detail ?? null;
    const noteSpot = r.note?.replace(SPOT_PREFIX, "").trim() || null;

    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        name: info?.kind === "not-a-place" ? "Cremación" : site,
        locality: info?.locality ?? r.locality,
        comunaCode: info?.comunaCode ?? r.comunaCode ?? null,
        regionCode: info?.regionCode ?? r.regionCode ?? null,
        incomplete: !known || info.kind === "ambiguous",
        people: [],
      };
      groups.set(key, g);
    }
    if (g.people.some((p) => p.personId === r.personId)) continue;
    g.people.push({
      eventId: r.eventId ?? null,
      personId: r.personId,
      name: r.personName,
      birth: yearOf(r.birth),
      death: yearOf(r.death),
      buried: r.buried,
      spot: detail ?? (noteSpot && SPOT_PREFIX.test(r.note ?? "") ? noteSpot : null),
    });
  }
  for (const g of groups.values()) g.people.sort((a, b) => a.name.localeCompare(b.name, "es"));
  return [...groups.values()].sort((a, b) => b.people.length - a.people.length || a.name.localeCompare(b.name, "es"));
}
