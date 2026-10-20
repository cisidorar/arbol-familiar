// Marco de las pantallas sin sesión (entrar, usar una invitación): a la izquierda
// (arriba en el teléfono) la bienvenida sobre tinta con dos fichas de ejemplo; a
// la derecha, sobre blanco, el formulario, con "Volver al inicio" y el tamaño de
// la letra arriba. Nada de lo que se ve acá revela datos de la familia.

import Link from "next/link";
import RecordCard from "./RecordCard";
import SiteBrand, { BRAND_ROW } from "./SiteBrand";
import TextSize from "./TextSize";

export default function AuthShell({
  title,
  intro,
  heading = "Bienvenido de vuelta a la familia.",
  lead = "El archivo es privado. Solo entran las personas invitadas por la familia.",
  children,
}: {
  title: string;
  intro?: string;
  /** Titular grande del panel oscuro. */
  heading?: string;
  /** Frase bajo el titular. */
  lead?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="zb flex min-h-screen flex-col bg-white lg:flex-row">
      {/* Bienvenida */}
      <section className="relative overflow-hidden bg-ink text-white lg:flex lg:w-[47%] lg:flex-col">
        <div className={BRAND_ROW}>
          <SiteBrand />
        </div>
        <div className="px-5 pb-7 pt-3 sm:px-10 sm:pb-10 sm:pt-6 lg:px-12 lg:pt-8 xl:px-14">
          <h2 className="max-w-[12ch] font-maquina text-[2rem] leading-[1.08] sm:text-5xl lg:text-[3.25rem] xl:text-6xl">
            {heading}
          </h2>
          <p className="mt-4 max-w-md text-base leading-relaxed text-white/80 sm:mt-6 sm:text-lg">{lead}</p>
        </div>

        {/* Fichas de ejemplo (de antepasados fallecidos): solo en pantallas anchas */}
        <div className="relative mx-auto hidden h-[21rem] w-full max-w-[28rem] flex-1 lg:block" aria-hidden="true">
          <RecordCard
            compact
            kind="Matrimonio"
            number="0147"
            name="Daniel Zamora y Natividad Galdamez"
            year="1881"
            place="San Esteban"
            className="left-0 top-4 -rotate-3"
          />
          <RecordCard
            compact
            kind="Nacimiento"
            number="0302"
            name="Rosa Elvira Canelo Frez"
            year="1896"
            place="Quillota"
            className="left-16 top-44 rotate-2"
          />
        </div>
      </section>

      {/* Formulario */}
      <main className="flex flex-1 flex-col bg-white">
        <div className={`${BRAND_ROW} justify-between`}>
          <Link
            href="/"
            className="flex min-h-12 items-center gap-2 text-base font-bold text-ink hover:text-terra"
          >
            <span aria-hidden="true">←</span> Volver al inicio
          </Link>
          <TextSize />
        </div>
        <div className="flex flex-1 items-start justify-center px-5 pb-12 pt-4 sm:px-8 lg:items-center lg:pb-24 lg:pt-0">
          <div className="w-full max-w-[28rem]">
            <h1 className="font-body text-[1.75rem] font-bold leading-tight sm:text-4xl">{title}</h1>
            {intro && <p className="zb-texto mt-2 text-gris">{intro}</p>}
            <div className="mt-7">{children}</div>
          </div>
        </div>
      </main>
    </div>
  );
}
