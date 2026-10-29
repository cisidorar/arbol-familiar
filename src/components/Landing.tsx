// Portada pública del archivo: lo que ve quien llega sin haber iniciado sesión.
// Pensada para un grupo chico (primos y tíos): una bienvenida cercana, los apellidos
// que sigue el archivo y lo último de la investigación. Solo antepasados fallecidos
// hace mucho y cifras generales; para ver el árbol hay que entrar con invitación.

import Link from "next/link";
import SiteBrand, { BRAND_ROW } from "./SiteBrand";
import { buttonClass } from "./ui";
import { PORTADA } from "@/lib/portada-contenido";
import type { PublicStats, PublicSurname } from "@/lib/data/public-stats";

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="font-maquina text-3xl leading-none sm:text-4xl">{value}</p>
      <p className="mt-1.5 text-base text-white/85">{label}</p>
    </div>
  );
}

/** Ficha de un apellido: cuántas personas, desde cuándo y dónde. */
function SurnameCard({ s, i }: { s: PublicSurname; i: number }) {
  const rot = ["-rotate-1", "rotate-1", "-rotate-[0.5deg]", "rotate-[1.5deg]"][i % 4];
  return (
    <div
      className={`flex h-full flex-col rounded-md bg-[#f7f4ed] px-3.5 pb-3.5 pt-3.5 text-ink shadow-[0_10px_24px_-14px_rgba(0,0,0,0.55)] ring-1 ring-black/5 sm:px-5 sm:pb-4 sm:pt-4 ${rot}`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate font-maquina text-[1.2rem] leading-none sm:text-[1.625rem]">{s.surname}</p>
        <p className="shrink-0 font-maquina text-[1.2rem] leading-none text-terra sm:text-[1.625rem]">{s.people}</p>
      </div>
      <div className="mt-2 h-px bg-terra" aria-hidden="true" />
      <p className="mt-2 text-base leading-snug text-gris">
        {s.people === 1 ? "persona" : "personas"} · desde {s.since}
        {s.place ? ` · ${s.place}` : ""}
      </p>
    </div>
  );
}

export default function Landing({ stats, surnames = [] }: { stats: PublicStats | null; surnames?: PublicSurname[] }) {
  const items = [
    stats && { value: stats.people.toLocaleString("es-CL"), label: "personas" },
    stats?.generations && { value: String(stats.generations), label: "generaciones" },
    stats?.oldestYear && { value: String(stats.oldestYear), label: "el registro más antiguo" },
  ].filter(Boolean) as { value: string; label: string }[];

  return (
    <div className="zb album min-h-screen text-ink">
      {/* Bienvenida */}
      <div className="on-dark overflow-hidden bg-burdeos text-white">
        <header className={`${BRAND_ROW} w-full gap-3`}>
          <SiteBrand />
          <Link
            href="/login"
            className="ml-auto flex min-h-12 items-center rounded-full border border-white/50 px-5 text-base font-bold text-white hover:bg-white/10"
          >
            Entrar
          </Link>
        </header>

        <main className="mx-auto grid w-full max-w-6xl gap-8 px-4 pb-16 pt-8 sm:px-6 sm:pt-12 lg:grid-cols-2 lg:items-center lg:gap-10 lg:pb-20">
          <div>
            <p className="inline-block rounded-full bg-trigo px-4 py-1.5 text-base font-bold text-ink">
              Actualizado el {PORTADA.actualizado}
            </p>
            <h1 className="mt-5 font-slab text-[3.25rem] font-bold leading-[1.02] sm:text-7xl">Hola, familia.</h1>
            <p className="mt-5 max-w-xl text-[1.1875rem] leading-relaxed text-white/90">
              Aquí vamos juntando lo que hemos encontrado de nuestros antepasados: nombres, fechas, lugares y alguna que otra historia.
            </p>
            <div className="mt-7">
              <Link
                href="/login"
                className={buttonClass("principal", "!min-h-14 !border-adobe !bg-adobe !px-9 !text-[1.25rem] !text-ink hover:!border-white hover:!bg-white focus-visible:!outline-white")}
              >
                Entrar al archivo <span aria-hidden="true">→</span>
              </Link>
              <p className="mt-4 flex max-w-md items-start gap-2 text-base font-bold text-white">
                <svg viewBox="0 0 24 24" className="mt-0.5 h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="5" y="11" width="14" height="9" rx="2" />
                  <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                </svg>
                Archivo privado: solo entra la familia, con invitación.
              </p>
              <p className="mt-2 max-w-md text-base text-white/90">Entra con el correo con el que te invitaron.</p>
              <p className="mt-1 max-w-md text-base text-white/90">¿Aún no tienes acceso? Pídeselo a quien te habló del archivo.</p>
            </div>
            {items.length > 0 && (
              <div className="mt-10 grid max-w-md grid-cols-3 gap-4 border-t border-white/15 pt-6">
                {items.map((s) => (
                  <Stat key={s.label} {...s} />
                ))}
              </div>
            )}
          </div>

          {/* Una ficha grande y legible con un hallazgo; detrás, otras dos asoman como un montón. */}
          <div className="relative mx-auto w-full max-w-[26rem] pb-4 pt-6" aria-label={`${PORTADA.destacado.tipo}: ${PORTADA.destacado.nombre}`} role="group">
            <div aria-hidden="true" className="absolute inset-x-6 top-0 h-[92%] rotate-[5deg] rounded-md bg-[#eae3d2] shadow-[0_10px_24px_-10px_rgba(0,0,0,0.6)]" />
            <div aria-hidden="true" className="absolute inset-x-3 top-2 h-[92%] -rotate-[4deg] rounded-md bg-[#efe8d9] shadow-[0_10px_24px_-10px_rgba(0,0,0,0.6)]" />
            <article className="relative -rotate-[1.5deg] rounded-md bg-[#f7f4ed] p-6 pb-7 text-ink shadow-[0_28px_44px_-14px_rgba(0,0,0,0.8)] sm:p-8">
              <span aria-hidden="true" className="absolute -top-3 left-1/2 h-7 w-28 -translate-x-1/2 rotate-[-2deg] bg-trigo/90" />
              <p className="flex items-center justify-between font-maquina text-base uppercase tracking-[0.1em] text-gris">
                <span>{PORTADA.destacado.tipo}</span>
                <span>{PORTADA.destacado.lugar}</span>
              </p>
              <div className="mt-2 h-px bg-terra" aria-hidden="true" />
              <h2 className="mt-4 font-maquina text-[1.875rem] leading-tight sm:text-[2.25rem]">{PORTADA.destacado.nombre}</h2>
              <p className="mt-3 text-[1.1875rem] leading-relaxed">{PORTADA.destacado.frase}</p>
              <p className="mt-4 text-base text-gris">Así de difícil es a veces encontrar a nuestros antepasados.</p>
            </article>
          </div>
        </main>
      </div>
      <div className="alero-tejas [--tj:var(--color-burdeos)]" aria-hidden="true" />

      {/* Apellidos */}
      {surnames.length > 0 && (
        <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-20">
          <h2 className="al-titulo al-regla !text-[1.75rem] sm:!text-4xl">Nuestros apellidos</h2>
          <p className="mt-3 max-w-2xl text-lg text-gris">Las ramas que vamos siguiendo y cuántas personas tiene cada una en el archivo.</p>
          <ul className="mt-10 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
            {surnames.map((s, i) => (
              <li key={s.surname}>
                <SurnameCard s={s} i={i} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Lo último que encontramos */}
      <section className="bg-adobe-2">
        <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-20">
          <h2 className="al-titulo al-regla !text-[1.75rem] sm:!text-4xl">Lo último que encontramos</h2>
          <p className="mt-3 max-w-2xl text-lg text-gris">Algunas historias que fueron apareciendo en los registros.</p>
          <ol className="relative ml-3 mt-10 space-y-10 border-l-2 border-terra/40 md:ml-4">
            {PORTADA.hallazgos.map((h) => (
              <li key={h.titulo} className="relative pl-8 md:pl-10">
                <span aria-hidden="true" className="absolute -left-[0.6875rem] top-2 h-5 w-5 rounded-full bg-trigo ring-4 ring-adobe-2" />
                <div className="grid gap-x-8 gap-y-1 md:grid-cols-[7rem_1fr] md:items-baseline">
                  <p className="font-maquina text-[2.25rem] leading-none text-terra">{h.anio}</p>
                  <div className="max-w-3xl rounded-2xl bg-white p-6 shadow-[0_6px_18px_-12px_rgba(0,0,0,0.4)] ring-1 ring-black/5">
                    <h3 className="text-[1.25rem] font-bold leading-snug">{h.titulo}</h3>
                    <p className="mt-2 text-[1.0625rem] leading-relaxed text-gris">{h.texto}</p>
                    <p className="mt-3 text-base font-bold text-teja">Encontrado en {h.cuando.toLowerCase()}</p>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Aportar */}
      <section className="on-dark bg-parra text-white">
        <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-20">
          <h2 className="max-w-2xl font-slab text-[1.75rem] font-bold leading-tight sm:text-4xl">¿Tienes algo de la familia?</h2>
          <p className="mt-3 max-w-xl text-lg text-white/90">
            Fotos, actas, cartas o anécdotas de los abuelos: todo suma. Cuando tengas acceso podrás ver el archivo completo y dejar lo tuyo.
          </p>
        </div>
      </section>

      <footer className="on-dark bg-burdeos">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 border-t border-white/15 px-4 py-5 text-base text-white/85 sm:px-6">
          <p>Archivo Zamora Balcázar · Solo para la familia</p>
          <p>¿Perdiste la invitación? Pídele a quien te habló del archivo que te la reenvíe.</p>
        </div>
      </footer>
    </div>
  );
}
