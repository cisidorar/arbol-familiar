"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import LineageModal from "./LineageModal";
import PersonPanel from "./PersonPanel";
import { kinshipPath, type GraphPerson, type LineageStep } from "@/lib/lineage";
import type { Burial, CemeteryGroup } from "@/lib/cemeteries";
import { Initial, Notice, buttonClass } from "./ui";
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



const WRAP = "mx-auto max-w-[120rem] px-4 sm:px-6 lg:px-10 2xl:px-14";
/** "Metropolitana de Santiago" → "Metropolitana"; las demás quedan igual. */
const shortRegion = (name: string) => name.replace(/^Metropolitana.*/, "Metropolitana");
const capFirst = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
/** Más personas primero; si empatan, por nombre. */
// Los cementerios con más personas primero; a igual cantidad, por nombre.
const byPeople = (a: GuidePlace, b: GuidePlace) => b.people.length - a.people.length || a.name.localeCompare(b.name, "es");
const sumPeople = (ps: GuidePlace[]) => ps.reduce((n, p) => n + p.people.length, 0);

/** El nombre del cementerio sin ", Comuna" al final (la comuna ya va debajo). */
function siteName(p: GuidePlace) {
  if (!p.locality) return p.name;
  const tail = `, ${p.locality}`;
  return p.name.endsWith(tail) ? p.name.slice(0, -tail.length) : p.name;
}

/** ¿Se puede armar una ruta? Solo si es un cementerio de verdad y se sabe la comuna; si no, Google Maps buscaría cualquier cosa. */
const canRoute = (p: GuidePlace) => !p.cremation && !p.incomplete && Boolean(p.locality);
const routeQuery = (p: GuidePlace) => `${siteName(p)}, ${p.locality}, Chile`;

function mapsUrl(p: GuidePlace) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(routeQuery(p))}`;
}

function directionsUrl(p: GuidePlace) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(routeQuery(p))}`;
}

const NO_ROUTE = "Todavía no sabemos dónde queda este lugar";

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
  const search = useSearchParams();
  const [region, setRegion] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [steps, setSteps] = useState<LineageStep[] | null>(null);
  const [noPath, setNoPath] = useState<string | null>(null);

  // Qué se está mirando vive en la dirección (?p=persona, ?c=cementerio): el botón "atrás" del teléfono funciona y se puede compartir el enlace.
  const personParam = search.get("p");
  const placeParam = search.get("c");
  const pushed = useRef(false);
  const go = (next: { p?: string; c?: string } | null) => {
    const u = new URLSearchParams();
    if (next?.p) u.set("p", next.p);
    if (next?.c) u.set("c", next.c);
    pushed.current = true;
    window.history.pushState(null, "", u.size ? `?${u}` : window.location.pathname);
    window.scrollTo({ top: 0 });
    setPhotoErr(null);
    setEditingId(null);
  };
  const back = () => (pushed.current ? window.history.back() : go(null));
  const openPlace = (key: string) => go({ c: key });
  const openPerson = (id: string) => go({ p: id });

  // La ficha completa de la persona se abre al lado. Los datos del árbol (para el parentesco) se piden la primera vez.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [treeData, setTreeData] = useState<any[]>([]); // eslint-disable-line @typescript-eslint/no-explicit-any
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
  const [seenPlaces, setSeenPlaces] = useState(places);
  if (seenPlaces !== places) {
    setSeenPlaces(places);
    setPhotoOverride({});
    setSpotOverride({});
  }
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
  // Los cementerios de verdad: la cremación es un hecho de la persona, no un lugar.
  const cemeteries = useMemo(() => places.filter((p) => !p.cremation), [places]);
  const total = sumPeople(places);

  // Regiones con cementerios (las que tienen más personas primero) y cuántos cementerios hay en cada una.
  const regionCounts = useMemo(() => {
    const m = new Map<string, { places: number; people: number }>();
    for (const p of cemeteries) {
      if (!p.regionCode || !p.point) continue;
      const c = m.get(p.regionCode) ?? { places: 0, people: 0 };
      m.set(p.regionCode, { places: c.places + 1, people: c.people + p.people.length });
    }
    return [...m.entries()]
      .sort((a, b) => b[1].people - a[1].people || order.indexOf(a[0]) - order.indexOf(b[0]))
      .map(([code, c]) => [code, c.places] as [string, number]);
  }, [cemeteries]); // eslint-disable-line react-hooks/exhaustive-deps
  const pendingCount = cemeteries.filter((p) => !p.point).length;


  // Todas las personas, las más cercanas a quien mira primero.
  const everyone = useMemo(
    () => places.flatMap((p) => p.people.map((b) => ({ b, p }))).sort((x, y) => (x.b.distance ?? 99) - (y.b.distance ?? 99) || x.b.name.localeCompare(y.b.name, "es")),
    [places],
  );
  const words = useMemo(() => norm(q).split(/\s+/).filter(Boolean), [q]);
  const placeText = (p: GuidePlace) => norm(`${p.name} ${p.locality ?? ""} ${regionName(p.regionCode)}`);
  // Búsqueda: personas (por nombre, parentesco, cementerio o comuna) y cementerios.
  const hits = useMemo(
    () => (words.length ? everyone.filter(({ b, p }) => words.every((w) => norm(`${b.name} ${b.relation ?? ""} ${placeText(p)}`).includes(w))) : []),
    [everyone, words], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const placeHits = useMemo(
    () => (words.length ? cemeteries.filter((p) => words.every((w) => placeText(p).includes(w))).sort(byPeople) : []),
    [cemeteries, words], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Cementerios por región (las de más personas primero) y, dentro, los de más personas primero.
  const sections = useMemo(() => {
    const byRegion = new Map<string, GuidePlace[]>();
    const pending: GuidePlace[] = [];
    for (const p of cemeteries) {
      if (region === "pending" ? p.point : region ? p.regionCode !== region || !p.point : false) continue;
      if (!p.point || !p.regionCode) pending.push(p);
      else byRegion.set(p.regionCode, [...(byRegion.get(p.regionCode) ?? []), p]);
    }
    const list = [...byRegion.entries()]
      .map(([code, ps]) => ({ code, title: regionName(code), places: ps.sort(byPeople) }))
      .sort((a, b) => sumPeople(b.places) - sumPeople(a.places) || order.indexOf(a.code) - order.indexOf(b.code));
    if (pending.length) list.push({ code: "pending", title: "Por ubicar", places: pending.sort(byPeople) });
    return list;
  }, [cemeteries, region]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentPlace = placeParam ? places.find((p) => p.key === placeParam) ?? null : null;
  const personRow = personParam ? everyone.find((r) => r.b.personId === personParam) ?? null : null;
  const near = everyone.slice(0, 6);
  const shown = showAll ? everyone : near;


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
    if (hero) {
      if (!canEdit) return null;
      return (
        <label className={`${buttonClass("secundario")} cursor-pointer ${busy ? "pointer-events-none opacity-60" : ""} ${over ? "border-terra!" : ""}`} {...dropHandlers(p)}>
          <ImageIcon className="h-6 w-6" /> {busy ? "Subiendo la foto…" : "Agregar una foto del cementerio"}
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
    }
    const empty = (
      <>
        <ImageIcon className="h-9 w-9" />
        {canEdit ? (
          <>
            <span className="text-base font-bold">{busy ? "Subiendo la foto…" : "Foto del cementerio"}</span>
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
        <button type="button" onClick={() => openPlace(p.key)} className={`${box} ${look}`} aria-label={`Abrir ${siteName(p)}`}>
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

  /** La foto grande en su marco de álbum; sin foto, solo el botón para agregarla (si se puede editar). */
  const photoFrame = (p: GuidePlace, caption?: string) => {
    if (!photoOf(p)) return photoSquare(p, true);
    return (
      <div className="foto -rotate-1 p-3 pb-5">
        <span className="esq-a" aria-hidden="true" />
        <span className="esq-b" aria-hidden="true" />
        {photoSquare(p, true)}
        {caption && <p className="mt-3 font-maquina text-[1.125rem] text-gris">{caption}</p>}
      </div>
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

  const chip = (on: boolean) =>
    `inline-flex min-h-12 items-center gap-2 whitespace-nowrap rounded-full border-2 px-5 text-[1.125rem] font-bold transition-colors ${
      on ? "border-burdeos bg-burdeos text-white" : "border-ink/30 bg-white text-ink hover:border-ink"
    }`;
  const pickRegion = (r: string | null) => setRegion(r);

  const yearsOf = (b: Burial) => (b.birth || b.death ? `${b.birth ?? "?"} – ${b.death ?? "?"}` : "Sin fechas");

  // Escape vuelve a la lista cuando se mira una persona o un cementerio.
  useEffect(() => {
    if (!personParam && !placeParam) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !selectedId && !steps && !editingId) back();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [personParam, placeParam, selectedId, steps, editingId]); // eslint-disable-line react-hooks/exhaustive-deps

  const backButton = (label: string) => (
    <button type="button" onClick={back} className={buttonClass("secundario", "print:hidden")}>
      <span aria-hidden>←</span> {label}
    </button>
  );

  /** La tumba: lo que se sabe, y para quien edita, el botón para anotarla. */
  const spotBlock = (b: Burial) => {
    const spot = spotOf(b);
    if (editingId === b.personId) {
      return (
        <div className="space-y-3">
          <label htmlFor={`tumba-${b.personId}`} className="block text-[1.125rem] font-bold">
            ¿Dónde está la tumba de {b.name}?
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
            className="min-h-12 w-full rounded-lg border-2 border-[#8f8a80] bg-white px-3.5 py-2 text-[1.125rem] text-ink placeholder:text-gris/70 focus:border-ink"
          />
          {spotErr && <Notice kind="aviso">{spotErr}</Notice>}
          <div className="flex flex-wrap gap-3">
            <button type="button" disabled={spotBusy} onClick={() => saveSpot(b)} className={buttonClass("principal", "!px-6")}>
              {spotBusy ? "Guardando…" : "Guardar"}
            </button>
            <button type="button" disabled={spotBusy} onClick={() => setEditingId(null)} className={buttonClass("enlace")}>
              Cancelar
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="zb-etiqueta">Tumba</p>
          <p className={`text-[1.25rem] ${spot ? "font-bold" : "text-gris"}`}>
            {spot || (canEdit ? "Todavía no se anota dónde está" : "Aún no sabemos en qué parte del cementerio está. Pregunta a la familia.")}
          </p>
        </div>
        {canEdit && b.eventId && (
          <button type="button" onClick={() => startSpot(b)} className={buttonClass("secundario", "shrink-0")} aria-label={`${spot ? "Cambiar" : "Anotar"} la tumba de ${b.name}`}>
            {spot ? "Cambiar" : "Anotar dónde está"}
          </button>
        )}
      </div>
    );
  };

  /** Tarjeta de una persona en la lista: quién es, dónde descansa y el botón para llegar. */
  const personCard = (b: Burial, p: GuidePlace) => {
    const spot = spotOf(b);
    return (
      <li key={`${p.key}-${b.personId}`} className="flex flex-col rounded-3xl border-2 border-line bg-white transition-colors hover:border-ink">
        <button type="button" onClick={() => openPerson(b.personId)} className="flex w-full items-start gap-4 rounded-t-3xl p-5 text-left" aria-label={`Ver a ${b.name}`}>
          <Initial name={b.name} sex={b.sex} size={56} />
          <span className="min-w-0 flex-1">
            <span className="block font-slab text-[1.5rem] font-bold leading-tight">{b.name}</span>
            {b.relation && <span className="zb-apoyo mt-0.5 block">{capFirst(b.relation)}</span>}
            {p.cremation ? (
              <span className="mt-2 block text-[1.125rem] font-bold text-burdeos">Fue cremado/a</span>
            ) : (
              <span className="mt-2 flex items-start gap-1.5 text-[1.125rem] font-bold text-teja">
                <PinIcon className="mt-1 h-4 w-4 shrink-0" />
                <span>
                  {siteName(p)}
                  {p.locality ? `, ${p.locality}` : ""}
                </span>
              </span>
            )}
            <span className="zb-apoyo mt-1 block">{yearsOf(b)}</span>
            {!p.cremation && (
              <span className="mt-1 block text-[1.125rem]">
                <span className="font-bold">Tumba: </span>
                {spot ? <span className="font-bold">{spot}</span> : <span className="text-gris">aún no sabemos en qué parte</span>}
              </span>
            )}
          </span>
        </button>
        <div className="mt-auto flex flex-wrap items-center gap-3 border-t-2 border-line p-4 print:hidden">
          {canRoute(p) ? (
            <a href={directionsUrl(p)} target="_blank" rel="noreferrer" className={buttonClass("secundario", "min-w-0 flex-1 !px-5")} aria-label={`Cómo llegar a donde descansa ${b.name} (se abre en el mapa)`}>
              Cómo llegar <span aria-hidden>↗</span>
            </a>
          ) : (
            <p className="zb-apoyo min-w-0 flex-1">{p.cremation ? "Fue cremación: no hay tumba que visitar." : NO_ROUTE}</p>
          )}
          <button type="button" onClick={() => openPerson(b.personId)} className={buttonClass("enlace")} aria-label={`Ver más de ${b.name}`}>
            Ver más →
          </button>
        </div>
      </li>
    );
  };

  /** Fila corta (dentro de un cementerio o "también descansan aquí"). */
  const personRowItem = (b: Burial, active = false) => (
    <li key={b.personId}>
      <button
        type="button"
        onClick={() => openPerson(b.personId)}
        aria-current={active ? "true" : undefined}
        className={`flex min-h-16 w-full items-center gap-4 rounded-2xl border-2 bg-white p-3 text-left transition-colors hover:border-ink ${active ? "border-burdeos" : "border-line"}`}
      >
        <Initial name={b.name} sex={b.sex} size={48} />
        <span className="min-w-0 flex-1">
          <span className="block text-[1.25rem] font-bold leading-snug">{b.name}</span>
          <span className="zb-apoyo block">
            {[b.relation ? capFirst(b.relation.split(", ")[0]) : null, yearsOf(b), spotOf(b) ? `Tumba: ${spotOf(b)}` : null].filter(Boolean).join(" · ")}
          </span>
        </span>
        <span aria-hidden className="shrink-0 text-xl">→</span>
      </button>
    </li>
  );

  /** Botones de la foto del cementerio (solo para quien edita). */
  const photoTools = (p: GuidePlace) =>
    canEdit && (
      <div className="mt-3 print:hidden">
        {photoOf(p) && (
          <div className="mt-3 flex flex-wrap gap-3">
            <label className={`${buttonClass("secundario")} cursor-pointer ${photoBusy === p.key ? "pointer-events-none opacity-60" : ""}`}>
              Elegir otra foto
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={photoBusy === p.key}
                onChange={(e) => {
                  uploadPhoto(p, e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
            <button type="button" disabled={photoBusy === p.key} onClick={() => removePhoto(p)} className={buttonClass("enlace")}>
              Quitar foto
            </button>
          </div>
        )}
      </div>
    );

  const whereLine = (p: GuidePlace) => [p.locality ?? "Aún no sabemos la comuna", regionLabel(regionName(p.regionCode))].filter(Boolean).join(" · ");

  /* ---------- Vistas ---------- */

  // Una persona: lo que más importa (dónde está, la tumba, cómo llegar) a la vista, sin paneles encima de paneles.
  const personView = personRow && (
    <div className={`${WRAP} py-8 lg:py-12 print:hidden`}>
      {backButton("Volver")}
      {(() => {
        const { b, p } = personRow;
        const [kin, ...rest] = (b.relation ?? "").split(", ");
        const others = p.people.filter((x) => x.personId !== b.personId);
        return (
          <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
            <div className="space-y-6">
              <article className="rounded-3xl border-2 border-ink bg-white p-6 sm:p-8">
                <p className="zb-etiqueta !text-burdeos">{kin ? capFirst(kin) : "Familia"}</p>
                <h2 className="mt-1 font-slab text-[2.25rem] font-bold leading-[1.1] sm:text-5xl">{b.name}</h2>
                {rest.length > 0 && <p className="zb-texto mt-2 text-gris">{capFirst(rest.join(", "))}</p>}
                <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-line">
                  <div className="bg-adobe-2 px-4 py-3">
                    <dt className="zb-apoyo">Nació</dt>
                    <dd className="text-[1.25rem] font-bold tabular-nums">{b.birth ?? "Sin dato"}</dd>
                  </div>
                  <div className="bg-adobe-2 px-4 py-3">
                    <dt className="zb-apoyo">Murió</dt>
                    <dd className="text-[1.25rem] font-bold tabular-nums">{b.death ?? "Sin dato"}</dd>
                  </div>
                </dl>
                {p.cremation ? (
                  <div className="mt-5 border-t-2 border-line pt-5">
                    <p className="zb-etiqueta">Despedida</p>
                    <p className="mt-1 text-[1.375rem] font-bold text-burdeos">Fue cremado/a</p>
                  </div>
                ) : (
                  <>
                    <div className="mt-5 border-t-2 border-line pt-5">
                      <p className="zb-etiqueta">Descansa en</p>
                      <button type="button" onClick={() => openPlace(p.key)} className="mt-1 flex items-start gap-2 text-left text-[1.375rem] font-bold text-teja underline decoration-2 underline-offset-4">
                        <PinIcon className="mt-1.5 h-5 w-5 shrink-0" />
                        <span>{siteName(p)}</span>
                      </button>
                      <p className="zb-texto mt-1 text-gris">{whereLine(p)}</p>
                    </div>
                    <div className="mt-5 border-t-2 border-line pt-5">{spotBlock(b)}</div>
                  </>
                )}
              </article>

              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                {canRoute(p) ? (
                  <a href={directionsUrl(p)} target="_blank" rel="noreferrer" className={buttonClass("principal", "!min-h-14 flex-1 !px-6 sm:flex-none")}>
                    Cómo llegar al cementerio <span aria-hidden>↗</span>
                  </a>
                ) : !p.cremation ? (
                  <Notice kind="info">{NO_ROUTE}. Si lo sabes, cuéntaselo a la familia.</Notice>
                ) : null}
                <button type="button" onClick={() => setSelectedId(b.personId)} className={buttonClass("secundario", "!min-h-14 flex-1 sm:flex-none")}>
                  Ver su ficha completa
                </button>
                {rootId && b.personId !== rootId && (
                  <button type="button" onClick={() => openPath(p, b)} className={buttonClass("secundario", "!min-h-14 flex-1 sm:flex-none")}>
                    ¿Cómo es mi parentesco?
                  </button>
                )}
              </div>
              {noPath && <Notice kind="aviso">No encuentro un parentesco entre tú y {noPath} en el árbol.</Notice>}
            </div>

            <aside className="space-y-6">
              <div>
                {!p.cremation && photoFrame(p, siteName(p))}
                {!p.cremation && photoTools(p)}
                {photoErr && (
                  <div className="mt-3">
                    <Notice kind="aviso">{photoErr}</Notice>
                  </div>
                )}
              </div>
              {others.length > 0 && (
                <section aria-label="También descansan aquí">
                  <h3 className="al-titulo al-regla !text-[1.5rem]">También descansan aquí</h3>
                  <ul className="mt-4 space-y-3">{others.map((x) => personRowItem(x))}</ul>
                </section>
              )}
            </aside>
          </div>
        );
      })()}
    </div>
  );

  // Un cementerio: la foto, cómo llegar y quiénes descansan ahí.
  const placeView = currentPlace && (
    <div className={`${WRAP} py-8 lg:py-12 print:hidden`}>
      {backButton("Volver")}
      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-start">
        {/* Primero lo que se necesita: el nombre, dónde queda y cómo llegar. */}
        <div className="lg:col-start-2 lg:row-start-1">
          <p className="zb-texto text-gris">{whereLine(currentPlace)}</p>
          <h2 className="mt-1 font-slab text-[2.25rem] font-bold leading-[1.1] sm:text-5xl">{siteName(currentPlace)}</h2>
          <p className="zb-texto mt-3">
            <strong>{plural(currentPlace.people.length, "persona", "personas")}</strong> de la familia {currentPlace.people.length === 1 ? "descansa" : "descansan"} aquí
          </p>
          {currentPlace.incomplete && (
            <div className="mt-4">
              <Notice kind="info">Este lugar no está confirmado. Si sabes cuál es, cuéntaselo a la familia.</Notice>
            </div>
          )}
          {canRoute(currentPlace) ? (
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <a href={directionsUrl(currentPlace)} target="_blank" rel="noreferrer" className={buttonClass("principal", "!min-h-14 flex-1 !px-6 sm:flex-none")}>
                Cómo llegar <span aria-hidden>↗</span>
              </a>
              <a href={mapsUrl(currentPlace)} target="_blank" rel="noreferrer" className={buttonClass("secundario", "!min-h-14 flex-1 sm:flex-none")}>
                Ver en el mapa
              </a>
              <button type="button" onClick={() => copyAddress(currentPlace)} className={buttonClass("secundario", "!min-h-14 flex-1 sm:flex-none")} aria-live="polite">
                {copied ? "Dirección copiada ✓" : "Copiar dirección"}
              </button>
            </div>
          ) : (
            <p className="zb-texto mt-5 text-gris">{NO_ROUTE}.</p>
          )}
        </div>

        {/* La foto (o, sin foto, solo un botón discreto para agregarla): después de lo importante. */}
        <div className="lg:col-start-1 lg:row-span-2 lg:row-start-1">
          {photoFrame(currentPlace, siteName(currentPlace))}
          {photoTools(currentPlace)}
          {photoErr && (
            <div className="mt-3">
              <Notice kind="aviso">{photoErr}</Notice>
            </div>
          )}
        </div>

        <div className="lg:col-start-2 lg:row-start-2">
          <h3 className="al-titulo al-regla !text-[1.5rem]">Aquí descansan</h3>
          <ul className="mt-4 space-y-3">{currentPlace.people.map((b) => personRowItem(b))}</ul>
        </div>
      </div>
    </div>
  );

  // La entrada: un buscador grande y, debajo, los más cercanos y los cementerios.
  const searching = words.length > 0;
  const listView = (
    <>
      <header className="on-dark relative bg-burdeos text-white print:hidden">
        <div className={`${WRAP} pb-10 pt-8 lg:pb-12 lg:pt-12`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <h1 className="font-slab text-[2.5rem] font-bold leading-[1.05] sm:text-6xl">Dónde descansan</h1>
            <button type="button" onClick={() => window.print()} className="inline-flex min-h-12 items-center rounded-full border-2 border-white/60 px-5 text-[1.125rem] font-bold text-white hover:border-white hover:bg-white/10">
              Imprimir lista
            </button>
          </div>
          <p className="mt-4 max-w-3xl text-[1.1875rem] leading-relaxed text-white/90 sm:text-[1.375rem]">
            {plural(total, "persona", "personas")} de la familia en {plural(cemeteries.length, "cementerio", "cementerios")}. Busca a quien quieras y te decimos dónde descansa y cómo llegar.
          </p>
          <div className="mt-6 max-w-3xl">
            <label htmlFor="cem-q" className="block text-[1.25rem] font-bold">
              ¿A quién buscas?
            </label>
            <div className="relative mt-2">
              <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-4 top-1/2 h-6 w-6 -translate-y-1/2 text-gris" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                id="cem-q"
                type="search"
                enterKeyHint="search"
                autoComplete="off"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Un nombre, un apellido o un cementerio"
                className="min-h-14 w-full rounded-2xl border-2 border-transparent bg-white py-2 pl-14 pr-14 text-[1.25rem] text-ink outline-none placeholder:text-gris/70 focus:border-trigo [&::-webkit-search-cancel-button]:hidden"
              />
              {q && (
                <button type="button" onClick={() => setQ("")} aria-label="Borrar lo escrito" className="absolute right-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full text-2xl text-gris hover:bg-adobe-2">
                  ×
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="alero-tejas pointer-events-none absolute inset-x-0 top-full z-10 [--tj:var(--color-burdeos)]" aria-hidden="true" />
      </header>

      <div className={`${WRAP} space-y-14 py-10 lg:py-14 print:hidden`}>
        {photoErr && <Notice kind="aviso">{photoErr}</Notice>}

        {searching ? (
          <section aria-label="Resultados">
            <h2 className="al-titulo al-regla" aria-live="polite">
              {hits.length || placeHits.length ? `${plural(hits.length, "persona", "personas")} para «${q.trim()}»` : "No encontramos a nadie"}
            </h2>
            {hits.length === 0 && placeHits.length === 0 ? (
              <div className="mt-6 max-w-xl rounded-3xl border-2 border-dashed border-ink/40 bg-white p-6">
                <p className="zb-texto">No hay nadie con «{q.trim()}». Prueba con solo el apellido o con menos letras.</p>
                <button type="button" onClick={() => setQ("")} className={buttonClass("secundario", "mt-4")}>
                  Ver a todos
                </button>
              </div>
            ) : (
              <>
                {hits.length > 0 && <ul className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{hits.map(({ b, p }) => personCard(b, p))}</ul>}
                {placeHits.length > 0 && (
                  <div className="mt-10">
                    <h3 className="al-titulo !text-[1.5rem]">Cementerios que coinciden</h3>
                    <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {placeHits.map((p) => (
                        <li key={p.key}>
                          <button type="button" onClick={() => openPlace(p.key)} className="flex min-h-16 w-full items-center gap-3 rounded-2xl border-2 border-line bg-white p-4 text-left hover:border-ink">
                            <PinIcon className="h-5 w-5 shrink-0 text-teja" />
                            <span className="min-w-0 flex-1">
                              <span className="block text-[1.25rem] font-bold leading-snug">{siteName(p)}</span>
                              <span className="zb-apoyo block">
                                {p.locality ?? "Aún no sabemos la comuna"} · {plural(p.people.length, "persona", "personas")}
                              </span>
                            </span>
                            <span aria-hidden>→</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </section>
        ) : (
          <>
            <section aria-label={rootId ? "Los más cercanos a ti" : "Personas"}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h2 className="al-titulo al-regla">{rootId ? "Los más cercanos a ti" : "Personas"}</h2>
              </div>
              <ul className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{shown.map(({ b, p }) => personCard(b, p))}</ul>
              {everyone.length > near.length && (
                <button type="button" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll} className={buttonClass("secundario", "mt-6")}>
                  {showAll ? "Ver menos" : `Ver a las ${everyone.length} personas`}
                </button>
              )}
            </section>

            <section aria-label="Cementerios">
              <h2 className="al-titulo al-regla">Los cementerios</h2>
              <div className="mt-5 flex flex-wrap gap-3" role="group" aria-label="Región">
                <button type="button" className={chip(region === null)} aria-pressed={region === null} onClick={() => pickRegion(null)}>
                  Todas <span className="font-normal">({cemeteries.length})</span>
                </button>
                {regionCounts.map(([code, n]) => (
                  <button key={code} type="button" className={chip(region === code)} aria-pressed={region === code} onClick={() => pickRegion(region === code ? null : code)}>
                    {shortRegion(regionName(code))} <span className="font-normal">({n})</span>
                  </button>
                ))}
                {pendingCount > 0 && (
                  <button type="button" className={chip(region === "pending")} aria-pressed={region === "pending"} onClick={() => pickRegion(region === "pending" ? null : "pending")}>
                    Por ubicar <span className="font-normal">({pendingCount})</span>
                  </button>
                )}
              </div>
              <div className="mt-8 space-y-12">
                {sections.map((s) => (
                  <div key={s.code} aria-label={s.title}>
                    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b-2 border-ink/20 pb-2">
                      <h3 className="text-[1.5rem] font-bold leading-tight">{s.code === "pending" ? s.title : regionLabel(s.title)}</h3>
                      <p className="zb-texto text-gris">{plural(sumPeople(s.places), "persona", "personas")}</p>
                    </div>
                    <ul className="mt-6 grid gap-x-7 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {s.places.map((p) => (
                        <li key={p.key} className="flex flex-col">
                          <div className="relative">
                            {photoSquare(p, false)}
                            {p.incomplete && <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-white px-3.5 py-1.5 text-base font-bold shadow">Por confirmar</span>}
                          </div>
                          <button type="button" onClick={() => openPlace(p.key)} className="mt-4 flex min-h-12 items-start justify-between gap-3 text-left">
                            <span className="min-w-0">
                              <span className="block font-slab text-[1.375rem] font-bold leading-tight">{siteName(p)}</span>
                              <span className="zb-apoyo mt-0.5 block">
                                {p.locality ?? "Aún no sabemos la comuna"} · {plural(p.people.length, "persona", "personas")}
                              </span>
                            </span>
                            <span aria-hidden className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-teja text-xl text-white">→</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </>
  );

  return (
    <div id="cem-inicio">
      {personParam && personRow ? personView : placeParam && currentPlace ? placeView : listView}

      {/* Al imprimir: todos los cementerios con su gente, en una lista seguida. */}
      <div className={`${WRAP} hidden print:block`}>
        {sections.map((s) => (
          <section key={s.code} className="mb-6">
            <h2 className="mb-2 border-b border-[#ccc] pb-1 text-lg font-semibold">{s.title}</h2>
            {s.places.map((p) => (
              <div key={p.key} className="mb-3 break-inside-avoid">
                <h3 className="text-base font-semibold">
                  {siteName(p)} <span className="text-sm font-normal">· {p.locality ?? "aún no sabemos la comuna"} · {plural(p.people.length, "persona", "personas")}</span>
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
        {places.some((p) => p.cremation) && (
          <section className="mb-6">
            <h2 className="mb-2 border-b border-[#ccc] pb-1 text-lg font-semibold">Cremados</h2>
            <ul className="ml-4 list-disc text-sm">
              {places.filter((p) => p.cremation).flatMap((p) => p.people).map((b) => (
                <li key={b.personId}>
                  {b.name}
                  {b.relation ? `, ${b.relation}` : ""} ({b.birth ?? "?"} – {b.death ?? "?"})
                </li>
              ))}
            </ul>
          </section>
        )}
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
