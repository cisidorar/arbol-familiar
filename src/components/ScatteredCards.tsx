// Fichas de archivo "tiradas en el suelo" de la portada: se amontonan unas sobre
// otras, cada una algo girada. Al pasar el mouse (en el teléfono no se muestran) la
// ficha se endereza, sube al frente y se agranda para poder leerla.
//
// Son registros de antepasados nacidos hasta 1901 (todos fallecidos); los años y
// lugares salen del propio archivo. No hay nadie vivo en esta página pública.

type Kind = "Nacimiento" | "Defunción" | "Matrimonio";

type Card = {
  kind: Kind;
  number: string;
  name: string;
  year: string;
  place?: string;
  /** Posición (% del área), giro en grados, tono del papel y desde dónde crece al agrandarse. */
  left: number;
  top: number;
  rot: number;
  paper: string;
  origin: string;
};

const PAPERS = ["#f7f4ed", "#efe8d9", "#f3eee2", "#eae3d2"];

const CARDS: Card[] = [
  // Capa de fondo: más fichas por debajo, para que el montón se vea lleno.
  { kind: "Nacimiento", number: "0037", name: "Francisca Balcazar Bravo", year: "1832", left: 18, top: 9, rot: -15, paper: PAPERS[3], origin: "left center" },
  { kind: "Nacimiento", number: "0064", name: "Jose Gregorio Balcazar Bravo", year: "1841", left: 49, top: 7, rot: 11, paper: PAPERS[1], origin: "center top" },
  { kind: "Nacimiento", number: "0129", name: "Juan Isidro Martinez Ruz", year: "1854", left: 31, top: 25, rot: -5, paper: PAPERS[2], origin: "center center" },
  { kind: "Nacimiento", number: "0152", name: "María Martínez Ruz", year: "1863", left: 61, top: 23, rot: 14, paper: PAPERS[0], origin: "right center" },
  { kind: "Nacimiento", number: "0204", name: "Ascención Rodríguez Sepúlveda", year: "1867", left: 5, top: 45, rot: 6, paper: PAPERS[3], origin: "left center" },
  { kind: "Matrimonio", number: "0121", name: "Juan Isidro Martinez Ruz y Elena Varas Sepulveda", year: "1885", place: "Curicó", left: 38, top: 44, rot: -9, paper: PAPERS[1], origin: "center center" },
  { kind: "Nacimiento", number: "0011", name: "Isidoro Balcazar Bravo", year: "1810", left: 2, top: 1, rot: -9, paper: PAPERS[0], origin: "left top" },
  { kind: "Matrimonio", number: "0147", name: "Daniel Zamora y Natividad Galdamez", year: "1881", place: "San Esteban", left: 33, top: 0, rot: 5, paper: PAPERS[2], origin: "center top" },
  { kind: "Nacimiento", number: "0103", name: "Pabla Araya Zuñiga", year: "1826", left: 62, top: 3, rot: -4, paper: PAPERS[1], origin: "right top" },
  { kind: "Defunción", number: "0210", name: "Eugenio Balcázar Bravo", year: "1886", place: "Santiago", left: 14, top: 16, rot: 8, paper: PAPERS[3], origin: "left center" },
  { kind: "Nacimiento", number: "0302", name: "Rosa Elvira Canelo Frez", year: "1896", place: "Quillota", left: 47, top: 17, rot: -12, paper: PAPERS[0], origin: "center center" },
  { kind: "Matrimonio", number: "0058", name: "Isidoro Balcazar Bravo y Pabla Araya Zuñiga", year: "1849", place: "Buin", left: 0, top: 32, rot: -3, paper: PAPERS[2], origin: "left center" },
  { kind: "Nacimiento", number: "0187", name: "Juan de Dios Ruz Ibarra", year: "1842", place: "Curicó", left: 29, top: 35, rot: 11, paper: PAPERS[1], origin: "center center" },
  { kind: "Defunción", number: "0264", name: "Juan Balcazar Araya", year: "1898", place: "Santiago", left: 63, top: 33, rot: 7, paper: PAPERS[3], origin: "right center" },
  { kind: "Nacimiento", number: "0229", name: "Regina Zamora Galdamez", year: "1893", place: "Cancha del Llano", left: 13, top: 51, rot: -7, paper: PAPERS[0], origin: "left center" },
  { kind: "Matrimonio", number: "0091", name: "Juan de Dios Ruz Ibarra y María Martínez Ruz", year: "1890", place: "Curicó", left: 46, top: 52, rot: 3, paper: PAPERS[2], origin: "center center" },
  { kind: "Nacimiento", number: "0341", name: "Pedro Zamora Galdamez", year: "1901", place: "La Placilla", left: 0, top: 68, rot: 10, paper: PAPERS[1], origin: "left bottom" },
  { kind: "Defunción", number: "0252", name: "Juan Isidro Martinez Ruz", year: "1889", place: "Potrero Grande", left: 31, top: 71, rot: -10, paper: PAPERS[3], origin: "center bottom" },
  { kind: "Nacimiento", number: "0318", name: "Margarita Balcazar Gonzalez", year: "1901", place: "Hacienda Chada", left: 63, top: 66, rot: 6, paper: PAPERS[0], origin: "right bottom" },
  { kind: "Nacimiento", number: "0176", name: "Carlota de las Mercedes Quintero García", year: "1857", left: 58, top: 49, rot: -6, paper: PAPERS[2], origin: "right center" },
];

type Content = Pick<Card, "kind" | "number" | "name" | "year" | "place">;

// Las fichas de la pantalla de entrar: otras personas (todas fallecidas), con la misma disposición.
const LOGIN_CONTENT: Content[] = [
  { kind: "Nacimiento", number: "0412", name: "María Martínez Ruz", year: "1863", place: "Romeral" },
  { kind: "Matrimonio", number: "0233", name: "Bruno Gonzalez Quinteros y Rosa Eade Bahamonde", year: "1912", place: "Paine" },
  { kind: "Nacimiento", number: "0388", name: "Isaias del Carmen Gonzalez Quinteros", year: "1885" },
  { kind: "Defunción", number: "0197", name: "Guadalupe del Carmen Gonzalez Quinteros", year: "1887" },
  { kind: "Nacimiento", number: "0361", name: "José Manuel Concha", year: "1866" },
  { kind: "Nacimiento", number: "0275", name: "Sara del Carmen Ruz Martínez", year: "1892", place: "Romeral, Curicó" },
  { kind: "Nacimiento", number: "0420", name: "Rosa del Carmen Eade Bahamonde", year: "1866" },
  { kind: "Matrimonio", number: "0309", name: "Vicente Concha Eade e Isabel Arros Concha", year: "1911" },
  { kind: "Nacimiento", number: "0144", name: "Maria Jesus Ruz Martinez", year: "1895", place: "Romeral, Curicó" },
  { kind: "Defunción", number: "0356", name: "Jenoveva del Carmen Gonzalez Quinteros", year: "1894" },
  { kind: "Nacimiento", number: "0299", name: "Celedonio Segundo Morales Aravena", year: "1887" },
  { kind: "Matrimonio", number: "0172", name: "Francisco Javier Gonzalez Quinteros y María Pineda Rodríguez", year: "1921", place: "Paine" },
  { kind: "Nacimiento", number: "0341", name: "Vicente Concha Eade", year: "1888" },
  { kind: "Defunción", number: "0418", name: "Pedro Balcazar Araya", year: "1908", place: "Buin" },
  { kind: "Nacimiento", number: "0267", name: "Maria Virjinia Gonzalez Quinteros", year: "1890" },
  { kind: "Matrimonio", number: "0385", name: "Luis Balcazar y Juana Barroso Ruz", year: "1936", place: "Culitrín" },
  { kind: "Nacimiento", number: "0215", name: "Manuela del Carmen Gonzalez Quinteros", year: "1899" },
  { kind: "Defunción", number: "0322", name: "Bruno del Carmen Gonzalez Quinteros", year: "1888" },
  { kind: "Nacimiento", number: "0404", name: "Estervina Balcazar Gonzalez", year: "1906" },
  { kind: "Nacimiento", number: "0159", name: "Maria Salomé Gonzalez Quinteros", year: "1898" },
];
export const LOGIN_CARDS: Card[] = CARDS.map((c, i) => ({ ...c, place: undefined, ...LOGIN_CONTENT[i] }));

function Sheet({ card }: { card: Card }) {
  return (
    <div
      tabIndex={-1}
      className="group absolute w-[var(--w)] cursor-pointer rounded-md px-3 pb-2.5 pt-2 text-ink shadow-[0_6px_14px_-4px_rgba(0,0,0,0.65)] outline-none transition-[transform,box-shadow] duration-300 ease-out [transform:rotate(var(--r))] hover:z-50 hover:shadow-[0_28px_44px_-12px_rgba(0,0,0,0.85)] hover:[transform:rotate(0deg)_scale(var(--s))] focus:z-50 focus:shadow-[0_28px_44px_-12px_rgba(0,0,0,0.85)] focus:[transform:rotate(0deg)_scale(var(--s))] motion-reduce:transition-none sm:px-3.5 sm:pt-2.5"
      style={
        {
          left: `min(${card.left}%, calc(100% - var(--w)))`,
          top: `${card.top}%`,
          background: card.paper,
          transformOrigin: card.origin,
          "--r": `${card.rot}deg`,
        } as React.CSSProperties
      }
    >
      <div className="flex items-center justify-between font-maquina text-[0.7rem] uppercase tracking-[0.1em] text-gris sm:text-[0.72rem]">
        <span>{card.kind}</span>
        <span>N.º {card.number}</span>
      </div>
      <div className="mt-0.5 h-px bg-terra" aria-hidden="true" />
      <p className="mt-1.5 font-maquina text-[0.9rem] leading-tight sm:text-[1rem]">{card.name}</p>
      <p className="mt-1.5 font-maquina text-[0.75rem] text-gris sm:text-[0.8rem]">
        {card.year}
        {card.place ? ` · ${card.place}` : ""}
      </p>
    </div>
  );
}

export default function ScatteredCards({ className = "", cards = CARDS }: { className?: string; cards?: Card[] }) {
  return (
    <div
      aria-hidden="true"
      className={`relative [--s:1.4] [--w:9.75rem] sm:[--s:1.6] sm:[--w:12rem] ${className}`}
    >
      {cards.map((c) => (
        <Sheet key={c.number} card={c} />
      ))}
    </div>
  );
}
