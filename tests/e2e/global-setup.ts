import { execSync } from "node:child_process";

/** Resets the e2e database and applies migrations before the suite. */
export default function globalSetup() {
  const url = process.env.E2E_DATABASE_URL ?? "postgres://postgres:postgres@localhost:54322/context_e2e";
  const admin = url.replace(/\/[^/]+$/, "/postgres");
  const name = url.split("/").pop()!.split("?")[0]!;
  execSync(`psql "${admin}" -q -c "drop database if exists ${name}" -c "create database ${name}"`, { stdio: "inherit" });
  execSync("npx tsx scripts/migrate.ts", { stdio: "inherit", env: { ...process.env, DATABASE_URL: url, NEXT_PUBLIC_SUPABASE_URL: "" } });
}
