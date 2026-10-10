// Convierte la cartografía de la Biblioteca del Congreso Nacional (BCN) —tal como
// la procesa el paquete MIT `react-chile-map`— en trazos SVG ya proyectados, para
// que la app dibuje el mapa de orígenes sin librerías de mapas ni conexión.
//
// Uso (desde la raíz del proyecto):
//   npm i --no-save react-chile-map@0.2.1 topojson-client
//   node scripts/build-map.mjs
//
// Salida en src/lib/geo/:
//   regiones.json            las 16 regiones, simplificadas (vista de todo Chile, sin islas del Pacífico ni Antártica)
//   comunas-NN.json          las comunas de la región NN, con su trazo y su caja
//   comunas-index.json       [código, nombre, región] de las 346 comunas (para unir lugares con comunas)
//
// Proyección: equirrectangular con la longitud escalada por cos(35°); 1 unidad = 0,01°.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { feature } from "topojson-client";

const SRC = process.argv[2] ?? "node_modules/react-chile-map/data";
const OUT = process.argv[3] ?? "src/lib/geo";
mkdirSync(OUT, { recursive: true });

const K = Math.cos((35 * Math.PI) / 180);
const proj = ([lon, lat]) => [Math.round((lon + 110) * K * 100), Math.round(-lat * 100)];

// Lo que queda al oeste de -76,5° (Pascua, Juan Fernández, Desventuradas) o al sur de -57° (Antártica) no es el continente.
const isMainland = (ring) => {
  const lons = ring.map((p) => p[0]);
  const lats = ring.map((p) => p[1]);
  const cx = (Math.min(...lons) + Math.max(...lons)) / 2;
  const cy = (Math.min(...lats) + Math.max(...lats)) / 2;
  return cx > -76.5 && cy > -57;
};

function dp(points, tol) {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let max = 0, idx = -1;
    const [ax, ay] = points[a], [bx, by] = points[b];
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * (points[i][0] - ax) - dx * (points[i][1] - ay)) / len;
      if (d > max) { max = d; idx = i; }
    }
    if (max > tol && idx > 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return points.filter((_, i) => keep[i]);
}

function ringPath(ring, tol) {
  let pts = ring.map(proj);
  pts = pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);
  if (pts.length > 1 && pts[0][0] === pts.at(-1)[0] && pts[0][1] === pts.at(-1)[1]) pts.pop();
  // Una comuna chica (Lo Prado, Cerro Navia…) no soporta la misma simplificación que una grande.
  const span = Math.max(Math.max(...pts.map((q) => q[0])) - Math.min(...pts.map((q) => q[0])), Math.max(...pts.map((q) => q[1])) - Math.min(...pts.map((q) => q[1])));
  const simple = dp(pts, Math.min(tol, Math.max(0.3, span / 15)));
  pts = simple.length >= 3 ? simple : pts;
  if (pts.length < 3) return null;
  let d = `M${pts[0][0]} ${pts[0][1]}l`;
  const rel = [];
  for (let i = 1; i < pts.length; i++) rel.push(`${pts[i][0] - pts[i - 1][0]} ${pts[i][1] - pts[i - 1][1]}`);
  return d + rel.join(" ") + "z";
}

const polygonsOf = (geom) => (geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates);

function shape(geom, tol, { mainlandOnly }) {
  let polys = polygonsOf(geom);
  const main = polys.filter((p) => isMainland(p[0]));
  const island = main.length === 0; // una comuna solo de islas se dibuja entera
  if (mainlandOnly || !island) polys = main.length ? main : polys;
  const parts = [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const poly of polys) {
    for (const [i, ring] of poly.entries()) {
      const d = ringPath(ring, tol);
      if (!d) continue;
      parts.push(d);
      if (i === 0) {
        for (const p of ring.map(proj)) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
      }
    }
  }
  return { d: parts.join(""), bbox: [x0, y0, x1, y1], island };
}

const SHORT = {
  "15": "Arica y Parinacota", "01": "Tarapacá", "02": "Antofagasta", "03": "Atacama", "04": "Coquimbo",
  "05": "Valparaíso", "13": "Metropolitana", "06": "O'Higgins", "07": "Maule", "16": "Ñuble", "08": "Biobío",
  "09": "La Araucanía", "14": "Los Ríos", "10": "Los Lagos", "11": "Aysén", "12": "Magallanes",
};
const NORTH_TO_SOUTH = ["15", "01", "02", "03", "04", "05", "13", "06", "07", "16", "08", "09", "14", "10", "11", "12"];

// Regiones (vista de todo Chile)
const reg = JSON.parse(readFileSync(path.join(SRC, "regiones.json"), "utf8"));
const regFeatures = feature(reg, reg.objects.regiones).features;
const regiones = NORTH_TO_SOUTH.map((code) => {
  const f = regFeatures.find((x) => x.properties.code === code);
  const s = shape(f.geometry, 5, { mainlandOnly: true });
  return { code, name: SHORT[code], d: s.d, bbox: s.bbox };
});
writeFileSync(path.join(OUT, "regiones.json"), JSON.stringify(regiones));

// Comunas, una región por archivo
const index = [];
for (const code of NORTH_TO_SOUTH) {
  const topo = JSON.parse(readFileSync(path.join(SRC, `comunas-${code}.json`), "utf8"));
  const fs = feature(topo, topo.objects.comunas).features;
  const comunas = fs.map((f) => {
    const s = shape(f.geometry, 1.5, { mainlandOnly: false });
    index.push([f.properties.code, f.properties.name, code]);
    return { code: f.properties.code, name: f.properties.name, province: f.properties.provinceName, d: s.d, bbox: s.bbox, ...(s.island ? { island: true } : {}) };
  });
  writeFileSync(path.join(OUT, `comunas-${code}.json`), JSON.stringify({ region: code, name: SHORT[code], comunas }));
}
writeFileSync(path.join(OUT, "comunas-index.json"), JSON.stringify(index));
console.log(`${regiones.length} regiones, ${index.length} comunas`);
