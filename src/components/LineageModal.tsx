"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { LineageStep as Step } from "@/lib/lineage";
import { buttonClass } from "./ui";

const AUTO_MS = 1100;

const sexColor = (sex?: string | null) => (sex === "F" ? "#b03a62" : sex === "M" ? "#2f66b8" : "#4a4740");

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Madre", "Abuela"… la etiqueta corta de la persona en el camino. */
function badgeOf(s: Step) {
  if (s.badge) return s.badge;
  const head = s.relation.split(" · ")[0].split(" de ")[0];
  return cap(head);
}

/** Texto del conector: "su madre", "su hijo"… */
function edgeOf(s: Step) {
  const f = s.sex === "F";
  if (s.via === "parent") return f ? "su madre" : "su padre";
  if (s.via === "child") return f ? "su hija" : "su hijo";
  if (s.via === "spouse") return "su pareja";
  return "";
}

/**
 * "Ver camino": las personas van apareciendo una a una, de la persona de partida hasta el
 * antepasado elegido. Se avanza solo (se puede pausar) o con Siguiente / Atrás.
 */
export default function LineageModal({
  steps,
  onClose,
}: {
  /** El camino, de la persona de partida (primero) a la de llegada (último). */
  steps: Step[];
  onClose: () => void;
}) {
  const root = steps[0];
  const target = steps[steps.length - 1];
  const total = steps.length;
  const [shown, setShown] = useState(1);
  const [playing, setPlaying] = useState(true);
  const closeRef = useRef<HTMLButtonElement>(null);
  const curRef = useRef<HTMLDivElement>(null);
  const done = shown >= total;
  const cur = steps[shown - 1];
  const firstName = (n: string) => n.split(" ")[0];

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(total);
      setPlaying(false);
    }
  }, [total]);

  // Avance automático (pausa al tocar Siguiente/Atrás o «Pausar»).
  useEffect(() => {
    if (!playing || done) return;
    const t = setTimeout(() => setShown((n) => Math.min(n + 1, total)), AUTO_MS);
    return () => clearTimeout(t);
  }, [playing, shown, done, total]);

  useEffect(() => {
    curRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [shown]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") { setPlaying(false); setShown((n) => Math.min(n + 1, total)); }
      if (e.key === "ArrowLeft") { setPlaying(false); setShown((n) => Math.max(n - 1, 1)); }
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, total]);

    const back = () => { setPlaying(false); setShown((n) => Math.max(n - 1, 1)); };
  const replay = () => { setShown(1); setPlaying(true); };

  const headline = done
    ? `¡Llegamos a ${cur.name.split(" ").slice(0, 2).join(" ")}!`
    : shown === 1
      ? `Empezamos contigo, ${root.name.split(" ").slice(0, 2).join(" ")}.`
      : `Subimos hasta ${cur.name.split(" ").slice(0, 2).join(" ")}.`;

  return (
    <div
      className="zb fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 text-ink [color-scheme:light] sm:items-center sm:p-6"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <style>{`
        @keyframes lin-in { from { opacity: 0; transform: translateY(22px) scale(.96); } to { opacity: 1; transform: none; } }
        @keyframes lin-line { from { transform: scaleY(0); } to { transform: scaleY(1); } }
        @keyframes lin-pop { 0% { transform: scale(.4); opacity: 0; } 60% { transform: scale(1.18); opacity: 1; } 100% { transform: scale(1); } }
        @keyframes lin-glow { 0%,100% { box-shadow: 0 0 0 0 var(--lc); } 50% { box-shadow: 0 0 0 10px transparent; } }
        @keyframes lin-fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        @keyframes lin-fill { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        @media (prefers-reduced-motion: reduce) { .lin-a, .lin-a * { animation: none !important; } }
      `}</style>
      <div role="dialog" aria-modal="true" aria-label={`El camino hasta ${target.name}`} className="flex max-h-[94vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        {/* Cabecera oscura */}
        <div className="bg-ink px-6 pb-4 pt-5 text-white">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="zb-etiqueta !text-white/75">El camino en el árbol</p>
              <p className="mt-1 text-base text-white/80">
                Camino hasta {firstName(target.name)} · {total - 1} {total - 1 === 1 ? "paso" : "pasos"}
              </p>
              <h2 key={headline} className="lin-a font-maquina mt-2 text-[1.625rem] leading-snug sm:text-[1.875rem]" style={{ animation: "lin-fade .45s ease-out both" }}>
                {headline}
              </h2>
            </div>
            <button ref={closeRef} onClick={onClose} className="min-h-12 shrink-0 rounded-full border-2 border-white/40 px-5 font-bold text-white hover:bg-white/10">
              Cerrar
            </button>
          </div>
          <div className="mt-4 flex gap-1.5" aria-label={`Paso ${shown} de ${total}`}>
            {steps.map((s, i) => (
              <span key={s.id} className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/25">
                {i < shown && (
                  <span
                    key={`${s.id}-${i === shown - 1}`}
                    className="lin-a block h-full origin-left rounded-full"
                    style={{ background: i === shown - 1 ? sexColor(s.sex) : "#ffffff", animation: i === shown - 1 ? "lin-fill .5s ease-out both" : undefined }}
                  />
                )}
              </span>
            ))}
          </div>
        </div>

        {/* Camino: de abajo (partida) hacia arriba */}
        <div className="flex flex-1 flex-col overflow-y-auto px-5 py-5" style={{ minHeight: "min(430px, 56vh)" }}>
          <ol className="mt-auto flex flex-col-reverse">
            {steps.map((s, i) => {
              const revealed = i < shown;
              const isCur = i === shown - 1;
              const isRoot = i === 0;
              const isTarget = i === total - 1;
              const color = sexColor(s.sex);
              const remaining = total - shown;
              return (
                <li key={s.id} className="flex flex-col">
                  {revealed ? (
                    <div
                      ref={isCur ? curRef : undefined}
                      className="lin-a flex items-center gap-3"
                      style={{ animation: isCur && !isRoot ? "lin-in .55s cubic-bezier(.2,.9,.3,1) both" : undefined }}
                    >
                      <span
                        className="lin-a grid h-12 w-12 shrink-0 place-items-center rounded-full text-base font-bold"
                        style={{
                          background: isRoot ? "#1a1816" : isCur ? color : `${color}1a`,
                          color: isRoot ? "#ffffff" : isCur ? "#fff" : color,
                          border: `2px solid ${isRoot ? "#1a1816" : color}`,
                          ["--lc" as string]: `${color}66`,
                          animation: isCur && !isRoot ? `lin-pop .55s ease-out both${done && isTarget ? ", lin-glow 1.8s ease-in-out .6s 3" : ""}` : undefined,
                        }}
                      >
                        {initials(s.name)}
                      </span>
                      <div
                        className="min-w-0 flex-1 rounded-2xl border-2 bg-white px-4 py-3"
                        style={{ borderColor: isCur || isRoot ? (isRoot ? "#1a1816" : color) : "#d6d2ca", boxShadow: isCur && !isRoot ? `0 6px 20px -8px ${color}88` : undefined, background: isCur && !isRoot ? `${color}0d` : "#fff" }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="zb-nombre">{s.name}</p>
                            <p className="zb-apoyo">{isRoot ? "Punto de partida" : s.relation}</p>
                          </div>
                          <span
                            className="shrink-0 rounded-full px-3 py-1 text-base font-bold"
                            style={isRoot ? { background: "#1a1816", color: "#ffffff" } : isCur ? { background: color, color: "#fff" } : { background: `${color}1a`, color }}
                          >
                            {isRoot ? "Tú" : badgeOf(s)}
                          </span>
                        </div>
                        {s.place && (
                          <p className="zb-apoyo mt-1">
                            {s.place}
                            {s.estimated && <span className="text-[#9a4a14]"> (estimado)</span>}
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    // Todavía no aparece: la silueta con interrogación.
                    i === shown ? (
                      <div className="flex items-center gap-3">
                        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 border-dashed border-[#8f8a80] text-xl text-gris">?</span>
                        <div className="min-w-0 flex-1 rounded-2xl border-2 border-dashed border-line px-4 py-3">
                          <p className="zb-nombre text-gris">¿Quién será?</p>
                          <p className="zb-apoyo">Lo estamos descubriendo…</p>
                        </div>
                        {remaining > 1 && <span className="shrink-0 text-base text-gris">+{remaining - 1}</span>}
                      </div>
                    ) : i === shown + 1 ? (
                      <div className="ml-[1.45rem] pl-2 text-base tracking-[0.4em] text-gris/60">· · ·</div>
                    ) : null
                  )}
                  {i > 0 && (
                    <div className="ml-[1.45rem] flex items-stretch gap-3 py-0.5" aria-hidden>
                      <span
                        className="lin-a my-0.5 w-[3px] origin-bottom rounded"
                        style={{
                          minHeight: "1.9rem",
                          background: revealed ? color : "transparent",
                          borderLeft: revealed ? undefined : "2px dashed #8f8a80",
                          width: revealed ? 3 : 0,
                          animation: revealed && isCur ? "lin-line .45s ease-out both" : undefined,
                        }}
                      />
                      <span className="self-center text-base font-bold" style={{ color: revealed ? color : "#4a4740" }}>
                        ↑ {revealed ? edgeOf(s) : ""}
                      </span>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </div>

        {/* Pie */}
        <div className="border-t-2 border-line bg-white px-5 py-3">
          {done ? (
            <div className="lin-a flex flex-wrap items-center gap-2" style={{ animation: "lin-in .45s ease-out both" }}>
              <Link href={`/mapa?persona=${target.id}`} className={buttonClass("principal")}>
                Ver su mapa
              </Link>
              <Link href={`/?persona=${target.id}`} className={buttonClass("secundario")}>
                Ver en el árbol
              </Link>
              <button onClick={back} className={buttonClass("enlace", "sm:ml-auto")}>← Atrás</button>
              <button onClick={replay} className={buttonClass("enlace")}>↻ Repetir</button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={back} disabled={shown <= 1} className={buttonClass("enlace")}>← Atrás</button>
              <button onClick={() => setPlaying((p) => !p)} className={buttonClass("principal")}>
                {playing ? "❚❚ Pausar" : "▶ Seguir"}
              </button>
              <button onClick={() => { setPlaying(false); setShown(total); }} className={buttonClass("enlace", "ml-auto")}>Ver todo</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
