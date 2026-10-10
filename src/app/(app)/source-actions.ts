"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireViewer } from "@/lib/auth/session";
import { deleteSource, removeSourceContent } from "@/lib/domain/imports";

const uuid = z.string().uuid();

/** Remove the stored message text for one source (or all, when no id is given). */
export async function removeSourceContentAction(importId: string | null): Promise<void> {
  const viewer = await requireViewer();
  if (importId !== null && !uuid.safeParse(importId).success) return;
  await removeSourceContent(viewer.id, importId ?? undefined);
  revalidatePath("/", "layout");
}

export async function deleteSourceAction(importId: string): Promise<void> {
  const viewer = await requireViewer();
  if (!uuid.safeParse(importId).success) return;
  await deleteSource(viewer.id, importId);
  revalidatePath("/", "layout");
}
