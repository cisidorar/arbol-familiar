// Frases que se repiten en la guía de cementerios, la ficha y la página de la persona.
// Están aquí para que lo mismo se diga igual en las tres.

/** "Pariente (7 pasos en el árbol)" no le dice nada a nadie: "Pariente lejano". */
export const niceKin = (rel: string | null | undefined) => (rel ?? "").replace(/^Pariente \(\d+ pasos? en el árbol\)/i, "Pariente lejano");

/** "Fue cremado" / "Fue cremada" según se sabe. */
export const cremadoText = (sex: string | null | undefined) => (sex === "F" ? "Fue cremada" : sex === "M" ? "Fue cremado" : "Fue cremado/a");

/** "Fallecido" / "Fallecida" según se sabe. */
export const fallecidoText = (sex: string | null | undefined) => (sex === "F" ? "Fallecida" : sex === "M" ? "Fallecido" : "Fallecido/a");

/** Lo que se dice cuando no se sabe en qué parte del cementerio está la tumba. */
export const TOMB_UNKNOWN = "Aún no sabemos en qué parte del cementerio está. Pregunta a la familia.";

/** ¿El lugar anotado es una cremación (no un cementerio)? */
export const isCremationPlace = (text: string | null | undefined) => /^(cremad[oa]|cremaci[oó]n)\b/i.test((text ?? "").trim());
