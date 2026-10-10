// Guardar los cambios hechos en la app: datos básicos de una persona y sus
// hechos. Cada cambio corre en una transacción, queda en el historial
// (change_log) con el valor anterior y el nuevo, y marca a la persona como
// editada a mano (persons.edited_at) para que el importador de GEDCOM no la
// pise en la próxima importación.
//
// Estas funciones no comprueban permisos: eso lo hace quien las llama (las
// rutas de la API), que es quien conoce la sesión.

import { canonicalCemetery } from "@/lib/geo/cemeteries";
import type { PoolClient } from "pg";
import { getPool } from "../db/pool";
import {
  dateForEditing,
  FAMILY_EVENT_TYPES,
  NEW_FAMILY_EVENT_TYPES,
  researchFactForm,
  validateEvent,
  validatePerson,
  type EventForm,
  type EventValues,
  type ParticipantForm,
  type PersonValues,
} from "../edit";
import { loadResearch } from "./research-file";

export type Actor = { id: string; name: string };

export type EditResult =
  | { ok: true }
  | { ok: false; status: 400 | 404; error: string; errors?: Record<string, string> };

const NOT_FOUND: EditResult = { ok: false, status: 404, error: "No se encontró. Puede que alguien lo haya borrado." };

export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

export async function logChange(
  client: PoolClient,
  opts: {
    treeId: string;
    actor: Actor;
    /** null en un hecho de familia (matrimonio…) que no es de una sola persona. */
    personId: string | null;
    entity: "person" | "event";
    entityId: string | null;
    action: "create" | "update" | "delete";
    before: unknown;
    after: unknown;
  },
) {
  await client.query(
    `insert into change_log (tree_id, user_id, user_name, person_id, person_name, entity, entity_id, action, before, after)
     values ($1, $2, $3, $4,
             (select display_name from person_names where person_id = $4 and is_primary limit 1),
             $5, $6, $7, $8, $9)`,
    [
      opts.treeId,
      opts.actor.id,
      opts.actor.name,
      opts.personId,
      opts.entity,
      opts.entityId,
      opts.action,
      opts.before == null ? null : JSON.stringify(opts.before),
      opts.after == null ? null : JSON.stringify(opts.after),
    ],
  );
}

async function markEdited(client: PoolClient, personId: string, actor: Actor) {
  await client.query(`update persons set edited_at = now(), edited_by = $2, updated_at = now() where id = $1`, [
    personId,
    actor.id,
  ]);
}

/** Guarda los datos básicos (ya validados) dentro de una transacción. false = la persona no existe. */
async function applyPerson(
  client: PoolClient,
  treeId: string,
  personId: string,
  v: PersonValues,
  actor: Actor,
): Promise<boolean> {
  const { rows } = await client.query(
    `select p.sex, p.is_living, p.notes, n.id as name_id, n.given_names, n.surname_pat, n.surname_mat
     from persons p
     left join person_names n on n.person_id = p.id and n.is_primary
     where p.tree_id = $1 and p.id = $2
     for update of p`,
    [treeId, personId],
  );
  const cur = rows[0];
  if (!cur) return false;

  const before = {
    given: cur.given_names ?? null,
    surnamePat: cur.surname_pat ?? null,
    surnameMat: cur.surname_mat ?? null,
    sex: cur.sex,
    isLiving: cur.is_living,
    notes: cur.notes ?? null,
  };
  const after = {
    given: v.given, surnamePat: v.surnamePat, surnameMat: v.surnameMat,
    sex: v.sex, isLiving: v.isLiving, notes: v.notes,
  };
  if (JSON.stringify(before) === JSON.stringify(after)) return true;

  await client.query(
    `update persons set sex = $2, is_living = $3, notes = $4,
            living_reason = case when is_living is distinct from $3 then 'manual' else living_reason end
     where id = $1`,
    [personId, v.sex, v.isLiving, v.notes],
  );
  if (cur.name_id) {
    await client.query(
      `update person_names set given_names = $2, surname_pat = $3, surname_mat = $4, display_name = $5 where id = $1`,
      [cur.name_id, v.given, v.surnamePat, v.surnameMat, v.displayName],
    );
  } else {
    await client.query(
      `insert into person_names (person_id, given_names, surname_pat, surname_mat, display_name, is_primary)
       values ($1, $2, $3, $4, $5, true)`,
      [personId, v.given, v.surnamePat, v.surnameMat, v.displayName],
    );
  }
  await markEdited(client, personId, actor);
  await logChange(client, {
    treeId, actor, personId, entity: "person", entityId: personId, action: "update", before, after,
  });
  return true;
}

export async function updatePerson(treeId: string, personId: string, input: unknown, actor: Actor): Promise<EditResult> {
  const validation = validatePerson(input);
  if (!validation.ok) {
    return { ok: false, status: 400, error: "Revisa los campos marcados.", errors: validation.errors };
  }
  return transaction(async (client) =>
    (await applyPerson(client, treeId, personId, validation.value, actor)) ? { ok: true } : NOT_FOUND,
  );
}

async function upsertPlace(client: PoolClient, treeId: string, rawText: string | null): Promise<string | null> {
  if (!rawText) return null;
  const { rows } = await client.query(
    `insert into places (tree_id, raw_text) values ($1, $2)
     on conflict (tree_id, raw_text) do update set raw_text = excluded.raw_text
     returning id`,
    [treeId, rawText],
  );
  const id = rows[0].id as string;
  // Un cementerio nuevo entra ya con su nombre estándar y su comuna (sin pisar lo que ya tenga el lugar).
  const cemetery = canonicalCemetery(rawText);
  if (cemetery && (cemetery.kind === "cemetery" || cemetery.kind === "ambiguous")) {
    await client.query(
      `update places set normalized = coalesce(normalized, $2), locality = coalesce(locality, $3),
                         comuna_code = coalesce(comuna_code, $4), region_code = coalesce(region_code, $5),
                         country = coalesce(country, $6)
        where id = $1`,
      [id, cemetery.display, cemetery.locality, cemetery.comunaCode, cemetery.regionCode, cemetery.comunaCode ? "Chile" : null],
    );
  }
  return id;
}

type EventSnapshot = EventForm;

/** El hecho tal como está guardado, en la forma del formulario (y del historial). */
async function loadParticipants(client: PoolClient, eventId: string): Promise<ParticipantForm[]> {
  const { rows } = await client.query(
    `select role, name_text, person_id from event_participants where event_id = $1 order by position`,
    [eventId],
  );
  return rows.map((r) => ({ role: r.role as string, name: r.name_text as string, personId: r.person_id as string | null }));
}

/**
 * Un hecho de familia (matrimonio, divorcio, compromiso…) es de la pareja,
 * no de una sola persona: se puede editar desde la ficha de cualquiera de
 * los dos. `familyId` es null en un hecho normal, de una sola persona.
 */
async function loadEvent(
  client: PoolClient,
  treeId: string,
  eventId: string,
): Promise<{ personId: string | null; familyId: string | null; dateText: string | null; form: EventSnapshot } | null> {
  const { rows } = await client.query(
    `select e.person_id, e.family_id, e.event_type, e.event_subtype, e.date_text, e.description, pl.raw_text as place_text,
            src.title as source_title, src.url as source_url, src.quote as source_quote
     from events e
     left join places pl on pl.id = e.place_id
     left join lateral (
       select s.title, s.url, c.transcription as quote
       from citations c join sources s on s.id = c.source_id
       where c.event_id = e.id and s.url is not null
       order by c.created_at limit 1
     ) src on true
     where e.tree_id = $1 and e.id = $2
     for update of e`,
    [treeId, eventId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    personId: r.person_id,
    familyId: r.family_id,
    dateText: r.date_text,
    form: {
      type: r.event_type,
      subtype: r.event_subtype ?? "",
      date: dateForEditing(r.date_text),
      place: r.place_text ?? "",
      text: r.description ?? "",
      sourceTitle: r.source_title ?? "",
      sourceUrl: r.source_url ?? "",
      sourceQuote: r.source_quote ?? "",
      participants: await loadParticipants(client, eventId),
    },
  };
}

/** Los dos integrantes de la familia (sin los que quedaron sin pareja asignada). */
async function familyPartnerIds(client: PoolClient, familyId: string): Promise<string[]> {
  const { rows } = await client.query(`select partner1_id, partner2_id from families where id = $1`, [familyId]);
  const f = rows[0];
  if (!f) return [];
  return [f.partner1_id, f.partner2_id].filter((id): id is string => id != null);
}

/** ¿Esta persona es parte de esta familia (uno de los dos integrantes de la pareja)? */
async function isFamilyPartner(client: PoolClient, treeId: string, familyId: string, personId: string): Promise<boolean> {
  const { rows } = await client.query(
    `select 1 from families where tree_id = $1 and id = $2 and (partner1_id = $3 or partner2_id = $3)`,
    [treeId, familyId, personId],
  );
  return Boolean(rows[0]);
}

/** Marca como editada a la persona (hecho propio) o a los dos integrantes de la pareja (hecho de familia). */
async function markEditedForEvent(
  client: PoolClient,
  current: { personId: string | null; familyId: string | null },
  actor: Actor,
): Promise<void> {
  if (current.personId) {
    await markEdited(client, current.personId, actor);
    return;
  }
  if (current.familyId) {
    for (const id of await familyPartnerIds(client, current.familyId)) await markEdited(client, id, actor);
  }
}

function snapshotOf(v: EventValues, keptDate: string): EventSnapshot {
  return {
    type: v.type,
    subtype: v.subtype ?? "",
    date: v.date === "keep" ? keptDate : v.date ? dateForEditing(v.date.text) : "",
    place: v.place ?? "",
    text: v.description ?? "",
    sourceTitle: v.source?.title ?? "",
    sourceUrl: v.source?.url ?? "",
    sourceQuote: v.source?.quote ?? "",
    participants: v.participants,
  };
}

/** Deja el hecho con la fuente indicada (o sin fuente). Las fuentes del GEDCOM no se tocan. */
async function setEventSource(client: PoolClient, treeId: string, eventId: string, source: EventValues["source"]) {
  const { rows: old } = await client.query(
    `delete from citations c using sources s
     where c.source_id = s.id and c.event_id = $1 and s.url is not null
     returning s.id, s.gedcom_uid`,
    [eventId],
  );
  for (const s of old) {
    if (s.gedcom_uid) continue;
    await client.query(
      `delete from sources where id = $1 and not exists (select 1 from citations where source_id = $1)`,
      [s.id],
    );
  }
  if (!source) return;
  const { rows } = await client.query(
    `insert into sources (tree_id, title, url) values ($1, $2, $3) returning id`,
    [treeId, source.title, source.url],
  );
  await client.query(`insert into citations (source_id, event_id, transcription) values ($1, $2, $3)`, [
    rows[0].id,
    eventId,
    source.quote,
  ]);
}

/**
 * Deja las personas relacionadas del hecho tal como llegaron del formulario.
 * Un personId que ya no es de este árbol (o se escribió a mano) queda
 * ignorado: la persona relacionada se guarda igual, solo que sin vincular.
 */
async function setParticipants(
  client: PoolClient,
  treeId: string,
  eventId: string,
  participants: ParticipantForm[],
): Promise<void> {
  await client.query(`delete from event_participants where event_id = $1`, [eventId]);
  if (!participants.length) return;
  const ids = [...new Set(participants.map((p) => p.personId).filter((id): id is string => id != null))];
  const valid = ids.length
    ? new Set(
        (await client.query(`select id from persons where tree_id = $1 and id = any($2::uuid[])`, [treeId, ids])).rows.map(
          (r) => r.id as string,
        ),
      )
    : new Set<string>();
  let position = 0;
  for (const p of participants) {
    await client.query(
      `insert into event_participants (tree_id, event_id, role, name_text, person_id, position) values ($1, $2, $3, $4, $5, $6)`,
      [treeId, eventId, p.role, p.name, p.personId && valid.has(p.personId) ? p.personId : null, position++],
    );
  }
}

/**
 * Crea un hecho (ya validado) dentro de una transacción. `replaces` es el
 * hecho de data/investigacion.json del que viene, si se está editando uno:
 * en el historial queda como una edición de ese hecho, no como uno nuevo.
 */
export async function insertEvent(
  client: PoolClient,
  treeId: string,
  personId: string,
  v: EventValues,
  actor: Actor,
  replaces: EventSnapshot | null = null,
): Promise<string> {
  const date = v.date === "keep" ? null : v.date;
  const placeId = await upsertPlace(client, treeId, v.place);
  const { rows } = await client.query(
    `insert into events (tree_id, person_id, event_type, event_subtype, date_text, date_from, date_to, place_id,
                         description, origin, updated_at, updated_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'manual', now(), $10)
     returning id`,
    [treeId, personId, v.type, v.subtype, date?.text ?? null, date?.from ?? null, date?.to ?? null, placeId, v.description, actor.id],
  );
  const eventId = rows[0].id as string;
  await setEventSource(client, treeId, eventId, v.source);
  await setParticipants(client, treeId, eventId, v.participants);
  await markEdited(client, personId, actor);
  await logChange(client, {
    treeId, actor, personId, entity: "event", entityId: eventId, action: replaces ? "update" : "create",
    before: replaces, after: snapshotOf(v, ""),
  });
  return eventId;
}

/**
 * Agrega un hecho de familia (matrimonio) a la familia de esta persona con
 * otra. Devuelve un error de campo si la familia no es de ella, no tiene a
 * sus dos integrantes, o ya tiene un matrimonio (se edita ese).
 */
async function insertFamilyEvent(
  client: PoolClient,
  treeId: string,
  personId: string,
  familyId: string,
  v: EventValues,
  actor: Actor,
): Promise<string> {
  const date = v.date === "keep" ? null : v.date;
  const placeId = await upsertPlace(client, treeId, v.place);
  const { rows } = await client.query(
    `insert into events (tree_id, family_id, event_type, event_subtype, date_text, date_from, date_to, place_id,
                         description, origin, updated_at, updated_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'manual', now(), $10)
     returning id`,
    [treeId, familyId, v.type, v.subtype, date?.text ?? null, date?.from ?? null, date?.to ?? null, placeId, v.description, actor.id],
  );
  const eventId = rows[0].id as string;
  await setEventSource(client, treeId, eventId, v.source);
  await setParticipants(client, treeId, eventId, v.participants);
  await markEditedForEvent(client, { personId: null, familyId }, actor);
  await logChange(client, {
    treeId, actor, personId, entity: "event", entityId: eventId, action: "create",
    before: null, after: snapshotOf(v, ""),
  });
  return eventId;
}

/** ¿Puede esta persona agregar un matrimonio a esa familia? null si sí; si no, el motivo. */
async function marriageProblem(client: PoolClient, treeId: string, personId: string, familyId: unknown): Promise<string | null> {
  if (typeof familyId !== "string" || !UUID.test(familyId)) return "Elige con quién se casó.";
  const { rows } = await client.query(
    `select f.partner1_id, f.partner2_id,
            exists (select 1 from events e where e.family_id = f.id and e.event_type = 'MARR') as has_marriage
     from families f
     where f.tree_id = $1 and f.id = $2 and (f.partner1_id = $3 or f.partner2_id = $3)`,
    [treeId, familyId, personId],
  );
  const f = rows[0];
  if (!f || !f.partner1_id || !f.partner2_id) return "Elige con quién se casó, de las parejas que ya tiene en el árbol.";
  if (f.has_marriage) return "Esta pareja ya tiene un matrimonio registrado: edítalo en vez de agregar otro.";
  return null;
}

type LoadedEvent = NonNullable<Awaited<ReturnType<typeof loadEvent>>>;

/** Guarda los cambios (ya validados) de un hecho existente dentro de una transacción. */
async function applyEvent(
  client: PoolClient,
  treeId: string,
  eventId: string,
  current: LoadedEvent,
  v: EventValues,
  actor: Actor,
): Promise<void> {
  const after = snapshotOf(v, current.form.date);
  if (JSON.stringify(after) === JSON.stringify(current.form)) return;

  const placeId = await upsertPlace(client, treeId, v.place);
  if (v.date === "keep") {
    await client.query(
      `update events set event_type = $2, event_subtype = $3, place_id = $4, description = $5,
              origin = 'manual', updated_at = now(), updated_by = $6
       where id = $1`,
      [eventId, v.type, v.subtype, placeId, v.description, actor.id],
    );
  } else {
    await client.query(
      `update events set event_type = $2, event_subtype = $3, place_id = $4, description = $5,
              date_text = $7, date_from = $8, date_to = $9,
              origin = 'manual', updated_at = now(), updated_by = $6
       where id = $1`,
      [eventId, v.type, v.subtype, placeId, v.description, actor.id, v.date?.text ?? null, v.date?.from ?? null, v.date?.to ?? null],
    );
  }
  await setEventSource(client, treeId, eventId, v.source);
  await setParticipants(client, treeId, eventId, v.participants);
  await markEditedForEvent(client, current, actor);
  await logChange(client, {
    treeId, actor, personId: current.personId, entity: "event", entityId: eventId, action: "update",
    before: current.form, after,
  });
}

async function removeEvent(
  client: PoolClient,
  treeId: string,
  eventId: string,
  current: LoadedEvent,
  actor: Actor,
): Promise<void> {
  await setEventSource(client, treeId, eventId, null);
  await client.query(`delete from events where id = $1`, [eventId]);
  await markEditedForEvent(client, current, actor);
  await logChange(client, {
    treeId, actor, personId: current.personId, entity: "event", entityId: eventId, action: "delete",
    before: current.form, after: null,
  });
}

const INVALID = (errors: Record<string, string>): EditResult => ({
  ok: false, status: 400, error: "Revisa los campos marcados.", errors,
});

export async function createEvent(treeId: string, personId: string, input: unknown, actor: Actor): Promise<EditResult> {
  const validation = validateEvent(input);
  if (!validation.ok) return INVALID(validation.errors);

  return transaction(async (client) => {
    const { rows: person } = await client.query(`select 1 from persons where tree_id = $1 and id = $2 for update`, [
      treeId,
      personId,
    ]);
    if (!person[0]) return NOT_FOUND;
    await insertEvent(client, treeId, personId, validation.value, actor);
    return { ok: true } as EditResult;
  });
}

export async function updateEvent(treeId: string, eventId: string, input: unknown, actor: Actor): Promise<EditResult> {
  return transaction(async (client) => {
    const current = await loadEvent(client, treeId, eventId);
    if (!current) return NOT_FOUND;
    const validation = validateEvent(input, current.form.date);
    if (!validation.ok) return INVALID(validation.errors);
    await applyEvent(client, treeId, eventId, current, validation.value, actor);
    return { ok: true } as EditResult;
  });
}

export async function deleteEvent(treeId: string, eventId: string, actor: Actor): Promise<EditResult> {
  return transaction(async (client) => {
    const current = await loadEvent(client, treeId, eventId);
    if (!current) return NOT_FOUND;
    await removeEvent(client, treeId, eventId, current, actor);
    return { ok: true } as EditResult;
  });
}

// ─────────────────────────────────────────────────────────────────
// La ficha completa: el formulario de "Editar" manda todo junto.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_FICHA_EVENTS = 80;

/** Errores de la ficha: los de la persona y los de cada hecho, por la clave que le puso el formulario. */
export type FichaErrors = { person?: Record<string, string>; events?: Record<string, Record<string, string>> };

export type FichaResult =
  | { ok: true }
  | { ok: false; status: 400 | 404 | 409; error: string; fields?: FichaErrors };

type FichaItem = {
  key: string;
  /** Hecho guardado en la base. */
  id: string | null;
  /** Hecho que todavía vive en data/investigacion.json. */
  research: string | null;
  remove: boolean;
  form: unknown;
};

function parseFichaItems(raw: unknown): FichaItem[] | null {
  if (raw == null) return [];
  if (!Array.isArray(raw) || raw.length > MAX_FICHA_EVENTS) return null;
  const items: FichaItem[] = [];
  for (const r of raw) {
    if (typeof r !== "object" || r === null) return null;
    const o = r as Record<string, unknown>;
    const id = typeof o.id === "string" && UUID.test(o.id) ? o.id : null;
    const research = typeof o.research === "string" && /^[0-9a-f]{16}$/.test(o.research) ? o.research : null;
    if (typeof o.key !== "string" || o.key.length > 60 || (o.id != null && !id) || (o.research != null && !research)) {
      return null;
    }
    if (id && research) return null;
    items.push({ key: o.key, id, research, remove: o.remove === true, form: o.form });
  }
  return items;
}

/**
 * Guarda la ficha completa en una sola transacción: los datos de la persona
 * y, de sus hechos, solo los que el formulario mandó (los cambiados, los
 * nuevos y los quitados). O entra todo o no entra nada.
 *
 *   { person: {...}, events: [{ key, id?, research?, remove?, form? }] }
 */
export async function saveFicha(treeId: string, personId: string, input: unknown, actor: Actor): Promise<FichaResult> {
  const body = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const items = parseFichaItems(body.events);
  if (!items) return { ok: false, status: 400, error: "No se pudo leer el formulario. Recarga la página y prueba de nuevo." };

  const fields: FichaErrors = {};
  const person = validatePerson(body.person);
  if (!person.ok) fields.person = person.errors;

  const client = await getPool().connect();
  try {
    await client.query("begin");
    const finish = async (result: FichaResult) => {
      await client.query(result.ok ? "commit" : "rollback");
      return result;
    };

    const { rows } = await client.query(
      `select gedcom_uid from persons where tree_id = $1 and id = $2 for update`,
      [treeId, personId],
    );
    if (!rows[0]) return finish({ ok: false, status: 404, error: "No se encontró a esta persona." });
    const uid = rows[0].gedcom_uid as string | null;
    const facts = uid ? loadResearch().byUid.get(uid) ?? [] : [];

    // Primero se revisa todo; recién si no hay ningún error se escribe.
    const GONE: FichaResult = {
      ok: false, status: 409,
      error: "Alguien cambió esta ficha mientras la editabas. Ciérrala, vuelve a abrirla y repite tus cambios.",
    };
    const plan: (() => Promise<void>)[] = [];
    const marriedNow = new Set<string>(); // parejas a las que este mismo guardado les agrega matrimonio
    for (const item of items) {
      const failed = (errors: Record<string, string>) => {
        (fields.events ??= {})[item.key] = errors;
      };

      if (item.id) {
        const eventId = item.id;
        const current = await loadEvent(client, treeId, eventId);
        if (!current) return finish(GONE);
        // Un hecho propio es de esta persona; uno de familia (matrimonio…) se
        // puede editar desde la ficha de cualquiera de los dos integrantes.
        const owned =
          current.personId === personId ||
          (current.familyId != null && (await isFamilyPartner(client, treeId, current.familyId, personId)));
        if (!owned) return finish(GONE);
        if (item.remove) {
          plan.push(() => removeEvent(client, treeId, eventId, current, actor));
          continue;
        }
        const v = validateEvent(item.form, current.form.date);
        if (!v.ok) failed(v.errors);
        else plan.push(() => applyEvent(client, treeId, eventId, current, v.value, actor));
        continue;
      }

      if (item.research) {
        const key = item.research;
        const fact = facts.find((f) => f.key === key);
        const before = fact ? researchFactForm(fact) : null;
        if (!fact || !before) return finish(GONE);
        const { rows: already } = await client.query(
          `select 1 from research_overrides where person_id = $1 and fact_key = $2`,
          [personId, key],
        );
        if (already[0]) return finish(GONE);
        const hide = (eventId: string | null) =>
          client.query(
            `insert into research_overrides (person_id, fact_key, event_id, created_by) values ($1, $2, $3, $4)
             on conflict (person_id, fact_key) do update set event_id = excluded.event_id`,
            [personId, key, eventId, actor.id],
          );
        if (item.remove) {
          plan.push(async () => {
            await hide(null);
            await markEdited(client, personId, actor);
            await logChange(client, {
              treeId, actor, personId, entity: "event", entityId: null, action: "delete", before, after: null,
            });
          });
          continue;
        }
        const v = validateEvent(item.form);
        if (!v.ok) failed(v.errors);
        else plan.push(async () => void (await hide(await insertEvent(client, treeId, personId, v.value, actor, before))));
        continue;
      }

      if (item.remove) continue; // un hecho nuevo que se quitó antes de guardar
      const v = validateEvent(item.form);
      if (!v.ok) failed(v.errors);
      else if (FAMILY_EVENT_TYPES.has(v.value.type)) {
        // Un matrimonio nuevo se liga a una pareja que ya está en el árbol; el
        // divorcio y el compromiso no se crean sueltos desde una ficha.
        if (!NEW_FAMILY_EVENT_TYPES.has(v.value.type)) {
          failed({ type: "Este hecho se edita desde el que ya existe, no se agrega aquí." });
          continue;
        }
        const familyId = (item.form as { familyId?: unknown } | null)?.familyId;
        const problem =
          typeof familyId === "string" && marriedNow.has(familyId)
            ? "Esta pareja ya tiene un matrimonio en este formulario."
            : await marriageProblem(client, treeId, personId, familyId);
        if (typeof familyId === "string") marriedNow.add(familyId);
        if (problem) failed({ familyId: problem });
        else plan.push(async () => void (await insertFamilyEvent(client, treeId, personId, familyId as string, v.value, actor)));
      } else plan.push(async () => void (await insertEvent(client, treeId, personId, v.value, actor)));
    }

    if (!person.ok || fields.events) {
      return finish({ ok: false, status: 400, error: "Revisa los campos marcados.", fields });
    }
    await applyPerson(client, treeId, personId, person.value, actor);
    for (const step of plan) await step();
    return finish({ ok: true });
  } catch (err) {
    await client.query("rollback").catch(() => {});
    if ((err as { code?: string }).code === "42P01") {
      return { ok: false, status: 400, error: "Falta actualizar la base: corre «npm run db:migrate» en la terminal y prueba de nuevo." };
    }
    throw err;
  } finally {
    client.release();
  }
}
