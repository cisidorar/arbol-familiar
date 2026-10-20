// Une los lugares del árbol con las comunas oficiales de Chile (código CUT),
// sin geometría: solo el índice de nombres, así que es liviano y sirve tanto
// en el servidor como en scripts/normalize-places.ts.

import index from "./comunas-index.json";

/** [código de comuna, nombre, código de región] */
export type ComunaEntry = [string, string, string];
export const COMUNAS: ComunaEntry[] = index as ComunaEntry[];

/** Sin tildes, en minúsculas y con espacios simples: para comparar nombres. */
export function normName(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const REGION_BY_NAME: [RegExp, string][] = [
  [/arica/, "15"], [/tarapaca/, "01"], [/antofagasta/, "02"], [/atacama/, "03"], [/coquimbo/, "04"],
  [/valparaiso/, "05"], [/metropolitana/, "13"], [/higgins/, "06"], [/maule/, "07"], [/nuble/, "16"],
  [/biobio|bio bio/, "08"], [/araucania/, "09"], [/los rios/, "14"], [/los lagos/, "10"], [/aysen/, "11"],
  [/magallanes/, "12"],
];

/** "Región Metropolitana" → "13"; null si no se reconoce. */
export function regionCodeOf(admin1: string | null | undefined): string | null {
  if (!admin1) return null;
  const n = normName(admin1);
  return REGION_BY_NAME.find(([re]) => re.test(n))?.[1] ?? null;
}

const BY_NAME = new Map<string, ComunaEntry[]>();
for (const c of COMUNAS) {
  const k = normName(c[1]);
  BY_NAME.set(k, [...(BY_NAME.get(k) ?? []), c]);
}

/** La comuna con ese nombre. Si hay más de una, hace falta la región para elegir; si no alcanza, null. */
export function comunaByName(name: string, regionCode?: string | null): ComunaEntry | null {
  const found = BY_NAME.get(normName(name)) ?? [];
  if (found.length === 1) return found[0];
  if (found.length > 1 && regionCode) {
    const inRegion = found.filter((c) => c[2] === regionCode);
    if (inRegion.length === 1) return inRegion[0];
  }
  return null;
}

/** Comunas cuyo nombre es también el de su provincia (y por eso un texto puede nombrarlas como ciudad, no como comuna). */
export const PROVINCE_NAMES = new Set(
  [
    "Arica", "Iquique", "Antofagasta", "Tocopilla", "Copiapó", "Chañaral", "Isla de Pascua", "Los Andes", "Petorca",
    "Quillota", "San Antonio", "San Felipe", "Valparaíso", "Cauquenes", "Curicó", "Linares", "Talca", "Arauco",
    "Concepción", "Valdivia", "Osorno", "Palena", "Coyhaique", "Aysén", "Magallanes", "Santiago", "Melipilla",
    "Talagante", "Cachapoal", "Cardenal Caro", "Colchagua", "Chacabuco",
  ].map(normName),
);

export type PlaceColumns = {
  comunaCode?: string | null;
  regionCode?: string | null;
  locality?: string | null;
  admin1?: string | null;
  country?: string | null;
  rawText?: string | null;
};

/**
 * La comuna de un lugar, de la más segura a la menos: el código ya guardado,
 * el nombre estandarizado (locality) y, mientras los lugares no estén
 * estandarizados, el primer nombre del texto original que sea una comuna
 * ("Romeral, Curicó" → Romeral).
 */
export function resolveComuna(p: PlaceColumns): { code: string; regionCode: string } | null {
  if (p.comunaCode) {
    const known = COMUNAS.find((c) => c[0] === p.comunaCode);
    if (known) return { code: known[0], regionCode: known[2] };
  }
  const region = p.regionCode ?? regionCodeOf(p.admin1);
  if (p.locality) {
    const c = comunaByName(p.locality, region);
    if (c) return { code: c[0], regionCode: c[2] };
  }
  if (p.rawText && !p.locality) {
    const found: ComunaEntry[] = [];
    for (const token of p.rawText.split(",")) {
      const c = comunaByName(token.trim(), region);
      if (c && !found.includes(c)) found.push(c);
    }
    // "Hospital X, Santiago, San Miguel": Santiago es la ciudad o provincia y la comuna es San Miguel.
    // Si hay varias, se prefiere la que no es también el nombre de una provincia.
    const c = found.find((x) => !PROVINCE_NAMES.has(normName(x[1]))) ?? found[0];
    if (c) return { code: c[0], regionCode: c[2] };
  }
  return null;
}

/** País de un lugar que no está en Chile (null si es Chile o no se sabe). */
export function foreignCountry(p: PlaceColumns): string | null {
  if (p.country && normName(p.country) !== "chile") return p.country;
  if (!p.country && p.rawText) {
    const m = /\b(argentina|peru|perú|bolivia|espana|españa|italia|alemania|francia)\b/i.exec(p.rawText);
    if (m) return m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
  }
  return null;
}
