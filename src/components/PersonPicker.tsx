"use client";

import { useEffect, useRef, useState } from "react";

export type PersonRef = { id: string; name: string };

type Result = { id: string; displayName: string; birthYear: number | null };

const field =
  "min-h-12 w-full rounded-lg border-2 border-[#8f8a80] bg-white px-3.5 py-2 text-[1.125rem] text-ink placeholder:text-gris/70 focus:border-hombre focus:outline-none";

/** Buscador de una persona del árbol (usa la misma búsqueda del encabezado del árbol). */
export default function PersonPicker({
  value,
  onChange,
  placeholder = "Buscar por nombre",
  autoFocus = false,
}: {
  value: PersonRef | null;
  onChange: (p: PersonRef | null) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [searched, setSearched] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) return;
    timer.current = setTimeout(async () => {
      const res = await fetch(`/api/persons/search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        setResults((await res.json()).results);
        setSearched(true);
      }
    }, 200);
  }, [q]);

  if (value) {
    return (
      <div className="flex min-h-12 items-center gap-2 rounded-lg border-2 border-line bg-paper px-3.5 py-1 text-[1.125rem] text-ink">
        <span className="min-w-0 flex-1 truncate font-bold">{value.name}</span>
        <button type="button" onClick={() => onChange(null)} className="min-h-12 px-2 font-bold underline decoration-2 underline-offset-4">
          Quitar
        </button>
      </div>
    );
  }
  const open = q.trim().length >= 2 && searched;
  return (
    <div className="relative">
      <input
        className={field}
        value={q}
        autoFocus={autoFocus}
        onChange={(e) => {
          setQ(e.target.value);
          setSearched(false);
        }}
        placeholder={placeholder}
        aria-label={placeholder}
      />
      {open && (
        <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border-2 border-line bg-white text-[1.125rem] text-ink shadow-lg">
          {results.length === 0 && <li className="px-3.5 py-3 text-gris">No encontramos a nadie con ese nombre.</li>}
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className="block min-h-12 w-full px-3.5 py-2.5 text-left hover:bg-paper"
                onClick={() => {
                  onChange({ id: r.id, name: r.displayName });
                  setQ("");
                  setResults([]);
                  setSearched(false);
                }}
              >
                {r.displayName}
                {r.birthYear ? <span className="text-gris"> · {r.birthYear}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
