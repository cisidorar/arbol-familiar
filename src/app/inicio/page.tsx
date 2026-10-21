import type { Metadata } from "next";
import Link from "next/link";
import LinkSelf from "@/components/LinkSelf";
import PersonChipLink from "@/components/PersonChipLink";
import SectionHeader from "@/components/SectionHeader";
import { canAdmin } from "@/lib/auth/roles";
import { requireSession } from "@/lib/auth/session";
import { getFamilyChartData } from "@/lib/data/tree";
import { getFamilyOnDates, todayInChile, type FamilyDateItem } from "@/lib/data/today";
import { getLinkedPersonId } from "@/lib/data/users";

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
  const [chart, selfId, items] = await Promise.all([
    getFamilyChartData(treeId),
    getLinkedPersonId(session.user.id),
    getFamilyOnDates(treeId, today, 14),
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

  const shortcuts: { href: string; title: string; text: string }[] = [
    { href: "/", title: "El árbol", text: "Recorre a la familia, generación por generación." },
    { href: "/mapa", title: "De dónde vienen", text: "Las comunas donde nacieron tus antepasados." },
    { href: "/cementerios", title: "Dónde descansan", text: "Cementerios, tumbas y cómo llegar." },
    ...(canAdmin(session.role) ? [{ href: "/pendientes", title: "Pendientes", text: "Lo que falta revisar o completar." }] : []),
  ];

  return (
    <div className="zb min-h-screen bg-white text-ink [color-scheme:light]">
      <SectionHeader current="inicio" />

      <header className="bg-ink text-white">
        <div className="mx-auto max-w-5xl px-4 pb-9 pt-10 sm:px-6 lg:pb-12 lg:pt-14">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-white/70">{dateLabel}</p>
          <h1 className="mt-3 font-maquina text-[2.5rem] leading-[1.05] sm:text-6xl">Hola, {first}</h1>
          <p className="mt-4 max-w-2xl text-[1.1875rem] leading-relaxed text-white/80 sm:text-[1.375rem]">
            {todayItems.length > 0
              ? `Hoy hay ${plural(todayItems.length, "fecha", "fechas")} para recordar en la familia.`
              : "Bienvenido al archivo de la familia."}
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-12 px-4 py-10 sm:px-6 lg:py-14">
        {/* Hoy en la familia */}
        <section aria-label="Hoy en la familia">
          <div className="border-b border-line pb-3">
            <h2 className="zb-seccion">Hoy en la familia</h2>
          </div>
          {todayItems.length > 0 ? (
            <ul className="divide-y divide-line">
              {todayItems.map((it, i) => (
                <DateRow key={i} it={it} today />
              ))}
            </ul>
          ) : (
            <p className="zb-texto mt-5 text-gris">Hoy no hay fechas anotadas en la familia.</p>
          )}
          {soon.length > 0 && (
            <>
              <h3 className="zb-etiqueta mt-8">En los próximos días</h3>
              <ul className="divide-y divide-line">
                {soon.map((it, i) => (
                  <DateRow key={i} it={it} today={false} />
                ))}
              </ul>
            </>
          )}
          {todayItems.length === 0 && soon.length === 0 && (
            <p className="zb-apoyo mt-2">No hay nacimientos, matrimonios ni fallecimientos con día exacto en las próximas dos semanas.</p>
          )}
        </section>

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

        {/* Atajos */}
        <section aria-label="Ir a">
          <div className="border-b border-line pb-3">
            <h2 className="zb-seccion">Explorar</h2>
          </div>
          <ul className="mt-5 grid gap-4 sm:grid-cols-2">
            {shortcuts.map((s) => (
              <li key={s.href}>
                <Link href={s.href} className="group flex h-full items-center justify-between gap-4 rounded-3xl border-2 border-line p-5 transition hover:border-ink">
                  <span>
                    <span className="block text-[1.25rem] font-bold">{s.title}</span>
                    <span className="zb-apoyo mt-1 block">{s.text}</span>
                  </span>
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-ink text-white transition group-hover:bg-terra" aria-hidden="true">
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.2}>
                      <path d="M5 12h14m-6-6 6 6-6 6" />
                    </svg>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
