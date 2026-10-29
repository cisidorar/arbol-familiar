// El logo con el nombre del archivo, igual en la portada y en la pantalla de
// entrada: mismo tamaño, misma posición (arriba a la izquierda) y siempre lleva al inicio.

import Link from "next/link";
import Logo from "./Logo";

/** Fila de arriba: mismo relleno y alto en las dos pantallas para que el logo no se mueva. */
export const BRAND_ROW = "flex min-h-[4.5rem] items-center px-4 sm:px-6 lg:px-10";

export default function SiteBrand({ light = false }: { light?: boolean }) {
  return (
    <Link
      href="/"
      className={`flex min-w-0 items-center gap-2.5 ${light ? "text-ink" : "text-white"}`}
      aria-label="Archivo Zamora Balcázar, ir al inicio"
    >
      <Logo size={48} variant={light ? "principal" : "oscuro"} className="shrink-0" />
      <span className="hidden font-maquina text-sm uppercase leading-tight tracking-[0.06em] min-[360px]:block sm:truncate sm:text-lg">
        Archivo Zamora Balcázar
      </span>
    </Link>
  );
}
