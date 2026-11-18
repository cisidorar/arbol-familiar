"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setResearchTaskDone } from "@/app/actions/tareas";
import type { ResearchGroup, ResearchTask } from "@/lib/data/research-tasks";
import type { ReviewTask } from "@/lib/data/review";
import PersonPanel from "./PersonPanel";
import { buttonClass } from "./ui";

const CHANNELS: Record<string, string> = {
  familysearch: "FamilySearch",
  registro_civil: "Registro Civil",
  familia: "Familia",
  internet: "Internet",
  app: "Cargar en la app",
  cuidado: "Cuidado",
};

type View = "plan" | "familysearch" | "registro_civil";
type Flat = ResearchTask & { rank: number; group: string };

/**
 * La lista de investigación en tres vistas: el plan completo por rama (de lo que más desbloquea
 * a lo que menos), «Voy a FamilySearch» y «Voy al Registro Civil» (solo lo que se resuelve allá,
 * en orden de impacto). Cada tarea se tacha con su casilla; si resuelve hechos marcados «por
 * revisar», muestra aquí su comentario, su fuente y las fichas.
 */
export default function ResearchTasks({
  groups,
  reviewById,
  people,
  homeId,
}: {
  groups: ResearchGroup[];
  reviewById: Record<string, ReviewTask>;
  people: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  homeId: string | null;
}) {
  const router = useRouter();
  const [view, setView] = useState<View>("plan");
  const [openId, setOpenId] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(groups.flatMap((g) => g.tasks.map((t) => [t.id, t.done]))),
  );
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  function toggle(id: string, value: boolean) {
    setDone((d) => ({ ...d, [id]: value }));
    start(async () => {
      const res = await setResearchTaskDone(id, value);
      if (res.error) {
        setDone((d) => ({ ...d, [id]: !value }));
        setError(res.error);
      } else {
        setError(null);
        router.refresh();
      }
    });
  }

  const flat: Flat[] = groups.flatMap((g) => g.tasks.map((t) => ({ ...t, rank: g.rank, group: g.label })));
  const count = (pred: (t: Flat) => boolean) => flat.filter((t) => !done[t.id] && pred(t)).length;
  const total = flat.length;
  const left = count(() => true);

  function Card({ t, showGroup }: { t: Flat; showGroup?: boolean }) {
    const reviews = t.eventIds.map((id) => reviewById[id]).filter(Boolean);
    const notes = [...new Set(reviews.map((r) => r.note).filter((n): n is string => !!n))];
    const sources = new Map<string, string>();
    for (const r of reviews) if (r.source) sources.set(r.source.url, r.source.title);
    const persons = new Map<string, string>();
    for (const r of reviews) for (const p of r.people) persons.set(p.id, p.name);
    const links = [...t.links.map((l) => ({ label: l.label, url: l.url })), ...[...sources.keys()].filter((u) => !t.links.some((l) => l.url === u)).map((u) => ({ label: "Fuente de la marca", url: u }))];
    return (
      <li className={`flex gap-3 rounded-3xl border-2 border-line bg-white p-4 ${done[t.id] ? "opacity-60" : ""}`}>
        <input
          type="checkbox"
          checked={!!done[t.id]}
          onChange={(e) => toggle(t.id, e.target.checked)}
          aria-label={`Hecho: ${t.title}`}
          className="mt-1 h-6 w-6 shrink-0 accent-[var(--color-burdeos,#6e1f2e)]"
        />
        <div className="min-w-0">
          <p className="mb-1 flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-0.5 text-base font-bold uppercase tracking-wide ${
                t.channel === "registro_civil" ? "bg-trigo text-ink" : t.channel === "familysearch" ? "bg-teja text-white" : "bg-adobe-2 text-gris"
              }`}
            >
              {CHANNELS[t.channel] ?? t.channel}
            </span>
            {showGroup && <span className="text-base text-gris">{t.rank}. {t.group}</span>}
          </p>
          <p className={`text-[1.125rem] font-bold leading-snug ${done[t.id] ? "line-through" : ""}`}>{t.title}</p>
          {t.detail && <p className="mt-1 text-base leading-snug text-gris">{t.detail}</p>}
          {notes.map((n) => (
            <p key={n} className="mt-2 whitespace-pre-line break-words rounded-xl border-l-4 border-trigo bg-trigo/20 px-3.5 py-2 text-base leading-snug">
              {n}
            </p>
          ))}
          {(links.length > 0 || persons.size > 0) && (
            <p className="mt-3 flex flex-wrap items-center gap-2">
              {links.map((l) => (
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
              {[...persons].map(([id, name]) => (
                <button key={id} type="button" onClick={() => setOpenId(id)} className={buttonClass("secundario", "!px-4 !min-h-0 !py-1")}>
                  Ficha de {name.split(" ")[0]}
                </button>
              ))}
            </p>
          )}
        </div>
      </li>
    );
  }

  const tab = (k: View, label: string, n: number) => (
    <button
      key={k}
      type="button"
      onClick={() => setView(k)}
      aria-pressed={view === k}
      className={`min-h-11 rounded-full border-2 px-5 text-[1.125rem] font-bold ${view === k ? "border-burdeos bg-burdeos text-white" : "border-line bg-white"}`}
    >
      {label} · {n}
    </button>
  );

  const fsList = flat.filter((t) => t.channel === "familysearch");
  const rcList = flat.filter((t) => t.channel === "registro_civil");
  const warnings = flat.filter((t) => t.channel === "cuidado");

  return (
    <section className="mb-12" aria-labelledby="investigacion">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <h1 id="investigacion" className="zb-titulo al-regla">
          Tareas
        </h1>
        <p className="zb-texto text-gris">
          {left === 0 ? "Todo listo." : `${left} de ${total} por hacer.`} Siempre de lo que más desbloquea a lo que menos.
        </p>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-2xl border-2 border-aviso bg-white px-4 py-3 text-[1.125rem] font-bold">
          {error}
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Vista">
        {tab("plan", "Plan completo", left)}
        {tab("familysearch", "Voy a FamilySearch", count((t) => t.channel === "familysearch"))}
        {tab("registro_civil", "Voy al Registro Civil", count((t) => t.channel === "registro_civil"))}
      </div>

      {view === "plan" &&
        groups.map((g) => {
          const rest = g.tasks.filter((t) => !done[t.id]).length;
          return (
            <div key={g.rank} className="mt-8">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b-2 border-line pb-3">
                <span className="flex h-9 min-w-9 items-center justify-center rounded-full bg-burdeos px-2 text-[1.125rem] font-bold text-white">{g.rank}</span>
                <h2 className="font-slab text-[1.5rem] font-bold leading-tight">{g.label}</h2>
                <span className="text-base text-gris">{rest === 0 ? "completo" : `${rest} por hacer`}</span>
                {g.unlocks && <p className="w-full text-base text-gris">{g.unlocks}</p>}
              </div>
              <ul className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                {g.tasks.map((t) => (
                  <Card key={t.id} t={{ ...t, rank: g.rank, group: g.label }} />
                ))}
              </ul>
            </div>
          );
        })}

      {view === "familysearch" && (
        <div className="mt-6">
          <p className="zb-texto text-gris">
            Lista para el centro de historia familiar, en orden de impacto. Algunos documentos solo se ven allá; los códigos abren el registro en FamilySearch.
          </p>
          {warnings.length > 0 && (
            <div className="mt-4 rounded-3xl border-2 border-trigo bg-trigo/20 p-4">
              <p className="font-slab text-[1.25rem] font-bold">Para no confundirte con homónimos</p>
              <ul className="mt-2 list-disc space-y-1 pl-6 text-[1.0625rem] leading-snug">
                {warnings.map((w) => (
                  <li key={w.id}>
                    <strong>{w.title}.</strong> {w.detail}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <ol className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {fsList.map((t) => (
              <Card key={t.id} t={t} showGroup />
            ))}
          </ol>
        </div>
      )}

      {view === "registro_civil" && (
        <div className="mt-6">
          <div className="rounded-3xl border-2 border-line bg-white p-5">
            <p className="font-slab text-[1.25rem] font-bold">Antes de ir o pedirlo en línea</p>
            <ul className="mt-2 list-disc space-y-1 pl-6 text-[1.0625rem] leading-snug">
              <li>En línea suele pedir el RUN de la persona. Si no lo tienes (o falleció hace mucho), pide una búsqueda por nombre en una oficina.</li>
              <li>Lleva circunscripción, año y número de inscripción: salen de los índices de FamilySearch o de las fichas del árbol.</li>
              <li>También puedes llamar al 600 370 2000.</li>
            </ul>
            <p className="mt-3 flex flex-wrap gap-2">
              <a href="https://www.registrocivil.cl" target="_blank" rel="noopener noreferrer" className="rounded-full border-2 border-line px-3 py-1 text-base font-bold underline decoration-2 underline-offset-4">
                Registro Civil ↗
              </a>
              <a href="https://www.chileatiende.gob.cl/instituciones/registro-civil" target="_blank" rel="noopener noreferrer" className="rounded-full border-2 border-line px-3 py-1 text-base font-bold underline decoration-2 underline-offset-4">
                ChileAtiende ↗
              </a>
            </p>
          </div>
          <ol className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {rcList.map((t) => (
              <Card key={t.id} t={t} showGroup />
            ))}
          </ol>
        </div>
      )}

      <PersonPanel
        personId={openId}
        mainId={openId}
        homeId={homeId}
        data={people}
        onClose={() => setOpenId(null)}
        onNavigate={(id) => router.push(`/?persona=${id}`)}
        onPersonChanged={() => router.refresh()}
        onPersonDeleted={() => {
          setOpenId(null);
          router.refresh();
        }}
        onTreeData={() => router.refresh()}
      />
    </section>
  );
}
