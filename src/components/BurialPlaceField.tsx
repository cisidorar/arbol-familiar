"use client";

import { useEffect, useState } from "react";

type Option = { value: string; label: string; comunaCode: string | null; regionCode: string | null; raws: string[]; n: number };
type Catalog = { regions: [string, string][]; comunas: [string, string, string][]; options: Option[] };

const selectClass =
  "min-h-12 w-full min-w-0 max-w-full truncate rounded-lg border-2 border-[#8f8a80] bg-white px-3.5 py-2 text-[1.125rem] text-ink outline-none placeholder:text-gris/70 focus:border-hombre focus:ring-4 focus:ring-hombre/20 disabled:bg-paper disabled:text-gris/60";
const NONE = "__none";
const OTHER = "__otro";

let cache: Promise<Catalog> | null = null;
function loadCatalog(): Promise<Catalog> {
  cache ??= fetch("/api/cementerios").then((r) => {
    if (!r.ok) throw new Error("No se pudo cargar la lista de cementerios.");
    return r.json() as Promise<Catalog>;
  });
  cache.catch(() => { cache = null; });
  return cache;
}

/** Dónde está sepultada una persona: región, comuna y cementerio de una lista (o uno nuevo). */
export default function BurialPlaceField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (place: string) => void;
}) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [region, setRegion] = useState("");
  const [comuna, setComuna] = useState("");
  const [choice, setChoice] = useState("");
  const [custom, setCustom] = useState("");

  useEffect(() => {
    let alive = true;
    loadCatalog()
      .then((c) => {
        if (!alive) return;
        setCatalog(c);
        if (!value.trim()) return;
        const hit = c.options.find((o) => o.value === value || o.raws.includes(value));
        if (hit) {
          setRegion(hit.regionCode ?? NONE);
          setComuna(hit.comunaCode ?? NONE);
          setChoice(hit.value);
        } else {
          setChoice(OTHER);
          setCustom(value);
        }
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
    // Solo al abrir: después manda lo que elige la persona.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <div>
        <label htmlFor={`${id}-free`} className="block text-[1.0625rem] font-bold text-ink">Cementerio</label>
        <input id={`${id}-free`} value={value} onChange={(e) => onChange(e.target.value)} className={`mt-1.5 ${selectClass}`} />
        <p className="mt-1.5 text-base font-bold text-aviso">{error} Escríbelo a mano.</p>
      </div>
    );
  }
  if (!catalog) return <p className="text-base text-gris">Cargando cementerios…</p>;

  const unplaced = catalog.options.filter((o) => !o.comunaCode);
  const comunasOfRegion = region && region !== NONE ? catalog.comunas.filter((c) => c[2] === region).sort((a, b) => a[1].localeCompare(b[1], "es")) : [];
  const inComuna = catalog.options.filter((o) => (comuna === NONE ? !o.comunaCode : o.comunaCode === comuna));
  const comunaName = catalog.comunas.find((c) => c[0] === comuna)?.[1] ?? "";
  const regionName = catalog.regions.find((r) => r[0] === region)?.[1] ?? "";
  const cemeteries = (n: number) => (n === 1 ? "1 cementerio" : `${n} cementerios`);
  const countIn = (pred: (o: Option) => boolean) => catalog.options.filter(pred).length;
  const selected = catalog.options.find((o) => o.value === choice) ?? null;

  function pick(next: string) {
    setChoice(next);
    onChange(next === OTHER ? composeCustom(custom, comunaName) : next);
  }
  function composeCustom(text: string, city: string) {
    const t = text.trim();
    if (!t) return "";
    return city && !t.toLowerCase().includes(city.toLowerCase()) ? `${t}, ${city}` : t;
  }

  const field = "flex min-w-0 flex-col gap-1.5";
  const cap = "text-base font-bold text-ink";

  return (
    <fieldset className="flex min-w-0 flex-col gap-4">
      <legend className="block text-[1.0625rem] font-bold text-ink">Dónde está sepultada</legend>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className={field}>
          <label htmlFor={`${id}-region`} className={cap}>Región</label>
          <select
            id={`${id}-region`}
            value={region}
            onChange={(e) => { setRegion(e.target.value); setComuna(e.target.value === NONE ? NONE : ""); setChoice(""); onChange(""); }}
            className={selectClass}
          >
            <option value="">Elige la región</option>
            {catalog.regions.map(([code, name]) => {
              const n = countIn((o) => o.regionCode === code);
              return <option key={code} value={code}>{name}{n ? `  ·  ${cemeteries(n)}` : ""}</option>;
            })}
            {unplaced.length > 0 && <option value={NONE}>Sin ubicar  ·  {cemeteries(unplaced.length)}</option>}
          </select>
        </div>
        <div className={field}>
          <label htmlFor={`${id}-comuna`} className={cap}>Comuna</label>
          <select
            id={`${id}-comuna`}
            value={comuna}
            disabled={!region || region === NONE}
            onChange={(e) => { setComuna(e.target.value); setChoice(""); onChange(""); }}
            className={selectClass}
          >
            <option value="">{region && region !== NONE ? "Elige la comuna" : "Primero la región"}</option>
            {comunasOfRegion.map(([code, name]) => {
              const n = countIn((o) => o.comunaCode === code);
              return <option key={code} value={code}>{name}{n ? `  ·  ${cemeteries(n)}` : ""}</option>;
            })}
          </select>
        </div>
      </div>
      <div className={field}>
        <label htmlFor={`${id}-cem`} className={cap}>Cementerio</label>
        <select
          id={`${id}-cem`}
          value={choice}
          disabled={!comuna}
          onChange={(e) => pick(e.target.value)}
          className={selectClass}
        >
          <option value="">{comuna ? (inComuna.length ? "Elige el cementerio" : "No hay ninguno registrado aquí") : "Primero la comuna"}</option>
          {inComuna.map((o) => (
            <option key={o.value} value={o.value}>{o.label}{o.n ? `  ·  ${o.n} ${o.n === 1 ? "persona" : "personas"}` : ""}</option>
          ))}
          <option value={OTHER}>+ Otro cementerio (escribir el nombre)</option>
        </select>
      </div>
      {choice === OTHER && (
        <div className={field}>
          <label htmlFor={`${id}-custom`} className={cap}>Nombre del cementerio nuevo</label>
          <input
            id={`${id}-custom`}
            value={custom}
            onChange={(e) => { setCustom(e.target.value); onChange(composeCustom(e.target.value, comunaName)); }}
            placeholder="p. ej. Cementerio Parroquial"
            className={selectClass}
          />
          {comunaName && <p className="text-base text-gris">Se guarda en {comunaName}{regionName ? `, ${regionName}` : ""} y queda en la lista para las demás fichas.</p>}
        </div>
      )}
      {(selected || (choice === OTHER && custom.trim())) && (
        <div className="flex min-w-0 items-start gap-2.5 rounded-xl bg-[#e5f1ea] px-4 py-3">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-listo text-white" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><path d="M5 12l5 5 9-10" /></svg>
          </span>
          <div className="min-w-0 flex-1 leading-snug">
            <p className="break-words text-[1.125rem] font-bold text-ink">{selected?.label ?? custom.trim()}</p>
            <p className="break-words text-base text-gris">{[comunaName, regionName].filter(Boolean).join(" · ")}</p>
          </div>
          <button
            type="button"
            onClick={() => { setRegion(""); setComuna(""); setChoice(""); setCustom(""); onChange(""); }}
            className="min-h-11 shrink-0 px-2 text-base font-bold text-ink underline decoration-2 underline-offset-4 hover:text-terra"
          >
            Quitar
          </button>
        </div>
      )}
    </fieldset>
  );
}
