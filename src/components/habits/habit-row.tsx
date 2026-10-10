"use client";

import { useState } from "react";
import { deleteHabitAction, setHabitStatusAction, updateHabitAction } from "@/app/(app)/habit-actions";
import type { Habit, HabitEvent } from "@/lib/domain/types";
import { IconArchive, IconEdit, IconTrash } from "../icons";
import { Button, Chip, cx } from "../ui";
import { ConfirmSubmit, SubmitButton } from "./confirm-button";
import { habitDetails } from "./format";
import { HabitForm } from "./habit-form";

const STATE_LABEL = { done: "done", partial: "partly done", skipped: "skipped" } as const;

function dayLabel(date: string) {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** A habit on its routine page: details, recent history, and the edit/archive/delete controls. */
export function HabitRow({ habit, routineId, days, events }: { habit: Habit; routineId: string; days: string[]; events: HabitEvent[] }) {
  const [editing, setEditing] = useState(false);
  const d = habitDetails(habit);
  const archived = habit.status === "archived";
  const reported = events.length;

  return (
    <li className={cx("card p-5", archived && "bg-paper-2 shadow-none")}>
      {editing ? (
        <HabitForm
          habit={habit}
          action={updateHabitAction.bind(null, habit.id, routineId)}
          submitLabel="Save changes"
          onDone={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h3 className="text-lg font-bold break-words">{habit.name}</h3>
            {d.when ? <Chip>{d.when}</Chip> : null}
            {d.often && d.often.toLowerCase() !== d.when?.toLowerCase() ? <Chip tone="sage">{d.often}</Chip> : null}
            {d.amount ? <Chip tone="sage">{d.amount}</Chip> : null}
          </div>
          <p className="mt-1 break-words text-[0.9375rem] text-muted">{habit.instruction}</p>

          <div className="mt-4">
            <ol className="flex flex-wrap gap-1.5" aria-label={`Last ${days.length} days: ${reported} reported`}>
              {days.map((day) => {
                const state = events.find((e) => e.occurredOn === day)?.state;
                return (
                  <li
                    key={day}
                    title={`${dayLabel(day)}: ${state ? STATE_LABEL[state] : "not reported"}`}
                    className={cx(
                      "size-4 rounded-full",
                      state === "done" && "bg-ink",
                      state === "partial" && "bg-mark ring-1 ring-[#d9b43a]",
                      state === "skipped" && "bg-sage-2",
                      !state && "ring-1 ring-inset ring-line-2",
                    )}
                  >
                    <span className="sr-only">{`${dayLabel(day)}: ${state ? STATE_LABEL[state] : "not reported"}`}</span>
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="no-print mt-4 flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
              <IconEdit size={17} /> Edit
            </Button>
            <form action={setHabitStatusAction.bind(null, habit.id, routineId, archived ? "active" : "archived")}>
              <SubmitButton variant="ghost" size="sm" pendingLabel="Saving…">
                <IconArchive size={17} /> {archived ? "Restore" : "Archive"}
              </SubmitButton>
            </form>
            <form action={deleteHabitAction.bind(null, habit.id, routineId)} className="ml-auto">
              <ConfirmSubmit label="Delete" confirmLabel="Delete" question="Delete this habit and its history?" icon={<IconTrash size={17} />} />
            </form>
          </div>
        </>
      )}
    </li>
  );
}
