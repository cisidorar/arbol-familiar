// Fichas de ejemplo (de antepasados fallecidos) de la pantalla de entrada: llegan
// amontonadas y, al pasar el mouse o enfocar el montón, se abren en abanico para
// poder leerlas. Nada de lo que se ve acá es un dato privado.

const CARDS = [
  { kind: "Matrimonio", number: "0147", name: "Daniel Zamora y Natividad Galdamez", year: "1881", place: "San Esteban" },
  { kind: "Nacimiento", number: "0302", name: "Rosa Elvira Canelo Frez", year: "1896", place: "Quillota" },
  { kind: "Nacimiento", number: "0011", name: "Isidoro Balcazar Bravo", year: "1810", place: "Buin" },
  { kind: "Defunción", number: "0264", name: "Juan Balcazar Araya", year: "1898", place: "Santiago" },
  { kind: "Matrimonio", number: "0121", name: "Juan Isidro Martinez Ruz y Elena Varas Sepulveda", year: "1885", place: "Curicó" },
  { kind: "Nacimiento", number: "0229", name: "Regina Zamora Galdamez", year: "1893", place: "Cancha del Llano" },
];

// Montón: casi encima, cada una algo girada. Abierto: dos columnas de tres, casi derechas.
const POSE: { x0: string; y0: string; r0: string; x1: string; y1: string; r1: string }[] = [
  { x0: "6.5rem", y0: "7rem", r0: "-7deg", x1: "0rem", y1: "0rem", r1: "-3deg" },
  { x0: "7.5rem", y0: "8rem", r0: "5deg", x1: "14.5rem", y1: "1rem", r1: "2deg" },
  { x0: "5.5rem", y0: "9rem", r0: "-2deg", x1: "0.5rem", y1: "8.5rem", r1: "2deg" },
  { x0: "8rem", y0: "6.5rem", r0: "9deg", x1: "14rem", y1: "9.5rem", r1: "-3deg" },
  { x0: "6rem", y0: "7.5rem", r0: "-10deg", x1: "0rem", y1: "17rem", r1: "-2deg" },
  { x0: "7rem", y0: "7rem", r0: "3deg", x1: "14.5rem", y1: "18rem", r1: "3deg" },
];

export default function StackedCards() {
  return (
    <div
      aria-hidden="true"
      tabIndex={-1}
      className="group relative mx-auto h-[26rem] w-full max-w-[28rem] outline-none [--w:13rem] hover:z-10 xl:h-[27rem]"
    >
      {CARDS.map((c, i) => {
        const p = POSE[i];
        return (
          <div
            key={c.number}
            className="absolute left-0 top-0 w-[var(--w)] rounded-md bg-[#f7f4ed] px-4 pb-3 pt-2.5 text-ink shadow-[0_12px_22px_-8px_rgba(0,0,0,0.75)] transition-transform duration-500 ease-[cubic-bezier(0.2,0.8,0.3,1)] [transform:translate(var(--x0),var(--y0))_rotate(var(--r0))] group-hover:[transform:translate(var(--x1),var(--y1))_rotate(var(--r1))] group-focus:[transform:translate(var(--x1),var(--y1))_rotate(var(--r1))] motion-reduce:transition-none"
            style={
              {
                "--x0": p.x0, "--y0": p.y0, "--r0": p.r0,
                "--x1": p.x1, "--y1": p.y1, "--r1": p.r1,
                transitionDelay: `${i * 40}ms`,
                zIndex: i,
              } as React.CSSProperties
            }
          >
            <div className="flex items-center justify-between font-maquina text-[0.6rem] uppercase tracking-[0.16em] text-gris">
              <span>{c.kind}</span>
              <span>N.º {c.number}</span>
            </div>
            <div className="mt-1 h-px bg-terra" />
            <p className="mt-2 font-maquina text-[0.95rem] leading-tight">{c.name}</p>
            <p className="mt-2 font-maquina text-[0.75rem] text-gris">
              {c.year} · {c.place}
            </p>
          </div>
        );
      })}
    </div>
  );
}
