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
    <div ref={containerRef} className="zb relative flex w-full items-center gap-3">
      <label htmlFor="buscar" className="sr-only">
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
          placeholder="Buscar persona o lugar"
          className="min-h-12 w-full rounded-lg border-2 border-transparent bg-white py-2 pl-3.5 pr-12 text-[1.125rem] text-ink outline-none placeholder:text-gris/70 focus:border-hombre [&::-webkit-search-cancel-button]:hidden"
        />
        {q && (
          <button
            onClick={() => {
              setQ("");
              setResults([]);
              setSearched(false);
            }}
            aria-label="Borrar lo escrito"
            className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-md text-gris hover:bg-paper hover:text-ink"
          >
            ✕
          </button>
        )}

        {open && searched && (
          <ul className="absolute left-0 top-full z-10 mt-2 max-h-80 w-full min-w-[18rem] overflow-auto rounded-xl border-2 border-line bg-white py-1 text-ink shadow-[0_12px_30px_rgba(0,0,0,0.3)]">
            {results.length > 0 ? (
              results.map((r) => (
                <li key={r.id}>
                  <button
                    className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-2 text-left text-[1.125rem] hover:bg-paper"
                    onClick={() => {
                      onSelect(r.id);
                      setOpen(false);
                      setQ(r.displayName);
                    }}
                  >
                    <span>{r.displayName}</span>
                    <span className="shrink-0 text-base text-gris">
                      {r.birthYear ?? "sin año"} {!r.isLiving && "†"}
                    </span>
                  </button>
                </li>
              ))
            ) : (
              <li className="px-4 py-3 text-[1.0625rem] text-gris">
                No encontramos a nadie con &laquo;{q}&raquo;. Prueba con solo el apellido.
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
