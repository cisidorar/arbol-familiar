/**
 * Estandariza los cementerios (y los lugares de entierro) guardados en `places`:
 * corrige faltas ("parroquian"), les pone la comuna y una sola forma de escribirlos
 * ("Cementerio Católico, Santiago, Chile"), y opcionalmente junta las filas que son
 * el mismo cementerio escrito de distintas maneras.
 *
 * Uso: npm run db:normalize-cemeteries -- --dry      (solo muestra qué haría)
 *      npm run db:normalize-cemeteries               (estandariza; no borra nada)
 *      npm run db:normalize-cemeteries -- --merge    (además junta las filas repetidas)
 *
 * Al juntar, los hechos (entierros) de las filas repetidas pasan a la fila que más
 * se usa y las filas que quedan vacías se borran. Lo que viene después de "/" en el
 * texto (cruz, patio, sección…) es del entierro: se copia a la descripción del hecho
 * si estaba vacía. El texto original (`raw_text`) de la fila que queda no se toca.
 *
 * Lo que no se puede saber sin ti ("Cementerio General" sin ciudad, "San Pedro")
 * no se adivina: sale en el informe del final, con las personas y una sugerencia.
 * Es idempotente: se puede correr de nuevo después de reimportar o de editar.
 */
import "dotenv/config";
import { Pool } from "pg";
import { canonicalCemetery, type CemeteryInfo } from "../src/lib/geo/cemeteries";
import { REGIONES } from "../src/lib/geo";
import { pgConfig } from "../src/lib/db/config";

type Row = {
  id: string; raw_text: string; normalized: string | null; locality: string | null;
  comuna_code: string | null; region_code: string | null; burial: boolean; n: number;
};

async function main() {
  const dry = process.argv.includes("--dry");
  const merge = process.argv.includes("--merge");
  const pool = new Pool(pgConfig());
  const regionName = (code: string | null) => REGIONES.find((r) => r.code === code)?.name ?? null;

  const { rows } = await pool.query<Row>(
    `select p.id, p.raw_text, p.normalized, p.locality, p.comuna_code, p.region_code,
            coalesce(bool_or(e.event_type = 'BURI'), false) as burial, count(e.id)::int as n
       from places p left join events e on e.place_id = p.id
      group by p.id order by p.raw_text`,
  );

  const infos = new Map<string, CemeteryInfo>();
  for (const r of rows) {
    let info = canonicalCemetery(r.normalized ?? r.raw_text, r.burial) ?? canonicalCemetery(r.raw_text, r.burial);
    // Si solo se reconoce como "lugar de entierro", el texto original agrupa mejor (separa "/cruz 158/patio 8").
    if (info?.kind === "unknown") info = canonicalCemetery(r.raw_text, r.burial) ?? info;
    if (info) infos.set(r.id, info);
  }
  const byId = new Map(rows.map((r) => [r.id, r]));

  // 1) Estandarizar cada cementerio reconocido.
  let standardized = 0;
  for (const [id, info] of infos) {
    if (info.kind !== "cemetery" && info.kind !== "ambiguous") continue;
    const r = byId.get(id)!;
    const same =
      r.normalized === info.display &&
      (info.kind === "ambiguous" || (r.comuna_code === info.comunaCode && r.locality === info.locality));
    if (same) continue;
    standardized++;
    console.log(`  ${r.raw_text}  →  ${info.display}${info.comunaCode ? "" : "  (sin comuna)"}`);
    if (!dry) {
      await pool.query(
        `update places set normalized = $2, locality = $3, admin1 = coalesce($4, admin1),
                           country = coalesce($5, country), comuna_code = $6, region_code = $7 where id = $1`,
        [id, info.display, info.locality, regionName(info.regionCode), info.comunaCode ? "Chile" : null, info.comunaCode, info.regionCode],
      );
    }
  }
  console.log(`${dry ? "[dry-run] " : ""}${standardized} cementerios estandarizados.\n`);

  // 2) Grupos: filas distintas que son el mismo cementerio.
  const groups = new Map<string, Row[]>();
  for (const [id, info] of infos) {
    if (info.kind === "not-a-place") continue;
    groups.set(info.key, [...(groups.get(info.key) ?? []), byId.get(id)!]);
  }
  const repeated = [...groups.entries()].filter(([, g]) => g.length > 1);
  let merged = 0;
  for (const [key, group] of repeated) {
    const sorted = [...group].sort((a, b) => b.n - a.n || a.raw_text.localeCompare(b.raw_text));
    const [keep, ...dups] = sorted;
    const info = infos.get(keep.id)!;
    console.log(`${merge ? (dry ? "[dry-run] se juntarían" : "Juntados") : "Son el mismo cementerio"} → ${info.display}`);
    for (const d of dups) {
      const detail = infos.get(d.id)!.detail;
      console.log(`    "${d.raw_text}" (${d.n} hechos) → "${keep.raw_text}"${detail ? `  [ubicación: ${detail}]` : ""}`);
      if (merge && !dry) {
        const client = await pool.connect();
        try {
          await client.query("begin");
          await client.query(
            `update events set place_id = $1,
                    description = case when coalesce(description, '') = '' and $3::text is not null
                                       then 'Ubicación en el cementerio: ' || $3 else description end
              where place_id = $2`,
            [keep.id, d.id, detail],
          );
          await client.query(`delete from places where id = $1`, [d.id]);
          await client.query("commit");
          merged++;
        } catch (e) {
          await client.query("rollback");
          throw e;
        } finally {
          client.release();
        }
      }
    }
    void key;
  }
  if (repeated.length) {
    console.log(merge ? `${dry ? "[dry-run] " : ""}${merged} filas repetidas juntadas.\n` : `\nPara juntarlos: npm run db:normalize-cemeteries -- --merge\n`);
  } else {
    console.log("No hay cementerios repetidos.\n");
  }

  // 3) Lo que no se puede decidir solo.
  const pending = [...infos.entries()].filter(([, i]) => i.kind === "ambiguous" || i.kind === "unknown" || i.kind === "not-a-place");
  if (pending.length) {
    console.log("Para revisar contigo (no se tocaron):");
    for (const [id, info] of pending) {
      const r = byId.get(id)!;
      const { rows: people } = await pool.query<{ name: string; where_: string | null }>(
        `select distinct pn.display_name as name,
                (select string_agg(distinct pl.locality, ', ') from events e2 join places pl on pl.id = e2.place_id
                  where e2.person_id = e.person_id and e2.event_type in ('DEAT', 'BIRT', 'RESI') and pl.locality is not null) as where_
           from events e join person_names pn on pn.person_id = e.person_id and pn.name_type = 'birth'
          where e.place_id = $1 limit 6`,
        [id],
      );
      const why =
        info.kind === "ambiguous" ? "no dice en qué comuna está" :
        info.kind === "unknown" ? "es el lugar de un entierro, pero no sé qué cementerio es" : "no es un lugar";
      console.log(`  - "${r.raw_text}" (${r.n} hechos): ${why}.`);
      for (const p of people) console.log(`      ${p.name}${p.where_ ? ` — otros lugares suyos: ${p.where_}` : ""}`);
    }
  }
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
