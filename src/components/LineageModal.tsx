"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { LineageStep as Step } from "@/lib/lineage";

const STEP_MS = 1100;

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
}

/**
 * Ventana con una animación: parte de la persona del mapa y sube, generación por generación,
 * hasta el antepasado elegido. Al llegar ofrece ver su mapa o abrirlo en el árbol.
 */
export default function LineageModal({
  steps,
  onClose,
}: {
  /** El camino, de la persona de partida (primero) a la de llegada (último). */
  steps: Step[];
  onClose: () => void;
}) {
  const rootName = steps[0]?.name ?? "";
  const target = steps[steps.length - 1];
  const [shown, setShown] = useState(1);
  const [run, setRun] = useState(0);
  const closeRef = useRef<HTMLButtonElement>(null);
  const lastRef = useRef<HTMLLIElement>(null);
  const done = shown >= steps.length;

  // Avanza un escalón cada tanto; con "reducir movimiento" se muestra todo de una vez.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(steps.length);
      return;
    }
    setShown(1);
    const t = setInterval(() => {
      setShown((n) => {
        if (n + 1 >= steps.length) clearInterval(t);
        return Math.min(n + 1, steps.length);
      });
    }, STEP_MS);
    return () => clearInterval(t);
  }, [steps, run]);

  useEffect(() => {
    lastRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [shown]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 text-[#1f1d1a] [color-scheme:light] sm:items-center sm:p-6"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <style>{`
        @keyframes lin-in { from { opacity: 0; transform: translateY(18px) scale(.97); } to { opacity: 1; transform: none; } }
        @keyframes lin-line { from { transform: scaleY(0); } to { transform: scaleY(1); } }
        @keyframes lin-pop { 0% { transform: scale(.6); } 60% { transform: scale(1.15); } 100% { transform: scale(1); } }
        @media (prefers-reduced-motion: reduce) { .lin-a { animation: none !important; } }
      `}</style>
      <div role="dialog" aria-modal="true" aria-label={`El camino hasta ${target.name}`} className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-[#fffdf8] shadow-2xl sm:rounded-3xl">
        <div className="flex items-start gap-3 border-b border-[#ece7da] px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#6b6558]">El camino en el árbol</p>
            <h2 className="text-lg font-semibold leading-snug" style={{ fontFamily: "var(--font-playfair)" }}>
              De {rootName.split(" ")[0]} hasta {target.name}
            </h2>
          </div>
          <button ref={closeRef} onClick={onClose} aria-label="Cerrar" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xl text-[#6b6558] hover:bg-[#f1ede2]">
            ×
          </button>
        </div>

        {/* La persona queda abajo y los antepasados van apareciendo hacia arriba. */}
        <ol className="flex flex-1 flex-col-reverse gap-0 overflow-y-auto px-5 py-5" style={{ minHeight: `min(${steps.length * 100 + 40}px, 62vh)` }}>
          {steps.slice(0, shown).map((s, i) => {
            const last = i === shown - 1;
            const isTarget = i === steps.length - 1;
            const isRoot = i === 0;
            return (
              <li key={s.id} ref={last ? lastRef : undefined} className="flex flex-col-reverse">
                {i > 0 && (
                  <div className="ml-[1.35rem] h-7 w-[3px] origin-bottom rounded bg-[#c8623a] lin-a" style={{ animation: "lin-line .45s ease-out both" }} aria-hidden />
                )}
                <div className="flex items-center gap-3 lin-a" style={{ animation: i > 0 ? "lin-in .5s ease-out both" : undefined }}>
                  <span
                    className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-semibold lin-a ${
                      isTarget && done ? "bg-[#c8623a] text-white ring-4 ring-[#c8623a]/25" : isRoot ? "bg-[#1a1917] text-[#f5f2ea]" : "bg-[#f0d9c8] text-[#7a3e1d]"
                    }`}
                    style={isTarget && done ? { animation: "lin-pop .5s ease-out both" } : undefined}
                  >
                    {initials(s.name)}
                  </span>
                  <div className={`min-w-0 flex-1 rounded-xl border px-3 py-2 ${isTarget && done ? "border-[#c8623a] bg-[#fdf1e8]" : "border-[#ece7da] bg-white"}`}>
                    <p className="text-sm font-semibold leading-snug">{s.name}</p>
                    <p className="text-xs text-[#6b6558]">{s.relation}</p>
                    {s.place && (
                      <p className="mt-0.5 text-xs text-[#4f4a3f]">
                        {s.place}
                        {s.estimated && <span className="text-[#9a5a1c]"> (estimado)</span>}
                      </p>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>

        <div className="border-t border-[#ece7da] bg-[#faf7f0] px-5 py-3">
          {done ? (
            <div className="flex flex-wrap items-center gap-2 lin-a" style={{ animation: "lin-in .4s ease-out both" }}>
              <Link href={`/mapa?persona=${target.id}`} className="rounded-full bg-[#1a1917] px-4 py-2 text-sm font-semibold text-[#f5f2ea] hover:bg-black">
                Ver su mapa
              </Link>
              <Link href={`/?persona=${target.id}`} className="rounded-full border border-[#d9d2c1] bg-white px-4 py-2 text-sm hover:bg-[#f1ede2]">
                Ver en el árbol
              </Link>
              <button onClick={() => setRun((r) => r + 1)} className="ml-auto rounded-full px-3 py-2 text-sm text-[#6b6558] hover:bg-[#f1ede2]">
                ↻ Repetir
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between text-sm text-[#6b6558]">
              <span>Generación {shown - 1} de {steps.length - 1}…</span>
              <button onClick={() => setShown(steps.length)} className="rounded-full px-3 py-1.5 hover:bg-[#f1ede2]">
                Saltar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
