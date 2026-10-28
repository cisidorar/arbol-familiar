"use client";

import { useMemo, useRef, useState } from "react";
import { lineToViewer } from "@/lib/tree-nav";
import { canEdit } from "@/lib/auth/roles";
import AppHeader from "./AppHeader";
import type { CurrentUser } from "./UserMenu";
import AddRelative, { type AddTarget } from "./AddRelative";
import FamilyTree, { type TreeControls } from "./FamilyTree";
import PersonPanel from "./PersonPanel";

// Botones de zoom: tinta sobre adobe, con el anillo de foco hacia adentro (el grupo recorta lo que sobresale).
const ZOOM_BUTTON =
  "grid h-12 w-12 place-items-center text-ink hover:bg-adobe-2 focus-visible:outline-3 focus-visible:-outline-offset-4 focus-visible:outline-ink";
const ZOOM_ICON = {
  viewBox: "0 0 24 24",
  className: "h-6 w-6",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export default function TreeApp({ data, user, homeId, selfId }: { data: any[]; user: CurrentUser; homeId?: string | null; selfId?: string | null }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Sube cada vez que se edita una persona: le avisa al árbol que redibuje sus tarjetas.
  const [version, setVersion] = useState(0);

  // Al guardar una edición, la tarjeta de esa persona se actualiza en el
  // mismo objeto que ya tiene el árbol (sin recargar la página ni perder las
  // ramas abiertas).
  const personChanged = (id: string, card: Record<string, unknown>) => {
    const datum = data.find((d) => d.id === id);
    if (!datum) return;
    Object.assign(datum.data, card);
    setVersion((v) => v + 1);
  };

  // El "+" de una tarjeta: a quién se le está agregando un familiar.
  const [adding, setAdding] = useState<AddTarget | null>(null);
  // En el teléfono la leyenda va plegada (un botón "?") para no tapar el árbol.
  const [legendOpen, setLegendOpen] = useState(false);
  const controls = useRef<TreeControls | null>(null);

  // Se agregó a alguien: llegan los datos del árbol al día. Se suman a los
  // mismos objetos que ya tiene el árbol (la persona nueva y los vínculos de
  // sus familiares), así no se recarga ni se pierden las ramas abiertas.
  const relativeAdded = (id: string, fresh: any[]) => {
    const known = new Map(data.map((d) => [d.id, d]));
    for (const datum of fresh) {
      const current = known.get(datum.id);
      if (current) current.rels = datum.rels;
      else data.push(datum);
    }
    setAdding(null);
    setVersion((v) => v + 1);
    setSelectedId(id);
  };

  // Llegaron datos del árbol al día sin cambiar de pantalla (se agregó a alguien desde un hecho de la ficha).
  const treeData = (fresh: any[]) => {
    const known = new Map(data.map((d) => [d.id, d]));
    for (const datum of fresh) {
      const current = known.get(datum.id);
      if (current) current.rels = datum.rels;
      else data.push(datum);
    }
    setVersion((v) => v + 1);
  };

  // Se eliminó a alguien: se quita del mismo arreglo que usa el árbol y se
  // actualizan los vínculos de sus familiares. Si era el tronco, el árbol se
  // centra en un familiar suyo (o en quien quede).
  const personDeleted = (id: string, fresh: any[]) => {
    const gone = data.find((d) => d.id === id);
    const neighbours: string[] = gone ? [...(gone.rels.parents ?? []), ...(gone.rels.spouses ?? []), ...(gone.rels.children ?? [])] : [];
    const freshById = new Map(fresh.map((d) => [d.id, d]));
    for (let i = data.length - 1; i >= 0; i--) {
      const current = data[i];
      const next = freshById.get(current.id);
      if (!next) data.splice(i, 1);
      else current.rels = next.rels;
    }
    setSelectedId(null);
    setTrail((t) => t.filter((x) => x !== id));
    setMainId((m) => (m === id ? neighbours.find((n) => freshById.has(n)) ?? data[0]?.id ?? null : m));
    setVersion((v) => v + 1);
  };

  // Sube cada vez que se toca el título: el árbol vuelve a su vista de partida.
  const [resetKey] = useState(0);
  const [mainId, setMainId] = useState<string | null>(
    (homeId && data.some((d) => d.id === homeId) ? homeId : null) ?? data[0]?.id ?? null,
  );
  // Troncos anteriores, para poder deshacer un cambio de centro del árbol.
  const [trail, setTrail] = useState<string[]>([]);

  const recenter = (id: string) => {
    if (id === mainId) return;
    if (mainId) setTrail((t) => [...t, mainId].slice(-30));
    setMainId(id);
  };

  // Si el centro es un antepasado lejano de quien mira, se comprime el árbol a
  // la línea que baja hasta esa persona.
  const viewerId = [selfId, homeId].find((id) => id && data.some((d) => d.id === id)) ?? null;
  const line = useMemo(() => {
    if (!mainId || !viewerId) return null;
    return lineToViewer(new Map(data.map((d) => [d.id as string, d.rels])), mainId, viewerId);
    // `version` cambia cuando se agregan o quitan personas (los datos se mutan en el lugar).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, mainId, viewerId, version]);

  const previousId = trail[trail.length - 1] ?? null;
  const previous = previousId ? data.find((d) => d.id === previousId) : null;
  const goBack = () => {
    if (!previousId) return;
    setTrail((t) => t.slice(0, -1));
    setMainId(previousId);
  };

  return (
    // text-ink: sin esto los botones heredan el texto claro del modo oscuro del sistema y, sobre el adobe, no se ven.
    <div className="h-screen w-screen overflow-hidden album text-ink">
      <AppHeader
        current="arbol"
        user={user}
        count={data.length}
        floating
        onSelectPerson={(id) => {
          // Buscar a alguien es partir de nuevo: no deja un "Volver a…" atrás.
          setSelectedId(id);
          setTrail([]);
          setMainId(id);
        }}
      />

      <main aria-label="Árbol genealógico" className="h-full w-full">
        <FamilyTree
          data={data}
          mainId={mainId}
          line={line}
          version={version}
          resetKey={resetKey}
          controlsRef={controls}
          onSelectPerson={(id) => setSelectedId(id)}
          onRecenter={recenter}
          onAddRelative={
            canEdit(user.role)
              ? (id, rect) => setAdding({ personId: id, rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom } })
              : undefined
          }
        />
      </main>

      {previous && (
        <button
          onClick={goBack}
          className="absolute left-4 top-[132px] z-10 flex min-h-12 sm:top-[104px] max-w-[calc(100%-2rem)] items-center gap-2 rounded-full border-2 border-ink bg-adobe px-5 text-[1.125rem] font-bold text-ink hover:bg-adobe-2"
        >
          <span aria-hidden="true">←</span>
          <span className="truncate">Volver a {previous.data.label}</span>
        </button>
      )}

      {/* Acercar, alejar y ver todo: para quien no puede pellizcar la pantalla. */}
      <div className="absolute right-4 top-[132px] z-10 flex flex-col sm:top-[104px] overflow-hidden rounded-2xl border-2 border-ink bg-adobe" role="group" aria-label="Zoom del árbol">
        <button type="button" onClick={() => controls.current?.zoomBy(1.3)} aria-label="Acercar el árbol" className={ZOOM_BUTTON}>
          <svg {...ZOOM_ICON}>
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
        <button type="button" onClick={() => controls.current?.zoomBy(1 / 1.3)} aria-label="Alejar el árbol" className={`${ZOOM_BUTTON} border-t-2 border-ink`}>
          <svg {...ZOOM_ICON}>
            <path d="M5 12h14" />
          </svg>
        </button>
        <button type="button" onClick={() => controls.current?.fit()} aria-label="Ver todo el árbol" className={`${ZOOM_BUTTON} border-t-2 border-ink`}>
          <svg {...ZOOM_ICON}>
            <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
          </svg>
        </button>
      </div>

      {/* Volver a la persona de quien mira: si el árbol está centrado en otro, lo recentra; si no, la trae a la vista. */}
      {viewerId && (
        <button
          type="button"
          onClick={() => (viewerId === mainId ? controls.current?.centerOnMain() : recenter(viewerId))}
          className="absolute right-4 top-[290px] z-10 flex min-h-12 items-center rounded-full border-2 border-ink bg-adobe px-5 text-[1.125rem] font-bold text-ink hover:bg-adobe-2 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ink sm:top-[262px]"
        >
          Volver a mí
        </button>
      )}

      {/* Ayuda: qué significan los colores y qué hace cada toque. */}
      <button
        type="button"
        onClick={() => setLegendOpen((o) => !o)}
        aria-expanded={legendOpen}
        aria-label={legendOpen ? "Ocultar la ayuda" : "Mostrar la ayuda del árbol"}
        className="absolute bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-4 z-10 flex min-h-12 items-center gap-2 rounded-full border-2 border-ink bg-adobe px-5 text-[1.125rem] font-bold text-ink sm:hidden"
      >
        {legendOpen ? "× Cerrar" : "? Ayuda"}
      </button>
      <div
        className={`pointer-events-none absolute bottom-[calc(10rem+env(safe-area-inset-bottom))] left-4 z-10 max-w-[calc(100%-2rem)] flex-col gap-2 rounded-2xl border-2 border-ink bg-adobe px-4 py-3 text-base text-ink sm:bottom-4 sm:flex ${legendOpen ? "flex" : "hidden"}`}
      >
        <div className="font-slab text-[1.125rem] font-bold">Cómo leer el árbol</div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="flex items-center gap-1.5">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="#3f7fcb" aria-hidden="true">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c0-4.4 3.6-6.6 8-6.6s8 2.2 8 6.6z" />
            </svg>
            Hombre
          </span>
          <span className="flex items-center gap-1.5">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="#c44f72" aria-hidden="true">
              <circle cx="12" cy="8" r="4" />
              <path d="M7.4 8h9.2v7.4c0 .6-.4 1-1 1H8.4c-.6 0-1-.4-1-1z" />
              <path d="M4 21c0-4.4 3.6-6.6 8-6.6s8 2.2 8 6.6z" />
            </svg>
            Mujer
          </span>
        </div>
        <div>Toca una tarjeta para abrir su ficha.</div>
        <div>«Centro» marca de quién parte el árbol.</div>
        <div className="flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border-2 border-gris" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 15l6-6 6 6" />
            </svg>
          </span>
          Las flechas abren padres, hijos, hermanos o pareja.
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex gap-0.5" aria-hidden="true">
            <span className="h-2 w-3 rounded-sm bg-gris" />
            <span className="h-2 w-3 rounded-sm bg-gris" />
          </span>
          Centra el árbol en esa persona.
        </div>
      </div>

      {adding && (
        <AddRelative
          key={adding.personId}
          target={adding}
          data={data}
          onClose={() => setAdding(null)}
          onAdded={relativeAdded}
        />
      )}

      <PersonPanel
        personId={selectedId}
        mainId={mainId}
        homeId={homeId}
        data={data}
        onClose={() => setSelectedId(null)}
        onPersonChanged={personChanged}
        onPersonDeleted={personDeleted}
        onTreeData={treeData}
        onNavigate={(id) => {
          setSelectedId(id);
          recenter(id);
        }}
      />
    </div>
  );
}
