import { NextResponse, type NextRequest } from "next/server";
import { getConfig } from "@/lib/config";
import { withSystem } from "@/lib/db";
import { log } from "@/lib/log";
import { applyDeliveryEvent } from "@/lib/notifications/dispatch";
import { verifySignedWebhook } from "@/lib/security/webhook";

/** Email delivery webhooks (Resend/Svix signing). Authenticated, replay-protected. */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const { email } = getConfig();
  if (!email.webhookSecret) return NextResponse.json({ error: "not configured" }, { status: 404 });

  const rawBody = await request.text();
  if (rawBody.length > 64_000) return NextResponse.json({ error: "too large" }, { status: 413 });

  const verification = verifySignedWebhook({
    secret: email.webhookSecret,
    rawBody,
    headers: {
      id: request.headers.get("svix-id") ?? request.headers.get("webhook-id"),
      timestamp: request.headers.get("svix-timestamp") ?? request.headers.get("webhook-timestamp"),
      signature: request.headers.get("svix-signature") ?? request.headers.get("webhook-signature"),
    },
  });
  if (!verification.ok) {
    log.warn("webhook.rejected", { reason: verification.reason });
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  // Exact replays (same message id) are acknowledged but not applied twice.
  const fresh = await withSystem((tx) =>
    tx.query(`insert into public.webhook_events (provider, message_id) values ('email', $1) on conflict do nothing returning 1`, [verification.id]),
  );
  if (fresh.length === 0) return NextResponse.json({ ok: true, replay: true });

  let payload: { type?: unknown; data?: { email_id?: unknown } };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (typeof payload.type === "string" && typeof payload.data?.email_id === "string") {
    await applyDeliveryEvent(payload.data.email_id, payload.type);
  }
  return NextResponse.json({ ok: true });
}
