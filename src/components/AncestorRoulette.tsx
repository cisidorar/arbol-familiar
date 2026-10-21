"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

export type RoulettePerson = {
  id: string;
  name: string;
  /** "Tu bisabuela" */
  rel: string;
  years: string;
  place: string | null;
  blurb: string;
};

const DELAYS = [60, 60, 70, 80, 95, 115, 145, 185, 240];

/** Botón del encabezado: baja hasta la tarjeta y la hace girar. */
export function SurpriseButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        document.getElementById("te-toco")?.scrollIntoView({ behavior: "smooth", block: "center" });
        window.dispatchEvent(new Event("azb:sorpresa"));
      }}
    >
      <span aria-hidden>🎲</span> Antepasado sorpresa
    </button>
  );
}

/** "Te tocó": un antepasado al azar. Al pedir otro, los nombres giran como un sorteo y la tarjeta nueva cae sobre la mesa. */
export default function AncestorRoulette({ people, initialId }: { people: RoulettePerson[]; initialId: string }) {
  const [cur, setCur] = useState(() => people.find((p) => p.id === initialId) ?? people[0]);
  const [phase, setPhase] = useState<"idle" | "shuffle" | "land">("idle");
  const [flash, setFlash] = useState<RoulettePerson | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const busy = useRef(false);
  const curId = useRef(cur.id);
  curId.current = cur.id;

  const clear = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(() => clear, []);

  const spin = useCallback(() => {
    if (busy.current || people.length < 2) return;
    busy.current = true;
    const others = people.filter((p) => p.id !== curId.current);
    const target = others[Math.floor(Math.random() * others.length)];
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setCur(target);
      busy.current = false;
      return;
    }
    setPhase("shuffle");
    let t = 0;
    let last = curId.current;
    DELAYS.forEach((d, i) => {
      t += d;
      timers.current.push(
        setTimeout(() => {
          if (i === DELAYS.length - 1) {
            setCur(target);
            setFlash(null);
            setPhase("land");
            timers.current.push(
              setTimeout(() => {
                setPhase("idle");
                busy.current = false;
              }, 800),
            );
            return;
          }
          let next = people[Math.floor(Math.random() * people.length)];
          while (next.id === last || next.id === target.id) next = people[Math.floor(Math.random() * people.length)];
          last = next.id;
          setFlash(next);
        }, t),
      );
    });
  }, [people]);

  useEffect(() => {
    window.addEventListener("azb:sorpresa", spin);
    return () => window.removeEventListener("azb:sorpresa", spin);
  }, [spin]);

  const shown = phase === "shuffle" && flash ? flash : cur;

  return (
    <section id="te-toco" aria-label="Te tocó" className="grid items-center gap-6 rounded-3xl bg-[#f5f5f3] p-5 sm:p-7 md:grid-cols-[minmax(0,22rem)_1fr] md:gap-10">
      <div className="relative min-h-[11.5rem] [perspective:900px]">
        <div
          key={phase === "land" ? cur.id : "stable"}
          className={`rounded-2xl bg-[#f1efea] p-5 text-ink shadow-[0_14px_28px_rgba(0,0,0,0.18)] ${
            phase === "shuffle" ? "azb-shake" : phase === "land" ? "azb-drop" : "-rotate-3"
          }`}
        >
          <div className="flex items-start justify-between gap-3 border-b border-terra pb-2 font-maquina text-sm uppercase leading-tight">
            <span>{shown.rel}</span>
            <span className="shrink-0">{shown.years}</span>
          </div>
          <p className={`mt-3 font-maquina text-[1.5rem] leading-tight ${phase === "shuffle" ? "blur-[1.5px]" : ""}`}>{shown.name}</p>
          {shown.place && <p className="mt-3 font-maquina text-base">{shown.place}</p>}
        </div>
      </div>

      <div aria-live="polite">
        <p className="zb-etiqueta">Te tocó</p>
        <p className="mt-2 text-[1.1875rem] leading-relaxed sm:text-[1.3125rem]">{phase === "shuffle" ? "Sorteando…" : cur.blurb}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href={`/persona/${cur.id}`} className="inline-flex min-h-12 items-center rounded-full bg-ink px-6 text-[1.0625rem] font-bold text-white hover:bg-terra">
            Conocer su historia
          </Link>
          <button
            type="button"
            onClick={spin}
            disabled={phase === "shuffle"}
            className="inline-flex min-h-12 items-center rounded-full border-2 border-ink px-6 text-[1.0625rem] font-bold hover:bg-white disabled:opacity-60"
          >
            Otro al azar
          </button>
        </div>
      </div>
    </section>
  );
}
