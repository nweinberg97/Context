/**
 * Applies database migrations.
 *
 *   npm run db:migrate          apply pending migrations
 *   npm run db:reset            LOCAL ONLY: drop and recreate everything
 *
 * On a plain Postgres (docker compose), the local Supabase shim is applied first so
 * the same migrations and RLS policies run unchanged. On Supabase the `auth` schema
 * already exists and the shim is skipped. (You can also use `supabase db push`.)
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local first.");
  const reset = process.argv.includes("--reset");
  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    if (reset) {
      if (process.env.NEXT_PUBLIC_SUPABASE_URL || /supabase\.(co|com)/.test(url)) {
        throw new Error("Refusing to reset a Supabase database.");
      }
      await client.query("drop schema if exists public cascade; create schema public; drop schema if exists local_auth cascade; drop schema if exists auth cascade;");
      console.info("Database reset.");
    }

    const { rows } = await client.query("select exists (select 1 from information_schema.schemata where schema_name = 'auth') as has_auth");
    if (!rows[0].has_auth) {
      const shim = await readFile(path.join(process.cwd(), "db/local/00_supabase_shim.sql"), "utf8");
      await client.query(shim);
      console.info("Applied local Supabase shim (development database).");
    }

    await client.query(`create table if not exists public._context_migrations (name text primary key, applied_at timestamptz not null default now())`);
    await client.query(`alter table public._context_migrations enable row level security`);
    await client.query(`revoke all on public._context_migrations from public`);

    const dir = path.join(process.cwd(), "supabase/migrations");
    const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
    const applied = new Set((await client.query("select name from public._context_migrations")).rows.map((r) => r.name as string));

    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await readFile(path.join(dir, file), "utf8");
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into public._context_migrations (name) values ($1)", [file]);
        await client.query("commit");
        console.info(`Applied ${file}`);
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    }
    console.info("Migrations up to date.");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
