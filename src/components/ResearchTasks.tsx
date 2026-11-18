"use client";

import { useState, useTransition } from "react";
import { setResearchTaskDone } from "@/app/actions/tareas";
import type { ResearchGroup } from "@/lib/data/research-tasks";

/**
 * La lista de investigación, de lo que más desbloquea a lo que menos. Cada tarea se tacha
 * con su casilla; los enlaces abren el documento en FamilySearch.
 */
const CHANNELS: Record<string, string> = {
  familysearch: "FamilySearch",
  registro_civil: "Registro Civil",
  familia: "Familia",
  internet: "Internet",
  app: "Cargar en la app",
  cuidado: "Cuidado",
};

export default function ResearchTasks({ groups }: { groups: ResearchGroup[] }) {
  const [done, setDone] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(groups.flatMap((g) => g.tasks.map((t) => [t.id, t.done]))),
  );
  const [error, setError] = useState<string | null>(null);
  // "todas", "familysearch", "registro_civil" u "otras" (familia, internet, app, cuidado).
  const [filter, setFilter] = useState<string>("todas");
  const matches = (c: string) => filter === "todas" || (filter === "otras" ? c !== "familysearch" && c !== "registro_civil" : c === filter);
  const [, start] = useTransition();

  function toggle(id: string, value: boolean) {
    setDone((d) => ({ ...d, [id]: value }));
    start(async () => {
      const res = await setResearchTaskDone(id, value);
      if (res.error) {
        setDone((d) => ({ ...d, [id]: !value }));
        setError(res.error);
      } else setError(null);
    });
  }

  const total = groups.reduce((n, g) => n + g.tasks.length, 0);
  const left = groups.reduce((n, g) => n + g.tasks.filter((t) => !done[t.id]).length, 0);

  return (
    <section className="mb-12" aria-labelledby="investigacion">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <h1 id="investigacion" className="zb-titulo al-regla">
          Tareas
        </h1>
        <p className="zb-texto text-gris">
          {left === 0 ? "Todo listo." : `${left} de ${total} por hacer.`} Ordenadas por lo que más desbloquean: arriba, lo que abre ramas completas.
        </p>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-2xl border-2 border-aviso bg-white px-4 py-3 text-[1.125rem] font-bold">
          {error}
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Dónde se resuelve">
        {[
          ["todas", "Todas"],
          ["familysearch", "FamilySearch"],
          ["registro_civil", "Registro Civil"],
          ["otras", "Otras"],
        ].map(([k, label]) => {
          const n = groups.reduce((a, g) => a + g.tasks.filter((t) => !done[t.id] && (k === "todas" || (k === "otras" ? t.channel !== "familysearch" && t.channel !== "registro_civil" : t.channel === k))).length, 0);
          return (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              aria-pressed={filter === k}
              className={`min-h-11 rounded-full border-2 px-4 text-[1.0625rem] font-bold ${filter === k ? "border-burdeos bg-burdeos text-white" : "border-line bg-white"}`}
            >
              {label} · {n}
            </button>
          );
        })}
      </div>

      {groups.map((g) => {
        const shown = g.tasks.filter((t) => matches(t.channel));
        if (shown.length === 0) return null;
        const rest = shown.filter((t) => !done[t.id]).length;
        return (
          <div key={g.rank} className="mt-8">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b-2 border-line pb-3">
              <span className="flex h-9 min-w-9 items-center justify-center rounded-full bg-burdeos px-2 text-[1.125rem] font-bold text-white">
                {g.rank}
              </span>
              <h2 className="font-slab text-[1.5rem] font-bold leading-tight">{g.label}</h2>
              <span className="text-base text-gris">{rest === 0 ? "completo" : `${rest} por hacer`}</span>
              {g.unlocks && <p className="w-full text-base text-gris">{g.unlocks}</p>}
            </div>
            <ul className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {shown.map((t) => (
                <li
                  key={t.id}
                  className={`flex gap-3 rounded-3xl border-2 border-line bg-white p-4 ${done[t.id] ? "opacity-60" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={!!done[t.id]}
                    onChange={(e) => toggle(t.id, e.target.checked)}
                    aria-label={`Hecho: ${t.title}`}
                    className="mt-1 h-6 w-6 shrink-0 accent-[var(--color-burdeos,#6e1f2e)]"
                  />
                  <div className="min-w-0">
                    <p className="mb-1">
                      <span className={`rounded-full px-2.5 py-0.5 text-base font-bold uppercase tracking-wide ${t.channel === "registro_civil" ? "bg-trigo text-ink" : t.channel === "familysearch" ? "bg-teja text-white" : "bg-adobe-2 text-gris"}`}>
                        {CHANNELS[t.channel] ?? t.channel}
                      </span>
                    </p>
                    <p className={`text-[1.125rem] font-bold leading-snug ${done[t.id] ? "line-through" : ""}`}>{t.title}</p>
                    {t.detail && <p className="mt-1 text-base leading-snug text-gris">{t.detail}</p>}
                    {t.links.length > 0 && (
                      <p className="mt-2 flex flex-wrap gap-2">
                        {t.links.map((l) => (
                          <a
                            key={l.url}
                            href={l.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-full border-2 border-line px-3 py-1 text-base font-bold underline decoration-2 underline-offset-4"
                          >
                            {l.label} ↗
                          </a>
                        ))}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
