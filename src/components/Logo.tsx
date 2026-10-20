// Logo ZB de la guía de estilo: letras de máquina de escribir sobre una tecla
// con la barra terracota subrayada. Tres variantes:
//  - "principal": papel con tinta y la barra terracota (sobre fondo claro).
//  - "oscuro": igual, pensado para ir sobre la barra negra y como ícono de la app.
//  - "tinta": una sola tinta, para imprimir o sellar documentos.

export type LogoVariant = "principal" | "oscuro" | "tinta";

export default function Logo({
  size = 48,
  variant = "principal",
  className,
}: {
  size?: number;
  variant?: LogoVariant;
  className?: string;
}) {
  const tinta = variant === "tinta";
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role="img"
      aria-label="Archivo Zamora Balcázar"
      className={className}
    >
      <rect
        x={tinta ? 2 : 0}
        y={tinta ? 2 : 0}
        width={tinta ? 60 : 64}
        height={tinta ? 60 : 64}
        rx={14}
        fill={tinta ? "#ffffff" : "#f4f1ea"}
        stroke={tinta ? "#1a1816" : "none"}
        strokeWidth={tinta ? 4 : 0}
      />
      <text
        x={32}
        y={39}
        textAnchor="middle"
        fontSize={30}
        fill="#1a1816"
        style={{ fontFamily: "var(--font-special-elite), 'Courier New', Courier, monospace" }}
      >
        ZB
      </text>
      <rect x={15} y={46} width={34} height={4} fill={tinta ? "#1a1816" : "#c4572e"} />
    </svg>
  );
}
