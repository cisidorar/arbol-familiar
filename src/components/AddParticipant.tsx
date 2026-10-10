"use client";

import { useId, useState } from "react";

export type NewParticipantPayload = {
  person: { given: string; surnamePat: string; surnameMat: string; sex: "M" | "F" | "U"; isLiving: boolean; notes: string };
  relation: "parent" | "child" | "sibling" | "partner" | null;
};

/** Parte "José David Saavedra Zamora" en nombres y dos apellidos. */
export function splitName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 3) return { given: parts.slice(0, -2).join(" "), pat: parts[parts.length - 2], mat: parts[parts.length - 1] };
  if (parts.length === 2) return { given: parts[0], pat: parts[1], mat: "" };
  return { given: parts[0] ?? "", pat: "", mat: "" };
}

const sexFromRole = (role: string): "M" | "F" | "U" => {
  const r = role.toLowerCase();
  if (/(madrina|madre|esposa|hermana|tía|abuela|suegra|cuñada)/.test(r)) return "F";
  if (/(padrino|padre|esposo|hermano|tío|abuelo|suegro|cuñado)/.test(r)) return "M";
  return "U";
};

const inputClass =
  "w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-900 outline-none placeholder:text-gray-400 focus:border-gray-900";

/**
 * Mini formulario bajo un padrino/testigo sin vincular: confirma el nombre y deja agregarlo al
 * árbol, con o sin parentesco con la persona de la ficha. Al guardar queda vinculado en el hecho.
 */
export default function AddParticipant({
  name,
  role,
  ownerName,
  onSubmit,
  onCancel,
}: {
  name: string;
  role: string;
  /** La persona de la ficha abierta: con ella se puede dar un parentesco. */
  ownerName: string;
  onSubmit: (payload: NewParticipantPayload) => Promise<string | null>;
  onCancel: () => void;
}) {
  const uid = useId();
  const initial = splitName(name);
  const [given, setGiven] = useState(initial.given);
  const [pat, setPat] = useState(initial.pat);
  const [mat, setMat] = useState(initial.mat);
  const [sex, setSex] = useState<"M" | "F" | "U">(sexFromRole(role));
  const [relation, setRelation] = useState<NewParticipantPayload["relation"]>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const problem = await onSubmit({
      person: { given: given.trim(), surnamePat: pat.trim(), surnameMat: mat.trim(), sex, isLiving: false, notes: `Aparece como ${role ? role.toLowerCase() : "persona relacionada"} en un hecho de ${ownerName}.` },
      relation,
    });
    setBusy(false);
    if (problem) setError(problem);
  }

  return (
    <form onSubmit={submit} className="mt-1.5 flex flex-col gap-2 rounded-lg border border-gray-200 bg-gray-50 p-2.5 text-xs">
      <p className="font-medium text-gray-700">Agregar al árbol a {name}</p>
      <div className="grid grid-cols-3 gap-1.5">
        <label className="col-span-3 flex flex-col gap-0.5 text-gray-500 sm:col-span-1" htmlFor={`${uid}-g`}>
          Nombres
          <input id={`${uid}-g`} value={given} onChange={(e) => setGiven(e.target.value)} className={inputClass} />
        </label>
        <label className="flex flex-col gap-0.5 text-gray-500" htmlFor={`${uid}-p`}>
          Apellido paterno
          <input id={`${uid}-p`} value={pat} onChange={(e) => setPat(e.target.value)} className={inputClass} />
        </label>
        <label className="flex flex-col gap-0.5 text-gray-500" htmlFor={`${uid}-m`}>
          Apellido materno
          <input id={`${uid}-m`} value={mat} onChange={(e) => setMat(e.target.value)} className={inputClass} />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <label className="flex flex-col gap-0.5 text-gray-500" htmlFor={`${uid}-s`}>
          Sexo
          <select id={`${uid}-s`} value={sex} onChange={(e) => setSex(e.target.value as "M" | "F" | "U")} className={inputClass}>
            <option value="U">No sé</option>
            <option value="F">Mujer</option>
            <option value="M">Hombre</option>
          </select>
        </label>
        <label className="flex flex-col gap-0.5 text-gray-500" htmlFor={`${uid}-r`}>
          Parentesco con {ownerName}
          <select
            id={`${uid}-r`}
            value={relation ?? ""}
            onChange={(e) => setRelation((e.target.value || null) as NewParticipantPayload["relation"])}
            className={inputClass}
          >
            <option value="">Ninguno por ahora</option>
            <option value="sibling">Es hermano/a</option>
            <option value="parent">Es padre o madre</option>
            <option value="child">Es hijo/a</option>
            <option value="partner">Es pareja</option>
          </select>
        </label>
      </div>
      {error && <p role="alert" className="text-red-600">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy || !(given.trim() || pat.trim())}
          className="rounded-md bg-gray-900 px-3 py-1.5 font-medium text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {busy ? "Agregando…" : "Agregar y vincular"}
        </button>
        <button type="button" onClick={onCancel} className="text-gray-500 underline decoration-gray-300 underline-offset-2 hover:text-gray-900">
          Cancelar
        </button>
      </div>
    </form>
  );
}
