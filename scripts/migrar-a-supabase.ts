/**
 * Copia toda la base local (DATABASE_URL) a Supabase (SUPABASE_DATABASE_URL):
 * 1) aplica las migraciones que falten en Supabase,
 * 2) copia cada tabla en orden de dependencias, dentro de UNA transacción
 *    (o se copia todo o no se copia nada),
 * 3) deja bien los contadores automáticos (change_log) y
 * 4) compara cuántas filas hay en cada lado.
 *
 * No modifica la base local. No copia `sessions` (los inicios de sesión se
 * vuelven a hacer en la base nueva).
 *
 *   npm run db:a-supabase               (copia si Supabase está vacía)
 *   npm run db:a-supabase -- --reemplazar (vacía las tablas de Supabase y vuelve a copiar)
 *
 * Variables en .env.local:
 *   DATABASE_URL=postgresql://…localhost…            (la base local de siempre)
 *   SUPABASE_DATABASE_URL=postgresql://postgres.<ref>:<clave>@aws-0-sa-east-1.pooler.supabase.com:5432/postgres
 *     (Supabase → Connect → "Session pooler")
 */
import "dotenv/config";
import { config as cargarEnv } from "dotenv";
cargarEnv({ path: ".env.local" });
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import { pgConfig } from "../src/lib/db/config";

const REEMPLAZAR = process.argv.includes("--reemplazar");
const SKIP = new Set(["schema_migrations", "sessions"]);
const CHUNK = 300;

const q = (name: string) => `"${name.replace(/"/g, '""')}"`;

async function main() {
  const srcUrl = process.env.DATABASE_URL;
  const dstUrl = process.env.SUPABASE_DATABASE_URL;
  if (!srcUrl) throw new Error("Falta DATABASE_URL (la base local).");
  if (!dstUrl) throw new Error("Falta SUPABASE_DATABASE_URL (ver el comentario al inicio de este archivo).");
  if (srcUrl === dstUrl) throw new Error("DATABASE_URL y SUPABASE_DATABASE_URL son la misma: no copio una base sobre sí misma.");

  const src = new Pool(pgConfig(srcUrl));
  const dst = new Pool(pgConfig(dstUrl));
  try {
    // 1) Migraciones en Supabase.
    const dir = path.join(process.cwd(), "db", "migrations");
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    const mc = await dst.connect();
    try {
      await mc.query(`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`);
      const { rows } = await mc.query(`select name from schema_migrations`);
      const applied = new Set(rows.map((r) => r.name as string));
      for (const f of files) {
        if (applied.has(f)) continue;
        process.stdout.write(`Supabase: aplicando ${f}… `);
        try {
          await mc.query("begin");
          await mc.query(readFileSync(path.join(dir, f), "utf-8"));
          await mc.query(`insert into schema_migrations (name) values ($1)`, [f]);
          await mc.query("commit");
          console.log("listo");
        } catch (e) {
          await mc.query("rollback");
          console.log("falló");
          throw e;
        }
      }
    } finally {
      mc.release();
    }

    // 2) Tablas y orden de dependencias.
    const { rows: t } = await src.query(
      `select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`,
    );
    const tables = (t.map((r) => r.table_name as string)).filter((n) => !SKIP.has(n));
    const { rows: fks } = await src.query(
      `select conrelid::regclass::text as child, confrelid::regclass::text as parent
         from pg_constraint where contype = 'f' and connamespace = 'public'::regnamespace`,
    );
    const clean = (s: string) => s.replace(/^public\./, "").replace(/"/g, "");
    const deps = new Map<string, Set<string>>(tables.map((n) => [n, new Set<string>()]));
    for (const f of fks) {
      const c = clean(f.child as string), p = clean(f.parent as string);
      if (c !== p && deps.has(c) && deps.has(p)) deps.get(c)!.add(p);
    }
    const order: string[] = [];
    const left = new Set(tables);
    while (left.size) {
      const ready = [...left].filter((n) => [...deps.get(n)!].every((p) => !left.has(p)));
      if (!ready.length) { order.push(...left); break; } // ciclo: se confía en session_replication_role
      for (const n of ready.sort()) { order.push(n); left.delete(n); }
    }

    // ¿Supabase ya tiene datos?
    const dstCounts: Record<string, number> = {};
    for (const n of order) {
      const { rows } = await dst.query(`select count(*)::int as n from ${q(n)}`);
      dstCounts[n] = rows[0].n;
    }
    const llenas = order.filter((n) => dstCounts[n] > 0);
    if (llenas.length && !REEMPLAZAR) {
      throw new Error(`Supabase ya tiene datos (${llenas.join(", ")}). Si quieres reemplazarlos: npm run db:a-supabase -- --reemplazar`);
    }

    // 3) Copia, todo en una transacción.
    const client = await dst.connect();
    try {
      await client.query("begin");
      try { await client.query("set local session_replication_role = replica"); } catch { /* sin permiso: basta el orden */ }
      if (REEMPLAZAR) await client.query(`truncate ${order.map(q).join(", ")} restart identity cascade`);

      for (const n of order) {
        const { rows: cols } = await client.query(
          `select column_name, is_identity, identity_generation from information_schema.columns
            where table_schema = 'public' and table_name = $1 and is_generated = 'NEVER' order by ordinal_position`,
          [n],
        );
        const names = cols.map((c) => q(c.column_name as string)).join(", ");
        const always = cols.some((c) => c.is_identity === "YES" && c.identity_generation === "ALWAYS");
        const { rows } = await src.query(`select to_jsonb(t) as j from ${q(n)} t`);
        for (let i = 0; i < rows.length; i += CHUNK) {
          const part = rows.slice(i, i + CHUNK).map((r) => r.j);
          await client.query(
            `insert into ${q(n)} (${names}) ${always ? "overriding system value" : ""}
             select ${names} from jsonb_populate_recordset(null::${q(n)}, $1::jsonb)`,
            [JSON.stringify(part)],
          );
        }
        console.log(`  ${n}: ${rows.length} filas`);
      }

      // Contadores automáticos (change_log.id).
      const { rows: ids } = await client.query(
        `select table_name, column_name from information_schema.columns
          where table_schema = 'public' and is_identity = 'YES'`,
      );
      for (const r of ids) {
        const t2 = r.table_name as string, c = r.column_name as string;
        if (!order.includes(t2)) continue;
        await client.query(
          `select setval(pg_get_serial_sequence($1, $2), greatest(coalesce((select max(${q(c)}) from ${q(t2)}), 0), 1))`,
          [q(t2), c],
        );
      }
      await client.query("commit");
    } catch (e) {
      await client.query("rollback");
      throw e;
    } finally {
      client.release();
    }

    // 4) Verificación.
    let mal = 0;
    console.log("\nComprobando conteos (local → Supabase):");
    for (const n of order) {
      const a = (await src.query(`select count(*)::int as n from ${q(n)}`)).rows[0].n as number;
      const b = (await dst.query(`select count(*)::int as n from ${q(n)}`)).rows[0].n as number;
      const ok = a === b;
      if (!ok) mal++;
      console.log(`  ${ok ? "OK " : "XX "} ${n}: ${a} → ${b}`);
    }
    console.log(mal ? `\n${mal} tabla(s) no coinciden: revisa antes de usar Supabase.` : "\nListo: Supabase tiene lo mismo que tu base local.");
    if (mal) process.exitCode = 1;
  } finally {
    await src.end();
    await dst.end();
  }
}
main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
