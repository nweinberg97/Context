"use server";

import { revalidatePath } from "next/cache";
import { requireViewer } from "@/lib/auth/session";
import { completionSchema, recordCompletion } from "@/lib/domain/events";
import { getProfile } from "@/lib/domain/profile";
import { localDateIn } from "@/lib/notifications/schedule";
import { rateLimit } from "@/lib/security/ratelimit";

export type CompletionResult = { ok: true } | { ok: false; error: string };

/** POST-only (server action). Email links never point here. */
export async function recordCompletionAction(habitId: string, date: string, state: string): Promise<CompletionResult> {
  const viewer = await requireViewer();
  const parsed = completionSchema.safeParse({ habitId, date, state });
  if (!parsed.success) return { ok: false, error: "That check-in wasn't valid." };
  if (!(await rateLimit("write", viewer.id))) return { ok: false, error: "Too many changes at once. Try again shortly." };
  const profile = await getProfile(viewer.id);
  const today = localDateIn(new Date(), profile?.timezone ?? "UTC");
  const result = await recordCompletion(viewer.id, parsed.data, today);
  if (result === "out_of_range") return { ok: false, error: "You can check in for today and the past two weeks." };
  if (result === "not_found") return { ok: false, error: "That habit isn't active any more." };
  revalidatePath("/today");
  return { ok: true };
}
