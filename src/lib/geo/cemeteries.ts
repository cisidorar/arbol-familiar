// Cementerios: una sola forma para escribir cada uno, con su comuna.
// Lógica pura (sin base de datos) para probarla sola; la usan scripts/normalize-cemeteries.ts
// y el guardado de lugares nuevos desde la ficha.

import { COMUNAS, comunaByName, normName, type ComunaEntry } from "./places";

export type CemeteryKind =
  /** Cementerio con comuna reconocida: se puede estandarizar y juntar con sus variantes. */
  | "cemetery"
  /** Parece un cementerio, pero el texto no dice dónde (p. ej. "Cementerio General"). */
  | "ambiguous"
  /** Es el lugar de un entierro, pero no se sabe qué cementerio es (p. ej. "San Pedro"). */
  | "unknown"
  /** No es un lugar ("Cremado"). */
  | "not-a-place";

export type CemeteryInfo = {
  kind: CemeteryKind;
  /** Nombre estándar, p. ej. "Cementerio Parroquial de Buin, Chile". */
  display: string;
  locality: string | null;
  comunaCode: string | null;
  regionCode: string | null;
  /** Lo que sigue a la "/" (cruz, patio, sección…): es del entierro, no del cementerio. */
  detail: string | null;
  /** Clave para reconocer el mismo cementerio escrito de distintas maneras. */
  key: string;
};

const CEMETERY_WORD = /\b(cementerio|cementario|camposanto|campo santo|panteon|mausoleo|crematorio)\b/i;
const SMALL_WORDS = new Set(["de", "del", "la", "las", "los", "el", "y"]);
const WORD_FIXES: Record<string, string> = {
  catolico: "Católico", parroquian: "Parroquial", cementario: "Cementerio", judio: "Judío", ingles: "Inglés",
};

export function looksLikeCemetery(text: string): boolean {
  return CEMETERY_WORD.test(normName(text));
}

function titleCase(text: string): string {
  return text
    .split(" ")
    .filter(Boolean)
    .map((w, i) => {
      const lower = w.toLowerCase();
      const fixed = WORD_FIXES[normName(w)];
      if (fixed) return fixed;
      if (i > 0 && SMALL_WORDS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

/** Saca "de Buin", "Curico"… del final del nombre si es una comuna; devuelve el nombre sin ella. */
function splitTrailingComuna(name: string, hint?: string | null): { base: string; comuna: ComunaEntry | null } {
  const words = name.split(" ");
  for (let n = Math.min(3, words.length - 1); n >= 1; n--) {
    const tail = words.slice(-n).join(" ");
    const c = comunaByName(tail, hint ?? null);
    if (c) {
      let rest = words.slice(0, words.length - n);
      if (rest.length && SMALL_WORDS.has(rest[rest.length - 1].toLowerCase())) rest = rest.slice(0, -1);
      return { base: rest.join(" "), comuna: c };
    }
  }
  return { base: name, comuna: null };
}

/**
 * La forma estándar de un lugar que es (o puede ser) un cementerio.
 * `isBurial`: el lugar se usa en un entierro, así que aunque no diga "cementerio" se trata como tal.
 * Devuelve null si no es un cementerio ni un lugar de entierro.
 */
export function canonicalCemetery(text: string, isBurial = false): CemeteryInfo | null {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return null;
  if (!isBurial && !looksLikeCemetery(clean)) return null;

  const [siteRaw, ...detailParts] = clean.split("/").map((s) => s.trim()).filter(Boolean);
  const detail = detailParts.length ? detailParts.join(", ") : null;
  const parts = siteRaw.split(",").map((s) => s.trim()).filter((s) => s && normName(s) !== "chile");
  const empty = { display: clean, locality: null, comunaCode: null, regionCode: null, detail, key: normName(clean) };

  if (/^(cremad[oa]|cremaci[oó]n)$/i.test(parts[0] ?? "")) return { kind: "not-a-place", ...empty };

  let name = parts[0] ?? "";
  const norm = normName(name);
  // "Parroquial de Buin" / "Parroquia de Buin", usado en un entierro, es el cementerio parroquial.
  const par = /^parroquia(?:l)? de (.+)$/.exec(norm);
  if (isBurial && par && !looksLikeCemetery(name)) name = `Cementerio Parroquial de ${name.slice(name.toLowerCase().indexOf(" de ") + 4)}`;

  if (!looksLikeCemetery(name) && !/^parque /i.test(normName(name))) {
    // El lugar de un entierro, pero sin nombre de cementerio: no se adivina.
    return { kind: "unknown", ...empty, display: clean, key: normName(siteRaw) };
  }

  name = titleCase(name);
  // La comuna puede venir en el nombre ("… de Buin", "… Curicó") o como siguiente parte del texto.
  // (En un parque como "Parque Santiago" la palabra final es parte del nombre, no la comuna.)
  let { base, comuna } = looksLikeCemetery(name) ? splitTrailingComuna(name) : { base: name, comuna: null as ComunaEntry | null };
  if (!comuna) {
    for (const extra of parts.slice(1)) {
      const c = comunaByName(extra) ?? comunaByName(extra.split(" ").slice(-1)[0]);
      if (c) { comuna = c; break; }
    }
  }
  if (!comuna) {
    const display = name;
    return { kind: "ambiguous", display, locality: null, comunaCode: null, regionCode: null, detail, key: normName(display) };
  }

  const city = comuna[1];
  const plain = normName(base);
  // "Cementerio de Paine" y "Cementerio Parroquial de Buin" llevan la comuna en el nombre.
  const display =
    plain === "cementerio" || plain === "cementerio parroquial"
      ? `${base} de ${city}, Chile`
      : `${base}, ${city}, Chile`;
  return { kind: "cemetery", display, locality: city, comunaCode: comuna[0], regionCode: comuna[2], detail, key: normName(display) };
}

export { COMUNAS };
