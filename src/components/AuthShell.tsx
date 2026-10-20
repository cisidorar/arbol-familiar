// Marco de las pantallas sin sesión (entrar, usar una invitación): es la
// portada del archivo. A la izquierda (arriba en el teléfono) va la presentación
// sobre tinta, con un árbol dibujado sin nombres; a la derecha, sobre papel, la
// "ficha" con el formulario. Nada de lo que se ve acá revela datos de la familia.

import SiteBrand, { BRAND_ROW } from "./SiteBrand";

/** Árbol de tres generaciones, solo líneas: decoración, sin datos. */
function TreeSketch({ className }: { className?: string }) {
  const card = (x: number, y: number, accent = false) => (
    <g key={`${x}-${y}`}>
      <rect
        x={x}
        y={y}
        width={64}
        height={30}
        rx={5}
        fill={accent ? "#c4572e" : "none"}
        fillOpacity={accent ? 0.9 : 0}
        stroke={accent ? "#c4572e" : "#f4f1ea"}
        strokeOpacity={accent ? 1 : 0.35}
        strokeWidth={1.5}
      />
      <line x1={x + 12} y1={y + 12} x2={x + 52} y2={y + 12} stroke={accent ? "#1a1816" : "#f4f1ea"} strokeOpacity={accent ? 0.55 : 0.3} strokeWidth={2} strokeLinecap="round" />
      <line x1={x + 18} y1={y + 20} x2={x + 46} y2={y + 20} stroke={accent ? "#1a1816" : "#f4f1ea"} strokeOpacity={accent ? 0.4 : 0.2} strokeWidth={2} strokeLinecap="round" />
    </g>
  );
  const line = "#f4f1ea";
  return (
    <svg viewBox="0 0 360 226" className={className} aria-hidden="true" focusable="false">
      <g fill="none" stroke={line} strokeOpacity={0.3} strokeWidth={1.5}>
        {/* bisabuelos → abuelos */}
        <path d="M44 45 V60 H88 V75 M132 45 V60 H88" />
        <path d="M228 45 V60 H272 V75 M316 45 V60 H272" />
        {/* abuelos → padres */}
        <path d="M88 105 V125 H140 V140 M272 105 V125 H220 V140" />
        {/* padres → hijos */}
        <path d="M172 155 H188 M180 155 V178 M108 178 H252 M108 178 V190 M180 178 V190 M252 178 V190" />
      </g>
      {[12, 100, 196, 284].map((x) => card(x, 15))}
      {card(56, 75)}
      {card(240, 75)}
      {card(108, 140)}
      {card(188, 140)}
      {card(76, 190)}
      {card(148, 190, true)}
      {card(220, 190)}
    </svg>
  );
}

export default function AuthShell({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="zb flex min-h-screen flex-col bg-paper lg:flex-row">
      {/* Portada */}
      <section className="relative overflow-hidden bg-ink text-white lg:flex lg:w-[46%] lg:flex-col lg:justify-between xl:w-1/2">
        <div className="relative z-10">
          <div className={BRAND_ROW}>
            <SiteBrand />
          </div>
          <div className="px-5 pb-6 pt-3 sm:px-10 sm:pb-10 sm:pt-6 lg:px-14 lg:pt-10 xl:px-20">
          <h2 className="mt-4 font-maquina text-[1.6rem] uppercase leading-[1.1] tracking-[0.04em] sm:mt-6 sm:max-w-[14ch] sm:text-5xl sm:leading-[1.05] lg:mt-14 lg:text-[3.5rem] xl:text-6xl">
            Archivo Zamora Balcázar
          </h2>
          <div className="mt-4 h-1 w-16 bg-terra sm:mt-5 lg:mt-8" aria-hidden="true" />
          <p className="mt-4 max-w-md text-base leading-relaxed text-white/80 sm:mt-5 sm:text-lg lg:mt-8 lg:text-xl">
            Nombres, fechas, lugares e historias de la familia, reunidos en un solo lugar para no perderlos.
          </p>
          </div>
        </div>

        <TreeSketch className="relative z-0 mx-auto hidden w-full max-w-lg px-10 pb-6 lg:block xl:max-w-xl" />

        <p className="relative z-10 hidden px-14 pb-10 text-sm text-white/50 lg:block xl:px-20">
          Archivo privado · solo se entra con invitación
        </p>
      </section>

      {/* Ficha de acceso */}
      <main className="flex flex-1 items-start justify-center px-4 py-5 sm:px-6 sm:py-14 lg:items-center lg:py-16">
        <div className="w-full max-w-[30rem]">
          <div className="relative overflow-hidden rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(26,24,22,0.06),0_12px_32px_-12px_rgba(26,24,22,0.18)]">
            <div className="h-1.5 bg-terra" aria-hidden="true" />
            <div className="px-5 pb-7 pt-6 sm:px-10 sm:pb-10 sm:pt-9">
              <p className="font-maquina text-sm uppercase tracking-[0.16em] text-gris">Ficha de acceso</p>
              <h1 className="zb-titulo mt-2">{title}</h1>
              {intro && <p className="zb-texto mt-3 text-gris">{intro}</p>}
              <div className="mt-7">{children}</div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
