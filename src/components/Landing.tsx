// Portada pública del archivo: lo que ve quien llega sin haber iniciado sesión.
// Parte del diseño "Diseño login archivo familiar". No muestra datos de la
// familia: las fichas de ejemplo son de antepasados fallecidos y las cifras son
// solo totales; para ver el árbol hay que entrar con invitación.

import Link from "next/link";
import ScatteredCards from "./ScatteredCards";
import SiteBrand, { BRAND_ROW } from "./SiteBrand";
import { buttonClass } from "./ui";
import type { PublicStats, PublicSurname } from "@/lib/data/public-stats";

/* ---------- Secciones ---------- */

/** Ficha de un apellido: lo general a la vista y la rama "tapada" hasta entrar. */
function SurnameCard({ s, i }: { s: PublicSurname; i: number }) {
  const rot = ["-rotate-1", "rotate-1", "-rotate-[0.5deg]", "rotate-[1.5deg]"][i % 4];
  return (
    <Link
      href="/login"
      aria-label={`Apellido ${s.surname}: entra para ver la rama completa`}
      className={`group relative flex h-full flex-col rounded-md bg-[#f7f4ed] px-5 pb-5 pt-4 text-ink shadow-[0_10px_24px_-14px_rgba(0,0,0,0.55)] ring-1 ring-black/5 transition duration-300 hover:-translate-y-1 hover:rotate-0 hover:shadow-[0_22px_36px_-16px_rgba(0,0,0,0.6)] ${rot}`}
    >
      <div className="flex items-center justify-between font-maquina text-[0.7rem] uppercase tracking-[0.18em] text-gris">
        <span>Apellido</span>
        <span>{s.people} personas</span>
      </div>
      <div className="mt-1 h-px bg-terra" aria-hidden="true" />
      <p className="mt-3 font-maquina text-[1.75rem] leading-none">{s.surname}</p>
      <p className="mt-2 text-base text-gris">
        Desde {s.since}
        {s.place ? `, sobre todo en ${s.place}` : ""}
      </p>

      {/* La rama, tapada: solo trazos, ningún nombre real. */}
      <div className="relative mt-5 flex-1" aria-hidden="true">
        <div className="space-y-2.5 blur-[3px]">
          {[78, 62, 70].map((w, k) => (
            <div key={k} className="flex items-center gap-2.5">
              <span className="h-6 w-6 shrink-0 rounded-full bg-ink/15" />
              <span className="h-3 rounded-full bg-ink/20" style={{ width: `${w}%` }} />
            </div>
          ))}
        </div>
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-bold text-white transition group-hover:bg-terra">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
              <rect x="5" y="11" width="14" height="9" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
            Entra para ver la rama
          </span>
        </span>
      </div>
    </Link>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="font-maquina text-3xl leading-none sm:text-4xl">{value}</p>
      <p className="mt-1.5 text-sm text-white/65">{label}</p>
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
    <div className="zb min-h-screen bg-white text-ink">
      {/* Barra y portada */}
      <section className="overflow-hidden bg-ink text-white">
        <header className={`${BRAND_ROW} w-full gap-3`}>
          <SiteBrand />
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <Link
              href="/login"
              className="flex min-h-12 items-center rounded-full border border-white/50 px-4 text-base font-bold text-white hover:bg-white/10 sm:px-5"
            >
              Iniciar sesión
            </Link>
          </div>
        </header>

        <div className="grid w-full gap-12 px-4 pb-16 pt-10 sm:px-6 sm:pt-14 lg:grid-cols-2 lg:items-center lg:gap-10 lg:px-10 lg:pb-24 lg:pt-16">
          <div className="sm:pl-6 lg:pl-14 xl:pl-24">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-white/70">Archivo familiar privado</p>
            <h1 className="mt-4 font-maquina text-[2rem] leading-[1.12] sm:text-5xl lg:text-[3.25rem]">
              Toda la familia, de generación en generación, en un solo lugar.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-white/80">
              Nombres, fechas y lugares de quienes vinieron antes que nosotros, reunidos y cuidados por la propia
              familia.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3">
              <Link
                href="/login"
                className={buttonClass("principal", "!border-paper !bg-paper !text-ink hover:!bg-white hover:!border-white")}
              >
                Entrar al archivo <span aria-hidden="true">→</span>
              </Link>
            </div>

            {items.length > 0 && (
              <div className="mt-10 grid max-w-md grid-cols-3 gap-4 border-t border-white/15 pt-6">
                {items.map((s) => (
                  <Stat key={s.label} {...s} />
                ))}
              </div>
            )}
          </div>

          {/* Fichas tiradas en el suelo: de antepasados fallecidos; al pasar el mouse se agrandan */}
          <ScatteredCards className="mx-auto h-[29rem] w-full max-w-[34rem] sm:h-[33rem] lg:h-[35rem]" />
        </div>
      </section>

      {/* Apellidos que sigue el archivo */}
      {surnames.length > 0 && (
        <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-gris">Las familias del archivo</p>
          <h2 className="mt-3 max-w-2xl font-maquina text-[1.75rem] leading-tight sm:text-4xl">Apellidos que seguimos</h2>
          <p className="mt-3 max-w-2xl text-lg text-gris">
            Cada ficha es una rama de la familia. Aquí se ve solo lo general; la historia completa queda para quienes
            entran al archivo.
          </p>
          <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {surnames.map((s, i) => (
              <li key={s.surname}>
                <SurnameCard s={s} i={i} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Cierre */}
      <section className="bg-paper">
        <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <h2 className="max-w-2xl font-maquina text-[1.75rem] leading-tight sm:text-4xl">¿Eres parte de la familia?</h2>
          <p className="mt-3 max-w-xl text-lg text-gris">
            El archivo es privado: solo entra quien fue invitado. Si llevas alguno de estos apellidos o tienes fotos,
            actas o recuerdos, pídele tu invitación a quien lo administra.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/login" className={buttonClass("principal")}>
              Entrar al archivo
            </Link>
            <Link href="/login" className={buttonClass("secundario")}>
              Pedir acceso
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-line bg-white">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-5 text-base text-gris sm:px-6">
          <p>Archivo Zamora Balcázar · Solo para la familia</p>
          <Link href="/login" className="font-bold text-ink underline decoration-2 underline-offset-4 hover:text-terra">
            Iniciar sesión
          </Link>
        </div>
      </footer>
    </div>
  );
}
