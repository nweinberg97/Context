import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getConfig } from "@/lib/config";
import { retryPendingDeletions } from "@/lib/domain/account";
import { dispatchDueCheckins, enqueueDueCheckins } from "@/lib/notifications/dispatch";
import { getEmailProvider } from "@/lib/notifications/providers";

/**
 * Scheduler entry point. Call every 5–15 minutes from any external scheduler
 * (GitHub Actions, Supabase pg_cron + pg_net, Vercel Cron) with
 * `Authorization: Bearer $CRON_SECRET`. Idempotent: running it twice is harmless.
 */
export const dynamic = "force-dynamic";

function authorized(request: NextRequest, secret: string | undefined): boolean {
  if (!secret || secret.length < 16) return false;
  const header = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const provided = Buffer.from(header);
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

async function handle(request: NextRequest) {
  const config = getConfig();
  if (!authorized(request, config.cronSecret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const now = new Date();
  const deletionsCompleted = await retryPendingDeletions();
  const provider = getEmailProvider();
  if (!provider) {
    return NextResponse.json({ reminders: "disabled", deletionsCompleted });
  }
  const enqueued = await enqueueDueCheckins(now);
  const dispatched = await dispatchDueCheckins(now, provider);
  return NextResponse.json({ enqueued, ...dispatched, deletionsCompleted });
}

export const GET = handle;
export const POST = handle;
