import "server-only";
import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { withSystem } from "../db";

/**
 * LOCAL DEVELOPMENT AUTHENTICATION. Used only when Supabase is not configured, and
 * refused in production builds unless explicitly allowed for local testing. The UI
 * shows a "Local development mode" banner whenever this is active.
 *
 * Passwords are hashed with scrypt; sessions are server-side rows referenced by an
 * HMAC-signed, httpOnly cookie, so signing out revokes the session for real.
 */

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
export const LOCAL_SESSION_COOKIE = "ctx_session";
export const LOCAL_SESSION_DAYS = 30;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 32, SCRYPT);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length, SCRYPT);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function sign(sessionId: string, secret: string): string {
  return createHmac("sha256", secret).update(sessionId).digest("base64url");
}

export function encodeSessionCookie(sessionId: string, secret: string): string {
  return `${sessionId}.${sign(sessionId, secret)}`;
}

export function decodeSessionCookie(value: string | undefined, secret: string): string | null {
  if (!value) return null;
  const [id, signature] = value.split(".");
  if (!id || !signature || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const expected = Buffer.from(sign(id, secret));
  const provided = Buffer.from(signature);
  return expected.length === provided.length && timingSafeEqual(expected, provided) ? id : null;
}

export async function createLocalUser(email: string, password: string): Promise<{ userId: string } | { error: "exists" }> {
  const passwordHash = await hashPassword(password);
  return withSystem(async (tx) => {
    const existing = await tx.one(`select 1 from auth.users where lower(email) = lower($1)`, [email]);
    if (existing) return { error: "exists" as const };
    const user = await tx.one<{ id: string }>(`insert into auth.users (email) values ($1) returning id`, [email.toLowerCase()]);
    await tx.query(`insert into local_auth.credentials (user_id, password_hash) values ($1, $2)`, [user!.id, passwordHash]);
    return { userId: user!.id };
  });
}

export async function verifyLocalCredentials(email: string, password: string): Promise<string | null> {
  const row = await withSystem((tx) =>
    tx.one<{ id: string; password_hash: string }>(
      `select u.id, c.password_hash from auth.users u join local_auth.credentials c on c.user_id = u.id
       where lower(u.email) = lower($1)`,
      [email],
    ),
  );
  // Always run a hash comparison to keep timing similar for unknown emails.
  const ok = await verifyPassword(password, row?.password_hash ?? "scrypt$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");
  return row && ok ? row.id : null;
}

export async function createLocalSession(userId: string): Promise<string> {
  const row = await withSystem((tx) =>
    tx.one<{ id: string }>(
      `insert into local_auth.sessions (user_id, expires_at) values ($1, now() + make_interval(days => $2)) returning id`,
      [userId, LOCAL_SESSION_DAYS],
    ),
  );
  return row!.id;
}

export async function resolveLocalSession(sessionId: string): Promise<{ userId: string; email: string | null } | null> {
  return withSystem((tx) =>
    tx.one<{ userId: string; email: string | null }>(
      `select s.user_id as "userId", u.email from local_auth.sessions s join auth.users u on u.id = s.user_id
       where s.id = $1 and s.revoked_at is null and s.expires_at > now()`,
      [sessionId],
    ),
  );
}

export async function revokeLocalSession(sessionId: string): Promise<void> {
  await withSystem((tx) => tx.query(`update local_auth.sessions set revoked_at = now() where id = $1`, [sessionId]));
}
