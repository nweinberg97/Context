import type { Habit } from "@/lib/domain/types";

export interface HabitDetails {
  when: string | null;
  often: string | null;
  amount: string | null;
  oftenFromMessage: boolean;
  amountFromMessage: boolean;
}

export function habitDetails(h: Pick<Habit, "timingCue" | "frequency" | "quantity" | "duration">): HabitDetails {
  const amount = h.quantity?.text ?? h.duration?.text ?? null;
  return {
    when: h.timingCue,
    often: h.frequency?.text ?? null,
    amount,
    oftenFromMessage: h.frequency?.origin !== "person",
    amountFromMessage: (h.quantity ?? h.duration)?.origin !== "person",
  };
}

export function capitalise(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

/** Group label for the one-pager. Habits with no stated time go under "Any time". */
export function groupKey(h: Pick<Habit, "timingCue" | "frequency">): string {
  const cue = h.timingCue?.trim();
  if (cue) return capitalise(cue);
  if (h.frequency?.kind === "daily" && h.frequency.text) return capitalise(h.frequency.text);
  return "Any time";
}

const ORDER: Array<[RegExp, number]> = [
  [/wak|first thing|morning|before (work|school|breakfast)|breakfast/i, 1],
  [/lunch|midday|noon|afternoon|after (work|school)/i, 2],
  [/dinner|evening|after (your )?run|training|practice/i, 3],
  [/night|bed|sleep/i, 4],
  [/any time/i, 9],
];

/** Rough time-of-day order so the page reads like the day does. */
export function groupRank(label: string): number {
  return ORDER.find(([re]) => re.test(label))?.[1] ?? 5;
}
