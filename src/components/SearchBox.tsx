"use client";

import { useEffect, useRef, useState } from "react";

interface Result {
  id: string;
  displayName: string;
  birthYear: number | null;
  isLiving: boolean;
}

export default function SearchBox({ onSelect }: { onSelect: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [open, setOpen] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const res = await fetch(`/api/persons/search?q=${encodeURIComponent(q)}`);
      const json = await res.json();
      setResults(json.results);
      setSearched(true);
      setOpen(true);
    }, 200);
  }, [q]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative flex w-full items-end gap-3">
      <label htmlFor="buscar" className="sr-only shrink-0 pb-1 text-[15px] font-bold text-[#f5f2ea] sm:not-sr-only">
        Buscar:
      </label>
      <div className="relative min-w-0 flex-1">
        <input
          id="buscar"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              (e.target as HTMLInputElement).blur();
            }
          }}
          placeholder="nombre, apellido o lugar…"
          className="w-full border-0 border-b border-dotted border-[#f5f2ea]/50 bg-transparent py-1 pr-6 text-[15px] text-[#f5f2ea] outline-none transition-colors placeholder:text-[#f5f2ea]/40 focus:border-solid focus:border-[#f5f2ea] [&::-webkit-search-cancel-button]:hidden"
        />
        {q && (
          <button
            onClick={() => {
              setQ("");
              setResults([]);
              setSearched(false);
            }}
            aria-label="Limpiar búsqueda"
            className="absolute right-0 top-1/2 -translate-y-1/2 px-1 text-[#f5f2ea]/50 hover:text-[#f5f2ea]"
          >
            ✕
          </button>
        )}

        {open && searched && (
          <ul className="absolute left-0 top-full z-10 mt-2 max-h-72 w-full min-w-[16rem] overflow-auto border-2 border-[#1a1917] bg-[#f5f2ea] py-1 text-[#1f1d1a] shadow-[0_12px_30px_rgba(0,0,0,0.4)]">
            {results.length > 0 ? (
              results.map((r) => (
                <li key={r.id}>
                  <button
                    className="flex w-full items-center justify-between px-3.5 py-2 text-left text-sm hover:bg-[#e9e4d6]"
                    onClick={() => {
                      onSelect(r.id);
                      setOpen(false);
                      setQ(r.displayName);
                    }}
                  >
                    <span>{r.displayName}</span>
                    <span className="text-xs text-[#7a756a]">
                      {r.birthYear ?? "s/f"} {!r.isLiving && "†"}
                    </span>
                  </button>
                </li>
              ))
            ) : (
              <li className="px-3.5 py-2.5 text-sm text-[#7a756a]">Sin resultados para "{q}"</li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
