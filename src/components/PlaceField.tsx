"use client";

import { useMemo, useState } from "react";
import { COMUNAS } from "@/lib/geo/places";
import { composePlace, splitPlace } from "@/lib/geo/place-text";
import { REGION_NAMES } from "@/lib/geo/regions-light";

const fieldClass =
  "mt-1.5 min-h-12 w-full min-w-0 max-w-full rounded-lg border-2 border-[#b9b5aa] bg-white px-3.5 py-2 text-[1.0625rem] text-gray-900 outline-none placeholder:text-gray-400 focus:border-hombre focus:ring-4 focus:ring-hombre/20 disabled:bg-[#f3f1ec] disabled:text-gray-400";
const labelClass = "block text-base font-semibold text-gray-800";
const linkBtn =
  "min-h-11 self-start py-2 text-base font-bold text-ink underline decoration-2 underline-offset-4 hover:text-terra";

/** Comunas de una región, en orden alfabético. */
const COMUNAS_BY_REGION = new Map<string, [string, string][]>();
for (const [code, name, region] of COMUNAS) {
  COMUNAS_BY_REGION.set(region, [...(COMUNAS_BY_REGION.get(region) ?? []), [code, name]]);
}
for (const list of COMUNAS_BY_REGION.values()) list.sort((a, b) => a[1].localeCompare(b[1], "es"));

/**
 * Dónde pasó un hecho (nació, murió…): región y comuna de una lista, y el lugar exacto
 * (hospital, domicilio, fundo…) escrito. Se guarda como un solo texto con la comuna al final,
 * que es como el resto del archivo reconoce la comuna. Si el lugar es de afuera de Chile o
 * no calza con una comuna, se escribe libre.
 */
export default function PlaceField({
  id,
  value,
  onChange,
  label = "Lugar",
  detailLabel = "Lugar exacto (opcional)",
  detailHint = "Hospital, domicilio, fundo…",
}: {
  id: string;
  value: string;
  onChange: (place: string) => void;
  label?: string;
  detailLabel?: string;
  detailHint?: string;
}) {
  // Se calcula al abrir: después manda lo que elige la persona.
  const initial = useMemo(() => (value.trim() ? splitPlace(value) : null), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [free, setFree] = useState(Boolean(value.trim()) && !initial);
  const [region, setRegion] = useState(initial?.regionCode ?? "");
  const [comuna, setComuna] = useState(initial?.comunaCode ?? "");
  const [detail, setDetail] = useState(initial?.detail ?? "");

  const comunaName = COMUNAS.find((c) => c[0] === comuna)?.[1] ?? "";
  const regionName = REGION_NAMES.find((r) => r[0] === region)?.[1] ?? "";

  if (free) {
    return (
      <div className="flex min-w-0 flex-col">
        <label htmlFor={`${id}-free`} className={labelClass}>
          {label}
        </label>
        <input
          id={`${id}-free`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="p. ej. Hospital San Juan de Dios, Mendoza, Argentina"
          className={fieldClass}
        />
        <button
          type="button"
          onClick={() => {
            const s = value.trim() ? splitPlace(value) : null;
            setRegion(s?.regionCode ?? "");
            setComuna(s?.comunaCode ?? "");
            setDetail(s?.detail ?? (s ? "" : value));
            setFree(false);
          }}
          className={linkBtn}
        >
          Elegir región y comuna
        </button>
      </div>
    );
  }

  const comunas = region ? COMUNAS_BY_REGION.get(region) ?? [] : [];

  return (
    <fieldset className="flex min-w-0 flex-col gap-4">
      <legend className={labelClass}>{label}</legend>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="min-w-0">
          <label htmlFor={`${id}-region`} className={labelClass}>
            Región
          </label>
          <select
            id={`${id}-region`}
            value={region}
            onChange={(e) => {
              setRegion(e.target.value);
              setComuna("");
              onChange(composePlace(detail, ""));
            }}
            className={fieldClass}
          >
            <option value="">Elige la región</option>
            {REGION_NAMES.map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-0">
          <label htmlFor={`${id}-comuna`} className={labelClass}>
            Comuna
          </label>
          <select
            id={`${id}-comuna`}
            value={comuna}
            disabled={!region}
            onChange={(e) => {
              setComuna(e.target.value);
              onChange(composePlace(detail, COMUNAS.find((c) => c[0] === e.target.value)?.[1] ?? ""));
            }}
            className={fieldClass}
          >
            <option value="">{region ? "Elige la comuna" : "Primero la región"}</option>
            {comunas.map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="min-w-0">
        <label htmlFor={`${id}-detail`} className={labelClass}>
          {detailLabel}
        </label>
        <input
          id={`${id}-detail`}
          value={detail}
          onChange={(e) => {
            setDetail(e.target.value);
            onChange(composePlace(e.target.value, comunaName));
          }}
          placeholder={detailHint}
          className={fieldClass}
        />
      </div>
      {value.trim() && (
        <p className="break-words rounded-xl bg-[#e5f1ea] px-4 py-2.5 text-base leading-snug text-gray-900">
          <span className="font-bold">{value}</span>
          {regionName && comunaName ? <span className="text-gray-600"> · {regionName}</span> : null}
        </p>
      )}
      <button
        type="button"
        onClick={() => {
          setFree(true);
        }}
        className={linkBtn}
      >
        El lugar está fuera de Chile o no está en la lista
      </button>
    </fieldset>
  );
}
