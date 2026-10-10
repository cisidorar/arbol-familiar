"use client";

import { useState } from "react";
import { canEdit } from "@/lib/auth/roles";
import AppHeader from "./AppHeader";
import type { CurrentUser } from "./UserMenu";
import AddRelative, { type AddTarget } from "./AddRelative";
import FamilyTree from "./FamilyTree";
import PersonPanel from "./PersonPanel";

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

  const previousId = trail[trail.length - 1] ?? null;
  const previous = previousId ? data.find((d) => d.id === previousId) : null;
  const goBack = () => {
    if (!previousId) return;
    setTrail((t) => t.slice(0, -1));
    setMainId(previousId);
  };

  // El título del archivo vuelve al perfil propio (si no hay, al de partida), con su papá y su mamá.
  const goHome = () => {
    const mine = [selfId, homeId].find((id) => id && data.some((d) => d.id === id)) ?? data[0]?.id;
    if (!mine) return;
    setSelectedId(null);
    recenter(mine);
    window.history.replaceState(null, "", "/");
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-white">
      <AppHeader
        current="arbol"
        user={user}
        count={data.length}
        floating
        onHome={goHome}
        onSelectPerson={(id) => {
          setSelectedId(id);
          recenter(id);
        }}
      />

      <div className="h-full w-full">
        <FamilyTree
          data={data}
          mainId={mainId}
          version={version}
          onSelectPerson={(id) => setSelectedId(id)}
          onRecenter={recenter}
          onAddRelative={
            canEdit(user.role)
              ? (id, rect) => setAdding({ personId: id, rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom } })
              : undefined
          }
        />
      </div>

      {previous && (
        <button
          onClick={goBack}
          className="absolute left-4 top-[84px] z-10 flex max-w-[calc(100%-2rem)] items-center gap-1.5 rounded-full border border-gray-200 bg-white/95 px-3.5 py-1.5 text-sm text-gray-700 shadow-sm backdrop-blur-sm hover:border-gray-300 hover:bg-white"
        >
          <span aria-hidden="true">←</span>
          <span className="truncate">Volver a {previous.data.label}</span>
        </button>
      )}

      {/* Leyenda discreta: qué significan los colores y qué hace cada clic. */}
      <div className="pointer-events-none absolute bottom-4 left-4 z-10 flex flex-col gap-1.5 rounded-xl border border-gray-200/80 bg-white/90 px-3.5 py-2.5 text-xs text-gray-500 shadow-sm backdrop-blur-sm">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#3f7fcb" }} />
          Hombre
          <span className="ml-2 h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#c44f72" }} />
          Mujer
        </div>
        <div>Clic en una tarjeta: abre su ficha</div>
        <div className="flex items-center gap-1.5">
          <span
            className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-gray-400 text-[9px] leading-none text-gray-600"
            aria-hidden="true"
          >
            ▲
          </span>
          Las flechas despliegan padres, hijos, hermanos o pareja
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-flex gap-0.5" aria-hidden="true">
            <span className="h-1.5 w-2.5 rounded-sm bg-gray-400" />
            <span className="h-1.5 w-2.5 rounded-sm bg-gray-400" />
          </span>
          centra el árbol en esa persona
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
