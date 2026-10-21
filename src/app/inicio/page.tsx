import type { Metadata } from "next";
import Link from "next/link";
import LinkSelf from "@/components/LinkSelf";
import PersonChipLink from "@/components/PersonChipLink";
import AncestorRoulette, { SurpriseButton, type RoulettePerson } from "@/components/AncestorRoulette";
import SectionHeader from "@/components/SectionHeader";
import { canAdmin } from "@/lib/auth/roles";
import { requireSession } from "@/lib/auth/session";
import { getFamilyChartData } from "@/lib/data/tree";
import { getFamilyOnDates, todayInChile, type FamilyDateItem } from "@/lib/data/today";
import { getLinkedPersonId } from "@/lib/data/users";
import { getPersonFacts } from "@/lib/data/origins";
import { collectAncestors } from "@/lib/origins";
import { kinshipPhrase, type GraphPerson } from "@/lib/lineage";

export const metadata: Metadata = { title: "Inicio · Archivo Zamora Balcázar" };
export const dynamic = "force-dynamic";

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const GEN_NAMES = ["Padres", "Abuelos", "Bisabuelos", "Tatarabuelos"];

function Names({ people }: { people: { id: string; name: string }[] }) {
  return (
    <>
      {people.map((p, i) => (
        <span key={p.id}>
          {i > 0 && (i === people.length - 1 ? " y " : ", ")}
          <Link href={`/persona/${p.id}`} className="underline decoration-2 underline-offset-4 hover:text-terra">
            {p.name}
          </Link>
        </span>
      ))}
    </>
  );
}

function sentence(it: FamilyDateItem) {
  const people = <Names people={it.people} />;
  const place = it.place ? ` en ${it.place}` : "";
  switch (it.kind) {
    case "cumple":
      return <>{people} cumple {plural(it.years, "año", "años")}</>;
    case "nace":
      return <>{it.years === 0 ? "Hoy nació" : `Hace ${plural(it.years, "año", "años")} nació`} {people}{place}</>;
    case "muere":
      return <>Hace {plural(it.years, "año", "años")} falleció {people}{place}</>;
    case "casan":
      return <>Hace {plural(it.years, "año", "años")} se casaron {people}{place}</>;
  }
}

function DateRow({ it, today }: { it: FamilyDateItem; today: boolean }) {
  return (
    <li className="flex items-center gap-4 py-4">
      <span
        className={`grid h-16 w-16 shrink-0 place-items-center rounded-2xl text-center leading-none ${today ? "bg-terra text-white" : "bg-[#f1efea] text-ink"}`}
        aria-hidden="true"
      >
        <span>
          <span className="block font-maquina text-[1.5rem]">{it.day}</span>
          <span className="mt-1 block text-sm font-bold uppercase tracking-wide">{MONTHS[it.month - 1]}</span>
        </span>
      </span>
      <p className="zb-texto min-w-0">{sentence(it)}</p>
    </li>
  );
}

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

  // Su línea directa: padres, abuelos, bisabuelos y tatarabuelos.
  const generations: { name: string; people: NonNullable<ReturnType<typeof byId.get>>[] }[] = [];
  if (me) {
    let frontier = [me.id];
    const seen = new Set<string>([me.id]);
    for (let g = 0; g < GEN_NAMES.length; g++) {
      const next: string[] = [];
      for (const id of frontier) for (const par of byId.get(id)?.rels.parents ?? []) if (!seen.has(par) && byId.has(par)) { seen.add(par); next.push(par); }
      if (!next.length) break;
      generations.push({ name: GEN_NAMES[g], people: next.map((id) => byId.get(id)!) });
      frontier = next;
    }
  }

  const todayItems = items.filter((i) => i.inDays === 0);
  const soon = items.filter((i) => i.inDays > 0).slice(0, 6);

  // Cuántos antepasados directos tienen lugar conocido (comuna o país).
  const direct = me
    ? collectAncestors(me.id, chart.map((c) => ({ id: c.id, data: c.data, rels: c.rels })), facts).filter((a) => !a.lateral)
    : [];
  const known = direct.filter((a) => a.origin.kind === "comuna" || a.origin.kind === "abroad").length;

  // "Te tocó": los antepasados directos con una frase corta, y uno al azar de partida.
  const minBirth = Math.min(...direct.map((a) => byId.get(a.id)?.birth ?? Infinity));
  const roulette: RoulettePerson[] = direct.map((a) => {
    const p = byId.get(a.id);
    const place = a.origin.kind === "none" ? null : a.origin.label;
    const at = place ? ` en ${place}` : "";
    const lived = p?.birth && p?.death && p.death >= p.birth ? ` y vivió ${p.death - p.birth} años` : "";
    const blurb =
      p?.birth && p.birth === minBirth
        ? `Es el antepasado más antiguo del archivo. Nació${at} en ${p.birth}${lived}.`
        : p?.birth
          ? `Nació${at} en ${p.birth}${lived}.`
          : "Todavía sabemos poco de esta persona; su ficha tiene lo que hay en el archivo.";
    return {
      id: a.id,
      name: a.name,
      rel: `Tu ${a.relation}`,
      years: p?.birth && p?.death ? `${p.birth} – ${p.death}` : p?.birth ? `n. ${p.birth}` : p?.death ? `† ${p.death}` : "",
      place,
      blurb,
    };
  });
  const startId = roulette.length ? roulette[Math.floor(Math.random() * roulette.length)].id : "";

  // La nota amarilla: el primer hecho de los próximos días, dicho con su parentesco.
  const graph: GraphPerson[] = chart.map((p) => ({ id: p.id, data: { gender: p.data.gender, label: p.data.label }, rels: p.rels }));
  const note = items[0];
  const noteYear = note ? Number(today.slice(0, 4)) - note.years : 0;
  const noteKin = note && me ? kinshipPhrase(me.id, note.people[0].id, graph)?.label.toLowerCase() ?? null : null;
  const when = note ? (note.inDays === 0 ? "hoy" : note.inDays === 1 ? "mañana" : `en ${note.inDays} días`) : "";
  const MONTH_FULL = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

  const paths: { href: string; title: string; text: string; tone: string; num: string }[] = [
    { href: "/", title: "Árbol", text: "Recorre a la familia, generación por generación.", tone: "bg-[#dfe9d6]", num: "1" },
    { href: "/mapa", title: "De dónde vienen", text: "Las comunas donde nacieron tus antepasados.", tone: "bg-[#f6dcc9]", num: "2" },
    { href: "/cementerios", title: "Dónde descansan", text: "Cementerios, tumbas y cómo llegar.", tone: "bg-[#e4e2dc]", num: "3" },
  ];

  return (
    <div className="zb min-h-screen bg-white text-ink [color-scheme:light]">
      <SectionHeader current="inicio" textSize />

      <header className="bg-ink text-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 pb-12 pt-10 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:pb-16 lg:pt-14">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-white/70">{dateLabel}</p>
            <h1 className="mt-3 font-maquina text-[2.75rem] leading-[1.05] sm:text-6xl">Hola, {first}.</h1>
            <p className="mt-4 max-w-xl text-[1.1875rem] leading-relaxed text-white/80 sm:text-[1.375rem]">
              ¿Qué quieres descubrir hoy? Elige un camino o deja que el archivo te sorprenda.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              {roulette.length > 1 ? (
                <SurpriseButton className="inline-flex min-h-12 items-center gap-2 rounded-full bg-terra px-6 text-[1.0625rem] font-bold text-white hover:bg-white hover:text-ink" />
              ) : (
                <a href="/sorpresa" className="inline-flex min-h-12 items-center gap-2 rounded-full bg-terra px-6 text-[1.0625rem] font-bold text-white hover:bg-white hover:text-ink">
                  <span aria-hidden>🎲</span> Antepasado sorpresa
                </a>
              )}
              <Link href="/" className="inline-flex min-h-12 items-center rounded-full border-2 border-white/80 px-6 text-[1.0625rem] font-bold text-white hover:bg-white hover:text-ink">
                Ver mi árbol
              </Link>
            </div>
          </div>

          {note && (
            <aside aria-label="Esta semana en la familia" className="relative mx-auto w-full max-w-md rotate-[1.5deg] bg-[#fbe58a] p-6 pt-8 text-ink shadow-[0_14px_30px_rgba(0,0,0,0.35)] lg:ml-auto">
              <span aria-hidden className="absolute -top-3 left-1/2 h-6 w-24 -translate-x-1/2 -rotate-2 bg-white/50" />
              <p className="text-sm font-bold uppercase tracking-[0.14em] text-ink/70">Esta semana en la familia</p>
              <p className="mt-3 font-maquina text-[1.375rem] leading-snug">
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
              <Link href={`/persona/${note.people[0].id}`} className="mt-4 inline-block font-bold underline decoration-2 underline-offset-4 hover:text-terra">
                Ver su ficha →
              </Link>
            </aside>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-14 px-4 py-10 sm:px-6 lg:py-14">
        {roulette.length > 1 && <AncestorRoulette people={roulette} initialId={startId} />}

        {/* Elige tu camino */}
        <section aria-label="Elige tu camino">
          <h2 className="zb-seccion">Elige tu camino</h2>
          <ul className="mt-5 grid gap-4 md:grid-cols-3">
            {paths.map((c) => (
              <li key={c.href}>
                <Link href={c.href} className={`group flex h-full min-h-44 flex-col justify-between rounded-3xl p-6 transition hover:-translate-y-0.5 hover:shadow-lg ${c.tone}`}>
                  <span className="font-maquina text-[2.25rem] leading-none text-ink/50">{c.num}</span>
                  <span>
                    <span className="block text-[1.5rem] font-bold">{c.title}</span>
                    <span className="mt-1 block text-[1.0625rem] leading-snug text-ink/80">{c.text}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* Qué tanto conocemos */}
        {me && direct.length > 0 && (
          <section aria-label="Tus antepasados" className="rounded-3xl border-2 border-dashed border-ink/30 p-6 sm:p-8">
            <h2 className="zb-seccion">
              Ya conocemos {known} de tus {direct.length} antepasados directos
            </h2>
            <p className="zb-apoyo mt-2">Cada punto es un antepasado; los de color tienen un lugar de origen conocido.</p>
            <ul className="mt-5 flex flex-wrap gap-2" aria-hidden="true">
              {[...direct]
                .sort((a, b) => a.generation - b.generation)
                .map((a) => (
                  <li key={a.id} className={`h-5 w-5 rounded-full ${a.origin.kind === "comuna" || a.origin.kind === "abroad" ? "bg-terra" : "bg-ink/15"}`} />
                ))}
            </ul>
          </section>
        )}

        {/* Fechas */}
        {(todayItems.length > 0 || soon.length > 0) && (
          <section aria-label="Hoy en la familia">
            <div className="border-b border-line pb-3">
              <h2 className="zb-seccion">{todayItems.length > 0 ? "Hoy en la familia" : "En los próximos días"}</h2>
            </div>
            <ul className="divide-y divide-line">
              {todayItems.map((it, i) => (
                <DateRow key={`t${i}`} it={it} today />
              ))}
              {soon.map((it, i) => (
                <DateRow key={`s${i}`} it={it} today={false} />
              ))}
            </ul>
          </section>
        )}

        {/* Su línea directa, o preguntar quién es */}
        {me ? (
          <section aria-label="Tu línea directa">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-3">
              <h2 className="zb-seccion">Tu línea directa</h2>
              <Link href="/mapa" className="font-bold underline decoration-2 underline-offset-4 hover:text-terra">
                Ver de dónde vienen →
              </Link>
            </div>
            {generations.length === 0 ? (
              <p className="zb-texto mt-5 text-gris">Todavía no hay padres anotados para {me.label.split(" ")[0]}.</p>
            ) : (
              <div className="mt-5 space-y-6">
                {generations.map((g) => (
                  <div key={g.name}>
                    <h3 className="zb-etiqueta">{g.name}</h3>
                    <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                      {g.people.map((p) => (
                        <li key={p.id}>
                          <PersonChipLink p={p} />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-5">
              <Link href={`/persona/${me.id}`} className="font-bold underline decoration-2 underline-offset-4 hover:text-terra">
                Ver tu ficha →
              </Link>
            </p>
          </section>
        ) : (
          <section aria-label="¿Quién eres en el árbol?" className="rounded-3xl bg-[#f1efea] p-6 sm:p-8">
            <h2 className="zb-seccion">¿Quién eres en el árbol?</h2>
            <p className="zb-texto mt-3 max-w-2xl text-gris">
              Búscate por tu nombre. Así el archivo puede decirte qué parentesco tienes con cada persona y mostrarte tu propia línea de antepasados.
            </p>
            <div className="mt-5 max-w-lg">
              <LinkSelf />
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
