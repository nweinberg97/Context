"use server";

import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth/session";
import { getPublicStatus } from "@/lib/config";
import { importSelectedText } from "@/lib/domain/imports";
import { acknowledgeAiNotice, getProfile } from "@/lib/domain/profile";
import { PARSE_LIMITS } from "@/lib/parser";
import { rateLimit } from "@/lib/security/ratelimit";

export interface ImportFormState {
  error?: string;
  duplicateRoutineId?: string | null;
  duplicate?: boolean;
  /** Echoed back so a failed attempt never loses what the person pasted. */
  text?: string;
  title?: string;
}

export async function importAction(_prev: ImportFormState, formData: FormData): Promise<ImportFormState> {
  const viewer = await requireViewer();
  const text = String(formData.get("text") ?? "");
  const title = String(formData.get("title") ?? "").slice(0, PARSE_LIMITS.maxTitleChars);
  const keep = { text: text.slice(0, PARSE_LIMITS.maxRawChars), title };

  const status = getPublicStatus();
  if (status.extractionExternal) {
    const profile = await getProfile(viewer.id);
    if (!profile?.aiNoticeAcknowledgedAt) {
      if (formData.get("aiAck") !== "on") {
        return { ...keep, error: "Confirm that you're OK with the text being sent to the AI provider." };
      }
      await acknowledgeAiNotice(viewer.id);
    }
  }

  if (!(await rateLimit("import", viewer.id))) {
    return { ...keep, error: "You've added a lot of messages in the last hour. Try again a little later." };
  }

  const outcome = await importSelectedText(viewer.id, text, title || null);
  if (outcome.status === "error") return { ...keep, error: outcome.message };
  if (outcome.status === "duplicate") {
    return { ...keep, duplicate: true, duplicateRoutineId: outcome.routineId };
  }
  redirect(`/review/${outcome.routineId}`);
}
