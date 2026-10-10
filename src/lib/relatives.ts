// Agregar a una persona nueva al árbol desde la tarjeta de un familiar suyo
// (el "+"): qué se puede agregar a cada quien, con qué datos parte el
// formulario y cómo se valida lo que llega. Lógica pura (sin base de datos
// ni React): la usan el formulario y el servidor, que nunca confía en lo que
// validó el navegador.

import { spanishDateToGedcom } from "./research";
import { validateEvent, validatePerson, type EventValues, type PersonValues, type Validation } from "./edit";

/** Qué es la persona nueva de aquella desde cuya tarjeta se agrega. */
export const RELATIONS = ["child", "sibling", "parent", "partner"] as const;
export type Relation = (typeof RELATIONS)[number];

/** Lo que el árbol sabe de una persona (ver getFamilyChartData). */
export type RelativeDatum = {
  id: string;
  data: {
    gender?: string;
    label?: string;
    surname_pat?: string;
    surname_mat?: string;
    is_living?: boolean;
    birth_year?: number | null;
    death_year?: number | null;
  };
  rels: { parents?: string[]; spouses?: string[]; children?: string[] };
};

export type RelativeOption = {
  relation: Relation;
  label: string;
  /** Por qué no se puede, si no se puede: se muestra en vez de esconder la opción. */
  blocked: string | null;
};

/** Qué familiares se le pueden agregar a esta persona, en el orden del menú. */
export function relativeOptions(of: RelativeDatum, byId: ReadonlyMap<string, RelativeDatum>): RelativeOption[] {
  const parents = (of.rels.parents ?? []).map((id) => byId.get(id)).filter((p): p is RelativeDatum => Boolean(p));
  const parentLabel =
    parents.length === 1 ? (parents[0].data.gender === "F" ? "Agregar a su padre" : "Agregar a su madre") : "Agregar a su padre o madre";
  return [
    { relation: "child", label: "Agregar hijo o hija", blocked: null },
    {
      relation: "sibling",
      label: "Agregar hermano o hermana",
      // Los hermanos se unen por sus padres: sin ninguno no hay de dónde colgarlos.
      blocked: parents.length ? null : "Primero agrega a su padre o a su madre",
    },
    { relation: "parent", label: parentLabel, blocked: parents.length >= 2 ? "Ya tiene padre y madre" : null },
    { relation: "partner", label: "Agregar pareja", blocked: null },
  ];
}

/** Título del formulario: "Nueva hija o hijo de …". */
export function relationTitle(relation: Relation, of: RelativeDatum, byId: ReadonlyMap<string, RelativeDatum>): string {
  const name = of.data.label || "esta persona";
  if (relation === "child") return `Hijo o hija de ${name}`;
  if (relation === "sibling") return `Hermano o hermana de ${name}`;
  if (relation === "partner") return `Pareja de ${name}`;
  const parent = (of.rels.parents ?? []).map((id) => byId.get(id)).find(Boolean);
  if (!parent) return `Padre o madre de ${name}`;
  return parent.data.gender === "F" ? `Padre de ${name}` : `Madre de ${name}`;
}

/** Hace cuántos años, como mucho, puede haber nacido alguien con un hijo que hoy viva. */
const MAX_PARENT_AGE_OF_LIVING = 130;
/** Lo mismo cuando solo se sabe cuándo murió ese padre o madre. */
const MAX_YEARS_SINCE_PARENT_DEATH = 70;

/** Desde qué edad se da por fallecido a alguien de quien no se sabe (igual que el importador). */
export const LIVING_CUTOFF_YEARS = 100;

/** El año de una fecha escrita en el formulario ("1908", "5 de mayo de 1908", "aprox. 1908"), o null. */
export function yearOfTypedDate(text: string): number | null {
  const m = /\b(\d{4})\b/.exec(text);
  return m ? Number(m[1]) : null;
}

export type RelativeDefaults = { surnamePat: string; surnameMat: string; sex: "M" | "F" | ""; isLiving: boolean };

/**
 * Con qué parte el formulario: los apellidos que le tocarían por la
 * costumbre (el paterno del padre y el paterno de la madre) y el sexo cuando
 * se deduce. Todo se puede cambiar antes de guardar.
 */
export function relativeDefaults(
  relation: Relation,
  of: RelativeDatum,
  otherParent: RelativeDatum | null,
  byId: ReadonlyMap<string, RelativeDatum>,
  currentYear: number = new Date().getFullYear(),
): RelativeDefaults {
  const pat = (d?: RelativeDatum | null) => d?.data.surname_pat ?? "";
  // Padres, hermanos y pareja suelen ser de su misma época: parten con su
  // mismo estado.
  const isLiving = of.data.is_living !== false;

  if (relation === "child") {
    const pair = [of, otherParent].filter((p): p is RelativeDatum => Boolean(p));
    const mother = pair.find((p) => p.data.gender === "F");
    const father = pair.find((p) => p !== mother);
    // Un hijo puede seguir vivo aunque su padre o madre haya muerto, si este
    // es de una época cercana. Sin ninguna fecha (lo habitual en los
    // antepasados lejanos), se parte por fallecido.
    const { birth_year: born, death_year: died } = of.data;
    const recent =
      typeof born === "number"
        ? currentYear - born <= MAX_PARENT_AGE_OF_LIVING
        : typeof died === "number" && currentYear - died <= MAX_YEARS_SINCE_PARENT_DEATH;
    return { surnamePat: pat(father), surnameMat: pat(mother), sex: "", isLiving: isLiving || recent };
  }
  if (relation === "sibling") {
    return { surnamePat: pat(of), surnameMat: of.data.surname_mat ?? "", sex: "", isLiving };
  }
  if (relation === "parent") {
    const known = (of.rels.parents ?? []).map((id) => byId.get(id)).find(Boolean);
    // Falta el del otro sexo; sin ninguno conocido, se parte por el padre.
    const sex = known?.data.gender === "M" ? "F" : "M";
    const surnamePat = sex === "M" ? pat(of) : (of.data.surname_mat ?? "");
    return { surnamePat, surnameMat: "", sex, isLiving };
  }
  return { surnamePat: "", surnameMat: "", sex: of.data.gender === "F" ? "M" : "F", isLiving };
}

/** Con quién puede haber tenido al hijo o hija: sus parejas, o nadie conocido. */
export function otherParentChoices(of: RelativeDatum, byId: ReadonlyMap<string, RelativeDatum>): RelativeDatum[] {
  return (of.rels.spouses ?? []).map((id) => byId.get(id)).filter((p): p is RelativeDatum => Boolean(p));
}

export type RelativeValues = {
  relation: Relation;
  /** La persona desde cuya tarjeta se agrega. */
  of: string;
  /** Solo para un hijo o hija: su otro padre o madre, si se conoce. */
  otherParentId: string | null;
  person: PersonValues;
  /** Su nacimiento, si se escribió una fecha. */
  birth: EventValues | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateRelative(input: unknown): Validation<RelativeValues> {
  const o = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const errors: Record<string, string> = {};

  const relation = RELATIONS.find((r) => r === o.relation) ?? null;
  if (!relation) errors.relation = "Elige qué familiar vas a agregar.";

  const of = typeof o.of === "string" && UUID.test(o.of) ? o.of : null;
  if (!of) errors.of = "Falta la persona a la que se le agrega el familiar.";

  let otherParentId: string | null = null;
  if (relation === "child" && o.otherParentId != null && o.otherParentId !== "") {
    if (typeof o.otherParentId === "string" && UUID.test(o.otherParentId) && o.otherParentId !== of) {
      otherParentId = o.otherParentId;
    } else {
      errors.otherParentId = "Elige con quién lo tuvo de la lista.";
    }
  }

  const person = validatePerson(o.person);
  if (!person.ok) Object.assign(errors, person.errors);

  let birth: EventValues | null = null;
  const rawBirth = typeof o.birthDate === "string" ? o.birthDate.trim() : "";
  if (rawBirth) {
    const event = validateEvent({ type: "BIRT", date: rawBirth });
    if (event.ok) birth = event.value;
    else errors.birthDate = event.errors.date ?? "No entiendo esa fecha.";
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { relation: relation!, of: of!, otherParentId, person: (person as { value: PersonValues }).value, birth } };
}

/** Para el historial: "como hijo/a de …". */
export function relationPhrase(relation: unknown, name: unknown): string | null {
  const who = typeof name === "string" && name ? name : "otra persona";
  if (relation === "child") return `Como hijo o hija de ${who}`;
  if (relation === "sibling") return `Como hermano o hermana de ${who}`;
  if (relation === "parent") return `Como padre o madre de ${who}`;
  if (relation === "partner") return `Como pareja de ${who}`;
  return null;
}

/**
 * La fecha tentativa de nacimiento de un hijo/a escrita en la ficha de sus
 * padres. Siempre es aproximada: "1885" se guarda como "aprox. 1885". Vacía =
 * quitarla (value null).
 */
export function validateChildBirthApprox(raw: unknown): Validation<{ text: string; from: string | null } | null> {
  const typed = typeof raw === "string" ? raw.trim().slice(0, 80) : "";
  if (!typed) return { ok: true, value: null };
  const parsed = spanishDateToGedcom(typed);
  if (!parsed) {
    return { ok: false, errors: { date: 'No entiendo esa fecha. Prueba "1885", "c. 1885" o "entre 1884 y 1887".' } };
  }
  const text = /^(ABT|EST|CAL|BEF|AFT|BET|FROM)\b/.test(parsed.text) ? parsed.text : `ABT ${parsed.text}`;
  return { ok: true, value: { text, from: parsed.from } };
}
