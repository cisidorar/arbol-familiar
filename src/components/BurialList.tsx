"use client";

import Link from "next/link";
import { useState } from "react";
import LineageModal from "./LineageModal";
import { kinshipPath, type GraphPerson, type LineageStep } from "@/lib/lineage";
import type { Burial } from "@/lib/cemeteries";

/** Las personas sepultadas en un cementerio, cada una con "Ver camino" desde la persona del usuario. */
export default function BurialList({
  people,
  graph,
  rootId,
  cemetery,
}: {
  people: Burial[];
  /** El árbol (padres, hijos y parejas) para encontrar el parentesco; vacío si el usuario no está vinculado. */
  graph: GraphPerson[];
  rootId: string | null;
  cemetery: string;
}) {
  const [steps, setSteps] = useState<LineageStep[] | null>(null);
  const [none, setNone] = useState<string | null>(null);

  const open = (p: Burial) => {
    if (!rootId) return;
    const spot = p.spot ? ` (${p.spot})` : "";
    const path = kinshipPath(rootId, p.personId, graph, (id) => (id === p.personId ? `Sepultado/a en ${cemetery}${spot}` : null));
    if (!path || path.length < 2) {
      setNone(p.name);
      return;
    }
    setNone(null);
    setSteps(path);
  };

  return (
    <>
      {none && (
        <p className="mt-3 rounded-lg bg-[#fdf1e8] px-3 py-2 text-xs text-[#7a3e1d]">
          No encuentro un parentesco entre tú y {none} en el árbol.
        </p>
      )}
      <ul className="mt-3 divide-y divide-[#f1ede2]">
        {people.map((p) => (
          <li key={p.personId} className="flex items-start gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium leading-snug">{p.name}</p>
              <p className="text-xs text-[#6b6558]">
                {p.birth || p.death ? `${p.birth ?? "?"} – ${p.death ?? "?"}` : "Sin fechas"}
                {p.buried && <> · sepultado/a {p.buried}</>}
                {p.spot && <> · {p.spot}</>}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
              {rootId && p.personId !== rootId && (
                <button
                  type="button"
                  onClick={() => open(p)}
                  className="rounded-full border border-[#d9d2c1] bg-white px-3 py-1.5 text-xs font-medium hover:bg-[#f1ede2]"
                >
                  Ver camino
                </button>
              )}
              <Link href={`/?persona=${p.personId}`} className="rounded-full border border-[#d9d2c1] bg-white px-3 py-1.5 text-xs font-medium hover:bg-[#f1ede2]">
                Ver en el árbol
              </Link>
            </div>
          </li>
        ))}
      </ul>
      {steps && <LineageModal steps={steps} onClose={() => setSteps(null)} />}
    </>
  );
}
