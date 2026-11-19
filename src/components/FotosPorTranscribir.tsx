import Link from "next/link";
import FotosActas from "./FotosActas";
import type { PhotoToTranscribe } from "@/lib/data/photos-to-transcribe";

/** Las fotos de actas guardadas en las fichas que aún no tienen la transcripción exacta. */
export default function FotosPorTranscribir({ fotos }: { fotos: PhotoToTranscribe[] }) {
  if (fotos.length === 0) return null;
  return (
    <section id="fotos-por-transcribir" aria-label="Fotos por transcribir" className="mt-10">
      <h2 className="al-titulo al-regla">Fotos por transcribir</h2>
      <p className="zb-texto mt-3 max-w-5xl">
        {fotos.length === 1 ? "Hay 1 foto" : `Hay ${fotos.length} fotos`} de actas en las fichas sin la transcripción exacta (o solo con una lectura
        parcial). Ábrelas, lee lo que dicen y pásame el texto tal como está escrito.
      </p>
      <ul className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {fotos.map((f) => (
          <li key={f.id} className="rounded-2xl border-2 border-line bg-white p-4">
            <FotosActas fotos={[f]} grande />
            {f.transcription && <p className="zb-apoyo mt-2 !text-teja">Solo hay lectura parcial.</p>}
            {f.personas.length > 0 && (
              <p className="zb-apoyo mt-2">
                Ficha:{" "}
                {f.personas.map((p, i) => (
                  <span key={p.id}>
                    {i > 0 && ", "}
                    <Link href={`/persona/${p.id}`} className="font-bold underline decoration-2 underline-offset-4 hover:text-teja">
                      {p.name}
                    </Link>
                  </span>
                ))}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
