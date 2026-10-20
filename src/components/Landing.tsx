// Portada pública del archivo: lo que ve quien llega sin haber iniciado sesión.
// Parte del diseño "Diseño login archivo familiar". No muestra datos de la
// familia: las fichas de ejemplo son de antepasados fallecidos y las cifras son
// solo totales; para ver el árbol hay que entrar con invitación.

import Link from "next/link";
import RecordCard from "./RecordCard";
import SiteBrand, { BRAND_ROW } from "./SiteBrand";
import { buttonClass } from "./ui";
import type { PublicStats } from "@/lib/data/public-stats";

/* ---------- Ilustraciones de las secciones (solo trazos, sin datos) ---------- */

const STROKE = "#1a1816";

function ArtArbol() {
  const card = (x: number, y: number, hot = false) => (
    <g key={`${x}-${y}`}>
      <rect x={x} y={y} width={58} height={28} rx={5} fill={hot ? "#c4572e" : "#fff"} stroke={hot ? "#c4572e" : STROKE} strokeOpacity={hot ? 1 : 0.35} strokeWidth={1.5} />
      <line x1={x + 11} y1={y + 11} x2={x + 47} y2={y + 11} stroke={STROKE} strokeOpacity={hot ? 0.5 : 0.3} strokeWidth={2} strokeLinecap="round" />
      <line x1={x + 17} y1={y + 19} x2={x + 41} y2={y + 19} stroke={STROKE} strokeOpacity={hot ? 0.35 : 0.18} strokeWidth={2} strokeLinecap="round" />
    </g>
  );
  return (
    <svg viewBox="0 0 320 190" className="h-full w-full" aria-hidden="true" focusable="false">
      <g fill="none" stroke={STROKE} strokeOpacity={0.3} strokeWidth={1.5}>
        <path d="M70 40 V52 H100 V64 M130 40 V52 H100" />
        <path d="M190 40 V52 H220 V64 M250 40 V52 H220" />
        <path d="M100 92 V108 H140 V120 M220 92 V108 H180 V120" />
      </g>
      {[41, 101, 161, 221].map((x) => card(x, 12))}
      {card(71, 64)}
      {card(191, 64)}
      {card(101, 120, true)}
      {card(161, 120)}
    </svg>
  );
}

function ArtMapa() {
  // Mapa de "comunas" como baldosas: cuanto más oscuro, más antepasados nacieron ahí.
  const tones = [
    [0.1, 0.18, 0.1, 0],
    [0.18, 0.6, 0.3, 0.1],
    [0.1, 0.35, 1, 0.18],
    [0, 0.18, 0.45, 0.1],
    [0, 0.1, 0.18, 0],
  ];
  return (
    <svg viewBox="0 0 320 190" className="h-full w-full" aria-hidden="true" focusable="false">
      {tones.flatMap((row, r) =>
        row.map((t, c) => (
          <rect
            key={`${r}-${c}`}
            x={92 + c * 36 + (r % 2) * 8}
            y={12 + r * 34}
            width={32}
            height={30}
            rx={6}
            fill="#c4572e"
            fillOpacity={0.08 + t * 0.85}
            stroke={STROKE}
            strokeOpacity={0.15}
          />
        )),
      )}
      <circle cx={164} cy={80} r={7} fill="#fff" stroke={STROKE} strokeWidth={2} />
      <circle cx={164} cy={80} r={2.5} fill={STROKE} />
    </svg>
  );
}

function ArtCementerio() {
  const stone = (x: number, h: number, cross = false) => (
    <g key={x}>
      {cross ? (
        <g stroke={STROKE} strokeWidth={5} strokeLinecap="round" strokeOpacity={0.55}>
          <line x1={x} y1={150 - h} x2={x} y2={150} />
          <line x1={x - 13} y1={150 - h + 18} x2={x + 13} y2={150 - h + 18} />
        </g>
      ) : (
        <path d={`M${x - 15} 150 V${150 - h + 15} A15 15 0 0 1 ${x + 15} ${150 - h + 15} V150 Z`} fill="#fff" stroke={STROKE} strokeOpacity={0.4} strokeWidth={1.5} />
      )}
    </g>
  );
  return (
    <svg viewBox="0 0 320 190" className="h-full w-full" aria-hidden="true" focusable="false">
      <line x1={30} y1={150} x2={290} y2={150} stroke={STROKE} strokeOpacity={0.3} strokeWidth={2} />
      {stone(80, 70)}
      {stone(130, 95, true)}
      {stone(180, 62)}
      {stone(232, 82)}
      <path d="M262 38 c-9 0 -15 6 -15 14 c0 11 15 26 15 26 s15 -15 15 -26 c0 -8 -6 -14 -15 -14 z" fill="#c4572e" />
      <circle cx={262} cy={52} r={5} fill="#fff" />
    </svg>
  );
}

function ArtPendientes() {
  const doc = (y: number, flagged = false) => (
    <g key={y}>
      <rect x={70} y={y} width={180} height={34} rx={6} fill="#fff" stroke={STROKE} strokeOpacity={0.3} strokeWidth={1.5} />
      <line x1={110} y1={y + 13} x2={206} y2={y + 13} stroke={STROKE} strokeOpacity={0.3} strokeWidth={2.5} strokeLinecap="round" />
      <line x1={110} y1={y + 23} x2={170} y2={y + 23} stroke={STROKE} strokeOpacity={0.18} strokeWidth={2.5} strokeLinecap="round" />
      <circle cx={90} cy={y + 17} r={8} fill={flagged ? "#c4572e" : "none"} stroke={flagged ? "#c4572e" : "#1f6b43"} strokeWidth={2} />
      {flagged ? (
        <text x={90} y={y + 21} textAnchor="middle" fontSize={11} fontWeight={700} fill="#fff">!</text>
      ) : (
        <path d={`M85.5 ${y + 17.5} l3 3 l5.5 -6`} fill="none" stroke="#1f6b43" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      )}
    </g>
  );
  return (
    <svg viewBox="0 0 320 190" className="h-full w-full" aria-hidden="true" focusable="false">
      {doc(22)}
      {doc(70, true)}
      {doc(118)}
    </svg>
  );
}

/* ---------- Secciones ---------- */

const FEATURES = [
  {
    title: "Árbol familiar",
    text: "Busca a cualquier pariente y mira el camino que los une contigo, paso a paso.",
    Art: ArtArbol,
  },
  {
    title: "Mapa de orígenes",
    text: "Ve en qué comunas nacieron los antepasados, por generación y por rama.",
    Art: ArtMapa,
  },
  {
    title: "Cementerios",
    text: "Encuentra dónde descansa cada antepasado, con foto del cementerio y ubicación.",
    Art: ArtCementerio,
  },
  {
    title: "Pendientes",
    text: "Documentos por revisar en FamilySearch. Confirma o corrige los datos en el momento.",
    Art: ArtPendientes,
  },
];

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

        <div className="mx-auto grid w-full max-w-6xl gap-12 px-4 pb-16 pt-10 sm:px-6 sm:pt-14 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-8 lg:pb-24 lg:pt-20">
          <div>
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
              <a href="#adentro" className="text-lg font-bold underline decoration-2 underline-offset-4 hover:text-paper">
                Qué hay adentro
              </a>
            </div>

            {items.length > 0 && (
              <div className="mt-10 grid max-w-md grid-cols-3 gap-4 border-t border-white/15 pt-6">
                {items.map((s) => (
                  <Stat key={s.label} {...s} />
                ))}
              </div>
            )}
          </div>

          {/* Fichas de ejemplo: de antepasados fallecidos */}
          <div className="relative mx-auto h-[26.5rem] w-full max-w-[24rem] sm:h-[25.5rem] lg:h-[27rem] lg:max-w-md" aria-hidden="true">
            <RecordCard
              kind="Bautismo"
              number="0021"
              name="Isidoro Balcazar Bravo"
              year="1829"
              className="left-0 top-0 -rotate-6"
            />
            <RecordCard
              kind="Matrimonio"
              number="0147"
              name="Daniel Zamora y Natividad Galdamez"
              year="1881"
              className="left-6 top-[9.2rem] rotate-2 sm:left-10 sm:top-[8.2rem]"
            />
            <RecordCard
              kind="Nacimiento"
              number="0302"
              name="Rosa Elvira Canelo Frez"
              year="1896"
              place="Quillota"
              className="left-2 top-[17.9rem] -rotate-1 sm:left-4 sm:top-[17rem]"
            />
          </div>
        </div>
      </section>

      {/* Qué hay adentro */}
      <section id="adentro" className="mx-auto w-full max-w-6xl scroll-mt-4 px-4 py-14 sm:px-6 sm:py-20">
        <h2 className="max-w-xl font-maquina text-[1.75rem] leading-tight sm:text-4xl">Qué puedes hacer en el archivo</h2>
        <p className="mt-3 max-w-2xl text-lg text-gris">
          Pensado para que abuelos, padres y nietos lo usen sin ayuda: letra grande, botones claros y nada escondido.
        </p>

        <ul className="mt-9 grid gap-5 sm:grid-cols-2">
          {FEATURES.map(({ title, text, Art }) => (
            <li key={title} className="overflow-hidden rounded-2xl border border-line bg-white">
              <div className="aspect-[16/9] bg-[#f0efec] p-3 sm:p-4">
                <Art />
              </div>
              <div className="flex items-start gap-4 px-5 pb-5 pt-4">
                <div className="min-w-0 flex-1">
                  <h3 className="text-xl font-bold">{title}</h3>
                  <p className="mt-1 text-base leading-snug text-gris">{text}</p>
                </div>
                <Link
                  href="/login"
                  aria-label={`${title}: iniciar sesión para verlo`}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink text-lg text-white hover:bg-gris"
                >
                  <span aria-hidden="true">→</span>
                </Link>
              </div>
            </li>
          ))}
        </ul>
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
