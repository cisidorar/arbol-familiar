// Marca «por revisar» de los hechos en la base (columna events.needs_review).

import { getSession } from "../auth/session";
import { canAdmin } from "../auth/roles";
import { getPool } from "../db/pool";
import { eventLabel } from "../timeline";

/**
 * Las marcas «por revisar» son solo para quienes administran el archivo: el resto
 * no las ve ni en el árbol ni en la ficha. Se mira la sesión de quien hace el pedido;
 * fuera de un pedido (un script) no hay sesión y no se muestran.
 */
export async function viewerCanReview(): Promise<boolean> {
  try {
    const session = await getSession();
    return !!session && canAdmin(session.role);
  } catch {
    return false;
  }
}

export type ReviewPerson = {
  id: string;
  name: string;
  birthYear: number | null;
  deathYear: number | null;
  isLiving: boolean;
  /** ¿Ya están sus padres en el árbol? Si no, un acta suele nombrarlos. */
  parentsKnown: boolean;
};

export type ReviewPriority = { level: "alta" | "media" | "baja"; score: number; reason: string };

/** Un hecho marcado «por revisar», con lo que hace falta para ir a buscarlo. */
export type ReviewTask = {
  eventId: string;
  /** Tipo de pendiente (REVIEW_KINDS). */
  kind: string;
  /** Comentario opcional de quien dejó el pendiente. */
  note: string | null;
  /** "Bautismo", "Matrimonio", o el nombre del hecho. */
  label: string;
  year: number | null;
  dateText: string | null;
  place: string | null;
  /** Fuente con enlace que ya tiene el hecho (la ficha de FamilySearch, por ejemplo). */
  source: { title: string; url: string } | null;
  /** De quién es el hecho: una persona, o los dos de la pareja (matrimonio). */
  people: ReviewPerson[];
  /** Qué tanto puede responder este pendiente (ver priorityOf). */
  priority: ReviewPriority;
};

const FIRST = (name: string) => name.split(" ")[0];

/**
 * Qué pendiente puede dar más respuestas. Cuentan: el tipo de acta (bautismo, nacimiento y
 * matrimonio nombran a los padres; la defunción también, en menor medida), que la persona aún
 * no tenga padres en el árbol (cada acta abre una rama nueva) y que ya esté la fuente a un
 * toque. Sirve para decidir por cuál empezar en el centro de FamilySearch.
 */
export function priorityOf(eventType: string, people: ReviewPerson[], hasSource: boolean): ReviewPriority {
  const names = (list: ReviewPerson[]) => list.map((p) => FIRST(p.name)).join(" y ");
  const parentsKind = ["BIRT", "BAPM", "CHR", "MARR"].includes(eventType) ? 3 : ["DEAT", "BURI"].includes(eventType) ? 2 : 1;
  const orphans = people.filter((p) => !p.parentsKnown);
  let score = parentsKind;
  if (parentsKind >= 2 && orphans.length) score += 3;
  if (hasSource) score += 1;
  if (people.some((p) => !p.isLiving)) score += 1;
  const level = score >= 7 ? "alta" : score >= 5 ? "media" : "baja";
  let reason: string;
  if (orphans.length && parentsKind >= 2) {
    const doc = eventType === "MARR" ? "Un matrimonio" : eventType === "DEAT" || eventType === "BURI" ? "Una defunción" : "Un acta de nacimiento o bautismo";
    reason = `${doc} suele nombrar a los padres de ${names(orphans)}, que aún no están en el árbol.`;
  } else if (parentsKind >= 2) {
    reason = "Confirma fechas, lugar y parentescos de una rama que ya conocemos.";
  } else {
    reason = "Completa un dato suelto de la ficha.";
  }
  return { level, score, reason };
}

/** Los hechos marcados «por revisar», con su tipo (para la página Pendientes). Primero los que más pueden responder. */
export async function listReview(treeId: string): Promise<ReviewTask[]> {
  const { rows } = await getPool().query(
    `select e.id, e.event_type as etype, e.review_kind, e.review_note, e.event_type, e.event_subtype, e.description, e.date_text,
            extract(year from coalesce(e.date_from, e.date_to))::int as year,
            coalesce(pl.normalized, pl.raw_text) as place,
            src.title as source_title, src.url as source_url,
            p.id as person_id, p.is_living, n.display_name,
            (select extract(year from b.date_from)::int from events b where b.person_id = p.id and b.event_type = 'BIRT' order by b.date_from nulls last, b.id limit 1) as birth_year,
            (select extract(year from d.date_from)::int from events d where d.person_id = p.id and d.event_type = 'DEAT' order by d.date_from nulls last, d.id limit 1) as death_year,
            exists (select 1 from family_children fc where fc.child_id = p.id) as parents_known
     from events e
     left join places pl on pl.id = e.place_id
     left join lateral (
       select s.title, s.url
       from citations c join sources s on s.id = c.source_id
       where c.event_id = e.id and s.url is not null
       order by c.created_at limit 1
     ) src on true
     join persons p on p.tree_id = e.tree_id
      and (p.id = e.person_id
           or p.id in (select partner1_id from families where id = e.family_id)
           or p.id in (select partner2_id from families where id = e.family_id))
     left join person_names n on n.person_id = p.id and n.is_primary
     where e.tree_id = $1 and e.needs_review`,
    [treeId],
  );
  const tasks = new Map<string, ReviewTask>();
  const etypes = new Map<string, string>();
  for (const r of rows) {
    const id = r.id as string;
    let t = tasks.get(id);
    if (!t) {
      t = {
        eventId: id,
        kind: (r.review_kind as string | null) ?? "familysearch_presencial",
        note: (r.review_note as string | null) ?? null,
        label: eventLabel(r.event_type as string, (r.event_subtype as string | null) ?? null, (r.description as string | null) ?? null),
        year: (r.year as number | null) ?? null,
        dateText: (r.date_text as string | null) ?? null,
        place: (r.place as string | null) ?? null,
        source: r.source_url ? { title: (r.source_title as string | null) ?? (r.source_url as string), url: r.source_url as string } : null,
        people: [],
        priority: { level: "baja", score: 0, reason: "" },
      };
      etypes.set(id, r.etype as string);
      tasks.set(id, t);
    }
    t.people.push({
      id: r.person_id as string,
      name: (r.display_name as string | null) ?? "(sin nombre)",
      birthYear: (r.birth_year as number | null) ?? null,
      deathYear: (r.death_year as number | null) ?? null,
      isLiving: r.is_living as boolean,
      parentsKnown: r.parents_known as boolean,
    });
  }
  for (const t of tasks.values()) t.priority = priorityOf(etypes.get(t.eventId) ?? "", t.people, !!t.source);
  const born = (t: ReviewTask) => Math.min(...t.people.map((p) => p.birthYear ?? 9999));
  return [...tasks.values()].sort(
    (a, b) => b.priority.score - a.priority.score || born(a) - born(b) || (a.year ?? 9999) - (b.year ?? 9999) || a.people[0].name.localeCompare(b.people[0].name, "es"),
  );
}
