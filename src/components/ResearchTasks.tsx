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

type View = "plan" | "familysearch" | "registro_civil" | "casa";
type Kind = "familia" | "tecnico" | "aviso" | "guia";
type Flat = ResearchTask & { rank: number; group: string; unlocks: string; kind: Kind };

/** Tres niveles de prioridad sobre el orden de las ramas (de lo que más desbloquea a lo que menos). */
const TIERS = [
  { upTo: 2, label: "Empieza aquí", hint: "Lo que más abre del árbol: una sola de estas ya ayuda mucho." },
  { upTo: 5, label: "Después", hint: "Abren ramas más chicas." },
  { upTo: Infinity, label: "Si te sobra tiempo", hint: "Confirmaciones y detalles sueltos." },
];

/** Qué es cada tarea para la familia: lo investigable cuenta; lo técnico, los avisos y la guía van aparte. */
function kindOf(channel: string, groupLabel: string): Kind {
  if (channel === "app") return "tecnico";
  if (channel === "cuidado") return "aviso";
  if (/^c[oó]mo pedir/i.test(groupLabel)) return "guia"; // la guía del Registro Civil ya está en su vista y en la ayuda
  return "familia";
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const CODE = /^[A-Z0-9]{3,5}-[A-Z0-9]{3,5}$/;
const linkText = (label: string) =>
  label === "Fuente de la marca" ? "Ver el documento" : CODE.test(label) ? `Abrir registro ${label}` : label;
/** El «Para pedirlo…» se repetía en cada certificado: ahora vive una sola vez en la ayuda. */
const cleanDetail = (t: ResearchTask) => (t.channel === "registro_civil" ? t.detail.replace(/\s*Para pedirlo:[^➜]*/, "") : t.detail).trim();

function RegistroCivilGuide() {
  return (
    <div className="rounded-3xl border-2 border-line bg-white p-5">
      <p className="font-slab text-[1.25rem] font-bold">Antes de ir o pedirlo en línea</p>
      <ul className="mt-2 list-disc space-y-1 pl-6 text-[1.0625rem] leading-snug">
        <li>En línea suele pedir el RUN de la persona. Si no lo tienes (o falleció hace mucho), pide una búsqueda por nombre en una oficina.</li>
        <li>Lleva circunscripción, año y número de inscripción: salen de los índices de FamilySearch o de las fichas del árbol.</li>
        <li>También puedes llamar al 600 370 2000.</li>
      </ul>
      <p className="mt-3 flex flex-wrap gap-2">
        <a href="https://www.registrocivil.cl" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-full border-2 border-line px-4 text-base font-bold underline decoration-2 underline-offset-4">
          Registro Civil ↗
        </a>
        <a href="https://www.chileatiende.gob.cl/instituciones/registro-civil" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-full border-2 border-line px-4 text-base font-bold underline decoration-2 underline-offset-4">
          ChileAtiende ↗
        </a>
      </p>
    </div>
  );
}

function Warnings({ items }: { items: Flat[] }) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-3xl border-2 border-trigo bg-trigo/20 p-4">
      <p className="font-slab text-[1.25rem] font-bold">Para no confundirte con homónimos</p>
      <ul className="mt-2 list-disc space-y-1 pl-6 text-[1.0625rem] leading-snug">
        {items.map((w) => (
          <li key={w.id}>
            <strong>{w.title}.</strong> {w.detail}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Una ayuda que no estorba: cerrada hasta que alguien la abre. */
function Ayuda({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-3xl border-2 border-line bg-white">
      <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-3 px-5 py-2 text-[1.125rem] font-bold">
        {titulo}
        <span aria-hidden="true" className="transition-transform group-open:rotate-180">▾</span>
      </summary>
      <div className="space-y-4 px-5 pb-5">{children}</div>
    </details>
  );
}

function Card({
  t,
  showGroup,
  featured,
  checked,
  onToggle,
  reviewById,
  onOpen,
}: {
  t: Flat;
  showGroup?: boolean;
  featured?: boolean;
  checked: boolean;
  onToggle: (id: string, value: boolean) => void;
  reviewById: Record<string, ReviewTask>;
  onOpen: (personId: string) => void;
}) {
  const reviews = t.eventIds.map((id) => reviewById[id]).filter(Boolean);
  const notes = [...new Set(reviews.map((r) => r.note).filter((n): n is string => !!n))];
  const sources = new Map<string, string>();
  for (const r of reviews) if (r.source) sources.set(r.source.url, r.source.title);
  const persons = new Map<string, string>();
  for (const r of reviews) for (const p of r.people) persons.set(p.id, p.name);
  const links = [
    ...t.links.map((l) => ({ label: l.label, url: l.url })),
    ...[...sources.keys()].filter((u) => !t.links.some((l) => l.url === u)).map((u) => ({ label: "Fuente de la marca", url: u })),
  ];
  const [detail, aviso] = cleanDetail(t).split(/\s*➜\s*/);
  return (
    <li
      className={`flex gap-2 rounded-3xl border-2 bg-white p-4 ${featured ? "border-teja shadow-[0_0_0_3px_rgba(168,67,42,0.2)]" : "border-line"} ${checked ? "opacity-60" : ""}`}
    >
      {/* Zona de toque de 48 px alrededor de la casilla */}
      <label className="-m-1 flex h-12 w-12 shrink-0 cursor-pointer items-start justify-center pt-2.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onToggle(t.id, e.target.checked)}
          aria-label={`Hecho: ${t.title}`}
          className="h-6 w-6 accent-[var(--color-burdeos,#6e1f2e)]"
        />
      </label>
      <div className="min-w-0 flex-1">
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
        <p className={`${featured ? "text-[1.375rem]" : "text-[1.125rem]"} font-bold leading-snug ${checked ? "line-through" : ""}`}>{t.title}</p>
        {detail && <p className="mt-1 text-base leading-snug text-gris">{detail}</p>}
        {aviso && <p className="mt-2 rounded-xl border-l-4 border-teja bg-adobe-2 px-3.5 py-2 text-base leading-snug">{aviso}</p>}
        {notes.length > 0 && (
          <details className="group mt-2">
            <summary className="inline-flex min-h-11 cursor-pointer items-center gap-1 text-base font-bold underline decoration-2 underline-offset-4">
              Qué buscar en el documento
              <span aria-hidden="true" className="transition-transform group-open:rotate-180">▾</span>
            </summary>
            {notes.map((n) => (
              <p key={n} className="mt-1 whitespace-pre-line break-words rounded-xl border-l-4 border-trigo bg-trigo/20 px-3.5 py-2 text-base leading-snug">
                {cap(n)}
              </p>
            ))}
          </details>
        )}
        {(links.length > 0 || persons.size > 0) && (
          <p className="mt-3 flex flex-wrap items-center gap-2">
            {links.map((l) => (
              <a
                key={l.url}
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center rounded-full border-2 border-line px-4 text-base font-bold underline decoration-2 underline-offset-4"
              >
                {linkText(l.label)}
                {links.filter((x) => linkText(x.label) === linkText(l.label)).length > 1
                  ? ` ${links.filter((x) => linkText(x.label) === linkText(l.label)).indexOf(l) + 1}`
                  : ""}{" "}
                ↗
              </a>
            ))}
            {[...persons].map(([id, name]) => (
              <button key={id} type="button" onClick={() => onOpen(id)} className={buttonClass("secundario", "!min-h-11 !px-4 !py-1")}>
                Ficha de {name.split(" ")[0]}
              </button>
            ))}
          </p>
        )}
      </div>
    </li>
  );
}

/** Dos columnas; si la última queda sola, ocupa todo el ancho en vez de dejar un hueco. */
const GRID = "grid gap-3 md:grid-cols-2 md:[&>li:last-child:nth-child(odd)]:col-span-2";

/**
 * La lista de investigación: lo primero que se ve es por dónde empezar y cuánto va avanzado.
 * Vistas: todas por prioridad («Empieza aquí», «Después», «Si te sobra tiempo»), «Voy a FamilySearch»,
 * «Voy al Registro Civil» y «En casa» (preguntar a la familia o buscar en internet). Lo técnico
 * (cargar datos en la app) y los avisos de homónimos no cuentan como tareas de la familia: van en ayudas plegadas.
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

  const all: Flat[] = groups.flatMap((g) =>
    g.tasks.map((t) => ({ ...t, rank: g.rank, group: g.label, unlocks: g.unlocks, kind: kindOf(t.channel, g.label) })),
  );
  const family = all.filter((t) => t.kind === "familia");
  const tecnicas = all.filter((t) => t.kind === "tecnico");
  const warnings = all.filter((t) => t.kind === "aviso");

  const count = (pred: (t: Flat) => boolean) => family.filter((t) => !done[t.id] && pred(t)).length;
  const total = family.length;
  const left = count(() => true);
  const finished = total - left;
  const next = family.find((t) => !done[t.id]);

  const card = (t: Flat, extra?: { showGroup?: boolean; featured?: boolean }) => (
    <Card key={t.id} t={t} checked={!!done[t.id]} onToggle={toggle} reviewById={reviewById} onOpen={setOpenId} {...extra} />
  );

  const tab = (k: View, label: string, n: number) => (
    <button
      key={k}
      type="button"
      onClick={() => setView(k)}
      aria-pressed={view === k}
      className={`min-h-12 rounded-full border-2 px-5 text-[1.125rem] font-bold ${view === k ? "border-burdeos bg-burdeos text-white" : "border-line bg-white"}`}
    >
      {label} · {n}
    </button>
  );

  const fsList = family.filter((t) => t.channel === "familysearch");
  const rcList = family.filter((t) => t.channel === "registro_civil");
  const casaList = family.filter((t) => t.channel !== "familysearch" && t.channel !== "registro_civil");

  // Las ramas con alguna tarea para la familia, con solo esas tareas.
  const familyGroups = groups
    .map((g) => ({ ...g, tasks: family.filter((t) => t.rank === g.rank) }))
    .filter((g) => g.tasks.length > 0);

  return (
    <section className="mb-12" aria-labelledby="investigacion">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <h1 id="investigacion" className="zb-titulo al-regla">
          Tareas
        </h1>
        <p className="zb-texto text-gris">
          {left === 0 ? "Todo listo." : "Elige una y listo: no hace falta hacerlas todas."} Las de arriba son las que más abren del árbol.
        </p>
      </div>

      {total > 0 && (
        <div className="mt-5">
          <p className="text-[1.125rem] font-bold">
            {finished} de {total} hechas
          </p>
          <div
            role="progressbar"
            aria-label="Tareas hechas"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={finished}
            className="mt-2 h-3 max-w-xl overflow-hidden rounded-full bg-adobe-2"
          >
            <div className="h-full rounded-full bg-burdeos" style={{ width: `${(finished / total) * 100}%` }} />
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-2xl border-2 border-aviso bg-white px-4 py-3 text-[1.125rem] font-bold">
          {error}
        </p>
      )}

      {view === "plan" && next && (
        <div className="mt-6 max-w-3xl">
          <h2 className="font-slab text-[1.5rem] font-bold leading-tight">Tu siguiente tarea</h2>
          {next.unlocks && <p className="mb-3 mt-1 text-base text-gris">{next.group}: {next.unlocks}</p>}
          <ul>{card(next, { featured: true })}</ul>
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Vista">
        {tab("plan", "Todas", left)}
        {tab("familysearch", "Voy a FamilySearch", count((t) => t.channel === "familysearch"))}
        {tab("registro_civil", "Voy al Registro Civil", count((t) => t.channel === "registro_civil"))}
        {casaList.length > 0 && tab("casa", "En casa o en internet", count((t) => t.channel !== "familysearch" && t.channel !== "registro_civil"))}
      </div>

      {view === "plan" && (
        <>
          {TIERS.map((tier, i) => {
            const from = i === 0 ? 0 : TIERS[i - 1].upTo;
            const inTier = familyGroups.filter((g) => g.rank > from && g.rank <= tier.upTo);
            if (inTier.length === 0) return null;
            return (
              <div key={tier.label} className="mt-10">
                <h2 className="font-slab text-[1.75rem] font-bold leading-tight">{tier.label}</h2>
                <p className="text-base text-gris">{tier.hint}</p>
                {inTier.map((g) => {
                  const rest = g.tasks.filter((t) => !done[t.id]).length;
                  return (
                    <div key={g.rank} className="mt-5">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b-2 border-line pb-3">
                        <span className="flex h-9 min-w-9 items-center justify-center rounded-full bg-burdeos px-2 text-[1.125rem] font-bold text-white">{g.rank}</span>
                        <h3 className="font-slab text-[1.5rem] font-bold leading-tight">{g.label}</h3>
                        <span className="text-base text-gris">{rest === 0 ? "completo" : `${rest} por hacer`}</span>
                        {g.unlocks && <p className="w-full text-base text-gris">{g.unlocks}</p>}
                      </div>
                      {/* La recomendada ya se ve arriba: no se repite aquí. */}
                      {g.tasks.some((t) => t.id !== next?.id) && (
                        <ul className={`mt-4 ${GRID}`}>{g.tasks.filter((t) => t.id !== next?.id).map((t) => card(t))}</ul>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}

          <div className="mt-10 space-y-3">
            <Ayuda titulo="Cómo pedir un certificado en el Registro Civil">
              <RegistroCivilGuide />
            </Ayuda>
            {warnings.length > 0 && (
              <Ayuda titulo="Para no confundirte con homónimos">
                <Warnings items={warnings} />
              </Ayuda>
            )}
            {tecnicas.length > 0 && (
              <Ayuda titulo={`Trabajo técnico de la administración (${tecnicas.filter((t) => !done[t.id]).length})`}>
                <p className="text-base text-gris">Datos ya encontrados que falta cargar en la app. No hace falta que los haga el resto de la familia.</p>
                <ul className="grid gap-3">{tecnicas.map((t) => card(t))}</ul>
              </Ayuda>
            )}
          </div>
        </>
      )}

      {view === "familysearch" && (
        <div className="mt-6">
          <p className="zb-texto text-gris">
            Lista para el centro de historia familiar, en orden de impacto. Algunos documentos solo se ven allá; los códigos abren el registro en FamilySearch.
          </p>
          {warnings.length > 0 && (
            <div className="mt-4">
              <Warnings items={warnings} />
            </div>
          )}
          <ol className={`mt-4 ${GRID}`}>{fsList.map((t) => card(t, { showGroup: true }))}</ol>
        </div>
      )}

      {view === "registro_civil" && (
        <div className="mt-6">
          <RegistroCivilGuide />
          <ol className={`mt-4 ${GRID}`}>{rcList.map((t) => card(t, { showGroup: true }))}</ol>
        </div>
      )}

      {view === "casa" && (
        <div className="mt-6">
          <p className="zb-texto text-gris">Cosas que se resuelven preguntando a la familia o buscando en internet, sin salir de casa.</p>
          <ol className={`mt-4 ${GRID}`}>{casaList.map((t) => card(t, { showGroup: true }))}</ol>
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
