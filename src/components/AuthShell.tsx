// Marco de las pantallas sin sesión (entrar, usar una invitación): a la izquierda
// (arriba en el teléfono) la bienvenida sobre tinta con un montón de fichas de ejemplo que se abre al pasar el mouse; a
// la derecha, sobre blanco, el formulario, con "Volver al inicio" arriba. Nada de lo que se ve acá revela datos de la familia.

import Link from "next/link";
import SiteBrand, { BRAND_ROW } from "./SiteBrand";
import StackedCards from "./StackedCards";

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
        <div className="mx-auto hidden w-full max-w-[30rem] flex-1 items-center lg:flex">
          <StackedCards />
        </div>
      </section>

      {/* Formulario */}
      <main className="flex flex-1 flex-col bg-white">
        <div className={BRAND_ROW}>
          <Link
            href="/"
            className="flex min-h-12 items-center gap-2 text-base font-bold text-ink hover:text-terra"
          >
            <span aria-hidden="true">←</span> Volver al inicio
          </Link>
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
