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
import { closeness, grandparentsOf } from "@/lib/closeness";

export const metadata: Metadata = { title: "Inicio · Archivo Zamora Balcázar" };
export const dynamic = "force-dynamic";

const randomItem = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)];
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MONTH_FULL = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
/** "Inmaculada Concepción, Maipo, Buin, Maipo, Chile" → "Inmaculada Concepción, Maipo, Buin": sin repetidos y sin el país. */
const shortPlace = (label: string) => {
  const parts = [...new Set(label.split(",").map((p) => p.trim()).filter(Boolean))];
  return (parts.length > 1 ? parts.filter((p) => p.toLowerCase() !== "chile") : parts).join(", ");
};

function Names({ people }: { people: { id: string; name: string }[] }) {
  return (
    <>
      {people.map((p, i) => (
        <span key={p.id}>
          {i > 0 && (i === people.length - 1 ? " y " : ", ")}
          <Link href={`/persona/${p.id}`} className="relative z-10 py-3 underline decoration-2 underline-offset-4 hover:text-teja">
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
  const place = it.place ? ` en ${shortPlace(it.place)}` : "";
  switch (it.kind) {
    case "cumple":
      return <>{people} cumple {plural(it.years, "año", "años")}{date}</>;
    case "nace":
      return <>{it.years === 0 ? "Hoy nació" : `Hace ${plural(it.years, "año", "años")} nació`} {people}{place}{date}</>;
    case "muere":
      return <>Recordamos a {people}, que falleció hace {plural(it.years, "año", "años")}{place}{date}</>;
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

function DateRow({ it, today, i, far = false }: { it: FamilyDateItem; today: boolean; i: number; far?: boolean }) {
  const when = it.inDays === 0 ? "Hoy" : it.inDays === 1 ? "Mañana" : `En ${it.inDays} días`;
  return (
    // Una conmemoración (fallecimiento) va derecha y sin giro: se recuerda, no se celebra.
    <li className={`${i >= 3 ? "hidden md:flex" : "flex"} items-center gap-4 relative rounded-2xl border-2 bg-white p-4 hover:border-ink ${today ? "border-ink" : "border-line"} ${it.kind === "muere" ? "" : i % 2 ? "rotate-[0.5deg]" : "-rotate-[0.5deg]"}`}>
      <span
        className={`grid h-[4.5rem] w-[4.5rem] shrink-0 place-items-center rounded-full border-4 border-double border-adobe text-center leading-none ${TILE[it.kind]}`}
        aria-hidden="true"
      >
        <span>
          <span className="block font-maquina text-[1.25rem]">{it.day}</span>
          <span className="block text-base font-bold uppercase">{MONTHS[it.month - 1]}</span>
        </span>
      </span>
      {/* Toda la tarjeta es tocable; los nombres siguen siendo enlaces propios. */}
      <Link href={`/persona/${it.people[0].id}`} tabIndex={-1} aria-hidden="true" className="absolute inset-0 rounded-2xl" />
      <div className="min-w-0">
        <p className="zb-apoyo font-bold !text-burdeos">
          {when}
          {far && <span className="font-normal !text-gris"> · familia extendida</span>}
        </p>
        <p className="zb-texto">{sentence(it)}</p>
      </div>
    </li>
  );
}

export default async function InicioPage() {
  const session = await requireSession();
  const treeId = session.treeId;
  const today = todayInChile();
  const [chart, selfId, allItems, facts] = await Promise.all([
    getFamilyChartData(treeId),
    getLinkedPersonId(session.user.id),
    getFamilyOnDates(treeId, today, 30),
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

  // Con 400 personas, las fechas parten por la familia cercana: línea directa y parientes cercanos de quien mira.
  // Sin vínculo con el árbol (todavía no dice quién es), se muestran todas.
  const closePeople = selfId
    ? new Map(chart.map((c) => [c.id, { id: c.id, rels: { parents: c.rels.parents ?? [], children: c.rels.children ?? [], spouses: c.rels.spouses ?? [] } }]))
    : null;
  const isClose = (it: FamilyDateItem) =>
    !closePeople || !selfId || it.people.some((p) => {
      const c = closeness(closePeople, selfId, p.id);
      return c != null && c.level !== "otro";
    });
  // La familia cercana tiene pocas fechas exactas (unas 2 cada dos semanas): se mira un mes adelante y, si
  // quedan menos de 3, se completa con familia extendida de las próximas dos semanas. Los cumpleaños de
  // personas vivas son solo de la familia cercana.
  const close = allItems.filter(isClose);
  const far = close.length >= 3 ? [] : allItems.filter((i) => !isClose(i) && i.kind !== "cumple" && i.inDays < 14).slice(0, 3 - close.length);
  const farSet = new Set(far);
  const items = [...close, ...far].sort((a, b) => a.inDays - b.inDays);
  const todayItems = items.filter((i) => i.inDays === 0);
  // Entre las fechas que vienen, no más de 2 fallecimientos: seis seguidas con tres muertes pesan.
  let deaths = 0;
  const soon = items
    .filter((i) => i.inDays > 0)
    .filter((i) => i.kind !== "muere" || ++deaths <= 2)
    .slice(0, 6);

  // Tus cuatro ramas: por cada abuelo/a, cuánto conocemos hacia atrás.
  type Rama = { id: string; name: string; count: number; gens: number; oldest: { name: string; year: number; place: string | null } | null };
  const direct = me
    ? collectAncestors(me.id, chart.map((c) => ({ id: c.id, data: c.data, rels: c.rels })), facts).filter((a) => !a.lateral)
    : [];
  const originOf = new Map(direct.map((a) => [a.id, a.origin]));
  const ramas: Rama[] = [];
  if (me) {
    const gmap = new Map(chart.map((c) => [c.id, { id: c.id, rels: { parents: c.rels.parents ?? [], children: c.rels.children ?? [], spouses: c.rels.spouses ?? [] } }]));
    for (const gid of grandparentsOf(gmap, me.id)) {
      const seen = new Map<string, number>([[gid, 0]]);
      let frontier = [gid];
      let gens = 0;
      while (frontier.length) {
        const next: string[] = [];
        for (const id of frontier) for (const par of byId.get(id)?.rels.parents ?? []) if (!seen.has(par)) { seen.set(par, (seen.get(id) ?? 0) + 1); next.push(par); }
        if (next.length) gens++;
        frontier = next;
      }
      let oldest: Rama["oldest"] = null;
      for (const id of seen.keys()) {
        const q = byId.get(id);
        if (q?.birth && (!oldest || q.birth < oldest.year)) {
          const o = originOf.get(id);
          oldest = { name: q.label, year: q.birth, place: o && o.kind !== "none" ? shortPlace(o.label) : null };
        }
      }
      ramas.push({ id: gid, name: byId.get(gid)?.label ?? "", count: seen.size - 1, gens, oldest });
    }
  }

  // "Te tocó": los antepasados directos con una frase corta, y uno al azar de partida.
  const minBirth = direct.length ? Math.min(...direct.map((a) => byId.get(a.id)?.birth ?? Infinity)) : Infinity;
  const roulette: RoulettePerson[] = direct.filter((a) => byId.get(a.id)?.birth).map((a) => {
    const p = byId.get(a.id);
    const place = a.origin.kind === "none" ? null : shortPlace(a.origin.label);
    const lived = p?.birth && p?.death && p.death > p.birth ? `Vivió ${p.death - p.birth} años.` : "";
    const kids = byId.get(a.id)?.rels.children.length ?? 0;
    const onlyChild = kids === 1 ? byId.get(byId.get(a.id)!.rels.children[0])?.gender : null;
    const kidsText = kids > 1 ? `Tuvo ${kids} hijos.` : kids === 1 ? `Tuvo ${onlyChild === "F" ? "una hija" : onlyChild === "M" ? "un hijo" : "un hijo o una hija"}.` : "";
    // El sello ya dice quién es, dónde y cuándo nació: el párrafo suma solo lo que el sello no dice.
    const oldest = p?.birth && p.birth === minBirth ? "Es el antepasado más antiguo del archivo." : "";
    const blurb = [oldest, lived, kidsText].filter(Boolean).join(" ") || "Una persona de tu familia. Conoce su historia.";
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

  return (
    <div className="zb album min-h-screen text-ink [color-scheme:light]">
      <SectionHeader current="inicio" hideSearch />

      <header className="relative">
        {/* Las decoraciones (parra y sello) van en su propia capa recortada: el desplegable del buscador no debe cortarse. */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
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
        </div>
        <div className="relative mx-auto grid max-w-6xl gap-10 px-4 pb-10 pt-8 sm:px-6 lg:pb-14 lg:pt-10">
          <div>
            <p className="zb-etiqueta !text-burdeos capitalize">{dateLabel}</p>
            <h1 className="mt-2 font-slab text-[2.75rem] font-bold leading-[1.05] sm:text-6xl">Hola, {first}.</h1>
            <p className="zb-texto mt-2 max-w-xl text-gris">Este es el archivo de tu familia. Busca a alguien, recorre el árbol o mira dónde descansan.</p>

            <Link
              href="/"
              className="group al-mueve mt-7 flex min-h-14 w-full max-w-xl items-center justify-center gap-3 rounded-full border-4 border-burdeos bg-teja px-8 py-3 text-[1.375rem] font-bold text-adobe hover:bg-burdeos sm:min-h-16 sm:w-auto sm:px-10 sm:text-[1.5rem]"
            >
              Ir al árbol <span aria-hidden="true" className="transition-transform duration-200 group-hover:translate-x-1">→</span>
            </Link>

            <div className="relative z-20 mt-6 max-w-xl rounded-2xl bg-trigo p-4">
              <InicioSearch />
            </div>
            {me && (
              <Link href={`/persona/${me.id}`} className="mt-3 inline-flex min-h-12 items-center px-1 py-2 text-[1.125rem] font-bold underline decoration-2 underline-offset-4 hover:text-teja">
                Ver mi ficha
              </Link>
            )}
          </div>

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

                {me && ramas.length > 0 && (
          <section aria-label="Tus cuatro ramas">
            <h2 className="al-titulo al-regla">De dónde vienes</h2>
            <p className="zb-texto mt-2 max-w-2xl text-gris">Una rama por cada abuelo o abuela. Toca una para abrir el árbol en esa persona.</p>
            <ul className="mt-5 grid gap-4 sm:grid-cols-2">
              {ramas.map((r) => (
                <li key={r.id}>
                  <Link href={`/?persona=${r.id}`} className="block h-full rounded-2xl border-2 border-ink bg-white p-5 hover:border-teja">
                    <p className="zb-etiqueta !text-burdeos">Rama de</p>
                    <p className="mt-1 font-slab text-[1.375rem] font-bold leading-tight">{r.name}</p>
                    {r.count > 0 && r.oldest ? (
                      <p className="zb-texto mt-2">
                        {plural(r.count, "antepasado conocido", "antepasados conocidos")} en {plural(r.gens, "generación", "generaciones")}. El más antiguo, {r.oldest.name}, nació en {r.oldest.year}
                        {r.oldest.place ? ` (${r.oldest.place})` : ""}.
                      </p>
                    ) : (
                      <p className="zb-texto mt-2 text-gris">Rama por descubrir. ¿Sabes algo de esta familia?</p>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Fechas */}
        {(todayItems.length > 0 || soon.length > 0) && (
          <section aria-label={todayItems.length > 0 ? "Hoy en la familia" : "Este mes en la familia"}>
            <h2 className="al-titulo al-regla">{todayItems.length > 0 ? "Hoy en la familia" : "Este mes en la familia"}</h2>
            <ul className="mt-5 grid gap-4 md:grid-cols-2">
              {todayItems.map((it, i) => (
                <DateRow key={`t${i}`} it={it} today i={i} far={farSet.has(it)} />
              ))}
              {soon.map((it, i) => (
                <DateRow key={`s${i}`} it={it} today={false} i={i + todayItems.length} far={farSet.has(it)} />
              ))}
            </ul>
          </section>
        )}

        {roulette.length > 1 && <AncestorRoulette people={roulette} initialId={startId} />}
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-10 sm:px-6">
        <div className="alero-tejas rotate-180 opacity-60" aria-hidden="true" />
        <p className="zb-apoyo mt-3 text-center">Archivo Zamora Balcázar · Hecho en familia</p>
      </footer>
    </div>
  );
}
