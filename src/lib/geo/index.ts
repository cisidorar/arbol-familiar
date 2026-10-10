// Geometría del mapa de Chile (límites de la BCN ya convertidos a trazos SVG
// por scripts/build-map.mjs). Solo para el servidor: pesa unos 180 KB y a la
// pantalla solo se le manda lo que usa.

import regionesJson from "./regiones.json";
import c01 from "./comunas-01.json";
import c02 from "./comunas-02.json";
import c03 from "./comunas-03.json";
import c04 from "./comunas-04.json";
import c05 from "./comunas-05.json";
import c06 from "./comunas-06.json";
import c07 from "./comunas-07.json";
import c08 from "./comunas-08.json";
import c09 from "./comunas-09.json";
import c10 from "./comunas-10.json";
import c11 from "./comunas-11.json";
import c12 from "./comunas-12.json";
import c13 from "./comunas-13.json";
import c14 from "./comunas-14.json";
import c15 from "./comunas-15.json";
import c16 from "./comunas-16.json";

export type Box = [number, number, number, number];
export type GeoRegion = { code: string; name: string; d: string; bbox: Box };
export type GeoComuna = { code: string; name: string; province: string; d: string; bbox: Box; island?: boolean };

/** Las 16 regiones, de norte a sur. */
export const REGIONES = regionesJson as GeoRegion[];

const FILES = [c01, c02, c03, c04, c05, c06, c07, c08, c09, c10, c11, c12, c13, c14, c15, c16] as unknown as {
  region: string;
  comunas: GeoComuna[];
}[];

export function comunasOfRegion(regionCode: string): GeoComuna[] {
  return FILES.find((f) => f.region === regionCode)?.comunas ?? [];
}

/**
 * Las comunas que dibuja el mapa ampliado: las de las regiones con datos y las
 * que quedan entre ellas (para que no queden huecos en el medio del mapa).
 */
export function zoneComunas(regionCodesWithData: string[]): GeoComuna[] {
  const order = REGIONES.map((r) => r.code);
  const idx = regionCodesWithData.map((c) => order.indexOf(c)).filter((i) => i >= 0);
  if (!idx.length) return [];
  const [lo, hi] = [Math.min(...idx), Math.max(...idx)];
  return order.slice(lo, hi + 1).flatMap((code) => comunasOfRegion(code));
}
