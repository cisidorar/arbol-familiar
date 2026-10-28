"use client";

import { useRouter } from "next/navigation";
import SearchBox from "./SearchBox";

/** "¿A quién buscas?": el buscador del inicio; al elegir a alguien abre su ficha. */
export default function InicioSearch() {
  const router = useRouter();
  return (
    <div className="max-w-xl">
      <SearchBox
        label="¿A quién buscas?"
        labelClassName="!text-ink"
        onSelect={(id) => router.push(`/persona/${id}`)}
        placeholder="Escribe un nombre o un apellido"
        inputClassName="border-ink"
      />
    </div>
  );
}
