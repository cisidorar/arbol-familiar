"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type DragEvent } from "react";
import LineageModal from "./LineageModal";
import PersonPanel from "./PersonPanel";
import { kinshipPath, type GraphPerson, type LineageStep } from "@/lib/lineage";
import type { Burial, CemeteryGroup } from "@/lib/cemeteries";
import { Notice, buttonClass } from "./ui";
import { uploadedPhotoUrl } from "@/lib/geo/cemetery-photos";

type Box = [number, number, number, number];
export type GuideRegion = { code: string; name: string; d: string; bbox: Box };
export type GuidePlace = CemeteryGroup & {
  /** Centro de la comuna en el mapa (null si no se sabe la comuna). */
  point: [number, number] | null;
  /** Contorno de la comuna (ya no se pinta, pero la página lo sigue entregando). */
  comunaD: string | null;
  /** La foto que subió la familia (null si todavía no hay). */
  photo: { src: string; by: string | null } | null;
};

type Mode = "cemetery" | "person";

const WRAP = "mx-auto max-w-[120rem] px-4 sm:px-6 lg:px-10 2xl:px-14";
/** "Metropolitana de Santiago" → "Metropolitana"; las demás quedan igual. */
const shortRegion = (name: string) => name.replace(/^Metropolitana.*/, "Metropolitana");
const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
/** Más personas primero; si empatan, por nombre. */
const byPeople = (a: GuidePlace, b: GuidePlace) => b.people.length - a.people.length || a.name.localeCompare(b.name, "es");
const sumPeople = (ps: GuidePlace[]) => ps.reduce((n, p) => n + p.people.length, 0);

/** El nombre del cementerio sin ", Comuna" al final (la comuna ya va debajo). */
function siteName(p: GuidePlace) {
  if (!p.locality) return p.name;
  const tail = `, ${p.locality}`;
  return p.name.endsWith(tail) ? p.name.slice(0, -tail.length) : p.name;
}

function mapsUrl(p: GuidePlace) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.name}, ${p.locality ?? ""}, Chile`)}`;
}

function directionsUrl(p: GuidePlace) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${p.name}, ${p.locality ?? ""}, Chile`)}`;
}

/** Los mismos colores que el árbol: azul hombres, rosado mujeres. */
const sexColor = (sex?: string | null) => (sex === "F" ? "#b03a62" : sex === "M" ? "#2f66b8" : "#4a4740");

/** "Metropolitana de Santiago" → "Región Metropolitana"; "Valparaíso" → "Región de Valparaíso". */
function regionLabel(name: string) {
  if (!name) return "";
  return name.startsWith("Metropolitana") ? "Región Metropolitana" : `Región de ${name}`;
}

/** Achica la foto en el navegador (lado mayor 1600 px, JPEG) para que suba rápido y pese poco. */
async function shrinkPhoto(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bmp.width * scale));
  canvas.height = Math.max(1, Math.round(bmp.height * scale));
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close?.();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
  if (!blob) throw new Error("no-blob");
  return blob;
}

/** Sube la foto de un cementerio. Devuelve el número de versión o lanza el mensaje de error. */
async function sendPhoto(key: string, file: File): Promise<number> {
  let blob: Blob;
  try {
    blob = await shrinkPhoto(file);
  } catch {
    throw new Error("No pude leer ese archivo. Prueba con una foto en formato JPG o PNG.");
  }
  const body = new FormData();
  body.set("k", key);
  body.set("file", blob, "foto.jpg");
  const res = await fetch("/api/cementerios/foto", { method: "POST", body });
  const j = await res.json().catch(() => null);
  if (!res.ok) throw new Error(j?.error ?? "No se pudo subir la foto. Inténtalo otra vez.");
  return j?.version ?? Date.now();
}

const PinIcon = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
    <path d="M12 21s-7-6.3-7-12a7 7 0 0 1 14 0c0 5.7-7 12-7 12z" />
    <circle cx="12" cy="9" r="2.5" />
  </svg>
);

const ImageIcon = ({ className = "h-9 w-9" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <circle cx="9" cy="10.5" r="1.8" />
    <path d="m21 16-5-5-8 8" />
  </svg>
);

export default function CemeteryGuide({
  places,
  regions,
  graph,
  rootId,
  canEdit,
}: {
  places: GuidePlace[];
  regions: GuideRegion[];
  graph: GraphPerson[];
  rootId: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("cemetery");
  const [region, setRegion] = useState<string | null>(null);
  const [q, setQ] = useState("");
  /** null = la lista de cementerios; con una clave = ese cementerio abierto. */
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [steps, setSteps] = useState<LineageStep[] | null>(null);
  const [noPath, setNoPath] = useState<string | null>(null);

  // La ficha de la persona se abre al lado, sin salir de la página. Los datos del árbol (para el parentesco) se piden la primera vez.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [treeData, setTreeData] = useState<any[]>([]);
  useEffect(() => {
    if (!selectedId || treeData.length) return;
    fetch("/api/tree")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j?.data && setTreeData(j.data))
      .catch(() => {});
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fotos y ubicaciones: lo recién guardado se ve al tiro; cuando la página se refresca vuelve a mandar la verdad.
  const [photoOverride, setPhotoOverride] = useState<Record<string, GuidePlace["photo"]>>({});
  const [spotOverride, setSpotOverride] = useState<Record<string, string>>({});
  useEffect(() => {
    setPhotoOverride({});
    setSpotOverride({});
  }, [places]);
  const [photoBusy, setPhotoBusy] = useState<string | null>(null);
  const [photoErr, setPhotoErr] = useState<string | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Anotar dónde está la tumba.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [spotDraft, setSpotDraft] = useState("");
  const [spotBusy, setSpotBusy] = useState(false);
  const [spotErr, setSpotErr] = useState<string | null>(null);

  const regionName = (code: string | null) => regions.find((r) => r.code === code)?.name ?? "";
  const order = regions.map((r) => r.code);
  const total = sumPeople(places);

  // Regiones con cementerios (las que tienen más personas primero) y cuántos cementerios hay en cada una.
  const regionCounts = useMemo(() => {
    const m = new Map<string, { places: number; people: number }>();
    for (const p of places) {
      if (!p.regionCode || !p.point) continue;
      const c = m.get(p.regionCode) ?? { places: 0, people: 0 };
      m.set(p.regionCode, { places: c.places + 1, people: c.people + p.people.length });
    }
    return [...m.entries()]
      .sort((a, b) => b[1].people - a[1].people || order.indexOf(a[0]) - order.indexOf(b[0]))
      .map(([code, c]) => [code, c.places] as [string, number]);
  }, [places]); // eslint-disable-line react-hooks/exhaustive-deps
  const pendingCount = places.filter((p) => !p.point).length;

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

  // Por región (las de más personas primero) y, dentro, los cementerios con más personas primero.
  const sections = useMemo(() => {
    const byRegion = new Map<string, GuidePlace[]>();
    const pending: GuidePlace[] = [];
    for (const p of filtered) {
      if (!p.point || !p.regionCode) pending.push(p);
      else byRegion.set(p.regionCode, [...(byRegion.get(p.regionCode) ?? []), p]);
    }
    const list = [...byRegion.entries()]
      .map(([code, ps]) => ({ code, title: regionName(code), places: ps.sort(byPeople) }))
      .sort((a, b) => sumPeople(b.places) - sumPeople(a.places) || order.indexOf(a.code) - order.indexOf(b.code));
    if (pending.length) list.push({ code: "pending", title: "Por ubicar", places: pending.sort(byPeople) });
    return list;
  }, [filtered]); // eslint-disable-line react-hooks/exhaustive-deps

  // El cementerio abierto: con todas sus personas, sin importar la búsqueda.
  const current = selectedKey ? places.find((p) => p.key === selectedKey) ?? null : null;

  // Vista "Por persona": todas las personas, las más cercanas primero.
  const everyone = useMemo(() => {
    const rows = filtered.flatMap((p) => p.people.map((b) => ({ b, p })));
    return rows.sort((x, y) => (x.b.distance ?? 99) - (y.b.distance ?? 99) || x.b.name.localeCompare(y.b.name, "es"));
  }, [filtered]);

  const toTop = () => requestAnimationFrame(() => document.getElementById("cem-inicio")?.scrollIntoView({ block: "start" }));
  const openPlace = (key: string) => {
    setSelectedKey(key);
    setPhotoErr(null);
    setEditingId(null);
    toTop();
  };
  const backToList = () => {
    setSelectedKey(null);
    setPhotoErr(null);
    setEditingId(null);
    toTop();
  };

  const openPath = (p: GuidePlace, b: Burial) => {
    if (!rootId) return;
    const spot = b.spot ? ` (${b.spot})` : "";
    const path = kinshipPath(rootId, b.personId, graph, (id) => (id === b.personId ? `Sepultado/a en ${p.name}${spot}` : null));
    if (!path || path.length < 2) return setNoPath(b.name);
    setNoPath(null);
    setSteps(path);
  };

  /* ---------- Fotos ---------- */

  const photoOf = (p: GuidePlace) => (p.key in photoOverride ? photoOverride[p.key] : p.photo);

  const uploadPhoto = async (p: GuidePlace, file: File | undefined | null) => {
    if (!file || !canEdit) return;
    setPhotoBusy(p.key);
    setPhotoErr(null);
    try {
      const v = await sendPhoto(p.key, file);
      setPhotoOverride((o) => ({ ...o, [p.key]: { src: uploadedPhotoUrl(p.key, v), by: null } }));
      router.refresh();
    } catch (e) {
      setPhotoErr(e instanceof Error ? e.message : "No se pudo subir la foto.");
    } finally {
      setPhotoBusy(null);
    }
  };

  const removePhoto = async (p: GuidePlace) => {
    setPhotoBusy(p.key);
    setPhotoErr(null);
    try {
      const res = await fetch(`/api/cementerios/foto?k=${encodeURIComponent(p.key)}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setPhotoOverride((o) => ({ ...o, [p.key]: null }));
      router.refresh();
    } catch {
      setPhotoErr("No se pudo quitar la foto. Inténtalo otra vez.");
    } finally {
      setPhotoBusy(null);
    }
  };

  const dropHandlers = (p: GuidePlace) =>
    canEdit
      ? {
          onDragOver: (e: DragEvent) => {
            e.preventDefault();
            setDragKey(p.key);
          },
          onDragLeave: () => setDragKey(null),
          onDrop: (e: DragEvent) => {
            e.preventDefault();
            setDragKey(null);
            uploadPhoto(p, e.dataTransfer.files?.[0]);
          },
        }
      : {};

  /** El cuadro de la foto: la foto, el lugar para soltar una o, si solo se puede leer, un aviso. `hero` es el grande de la ficha del cementerio. */
  const photoSquare = (p: GuidePlace, hero: boolean) => {
    const ph = photoOf(p);
    const busy = photoBusy === p.key;
    const over = dragKey === p.key;
    const box = `relative w-full overflow-hidden ${hero ? "aspect-[3/2]" : "aspect-square rounded-3xl shadow-[0_8px_24px_-12px_rgba(26,24,22,0.35)]"}`;
    if (ph) {
      const img = (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={ph.src} alt={`Foto de ${siteName(p)}`} className="h-full w-full object-cover" />
      );
      return hero ? (
        <div className={box} {...dropHandlers(p)}>
          {img}
          {(busy || over) && (
            <div className="absolute inset-0 grid place-items-center bg-ink/60 p-6 text-center text-[1.125rem] font-bold text-white">
              {busy ? "Subiendo la foto…" : "Suelta aquí para cambiar la foto"}
            </div>
          )}
        </div>
      ) : (
        <button type="button" onClick={() => openPlace(p.key)} className={`${box} block`} aria-label={`Abrir ${siteName(p)}`}>
          {img}
        </button>
      );
    }
    const empty = (
      <>
        <ImageIcon className={hero ? "h-12 w-12" : "h-9 w-9"} />
        {canEdit ? (
          <>
            <span className={hero ? "text-[1.125rem] font-bold" : "text-base font-bold"}>
              {busy ? "Subiendo la foto…" : hero ? `Arrastra aquí una foto de ${siteName(p)}` : "Foto del cementerio"}
            </span>
            <span className="text-base">
              o <span className="underline underline-offset-4">elegir un archivo</span>
            </span>
          </>
        ) : (
          <span className="text-base font-bold">Sin foto todavía</span>
        )}
      </>
    );
    const look = `grid place-items-center content-center gap-2 border-2 border-dashed px-4 text-center text-gris ${
      over ? "border-terra bg-[#fbecd9]" : "border-[#b9b5ac] bg-[#e4e2dd]"
    }`;
    if (!canEdit) {
      return (
        <button type="button" onClick={() => !hero && openPlace(p.key)} className={`${box} ${look}`} aria-label={hero ? undefined : `Abrir ${siteName(p)}`} tabIndex={hero ? -1 : 0}>
          {empty}
        </button>
      );
    }
    return (
      <label className={`${box} ${look} cursor-pointer ${busy ? "pointer-events-none opacity-70" : "hover:border-ink"}`} {...dropHandlers(p)}>
        {empty}
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            uploadPhoto(p, e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>
    );
  };

  /* ---------- Dirección y tumba ---------- */

  const addressOf = (p: GuidePlace) => [siteName(p), p.locality, regionLabel(regionName(p.regionCode)), "Chile"].filter(Boolean).join(", ");
  const copyAddress = async (p: GuidePlace) => {
    try {
      await navigator.clipboard.writeText(addressOf(p));
    } catch {
      const ta = document.createElement("textarea");
      ta.value = addressOf(p);
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const spotOf = (b: Burial) => (b.personId in spotOverride ? spotOverride[b.personId] : b.spot ?? "");
  const startSpot = (b: Burial) => {
    setEditingId(b.personId);
    setSpotDraft(spotOf(b));
    setSpotErr(null);
  };
  const saveSpot = async (b: Burial) => {
    if (!b.eventId) return;
    setSpotBusy(true);
    setSpotErr(null);
    try {
      const res = await fetch("/api/cementerios/ubicacion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: b.eventId, spot: spotDraft }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "No se pudo guardar.");
      setSpotOverride((o) => ({ ...o, [b.personId]: spotDraft.replace(/\s+/g, " ").trim() }));
      setEditingId(null);
      router.refresh();
    } catch (e) {
      setSpotErr(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setSpotBusy(false);
    }
  };

  /* ---------- Piezas ---------- */

  const tab = (on: boolean) =>
    `inline-flex min-h-14 shrink-0 items-center gap-3 whitespace-nowrap rounded-full border px-6 text-[1.125rem] font-bold transition ${
      on ? "border-paper bg-paper text-ink" : "border-white/35 text-white hover:border-white hover:bg-white/10"
    }`;
  const count = (on: boolean) => `rounded-full px-2.5 py-0.5 text-base font-bold ${on ? "bg-ink text-white" : "bg-white/15 text-white"}`;
  const pickTab = (r: string | null) => {
    setRegion(r);
    if (selectedKey) backToList();
  };

  const capFirst = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
  const drawerPerson = (b: Burial, p: GuidePlace) => {
    const spot = spotOf(b);
    const editing = editingId === b.personId;
    const [kin, ...rest] = (b.relation ?? "").split(", ");
    return (
      <li key={`${p.key}-${b.personId}`} className={`rounded-2xl bg-[#f1efea] p-4 ${selectedId === b.personId ? "ring-2 ring-ink" : ""}`}>
        <div className="flex items-baseline justify-between gap-3 border-b border-terra pb-2 font-maquina text-[0.9375rem] uppercase tracking-wide">
          <span>{kin || "Familia"}</span>
          <span className="shrink-0 tabular-nums">{b.birth ?? "?"} – {b.death ?? "?"}</span>
        </div>
        <p className="mt-3 text-[1.25rem] font-bold leading-snug">{b.name}</p>
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="zb-apoyo min-w-0">{capFirst(rest.join(", "))}</p>
          <button type="button" onClick={() => setSelectedId(b.personId)} className="min-h-12 shrink-0 rounded-full bg-white px-5 text-[1.0625rem] font-bold hover:bg-paper">
            Ver ficha
          </button>
        </div>
        <div className="mt-3 border-t border-white pt-3">
          {editing ? (
            <div className="space-y-3">
              <label htmlFor={`tumba-${b.personId}`} className="zb-apoyo block">
                Tumba de {b.name}
              </label>
              <input
                id={`tumba-${b.personId}`}
                autoFocus
                value={spotDraft}
                maxLength={200}
                onChange={(e) => setSpotDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveSpot(b);
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    setEditingId(null);
                  }
                }}
                placeholder="Por ejemplo: cruz 158, patio 8"
                className="min-h-12 w-full rounded-lg border-2 border-[#8f8a80] bg-white px-3.5 py-2 text-[1.125rem] text-ink placeholder:text-gris/70 focus:border-hombre focus:outline-none"
              />
              {spotErr && <Notice kind="aviso">{spotErr}</Notice>}
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={spotBusy} onClick={() => saveSpot(b)} className={buttonClass("principal", "!min-h-12 !px-6")}>
                  {spotBusy ? "Guardando…" : "Guardar"}
                </button>
                <button type="button" disabled={spotBusy} onClick={() => setEditingId(null)} className={buttonClass("enlace")}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <p className="zb-apoyo min-w-0">
                Tumba: <strong className={spot ? "text-ink" : "font-normal"}>{spot || "sin ubicación anotada"}</strong>
              </p>
              <div className="flex shrink-0 items-center gap-3">
                {canEdit && b.eventId && (
                  <button type="button" onClick={() => startSpot(b)} className={buttonClass("enlace", "!px-1")} aria-label={`${spot ? "Cambiar" : "Anotar"} la tumba de ${b.name}`}>
                    {spot ? "Cambiar" : "Anotar"}
                  </button>
                )}
                {rootId && b.personId !== rootId && (
                  <button type="button" onClick={() => openPath(p, b)} className={buttonClass("enlace", "!px-1")}>
                    Ver camino
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </li>
    );
  };

  // El panel del cementerio: Escape lo cierra y la página de atrás no se mueve mientras está abierto.
  useEffect(() => {
    if (!selectedKey) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !selectedId && !steps) backToList();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [selectedKey, selectedId, steps]); // eslint-disable-line react-hooks/exhaustive-deps

  const personCard = (b: Burial, p: GuidePlace, showPlace: boolean) => {
    const spot = spotOf(b);
    const editing = editingId === b.personId;
    return (
      <li key={`${p.key}-${b.personId}`} className={`flex flex-col gap-4 rounded-3xl border-2 bg-white p-5 ${selectedId === b.personId ? "border-ink" : "border-line"}`}>
        <div className="flex items-start gap-4">
          <span
            className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-[1.5rem] font-bold"
            style={{ backgroundColor: `${sexColor(b.sex)}1a`, color: sexColor(b.sex) }}
            aria-hidden
          >
            {b.name.trim().charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="zb-nombre">{b.name}</p>
            {b.relation && <p className="zb-apoyo mt-0.5">{b.relation}</p>}
            {showPlace && (
              <button
                type="button"
                onClick={() => openPlace(p.key)}
                className="mt-1 inline-flex min-h-8 items-center gap-1.5 text-start text-base font-bold text-[#9a4a14] underline decoration-2 underline-offset-4"
              >
                <PinIcon /> {siteName(p)}
                {p.locality ? `, ${p.locality}` : ""}
              </button>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl bg-[#f7f6f3]">
          <div className="grid grid-cols-2 divide-x-2 divide-white">
            <div className="px-4 py-3">
              <p className="zb-apoyo">Nació</p>
              <p className="text-[1.125rem] font-bold tabular-nums">{b.birth ?? "Sin dato"}</p>
            </div>
            <div className="px-4 py-3">
              <p className="zb-apoyo">Murió</p>
              <p className="text-[1.125rem] font-bold tabular-nums">{b.death ?? "Sin dato"}</p>
            </div>
          </div>
          <div className="border-t-2 border-white px-4 py-3">
            {editing ? (
              <div className="space-y-3">
                <label htmlFor={`tumba-${b.personId}`} className="zb-apoyo block">
                  Tumba de {b.name}
                </label>
                <input
                  id={`tumba-${b.personId}`}
                  autoFocus
                  value={spotDraft}
                  maxLength={200}
                  onChange={(e) => setSpotDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveSpot(b);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  placeholder="Por ejemplo: cruz 158, patio 8"
                  className="min-h-12 w-full rounded-lg border-2 border-[#8f8a80] bg-white px-3.5 py-2 text-[1.125rem] text-ink placeholder:text-gris/70 focus:border-hombre focus:outline-none"
                />
                {spotErr && <Notice kind="aviso">{spotErr}</Notice>}
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={spotBusy} onClick={() => saveSpot(b)} className={buttonClass("principal", "!min-h-12 !px-6")}>
                    {spotBusy ? "Guardando…" : "Guardar"}
                  </button>
                  <button type="button" disabled={spotBusy} onClick={() => setEditingId(null)} className={buttonClass("enlace")}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="zb-apoyo">Tumba</p>
                  <p className={`text-[1.125rem] ${spot ? "font-bold" : "text-gris"}`}>{spot || "Sin ubicación anotada"}</p>
                </div>
                {canEdit && b.eventId && (
                  <button type="button" onClick={() => startSpot(b)} className={buttonClass("enlace", "shrink-0")} aria-label={`${spot ? "Cambiar" : "Anotar"} la tumba de ${b.name}`}>
                    {spot ? "Cambiar" : "Anotar"}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="mt-auto flex flex-wrap gap-3 print:hidden">
          <button type="button" onClick={() => setSelectedId(b.personId)} className={buttonClass("principal", "min-w-0 flex-1 !px-5")}>
            Ver ficha
          </button>
          {rootId && b.personId !== rootId && (
            <button type="button" onClick={() => openPath(p, b)} className={buttonClass("secundario", "min-w-0 flex-1 !px-5")}>
              Ver camino
            </button>
          )}
        </div>
      </li>
    );
  };

  return (
    <div id="cem-inicio" className="scroll-mt-4">
      {/* Franja oscura: título, resumen y regiones */}
      <header className="bg-ink text-white print:hidden">
        <div className={`${WRAP} pb-8 pt-10 lg:pb-10 lg:pt-14`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="font-maquina text-[2.5rem] leading-[1.05] sm:text-6xl">Dónde descansan</h1>
              <p className="mt-5 max-w-3xl text-[1.1875rem] leading-relaxed text-white/80 sm:text-[1.375rem]">
                {plural(total, "persona", "personas")} de la familia en {plural(places.length, "cementerio", "cementerios")}. Toca uno para ver quiénes descansan ahí y cómo llegar.
              </p>
            </div>
            <button type="button" onClick={() => window.print()} className="inline-flex min-h-12 items-center rounded-full border border-white/35 px-5 text-[1.0625rem] font-bold text-white hover:border-white hover:bg-white/10">
              Imprimir lista
            </button>
          </div>
          <div className="-mx-4 mt-7 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0" role="group" aria-label="Región">
            <button type="button" className={tab(region === null)} aria-pressed={region === null} onClick={() => pickTab(null)}>
              Todas <span className={count(region === null)}>{places.length}</span>
            </button>
            {regionCounts.map(([code, n]) => (
              <button key={code} type="button" className={tab(region === code)} aria-pressed={region === code} onClick={() => pickTab(region === code ? null : code)}>
                {shortRegion(regionName(code))} <span className={count(region === code)}>{n}</span>
              </button>
            ))}
            {pendingCount > 0 && (
              <button type="button" className={tab(region === "pending")} aria-pressed={region === "pending"} onClick={() => pickTab(region === "pending" ? null : "pending")}>
                Por ubicar <span className={count(region === "pending")}>{pendingCount}</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <div className={`${WRAP} py-8 lg:py-10`}>
      {/* Búsqueda y forma de ver */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 print:hidden">
        <label className="relative block min-w-0 flex-1 basis-72 sm:max-w-2xl">
          <span className="sr-only">Buscar una persona, comuna o cementerio</span>
          <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gris" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              if (selectedKey) setSelectedKey(null);
            }}
            placeholder="Busca una persona, comuna o cementerio"
            className="min-h-12 w-full rounded-2xl border-2 border-[#8f8a80] bg-white py-2 pl-12 pr-12 text-[1.125rem] text-ink placeholder:text-gris/70 focus:border-hombre focus:outline-none"
          />
          {q && (
            <button type="button" onClick={() => setQ("")} aria-label="Borrar búsqueda" className="absolute right-1.5 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full text-xl text-gris hover:bg-paper">
              ×
            </button>
          )}
        </label>
        <div className="inline-flex rounded-2xl bg-paper p-1.5" role="tablist" aria-label="Cómo ver la lista">
          {([["cemetery", "Por cementerio"], ["person", "Por persona"]] as const).map(([m, label]) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => {
                setMode(m);
                setSelectedKey(null);
              }}
              className={`min-h-12 rounded-xl px-5 text-[1.0625rem] transition ${mode === m ? "bg-white font-bold text-ink shadow" : "text-gris hover:text-ink"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {noPath && (
        <div className="mt-4 print:hidden">
          <Notice kind="aviso">No encuentro un parentesco entre tú y {noPath} en el árbol.</Notice>
        </div>
      )}

      {mode === "person" ? (
        /* Por persona */
        !everyone.length ? (
          <p className="zb-texto mt-8 rounded-2xl border-2 border-dashed border-line p-8 text-center text-gris print:hidden">No encontramos personas con esa búsqueda. Prueba con otra palabra.</p>
        ) : (
          <section className="mt-8 print:hidden" aria-label="Personas">
            <div className="flex items-end justify-between gap-4 border-b-2 border-ink pb-3">
              <h2 className="zb-seccion">Personas</h2>
              <p className="zb-apoyo">{plural(everyone.length, "persona", "personas")}, las más cercanas a ti primero</p>
            </div>
            <ul className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{everyone.map(({ b, p }) => personCard(b, p, true))}</ul>
          </section>
        )
      ) : !sections.length ? (
        <p className="zb-texto mt-8 rounded-2xl border-2 border-dashed border-line p-8 text-center text-gris print:hidden">No encontramos cementerios ni personas con esa búsqueda. Prueba con otra palabra.</p>
      ) : (
        /* La lista: cementerios por región */
        <div className="mt-8 space-y-14 print:hidden">
          {photoErr && <Notice kind="aviso">{photoErr}</Notice>}
          {sections.map((s) => (
            <section key={s.code} aria-label={s.title}>
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-line pb-3">
                <h2 className="text-[1.5rem] font-bold leading-tight sm:text-[1.75rem]">{s.code === "pending" ? s.title : regionLabel(s.title)}</h2>
                <p className="zb-texto text-gris">{plural(sumPeople(s.places), "persona", "personas")}</p>
              </div>
              <ul className="mt-6 grid gap-x-7 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {s.places.map((p) => (
                  <li key={p.key} className="flex flex-col">
                    <div className="relative">
                      {photoSquare(p, false)}
                      {p.incomplete && (
                        <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-white px-3.5 py-1.5 text-base font-bold shadow">Por confirmar</span>
                      )}
                    </div>
                    <div className="mt-4 flex items-start justify-between gap-3">
                      <button type="button" onClick={() => openPlace(p.key)} className="min-w-0 text-left">
                        <span className="zb-nombre block">{siteName(p)}</span>
                        <span className="zb-apoyo mt-0.5 block">
                          {p.locality ?? "Comuna desconocida"} · {plural(p.people.length, "persona", "personas")}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openPlace(p.key)}
                        className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-ink text-white transition hover:bg-terra"
                        aria-label={`Ver ${siteName(p)}`}
                      >
                        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
                          <path d="M5 12h14m-6-6 6 6-6 6" />
                        </svg>
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {/* Panel del cementerio abierto */}
      {current && (
        <div className="fixed inset-0 z-40 print:hidden" role="dialog" aria-modal="true" aria-label={siteName(current)}>
          <button type="button" className="absolute inset-0 cursor-default bg-ink/55" onClick={backToList} aria-label="Cerrar" tabIndex={-1} />
          <aside className="absolute right-0 top-0 flex h-full w-full flex-col overflow-y-auto bg-white shadow-2xl sm:w-[min(36rem,92vw)]">
            <div className="relative shrink-0">
              {photoSquare(current, true)}
              {current.incomplete && (
                <span className="pointer-events-none absolute bottom-3 left-4 rounded-full bg-white px-3.5 py-1.5 text-base font-bold shadow">Por confirmar</span>
              )}
            </div>
            <button
              type="button"
              onClick={backToList}
              aria-label="Cerrar"
              className="fixed right-4 top-4 z-10 grid h-12 w-12 place-items-center rounded-full bg-white text-ink shadow-lg hover:bg-paper sm:absolute"
            >
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
                <path d="m6 6 12 12M18 6 6 18" />
              </svg>
            </button>
            <div className="p-6">
              <p className="zb-texto text-gris">
                {[current.locality ?? "Comuna desconocida", regionLabel(regionName(current.regionCode))].filter(Boolean).join(" · ")}
              </p>
              <h2 className="zb-titulo mt-1">{siteName(current)}</h2>
              <p className="zb-texto mt-3">
                <strong>{plural(current.people.length, "persona", "personas")}</strong> de la familia {current.people.length === 1 ? "descansa" : "descansan"} aquí
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <a href={directionsUrl(current)} target="_blank" rel="noreferrer" className={buttonClass("principal", "min-w-0 flex-1 !px-5")}>
                  Cómo llegar <span aria-hidden>↗</span>
                </a>
                <a href={mapsUrl(current)} target="_blank" rel="noreferrer" className={buttonClass("secundario", "min-w-0 flex-1 !px-5")}>
                  Ver en el mapa
                </a>
              </div>
              <button type="button" onClick={() => copyAddress(current)} className={buttonClass("enlace", "mt-2 !px-1")} aria-live="polite">
                {copied ? "Dirección copiada" : "Copiar dirección"}
              </button>
              {canEdit && (
                <div className="mt-3">
                  <p className="zb-apoyo">{photoOf(current) ? "Para cambiar la foto, arrastra otra sobre ella." : "Para agregar la foto, arrástrala sobre el cuadro."}</p>
                  {photoOf(current) && (
                    <div className="mt-3 flex flex-wrap gap-3">
                      <label className={`${buttonClass("secundario")} cursor-pointer ${photoBusy === current.key ? "pointer-events-none opacity-60" : ""}`}>
                        Elegir otra foto
                        <input
                          type="file"
                          accept="image/*"
                          className="sr-only"
                          disabled={photoBusy === current.key}
                          onChange={(e) => {
                            uploadPhoto(current, e.target.files?.[0]);
                            e.target.value = "";
                          }}
                        />
                      </label>
                      <button type="button" disabled={photoBusy === current.key} onClick={() => removePhoto(current)} className={buttonClass("enlace")}>
                        Quitar foto
                      </button>
                    </div>
                  )}
                </div>
              )}
              {photoErr && (
                <div className="mt-4">
                  <Notice kind="aviso">{photoErr}</Notice>
                </div>
              )}
              <ul className="mt-6 space-y-4" aria-label="Aquí descansan">
                {current.people.map((b) => drawerPerson(b, current))}
              </ul>
            </div>
          </aside>
        </div>
      )}

      {/* Al imprimir: todos los cementerios con su gente, en una lista seguida. */}
      <div className="hidden print:block">
        {sections.map((s) => (
          <section key={s.code} className="mb-6">
            <h2 className="mb-2 border-b border-[#ccc] pb-1 text-lg font-semibold">{s.title}</h2>
            {s.places.map((p) => (
              <div key={p.key} className="mb-3 break-inside-avoid">
                <h3 className="text-base font-semibold">
                  {siteName(p)} <span className="text-sm font-normal">· {p.locality ?? "comuna desconocida"} · {plural(p.people.length, "persona", "personas")}</span>
                </h3>
                <ul className="ml-4 list-disc text-sm">
                  {p.people.map((b) => (
                    <li key={b.personId}>
                      {b.name}
                      {b.relation ? `, ${b.relation}` : ""} ({b.birth ?? "?"} – {b.death ?? "?"}){spotOf(b) ? ` — ${spotOf(b)}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        ))}
      </div>

      </div>

      <PersonPanel
        personId={selectedId}
        mainId={selectedId}
        homeId={rootId}
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

      {steps && <LineageModal steps={steps} onClose={() => setSteps(null)} />}
    </div>
  );
}
