import "server-only";
import { z } from "zod";
import { withUser } from "../db";
import type { CompletionState, HabitEvent } from "./types";

export const completionSchema = z.object({
  habitId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  state: z.enum(["done", "partial", "skipped", "clear"]),
});

/** Adds the given number of days to a YYYY-MM-DD date. */
export function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

export async function eventsBetween(userId: string, from: string, to: string): Promise<HabitEvent[]> {
  return withUser(userId, (tx) =>
    tx.query<HabitEvent>(
      `select habit_id as "habitId", occurred_on as "occurredOn", state, count, duration_seconds as "durationSeconds"
       from public.habit_events where occurred_on between $1 and $2 order by occurred_on`,
      [from, to],
    ),
  );
}

/**
 * Records, corrects or clears a self-report. One row per habit per day: submitting
 * twice updates the same row, and "clear" returns the day to unreported (which is
 * never treated as a failure).
 */
export async function recordCompletion(
  userId: string,
  input: { habitId: string; date: string; state: CompletionState | "clear" },
  today: string,
): Promise<"ok" | "out_of_range" | "not_found"> {
  // People can report today and correct the previous two weeks.
  if (input.date > today || input.date < shiftDate(today, -14)) return "out_of_range";
  return withUser(userId, async (tx) => {
    if (input.state === "clear") {
      await tx.query(`delete from public.habit_events where habit_id = $1 and occurred_on = $2`, [input.habitId, input.date]);
      return "ok";
    }
    const habit = await tx.one(`select 1 from public.habits where id = $1 and status = 'active'`, [input.habitId]);
    if (!habit) return "not_found";
    await tx.query(
      `insert into public.habit_events (habit_id, occurred_on, state) values ($1, $2, $3)
       on conflict (habit_id, occurred_on) do update set state = excluded.state`,
      [input.habitId, input.date, input.state],
    );
    return "ok";
  });
}
