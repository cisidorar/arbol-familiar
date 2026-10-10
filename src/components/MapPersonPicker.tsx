"use client";

import { useRouter } from "next/navigation";
import PersonPicker from "./PersonPicker";

/** Elige de quién ver el mapa de orígenes y va a ese mapa. */
export default function MapPersonPicker({ autoFocus = false }: { autoFocus?: boolean }) {
  const router = useRouter();
  return (
    <PersonPicker
      value={null}
      autoFocus={autoFocus}
      placeholder="Escribe el nombre de la persona"
      onChange={(p) => p && router.push(`/mapa?persona=${p.id}`)}
    />
  );
}
