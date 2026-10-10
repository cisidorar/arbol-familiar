"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import LineageModal from "./LineageModal";
import { buildAncestorSteps } from "@/lib/lineage";
import MapPersonPicker from "./MapPersonPicker";
import {
  BASIS_LABELS,
  generationCount,
  generationLabel,
  groupByGeneration,
  locatedCount,
  summarize,
  topRegions,
  type Ancestor,
  type ComunaSummary,
  type Filters,
} from "@/lib/origins";
import { COMUNAS } from "@/lib/geo/places";

type Box = [number, number, number, number];
type Region = { code: string; name: string; d: string; bbox: Box };
type Zone = { code: string; name: string; province: string; d: string; bbox: Box; island: boolean };
type Missing = "abroad" | "unlocated" | "none";

const COMUNA_NAME = new Map(COMUNAS.map((c) => [c[0], c[1]]));

/** Escala de color: cuántos antepasados son de la comuna. */
function fillFor(count: number): string {
  if (count <= 0) return "#e9e4d7";
  if (count === 1) return "#f6cfa3";
  if (count === 2) return "#ee9c5c";
  if (count === 3) return "#d9622f";
  return "#9f2d14";
}
const LEGEND: [string, string][] = [["1", fillFor(1)], ["2", fillFor(2)], ["3", fillFor(3)], ["4 o más", fillFor(4)]];
const HATCH = "repeating-linear-gradient(45deg,#d9622f 0 2px,#f6cfa3 2px 5px)";

function unionBox(boxes: Box[]): Box {
  return boxes.reduce<Box>(
    (b, x) => [Math.min(b[0], x[0]), Math.min(b[1], x[1]), Math.max(b[2], x[2]), Math.max(b[3], x[3])],
    [Infinity, Infinity, -Infinity, -Infinity],
  );
}
function padBox(b: Box, pad: number): Box {
  const p = Math.max(b[2] - b[0], b[3] - b[1]) * pad;
  return [b[0] - p, b[1] - p, b[2] + p, b[3] + p];
}
const viewBoxOf = (b: Box) => `${b[0]} ${b[1]} ${b[2] - b[0]} ${b[3] - b[1]}`;

/** "Maule (4) y Metropolitana (4)" */
function listInWords(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

const segment = (on: boolean) =>
  `shrink-0 px-2.5 py-2 text-[13px] sm:px-3 sm:py-1.5 sm:text-sm lg:px-2.5 lg:text-[13px] xl:px-3 xl:text-sm ${on ? "bg-[#1a1917] font-semibold text-[#f5f2ea]" : "bg-white text-[#2b2823] hover:bg-[#f1ede2]"}`;
// En pantallas angostas el grupo se desliza de lado en vez de ensanchar la página.
const segmentGroup = "flex max-w-full overflow-x-auto rounded-lg border border-[#cfc8b8] divide-x divide-[#cfc8b8]";
const panel = "rounded-2xl border border-[#e2dccd] bg-white";
const eyebrow = "text-xs font-semibold uppercase tracking-wide text-[#6b6558]";

function Swatch({ c }: { c: ComunaSummary }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-3.5 w-3.5 shrink-0 rounded-sm border border-black/10"
      style={{ background: c.birthCount === 0 ? HATCH : fillFor(c.count) }}
    />
  );
}

function PersonRow({ a, children }: { a: Ancestor; children?: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-snug text-[#1f1d1a]">{a.name}</p>
        <p className="text-xs text-[#6b6558]">
          {a.relation} · rama {a.branch}
          {a.origin.kind !== "none" && (
            <>
              {" "}· {a.origin.label}
              {a.origin.basis !== "birth" && <span className="text-[#9a5a1c]"> ({BASIS_LABELS[a.origin.basis]})</span>}
            </>
          )}
        </p>
      </div>
      {children}
    </li>
  );
}

export default function OriginsMap(props: {
  rootId: string;
  rootName: string;
  /** El mapa es el de la persona vinculada al usuario. */
  isSelf: boolean;
  /** El usuario está vinculado a alguien (para ofrecer "volver a mi mapa"). */
  hasSelf: boolean;
  ancestors: Ancestor[];
  regions: Region[];
  zone: Zone[];
  canEdit: boolean;
}) {
  const { rootName, isSelf, hasSelf, ancestors, regions, zone, canEdit } = props;
  const gens = Math.max(1, generationCount(ancestors));
  const [filters, setFilters] = useState<Filters>({ maxGeneration: gens, minGeneration: 1, branch: "all", birthOnly: false });
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [path, setPath] = useState<Ancestor | null>(null);
  const [created, setCreated] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // En el teléfono la lista de personas queda debajo del mapa: al tocar una comuna se baja hasta ella.
  const pick = (code: string | null) => {
    setSelected(code);
    if (code && window.matchMedia("(max-width: 1023px)").matches) {
      requestAnimationFrame(() => listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  };

  const summary = useMemo(() => summarize(ancestors, filters), [ancestors, filters]);
  const ranked = useMemo(
    () => [...summary.byComuna.values()].sort((a, b) => b.count - a.count || a.code.localeCompare(b.code)),
    [summary],
  );
  const sel = selected ? summary.byComuna.get(selected) : undefined;
  const located = locatedCount(summary);
  const percent = summary.total ? Math.round((located / summary.total) * 100) : 0;
  const regionName = (code: string) => regions.find((r) => r.code === code)?.name ?? code;
  const top = topRegions(summary).map(([code, n]) => `${regionName(code)} (${n})`);
  const maxCount = ranked[0]?.count ?? 0;

  // Hasta cuatro generaciones tienen nombre de uso común; el resto va en "Todas".
  const generationOptions = [
    ...Array.from({ length: Math.min(gens, 4) }, (_, i) => ({ min: i + 1, max: i + 1, label: generationLabel(i + 1) })),
    ...(gens > 1 ? [{ min: 1, max: gens, label: "Todas" }] : []),
  ];

  const on = (g: { min: number; max: number }) => (filters.minGeneration ?? 1) === g.min && filters.maxGeneration === g.max;

  const zoneMain = zone.filter((c) => !c.island);
  // El encuadre se acerca a las comunas con datos (de todos los antepasados, no solo de los
  // filtrados, para que el mapa no salte al cambiar un filtro) y deja un margen de contexto.
  const zoneView = useMemo<Box | null>(() => {
    const codes = new Set(ancestors.flatMap((a) => (a.origin.kind === "comuna" ? [a.origin.code] : [])));
    const withData = zoneMain.filter((c) => codes.has(c.code));
    if (!withData.length) return null;
    const b = unionBox(withData.map((c) => c.bbox));
    // Con una sola comuna el encuadre quedaría demasiado cerrado: se asegura un tamaño mínimo.
    const grow = (lo: number, hi: number, min: number): [number, number] =>
      hi - lo >= min ? [lo, hi] : [(lo + hi) / 2 - min / 2, (lo + hi) / 2 + min / 2];
    const [x0, x1] = grow(b[0], b[2], 110);
    const [y0, y1] = grow(b[1], b[3], 110);
    return padBox([x0, y0, x1, y1], 0.14);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ancestors, zone]);
  const chileView = padBox(unionBox(regions.map((r) => r.bbox)), 0.02);
  const labelSize = zoneView ? Math.max(zoneView[2] - zoneView[0], zoneView[3] - zoneView[1]) / 46 : 10;

  // Nombres de las comunas con datos, separados cuando dos quedarían uno encima del otro.
  const labels = useMemo(() => {
    const placed: { code: string; name: string; x: number; y: number; w: number }[] = [];
    const wanted = zoneMain
      .filter((c) => summary.byComuna.has(c.code))
      .map((c) => ({ code: c.code, name: c.name, x: (c.bbox[0] + c.bbox[2]) / 2, y: (c.bbox[1] + c.bbox[3]) / 2, w: c.name.length * labelSize * 0.6 }))
      .sort((a, b) => a.y - b.y);
    for (const l of wanted) {
      let guard = 0;
      while (
        guard++ < 20 &&
        placed.some((o) => Math.abs(o.x - l.x) < (o.w + l.w) / 2 && Math.abs(o.y - l.y) < labelSize * 1.25)
      ) {
        l.y += labelSize * 0.35;
      }
      placed.push(l);
    }
    return placed;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary, zone, labelSize]);

  async function createTask(a: Ancestor, kind: Missing) {
    setError(null);
    const title =
      kind === "none"
        ? `Averiguar dónde nació ${a.name}`
        : kind === "unlocated"
          ? `Identificar la comuna de nacimiento de ${a.name}`
          : `Buscar el registro de ${a.name} en el extranjero`;
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          venue: "familysearch_casa",
          personId: a.id,
          hypothesis: a.origin.kind === "none" ? null : `Dato actual: ${a.origin.label}`,
        }),
      });
      if (!res.ok) throw new Error();
      setCreated((s) => new Set(s).add(a.id));
    } catch {
      setError("No se pudo crear el pendiente.");
    }
  }

  // Funciones y no componentes: definidos aquí dentro, como componentes se volverían
  // a montar en cada cambio de estado y las listas plegables perderían si están abiertas.
  function taskButton(a: Ancestor, kind: Missing) {
    if (!canEdit) return null;
    return created.has(a.id) ? (
      <Link href={`/pendientes?persona=${a.id}`} className="shrink-0 text-xs font-medium text-emerald-700 underline underline-offset-2">
        Pendiente creado · ver
      </Link>
    ) : (
      <button
        type="button"
        onClick={() => createTask(a, kind)}
        title="Lo agrega a la lista de pendientes de investigación"
        className="shrink-0 rounded-full border border-[#cfc8b8] bg-white px-3 py-2 text-xs font-medium text-[#2b2823] hover:bg-[#f1ede2] sm:px-2.5 sm:py-1"
      >
        + Pendiente
      </button>
    );
  }

  function missingGroup(title: string, hint: string, items: Ancestor[], kind: Missing, open: boolean) {
    if (!items.length) return null;
    return (
      <details key={kind} open={open} className={`${panel} group`}>
        <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
          <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-[#ece7da] px-2 text-sm font-semibold text-[#2b2823]">{items.length}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-[#1f1d1a]">{title}</span>
            <span className="block text-xs text-[#6b6558]">{hint}</span>
          </span>
          <span aria-hidden="true" className="text-[#8a8475] transition-transform group-open:rotate-180">▾</span>
        </summary>
        <div className="border-t border-[#ece7da] px-4 pb-3 pt-1">
          {groupByGeneration(items).map((g) => (
            <div key={g.generation}>
              <p className={`${eyebrow} mt-3`}>{g.label}</p>
              <ul className={`grid gap-x-8 divide-y divide-[#f1ede2] ${g.people.length > 1 ? "sm:grid-cols-2 sm:divide-y-0 xl:grid-cols-3" : ""}`}>
                {g.people.map((a) => (
                  <PersonRow key={a.id} a={a}>
                    {taskButton(a, kind)}
                  </PersonRow>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </details>
    );
  }

  const missingTotal = summary.abroad.length + summary.unlocated.length + summary.none.length;

  return (
    <div className="space-y-5">
      {/* De quién es el mapa */}
      <div>
        <p className={eyebrow}>Mapa de orígenes</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="text-2xl font-semibold text-[#1f1d1a]" style={{ fontFamily: "var(--font-playfair)" }}>
            {isSelf ? "Tus antepasados" : `Antepasados de ${rootName}`}
          </h1>
          <span className="flex items-center gap-3 text-sm">
            <button type="button" onClick={() => setPicking((p) => !p)} className="font-medium text-[#4f4a3f] underline underline-offset-2 hover:text-[#1f1d1a]">
              {picking ? "Cancelar" : "Ver el de otra persona"}
            </button>
            {!isSelf && hasSelf && (
              <Link href="/mapa" className="font-medium text-[#4f4a3f] underline underline-offset-2 hover:text-[#1f1d1a]">
                Volver al mío
              </Link>
            )}
          </span>
        </div>
        {isSelf && <p className="text-sm text-[#6b6558]">{rootName}</p>}
        {picking && (
          <div className="mt-3 max-w-sm">
            <MapPersonPicker autoFocus />
          </div>
        )}
      </div>

      {/* En pantallas anchas: el mapa a la izquierda y, a la derecha, el resumen, los filtros y la
          lista. En el teléfono, uno debajo de otro: resumen, filtros, mapa y lista. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-6 xl:grid-cols-[minmax(0,1fr)_28rem]">
        <div className={`${panel} order-3 p-3 sm:p-4 lg:sticky lg:top-6 lg:order-none`}>
          {zoneView ? (
            <div className="grid gap-4 sm:grid-cols-[7.5rem_minmax(0,1fr)]">
              <div className="hidden sm:block">
                <p className={eyebrow}>Chile</p>
                <svg viewBox={viewBoxOf(chileView)} className="mt-1 h-[26rem] w-full lg:h-[min(34rem,calc(100vh-17rem))]" role="img" aria-label="Chile, con la zona ampliada marcada">
                  {regions.map((r) => {
                    const n = summary.byRegion.get(r.code) ?? 0;
                    return (
                      <path key={r.code} d={r.d} fill={n ? "#ee9c5c" : "#e9e4d7"} stroke="#fff" strokeWidth={1.5}>
                        <title>{`${r.name}: ${n}`}</title>
                      </path>
                    );
                  })}
                  <rect x={zoneView[0]} y={zoneView[1]} width={zoneView[2] - zoneView[0]} height={zoneView[3] - zoneView[1]} fill="none" stroke="#1a1917" strokeWidth={5} rx={6} />
                </svg>
                <p className="text-[11px] leading-tight text-[#6b6558]">El recuadro es la zona que se ve ampliada.</p>
              </div>

              <div>
                <svg viewBox={viewBoxOf(zoneView)} className="mx-auto max-h-[28rem] w-full lg:max-h-[calc(100vh-15rem)]" role="img" aria-label="Comunas de origen">
                  <defs>
                    <pattern id="est" width={labelSize * 0.6} height={labelSize * 0.6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                      <rect width={labelSize * 0.6} height={labelSize * 0.6} fill="#f6cfa3" />
                      <rect width={labelSize * 0.25} height={labelSize * 0.6} fill="#d9622f" />
                    </pattern>
                  </defs>
                  {zoneMain.map((c) => {
                    const s = summary.byComuna.get(c.code);
                    if (s) return null;
                    return (
                      <path key={c.code} d={c.d} fill="#ece8dc" stroke="#fff" strokeWidth={labelSize * 0.06}>
                        <title>{c.name}</title>
                      </path>
                    );
                  })}
                  {/* Las comunas con datos van encima, para que su borde no quede tapado. */}
                  {zoneMain.map((c) => {
                    const s = summary.byComuna.get(c.code);
                    if (!s) return null;
                    const on = selected === c.code || hover === c.code;
                    return (
                      <path
                        key={c.code}
                        d={c.d}
                        fill={s.birthCount === 0 ? "url(#est)" : fillFor(s.count)}
                        stroke={on ? "#1a1917" : "#fff"}
                        strokeWidth={on ? labelSize * 0.22 : labelSize * 0.08}
                        strokeLinejoin="round"
                        className="cursor-pointer outline-none"
                        role="button"
                        tabIndex={0}
                        aria-label={`${c.name}: ${s.count}`}
                        onClick={() => pick(selected === c.code ? null : c.code)}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(c.code); } }}
                        onMouseEnter={() => setHover(c.code)}
                        onMouseLeave={() => setHover(null)}
                      >
                        <title>{`${c.name}: ${s.count}`}</title>
                      </path>
                    );
                  })}
                  {labels.map((l) => (
                    <text
                      key={l.code}
                      x={l.x}
                      y={l.y}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={labelSize}
                      fontWeight={600}
                      fill="#1f1d1a"
                      stroke="#fff"
                      strokeWidth={labelSize * 0.28}
                      paintOrder="stroke"
                      strokeLinejoin="round"
                      className="pointer-events-none select-none"
                    >
                      {l.name}
                    </text>
                  ))}
                </svg>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#4f4a3f]">
                  <span className="text-[#6b6558]">Antepasados por comuna:</span>
                  {LEGEND.map(([label, color]) => (
                    <span key={label} className="flex items-center gap-1.5">
                      <span className="inline-block h-3 w-3 rounded-sm border border-black/10" style={{ background: color }} />
                      {label}
                    </span>
                  ))}
                  <span className="flex items-center gap-1.5" title="Se conoce solo por el bautismo o el matrimonio">
                    <span className="inline-block h-3 w-3 rounded-sm border border-black/10" style={{ background: HATCH }} />
                    lugar estimado
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <p className="p-6 text-sm text-[#6b6558]">
              Con estos filtros no hay antepasados con una comuna conocida. Prueba con más generaciones o con ambas ramas;
              abajo está la lista de quienes todavía no tienen lugar.
            </p>
          )}
        </div>

        <div className="contents lg:block lg:space-y-4">
        {/* Resumen en una frase */}
        <div className={`${panel} order-1 p-4`}>
          <p className="text-sm text-[#2b2823]">
            Sabemos de dónde vienen <span className="text-2xl font-semibold text-[#1f1d1a]">{located}</span> de{" "}
            <span className="font-semibold">{summary.total}</span> antepasados directos.
            {top.length > 0 && <> La mayoría es de {listInWords(top)}.</>}
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#ece7da]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="Antepasados con lugar conocido">
            <div className="h-full rounded-full bg-[#d9622f]" style={{ width: `${percent}%` }} />
          </div>
        </div>

        {/* Filtros */}
        <div className="order-2 flex flex-wrap items-end gap-x-6 gap-y-3">
          <div className="min-w-0 max-w-full">
            <p className={`${eyebrow} mb-1.5`}>Generación</p>
            <div className={segmentGroup}>
              {generationOptions.map((g) => (
                <button key={g.label} type="button" aria-pressed={on(g)} onClick={() => { setFilters({ ...filters, minGeneration: g.min, maxGeneration: g.max }); setSelected(null); }} className={segment(on(g))}>
                  {g.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className={`${eyebrow} mb-1.5`}>Rama</p>
            <div className={segmentGroup}>
              {([["all", "Ambas"], ["paterna", "Paterna"], ["materna", "Materna"]] as const).map(([value, label]) => (
                <button key={value} type="button" aria-pressed={filters.branch === value} onClick={() => { setFilters({ ...filters, branch: value }); setSelected(null); }} className={segment(filters.branch === value)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2 pb-1.5 text-sm text-[#2b2823]" title="Deja fuera los lugares que se conocen solo por el bautismo o el matrimonio">
            <input type="checkbox" className="h-4 w-4 accent-[#1a1917]" checked={filters.birthOnly} onChange={(e) => { setFilters({ ...filters, birthOnly: e.target.checked }); setSelected(null); }} />
            Solo nacimientos confirmados
          </label>
        </div>

          {/* Lista de comunas, o las personas de la comuna elegida */}
          <div ref={listRef} className={`${panel} order-4 scroll-mt-4 p-4`}>
            {sel ? (
              <>
                <button type="button" onClick={() => setSelected(null)} className="text-xs font-medium text-[#4f4a3f] underline underline-offset-2 hover:text-[#1f1d1a]">
                  ← Todas las comunas
                </button>
                <h2 className="mt-2 flex items-center gap-2 text-lg font-semibold text-[#1f1d1a]">
                  <Swatch c={sel} /> {COMUNA_NAME.get(sel.code) ?? sel.code}
                </h2>
                <p className="text-xs text-[#6b6558]">
                  {regionName(sel.regionCode)} · {sel.count === 1 ? "1 antepasado" : `${sel.count} antepasados`}
                </p>
                <ul className="mt-2 divide-y divide-[#f1ede2]">
                  {sel.people.map((a) => (
                    <PersonRow key={a.id} a={a}>
                      <button
                        type="button"
                        onClick={() => setPath(a)}
                        className="shrink-0 rounded-full border border-[#d9d2c1] bg-white px-3 py-1.5 text-xs font-medium text-[#1f1d1a] hover:bg-[#f1ede2]"
                        title={`Ver cómo se llega desde ${rootName.split(" ")[0]} hasta ${a.name}`}
                      >
                        Ver camino
                      </button>
                    </PersonRow>
                  ))}
                </ul>
              </>
            ) : ranked.length ? (
              <>
                <h2 className="text-sm font-semibold text-[#1f1d1a]">Comunas de origen</h2>
                <p className="text-xs text-[#6b6558]">Elige una comuna, aquí o en el mapa, para ver quiénes son.</p>
                <ul className="mt-2">
                  {ranked.map((c) => (
                    <li key={c.code}>
                      <button
                        type="button"
                        onClick={() => setSelected(c.code)}
                        onMouseEnter={() => setHover(c.code)}
                        onMouseLeave={() => setHover(null)}
                        onFocus={() => setHover(c.code)}
                        onBlur={() => setHover(null)}
                        className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2.5 text-left hover:bg-[#f6f3ec] lg:py-2"
                      >
                        <Swatch c={c} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-[#1f1d1a]">{COMUNA_NAME.get(c.code) ?? c.code}</span>
                          <span className="block truncate text-xs text-[#6b6558]">{regionName(c.regionCode)}</span>
                        </span>
                        <span aria-hidden="true" className="hidden h-1.5 w-14 overflow-hidden rounded-full bg-[#ece7da] sm:block">
                          <span className="block h-full rounded-full bg-[#d9622f]" style={{ width: `${(c.count / maxCount) * 100}%` }} />
                        </span>
                        <span className="w-5 text-right text-sm font-semibold text-[#1f1d1a]">{c.count}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-sm text-[#6b6558]">Aún no hay comunas que mostrar.</p>
            )}
          </div>
        </div>
      </div>

      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-800">{error}</p>}

      {/* Lo que falta */}
      {missingTotal > 0 && (
        <section className="space-y-3 pt-2">
          <div>
            <h2 className="text-lg font-semibold text-[#1f1d1a]" style={{ fontFamily: "var(--font-playfair)" }}>
              Los que no están en el mapa
            </h2>
            <p className="text-sm text-[#4f4a3f]">
              {missingTotal === 1 ? "Falta 1 antepasado" : `Faltan ${missingTotal} antepasados`}.
              {canEdit && " Con «+ Pendiente» los dejas anotados para investigarlos."}
            </p>
          </div>
          {missingGroup("Nacieron fuera de Chile", "Su lugar está en otro país.", summary.abroad, "abroad", true)}
          {missingGroup(
            "Lugar sin comuna reconocida",
            "Hay un lugar anotado, pero no coincide con ninguna comuna: puede ser una localidad o estar mal escrito.",
            summary.unlocated,
            "unlocated",
            true,
          )}
          {missingGroup("Sin lugar de nacimiento", "Todavía no se sabe dónde nacieron.", summary.none, "none", summary.none.length <= 8)}
        </section>
      )}
      {path && (
        <LineageModal steps={buildAncestorSteps(props.rootId, rootName, ancestors, path)} onClose={() => setPath(null)} />
      )}
    </div>
  );
}
