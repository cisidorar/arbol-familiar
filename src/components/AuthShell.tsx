// Marco de las pantallas sin sesión (entrar, usar una invitación): a la izquierda
// (arriba en el teléfono) la bienvenida sobre tinta con fichas de ejemplo tiradas en el suelo (al pasar el mouse se agrandan); a
// la derecha, sobre blanco, el formulario, con "Volver al inicio" arriba. Nada de lo que se ve acá revela datos de la familia.

import Link from "next/link";
import SiteBrand, { BRAND_ROW } from "./SiteBrand";
import ScatteredCards, { LOGIN_CARDS } from "./ScatteredCards";
import { PORTADA } from "@/lib/portada-contenido";

export default function AuthShell({
  title,
  intro,
  heading = "Hola de nuevo, familia.",
  lead = "Entra para ver cómo va la investigación y sumar lo tuyo: una foto, un recuerdo, un nombre que falta.",
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
    <div className="zb album flex min-h-screen flex-col lg:flex-row">
      {/* Bienvenida */}
      <section className="on-dark relative overflow-hidden bg-burdeos text-white lg:flex lg:w-[47%] lg:flex-col">
        <div className={BRAND_ROW}>
          <SiteBrand />
        </div>
        <div className="px-5 pb-7 pt-3 sm:px-10 sm:pb-10 sm:pt-6 lg:px-12 lg:pt-8 xl:px-14">
          <h2 className="max-w-[12ch] font-slab text-[2rem] font-bold leading-[1.08] sm:text-5xl lg:text-[3.25rem] xl:text-6xl">
            {heading}
          </h2>
          <p className="mt-4 max-w-md text-base leading-relaxed text-white/90 sm:mt-6 sm:text-lg">{lead}</p>
          <p className="mt-4 text-base font-bold uppercase tracking-[0.14em] text-white/85">Actualizado el {PORTADA.actualizado}</p>
        </div>

        {/* Fichas de ejemplo (de antepasados fallecidos): solo en pantallas anchas */}
        <div className="mx-auto hidden w-full max-w-[34rem] flex-1 items-center px-6 pb-10 lg:flex">
          <ScatteredCards cards={LOGIN_CARDS} className="h-[26rem] w-full xl:h-[28rem]" />
        </div>
      </section>

      {/* Formulario */}
      <main className="flex flex-1 flex-col">
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
