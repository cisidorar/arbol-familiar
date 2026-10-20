"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import LineageModal from "./LineageModal";
import PersonPanel from "./PersonPanel";
import { buildAncestorSteps } from "@/lib/lineage";
import MapPersonPicker from "./MapPersonPicker";
import { Notice, buttonClass } from "./ui";
import {
  BASIS_LABELS,
  generationCount,
  ancestorPhrase,
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
  if (count <= 0) return "#e9e8e3";
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

/** "Metropolitana de Santiago" → "Región Metropolitana"; "Maule" → "Región del Maule"; "Valparaíso" → "Región de Valparaíso". */
function regionLabel(name: string) {
  if (name.startsWith("Metropolitana")) return "Región Metropolitana";
  return /^(Maule|Biobío)$/.test(name) ? `Región del ${name}` : `Región de ${name}`;
}

const segmentGroup = "flex max-w-full flex-wrap rounded-3xl border-2 border-line bg-white p-1 gap-1";
const segment = (on: boolean) =>
  `min-h-11 shrink-0 rounded-full px-4 text-[1.0625rem] font-bold transition-colors ${on ? "bg-ink text-white" : "text-ink hover:bg-paper"}`;
const panel = "rounded-2xl border-2 border-line bg-white";
const eyebrow = "zb-etiqueta";
const smallButton = buttonClass("secundario", "!min-h-12 !px-5");

function Swatch({ c }: { c: ComunaSummary }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-4 w-4 shrink-0 rounded-sm border border-black/20"
      style={{ background: c.birthCount === 0 ? HATCH : fillFor(c.count) }}
    />
  );
}

/** Los mismos colores que el árbol: azul hombres, rosado mujeres. */
const sexColor = (sex?: string | null) => (sex === "F" ? "#b03a62" : sex === "M" ? "#2f66b8" : "#4a4740");

function Avatar({ name, sex }: { name: string; sex?: string | null }) {
  return (
    <span
      aria-hidden="true"
      className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-[1.375rem] font-bold"
      style={{ backgroundColor: `${sexColor(sex)}1a`, color: sexColor(sex) }}
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

function PersonRow({ a, sex, third, onOpen, children }: { a: Ancestor; sex?: string | null; third: boolean; onOpen?: () => void; children?: React.ReactNode }) {
  const body = (
    <>
      <Avatar name={a.name} sex={sex} />
      <div className="min-w-0 flex-1">
        <p className="zb-nombre">{a.name}</p>
        <p className="zb-apoyo">
          {ancestorPhrase(a, third)}
          {a.origin.kind !== "none" && (
            <>
              {" "}· {a.origin.label}
              {a.origin.basis !== "birth" && <span className="text-[#9a4a14]"> ({BASIS_LABELS[a.origin.basis]})</span>}
            </>
          )}
        </p>
      </div>
    </>
  );
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
      {onOpen ? (
        <button type="button" onClick={onOpen} title="Abrir la ficha para verla o editarla" className="-m-1 flex min-w-0 flex-1 basis-60 items-center gap-3 rounded-xl p-1 text-left hover:bg-paper">
          {body}
        </button>
      ) : (
        body
      )}
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
  /** "M" / "F" de cada persona, para colorear las iniciales como en el árbol. */
  sexById: Record<string, string | undefined>;
  /** Año de nacimiento de cada persona (para las tarjetas de la comuna). */
  birthYearById: Record<string, number | null | undefined>;
}) {
  const { rootName, isSelf, hasSelf, regions, zone, sexById, birthYearById } = props;
  // La sangre viene solo de los antepasados directos (padres, abuelos,
  // bisabuelos…): los hermanos de un antepasado (tíos, tíos abuelos) no
  // cuentan para el origen, aunque `collectAncestors` los entregue.
  const ancestors = useMemo(() => props.ancestors.filter((a) => !a.lateral), [props.ancestors]);
  const router = useRouter();
  // La ficha se abre al lado, sin salir del mapa; los datos del árbol (parentesco) se piden la primera vez.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [treeData, setTreeData] = useState<any[]>([]);
  useEffect(() => {
    if (!selectedId || treeData.length) return;
    fetch("/api/tree")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j?.data && setTreeData(j.data))
      .catch(() => {});
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps
  const gens = Math.max(1, generationCount(ancestors));
  const [filters, setFilters] = useState<Filters>({ maxGeneration: gens, minGeneration: 1, branch: "all", birthOnly: false });
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [path, setPath] = useState<Ancestor | null>(null);
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

  // Pestañas de generación, cada una con cuántos antepasados tienen lugar conocido (según la rama elegida).
  const genTabs = useMemo(() => {
    const defs = [
      { label: "Todas", min: 1, max: gens },
      ...Array.from({ length: Math.min(gens, 4) }, (_, i) => ({ label: generationLabel(i + 1), min: i + 1, max: i + 1 })),
      ...(gens > 4 ? [{ label: "Más atrás", min: 5, max: gens }] : []),
    ];
    return defs.map((d) => ({ ...d, n: locatedCount(summarize(ancestors, { ...filters, minGeneration: d.min, maxGeneration: d.max })) }));
  }, [ancestors, filters.branch, filters.birthOnly, gens]); // eslint-disable-line react-hooks/exhaustive-deps
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
  // Zona que se ve: por defecto la de las comunas con datos; los botones "Acercar a" y +/− la cambian.
  const [view, setView] = useState<Box | null>(null);
  const [focus, setFocus] = useState<string>("all");
  const zv = view ?? zoneView;
  const labelSize = zv ? Math.max(zv[2] - zv[0], zv[3] - zv[1]) / 46 : 10;

  // "Acercar a": una opción por región con datos (las regiones con pocas comunas se juntan: "O'Higgins y Maule").
  const zoomChips = useMemo(() => {
    const comunasByRegion = new Map<string, Set<string>>();
    for (const a of ancestors) if (a.origin.kind === "comuna") comunasByRegion.set(a.origin.regionCode, (comunasByRegion.get(a.origin.regionCode) ?? new Set()).add(a.origin.code));
    const ordered = regions.map((r) => r.code).filter((c) => comunasByRegion.has(c));
    const groups: { codes: string[]; small: boolean }[] = [];
    for (const code of ordered) {
      const small = (comunasByRegion.get(code)?.size ?? 0) <= 2;
      const last = groups[groups.length - 1];
      if (small && last?.small) last.codes.push(code);
      else groups.push({ codes: [code], small });
    }
    const grow = (lo: number, hi: number, min: number): [number, number] => (hi - lo >= min ? [lo, hi] : [(lo + hi) / 2 - min / 2, (lo + hi) / 2 + min / 2]);
    return groups.map((g) => {
      const codes = new Set(g.codes.flatMap((c) => [...(comunasByRegion.get(c) ?? [])]));
      const boxes = zoneMain.filter((z) => codes.has(z.code)).map((z) => z.bbox);
      const b = boxes.length ? unionBox(boxes) : chileView;
      const [x0, x1] = grow(b[0], b[2], 40);
      const [y0, y1] = grow(b[1], b[3], 40);
      const nameOf = (c: string) => (regions.find((r) => r.code === c)?.name ?? c).replace(/^Metropolitana.*/, "Santiago");
      return { key: g.codes.join("+"), label: g.codes.map(nameOf).join(" y "), box: padBox([x0, y0, x1, y1], 0.14) as Box };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ancestors, zone, regions]);
  // Al tocar una comuna el mapa se acerca a ella; al volver a "Todas las comunas" regresa a la vista anterior.
  const lastSel = useRef<string | null>(null);
  useEffect(() => {
    const code = selected;
    const comuna = code ? zoneMain.find((c) => c.code === code) : undefined;
    if (comuna) {
      const grow = (lo: number, hi: number, min: number): [number, number] => (hi - lo >= min ? [lo, hi] : [(lo + hi) / 2 - min / 2, (lo + hi) / 2 + min / 2]);
      const [x0, x1] = grow(comuna.bbox[0], comuna.bbox[2], 24);
      const [y0, y1] = grow(comuna.bbox[1], comuna.bbox[3], 24);
      setView(padBox([x0, y0, x1, y1], 0.5));
      setFocus("comuna");
    } else if (lastSel.current) {
      setView(null);
      setFocus("all");
    }
    lastSel.current = code;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);
  const zoomBy = (f: number) => {
    if (!zv) return;
    const cx = (zv[0] + zv[2]) / 2, cy = (zv[1] + zv[3]) / 2;
    const maxW = chileView[2] - chileView[0];
    const w = Math.min(maxW, Math.max(12, (zv[2] - zv[0]) * f));
    const h = Math.min(chileView[3] - chileView[1], Math.max(12, (zv[3] - zv[1]) * f));
    setView([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2]);
    setFocus("custom");
  };

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

  // Función y no componente: definida aquí dentro, como componente se volvería
  // a montar en cada cambio de estado y las listas plegables perderían si están abiertas.
  function missingGroup(title: string, hint: string, items: Ancestor[], kind: Missing, open: boolean) {
    if (!items.length) return null;
    return (
      <details key={kind} open={open} className={`${panel} group`}>
        <summary className="flex min-h-[4.5rem] cursor-pointer list-none items-center gap-4 px-4 py-3 sm:px-5 [&::-webkit-details-marker]:hidden">
          <span className="flex h-10 min-w-10 items-center justify-center rounded-full bg-paper px-2 text-[1.125rem] font-bold">{items.length}</span>
          <span className="min-w-0 flex-1">
            <span className="zb-nombre block">{title}</span>
            <span className="zb-apoyo block">{hint}</span>
          </span>
          <span className="shrink-0 font-bold underline decoration-2 underline-offset-4">
            <span className="group-open:hidden">Ver lista</span>
            <span className="hidden group-open:inline">Cerrar lista</span>
          </span>
        </summary>
        <div className="border-t-2 border-line px-4 pb-4 pt-1 sm:px-5">
          {groupByGeneration(items).map((g) => (
            <div key={g.generation}>
              <p className={`${eyebrow} mt-3`}>{g.label}</p>
              <ul className={`grid gap-x-8 divide-y divide-line ${g.people.length > 1 ? "xl:grid-cols-2 xl:divide-y-0" : ""}`}>
                {g.people.map((a) => (
                  <PersonRow key={a.id} a={a} sex={sexById[a.id]} third={!isSelf} onOpen={() => setSelectedId(a.id)}>
                    <button type="button" onClick={() => setSelectedId(a.id)} className={smallButton} title="Abrir la ficha para verla o editarla">
                      Ver ficha
                    </button>
                    <button
                      type="button"
                      onClick={() => setPath(a)}
                      className={smallButton}
                      title={`Ver cómo se llega desde ${rootName.split(" ")[0]} hasta ${a.name}`}
                    >
                      Ver camino
                    </button>
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

  const first = rootName.split(" ")[0];
  const tabCls = (isOn: boolean) =>
    `-mb-0.5 inline-flex min-h-12 shrink-0 items-center gap-2 whitespace-nowrap border-b-4 px-4 text-[1.125rem] transition ${
      isOn ? "border-ink font-bold text-ink" : "border-transparent text-gris hover:text-ink"
    }`;
  const countCls = (isOn: boolean) => `rounded-full px-2.5 py-0.5 text-base font-bold ${isOn ? "bg-ink text-white" : "bg-paper text-gris"}`;
  const pill = (isOn: boolean) =>
    `min-h-12 whitespace-nowrap rounded-full border-2 px-5 text-[1.0625rem] font-bold transition ${isOn ? "border-ink bg-ink text-white" : "border-line bg-white text-ink hover:border-ink"}`;
  const zoomBtn = "grid h-12 w-12 place-items-center rounded-xl border-2 border-line bg-white text-[1.5rem] font-bold leading-none hover:border-ink";
  const missing = summary.total - located;
  const topNames = topRegions(summary, 2).map(([code]) => regionName(code));

  return (
    <div className="space-y-6">
      {/* Título */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="zb-titulo">De dónde vienen</h1>
          <p className="zb-texto mt-3 max-w-2xl text-gris">
            {!isSelf && <>Los antepasados de {rootName}. </>}
            Cada comuna se colorea según cuántos antepasados nacieron ahí. Toca una para conocerlos.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {!isSelf && hasSelf && (
            <Link href="/mapa" className={buttonClass("enlace")}>
              Volver al mío
            </Link>
          )}
          <button type="button" onClick={() => setPicking((p) => !p)} className={buttonClass("secundario")}>
            {picking ? "Cancelar" : "Ver el de otra persona"}
          </button>
        </div>
      </div>
      {picking && (
        <div className="max-w-md">
          <MapPersonPicker autoFocus />
        </div>
      )}

      {/* Generación y rama */}
      <div className="border-b-2 border-line pb-4">
        {gens > 1 && (
          <div className="-mb-0.5 flex items-end overflow-x-auto border-b-2 border-line" role="group" aria-label="Generación">
            {genTabs.map((g) => (
              <button key={g.label} type="button" aria-pressed={on(g)} className={tabCls(on(g))} onClick={() => { setFilters({ ...filters, minGeneration: g.min, maxGeneration: g.max }); setSelected(null); }}>
                {g.label} <span className={countCls(on(g))}>{g.n}</span>
              </button>
            ))}
          </div>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-bold">Rama</span>
            <div className="inline-flex rounded-2xl bg-paper p-1.5" role="group" aria-label="Rama">
              {([["all", "Ambas"], ["paterna", "Paterna"], ["materna", "Materna"]] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={filters.branch === value}
                  onClick={() => { setFilters({ ...filters, branch: value }); setSelected(null); }}
                  className={`min-h-12 rounded-xl px-5 text-[1.0625rem] transition ${filters.branch === value ? "bg-white font-bold text-ink shadow" : "text-gris hover:text-ink"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <label className="zb-texto flex min-h-12 cursor-pointer items-center gap-3" title="Deja fuera los lugares que se conocen solo por el bautismo o el matrimonio">
            <input type="checkbox" className="h-6 w-6 accent-ink" checked={filters.birthOnly} onChange={(e) => { setFilters({ ...filters, birthOnly: e.target.checked }); setSelected(null); }} />
            Solo nacimientos confirmados
          </label>
        </div>
      </div>

      {/* En pantallas anchas: el mapa a la izquierda y, a la derecha, el resumen y la lista. En el teléfono: resumen, mapa y lista. */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-start lg:gap-8 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="order-2 lg:sticky lg:top-4 lg:order-none">
          {zv ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Acercar a">
                  <span className="mr-1 font-bold">Acercar a</span>
                  <button type="button" aria-pressed={focus === "all"} className={pill(focus === "all")} onClick={() => { setView(null); setFocus("all"); }}>
                    Todo
                  </button>
                  {zoomChips.length > 1 &&
                    zoomChips.map((c) => (
                      <button key={c.key} type="button" aria-pressed={focus === c.key} className={pill(focus === c.key)} onClick={() => { setView(c.box); setFocus(c.key); }}>
                        {c.label}
                      </button>
                    ))}
                </div>
                <div className="flex gap-2">
                  <button type="button" className={zoomBtn} onClick={() => zoomBy(0.7)} aria-label="Acercar el mapa" title="Acercar el mapa">
                    +
                  </button>
                  <button type="button" className={zoomBtn} onClick={() => zoomBy(1 / 0.7)} aria-label="Alejar el mapa" title="Alejar el mapa">
                    −
                  </button>
                </div>
              </div>

              <div className="relative mt-3 rounded-3xl border-2 border-line bg-white p-3 sm:p-4">
                {sel && (
                  <p className="pointer-events-none absolute left-1/2 top-5 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-ink px-5 py-2.5 text-[1.0625rem] font-bold text-white shadow-lg" aria-hidden>
                    {COMUNA_NAME.get(sel.code) ?? sel.code} · {sel.count === 1 ? "1 antepasado" : `${sel.count} antepasados`}
                  </p>
                )}
                <svg viewBox={viewBoxOf(zv)} className="mx-auto max-h-[30rem] w-full lg:max-h-[calc(100vh-17rem)]" role="img" aria-label="Comunas de origen">
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
                      <path key={c.code} d={c.d} fill="#ecebe6" stroke="#fff" strokeWidth={labelSize * 0.06}>
                        <title>{c.name}</title>
                      </path>
                    );
                  })}
                  {/* Las comunas con datos van encima, para que su borde no quede tapado. */}
                  {zoneMain.map((c) => {
                    const s = summary.byComuna.get(c.code);
                    if (!s) return null;
                    const isOn = selected === c.code || hover === c.code;
                    return (
                      <path
                        key={c.code}
                        d={c.d}
                        fill={s.birthCount === 0 ? "url(#est)" : fillFor(s.count)}
                        stroke={isOn ? "#1a1917" : "#fff"}
                        strokeWidth={isOn ? labelSize * 0.22 : labelSize * 0.08}
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
                      fontWeight={700}
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
              </div>
              <div className="zb-apoyo mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="font-bold text-ink">Antepasados por comuna</span>
                {LEGEND.map(([label, color]) => (
                  <span key={label} className="flex items-center gap-1.5">
                    <span className="inline-block h-5 w-5 rounded-md border border-black/10" style={{ background: color }} />
                    {label}
                  </span>
                ))}
                <span className="flex items-center gap-1.5" title="Se conoce solo por el bautismo o el matrimonio">
                  <span className="inline-block h-5 w-5 rounded-md border border-black/10" style={{ background: HATCH }} />
                  lugar estimado
                </span>
              </div>
            </>
          ) : (
            <p className="zb-texto rounded-3xl border-2 border-line p-6 text-gris">
              Con estos filtros no hay antepasados con una comuna conocida. Prueba con más generaciones o con ambas ramas;
              abajo está la lista de quienes todavía no tienen lugar.
            </p>
          )}
        </div>

        <div className="contents lg:block lg:space-y-5">
          {sel ? (
            <div ref={listRef} className="order-3 scroll-mt-4">
              <button type="button" onClick={() => pick(null)} className={buttonClass("secundario", "!border-transparent !bg-paper hover:!bg-line")}>
                <span aria-hidden>←</span> Todas las comunas
              </button>
              <p className="zb-texto mt-5 text-gris">{regionLabel(regionName(sel.regionCode))}</p>
              <h2 className="zb-titulo mt-1">{COMUNA_NAME.get(sel.code) ?? sel.code}</h2>
              <p className="zb-texto mt-3">
                <strong>{sel.count === 1 ? "1 antepasado" : `${sel.count} antepasados`}</strong> {sel.count === 1 ? "nació" : "nacieron"} aquí.
              </p>
              <ul className="mt-5 space-y-4">
                {[...sel.people].sort((x, y) => x.generation - y.generation || x.name.localeCompare(y.name)).map((a) => {
                  const year = birthYearById[a.id];
                  const sure = a.origin.kind === "comuna" && a.origin.basis === "birth";
                  return (
                    <li key={a.id} className="rounded-3xl border-2 border-line bg-white p-5">
                      <div className="flex items-start gap-4">
                        <span
                          aria-hidden="true"
                          className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl text-[1.75rem] font-bold"
                          style={{ backgroundColor: `${sexColor(sexById[a.id])}1a`, color: sexColor(sexById[a.id]) }}
                        >
                          {a.name.trim().charAt(0).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="zb-nombre">{a.name}</p>
                          <p className="zb-apoyo mt-0.5">{ancestorPhrase(a, !isSelf)}</p>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="rounded-full bg-paper px-3.5 py-1 text-base">{year ? `Nació en ${year}` : "Sin año de nacimiento"}</span>
                        {sure ? (
                          <span className="rounded-full bg-[#e3f1e8] px-3.5 py-1 text-base font-bold text-listo">Lugar confirmado</span>
                        ) : (
                          <span className="rounded-full bg-[#fbecd9] px-3.5 py-1 text-base font-bold text-[#9a4a14]">
                            Lugar por confirmar{a.origin.kind === "comuna" ? ` · según el ${a.origin.basis === "baptism" ? "bautismo" : "matrimonio"}` : ""}
                          </span>
                        )}
                      </div>
                      <div className="mt-4 flex flex-wrap gap-3">
                        <button type="button" onClick={() => setSelectedId(a.id)} className={buttonClass("principal", "min-w-0 flex-1 !px-5")} title="Abrir la ficha de la persona">
                          Ver ficha
                        </button>
                        <button type="button" onClick={() => setPath(a)} className={buttonClass("secundario", "min-w-0 flex-1 !px-5")} title={`Ver cómo se llega desde ${first} hasta ${a.name}`}>
                          Ver camino
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <>
          {/* Resumen en una frase */}
          <div className="order-1 rounded-3xl border-2 border-line bg-white p-5 sm:p-6">
            <p className="text-[1.25rem] leading-snug">
              Sabemos de dónde vienen <strong>{located} de {isSelf ? "tus" : "los"} {summary.total}</strong> antepasados directos{isSelf ? "" : ` de ${first}`}.
              {topNames.length > 0 && <> La mayoría es de {listInWords(topNames)}.</>}
            </p>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-paper" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="Antepasados con lugar conocido">
              <div className="h-full rounded-full bg-terra" style={{ width: `${percent}%` }} />
            </div>
          </div>

          {/* Lista de comunas, o las personas de la comuna elegida */}
          <div ref={listRef} className="order-3 scroll-mt-4 overflow-hidden rounded-3xl border-2 border-line bg-white">
            {ranked.length ? (
              <>
                <div className="px-5 py-5 sm:px-6">
                  <h2 className="text-[1.375rem] font-bold leading-tight">Comunas de origen</h2>
                  <p className="zb-texto mt-1 text-gris">Toca una comuna, aquí o en el mapa, para ver quiénes nacieron ahí.</p>
                </div>
                <ul className="border-t-2 border-line">
                  {ranked.map((c) => (
                    <li key={c.code} className="border-b border-line last:border-b-0">
                      <button
                        type="button"
                        onClick={() => pick(c.code)}
                        onMouseEnter={() => setHover(c.code)}
                        onMouseLeave={() => setHover(null)}
                        onFocus={() => setHover(c.code)}
                        onBlur={() => setHover(null)}
                        className={`flex min-h-[4.5rem] w-full items-center gap-4 px-5 py-3 text-left hover:bg-paper sm:px-6 ${hover === c.code ? "bg-paper" : ""}`}
                      >
                        <span
                          aria-hidden="true"
                          className="inline-block h-7 w-7 shrink-0 rounded-lg border border-black/10"
                          style={{ background: c.birthCount === 0 ? HATCH : fillFor(c.count) }}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="zb-nombre block">{COMUNA_NAME.get(c.code) ?? c.code}</span>
                          <span className="zb-apoyo block">
                            {regionLabel(regionName(c.regionCode))}
                            {c.birthCount === 0 && " · con datos por confirmar"}
                          </span>
                        </span>
                        <span className="text-[1.25rem] font-bold tabular-nums">{c.count}</span>
                        <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-gris" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden>
                          <path d="m9 5 7 7-7 7" />
                        </svg>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="zb-texto p-6 text-gris">Aún no hay comunas que mostrar.</p>
            )}
          </div>
            </>
          )}
        </div>
      </div>

      {/* Lo que falta */}
      {missingTotal > 0 && (
        <section className="space-y-3 pt-2">
          <div>
            <h2 className="zb-seccion">Los que no están en el mapa</h2>
            <p className="zb-texto text-gris">
              {missingTotal === 1 ? "Falta 1 antepasado" : `Faltan ${missingTotal} antepasados`}.
            </p>
          </div>
          {/* Primero el grupo con los antepasados más cercanos. */}
          {(
            [
              ["Nacieron fuera de Chile", "Su lugar está en otro país.", summary.abroad, "abroad", true],
              ["Lugar sin comuna reconocida", "Hay un lugar anotado, pero no coincide con ninguna comuna: puede ser una localidad o estar mal escrito.", summary.unlocated, "unlocated", true],
              ["Sin lugar de nacimiento", "Todavía no se sabe dónde nacieron.", summary.none, "none", summary.none.length <= 8],
            ] as [string, string, Ancestor[], Missing, boolean][]
          )
            .filter((g) => g[2].length)
            .sort((a, b) => Math.min(...a[2].map((x) => x.generation)) - Math.min(...b[2].map((x) => x.generation)))
            .map((g) => missingGroup(...g))}
        </section>
      )}
      <PersonPanel
        personId={selectedId}
        mainId={selectedId}
        homeId={props.rootId}
        data={treeData}
        onClose={() => setSelectedId(null)}
        onNavigate={setSelectedId}
        onPersonChanged={() => router.refresh()}
        onPersonDeleted={() => {
          setSelectedId(null);
          router.refresh();
        }}
        onTreeData={() => router.refresh()}
      />
      {path && (
        <LineageModal steps={buildAncestorSteps(props.rootId, rootName, ancestors, path, sexById, !isSelf)} onClose={() => setPath(null)} />
      )}
    </div>
  );
}
