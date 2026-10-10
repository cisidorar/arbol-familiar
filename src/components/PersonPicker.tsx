"use client";

import { useEffect, useRef, useState } from "react";

export type PersonRef = { id: string; name: string };

type Result = { id: string; displayName: string; birthYear: number | null };

const field =
  "w-full rounded-lg border border-[#cfc8b8] bg-white px-3 py-2 text-sm text-[#1f1d1a] placeholder:text-[#9a9486] focus:border-[#1a1917] focus:outline-none";

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
      <div className="flex items-center gap-2 rounded-lg border border-[#cfc8b8] bg-[#f6f3ec] px-3 py-2 text-sm text-[#1f1d1a]">
        <span className="min-w-0 flex-1 truncate">{value.name}</span>
        <button type="button" onClick={() => onChange(null)} className="text-xs text-[#6b6558] underline">
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
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-[#d9d3c4] bg-white text-sm text-[#1f1d1a] shadow-lg">
          {results.length === 0 && <li className="px-3 py-2 text-[#6b6558]">Nadie con ese nombre.</li>}
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left hover:bg-[#f1ede2]"
                onClick={() => {
                  onChange({ id: r.id, name: r.displayName });
                  setQ("");
                  setResults([]);
                  setSearched(false);
                }}
              >
                {r.displayName}
                {r.birthYear ? <span className="text-[#6b6558]"> · {r.birthYear}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
