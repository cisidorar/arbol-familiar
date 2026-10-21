// Portada pública del archivo: lo que ve quien llega sin haber iniciado sesión.
// Parte del diseño "Diseño login archivo familiar". No muestra datos de la
// familia: las fichas de ejemplo son de antepasados fallecidos y las cifras son
// solo totales; para ver el árbol hay que entrar con invitación.

import Link from "next/link";
import ScatteredCards from "./ScatteredCards";
import SiteBrand, { BRAND_ROW } from "./SiteBrand";
import { buttonClass } from "./ui";
import type { PublicStats } from "@/lib/data/public-stats";

/* ---------- Secciones ---------- */

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="font-maquina text-3xl leading-none sm:text-4xl">{value}</p>
      <p className="mt-1.5 text-sm text-white/65">{label}</p>
    </div>
  );
}

export default function Landing({ stats }: { stats: PublicStats | null }) {
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
              Recorre el árbol, descubre de dónde venían nuestros antepasados, encuentra dónde descansan y ayuda a
              completar lo que falta.
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

      {/* Cierre */}
      <section className="bg-paper">
        <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <h2 className="max-w-2xl font-maquina text-[1.75rem] leading-tight sm:text-4xl">
            ¿Tienes fotos, actas o recuerdos?
          </h2>
          <p className="mt-3 max-w-xl text-lg text-gris">
            Cada dato ayuda. Si vas a un centro de historia familiar, en Pendientes verás qué documentos revisar y
            podrás corregir las fichas ahí mismo.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/login" className={buttonClass("principal")}>
              Ver pendientes
            </Link>
            <a href="#como-entrar" className={buttonClass("secundario")}>
              Pedir acceso
            </a>
          </div>
          <p id="como-entrar" className="mt-8 max-w-xl scroll-mt-6 border-l-4 border-terra pl-4 text-base leading-relaxed text-gris">
            El archivo es privado: solo entra quien fue invitado. Para pedir acceso, escríbele a quien administra el
            archivo en tu familia y te mandará un enlace de invitación.
          </p>
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
