/**
 * Aplica las migraciones de db/migrations que falten, en orden, y recuerda
 * cuáles ya corrieron (tabla schema_migrations). Cada migración corre en una
 * transacción: o entra completa o no entra.
 *
 * Uso: npm run db:migrate
 */
import dotenv from "dotenv";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import { pgConfig } from "../src/lib/db/config";

// La conexión (Supabase) está en .env.local; .env va después y no pisa lo ya leído.
dotenv.config({ path: ".env.local" });
dotenv.config();

async function main() {
  const dir = path.join(process.cwd(), "db", "migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

  const pool = new Pool(pgConfig());
  const client = await pool.connect();
  try {
    await client.query(
      `create table if not exists schema_migrations (
         name text primary key,
         applied_at timestamptz not null default now()
       )`,
    );

    // Una base creada antes de que existiera este script ya tiene la 0001
    // aplicada a mano: se anota en vez de volver a correrla (fallaría).
    const { rows: existing } = await client.query(`select to_regclass('public.trees') as t`);
    if (existing[0].t) {
      await client.query(
        `insert into schema_migrations (name) values ('0001_init.sql') on conflict do nothing`,
      );
    }

    const { rows } = await client.query(`select name from schema_migrations`);
    const applied = new Set(rows.map((r) => r.name as string));

    let ran = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = readFileSync(path.join(dir, file), "utf-8");
      process.stdout.write(`Aplicando ${file}… `);
      try {
        await client.query("begin");
        await client.query(sql);
        await client.query(`insert into schema_migrations (name) values ($1)`, [file]);
        await client.query("commit");
        console.log("listo");
        ran++;
      } catch (err) {
        await client.query("rollback");
        console.log("falló (no se aplicó nada de esta migración)");
        throw err;
      }
    }
    console.log(ran ? `${ran} migración(es) aplicada(s).` : "La base ya está al día.");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
