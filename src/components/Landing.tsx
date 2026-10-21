// Portada pública del archivo: lo que ve quien llega sin haber iniciado sesión.
// Pensada para un grupo chico (unos 20 primos y tíos): una carta de la familia con
// lo último de la investigación, preguntas abiertas y cómo aportar. Solo antepasados
// fallecidos hace mucho y cifras generales; para ver el árbol hay que entrar con invitación.

import Link from "next/link";
import ScatteredCards from "./ScatteredCards";
import SiteBrand, { BRAND_ROW } from "./SiteBrand";
import { buttonClass } from "./ui";
import { PORTADA } from "@/lib/portada-contenido";
import type { PublicStats, PublicSurname } from "@/lib/data/public-stats";

function lista(items: string[]) {
  if (items.length < 2) return items.join("");
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

export default function Landing({ stats, surnames = [] }: { stats: PublicStats | null; surnames?: PublicSurname[] }) {
  const cifras = stats
    ? [
        `${stats.people.toLocaleString("es-CL")} personas`,
        stats.generations ? `${stats.generations} generaciones` : null,
        stats.oldestYear ? `el registro más antiguo es de ${stats.oldestYear}` : null,
      ].filter(Boolean)
    : [];
  const apellidos = surnames.map((s) => s.surname);

  return (
    <div className="zb min-h-screen bg-paper text-ink">
      <header className={`${BRAND_ROW} w-full gap-3`}>
        <SiteBrand light />
        <Link
          href="/login"
          className="ml-auto flex min-h-12 items-center rounded-full border border-ink/40 px-5 text-base font-bold hover:bg-ink hover:text-white"
        >
          Entrar
        </Link>
      </header>

      {/* Carta de la familia */}
      <section className="mx-auto grid w-full max-w-6xl gap-10 px-4 pb-14 pt-8 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-14 lg:pb-20 lg:pt-12">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-gris">
            Archivo Zamora Balcázar · actualizado el {PORTADA.actualizado}
          </p>
          <h1 className="mt-4 font-maquina text-[2.5rem] leading-[1.08] sm:text-6xl">Hola, familia.</h1>
          <div className="mt-6 max-w-xl space-y-4 text-[1.1875rem] leading-relaxed">
            <p>
              Aquí vamos juntando lo que hemos encontrado de{apellidos.length ? ` los ${lista(apellidos)}` : " nuestros antepasados"}: nombres,
              fechas, lugares y alguna que otra historia.
            </p>
            <p>
              Es un lugar para mirar cómo va la investigación y, si quieres, para sumar lo tuyo: una foto, un recuerdo, un nombre que
              falta.
            </p>
          </div>
          <p className="mt-5 font-maquina text-xl">— {PORTADA.firma}</p>
          {cifras.length > 0 && (
            <p className="mt-6 max-w-xl border-t border-ink/15 pt-4 text-base text-gris">
              Llevamos {cifras.join("; ")}.
            </p>
          )}
        </div>

        {/* Fichas tiradas en el suelo: de antepasados fallecidos; al pasar el mouse se agrandan */}
        <div className="rounded-3xl bg-ink px-2 py-4 sm:px-6">
          <ScatteredCards className="mx-auto h-[24rem] w-full max-w-[30rem] sm:h-[26rem]" />
        </div>
      </section>

      {/* Lo último que encontramos */}
      <section className="bg-white">
        <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-16">
          <h2 className="font-maquina text-[1.75rem] leading-tight sm:text-4xl">Lo último que encontramos</h2>
          <ul className="mt-8 grid gap-5 md:grid-cols-2">
            {PORTADA.hallazgos.map((h) => (
              <li key={h.titulo} className="rounded-2xl border border-line bg-paper/60 p-6">
                <p className="text-sm font-bold uppercase tracking-[0.14em] text-terra">{h.cuando}</p>
                <h3 className="mt-2 text-[1.25rem] font-bold leading-snug">{h.titulo}</h3>
                <p className="mt-2 text-[1.0625rem] leading-relaxed text-gris">{h.texto}</p>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-base text-gris">Las fichas completas, con sus fuentes, están adentro.</p>
        </div>
      </section>

      {/* Preguntas abiertas */}
      <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-16">
        <h2 className="font-maquina text-[1.75rem] leading-tight sm:text-4xl">Preguntas abiertas</h2>
        <p className="mt-3 max-w-2xl text-lg text-gris">Cosas que todavía no sabemos. Si tienes una pista, cuéntanosla.</p>
        <ul className="mt-8 space-y-4">
          {PORTADA.preguntas.map((q) => (
            <li key={q} className="flex gap-4 rounded-2xl bg-white p-5 text-[1.0625rem] leading-relaxed shadow-[0_6px_16px_-12px_rgba(0,0,0,0.5)] ring-1 ring-black/5">
              <span aria-hidden="true" className="font-maquina text-2xl leading-none text-terra">?</span>
              <span>{q}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Aportar */}
      <section className="bg-white">
        <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-16">
          <h2 className="max-w-2xl font-maquina text-[1.75rem] leading-tight sm:text-4xl">¿Tienes algo de la familia?</h2>
          <p className="mt-3 max-w-xl text-lg text-gris">
            Fotos, actas, cartas, anécdotas de los abuelos, cómo se llamaba alguien. Cuéntaselo a {PORTADA.firma}, por donde
            hablen siempre, y lo vamos sumando.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-4">
            <Link href="/login" className={buttonClass("principal")}>
              Entrar y ver la investigación
            </Link>
            <p className="max-w-sm text-base text-gris">¿Todavía no tienes tu acceso? Pídeselo a {PORTADA.firma}.</p>
          </div>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-5 text-base text-gris sm:px-6">
          <p>Hecho por {PORTADA.firma} para la familia · 2026</p>
          <Link href="/login" className="font-bold text-ink underline decoration-2 underline-offset-4 hover:text-terra">
            Entrar
          </Link>
        </div>
      </footer>
    </div>
  );
}
