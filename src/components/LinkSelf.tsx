"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { linkMyself } from "@/app/actions/perfil";
import PersonPicker, { type PersonRef } from "./PersonPicker";
import { Notice, buttonClass } from "./ui";

/** "¿Quién eres en el árbol?": elegir la propia persona para que todo se lea desde uno mismo. */
export default function LinkSelf() {
  const router = useRouter();
  const [person, setPerson] = useState<PersonRef | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const confirm = () => {
    if (!person) return;
    setError(null);
    start(async () => {
      const r = await linkMyself(person.id);
      if (!r.ok) return setError(r.error ?? "No se pudo guardar.");
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <PersonPicker value={person} onChange={setPerson} placeholder="Escribe tu nombre" />
      {person && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={confirm} disabled={pending} className={buttonClass("principal")}>
            {pending ? "Guardando…" : `Sí, soy ${person.name}`}
          </button>
          <button type="button" onClick={() => setPerson(null)} disabled={pending} className={buttonClass("enlace")}>
            Elegir otra persona
          </button>
        </div>
      )}
      {error && <Notice kind="aviso">{error}</Notice>}
    </div>
  );
}
