"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PersonPanel from "./PersonPanel";
import { buttonClass } from "./ui";
import type { ReviewTask } from "@/lib/data/review";
import { REVIEW_KINDS } from "@/lib/edit";
import { formatDateText } from "@/lib/gedcom/dates";

const yearsOf = (p: { birthYear: number | null; deathYear: number | null }) =>
  p.birthYear ? (p.deathYear ? `${p.birthYear}–${p.deathYear}` : `n. ${p.birthYear}`) : p.deathYear ? `† ${p.deathYear}` : null;

const isFamilySearch = (url: string) => /(^|\.)familysearch\.org(\/|$|:)/i.test(url.replace(/^https?:\/\//i, ""));

/**
 * La lista de pendientes pensada para usarla en el centro de FamilySearch, con el
 * documento delante: el enlace de la fuente a un toque, la ficha de la persona se abre
 * aquí mismo para corregirla, y «Ya lo revisé» lo saca de la lista (con «Deshacer»).
 */
export default function PendientesView({
  tasks,
  people,
  homeId,
}: {
  tasks: ReviewTask[];
  people: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  homeId: string | null;
}) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  // Los que se marcaron como revisados en esta pantalla (salen al instante, antes de que la página se actualice).
  const [done, setDone] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [undo, setUndo] = useState<ReviewTask | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function setReview(t: ReviewTask, review: string): Promise<boolean> {
    setBusy(t.eventId);
    setError(null);
    try {
      const res = await fetch(`/api/events/${t.eventId}/review`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ review }),
      });
      if (res.status === 401) {
        router.push("/login");
        return false;
      }
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        setError(json?.error ?? "No se pudo guardar.");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("No se pudo guardar: revisa tu conexión y prueba de nuevo.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function markDone(t: ReviewTask) {
    if (await setReview(t, "")) {
      setDone((s) => new Set(s).add(t.eventId));
      setUndo(t);
    }
  }

  async function undoDone(t: ReviewTask) {
    if (await setReview(t, t.kind)) {
      setDone((s) => {
        const n = new Set(s);
        n.delete(t.eventId);
        return n;
      });
      setUndo(null);
    }
  }

  const known = new Set<string>(REVIEW_KINDS.map((k) => k.key));
  const visible = tasks.filter((t) => !done.has(t.eventId));
  const groups = [
    ...REVIEW_KINDS.map((k) => ({ key: k.key as string, label: k.label as string, hint: k.hint as string, items: visible.filter((t) => t.kind === k.key) })),
    { key: "otros", label: "Otros", hint: "", items: visible.filter((t) => !known.has(t.kind)) },
  ].filter((g) => g.items.length > 0);

  return (
    // Con la ficha abierta (panel a la derecha), en pantallas anchas la lista se corre a la
    // izquierda para seguir viendo el pendiente mientras se edita.
    <div className={`mx-auto max-w-[112rem] transition-[padding] duration-300 ${openId ? "lg:pr-[41rem]" : ""}`}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <h1 className="text-3xl font-bold leading-tight">Pendientes</h1>
        <p className="zb-texto text-gris">
          {visible.length === 0
            ? "No hay nada pendiente."
            : visible.length === 1
              ? "1 documento por revisar."
              : `${visible.length} documentos por revisar.`}{" "}
          Primero los que más pueden responder. Se marcan al <strong>editar</strong> la ficha: en el hecho, elige «Pendiente».
        </p>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-2xl border-2 border-aviso bg-white px-4 py-3 text-[1.0625rem] font-bold">
          {error}
        </p>
      )}

      {groups.map((g) => (
        <section key={g.key} className="mt-8" aria-labelledby={`k-${g.key}`}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b-2 border-line pb-3">
            <span className="flex h-9 min-w-9 items-center justify-center rounded-full bg-[#e08a00] px-2 text-[1.0625rem] font-bold text-white">
              {g.items.length}
            </span>
            <h2 id={`k-${g.key}`} className="text-[1.375rem] font-bold leading-tight">
              {g.label}
            </h2>
            {g.hint && <p className="w-full text-base text-gris md:ml-auto md:w-auto">{g.hint}</p>}
          </div>
          <ul
            className={`mt-4 grid gap-4 ${
              openId ? "md:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2" : "md:grid-cols-2 2xl:grid-cols-3"
            }`}
          >
            {g.items.map((t) => {
              const when = t.dateText ? formatDateText(t.dateText) : t.year ? String(t.year) : null;
              const fs = t.source ? isFamilySearch(t.source.url) : false;
              const isOpen = t.people.some((p) => p.id === openId);
              return (
                <li
                  key={t.eventId}
                  className={`flex flex-col rounded-3xl border-2 bg-white p-4 sm:p-5 ${isOpen ? "border-[#e08a00] shadow-[0_0_0_3px_rgba(224,138,0,0.18)]" : "border-line"}`}
                >
                  <p className="mb-2 flex items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-sm font-bold uppercase tracking-wide ${
                        t.priority.level === "alta"
                          ? "bg-[#e08a00] text-white"
                          : t.priority.level === "media"
                            ? "bg-[#fff0cc] text-ink"
                            : "bg-paper text-gris"
                      }`}
                    >
                      Prioridad {t.priority.level}
                    </span>
                  </p>
                  <p className="text-[1.25rem] font-bold leading-tight">
                    {t.label}
                    {when && <span className="font-normal text-gris"> · {when}</span>}
                  </p>
                  {t.place && <p className="mt-0.5 text-[1.0625rem] text-gris">{t.place}</p>}
                  <p className="mt-2 text-[1.0625rem] leading-snug">
                    {t.people.map((p, i) => (
                      <span key={p.id}>
                        {i > 0 && " y "}
                        <strong>{p.name}</strong>
                        {yearsOf(p) && <span className="text-gris"> ({yearsOf(p)})</span>}
                      </span>
                    ))}
                  </p>

                  <p className="mt-2 text-base leading-snug text-gris">{t.priority.reason}</p>

                  {t.note && (
                    <p className="mt-3 whitespace-pre-line break-words rounded-xl border-l-4 border-[#e08a00] bg-[#fff6e0] px-3.5 py-2.5 text-base leading-snug text-gray-900">
                      {t.note}
                    </p>
                  )}

                  {t.source ? (
                    <p className="mt-3 line-clamp-2 break-words text-base text-gris" title={t.source.title}>
                      <span className="mr-1.5 rounded-md bg-paper px-1.5 py-0.5 text-sm font-bold uppercase tracking-wide text-ink">Fuente</span>
                      {t.source.title !== t.source.url ? t.source.title : "con enlace"}
                    </p>
                  ) : (
                    <p className="mt-3 rounded-2xl border-2 border-dashed border-line px-3.5 py-2.5 text-base text-gris">
                      Sin enlace todavía: agrégalo en <strong>Editar → el hecho → Fuente</strong>.
                    </p>
                  )}

                  {/* Acciones al pie, alineadas entre tarjetas de la misma fila. */}
                  <div className="mt-auto flex flex-wrap items-center gap-2.5 pt-4">
                    {t.source && (
                      <a
                        href={t.source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={buttonClass("principal", "!px-5")}
                      >
                        {fs ? "Abrir en FamilySearch" : "Abrir la fuente"}
                        <span aria-hidden="true">↗</span>
                      </a>
                    )}
                    {t.people.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setOpenId(p.id)}
                        className={buttonClass("secundario", "!px-5")}
                        title={`Abre la ficha de ${p.name} aquí mismo para corregirla con lo que veas en el documento`}
                      >
                        {t.people.length > 1 ? `Ficha de ${p.name.split(" ")[0]}` : "Editar ficha"}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => markDone(t)}
                      disabled={busy === t.eventId}
                      className={buttonClass("enlace", "ml-auto !px-1")}
                    >
                      {busy === t.eventId ? "Guardando…" : "Ya lo revisé"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {undo && (
        <div
          role="status"
          className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-md items-center justify-between gap-4 rounded-2xl bg-ink px-5 py-3 text-white shadow-[0_12px_30px_rgba(0,0,0,0.35)]"
        >
          <span className="text-[1.0625rem]">Quitado de pendientes</span>
          <span className="flex items-center gap-3">
            <button type="button" onClick={() => undoDone(undo)} className="min-h-11 px-2 text-[1.0625rem] font-bold underline decoration-2 underline-offset-4">
              Deshacer
            </button>
            <button type="button" onClick={() => setUndo(null)} aria-label="Cerrar aviso" className="min-h-11 min-w-11 text-xl">
              ×
            </button>
          </span>
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
    </div>
  );
}
