import "server-only";
import { z } from "zod";
import { withUser, type Tx } from "../db";
import {
  HABIT_COLUMNS,
  ROUTINE_COLUMNS,
  storedDurationSchema,
  storedFrequencySchema,
  storedQuantitySchema,
  type Habit,
  type Routine,
  type RoutineWithHabits,
} from "./types";

/** All routine and habit access runs as the signed-in person (RLS enforced). */

export const routineTitleSchema = z.string().trim().min(1, "Give the routine a name.").max(120, "Keep the name under 120 characters.");

export const habitInputSchema = z.object({
  name: z.string().trim().min(1, "Give the habit a name.").max(80, "Keep the name under 80 characters."),
  instruction: z.string().trim().min(1, "Add the instruction.").max(500, "Keep the instruction under 500 characters."),
  timingCue: z.string().trim().max(80).optional().transform((v) => (v ? v : null)),
  frequencyText: z.string().trim().max(80).optional().transform((v) => (v ? v : null)),
  amountText: z.string().trim().max(80).optional().transform((v) => (v ? v : null)),
});
export type HabitInput = z.infer<typeof habitInputSchema>;

async function habitsFor(tx: Tx, routineIds: string[], statuses: string[]): Promise<Habit[]> {
  if (routineIds.length === 0) return [];
  return tx.query<Habit>(
    `select ${HABIT_COLUMNS} from public.habits
     where routine_id = any($1::uuid[]) and status = any($2::text[])
     order by position, created_at`,
    [routineIds, statuses],
  );
}

export async function listRoutines(
  userId: string,
  options: { statuses?: Array<Routine["status"]>; habitStatuses?: Array<Habit["status"]> } = {},
): Promise<RoutineWithHabits[]> {
  const statuses = options.statuses ?? ["active"];
  const habitStatuses = options.habitStatuses ?? ["active"];
  return withUser(userId, async (tx) => {
    const routines = await tx.query<Routine>(
      `select ${ROUTINE_COLUMNS} from public.routines where status = any($1::text[]) order by created_at`,
      [statuses],
    );
    const habits = await habitsFor(tx, routines.map((r) => r.id), habitStatuses);
    return routines.map((r) => ({ ...r, habits: habits.filter((h) => h.routineId === r.id) }));
  });
}

export async function getRoutine(userId: string, routineId: string): Promise<RoutineWithHabits | null> {
  if (!z.string().uuid().safeParse(routineId).success) return null;
  return withUser(userId, async (tx) => {
    const routine = await tx.one<Routine>(`select ${ROUTINE_COLUMNS} from public.routines where id = $1`, [routineId]);
    if (!routine) return null;
    const habits = await habitsFor(tx, [routine.id], ["draft", "active", "archived", "rejected"]);
    return { ...routine, habits };
  });
}

export async function createRoutine(userId: string, title: string): Promise<string> {
  const clean = routineTitleSchema.parse(title);
  return withUser(userId, async (tx) => {
    const row = await tx.one<{ id: string }>(
      `insert into public.routines (title, status) values ($1, 'active') returning id`,
      [clean],
    );
    return row!.id;
  });
}

export async function renameRoutine(userId: string, routineId: string, title: string): Promise<boolean> {
  const clean = routineTitleSchema.parse(title);
  return withUser(userId, async (tx) => {
    const rows = await tx.query(`update public.routines set title = $2 where id = $1 returning id`, [routineId, clean]);
    return rows.length === 1;
  });
}

export async function setRoutineStatus(userId: string, routineId: string, status: "active" | "archived"): Promise<boolean> {
  return withUser(userId, async (tx) => {
    const rows = await tx.query(
      `update public.routines set status = $2 where id = $1 and status <> 'draft' returning id`,
      [routineId, status],
    );
    return rows.length === 1;
  });
}

export async function deleteRoutine(userId: string, routineId: string): Promise<boolean> {
  return withUser(userId, async (tx) => {
    const rows = await tx.query(`delete from public.routines where id = $1 returning id`, [routineId]);
    return rows.length === 1;
  });
}

function detailsFromInput(input: HabitInput, existing?: Habit) {
  // Keep a detail verified from the message unless the person changed its wording.
  const frequency =
    input.frequencyText === null
      ? null
      : existing?.frequency && existing.frequency.text === input.frequencyText
        ? existing.frequency
        : storedFrequencySchema.parse({ kind: "other", text: input.frequencyText, origin: "person" });
  const quantity =
    input.amountText === null
      ? null
      : existing?.quantity && existing.quantity.text === input.amountText
        ? existing.quantity
        : existing?.duration && existing.duration.text === input.amountText
          ? null
          : storedQuantitySchema.parse({ text: input.amountText, origin: "person" });
  const duration =
    input.amountText !== null && existing?.duration && existing.duration.text === input.amountText
      ? storedDurationSchema.parse(existing.duration)
      : null;
  return { frequency, quantity, duration };
}

export async function updateHabit(userId: string, habitId: string, input: HabitInput): Promise<boolean> {
  return withUser(userId, async (tx) => {
    const existing = await tx.one<Habit>(`select ${HABIT_COLUMNS} from public.habits where id = $1`, [habitId]);
    if (!existing) return false;
    const { frequency, quantity, duration } = detailsFromInput(input, existing);
    const resolved = existing.clarificationStatus === "needs_input" ? "resolved" : existing.clarificationStatus;
    const rows = await tx.query(
      `update public.habits set name = $2, instruction = $3, timing_cue = $4, frequency = $5, quantity = $6,
         duration = $7, clarification_status = $8
       where id = $1 returning id`,
      [habitId, input.name, input.instruction, input.timingCue, frequency, quantity, duration, resolved],
    );
    return rows.length === 1;
  });
}

/** Adds a habit the person wrote themselves. Writing it is the approval. */
export async function addManualHabit(
  userId: string,
  routineId: string,
  input: HabitInput,
  options: { status: "draft" | "active" } = { status: "active" },
): Promise<string | null> {
  return withUser(userId, async (tx) => {
    const { frequency, quantity, duration } = detailsFromInput(input);
    const pos = await tx.one<{ next: number }>(
      `select coalesce(max(position), -1) + 1 as next from public.habits where routine_id = $1`,
      [routineId],
    );
    const row = await tx.one<{ id: string }>(
      `insert into public.habits (routine_id, name, instruction, timing_cue, frequency, quantity, duration, origin, status, position)
       values ($1, $2, $3, $4, $5, $6, $7, 'manual', $8, $9) returning id`,
      [routineId, input.name, input.instruction, input.timingCue, frequency, quantity, duration, options.status, Math.min(pos?.next ?? 0, 1000)],
    );
    return row?.id ?? null;
  });
}

export async function setHabitStatus(userId: string, habitId: string, status: "active" | "rejected" | "archived"): Promise<boolean> {
  return withUser(userId, async (tx) => {
    const rows = await tx.query(`update public.habits set status = $2 where id = $1 returning id`, [habitId, status]);
    return rows.length === 1;
  });
}

export async function deleteHabit(userId: string, habitId: string): Promise<boolean> {
  return withUser(userId, async (tx) => {
    const rows = await tx.query(`delete from public.habits where id = $1 returning id`, [habitId]);
    return rows.length === 1;
  });
}

/**
 * Finishes reviewing an imported routine. Only approved habits become part of it;
 * unreviewed drafts are left as rejected so nothing is activated implicitly.
 */
export async function finishReview(userId: string, routineId: string, title: string): Promise<"ok" | "none_approved" | "not_found"> {
  const clean = routineTitleSchema.parse(title);
  return withUser(userId, async (tx) => {
    const routine = await tx.one<{ id: string; sourceImportId: string | null }>(
      `select id, source_import_id as "sourceImportId" from public.routines where id = $1`,
      [routineId],
    );
    if (!routine) return "not_found";
    const approved = await tx.one<{ n: number }>(
      `select count(*)::int as n from public.habits where routine_id = $1 and status = 'active'`,
      [routineId],
    );
    if (!approved || approved.n === 0) return "none_approved";
    await tx.query(`update public.habits set status = 'rejected' where routine_id = $1 and status = 'draft'`, [routineId]);
    await tx.query(`update public.routines set status = 'active', title = $2 where id = $1`, [routineId, clean]);
    return "ok";
  });
}
