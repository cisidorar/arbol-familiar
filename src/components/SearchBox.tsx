"use client";

import { useEffect, useId, useRef, useState } from "react";

interface Result {
  id: string;
  displayName: string;
  birthYear: number | null;
  isLiving: boolean;
}

const normText = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** 0: el nombre empieza con lo escrito; 1: alguna palabra del nombre empieza así; 2: lo demás. */
const rankOf = (name: string, needle: string) => {
  const n = normText(name);
  return n.startsWith(needle) ? 0 : n.split(/\s+/).some((w) => w.startsWith(needle)) ? 1 : 2;
};

export default function SearchBox({
  onSelect,
  placeholder = "Buscar persona o lugar",
  inputClassName = "border-transparent",
  label,
  labelClassName = "",
}: {
  onSelect: (id: string) => void;
  placeholder?: string;
  /** Borde del campo: transparente sobre fondo oscuro, visible sobre papel. */
  inputClassName?: string;
  /** Rótulo visible sobre el campo; sin él, el campo lleva un rótulo solo para lectores de pantalla. */
  label?: string;
  /** Color del rótulo visible (p. ej. blanco sobre un fondo de color). */
  labelClassName?: string;
}) {
  const id = useId();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [open, setOpen] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = `${id}-lista`;

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
      // Primero los que empiezan con lo escrito (o tienen una palabra que empieza así): Enter abre el más probable, no el primero del abecedario.
      const needle = normText(q.trim());
      setResults([...(json.results as Result[])].sort((a, b) => rankOf(a.displayName, needle) - rankOf(b.displayName, needle)));
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
    <div ref={containerRef} className={`zb relative flex w-full gap-3 ${label ? "flex-col items-stretch gap-2" : "items-center"}`}>
      <label htmlFor={id} className={label ? `text-[1.125rem] font-bold ${labelClassName}` : "sr-only"}>
        {label ?? "Buscar:"}
      </label>
      <div className="relative min-w-0 flex-1">
        {/* Lo que pasó con la búsqueda, dicho para el lector de pantalla. */}
        <p role="status" className="sr-only">
          {searched ? (results.length ? `${results.length} ${results.length === 1 ? "resultado" : "resultados"}` : "No encontramos a nadie") : ""}
        </p>
        <input
          id={id}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => {
            setOpen(true);
            if (window.innerWidth < 640) containerRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
          }}
          role="combobox"
          aria-expanded={open && searched && results.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              (e.target as HTMLInputElement).blur();
            }
            // Enter abre el resultado si es uno solo y claro; si no, entra a la lista. La flecha hacia abajo también entra.
            if (e.key === "Enter" && open && searched && results[0]) {
              e.preventDefault();
              const needle = normText(q.trim());
              const best = results.filter((r) => rankOf(r.displayName, needle) === 0);
              // Un solo resultado claro: se abre. Con varios parecidos (un apellido repetido), se pasa a la lista para elegir.
              if (results.length === 1 || best.length === 1) {
                const pick = results.length === 1 ? results[0] : best[0];
                onSelect(pick.id);
                setOpen(false);
                setQ(pick.displayName);
              } else {
                listRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
              }
            }
            if (e.key === "ArrowDown" && open && results.length) {
              e.preventDefault();
              listRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
            }
          }}
          placeholder={placeholder}
          className={`min-h-12 w-full rounded-lg border-2 ${inputClassName} bg-white py-2 pl-3.5 pr-12 text-[1.125rem] text-ink outline-none placeholder:text-gris/70 focus:border-ink [&::-webkit-search-cancel-button]:hidden`}
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
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label="Resultados"
            onKeyDown={(e) => {
              const buttons = [...(listRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
              const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
              if (e.key === "ArrowDown") {
                e.preventDefault();
                buttons[Math.min(at + 1, buttons.length - 1)]?.focus();
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                if (at <= 0) (containerRef.current?.querySelector("input") as HTMLInputElement | null)?.focus();
                else buttons[at - 1]?.focus();
              } else if (e.key === "Escape") {
                setOpen(false);
                (containerRef.current?.querySelector("input") as HTMLInputElement | null)?.focus();
              }
            }}
            className="absolute left-0 top-full z-30 mt-2 max-h-[min(20rem,42dvh)] w-full min-w-[18rem] overflow-auto rounded-xl border-2 border-line bg-white py-1 text-ink shadow-[0_12px_30px_rgba(0,0,0,0.3)]">
            {results.length > 0 ? (
              results.map((r) => (
                <li key={r.id} role="presentation">
                  <button
                    role="option"
                    aria-selected={false}
                    className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-2 text-left text-[1.125rem] hover:bg-paper"
                    onClick={() => {
                      onSelect(r.id);
                      setOpen(false);
                      setQ(r.displayName);
                    }}
                  >
                    <span>{r.displayName}</span>
                    <span className="shrink-0 text-base text-gris">
                      {r.birthYear ?? "sin año"} {!r.isLiving && (<><span aria-hidden="true">†</span><span className="sr-only">fallecido</span></>)}
                    </span>
                  </button>
                </li>
              ))
            ) : (
              <li className="px-4 py-3 text-[1.125rem] text-gris">
                No encontramos a nadie con &laquo;{q}&raquo;. Prueba con solo el apellido o con menos letras.
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
