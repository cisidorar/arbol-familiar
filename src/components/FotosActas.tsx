"use client";

import { useEffect, useState } from "react";

type Foto = { id: string; original_url: string | null; title: string | null; transcription?: string | null };

/** Fotos de actas de una ficha: miniaturas (o más grandes con título) que se abren encima de la ficha, con botón para volver. */
export default function FotosActas({ fotos, grande = false }: { fotos: Foto[]; grande?: boolean }) {
  const [abierta, setAbierta] = useState<Foto | null>(null);

  useEffect(() => {
    if (!abierta) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setAbierta(null);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [abierta]);

  if (fotos.length === 0) return null;
  return (
    <>
      <ul className={grande ? (fotos.length === 1 ? "grid grid-cols-1 gap-3" : "grid grid-cols-2 gap-3 sm:grid-cols-3") : "mt-2 flex flex-wrap gap-2"}>
        {fotos.map((m) => (
          <li key={m.id}>
            <button type="button" onClick={() => setAbierta(m)} title={m.title ?? undefined} className="block w-full text-left">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={m.original_url as string}
                alt={m.title ?? "Foto de un documento"}
                loading="lazy"
                className={grande ? "aspect-[4/3] w-full border-2 border-adobe-2 object-cover" : "h-20 w-20 border-2 border-adobe-2 object-cover"}
              />
              {grande && <span className="mt-1 block text-sm text-gris">{m.title}</span>}
              {grande && m.transcription && <span className="mt-1 block text-sm italic text-ink">«{m.transcription}»</span>}
            </button>
          </li>
        ))}
      </ul>
      {abierta && (
        <div role="dialog" aria-modal="true" aria-label="Foto del documento" className="fixed inset-0 z-[100] flex flex-col bg-black/90" onClick={() => setAbierta(null)}>
          <div className="flex items-center justify-between gap-3 px-4 py-3" onClick={(e) => e.stopPropagation()}>
            <div className="min-w-0">
              <p className="text-base text-white">{abierta.title}</p>
              {abierta.transcription && <p className="mt-1 text-base italic text-white/90">Transcripción: «{abierta.transcription}»</p>}
            </div>
            <button type="button" onClick={() => setAbierta(null)} className="shrink-0 border-2 border-white px-4 py-2 text-base font-bold text-white">
              Volver
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={abierta.original_url as string} alt={abierta.title ?? "Foto de un documento"} className="mx-auto max-h-full max-w-full object-contain" onClick={(e) => e.stopPropagation()} />
          </div>
        </div>
      )}
    </>
  );
}
