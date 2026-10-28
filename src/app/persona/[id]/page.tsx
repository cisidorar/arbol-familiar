import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import SectionHeader from "@/components/SectionHeader";
import PersonChipLink, { sexColor, yearsText, type ChipPerson } from "@/components/PersonChipLink";
import ShareButton from "@/components/ShareButton";
import { canEdit } from "@/lib/auth/roles";
import { requireSession } from "@/lib/auth/session";
import { getFamilyChartData, getPersonDetail } from "@/lib/data/tree";
import { getLinkedPersonId } from "@/lib/data/users";
import { kinshipPhrase, type GraphPerson } from "@/lib/lineage";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  // El título solo lleva el nombre cuando hay sesión (si no, el proxy ya mandó al login).
  const { id } = await params;
  try {
    const session = await requireSession();
    const p = UUID.test(id) ? await getPersonDetail(session.treeId, id) : null;
    if (p) return { title: `${p.displayName} · Archivo Zamora Balcázar` };
  } catch {
    /* sin sesión */
  }
  return { title: "Ficha · Archivo Zamora Balcázar" };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

type Person = ChipPerson;

const years = yearsText;

function PersonLink({ p, note }: { p: Person; note?: string }) {
  return <PersonChipLink p={p} note={note} />;
}

function Group({ title, people, note }: { title: string; people: Person[]; note?: (p: Person) => string | undefined }) {
  if (!people.length) return null;
  return (
    <section aria-label={title}>
      <h3 className="zb-etiqueta">{title}</h3>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2">
        {people.map((p) => (
          <li key={p.id}>
            <PersonLink p={p} note={note?.(p)} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function PersonaPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const [detail, chart, selfId] = await Promise.all([
    getPersonDetail(session.treeId, id),
    getFamilyChartData(session.treeId),
    getLinkedPersonId(session.user.id),
  ]);
  if (!detail) notFound();

  const byId = new Map(
    chart.map((c) => [
      c.id,
      {
        id: c.id,
        label: c.data.label,
        gender: c.data.gender,
        birth: c.data.birth_year ?? null,
        death: c.data.death_year ?? null,
        living: Boolean(c.data.is_living),
        rels: c.rels,
      },
    ]),
  );
  const me = byId.get(id)!;
  const pick = (ids: string[]): Person[] => ids.flatMap((x) => (byId.has(x) ? [byId.get(x)!] : []));
  const parents = pick(me.rels.parents);
  const partners = pick(me.rels.spouses);
  const children = pick(me.rels.children).sort((a, b) => (a.birth ?? 9999) - (b.birth ?? 9999));
  const siblings = pick([...new Set(me.rels.parents.flatMap((p) => byId.get(p)?.rels.children ?? []))].filter((x) => x !== id)).sort(
    (a, b) => (a.birth ?? 9999) - (b.birth ?? 9999),
  );

  const graph: GraphPerson[] = chart.map((p) => ({ id: p.id, data: { gender: p.data.gender, label: p.data.label }, rels: p.rels }));
  const kin = selfId && selfId !== id ? kinshipPhrase(selfId, id, graph)?.label ?? null : selfId === id ? "Eres tú" : null;

  const age = me.birth && me.death ? me.death - me.birth : null;
  const status = me.living ? "Vive" : "Fallecido/a";
  // Primero los hechos con fecha; los que no la tienen van al final.
  const timeline = [...detail.timeline.filter((e) => e.year != null), ...detail.timeline.filter((e) => e.year == null)];
  const editor = canEdit(session.role);
  const color = sexColor(me.gender);

  return (
    <div className="zb album min-h-screen text-ink [color-scheme:light]">
      <SectionHeader current="arbol" />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:py-12">
        <Link href={`/?persona=${id}`} className="print:hidden inline-flex min-h-12 items-center gap-2 font-bold text-ink hover:text-teja">
          <span aria-hidden>←</span> Ver en el árbol
        </Link>

        {/* Quién es */}
        <header className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-center">
          <span aria-hidden="true" className="foto -rotate-2 shrink-0 self-start p-2.5">
            <span className="esq-a" />
            <span className="esq-b" />
            <span className="grid h-24 w-24 place-items-center bg-adobe-2 font-slab text-[3rem] font-bold" style={{ color }}>
              {me.label.trim().charAt(0).toUpperCase()}
            </span>
          </span>
          <div className="min-w-0">
            {kin && <p className="font-bold" style={{ color }}>{kin}</p>}
            <h1 className="zb-titulo mt-1">{detail.displayName}</h1>
            <p className="zb-texto mt-2 text-gris">
              {[years(me), status, age != null && age >= 0 ? `${age} años` : null].filter(Boolean).join(" · ")}
            </p>
          </div>
        </header>

        <div className="mt-6 flex flex-wrap gap-3 print:hidden">
          <ShareButton
            title={`${detail.displayName} · Archivo Zamora Balcázar`}
            text={`Mira la ficha de ${detail.displayName} en el archivo de la familia`}
            className="inline-flex min-h-12 items-center gap-2 rounded-full bg-teja px-6 text-[1.125rem] font-bold text-white hover:bg-burdeos"
          />
          <Link href={`/mapa?persona=${id}`} className="inline-flex min-h-12 items-center rounded-full border-2 border-ink bg-white px-6 text-[1.125rem] font-bold hover:bg-adobe-2">
            Mapa de sus antepasados
          </Link>
          {editor && (
            <Link href={`/?persona=${id}`} className="inline-flex min-h-12 items-center rounded-full border-2 border-line bg-white px-6 text-[1.125rem] font-bold text-gris hover:border-ink hover:text-ink">
              Editar en el árbol
            </Link>
          )}
        </div>

        {/* Línea de vida */}
        <section className="mt-10" aria-label="Línea de vida">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-3">
            <h2 className="zb-seccion">Su vida</h2>
            <p className="zb-apoyo">{plural(timeline.length, "hecho", "hechos")}</p>
          </div>
          {timeline.length === 0 ? (
            <p className="zb-texto mt-5 text-gris">Todavía no hay hechos anotados.</p>
          ) : (
            <ol className="mt-2">
              {timeline.map((e, i) => (
                <li key={i} className="grid grid-cols-[4.5rem_1fr] gap-x-4 border-b border-line py-4 last:border-b-0 sm:grid-cols-[5.5rem_1fr]">
                  <div>
                    <p
                      className={`grid h-[4.5rem] w-[4.5rem] place-items-center rounded-full border-4 border-double border-adobe font-maquina leading-tight tabular-nums ${
                        e.year == null ? "bg-adobe-2 text-base text-gris" : "bg-burdeos text-[1.25rem] text-adobe"
                      }`}
                    >
                      {e.year ?? "s. f."}
                    </p>
                    {e.yearEnd && e.yearEnd !== e.year ? <p className="mt-1 text-center text-base text-gris">a {e.yearEnd}</p> : null}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[1.0625rem] font-bold leading-snug">
                      {e.title}
                      {e.person && (
                        <>
                          {" "}
                          <Link href={`/persona/${e.person.id}`} className="underline decoration-2 underline-offset-4 hover:text-teja">
                            {e.person.name}
                          </Link>
                        </>
                      )}
                    </p>
                    <p className="zb-apoyo mt-0.5">
                      {[e.dateText && e.dateText !== String(e.year) ? e.dateText : null, e.place, e.age != null && e.age >= 0 ? `a los ${e.age} años` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {e.description && <p className="zb-texto mt-1.5">{e.description}</p>}
                    {(e.participants ?? []).length > 0 && (
                      <p className="zb-apoyo mt-1.5">
                        {(e.participants ?? []).map((p, k) => (
                          <span key={k}>
                            {k > 0 && " · "}
                            {p.role}:{" "}
                            {p.personId ? (
                              <Link href={`/persona/${p.personId}`} className="underline underline-offset-4 hover:text-teja">
                                {p.name}
                              </Link>
                            ) : (
                              p.name
                            )}
                          </span>
                        ))}
                      </p>
                    )}
                    {e.sources.length > 0 && (
                      <ul className="mt-2 flex flex-wrap gap-2 print:hidden">
                        {e.sources.map((s, k) => (
                          <li key={k}>
                            <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-adobe-2 px-3.5 text-base font-bold hover:bg-white">
                              Fuente <span aria-hidden>↗</span>
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* Familia */}
        {(parents.length > 0 || partners.length > 0 || children.length > 0 || siblings.length > 0) && (
          <section className="mt-10 space-y-6" aria-label="Familia">
            <div className="border-b border-line pb-3">
              <h2 className="zb-seccion">Su familia</h2>
            </div>
            <Group title="Padres" people={parents} />
            <Group title={partners.length > 1 ? "Parejas" : "Pareja"} people={partners} />
            <Group title={`Hijos (${children.length})`} people={children} />
            <Group title={`Hermanos (${siblings.length})`} people={siblings} />
          </section>
        )}

        {detail.notes && (
          <section className="mt-10" aria-label="Notas">
            <div className="border-b border-line pb-3">
              <h2 className="zb-seccion">Notas</h2>
            </div>
            <p className="zb-texto mt-4 whitespace-pre-line">{detail.notes}</p>
          </section>
        )}

        <p className="zb-apoyo mt-12 border-t border-line pt-4">
          {detail.edited
            ? `Editado${detail.edited.by ? ` por ${detail.edited.by}` : ""} el ${new Date(detail.edited.at).toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric" })}`
            : "Archivo Zamora Balcázar"}
        </p>
      </main>
    </div>
  );
}
