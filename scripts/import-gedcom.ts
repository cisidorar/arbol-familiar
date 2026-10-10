/**
 * Importa un archivo GEDCOM a la base local. Es idempotente: vuelve a correr
 * sobre el mismo árbol sin duplicar personas ni familias, usando gedcom_uid.
 *
 * Uso: npx tsx scripts/import-gedcom.ts data/zamora-balcazar.ged "Familia Zamora Balcázar"
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { Pool, type PoolClient } from "pg";
import { parseGedcom } from "../src/lib/gedcom";
import type { ParsedEvent, ParsedMedia, ParsedPerson } from "../src/lib/gedcom/types";
import { pgConfig } from "../src/lib/db/config";

const LIVING_CUTOFF_YEARS = 100;

function isLiving(person: ParsedPerson): { living: boolean; reason: string } {
  const hasDeath = person.events.some((e) => e.type === "DEAT" || e.type === "BURI");
  if (hasDeath) return { living: false, reason: "deat_record" };

  const birth = person.events.find((e) => e.type === "BIRT");
  const birthYear = birth?.date?.from ? Number(birth.date.from.slice(0, 4)) : null;
  if (birthYear && new Date().getFullYear() - birthYear > LIVING_CUTOFF_YEARS) {
    return { living: false, reason: "birth_over_100y" };
  }
  return { living: true, reason: "default_living" };
}

async function upsertPlace(client: PoolClient, treeId: string, rawText: string | null): Promise<string | null> {
  if (!rawText) return null;
  const { rows } = await client.query(
    `insert into places (tree_id, raw_text) values ($1, $2)
     on conflict (tree_id, raw_text) do update set raw_text = excluded.raw_text
     returning id`,
    [treeId, rawText],
  );
  return rows[0].id as string;
}

async function insertEvent(
  client: PoolClient,
  treeId: string,
  opts: { personId?: string; familyId?: string },
  e: ParsedEvent,
): Promise<string> {
  const placeId = await upsertPlace(client, treeId, e.placeText);
  const { rows } = await client.query(
    `insert into events (tree_id, person_id, family_id, event_type, event_subtype, date_text, date_from, date_to, place_id, description)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
    [
      treeId,
      opts.personId ?? null,
      opts.familyId ?? null,
      e.type,
      e.subtype,
      e.date?.text ?? null,
      e.date?.from ?? null,
      e.date?.to ?? null,
      placeId,
      e.description,
    ],
  );
  return rows[0].id as string;
}

async function insertMedia(client: PoolClient, treeId: string, personId: string, m: ParsedMedia) {
  const { rows } = await client.query(
    `insert into media (tree_id, storage_path, original_url, mime_type, file_size, title, crop_box)
     values ($1, $2, $3, $4, $5, $6, $7) returning id`,
    [
      treeId,
      "", // se completa en la fase 0/3 al descargar las fotos reales
      m.fileUrl,
      m.form ? `image/${m.form}` : null,
      m.fileSize,
      m.title,
      m.cropBox ? JSON.stringify(m.cropBox) : null,
    ],
  );
  await client.query(
    `insert into media_links (media_id, person_id, is_primary) values ($1, $2, $3)`,
    [rows[0].id, personId, m.isPrimary],
  );
}

async function main() {
  const filePath = process.argv[2];
  const treeName = process.argv[3] ?? "Familia Zamora Balcázar";
  if (!filePath) {
    console.error("Uso: npx tsx scripts/import-gedcom.ts <archivo.ged> [nombre del árbol]");
    process.exit(1);
  }

  const raw = readFileSync(filePath, "utf-8");
  const parsed = parseGedcom(raw);

  const pool = new Pool(pgConfig());
  const client = await pool.connect();

  const report = {
    personsImported: 0,
    familiesImported: 0,
    sourcesImported: 0,
    citationsImported: 0,
    mediaImported: 0,
    withoutBirthDate: 0,
    datesNotInterpreted: [] as string[],
    rawTagsKept: new Map<string, number>(),
    livingCount: 0,
    deceasedCount: 0,
    // Personas editadas en la app: no se tocan (la app manda sobre el GEDCOM).
    keptAsEdited: [] as string[],
  };

  try {
    await client.query("begin");

    // 1. árbol (reutiliza si ya existe con ese nombre; "name" es unique)
    const treeRes = await client.query(
      `insert into trees (name) values ($1)
       on conflict (name) do update set name = excluded.name
       returning id`,
      [treeName],
    );
    const treeId: string = treeRes.rows[0].id;

    // 2. fuentes (xref como gedcom_uid: es único dentro del archivo)
    const sourceIdByXref = new Map<string, string>();
    for (const s of parsed.sources) {
      const { rows } = await client.query(
        `insert into sources (tree_id, title, author, repository, gedcom_uid)
         values ($1,$2,$3,$4,$5)
         on conflict (tree_id, gedcom_uid) do update set title = excluded.title
         returning id`,
        [treeId, s.title, s.author, s.repository, s.xref],
      );
      sourceIdByXref.set(s.xref, rows[0].id);
      report.sourcesImported++;
    }

    // 3. personas + nombres + eventos + medios + gedcom_raw
    const personIdByXref = new Map<string, string>();
    for (const p of parsed.persons) {
      // Si alguien editó a esta persona en la app, sus datos, nombres y
      // hechos quedan como están: reimportar no puede borrar ese trabajo.
      // Sus vínculos familiares (paso 4) sí se siguen leyendo del GEDCOM.
      const edited = await client.query(
        `select p.id, coalesce(n.display_name, '(sin nombre)') as name
         from persons p
         left join person_names n on n.person_id = p.id and n.is_primary
         where p.tree_id = $1 and p.gedcom_uid = $2 and p.edited_at is not null`,
        [treeId, p.gedcomUid ?? p.xref],
      );
      if (edited.rows[0]) {
        personIdByXref.set(p.xref, edited.rows[0].id);
        report.keptAsEdited.push(edited.rows[0].name);
        continue;
      }

      const { living, reason } = isLiving(p);
      if (living) report.livingCount++; else report.deceasedCount++;

      const { rows } = await client.query(
        `insert into persons (tree_id, sex, is_living, living_reason, gedcom_uid)
         values ($1,$2,$3,$4,$5)
         on conflict (tree_id, gedcom_uid) do update set
           sex = excluded.sex, is_living = excluded.is_living, living_reason = excluded.living_reason,
           updated_at = now()
         returning id`,
        [treeId, p.sex, living, reason, p.gedcomUid ?? p.xref],
      );
      const personId = rows[0].id as string;
      personIdByXref.set(p.xref, personId);

      // nombres: se borran y reinsertan para que una reimportación no duplique
      await client.query(`delete from person_names where person_id = $1`, [personId]);
      for (const n of p.names) {
        await client.query(
          `insert into person_names (person_id, name_type, given_names, surname_pat, surname_mat, prefix, suffix, display_name, is_primary)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [personId, n.type, n.given, n.surnamePat, n.surnameMat, n.prefix, n.suffix, n.display, n.isPrimary],
        );
      }

      if (!p.events.some((e) => e.type === "BIRT" && e.date)) report.withoutBirthDate++;

      await client.query(`delete from events where person_id = $1`, [personId]);
      const eventIdByType = new Map<string, string>();
      for (const e of p.events) {
        if (e.date && e.date.text && !e.date.from && !e.date.to) {
          report.datesNotInterpreted.push(e.date.text);
        }
        const eventId = await insertEvent(client, treeId, { personId }, e);
        eventIdByType.set(e.type, eventId);
      }

      // las fotos se borran y reinsertan completas en cada corrida: evita
      // duplicar media al reimportar (media_links no borra en cascada media)
      const oldMedia = await client.query(
        `select media_id from media_links where person_id = $1`,
        [personId],
      );
      await client.query(`delete from media_links where person_id = $1`, [personId]);
      if (oldMedia.rows.length) {
        await client.query(`delete from media where id = any($1::uuid[])`, [
          oldMedia.rows.map((r) => r.media_id),
        ]);
      }
      for (const m of p.media) {
        await insertMedia(client, treeId, personId, m);
        report.mediaImported++;
      }

      // citas a nivel persona: se enlazan al nombre principal (no sabemos con
      // certeza a qué evento corresponde un "Person Discovery" de MyHeritage)
      await client.query(
        `delete from citations where person_name_id in (select id from person_names where person_id = $1)`,
        [personId],
      );
      const primaryName = await client.query(
        `select id from person_names where person_id = $1 and is_primary limit 1`,
        [personId],
      );
      for (const c of p.citations) {
        const sourceId = sourceIdByXref.get(c.sourceXref);
        if (!sourceId) continue;
        await client.query(
          `insert into citations (source_id, person_name_id, page, transcription, confidence)
           values ($1,$2,$3,$4,$5)`,
          [sourceId, primaryName.rows[0]?.id ?? null, c.page, c.transcription, c.quay ?? 0],
        );
        report.citationsImported++;
      }

      await client.query(`delete from gedcom_raw where person_id = $1`, [personId]);
      for (const r of p.raw) {
        await client.query(
          `insert into gedcom_raw (tree_id, person_id, gedcom_tag, payload) values ($1,$2,$3,$4)`,
          [treeId, personId, r.tag, JSON.stringify(r)],
        );
        report.rawTagsKept.set(r.tag, (report.rawTagsKept.get(r.tag) ?? 0) + 1);
      }

      report.personsImported++;
    }

    // 4. familias + hijos + eventos de familia
    const familyIdByXref = new Map<string, string>();
    for (const f of parsed.families) {
      const husbandId = f.husbXref ? personIdByXref.get(f.husbXref) ?? null : null;
      const wifeId = f.wifeXref ? personIdByXref.get(f.wifeXref) ?? null : null;
      const { rows } = await client.query(
        `insert into families (tree_id, partner1_id, partner2_id, gedcom_uid)
         values ($1,$2,$3,$4)
         on conflict (tree_id, gedcom_uid) do update set
           -- Si el GEDCOM no trae a uno de los dos, se conserva el que haya
           -- (pudo agregarse en la app, con el "+" de una tarjeta).
           partner1_id = coalesce(excluded.partner1_id, families.partner1_id),
           partner2_id = coalesce(excluded.partner2_id, families.partner2_id)
         returning id`,
        [treeId, husbandId, wifeId, f.gedcomUid ?? f.xref],
      );
      const familyId = rows[0].id as string;
      familyIdByXref.set(f.xref, familyId);

      // Solo los hijos que vinieron del GEDCOM: los agregados en la app (sin
      // gedcom_uid) se quedan.
      await client.query(
        `delete from family_children
         where family_id = $1 and child_id in (select id from persons where gedcom_uid is not null)`,
        [familyId],
      );
      for (const childXref of f.childXrefs) {
        const childId = personIdByXref.get(childXref);
        if (!childId) continue;
        await client.query(
          `insert into family_children (family_id, child_id) values ($1,$2) on conflict do nothing`,
          [familyId, childId],
        );
      }

      await client.query(`delete from events where family_id = $1`, [familyId]);
      for (const e of f.events) {
        if (e.date && e.date.text && !e.date.from && !e.date.to) {
          report.datesNotInterpreted.push(e.date.text);
        }
        await insertEvent(client, treeId, { familyId }, e);
      }

      await client.query(`delete from gedcom_raw where family_id = $1`, [familyId]);
      for (const r of f.raw) {
        await client.query(
          `insert into gedcom_raw (tree_id, family_id, gedcom_tag, payload) values ($1,$2,$3,$4)`,
          [treeId, familyId, r.tag, JSON.stringify(r)],
        );
        report.rawTagsKept.set(r.tag, (report.rawTagsKept.get(r.tag) ?? 0) + 1);
      }

      report.familiesImported++;
    }

    // Las personas eliminadas a propósito desde la app no vuelven con una nueva importación.
    await client.query(
      `delete from persons where tree_id = $1 and gedcom_uid in (select gedcom_uid from deleted_persons where tree_id = $1)`,
      [treeId],
    );

    await client.query("commit");

    console.log("\n=== Reporte de importación ===");
    console.log(`Árbol: ${treeName} (${treeId})`);
    console.log(`Personas importadas: ${report.personsImported} (${report.livingCount} vivas, ${report.deceasedCount} fallecidas)`);
    console.log(`Familias importadas: ${report.familiesImported}`);
    console.log(`Fuentes: ${report.sourcesImported}, citas: ${report.citationsImported}`);
    console.log(`Fotos registradas (sin descargar aún): ${report.mediaImported}`);
    if (report.keptAsEdited.length) {
      console.log(
        `Personas editadas en la app que NO se tocaron (${report.keptAsEdited.length}): lo que hayas cambiado de ellas en MyHeritage no entró.`,
      );
      console.log("  " + report.keptAsEdited.join(", "));
    }
    console.log(`Personas sin fecha de nacimiento: ${report.withoutBirthDate}`);
    console.log(`Fechas no interpretadas (se guardó el texto igual): ${report.datesNotInterpreted.length}`);
    if (report.datesNotInterpreted.length) {
      console.log("  " + [...new Set(report.datesNotInterpreted)].join(", "));
    }
    console.log("Etiquetas guardadas en gedcom_raw (no perdidas, pendientes de mapear):");
    for (const [tag, count] of [...report.rawTagsKept.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${tag}: ${count}`);
    }
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
