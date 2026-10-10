"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import LineageModal from "./LineageModal";
import { kinshipPath, type GraphPerson, type LineageStep } from "@/lib/lineage";
import type { Burial, CemeteryGroup } from "@/lib/cemeteries";

type Box = [number, number, number, number];
export type GuideRegion = { code: string; name: string; d: string; bbox: Box };
export type GuidePlace = CemeteryGroup & {
  /** Centro de la comuna en el mapa (null si no se sabe la comuna). */
  point: [number, number] | null;
  /** Contorno de la comuna, para pintarla. */
  comunaD: string | null;
};

const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const PREVIEW = 4;

function mapsUrl(p: GuidePlace) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.name}, ${p.locality ?? ""}, Chile`)}`;
}

function viewOf(points: [number, number][], regions: GuideRegion[]): Box {
  if (!points.length) {
    const b = regions.reduce<Box>((a, r) => [Math.min(a[0], r.bbox[0]), Math.min(a[1], r.bbox[1]), Math.max(a[2], r.bbox[2]), Math.max(a[3], r.bbox[3])], [Infinity, Infinity, -Infinity, -Infinity]);
    return b;
  }
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  let [x0, y0, x1, y1] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  // Un mínimo de tamaño y un margen, para que se vea el contexto (la costa, la cordillera).
  const size = Math.max(x1 - x0, y1 - y0, 140);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const w = size * 0.75 + 60;
  const h = size * 1.25 + 60;
  [x0, x1, y0, y1] = [cx - w / 2, cx + w / 2, cy - h / 2, cy + h / 2];
  return [x0, y0, x1, y1];
}

export default function CemeteryGuide({
  places,
  regions,
  graph,
  rootId,
}: {
  places: GuidePlace[];
  regions: GuideRegion[];
  graph: GraphPerson[];
  rootId: string | null;
}) {
  const [region, setRegion] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [steps, setSteps] = useState<LineageStep[] | null>(null);
  const [noPath, setNoPath] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(false);

  const regionName = (code: string | null) => regions.find((r) => r.code === code)?.name ?? "";
  const order = regions.map((r) => r.code);

  // Regiones con cementerios, de norte a sur, con cuántas personas hay en cada una.
  const regionCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of places) if (p.regionCode && p.point) m.set(p.regionCode, (m.get(p.regionCode) ?? 0) + p.people.length);
    return [...m.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
  }, [places]); // eslint-disable-line react-hooks/exhaustive-deps
  const pendingCount = places.filter((p) => !p.point).reduce((n, p) => n + p.people.length, 0);

  // Filtro: por región y por texto (cementerio, comuna, región o persona).
  const filtered = useMemo(() => {
    const words = norm(q).split(/\s+/).filter(Boolean);
    return places
      .filter((p) => (region === "pending" ? !p.point : region ? p.regionCode === region && p.point : true))
      .map((p) => {
        if (!words.length) return p;
        const placeText = norm(`${p.name} ${p.locality ?? ""} ${regionName(p.regionCode)}`);
        if (words.every((w) => placeText.includes(w))) return p;
        const people = p.people.filter((b) => words.every((w) => norm(`${b.name} ${b.relation ?? ""} ${placeText}`).includes(w)));
        return people.length ? { ...p, people } : null;
      })
      .filter((p): p is GuidePlace => p !== null);
  }, [places, region, q]); // eslint-disable-line react-hooks/exhaustive-deps

  const sections = useMemo(() => {
    const byRegion = new Map<string, GuidePlace[]>();
    const pending: GuidePlace[] = [];
    for (const p of filtered) {
      if (!p.point || !p.regionCode) pending.push(p);
      else byRegion.set(p.regionCode, [...(byRegion.get(p.regionCode) ?? []), p]);
    }
    const list = [...byRegion.entries()]
      .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
      .map(([code, ps]) => ({
        code,
        title: regionName(code),
        places: ps.sort((a, b) => (a.locality ?? "").localeCompare(b.locality ?? "", "es") || b.people.length - a.people.length),
      }));
    return { list, pending };
  }, [filtered]); // eslint-disable-line react-hooks/exhaustive-deps

  const located = places.filter((p) => p.point);
  const view = useMemo(() => viewOf(located.map((p) => p.point!), regions), [located.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const unit = Math.max(view[2] - view[0], view[3] - view[1]) / 100;
  // Un punto por comuna (dos cementerios en la misma comuna suman).
  const dots = useMemo(() => {
    const m = new Map<string, { key: string; comuna: string; x: number; y: number; n: number; name: string; d: string | null }>();
    for (const p of located) {
      const k = p.comunaCode ?? p.key;
      const cur = m.get(k);
      if (cur) cur.n += p.people.length;
      else m.set(k, { key: p.key, comuna: k, x: p.point![0], y: p.point![1], n: p.people.length, name: p.locality ?? p.name, d: p.comunaD });
    }
    return [...m.values()];
  }, [located.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const visibleComunas = new Set(filtered.map((p) => p.comunaCode ?? p.key));
  const focusComuna = places.find((p) => p.key === focus)?.comunaCode ?? null;
  // Con un filtro, el número de cada punto es el de lo que se ve.
  const shownCount = new Map<string, number>();
  for (const p of filtered) {
    const k = p.comunaCode ?? p.key;
    shownCount.set(k, (shownCount.get(k) ?? 0) + p.people.length);
  }
  const comunaList = dots
    .filter((d) => visibleComunas.has(d.comuna))
    .map((d) => ({ ...d, n: shownCount.get(d.comuna) ?? d.n }))
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, "es"));

  const goTo = (key: string) => {
    setFocus(key);
    requestAnimationFrame(() => document.getElementById(`cem-${key}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const openPath = (p: GuidePlace, b: Burial) => {
    if (!rootId) return;
    const spot = b.spot ? ` (${b.spot})` : "";
    const path = kinshipPath(rootId, b.personId, graph, (id) => (id === b.personId ? `Sepultado/a en ${p.name}${spot}` : null));
    if (!path || path.length < 2) return setNoPath(b.name);
    setNoPath(null);
    setSteps(path);
  };

  const chip = (on: boolean) =>
    `whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm transition ${
      on ? "border-[#1a1917] bg-[#1a1917] text-[#f5f2ea]" : "border-[#d9d2c1] bg-white text-[#1f1d1a] hover:border-[#9c9482]"
    }`;

  const card = (p: GuidePlace) => {
    const open = expanded.has(p.key) || p.people.length <= PREVIEW + 1 || q.trim() !== "";
    const shown = open ? p.people : p.people.slice(0, PREVIEW);
    const on = focus === p.key;
    return (
      <article
        key={p.key}
        id={`cem-${p.key}`}
        onMouseEnter={() => setFocus(p.key)}
        className={`scroll-mt-4 rounded-2xl border bg-white p-4 transition print:break-inside-avoid print:border-[#ccc] sm:p-5 ${on ? "border-[#c8623a] shadow-md" : "border-[#e4dfd0]"}`}
      >
        <header className="flex flex-wrap items-start gap-x-3 gap-y-2">
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold leading-snug">{p.name}</h3>
            <p className="text-xs text-[#6b6558]">
              {p.locality ?? "Comuna desconocida"} · {plural(p.people.length, "persona", "personas")}
              {p.incomplete && <span className="text-[#9a5a1c]"> · por confirmar</span>}
            </p>
          </div>
          {p.point && (
            <a
              href={mapsUrl(p)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-[#1a1917] px-3.5 py-1.5 text-xs font-semibold text-[#f5f2ea] hover:bg-black print:hidden"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                <path d="M12 21s-7-6.3-7-12a7 7 0 0 1 14 0c0 5.7-7 12-7 12z" />
                <circle cx="12" cy="9" r="2.5" />
              </svg>
              Cómo llegar
            </a>
          )}
        </header>
        <ul className="mt-3 divide-y divide-[#f1ede2]">
          {shown.map((b) => (
            <li key={b.personId} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5">
              <div className="min-w-0 flex-1 basis-56">
                <p className="text-sm font-medium leading-snug">{b.name}</p>
                <p className="text-xs text-[#6b6558]">
                  {b.relation && <span className="font-medium text-[#9a5a1c]">{b.relation} · </span>}
                  {b.birth || b.death ? `${b.birth ?? "?"} – ${b.death ?? "?"}` : "sin fechas"}
                </p>
                {b.spot && (
                  <p className="mt-1 inline-flex items-center gap-1 rounded-md bg-[#f1ede2] px-2 py-0.5 text-xs text-[#4f4a3f]">
                    <span aria-hidden>⌖</span> {b.spot}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 gap-1.5 print:hidden">
                {rootId && b.personId !== rootId && (
                  <button type="button" onClick={() => openPath(p, b)} className="rounded-full border border-[#d9d2c1] bg-white px-3 py-1.5 text-xs font-medium hover:bg-[#f1ede2]">
                    Ver camino
                  </button>
                )}
                <Link href={`/?persona=${b.personId}`} className="rounded-full border border-[#d9d2c1] bg-white px-3 py-1.5 text-xs font-medium hover:bg-[#f1ede2]">
                  Árbol
                </Link>
              </div>
            </li>
          ))}
        </ul>
        {!open && (
          <button
            type="button"
            onClick={() => setExpanded((s) => new Set(s).add(p.key))}
            className="mt-1 text-xs font-medium text-[#6b6558] underline underline-offset-2 hover:text-[#1f1d1a] print:hidden"
          >
            Ver {plural(p.people.length - PREVIEW, "persona más", "personas más")}
          </button>
        )}
      </article>
    );
  };

  const total = places.reduce((n, p) => n + p.people.length, 0);

  return (
    <div>
      {/* Encabezado */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#6b6558]">Cementerios</p>
          <h1 className="mt-1 text-2xl font-semibold sm:text-3xl" style={{ fontFamily: "var(--font-playfair)" }}>
            Dónde descansan
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[#4f4a3f]">
            {plural(total, "persona sepultada", "personas sepultadas")} en {plural(places.length, "lugar", "lugares")}, de norte a sur.
            ¿Vas de viaje? Elige la región o busca la comuna y verás a quién puedes visitar.
          </p>
        </div>
        <button type="button" onClick={() => window.print()} className="rounded-full border border-[#d9d2c1] bg-white px-3.5 py-1.5 text-sm hover:bg-[#f1ede2] print:hidden">
          Imprimir lista
        </button>
      </div>

      {/* Filtros */}
      <div className="sticky top-0 z-10 -mx-4 mt-4 space-y-2.5 bg-[#f6f3ec]/95 px-4 py-3 backdrop-blur print:hidden sm:-mx-6 sm:px-6">
        <label className="relative block max-w-xl">
          <span className="sr-only">Buscar</span>
          <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9c9482]" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Comuna, cementerio o persona (p. ej. Curicó)"
            className="w-full rounded-full border border-[#d9d2c1] bg-white py-2.5 pl-10 pr-10 text-sm text-[#1f1d1a] placeholder:text-[#9c9482] focus:border-[#1a1917] focus:outline-none"
          />
          {q && (
            <button type="button" onClick={() => setQ("")} aria-label="Borrar búsqueda" className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-[#6b6558] hover:bg-[#f1ede2]">
              ×
            </button>
          )}
        </label>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          <button type="button" className={chip(region === null)} onClick={() => setRegion(null)}>
            Todo Chile
          </button>
          {regionCounts.map(([code, n]) => (
            <button key={code} type="button" className={chip(region === code)} onClick={() => setRegion(region === code ? null : code)}>
              {regionName(code)} <span className="opacity-60">{n}</span>
            </button>
          ))}
          {pendingCount > 0 && (
            <button type="button" className={chip(region === "pending")} onClick={() => setRegion(region === "pending" ? null : "pending")}>
              Por ubicar <span className="opacity-60">{pendingCount}</span>
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)] xl:grid-cols-[24rem_minmax(0,1fr)] lg:items-start">
        {/* Mapa */}
        <aside className="print:hidden lg:sticky lg:top-36">
          <button type="button" onClick={() => setShowMap((v) => !v)} className="mb-2 rounded-full border border-[#d9d2c1] bg-white px-3.5 py-1.5 text-sm lg:hidden">
            {showMap ? "Ocultar mapa" : "Ver mapa"}
          </button>
          <div className={`${showMap ? "block" : "hidden"} rounded-2xl border border-[#e4dfd0] bg-white p-3 lg:block`}>
            <svg viewBox={`${view[0]} ${view[1]} ${view[2] - view[0]} ${view[3] - view[1]}`} className="h-[22rem] w-full lg:h-[min(36rem,calc(100vh-12rem))]" role="img" aria-label="Mapa de los cementerios">
              {regions.map((r) => (
                <path key={r.code} d={r.d} fill={region && region === r.code ? "#efe7d6" : "#ece8dd"} stroke="#fff" strokeWidth={unit * 0.4} />
              ))}
              {dots.map((d) => d.d && <path key={`c-${d.key}`} d={d.d} fill={visibleComunas.has(d.comuna) ? "#f3c9a6" : "#e6ddd0"} stroke="#fff" strokeWidth={unit * 0.15} />)}
              {dots.map((d) => {
                const visible = visibleComunas.has(d.comuna);
                const on = focusComuna === d.comuna;
                const n = visible ? shownCount.get(d.comuna) ?? d.n : d.n;
                const r = unit * (1.6 + Math.sqrt(n) * 0.9);
                return (
                  <g key={d.key} className="cursor-pointer" onClick={() => goTo(d.key)} opacity={visible ? 1 : 0.3}>
                    <title>{`${d.name}: ${plural(n, "persona", "personas")}`}</title>
                    <circle cx={d.x} cy={d.y} r={r} fill={on ? "#1a1917" : "#c8623a"} stroke="#fff" strokeWidth={unit * 0.35} />
                    <text x={d.x} y={d.y} dy="0.35em" textAnchor="middle" fontSize={r * 1.05} fontWeight={700} fill="#fff">
                      {n}
                    </text>
                    {on && (
                      <text x={d.x + r + unit} y={d.y} dy="0.35em" fontSize={unit * 3.2} fontWeight={700} fill="#1a1917" stroke="#fff" strokeWidth={unit * 0.8} paintOrder="stroke">
                        {d.name}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
            <p className="px-1 pt-1 text-xs text-[#6b6558]">Toca un punto o una comuna para ir a sus cementerios. El número es cuántas personas hay.</p>
            {comunaList.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5 px-1 pb-1">
                {comunaList.map((d) => (
                  <button
                    key={d.comuna}
                    type="button"
                    onClick={() => goTo(d.key)}
                    className={`rounded-full border px-2.5 py-1 text-xs ${focusComuna === d.comuna ? "border-[#1a1917] bg-[#1a1917] text-[#f5f2ea]" : "border-[#e4dfd0] bg-[#faf7f0] hover:border-[#9c9482]"}`}
                  >
                    {d.name} <span className="opacity-60">{d.n}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Lista */}
        <div className="min-w-0 space-y-8">
          {noPath && (
            <p className="rounded-lg bg-[#fdf1e8] px-3 py-2 text-sm text-[#7a3e1d] print:hidden">No encuentro un parentesco entre tú y {noPath} en el árbol.</p>
          )}
          {sections.list.map((s) => (
            <section key={s.code} aria-label={s.title}>
              <h2 className="mb-3 flex items-baseline gap-2 border-b border-[#e4dfd0] pb-1.5 text-lg font-semibold" style={{ fontFamily: "var(--font-playfair)" }}>
                {s.title}
                <span className="font-sans text-xs font-normal text-[#6b6558]">
                  {plural(s.places.length, "lugar", "lugares")} · {plural(s.places.reduce((n, p) => n + p.people.length, 0), "persona", "personas")}
                </span>
              </h2>
              <div className="grid gap-3 xl:grid-cols-2">{s.places.map(card)}</div>
            </section>
          ))}
          {sections.pending.length > 0 && (
            <section aria-label="Por ubicar">
              <h2 className="mb-1 border-b border-[#e4dfd0] pb-1.5 text-lg font-semibold" style={{ fontFamily: "var(--font-playfair)" }}>
                Por ubicar
              </h2>
              <p className="mb-3 text-xs text-[#6b6558]">
                El lugar anotado no dice en qué comuna está (por ejemplo “Cementerio General” sin ciudad). Si sabes cuál es, corrígelo en la ficha de la persona.
              </p>
              <div className="grid gap-3 xl:grid-cols-2">{sections.pending.map(card)}</div>
            </section>
          )}
          {!filtered.length && <p className="rounded-2xl border border-dashed border-[#d9d2c1] p-6 text-center text-sm text-[#6b6558]">No hay cementerios que coincidan con la búsqueda.</p>}
        </div>
      </div>

      {steps && <LineageModal steps={steps} onClose={() => setSteps(null)} />}
    </div>
  );
}
