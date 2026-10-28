import type { ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import LinkSelf from "@/components/LinkSelf";
import InicioSearch from "@/components/InicioSearch";
import AncestorRoulette, { type RoulettePerson } from "@/components/AncestorRoulette";
import SectionHeader from "@/components/SectionHeader";
import { requireSession } from "@/lib/auth/session";
import { getFamilyChartData } from "@/lib/data/tree";
import { getFamilyOnDates, todayInChile, type FamilyDateItem } from "@/lib/data/today";
import { getLinkedPersonId } from "@/lib/data/users";
import { getPersonFacts } from "@/lib/data/origins";
import { collectAncestors } from "@/lib/origins";
import { kinshipPhrase, type GraphPerson } from "@/lib/lineage";

export const metadata: Metadata = { title: "Inicio · Archivo Zamora Balcázar" };
export const dynamic = "force-dynamic";

const randomItem = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)];
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MONTH_FULL = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function Names({ people }: { people: { id: string; name: string }[] }) {
  return (
    <>
      {people.map((p, i) => (
        <span key={p.id}>
          {i > 0 && (i === people.length - 1 ? " y " : ", ")}
          <Link href={`/persona/${p.id}`} className="underline decoration-2 underline-offset-4 hover:text-teja">
            {p.name}
          </Link>
        </span>
      ))}
    </>
  );
}

function sentence(it: FamilyDateItem) {
  const date = <span className="sr-only"> (el {it.day} de {MONTH_FULL[it.month - 1]})</span>;
  const people = <Names people={it.people} />;
  const place = it.place ? ` en ${it.place}` : "";
  switch (it.kind) {
    case "cumple":
      return <>{people} cumple {plural(it.years, "año", "años")}{date}</>;
    case "nace":
      return <>{it.years === 0 ? "Hoy nació" : `Hace ${plural(it.years, "año", "años")} nació`} {people}{place}{date}</>;
    case "muere":
      return <>Hace {plural(it.years, "año", "años")} falleció {people}{place}{date}</>;
    case "casan":
      return <>Hace {plural(it.years, "año", "años")} se casaron {people}{place}{date}</>;
  }
}

const TILE: Record<FamilyDateItem["kind"], string> = {
  cumple: "bg-trigo text-ink",
  nace: "bg-parra text-adobe",
  muere: "bg-burdeos text-adobe",
  casan: "bg-teja text-adobe",
};

function DateRow({ it, today, i }: { it: FamilyDateItem; today: boolean; i: number }) {
  return (
    <li className={`flex items-center gap-4 rounded-2xl border-2 bg-white p-4 ${today ? "border-ink" : "border-line"} ${i % 2 ? "rotate-[0.5deg]" : "-rotate-[0.5deg]"}`}>
      <span
        className={`grid h-[4.5rem] w-[4.5rem] shrink-0 place-items-center rounded-full border-4 border-double border-adobe text-center leading-none ${TILE[it.kind]}`}
        aria-hidden="true"
      >
        <span>
          <span className="block font-maquina text-[1.25rem]">{it.day}</span>
          <span className="block text-base font-bold uppercase">{MONTHS[it.month - 1]}</span>
        </span>
      </span>
      <p className="zb-texto min-w-0">{today && <strong>Hoy: </strong>}{sentence(it)}</p>
    </li>
  );
}

const PATHS: { href: string; title: string; text: string; tone: string; num: string; icon: ReactNode }[] = [
  {
    href: "/",
    title: "Árbol",
    text: "Recorre a la familia, generación por generación.",
    tone: "bg-teja text-adobe",
    num: "N.º 1",
    icon: <path d="M12 21V9m0 4-5-4m5 1 5-4M12 9V3m0 0-3 3m3-3 3 3" />,
  },
  {
    href: "/mapa",
    title: "De dónde vienen",
    text: "Las comunas donde nacieron tus antepasados.",
    tone: "bg-parra text-adobe",
    num: "N.º 2",
    icon: <path d="M12 21s-6-5.5-6-11a6 6 0 1 1 12 0c0 5.5-6 11-6 11Zm0-8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />,
  },
  {
    href: "/cementerios",
    title: "Dónde descansan",
    text: "Cementerios, tumbas y cómo llegar.",
    tone: "bg-burdeos text-adobe",
    num: "N.º 3",
    icon: <path d="M6 21V9a6 6 0 0 1 12 0v12M3 21h18M12 8v6m-2.5-3.5h5" />,
  },
];

export default async function InicioPage() {
  const session = await requireSession();
  const treeId = session.treeId;
  const today = todayInChile();
  const [chart, selfId, items, facts] = await Promise.all([
    getFamilyChartData(treeId),
    getLinkedPersonId(session.user.id),
    getFamilyOnDates(treeId, today, 14),
    getPersonFacts(treeId),
  ]);

  const first = session.user.name.trim().split(/\s+/)[0] ?? "";
  const dateLabel = new Intl.DateTimeFormat("es-CL", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Santiago" }).format(
    new Date(`${today}T12:00:00-03:00`),
  );

  const byId = new Map(
    chart.map((c) => [
      c.id,
      { id: c.id, label: c.data.label, gender: c.data.gender, birth: c.data.birth_year ?? null, death: c.data.death_year ?? null, living: Boolean(c.data.is_living), rels: c.rels },
    ]),
  );
  const me = selfId ? byId.get(selfId) : undefined;

  const todayItems = items.filter((i) => i.inDays === 0);
  const soon = items.filter((i) => i.inDays > 0).slice(0, 6);

  // Cuántos antepasados directos tienen lugar conocido (comuna o país).
  const direct = me
    ? collectAncestors(me.id, chart.map((c) => ({ id: c.id, data: c.data, rels: c.rels })), facts).filter((a) => !a.lateral)
    : [];
  const known = direct.filter((a) => a.origin.kind === "comuna" || a.origin.kind === "abroad").length;

  // "Te tocó": los antepasados directos con una frase corta, y uno al azar de partida.
  const minBirth = Math.min(...direct.map((a) => byId.get(a.id)?.birth ?? Infinity));
  const roulette: RoulettePerson[] = direct.filter((a) => byId.get(a.id)?.birth).map((a) => {
    const p = byId.get(a.id);
    const place = a.origin.kind === "none" ? null : a.origin.label;
    const at = place ? ` en ${place}` : "";
    const lived = p?.birth && p?.death && p.death >= p.birth ? ` y vivió ${p.death - p.birth} años` : "";
    const blurb =
      p?.birth && p.birth === minBirth
        ? `Es el antepasado más antiguo del archivo. Nació${at} en ${p.birth}${lived}.`
        : `Nació${at} en ${p?.birth}${lived}.`;
    return {
      id: a.id,
      name: a.name,
      rel: `Tu ${a.relation}`,
      years: p?.death ? `${p.birth} – ${p.death}` : `nació ${p?.birth}`,
      place,
      blurb,
    };
  });
  const startId = roulette.length ? randomItem(roulette).id : "";

  // La nota amarilla: el primer hecho de los próximos días, dicho con su parentesco.
  const graph: GraphPerson[] = chart.map((p) => ({ id: p.id, data: { gender: p.data.gender, label: p.data.label }, rels: p.rels }));
  const note = items[0];
  const noteYear = note ? Number(today.slice(0, 4)) - note.years : 0;
  const noteKin = note && me ? kinshipPhrase(me.id, note.people[0].id, graph)?.label.toLowerCase() ?? null : null;
  const when = note ? (note.inDays === 0 ? "hoy" : note.inDays === 1 ? "mañana" : `en ${note.inDays} días`) : "";

  const knownLabel = `${known} con lugar de origen conocido y ${direct.length - known} sin lugar todavía.`;

  return (
    <div className="zb album min-h-screen text-ink [color-scheme:light]">
      <SectionHeader current="inicio" />

      <header className="relative overflow-hidden">
        <svg aria-hidden="true" viewBox="0 0 120 320" className="pointer-events-none absolute -right-4 top-0 h-72 w-24 text-parra opacity-25 sm:right-4 sm:h-80 sm:w-28">
          <path d="M60 320C60 240 30 220 50 150S90 80 60 0" fill="none" stroke="currentColor" strokeWidth="4" />
          {[40, 90, 140, 190, 240].map((y, i) => (
            <path key={y} d={i % 2 ? "M62 0c24 6 36 24 30 44-24-4-34-20-30-44Z" : "M58 0c-24 6-36 24-30 44 24-4 34-20 30-44Z"} transform={`translate(0 ${y})`} fill="currentColor" />
          ))}
          <circle cx="86" cy="262" r="9" fill="currentColor" />
          <circle cx="76" cy="280" r="9" fill="currentColor" />
          <circle cx="92" cy="282" r="9" fill="currentColor" />
        </svg>

        <svg aria-hidden="true" viewBox="0 0 100 100" className="sello-redondo pointer-events-none absolute left-[58%] top-6 hidden h-28 w-28 -rotate-12 opacity-25 lg:block">
          <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeWidth="3" />
          <circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" />
          <path d="M50 72V46m0 6-10-8m10 5 10-8M50 46V30m0 0-6 6m6-6 6 6" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div className="relative mx-auto grid max-w-6xl gap-10 px-4 pb-10 pt-8 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:pb-14 lg:pt-10">
          <div>
            <p className="zb-etiqueta !text-burdeos capitalize">{dateLabel}</p>
            <h1 className="mt-2 font-slab text-[2.75rem] font-bold leading-[1.05] sm:text-6xl">Hola, {first}.</h1>

            <Link
              href="/"
              className="group al-mueve mt-7 flex min-h-14 w-full max-w-xl items-center justify-center gap-3 rounded-full border-4 border-burdeos bg-teja px-8 py-3 text-[1.375rem] font-bold text-adobe hover:bg-burdeos sm:min-h-16 sm:w-auto sm:px-10 sm:text-[1.5rem]"
            >
              Ir al árbol <span aria-hidden="true" className="transition-transform duration-200 group-hover:translate-x-1">→</span>
            </Link>

            <div className="mt-6 max-w-xl rounded-2xl bg-trigo p-4">
              <InicioSearch />
            </div>
            {me && (
              <Link href={`/persona/${me.id}`} className="mt-3 inline-flex min-h-12 items-center px-1 py-2 text-[1.125rem] font-bold underline decoration-2 underline-offset-4 hover:text-teja">
                Mi ficha
              </Link>
            )}
          </div>

          {note && (
            <aside aria-label="Esta semana en la familia" className="relative w-full max-w-md -rotate-1 rounded-sm bg-white p-6 pt-8 shadow-[0_6px_18px_rgba(30,26,23,0.25)] lg:ml-auto">
              <span className="cinta" aria-hidden="true" />
              <h2 className="al-titulo al-regla !text-[1.5rem]">Esta semana en la familia</h2>
              <p className="zb-texto mt-3">
                {note.kind === "cumple" ? (
                  <>
                    <Names people={note.people} /> cumple {plural(note.years, "año", "años")} {when}
                  </>
                ) : (
                  <>
                    Un {note.day} de {MONTH_FULL[note.month - 1]} de {noteYear} ({when}) {note.kind === "nace" ? "nació" : note.kind === "muere" ? "falleció" : "se casaron"}{" "}
                    <Names people={note.people} />
                    {noteKin ? `, ${noteKin}` : ""}
                    {note.place ? `, en ${note.place}` : ""}.
                  </>
                )}
              </p>
              <Link href={`/persona/${note.people[0].id}`} className="mt-3 inline-flex min-h-12 items-center font-bold underline decoration-2 underline-offset-4 hover:text-teja">
                Ver su ficha →
              </Link>
            </aside>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-12 px-4 pb-14 pt-4 sm:px-6">
        {/* Primero quién eres: sin eso, el archivo no puede hablarte de tu familia. */}
        {!me && (
          <section aria-label="¿Quién eres en el árbol?" className="rounded-3xl border-2 border-ink bg-white p-6 sm:p-8">
            <h2 className="al-titulo al-regla">¿Quién eres en el árbol?</h2>
            <p className="zb-texto mt-3 max-w-2xl text-gris">
              Búscate por tu nombre. Así el archivo puede decirte qué parentesco tienes con cada persona y mostrarte tu propia línea de antepasados.
            </p>
            <div className="mt-5 max-w-lg">
              <LinkSelf />
            </div>
          </section>
        )}

        {roulette.length > 1 && <AncestorRoulette people={roulette} initialId={startId} />}

        {/* Elige tu camino */}
        <section aria-label="Elige tu camino">
          <h2 className="al-titulo al-regla">Elige tu camino</h2>
          <ul className="mt-5 grid gap-5 md:grid-cols-3">
            {PATHS.map((c) => (
              <li key={c.href}>
                <Link href={c.href} className={`sello al-mueve group flex h-full min-h-48 flex-col justify-between p-7 hover:-translate-y-1 ${c.tone}`}>
                  <span className="flex items-center justify-between">
                    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-9 w-9 fill-none stroke-current" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      {c.icon}
                    </svg>
                    <span className="font-maquina text-[1.125rem]">{c.num}</span>
                  </span>
                  <span>
                    <span className="block font-slab text-[1.625rem] font-bold leading-tight">{c.title}</span>
                    <span className="mt-1 block text-[1.125rem] leading-snug">{c.text}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* Fechas */}
        {(todayItems.length > 0 || soon.length > 0) && (
          <section aria-label="Hoy en la familia">
            <h2 className="al-titulo al-regla">{todayItems.length > 0 ? "Hoy en la familia" : "En los próximos días"}</h2>
            <ul className="mt-5 grid gap-4 md:grid-cols-2">
              {todayItems.map((it, i) => (
                <DateRow key={`t${i}`} it={it} today i={i} />
              ))}
              {soon.map((it, i) => (
                <DateRow key={`s${i}`} it={it} today={false} i={i + todayItems.length} />
              ))}
            </ul>
          </section>
        )}

        {/* Qué tanto conocemos */}
        {me && direct.length > 0 && (
          <section aria-label="Tus antepasados" className="rounded-3xl border-2 border-dashed border-ink/50 p-6 sm:p-8">
            <h2 className="al-titulo al-regla">
              Ya conocemos {known} de tus {direct.length} antepasados directos
            </h2>
            <p className="zb-texto mt-2">{knownLabel}</p>
            <ul className="mt-5 flex flex-wrap gap-2" aria-hidden="true">
              {[...direct]
                .sort((a, b) => a.generation - b.generation)
                .map((a) => (
                  <li
                    key={a.id}
                    className={`h-6 w-6 rounded-full border-2 border-parra ${a.origin.kind === "comuna" || a.origin.kind === "abroad" ? "bg-parra" : "bg-transparent"}`}
                  />
                ))}
            </ul>
            <p className="zb-apoyo mt-3">Círculo lleno: lugar conocido. Círculo vacío: todavía falta.</p>
            {known < direct.length && (
              <Link href="/pendientes" className="mt-3 inline-flex min-h-12 items-center font-bold underline decoration-2 underline-offset-4 hover:text-teja">
                Ver lo que falta →
              </Link>
            )}
          </section>
        )}
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-10 sm:px-6">
        <div className="alero-tejas rotate-180 opacity-60" aria-hidden="true" />
        <p className="zb-apoyo mt-3 text-center">Archivo Zamora Balcázar · Hecho en familia</p>
      </footer>
    </div>
  );
}
