import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifies Svix-style signed webhooks (used by Resend and others):
 *   signature = base64(HMAC-SHA256(secret, `${id}.${timestamp}.${rawBody}`))
 * The secret is "whsec_" + base64. Timestamps outside the tolerance are rejected to
 * limit replay; the caller also records the message id to reject exact replays.
 */
export const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

export type WebhookVerification =
  | { ok: true; id: string; timestamp: number }
  | { ok: false; reason: "missing_headers" | "bad_secret" | "stale" | "bad_signature" };

export function verifySignedWebhook(args: {
  secret: string;
  rawBody: string;
  headers: { id: string | null; timestamp: string | null; signature: string | null };
  now?: Date;
}): WebhookVerification {
  const { id, timestamp, signature } = args.headers;
  if (!id || !timestamp || !signature) return { ok: false, reason: "missing_headers" };
  if (id.length > 200 || signature.length > 2000) return { ok: false, reason: "missing_headers" };

  const secretPart = args.secret.startsWith("whsec_") ? args.secret.slice(6) : args.secret;
  let key: Buffer;
  try {
    key = Buffer.from(secretPart, "base64");
  } catch {
    return { ok: false, reason: "bad_secret" };
  }
  if (key.length < 16) return { ok: false, reason: "bad_secret" };

  const ts = Number(timestamp);
  const nowSeconds = Math.floor((args.now ?? new Date()).getTime() / 1000);
  if (!Number.isInteger(ts) || Math.abs(nowSeconds - ts) > WEBHOOK_TOLERANCE_SECONDS) {
    return { ok: false, reason: "stale" };
  }

  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${args.rawBody}`).digest();
  const provided = signature
    .split(" ")
    .map((part) => part.split(","))
    .filter(([version, value]) => version === "v1" && value)
    .map(([, value]) => {
      try {
        return Buffer.from(value!, "base64");
      } catch {
        return Buffer.alloc(0);
      }
    });

  const match = provided.some((candidate) => candidate.length === expected.length && timingSafeEqual(candidate, expected));
  return match ? { ok: true, id, timestamp: ts } : { ok: false, reason: "bad_signature" };
}

/** Test helper and documentation of the scheme. */
export function signWebhook(secret: string, id: string, timestamp: number, rawBody: string): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  return `v1,${createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody}`).digest("base64")}`;
}
