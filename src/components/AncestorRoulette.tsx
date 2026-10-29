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

const DELAYS = [55, 55, 60, 70, 85, 105, 135, 175, 230, 300];

/** "Te tocó": un antepasado al azar. Al pedir otro, los nombres giran como un sorteo y la tarjeta nueva cae sobre la mesa. */
export default function AncestorRoulette({ people, initialId }: { people: RoulettePerson[]; initialId: string }) {
  const [cur, setCur] = useState(() => people.find((p) => p.id === initialId) ?? people[0]);
  const [prev, setPrev] = useState<RoulettePerson | null>(null);
  const [phase, setPhase] = useState<"idle" | "shuffle" | "land">("idle");
  const [flash, setFlash] = useState<RoulettePerson | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const busy = useRef(false);
  const curId = useRef(cur.id);
  useEffect(() => {
    curId.current = cur.id;
  }, [cur.id]);

  const clear = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(() => clear, []);

  const spin = useCallback(() => {
    if (busy.current || people.length < 2) return;
    busy.current = true;
    const from = people.find((p) => p.id === curId.current) ?? null;
    const others = people.filter((p) => p.id !== curId.current);
    const target = others[Math.floor(Math.random() * others.length)];
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setPrev(from);
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
            setPrev(from);
            setCur(target);
            setFlash(null);
            setPhase("land");
            timers.current.push(
              setTimeout(() => {
                setPhase("idle");
                busy.current = false;
              }, 1000),
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

  const shown = phase === "shuffle" && flash ? flash : cur;
  const shuffling = phase === "shuffle";

  return (
    <section id="te-toco" aria-label="Te tocó" className="grid items-center gap-6 on-dark tapa rounded-3xl bg-burdeos p-5 text-adobe sm:p-8 md:min-h-[26rem] md:grid-cols-[minmax(0,22rem)_1fr] md:gap-10">
      <div className="relative [perspective:900px] sm:min-h-[11.5rem]">
        <Link
          href={`/persona/${cur.id}`}
          aria-label={`Ver la ficha de ${cur.name}`}
          tabIndex={shuffling ? -1 : undefined}
          key={phase === "land" ? cur.id : "stable"}
          className={`foto block p-5 pb-6 text-ink ${
            shuffling ? "azb-shake" : phase === "land" ? "azb-drop" : "-rotate-3"
          }`}
        >
          <span className="esq-a" aria-hidden="true" />
          <span className="esq-b" aria-hidden="true" />
          <div aria-hidden="true" className={`grid h-20 place-items-center overflow-hidden bg-adobe-2 sm:h-32 ${phase === "land" ? "azb-revela" : ""}`}>
            <span key={shown.id} className={`font-slab text-[3.25rem] font-bold leading-none text-burdeos/80 sm:text-[5rem] ${shuffling ? "azb-reel" : ""}`}>
              {shown.name.trim().charAt(0)}
            </span>
          </div>
          <div className="mt-3 border-b-2 border-teja pb-2 zb-etiqueta !text-ink">{shown.rel}</div>
          <p key={shown.id} className={`mt-3 min-h-[3.5rem] font-slab text-[1.75rem] font-bold leading-tight ${shuffling ? "azb-reel" : ""}`}>{shown.name}</p>
          {shown.place && <p className="zb-texto mt-2">{shown.place}</p>}
          <p className="mt-3 font-maquina text-[1.125rem] text-gris">{shown.years}</p>
        </Link>
      </div>

      <div>
        <h2 className="al-titulo al-regla">Te tocó</h2>
        <p aria-live="polite" className={`zb-texto mt-2 sm:text-[1.25rem] ${phase === "land" ? "azb-fade" : ""}`}>
          {shuffling ? "Sorteando…" : (<><span className="sr-only">{cur.name}. </span>{cur.blurb}</>)}
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Link
            href={`/persona/${cur.id}`}
            className="al-mueve inline-flex min-h-12 items-center rounded-full border-2 border-adobe px-7 py-2 text-[1.125rem] font-bold text-adobe hover:bg-adobe hover:text-burdeos"
          >
            Conocer su historia
          </Link>
          <button
            type="button"
            onClick={spin}
            aria-disabled={shuffling}
            className="al-mueve inline-flex min-h-12 items-center px-3 py-2 text-[1.125rem] font-bold text-adobe underline decoration-2 underline-offset-4 hover:text-trigo aria-disabled:opacity-60"
          >
            Otro al azar
          </button>
          {prev && !shuffling && (
            <button
              type="button"
              onClick={() => {
                setCur(prev);
                setPrev(null);
              }}
              className="inline-flex min-h-12 items-center px-3 py-2 text-[1.125rem] font-bold underline decoration-2 underline-offset-4 hover:text-trigo"
            >
              Volver al anterior
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
