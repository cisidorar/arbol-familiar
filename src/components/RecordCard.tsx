// Ficha de archivo inclinada (bautismo, matrimonio, nacimiento) de la portada y
// de la pantalla de entrada. Son ejemplos de antepasados fallecidos: nada de lo
// que se ve acá es un dato privado.

export default function RecordCard({
  kind,
  number,
  name,
  year,
  place,
  compact = false,
  className = "",
}: {
  kind: string;
  number: string;
  name: string;
  year: string;
  place?: string;
  /** Año y lugar en una sola línea ("1881 · San Esteban"). */
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`absolute w-[17.5rem] rounded-md bg-[#f7f4ed] px-5 pb-4 pt-3 text-ink shadow-[0_18px_30px_-12px_rgba(0,0,0,0.7)] sm:w-80 ${className}`}
    >
      <div className="flex items-center justify-between font-maquina text-[0.7rem] uppercase tracking-[0.18em] text-gris">
        <span>{kind}</span>
        <span>N.º {number}</span>
      </div>
      <div className="mt-1 h-px bg-terra" aria-hidden="true" />
      <p className="mt-2.5 font-maquina text-[1.15rem] leading-tight sm:text-xl">{name}</p>
      {compact ? (
        <p className="mt-2.5 font-maquina text-[0.8rem] text-gris sm:text-sm">
          {year}
          {place ? ` · ${place}` : ""}
        </p>
      ) : (
        <dl className="mt-2.5 grid grid-cols-[3rem_1fr] gap-y-0.5 text-[0.8rem] text-gris sm:text-sm">
          <dt>Año</dt>
          <dd className="font-maquina text-ink">{year}</dd>
          {place && (
            <>
              <dt>Lugar</dt>
              <dd className="font-maquina text-ink">{place}</dd>
            </>
          )}
        </dl>
      )}
    </div>
  );
}
