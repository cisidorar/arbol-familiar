// Privacidad de las personas vivas: quien solo lee (rol «lector») ve de ellas
// el nombre, el año de nacimiento, el año de matrimonio y su parentesco; nada
// más (ni notas, ni lugares, ni fuentes, ni fotos). Quien edita ve todo.

import type { TimelineEntry } from "./timeline";

/** Hechos de una persona viva que un lector puede ver, y solo con el año. */
const VISIBLE_KINDS = new Set(["BIRT", "MARR"]);

type Detail = {
  isLiving: boolean;
  notes: string;
  timeline: TimelineEntry[];
  media: unknown[];
  familiesAsPartner: { family_events?: unknown; [k: string]: unknown }[];
};

/** Deja en `detail` solo lo que un lector puede ver de una persona viva. Devuelve el mismo objeto. */
export function limitLiving<T extends Detail>(detail: T, canSeeAll: boolean): T {
  if (canSeeAll || !detail.isLiving) return detail;
  detail.notes = "";
  detail.media = [];
  detail.timeline = detail.timeline
    .filter((e) => VISIBLE_KINDS.has(e.kind))
    .map((e) => ({
      ...e,
      dateText: e.year != null ? String(e.year) : null,
      place: null,
      placeInfo: null,
      description: null,
      sources: [],
      participants: [],
      edit: null,
      needsReview: false,
      reviewNote: null,
      childApprox: null,
    }));
  detail.familiesAsPartner = detail.familiesAsPartner.map((f) => ({ ...f, family_events: null }));
  return detail;
}
