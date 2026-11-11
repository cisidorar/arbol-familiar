import type { Metadata } from "next";
import Link from "next/link";
import LinkSelf from "@/components/LinkSelf";
import InicioSearch from "@/components/InicioSearch";
import SectionHeader from "@/components/SectionHeader";
import { requireSession } from "@/lib/auth/session";
import { getFamilyChartData } from "@/lib/data/tree";
import { getFamilyOnDates, todayInChile, type FamilyDateItem } from "@/lib/data/today";
import { getLinkedPersonId } from "@/lib/data/users";
import { getPersonFacts } from "@/lib/data/origins";
import { collectAncestors } from "@/lib/origins";
import { closeness, grandparentsOf } from "@/lib/closeness";
import { PORTADA } from "@/lib/portada-contenido";
import { nameKey, withoutTheory } from "@/lib/data/theory";
import { getPool } from "@/lib/db/pool";

export const metadata: Metadata = { title: "Inicio · Archivo Zamora Balcázar" };
export const dynamic = "force-dynamic";

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

function sentence(it: FamilyDateItem, selfId?: string | null) {
  const date = <span className="sr-only"> (el {it.day} de {MONTH_FULL[it.month - 1]})</span>;
  const people = <Names people={it.people} />;
  const place = it.place ? ` en ${shortPlace(it.place)}` : "";
  switch (it.kind) {
    case "cumple":
      if (selfId && it.people.length === 1 && it.people[0].id === selfId) return <>Tu cumpleaños: cumples {plural(it.years, "año", "años")}{date}</>;
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

function DateRow({ it, today, i, far = false, selfId, forceShow = false }: { it: FamilyDateItem; today: boolean; i: number; far?: boolean; selfId?: string | null; forceShow?: boolean }) {
  const when = it.inDays === 0 ? "Hoy" : it.inDays === 1 ? "Mañana" : `En ${it.inDays} días`;
  return (
    <li className={`${i >= 4 && !forceShow ? "hidden" : "flex"} items-center gap-4 relative rounded-2xl border-2 bg-white p-4 hover:border-ink ${today ? "border-ink" : "border-line"}`}>
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
        <p className="zb-texto">{sentence(it, selfId)}</p>
      </div>
    </li>
  );
}

export default async function InicioPage() {
  const session = await requireSession();
  const treeId = session.treeId;
  const today = todayInChile();
  const [chart, selfId, allItems, facts, recentRows] = await Promise.all([
    getFamilyChartData(treeId),
    getLinkedPersonId(session.user.id),
    getFamilyOnDates(treeId, today, 30),
    getPersonFacts(treeId),
    // Quiénes se sumaron al archivo en el último mes (para "Novedades").
    getPool()
      .query(`select id from persons where tree_id = $1 and created_at > now() - interval '30 days' order by created_at desc`, [treeId])
      .then((r) => r.rows.map((x) => x.id as string))
      .catch(() => [] as string[]),
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
  // Teoría (arriba de un vínculo sin confirmar): se ve en el árbol, pero aquí no se cuenta como hecho, ni en las
  // cifras de la línea directa, ni en las novedades.
  const theoryIds = new Set(chart.filter((c) => c.data.theory).map((c) => c.id));
  const theoryNames = new Set(chart.filter((c) => c.data.theory).map((c) => nameKey(c.data.label)));

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
  // quedan menos de 3, se completa con familia extendida de las próximas cuatro semanas. Los cumpleaños de
  // personas vivas son solo de la familia cercana.
  const close = allItems.filter(isClose);
  const far = close.length >= 3 ? [] : allItems.filter((i) => !isClose(i) && i.kind !== "cumple" && i.inDays < 30).slice(0, 3 - close.length);
  const farSet = new Set(far);
  const items = [...close, ...far].sort((a, b) => a.inDays - b.inDays);
  const todayItems = items.filter((i) => i.inDays === 0);
  // Entre las fechas que vienen, no más de 2 fallecimientos: seis seguidas con tres muertes pesan.
  let deaths = 0;
  const soon = items
    .filter((i) => i.inDays > 0)
    .filter((i) => i.kind !== "muere" || ++deaths <= 2)
    .slice(0, 12);

  // Tus cuatro ramas: por cada abuelo/a, cuánto conocemos hacia atrás.
  type Rama = { id: string; name: string; count: number; gens: number; oldest: { name: string; year: number; place: string | null } | null };
  const direct = me
    ? collectAncestors(me.id, chart.map((c) => ({ id: c.id, data: c.data, rels: c.rels })), facts).filter((a) => !a.lateral && !theoryIds.has(a.id))
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
        for (const id of frontier) for (const par of byId.get(id)?.rels.parents ?? []) if (!seen.has(par) && !theoryIds.has(par)) { seen.set(par, (seen.get(id) ?? 0) + 1); next.push(par); }
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

  const minBirth = direct.length ? Math.min(...direct.map((a) => byId.get(a.id)?.birth ?? Infinity)) : Infinity;

  // Tu línea en una frase: cuántos antepasados y desde cuándo.
  // El año más antiguo sale de las ramas (que recorren todos los padres) y de la línea directa: el menor de los dos.
  const ramaYears = ramas.map((r) => r.oldest?.year).filter((y): y is number => typeof y === "number");
  const oldestAll = Math.min(minBirth, ...ramaYears);
  const oldestYear = Number.isFinite(oldestAll) ? oldestAll : null;
  const knownRamas = ramas.filter((r) => r.count > 0);
  const emptyRamas = ramas.filter((r) => r.count === 0);

  // Novedades: quién se sumó este mes, primero los de tu línea directa.
  const directSet = new Set(direct.map((a) => a.id));
  const relOf = new Map(direct.map((a) => [a.id, a.relation]));
  const recentConfirmed = recentRows.filter((id) => !theoryIds.has(id));
  const recentMineAll = recentConfirmed.filter((id) => directSet.has(id));
  const recentMine = recentMineAll.slice(0, 4);
  const recentMineRest = recentMineAll.length - recentMine.length;
  // "tu bisabuelo" ayuda; "tu antepasado de la generación 12" no: para esos se dice cuántas generaciones atrás.
  const shortRel = (id: string) => {
    const r = relOf.get(id);
    return r && !/generaci/.test(r) ? `tu ${r}` : null;
  };
  const recentGens = recentMineAll.map((id) => direct.find((a) => a.id === id)?.generation ?? 0).filter(Boolean);
  const hallazgos = withoutTheory(PORTADA.hallazgos, theoryNames).slice(0, 2);

  return (
    <div className="zb album min-h-screen text-ink [color-scheme:light]">
      <SectionHeader current="inicio" hideSearch />

      <header className="relative">
        <div className="mx-auto grid max-w-[88rem] gap-10 px-4 pb-8 pt-8 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-start lg:gap-14 lg:pb-12 lg:pt-12">
          <div>
            <h1 className="font-slab text-[2.75rem] font-bold leading-[1.05] sm:text-6xl">Hola, {first}.</h1>
            <p className="zb-texto mt-2 max-w-xl text-gris">
              {dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)}.{" "}
              {me && direct.length > 0
                ? `Tu familia está aquí: ${direct.length} antepasados${oldestYear ? `, desde ${oldestYear}` : ""}. Busca a alguien o recorre el árbol.`
                : "Este es el archivo de tu familia. Busca a alguien o recorre el árbol."}
            </p>

            <div className="relative z-20 mt-6 max-w-xl rounded-2xl bg-trigo p-4">
              <InicioSearch />
            </div>
            <div className="mt-4 flex max-w-xl flex-wrap items-center gap-x-5 gap-y-2">
              <Link
                href="/"
                className="group al-mueve inline-flex min-h-14 items-center justify-center gap-3 rounded-full border-4 border-burdeos bg-teja px-8 py-2 text-[1.25rem] font-bold text-adobe hover:bg-burdeos"
              >
                Ir al árbol <span aria-hidden="true" className="transition-transform duration-200 group-hover:translate-x-1">→</span>
              </Link>
              {me && (
                <Link href={`/persona/${me.id}`} className="inline-flex min-h-12 items-center px-1 py-2 text-[1.125rem] font-bold underline decoration-2 underline-offset-4 hover:text-teja">
                  Ver mi ficha
                </Link>
              )}
            </div>
          </div>

            {(todayItems.length > 0 || soon.length > 0) && (
              <section className="lg:pt-2" aria-label={todayItems.length > 0 ? "Hoy en la familia" : "Próximos 30 días en la familia"}>
                <h2 className="al-titulo al-regla">{todayItems.length > 0 ? "Hoy en la familia" : "Próximos 30 días en la familia"}</h2>
                <ul className="mt-5 grid gap-4">
                  {todayItems.map((it, i) => (
                    <DateRow key={`t${i}`} it={it} today i={i} far={farSet.has(it)} selfId={selfId} />
                  ))}
                  {soon.map((it, i) => (
                    <DateRow key={`s${i}`} it={it} today={false} i={i + todayItems.length} far={farSet.has(it)} selfId={selfId} />
                  ))}
                </ul>
                {/* En el teléfono se ven 4 y el resto queda a un toque: nada desaparece sin avisar. */}
                {todayItems.length + soon.length > 4 && (
                  <details className="group mt-4">
                    <summary className="inline-flex min-h-12 cursor-pointer list-none items-center rounded-full border-2 border-ink bg-white px-6 text-[1.125rem] font-bold [&::-webkit-details-marker]:hidden">
                      <span className="group-open:hidden">Ver las otras {todayItems.length + soon.length - 4} fechas</span>
                      <span className="hidden group-open:inline">Ocultar</span>
                    </summary>
                    <ul className="mt-4 grid gap-4">
                      {[...todayItems, ...soon].slice(4).map((it, i) => (
                        <DateRow key={`m${i}`} it={it} today={it.inDays === 0} i={0} far={farSet.has(it)} selfId={selfId} forceShow />
                      ))}
                    </ul>
                  </details>
                )}
              </section>
            )}
        </div>
      </header>

      <main className="mx-auto max-w-[88rem] space-y-12 px-4 pb-14 pt-4 sm:px-6">
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
          <section aria-label="De dónde vienes">
            <h2 className="al-titulo al-regla">De dónde vienes</h2>
            <p className="zb-texto mt-2 max-w-2xl text-gris">Una rama por cada abuelo o abuela. Toca una para abrir el árbol en esa persona.</p>
            {knownRamas.length > 0 && (
              <ul className={`mt-5 grid gap-4 sm:grid-cols-2 ${knownRamas.length >= 3 ? "lg:grid-cols-4" : ""}`}>
                {knownRamas.map((r) => (
                  <li key={r.id}>
                    <Link href={`/?persona=${r.id}`} className="block h-full rounded-2xl border-2 border-ink bg-white p-5 hover:border-teja">
                      <p className="zb-etiqueta !text-burdeos">Rama de</p>
                      <p className="mt-1 font-slab text-[1.25rem] font-bold leading-tight">{r.name}</p>
                      {/* Una marca por generación conocida: se ve de un vistazo qué tan atrás llega. */}
                      <div className="mt-3 flex flex-wrap gap-1.5" aria-hidden="true">
                        {Array.from({ length: Math.min(r.gens, 16) }, (_, i) => (
                          <span key={i} className="h-3 w-5 rounded-full bg-parra" style={{ opacity: 1 - i * 0.045 }} />
                        ))}
                      </div>
                      <p className="zb-texto mt-3">
                        {plural(r.count, "antepasado", "antepasados")} en {plural(r.gens, "generación", "generaciones")}.
                        {r.oldest ? ` Llega hasta ${r.oldest.name}, nacido en ${r.oldest.year}${r.oldest.place ? `, ${r.oldest.place}` : ""}.` : ""}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {emptyRamas.length > 0 && (
              <div className="mt-4 rounded-2xl border-2 border-dashed border-ink/50 p-5">
                <p className="zb-etiqueta !text-burdeos">Por descubrir</p>
                <p className="zb-texto mt-1">
                  De la rama de{" "}
                  {emptyRamas.map((r, i) => (
                    <span key={r.id}>
                      {i > 0 && (i === emptyRamas.length - 1 ? " y de " : ", ")}
                      <Link href={`/persona/${r.id}`} className="font-bold underline decoration-2 underline-offset-4 hover:text-teja">
                        {r.name}
                      </Link>
                    </span>
                  ))}{" "}
                  todavía no hay antepasados en el archivo. Si sabes de dónde venían sus padres, cómo se llamaban o tienes fotos o papeles, cuéntaselo a quien administra el archivo: es lo que más falta.
                </p>
              </div>
            )}
          </section>
        )}

        {(recentConfirmed.length > 0 || hallazgos.length > 0) && (
          <section aria-label="Novedades del archivo">
            <h2 className="al-titulo al-regla">Novedades del archivo</h2>
            {recentConfirmed.length > 0 && (
              <p className="zb-texto mt-3 max-w-5xl">
                Este mes se {recentConfirmed.length === 1 ? "sumó 1 persona" : `sumaron ${recentConfirmed.length} personas`} al archivo
                {recentMine.length > 0 ? (
                  <>
                    , {recentMineAll.length === 1 ? "una" : recentMineAll.length} de tu línea directa:{" "}
                    {recentMine.map((id, i) => (
                      <span key={id}>
                        {i > 0 && (i === recentMine.length - 1 && !recentMineRest ? " y " : ", ")}
                        <Link href={`/persona/${id}`} className="font-bold underline decoration-2 underline-offset-4 hover:text-teja">
                          {byId.get(id)?.label}
                        </Link>
                        {shortRel(id) ? ` (${shortRel(id)})` : ""}
                      </span>
                    ))}
                    {recentMineRest > 0 ? ` y ${plural(recentMineRest, "más", "más")}` : ""}
                    {recentGens.length && !recentMine.some((id) => shortRel(id))
                      ? `, de hace ${Math.min(...recentGens) === Math.max(...recentGens) ? Math.min(...recentGens) : `${Math.min(...recentGens)} a ${Math.max(...recentGens)}`} generaciones`
                      : ""}
                    .
                  </>
                ) : (
                  "."
                )}
              </p>
            )}
            {hallazgos.length > 0 && (
              <ul className="mt-5 grid gap-4 md:grid-cols-2">
                {hallazgos.map((h, i) => (
                  // En el teléfono, uno solo: dos historias largas seguidas empujan todo lo demás muy abajo.
                  <li key={h.titulo} className={`rounded-2xl border-2 border-line bg-white p-5 ${i > 0 ? "hidden md:block" : ""}`}>
                    <p className="font-slab text-[1.25rem] font-bold leading-tight">{h.titulo}</p>
                    <p className="zb-texto mt-2">{h.texto}</p>
                    <p className="zb-apoyo mt-3 font-bold !text-burdeos">
                      Año {h.anio} · encontrado en {h.cuando.toLowerCase()}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

      </main>

      <footer className="mx-auto max-w-[88rem] px-4 pb-10 sm:px-6">
        <div className="alero-tejas rotate-180 opacity-60" aria-hidden="true" />
        <p className="zb-apoyo mt-3 text-center">Archivo Zamora Balcázar · Hecho en familia</p>
      </footer>
    </div>
  );
}
