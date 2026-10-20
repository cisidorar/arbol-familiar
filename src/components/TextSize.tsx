"use client";

import { useEffect, useState } from "react";

// Tamaño de la letra para toda la página: tres botones "A" de menor a mayor.
// Se recuerda en este navegador (si no se puede guardar, igual funciona).
const SIZES = ["normal", "grande", "enorme"] as const;
type Size = (typeof SIZES)[number];
const LABELS: Record<Size, string> = { normal: "Letra normal", grande: "Letra grande", enorme: "Letra muy grande" };
const KEY = "azb_texto";

export default function TextSize() {
  const [size, setSize] = useState<Size>("normal");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY) as Size | null;
      if (saved && SIZES.includes(saved)) {
        setSize(saved);
        document.documentElement.dataset.texto = saved;
      }
    } catch {
      /* sin almacenamiento: queda en normal */
    }
  }, []);

  const choose = (next: Size) => {
    setSize(next);
    document.documentElement.dataset.texto = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* no pasa nada */
    }
  };

  return (
    <div role="group" aria-label="Tamaño de la letra" className="flex rounded-full border border-white/25 bg-white/10 p-1">
      {SIZES.map((s, i) => (
        <button
          key={s}
          type="button"
          onClick={() => choose(s)}
          aria-pressed={size === s}
          aria-label={LABELS[s]}
          title={LABELS[s]}
          className={`flex h-10 w-10 items-center justify-center rounded-full font-bold leading-none ${
            size === s ? "bg-white text-ink" : "text-white/85 hover:bg-white/15"
          }`}
          style={{ fontSize: `${14 + i * 3}px` }}
        >
          A
        </button>
      ))}
    </div>
  );
}
