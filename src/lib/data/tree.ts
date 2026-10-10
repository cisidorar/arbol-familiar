import { getPool } from "../db/pool";
import { approxAgeAtDeath, dateForEditing, diedAsChild, researchFactForm } from "../edit";
import { applyResearch } from "../research";
import {
  describeEvent,
  displayDateText,
  eventLabel,
  isApproxDate,
  rangeEnd,
  sortTimeline,
  type TimelineEntry,
} from "../timeline";
import { loadResearch } from "./research-file";

export async function getDefaultTreeId(): Promise<string | null> {
  const { rows } = await getPool().query(
    `select id from trees order by created_at asc limit 1`,
  );
  return rows[0]?.id ?? null;
}

// node-postgres devuelve las columnas `date` como objetos Date (en UTC), no strings.
function yearOf(dateFrom: string | Date | null): number | null {
  if (!dateFrom) return null;
  if (dateFrom instanceof Date) return dateFrom.getUTCFullYear();
  return Number(dateFrom.slice(0, 4));
}

/** Datos con la forma que espera family-chart: { id, data, rels }. */
export async function getFamilyChartData(treeId: string) {
  // Fase 2: no mostramos fotos todavía (los enlaces de MyHeritage están vencidos
  // y no hay un endpoint que las sirva), así que ni siquiera consultamos el avatar.
  const { rows: persons } = await getPool().query(
    `select p.id, p.sex, p.is_living,
            n.given_names, n.surname_pat, n.surname_mat, n.display_name,
            (select date_from from events e where e.person_id = p.id and e.event_type = 'BIRT' order by e.date_from nulls last, e.id limit 1) as birth_from,
            (select date_from from events e where e.person_id = p.id and e.event_type = 'DEAT' order by e.date_from nulls last, e.id limit 1) as death_from,
            (select description from events e where e.person_id = p.id and e.event_type = 'DEAT' order by e.date_from nulls last, e.id limit 1) as death_text
     from persons p
     left join person_names n on n.person_id = p.id and n.is_primary
     where p.tree_id = $1`,
    [treeId],
  );

  const { rows: families } = await getPool().query(
    `select f.id, f.partner1_id, f.partner2_id,
            coalesce(array_agg(fc.child_id) filter (where fc.child_id is not null), '{}') as child_ids
     from families f
     left join family_children fc on fc.family_id = f.id
     where f.tree_id = $1
     group by f.id`,
    [treeId],
  );

  // Año del matrimonio de cada unión: para dibujar las parejas de alguien en el orden en que
  // ocurrieron (y no en el que salieron de la base).
  const { rows: marriages } = await getPool().query(
    `select family_id, min(date_from) as d from events
     where tree_id = $1 and event_type = 'MARR' and family_id is not null group by family_id`,
    [treeId],
  );
  const marrYear = new Map<string, number | null>(marriages.map((r) => [r.family_id as string, yearOf(r.d)]));
  const cards = new Map(persons.map((p) => [p.id as string, cardData(p)]));
  const yearOfPerson = (id: string) => {
    const d = cards.get(id);
    return d ? (d.birth_year ?? d.est_birth_year ?? null) : null;
  };

  const parentsOf = new Map<string, string[]>();
  const childrenOf = new Map<string, string[]>();
  // pareja -> año de referencia de la unión (matrimonio o primer hijo; Infinity si no se sabe)
  const spousesOf = new Map<string, Map<string, number>>();

  for (const f of families) {
    const partners = [f.partner1_id, f.partner2_id].filter(Boolean) as string[];
    for (const child of f.child_ids as string[]) {
      parentsOf.set(child, [...(parentsOf.get(child) ?? []), ...partners]);
      for (const partner of partners) {
        childrenOf.set(partner, [...(childrenOf.get(partner) ?? []), child]);
      }
    }
    if (partners.length === 2) {
      const [a, b] = partners;
      const years = [marrYear.get(f.id as string) ?? null, ...(f.child_ids as string[]).map(yearOfPerson)].filter(
        (y): y is number => y != null,
      );
      const key = years.length ? Math.min(...years) : Infinity;
      if (!spousesOf.has(a)) spousesOf.set(a, new Map());
      if (!spousesOf.has(b)) spousesOf.set(b, new Map());
      for (const [x, y] of [[a, b], [b, a]] as const) {
        const m = spousesOf.get(x)!;
        m.set(y, Math.min(m.get(y) ?? Infinity, key));
      }
    }
  }
  const orderedSpouses = (id: string) =>
    [...(spousesOf.get(id) ?? new Map<string, number>())].sort((x, y) => x[1] - y[1]).map(([sp]) => sp);

  return persons.map((p) => ({
    id: p.id as string,
    data: cards.get(p.id as string)!,
    rels: {
      parents: parentsOf.get(p.id) ?? [],
      children: childrenOf.get(p.id) ?? [],
      spouses: orderedSpouses(p.id as string),
    },
  }));
}

/** Lo que muestra la tarjeta de una persona en el árbol. */
function cardData(p: {
  sex: string | null;
  is_living: boolean;
  given_names: string | null;
  surname_pat: string | null;
  surname_mat: string | null;
  display_name: string | null;
  birth_from: string | Date | null;
  death_from: string | Date | null;
  death_text: string | null;
}) {
  const birthYear = yearOf(p.birth_from);
  const deathYear = yearOf(p.death_from);
  return {
    gender: p.sex === "F" ? "F" : "M",
    first_name: p.given_names ?? "",
    last_name: [p.surname_pat, p.surname_mat].filter(Boolean).join(" "),
    // Por separado, para proponer los apellidos de un familiar que se agrega.
    surname_pat: p.surname_pat ?? "",
    surname_mat: p.surname_mat ?? "",
    label: p.display_name ?? "(sin nombre)",
    birth_year: birthYear,
    // Sin nacimiento conocido, el año que sale de la edad anotada al morir: solo para ordenar hermanos.
    est_birth_year: (() => {
      const age = approxAgeAtDeath(p.death_text);
      return birthYear == null && deathYear != null && age != null ? deathYear - age : null;
    })(),
    death_year: deathYear,
    is_living: p.is_living,
    // Murió siendo niño/a: silueta infantil en la tarjeta. Se calcula por año
    // (no siempre hay día y mes), así que es aproximado; sin nacimiento
    // conocido, por la edad aproximada anotada en su defunción.
    is_child: diedAsChild(birthYear, deathYear, approxAgeAtDeath(p.death_text)),
  };
}

/** La tarjeta de una sola persona, para refrescarla en el árbol después de editarla. */
export async function getPersonCard(treeId: string, personId: string) {
  const { rows } = await getPool().query(
    `select p.id, p.sex, p.is_living,
            n.given_names, n.surname_pat, n.surname_mat, n.display_name,
            (select date_from from events e where e.person_id = p.id and e.event_type = 'BIRT' order by e.date_from nulls last, e.id limit 1) as birth_from,
            (select date_from from events e where e.person_id = p.id and e.event_type = 'DEAT' order by e.date_from nulls last, e.id limit 1) as death_from,
            (select description from events e where e.person_id = p.id and e.event_type = 'DEAT' order by e.date_from nulls last, e.id limit 1) as death_text
     from persons p
     left join person_names n on n.person_id = p.id and n.is_primary
     where p.tree_id = $1 and p.id = $2`,
    [treeId, personId],
  );
  return rows[0] ? cardData(rows[0]) : null;
}

export async function searchPersons(treeId: string, query: string) {
  const normalized = query
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  const { rows } = await getPool().query(
    `select p.id, n.display_name,
            (select date_from from events e where e.person_id = p.id and e.event_type = 'BIRT' order by e.date_from nulls last, e.id limit 1) as birth_from,
            p.is_living
     from persons p
     join person_names n on n.person_id = p.id and n.is_primary
     where p.tree_id = $1 and n.search_key like '%' || $2 || '%'
     order by n.display_name
     limit 30`,
    [treeId, normalized],
  );
  return rows.map((r) => ({
    id: r.id as string,
    displayName: r.display_name as string,
    birthYear: yearOf(r.birth_from),
    isLiving: r.is_living as boolean,
  }));
}

const BIRTH_YEAR_SQL = `(select date_from from events e where e.person_id = p.id and e.event_type = 'BIRT' order by e.date_from nulls last, e.id limit 1)`;
const DEATH_YEAR_SQL = `(select date_from from events e where e.person_id = p.id and e.event_type = 'DEAT' order by e.date_from nulls last, e.id limit 1)`;

/**
 * Hechos de data/investigacion.json que ya no se muestran para esta persona
 * porque se editaron o borraron en la app. Si la tabla todavía no existe
 * (falta correr `npm run db:migrate`) no hay ninguno.
 */
async function hiddenResearchKeys(personId: string): Promise<Set<string>> {
  try {
    const { rows } = await getPool().query(`select fact_key from research_overrides where person_id = $1`, [personId]);
    return new Set(rows.map((r) => r.fact_key as string));
  } catch (err) {
    if ((err as { code?: string }).code === "42P01") return new Set();
    throw err;
  }
}

export async function getPersonDetail(treeId: string, personId: string) {
  const { rows: personRows } = await getPool().query(
    `select p.*, n.display_name, n.given_names, n.surname_pat, n.surname_mat
     from persons p
     left join person_names n on n.person_id = p.id and n.is_primary
     where p.tree_id = $1 and p.id = $2`,
    [treeId, personId],
  );
  const person = personRows[0];
  if (!person) return null;

  const { rows: ownEvents } = await getPool().query(
    `select e.id, e.event_type, e.event_subtype, e.date_text, e.description, e.origin,
            to_char(e.date_from, 'YYYY-MM-DD') as date_from,
            to_char(e.date_to, 'YYYY-MM-DD') as date_to,
            pl.raw_text as place_text
     from events e
     left join places pl on pl.id = e.place_id
     where e.person_id = $1
     order by e.date_from nulls last`,
    [personId],
  );

  // Fuentes con enlace citadas en cada hecho (las que se agregan al editar).
  const { rows: eventSources } = await getPool().query(
    `select c.event_id, s.title, s.url, c.transcription as quote
     from citations c join sources s on s.id = c.source_id
     where c.event_id = any($1::uuid[]) and s.url is not null
     order by c.created_at`,
    [ownEvents.map((e) => e.id)],
  );
  const sourcesOf = new Map<string, { title: string; url: string; quote: string | null }[]>();
  for (const r of eventSources) {
    const list = sourcesOf.get(r.event_id) ?? [];
    list.push({ title: r.title ?? r.url, url: r.url, quote: r.quote });
    sourcesOf.set(r.event_id, list);
  }

  // Personas relacionadas con cada hecho propio (padrinos, testigos…):
  // vinculadas (con su nombre actual) o solo su nombre, si no están en el árbol.
  const { rows: participantRows } = await getPool().query(
    `select ep.id, ep.event_id, ep.role, ep.name_text, ep.person_id, n.display_name
     from event_participants ep
     left join person_names n on n.person_id = ep.person_id and n.is_primary
     where ep.event_id = any($1::uuid[])
     order by ep.position`,
    [ownEvents.map((e) => e.id)],
  );
  const participantsOf = new Map<string, { id: string; role: string; name: string; personId: string | null }[]>();
  for (const r of participantRows) {
    const list = participantsOf.get(r.event_id) ?? [];
    list.push({ id: r.id, role: r.role, name: r.person_id ? (r.display_name ?? r.name_text) : r.name_text, personId: r.person_id });
    participantsOf.set(r.event_id, list);
  }

  const { rows: editedBy } = person.edited_by
    ? await getPool().query(`select name from users where id = $1`, [person.edited_by])
    : { rows: [] };

  const { rows: media } = await getPool().query(
    `select m.id, m.original_url, m.title, ml.is_primary
     from media_links ml join media m on m.id = ml.media_id
     where ml.person_id = $1
     order by ml.is_primary desc`,
    [personId],
  );

  const { rows: families } = await getPool().query(
    `select f.id, f.partner1_id, f.partner2_id,
            n1.display_name as partner1_name, n2.display_name as partner2_name,
            p1.sex as partner1_sex, p2.sex as partner2_sex,
            to_char(${DEATH_YEAR_SQL.replace("p.id", "p1.id")}, 'YYYY-MM-DD') as partner1_death,
            to_char(${DEATH_YEAR_SQL.replace("p.id", "p2.id")}, 'YYYY-MM-DD') as partner2_death,
            (select json_agg(fe order by fe.date_from nulls last)
               from (select e2.id, e2.origin, event_type, event_subtype, date_text, date_from, date_to, description,
                            pl2.raw_text as place_text
                     from events e2
                     left join places pl2 on pl2.id = e2.place_id
                     where e2.family_id = f.id) fe
            ) as family_events,
            coalesce(
              (select json_agg(json_build_object(
                 'id', c.id, 'name', cn.display_name, 'sex', c.sex,
                 'approx_text', fc.approx_birth_text,
                 'approx_from', to_char(fc.approx_birth_from, 'YYYY-MM-DD'),
                 'birth_from', ${BIRTH_YEAR_SQL.replace("p.id", "c.id")},
                 'birth_place', (select pl3.raw_text from events e3 left join places pl3 on pl3.id = e3.place_id
                                 where e3.person_id = c.id and e3.event_type = 'BIRT'
                                 order by e3.date_from nulls last, e3.id limit 1),
                 'birth_sources', (select coalesce(json_agg(json_build_object(
                                     'title', coalesce(s4.title, s4.url), 'url', s4.url, 'quote', cit4.transcription
                                   ) order by cit4.created_at), '[]'::json)
                                   from citations cit4
                                   join sources s4 on s4.id = cit4.source_id
                                   where cit4.event_id = (
                                     select e3b.id from events e3b
                                     where e3b.person_id = c.id and e3b.event_type = 'BIRT'
                                     order by e3b.date_from nulls last, e3b.id limit 1
                                   ) and s4.url is not null)
               ) order by ${BIRTH_YEAR_SQL.replace("p.id", "c.id")} nulls last)
               from family_children fc
               join persons c on c.id = fc.child_id
               left join person_names cn on cn.person_id = c.id and cn.is_primary
               where fc.family_id = f.id),
              '[]'
            ) as children
     from families f
     left join persons p1 on p1.id = f.partner1_id
     left join person_names n1 on n1.person_id = p1.id and n1.is_primary
     left join persons p2 on p2.id = f.partner2_id
     left join person_names n2 on n2.person_id = p2.id and n2.is_primary
     where f.tree_id = $1 and (f.partner1_id = $2 or f.partner2_id = $2)`,
    [treeId, personId],
  );

  // Las fuentes y personas relacionadas de los hechos de familia (matrimonio…)
  // se cargan aparte: sus ids recién se conocen tras traer las familias.
  const familyEventIds: string[] = families.flatMap((f) => (f.family_events ?? []).map((fe: { id: string }) => fe.id));
  if (familyEventIds.length) {
    const { rows: familySources } = await getPool().query(
      `select c.event_id, s.title, s.url, c.transcription as quote
       from citations c join sources s on s.id = c.source_id
       where c.event_id = any($1::uuid[]) and s.url is not null
       order by c.created_at`,
      [familyEventIds],
    );
    for (const r of familySources) {
      const list = sourcesOf.get(r.event_id) ?? [];
      list.push({ title: r.title ?? r.url, url: r.url, quote: r.quote });
      sourcesOf.set(r.event_id, list);
    }

    const { rows: familyParticipantRows } = await getPool().query(
      `select ep.id, ep.event_id, ep.role, ep.name_text, ep.person_id, n.display_name
       from event_participants ep
       left join person_names n on n.person_id = ep.person_id and n.is_primary
       where ep.event_id = any($1::uuid[])
       order by ep.position`,
      [familyEventIds],
    );
    for (const r of familyParticipantRows) {
      const list = participantsOf.get(r.event_id) ?? [];
      list.push({ id: r.id, role: r.role, name: r.person_id ? (r.display_name ?? r.name_text) : r.name_text, personId: r.person_id });
      participantsOf.set(r.event_id, list);
    }
  }

  const { rows: asChild } = await getPool().query(
    `select n1.display_name as parent1_name, n2.display_name as parent2_name
     from family_children fc
     join families f on f.id = fc.family_id
     left join persons p1 on p1.id = f.partner1_id
     left join person_names n1 on n1.person_id = p1.id and n1.is_primary
     left join persons p2 on p2.id = f.partner2_id
     left join person_names n2 on n2.person_id = p2.id and n2.is_primary
     where fc.child_id = $1`,
    [personId],
  );

  const birthYear = (() => {
    const birt = ownEvents.find((e) => e.event_type === "BIRT");
    return birt ? yearOf(birt.date_from) : null;
  })();

  const ageAt = (year: number | null) =>
    birthYear != null && year != null ? year - birthYear : null;

  const timeline: TimelineEntry[] = [];

  for (const e of ownEvents) {
    // "antes de 1900" solo trae fecha final: igual sirve para ubicar el hecho.
    const sortKey: string | null = e.date_from ?? e.date_to;
    const year = yearOf(sortKey);
    const yearEnd = e.date_from ? rangeEnd(year, e.date_to) : null;
    timeline.push({
      year,
      yearEnd,
      approx: isApproxDate(e.date_text),
      sortKey,
      dateText: displayDateText(e.date_text, year, yearEnd),
      kind: e.event_type,
      ...describeEvent(e.event_type, e.event_subtype, e.description),
      place: e.place_text,
      age: e.event_type === "BIRT" ? null : ageAt(year),
      person: null,
      sources: sourcesOf.get(e.id) ?? [],
      // El hecho tal como se carga en el formulario de edición.
      manual: e.origin === "manual",
      participants: participantsOf.get(e.id) ?? [],
      edit: {
        id: e.id,
        research: null,
        form: {
          type: e.event_type,
          subtype: e.event_subtype ?? "",
          date: dateForEditing(e.date_text),
          place: e.place_text ?? "",
          text: e.description ?? "",
          sourceTitle: sourcesOf.get(e.id)?.[0]?.title ?? "",
          sourceUrl: sourcesOf.get(e.id)?.[0]?.url ?? "",
          sourceQuote: sourcesOf.get(e.id)?.[0]?.quote ?? "",
          participants: (participantsOf.get(e.id) ?? []).map((p) => ({ role: p.role, name: p.name, personId: p.personId })),
        },
      },
    });
  }

  for (const f of families) {
    const isPartner1 = f.partner1_id === personId;
    const spouseName = isPartner1 ? f.partner2_name : f.partner1_name;
    const spouseId = isPartner1 ? f.partner2_id : f.partner1_id;
    const spouseSex = isPartner1 ? f.partner2_sex : f.partner1_sex;
    const spouseDeath: string | null = isPartner1 ? f.partner2_death : f.partner1_death;
    const spouse = spouseName && spouseId ? { id: spouseId, name: spouseName } : null;

    for (const fe of f.family_events ?? []) {
      const sortKey: string | null = fe.date_from ?? fe.date_to;
      const year = yearOf(sortKey);
      const yearEnd = fe.date_from ? rangeEnd(year, fe.date_to) : null;
      const label = eventLabel(fe.event_type, fe.event_subtype);
      timeline.push({
        year,
        yearEnd,
        approx: isApproxDate(fe.date_text),
        sortKey,
        dateText: displayDateText(fe.date_text, year, yearEnd),
        kind: fe.event_type,
        tag: null,
        title: spouse ? `${label} con` : label,
        place: fe.place_text,
        description: fe.description,
        age: ageAt(year),
        person: spouse,
        sources: sourcesOf.get(fe.id) ?? [],
        manual: fe.origin === "manual",
        participants: participantsOf.get(fe.id) ?? [],
        // Es de la pareja, no de una sola persona: se puede editar desde la
        // ficha de cualquiera de los dos (lo decide saveFicha, no esto).
        edit: {
          id: fe.id,
          research: null,
          form: {
            type: fe.event_type,
            subtype: fe.event_subtype ?? "",
            date: dateForEditing(fe.date_text),
            place: fe.place_text ?? "",
            text: fe.description ?? "",
            sourceTitle: sourcesOf.get(fe.id)?.[0]?.title ?? "",
            sourceUrl: sourcesOf.get(fe.id)?.[0]?.url ?? "",
            sourceQuote: sourcesOf.get(fe.id)?.[0]?.quote ?? "",
            participants: (participantsOf.get(fe.id) ?? []).map((p) => ({ role: p.role, name: p.name, personId: p.personId })),
          },
        },
      });
    }

    for (const c of f.children ?? []) {
      // Sin nacimiento propio vale la fecha tentativa anotada acá (solo en la
      // ficha de los padres; el hijo/a no la tiene).
      const own: string | null = c.birth_from;
      const approxText: string | null = own ? null : (c.approx_text ?? null);
      const sortKey: string | null = own ?? (approxText ? c.approx_from : null);
      const year = yearOf(sortKey);
      timeline.push({
        year,
        yearEnd: null,
        approx: Boolean(approxText),
        sortKey,
        dateText: approxText ? displayDateText(approxText, year) : null,
        kind: "CHILD_BIRT",
        tag: null,
        title: c.sex === "F" ? "Nacimiento de la hija" : c.sex === "M" ? "Nacimiento del hijo" : "Nacimiento de su hijo/a",
        place: c.birth_place ?? null,
        description: null,
        age: ageAt(year),
        person: { id: c.id, name: c.name },
        sources: (c.birth_sources ?? []).map((s: { title: string | null; url: string; quote: string | null }) => ({
          title: s.title ?? s.url,
          url: s.url,
          quote: s.quote,
        })),
        // Para anotar o corregir la fecha tentativa: solo si el hijo/a no tiene la suya.
        childApprox: own ? null : { childId: c.id, date: dateForEditing(approxText) },
      });
    }

    if (spouseDeath) {
      const year = yearOf(spouseDeath);
      timeline.push({
        year,
        yearEnd: null,
        approx: false,
        sortKey: spouseDeath,
        dateText: null,
        kind: "SPOUSE_DEAT",
        tag: null,
        title: spouseSex === "F" ? "Fallecimiento de la esposa" : "Fallecimiento del esposo",
        place: null,
        description: null,
        age: ageAt(year),
        person: spouse,
        sources: [],
      });
    }
  }

  // Hechos investigados (data/investigacion.json): se suman a lo que viene
  // del GEDCOM y pueden reemplazar un hecho suyo por una versión mejor contada.
  const facts = person.gedcom_uid ? loadResearch().byUid.get(person.gedcom_uid) ?? [] : [];
  const related = new Map<string, { id: string; name: string }>();
  const relatedUids = facts.map((f) => f.withUid).filter((uid): uid is string => uid != null);
  if (relatedUids.length) {
    const { rows } = await getPool().query(
      `select p.id, p.gedcom_uid, n.display_name
       from persons p
       left join person_names n on n.person_id = p.id and n.is_primary
       where p.tree_id = $1 and p.gedcom_uid = any($2::text[])`,
      [treeId, relatedUids],
    );
    for (const r of rows) related.set(r.gedcom_uid, { id: r.id, name: r.display_name });
  }
  const merged = applyResearch(timeline, facts, {
    birthYear,
    personByUid: (uid) => related.get(uid) ?? null,
    hidden: facts.length ? await hiddenResearchKeys(personId) : undefined,
    editForm: researchFactForm,
  });

  return {
    id: person.id,
    displayName: person.display_name,
    sex: person.sex,
    isLiving: person.is_living,
    livingReason: person.living_reason,
    given: (person.given_names as string | null) ?? "",
    surnamePat: (person.surname_pat as string | null) ?? "",
    surnameMat: (person.surname_mat as string | null) ?? "",
    notes: (person.notes as string | null) ?? "",
    edited: person.edited_at
      ? { at: (person.edited_at as Date).toISOString(), by: (editedBy[0]?.name as string | undefined) ?? null }
      : null,
    timeline: sortTimeline(merged),
    media,
    familiesAsPartner: families,
    parents: asChild[0] ?? null,
  };
}
