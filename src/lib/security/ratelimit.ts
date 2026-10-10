import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { withSystem } from "../db";

/**
 * Fixed-window rate limiting stored in Postgres, so it holds across serverless
 * instances. Keys never contain raw IPs or emails — they are hashed first.
 */

export const LIMITS = {
  import: { max: 20, windowSeconds: 3600 },
  authAttempt: { max: 10, windowSeconds: 900 },
  export: { max: 10, windowSeconds: 3600 },
  write: { max: 600, windowSeconds: 3600 },
} as const;
export type LimitName = keyof typeof LIMITS;

export function hashKey(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

export async function clientIpKey(): Promise<string> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  return hashKey(`ip:${ip}`);
}

/** Returns true when the action is allowed; increments the counter either way. */
export async function rateLimit(name: LimitName, subject: string): Promise<boolean> {
  const { max, windowSeconds } = LIMITS[name];
  const key = `${name}:${subject}`;
  return withSystem(async (tx) => {
    const row = await tx.one<{ count: number }>(
      `insert into public.rate_limit_buckets (key, window_start, count)
       values ($1, date_bin(make_interval(secs => $2), now(), timestamptz '2000-01-01'), 1)
       on conflict (key, window_start) do update set count = public.rate_limit_buckets.count + 1
       returning count`,
      [key, windowSeconds],
    );
    if (Math.random() < 0.02) {
      await tx.query(`delete from public.rate_limit_buckets where window_start < now() - interval '2 days'`);
    }
    return (row?.count ?? 0) <= max;
  });
}
