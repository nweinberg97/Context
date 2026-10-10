import "server-only";
import { Pool, types, type PoolClient, type QueryResultRow } from "pg";
import { getConfig } from "../config";

// Keep calendar dates as "YYYY-MM-DD" strings. Converting them to JS Dates would
// shift them by the server's time zone.
types.setTypeParser(1082, (value: string) => value);
// Timestamps travel as ISO strings so they serialise cleanly to client components.
types.setTypeParser(1184, (value: string) => new Date(value).toISOString());

/**
 * Database access.
 *
 *  withUser   — runs a transaction as the signed-in person: `set local role
 *               authenticated` plus JWT claims, exactly like Supabase's API layer.
 *               Row-level security and column grants apply to every statement.
 *  withSystem — runs as the connection's own role (bypasses RLS). Only for server-side
 *               pipeline work that has already established ownership from a verified
 *               session: creating imports, queue processing, rate limits, deletion.
 */

declare global {
  // eslint-disable-next-line no-var
  var __contextPool: Pool | undefined;
}

function pool(): Pool {
  if (!globalThis.__contextPool) {
    const { databaseUrl } = getConfig();
    globalThis.__contextPool = new Pool({
      connectionString: databaseUrl,
      max: Number(process.env.DATABASE_POOL_MAX ?? 5),
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 8_000,
      statement_timeout: 15_000,
    });
  }
  return globalThis.__contextPool;
}

export interface Tx {
  query<R extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<R[]>;
  one<R extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<R | null>;
}

function wrap(client: PoolClient): Tx {
  return {
    async query(text, values) {
      const res = await client.query(text, values as unknown[]);
      return res.rows;
    },
    async one(text, values) {
      const res = await client.query(text, values as unknown[]);
      return (res.rows[0] as never) ?? null;
    },
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function transaction<T>(setup: (c: PoolClient) => Promise<void>, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("begin");
    await setup(client);
    const result = await fn(wrap(client));
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export function withUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!UUID.test(userId)) throw new Error("withUser requires a verified user id");
  return transaction(async (c) => {
    await c.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId, role: "authenticated" }),
    ]);
    await c.query("set local role authenticated");
  }, fn);
}

export function withSystem<T>(fn: (tx: Tx) => Promise<T>, options: { consentSource?: "app" | "email_link" | "system" } = {}): Promise<T> {
  return transaction(async (c) => {
    if (options.consentSource) {
      await c.query("select set_config('context.consent_source', $1, true)", [options.consentSource]);
    }
  }, fn);
}

/** Postgres error helpers. */
export function pgCode(error: unknown): string | undefined {
  return typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : undefined;
}
