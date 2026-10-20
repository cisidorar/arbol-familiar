// El lugar de un hecho como texto ("Hospital X, Recoleta") <-> comuna y lugar exacto.

import { PROVINCE_NAMES, comunaByName, normName } from "./places";

/**
 * Parte un lugar guardado como texto ("Hospital San Vicente de Paul, Recoleta, Santiago")
 * en la comuna que nombra y el resto (el lugar exacto). Si ninguna parte es una comuna, no hay estructura.
 */
export function splitPlace(text: string): { regionCode: string; comunaCode: string; detail: string } | null {
  const parts = text.split(",").map((p) => p.trim()).filter(Boolean);
  const hits = parts.map((p) => ({ p, c: comunaByName(p) })).filter((x) => x.c);
  if (hits.length === 0) return null;
  // "…, Santiago, San Miguel": Santiago es la ciudad (o provincia) y la comuna es San Miguel:
  // se prefiere la que no es también el nombre de una provincia, y si no, la última.
  const hit = [...hits].reverse().find((x) => !PROVINCE_NAMES.has(normName(x.c![1]))) ?? hits[hits.length - 1];
  const rest = parts.filter((p) => p !== hit.p);
  return { regionCode: hit.c![2], comunaCode: hit.c![0], detail: rest.join(", ") };
}

/** Une el lugar exacto con la comuna sin repetirla. */
export function composePlace(detail: string, comunaName: string): string {
  const d = detail.trim().replace(/[,\s]+$/, "");
  if (!comunaName) return d;
  if (!d) return comunaName;
  return normName(d).includes(normName(comunaName)) ? d : `${d}, ${comunaName}`;
}

