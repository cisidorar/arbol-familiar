"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import SearchBox from "./SearchBox";
import UserMenu, { type CurrentUser } from "./UserMenu";
import Logo from "./Logo";
import MobileTabBar from "./MobileTabBar";

export type Section = "inicio" | "arbol" | "mapa" | "pendientes" | "cementerios" | "admin";

const NAV: { key: Exclude<Section, "admin">; href: string; label: string; short?: string; adminOnly?: boolean }[] = [
  { key: "inicio", href: "/inicio", label: "Inicio" },
  { key: "arbol", href: "/", label: "Árbol" },
  { key: "mapa", href: "/mapa", label: "Mapa de orígenes", short: "Mapa" },
  { key: "pendientes", href: "/pendientes", label: "Pendientes", adminOnly: true },
  { key: "cementerios", href: "/cementerios", label: "Cementerios" },
];

/**
 * El encabezado del archivo, igual en todas las vistas: título, buscador, las tres
 * secciones y el menú de la cuenta. En el árbol queda flotando sobre el dibujo
 * (`floating`); en las demás páginas es una barra normal.
 */
export default function AppHeader({
  current,
  user,
  count,
  floating = false,
  onSelectPerson,
  onHome,
}: {
  current: Section;
  user: CurrentUser;
  /** Personas registradas, para la línea de arriba del título. */
  count: number;
  floating?: boolean;
  /** En el árbol: centra el dibujo en la persona. En las otras páginas se abre el árbol en ella. */
  onSelectPerson?: (id: string) => void;
  /** En el árbol: al tocar el título se vuelve al perfil propio (con su papá y su mamá) sin recargar. */
  onHome?: () => void;
}) {
  const router = useRouter();
  const select = onSelectPerson ?? ((id: string) => router.push(`/?persona=${id}`));
  // En el árbol las secciones van solo en pantallas anchas (están también en el menú de la cuenta):
  // así el encabezado del teléfono no cambia de alto y no tapa el dibujo.
  const arbol = current === "arbol";
  // Fuera del árbol, en pantallas medianas se omite el buscador para que todo quepa en UNA fila
  // (si la barra de secciones bajaba a una segunda fila, el título quedaba arriba y sobraba fondo oscuro).
  // En el teléfono las secciones van en la barra de abajo (MobileTabBar).
  const navClass = arbol ? "hidden xl:flex" : "hidden sm:flex lg:ml-auto xl:ml-0";

  return (
    <>
    <header
      className={`zb ${floating ? "absolute left-0 top-0 z-20 w-full" : "relative z-20"} border-b border-white/10 bg-ink text-white shadow-md print:hidden`}
    >
      <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-6 lg:gap-x-4">
        {/* Logo + nombre: un solo bloque, al tocarlo se vuelve al árbol. */}
        <Link
          href="/"
          onClick={(e) => {
            if (!onHome) return;
            e.preventDefault();
            onHome();
          }}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-white sm:flex-none sm:shrink-0 sm:gap-3"
          aria-label="Archivo Zamora Balcázar, ir al árbol"
        >
          <Logo size={44} variant="oscuro" className="shrink-0 sm:h-12 sm:w-12" />
          <span className="flex min-w-0 flex-col justify-center">
            <span className="mb-1 hidden whitespace-nowrap text-sm font-bold uppercase leading-none tracking-[0.1em] text-white/70 md:block">
              Fondo familiar · {count} personas
            </span>
            <span className="block truncate font-maquina text-base uppercase leading-none tracking-[0.04em] sm:text-xl sm:tracking-[0.06em] xl:text-2xl">
              Archivo Zamora Balcázar
            </span>
          </span>
        </Link>

        {/* En el teléfono, fuera del árbol, el buscador se omite para no alargar el encabezado. */}
        <div className={`${arbol ? "flex" : "hidden xl:flex"} order-last w-full min-w-0 max-w-md items-center sm:order-none sm:ml-auto sm:w-auto sm:min-w-[12rem] sm:flex-1`}>
          <SearchBox onSelect={select} />
        </div>

        <nav aria-label="Secciones" className={`${navClass} order-last w-full min-w-0 items-center justify-between gap-0.5 overflow-x-auto [scrollbar-width:none] sm:gap-1 lg:order-none lg:w-auto lg:justify-start`}>
          {NAV.filter((s) => !s.adminOnly || user.role === "admin").map((s) => {
            const on = s.key === current;
            return (
              <Link
                key={s.key}
                href={s.href}
                aria-current={on ? "page" : undefined}
                className={
                  on
                    ? "flex min-h-12 shrink-0 items-center rounded-full bg-white px-3 text-base font-bold text-ink sm:px-4 sm:text-[1.125rem]"
                    : "flex min-h-12 shrink-0 items-center rounded-full px-3 text-base text-white/90 hover:bg-white/15 hover:text-white sm:px-4 sm:text-[1.125rem]"
                }
              >
                {s.short ? (
                  <>
                    <span className="2xl:hidden">{s.short}</span>
                    <span className="hidden 2xl:inline">{s.label}</span>
                  </>
                ) : (
                  s.label
                )}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3 sm:ml-0">
          <UserMenu user={user} />
        </div>
      </div>
    </header>
    <MobileTabBar current={current} isAdmin={user.role === "admin"} pad={!floating} />
    </>
  );
}
