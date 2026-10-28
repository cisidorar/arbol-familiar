import Link from "next/link";
import type { Section } from "./AppHeader";

type Tab = { key: Exclude<Section, "admin">; href: string; label: string; icon: React.ReactNode; adminOnly?: boolean; /** Nombre completo, para lectores de pantalla (la etiqueta visible es corta para caber con letra de 16 px). */ full?: string };

const icon = (d: React.ReactNode) => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {d}
  </svg>
);

const TABS: Tab[] = [
  {
    key: "inicio",
    href: "/inicio",
    label: "Inicio",
    icon: icon(
      <>
        <path d="M4 11 12 4l8 7" />
        <path d="M6 10v10h12V10" />
        <path d="M10 20v-6h4v6" />
      </>,
    ),
  },
  {
    key: "arbol",
    href: "/",
    label: "Árbol",
    icon: icon(
      <>
        <rect x="9" y="3" width="6" height="5" rx="1" />
        <rect x="3" y="16" width="6" height="5" rx="1" />
        <rect x="15" y="16" width="6" height="5" rx="1" />
        <path d="M12 8v4M6 16v-4h12v4" />
      </>,
    ),
  },
  {
    key: "mapa",
    href: "/mapa",
    label: "Mapa",
    icon: icon(
      <>
        <path d="M12 21s-7-6.3-7-12a7 7 0 0 1 14 0c0 5.7-7 12-7 12z" />
        <circle cx="12" cy="9" r="2.5" />
      </>,
    ),
  },
  {
    key: "cementerios",
    href: "/cementerios",
    label: "Descansan",
    full: "Dónde descansan",
    icon: icon(
      <>
        <path d="M7 21V9a5 5 0 0 1 10 0v12" />
        <path d="M4 21h16" />
        <path d="M12 8v5M9.75 10.25h4.5" />
      </>,
    ),
  },
  {
    key: "pendientes",
    href: "/pendientes",
    label: "Tareas",
    full: "Pendientes",
    adminOnly: true,
    icon: icon(
      <>
        <path d="M9 6h11M9 12h11M9 18h11" />
        <path d="m3.5 6 1 1 2-2M3.5 12l1 1 2-2" />
        <circle cx="5" cy="18" r="1.2" />
      </>,
    ),
  },
];

/**
 * En el teléfono, las secciones van abajo, siempre a mano (como en las apps).
 * `pad`: la página deja espacio abajo para que la barra no tape el final; el árbol no lo necesita.
 */
export default function MobileTabBar({ current, isAdmin, pad = true }: { current: Section; isAdmin: boolean; pad?: boolean }) {
  return (
    <nav
      aria-label="Secciones"
      data-pad={pad ? "" : undefined}
      className="zb-tabbar fixed inset-x-0 bottom-0 z-[24] on-dark border-t border-white/10 bg-burdeos pb-[env(safe-area-inset-bottom)] text-white shadow-[0_-6px_20px_rgba(0,0,0,0.18)] sm:hidden print:hidden"
    >
      <ul className="flex">
        {TABS.filter((t) => !t.adminOnly || isAdmin).map((t) => {
          const on = t.key === current;
          return (
            <li key={t.key} className="flex-1">
              <Link
                href={t.href}
                aria-current={on ? "page" : undefined}
                aria-label={t.full}
                className={`flex min-h-[4.5rem] flex-col items-center justify-center gap-1 text-base font-bold leading-none ${on ? "text-white" : "text-white/85"}`}
              >
                <span className={`grid h-8 w-12 place-items-center rounded-full ${on ? "bg-adobe text-ink" : ""}`}>{t.icon}</span>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
