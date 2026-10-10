"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireViewer } from "@/lib/auth/session";
import { markImportReviewed } from "@/lib/domain/imports";
import {
  addManualHabit,
  createRoutine,
  deleteHabit,
  deleteRoutine,
  finishReview,
  getRoutine,
  habitInputSchema,
  renameRoutine,
  routineTitleSchema,
  setHabitStatus,
  setRoutineStatus,
  updateHabit,
} from "@/lib/domain/routines";
import { rateLimit } from "@/lib/security/ratelimit";

/**
 * Habit and routine mutations. Every action re-verifies the session and runs as the
 * signed-in person, so row-level security decides what can be touched — an id from
 * the form can never reach someone else's data.
 */

export interface FormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  ok?: boolean;
}

const uuid = z.string().uuid();

async function guard(): Promise<string> {
  const viewer = await requireViewer();
  if (!(await rateLimit("write", viewer.id))) throw new Error("rate_limited");
  return viewer.id;
}

function refresh(routineId?: string) {
  revalidatePath("/today");
  revalidatePath("/routines");
  if (routineId) {
    revalidatePath(`/routines/${routineId}`);
    revalidatePath(`/review/${routineId}`);
  }
}

function readHabitForm(formData: FormData) {
  return habitInputSchema.safeParse({
    name: formData.get("name") ?? "",
    instruction: formData.get("instruction") ?? "",
    timingCue: formData.get("timingCue") ?? "",
    frequencyText: formData.get("frequencyText") ?? "",
    amountText: formData.get("amountText") ?? "",
  });
}

function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) out[String(issue.path[0])] ??= issue.message;
  return out;
}

export async function updateHabitAction(habitId: string, routineId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const userId = await guard();
  if (!uuid.safeParse(habitId).success) return { error: "That habit doesn't exist." };
  const parsed = readHabitForm(formData);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const ok = await updateHabit(userId, habitId, parsed.data);
  if (!ok) return { error: "That habit doesn't exist." };
  refresh(routineId);
  return { ok: true };
}

export async function setHabitStatusAction(habitId: string, routineId: string, status: "active" | "rejected" | "archived"): Promise<void> {
  const userId = await guard();
  if (!uuid.safeParse(habitId).success) return;
  await setHabitStatus(userId, habitId, status);
  refresh(routineId);
}

export async function deleteHabitAction(habitId: string, routineId: string): Promise<void> {
  const userId = await guard();
  if (!uuid.safeParse(habitId).success) return;
  await deleteHabit(userId, habitId);
  refresh(routineId);
}

export async function addHabitAction(routineId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const userId = await guard();
  if (!uuid.safeParse(routineId).success) return { error: "That routine doesn't exist." };
  const parsed = readHabitForm(formData);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const id = await addManualHabit(userId, routineId, parsed.data).catch(() => null);
  if (!id) return { error: "Couldn't add the habit to that routine." };
  refresh(routineId);
  return { ok: true };
}

export async function finishReviewAction(routineId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const userId = await guard();
  if (!uuid.safeParse(routineId).success) return { error: "That routine doesn't exist." };
  const title = routineTitleSchema.safeParse(formData.get("title") ?? "");
  if (!title.success) return { fieldErrors: { title: title.error.issues[0]!.message } };
  const routine = await getRoutine(userId, routineId);
  const result = await finishReview(userId, routineId, title.data);
  if (result === "not_found") return { error: "That routine doesn't exist." };
  if (result === "none_approved") return { error: "Approve at least one habit, or add one yourself, to save this routine." };
  if (routine?.sourceImportId) await markImportReviewed(userId, routine.sourceImportId);
  refresh(routineId);
  redirect(`/today?saved=${routineId}`);
}

export async function createRoutineAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const userId = await guard();
  const title = routineTitleSchema.safeParse(formData.get("title") ?? "");
  if (!title.success) return { fieldErrors: { title: title.error.issues[0]!.message } };
  const id = await createRoutine(userId, title.data);
  refresh();
  redirect(`/routines/${id}`);
}

export async function renameRoutineAction(routineId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const userId = await guard();
  const title = routineTitleSchema.safeParse(formData.get("title") ?? "");
  if (!title.success) return { fieldErrors: { title: title.error.issues[0]!.message } };
  if (!(await renameRoutine(userId, routineId, title.data))) return { error: "That routine doesn't exist." };
  refresh(routineId);
  return { ok: true };
}

export async function setRoutineStatusAction(routineId: string, status: "active" | "archived"): Promise<void> {
  const userId = await guard();
  if (!uuid.safeParse(routineId).success) return;
  await setRoutineStatus(userId, routineId, status);
  refresh(routineId);
}

export async function deleteRoutineAction(routineId: string): Promise<void> {
  const userId = await guard();
  if (!uuid.safeParse(routineId).success) return;
  await deleteRoutine(userId, routineId);
  refresh();
  redirect("/routines");
}
