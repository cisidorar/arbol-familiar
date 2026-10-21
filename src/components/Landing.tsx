// Portada pública del archivo: lo que ve quien llega sin haber iniciado sesión.
// Pensada para un grupo chico (primos y tíos): una bienvenida cercana, los apellidos
// que sigue el archivo y lo último de la investigación. Solo antepasados fallecidos
// hace mucho y cifras generales; para ver el árbol hay que entrar con invitación.

import Link from "next/link";
import ScatteredCards from "./ScatteredCards";
import SiteBrand, { BRAND_ROW } from "./SiteBrand";
import { buttonClass } from "./ui";
import { PORTADA } from "@/lib/portada-contenido";
import type { PublicStats, PublicSurname } from "@/lib/data/public-stats";

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="font-maquina text-3xl leading-none sm:text-4xl">{value}</p>
      <p className="mt-1.5 text-sm text-white/70">{label}</p>
    </div>
  );
}

/** Ficha de un apellido: cuántas personas, desde cuándo y dónde. */
function SurnameCard({ s, i }: { s: PublicSurname; i: number }) {
  const rot = ["-rotate-1", "rotate-1", "-rotate-[0.5deg]", "rotate-[1.5deg]"][i % 4];
  return (
    <Link
      href="/login"
      aria-label={`${s.surname}: ${s.people} personas. Entra para ver la rama`}
      className={`group flex h-full flex-col rounded-md bg-[#f7f4ed] px-3.5 pb-3.5 pt-3.5 sm:px-5 sm:pb-4 sm:pt-4 text-ink shadow-[0_10px_24px_-14px_rgba(0,0,0,0.55)] ring-1 ring-black/5 transition duration-300 hover:-translate-y-1 hover:rotate-0 hover:shadow-[0_22px_36px_-16px_rgba(0,0,0,0.6)] ${rot}`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate font-maquina text-[1.2rem] leading-none sm:text-[1.625rem]">{s.surname}</p>
        <p className="shrink-0 font-maquina text-[1.2rem] leading-none text-terra sm:text-[1.625rem]">{s.people}</p>
      </div>
      <div className="mt-2 h-px bg-terra" aria-hidden="true" />
      <p className="mt-2 flex-1 text-[0.9375rem] leading-snug text-gris sm:text-base">
        {s.people === 1 ? "persona" : "personas"} · desde {s.since}
        {s.place ? ` · ${s.place}` : ""}
      </p>
      <p className="mt-3 hidden text-sm font-bold text-ink/70 sm:block transition group-hover:text-terra">
        Ver la rama <span aria-hidden="true">→</span>
      </p>
    </Link>
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
      {/* Bienvenida */}
      <section className="overflow-hidden bg-ink text-white">
        <header className={`${BRAND_ROW} w-full gap-3`}>
          <SiteBrand />
          <Link
            href="/login"
            className="ml-auto flex min-h-12 items-center rounded-full border border-white/50 px-5 text-base font-bold text-white hover:bg-white/10"
          >
            Entrar
          </Link>
        </header>

        <div className="mx-auto grid w-full max-w-6xl gap-12 px-4 pb-16 pt-8 sm:px-6 sm:pt-12 lg:grid-cols-2 lg:items-center lg:gap-10 lg:pb-20">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-white/70">
              Actualizado el {PORTADA.actualizado}
            </p>
            <h1 className="mt-4 font-maquina text-[2.75rem] leading-[1.05] sm:text-6xl">Hola, familia.</h1>
            <div className="mt-6 max-w-xl space-y-4 text-[1.1875rem] leading-relaxed text-white/85">
              <p>Aquí vamos juntando lo que hemos encontrado de nuestros antepasados: nombres, fechas, lugares y alguna que otra historia.</p>
              <p>Pasa a mirar cómo va la investigación y, si tienes algo, súmalo: una foto, un recuerdo, un nombre que falta.</p>
            </div>
            <div className="mt-7">
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
          <ScatteredCards className="mx-auto h-[26rem] w-full max-w-[32rem] sm:h-[31rem]" />
        </div>
      </section>

      {/* Apellidos */}
      {surnames.length > 0 && (
        <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <h2 className="font-maquina text-[1.75rem] leading-tight sm:text-4xl">Nuestros apellidos</h2>
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
      <section className="bg-paper">
        <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <h2 className="font-maquina text-[1.75rem] leading-tight sm:text-4xl">Lo último que encontramos</h2>
          <p className="mt-3 max-w-2xl text-lg text-gris">Algunas historias que fueron apareciendo en los registros.</p>
          <ul className="mt-10 grid gap-5 md:grid-cols-2">
            {PORTADA.hallazgos.map((h) => (
              <li key={h.titulo} className="rounded-2xl bg-white p-6 shadow-[0_6px_18px_-12px_rgba(0,0,0,0.4)] ring-1 ring-black/5">
                <p className="text-sm font-bold uppercase tracking-[0.14em] text-terra">{h.cuando}</p>
                <h3 className="mt-2 text-[1.25rem] font-bold leading-snug">{h.titulo}</h3>
                <p className="mt-2 text-[1.0625rem] leading-relaxed text-gris">{h.texto}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Aportar */}
      <section className="bg-ink text-white">
        <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <h2 className="max-w-2xl font-maquina text-[1.75rem] leading-tight sm:text-4xl">¿Tienes algo de la familia?</h2>
          <p className="mt-3 max-w-xl text-lg text-white/80">
            Fotos, actas, cartas o anécdotas de los abuelos: todo suma. Entra al archivo para verlo completo y dejar lo tuyo.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link
              href="/login"
              className={buttonClass("principal", "!border-paper !bg-paper !text-ink hover:!bg-white hover:!border-white")}
            >
              Entrar al archivo
            </Link>
            <p className="max-w-sm text-base text-white/70">¿Aún no tienes acceso? Pídeselo a quien te habló del archivo.</p>
          </div>
        </div>
      </section>

      <footer className="bg-ink">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 border-t border-white/15 px-4 py-5 text-base text-white/60 sm:px-6">
          <p>Archivo Zamora Balcázar · Solo para la familia</p>
        </div>
      </footer>
    </div>
  );
}
