"use client";

import { useState } from "react";
import { deleteHabitAction, setHabitStatusAction, updateHabitAction } from "@/app/(app)/habit-actions";
import type { Habit } from "@/lib/domain/types";
import { IconCheck, IconClose, IconEdit, IconQuestion, IconTrash } from "../icons";
import { Button, cx } from "../ui";
import { ConfirmSubmit, SubmitButton } from "./confirm-button";
import { habitDetails } from "./format";
import { HabitForm } from "./habit-form";

const STATUS_LABEL: Record<Habit["status"], string> = {
  draft: "Waiting for you",
  active: "Approved",
  rejected: "Left out",
  archived: "Archived",
};

export function ReviewCard({ habit, routineId, index }: { habit: Habit; routineId: string; index: number }) {
  const [editing, setEditing] = useState(false);
  const d = habitDetails(habit);
  const approved = habit.status === "active";
  const rejected = habit.status === "rejected";
  const needsInput = habit.clarificationStatus === "needs_input";
  const headingId = `habit-${habit.id}-title`;

  return (
    <article
      aria-labelledby={headingId}
      className={cx(
        "card relative overflow-hidden p-5 transition-[opacity,border-color] sm:p-6",
        approved && "border-ink ring-1 ring-ink",
        rejected && "bg-paper-2 opacity-75 shadow-none",
      )}
    >
      {approved ? <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1.5 bg-mark" /> : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-muted">Suggestion {index + 1}</span>
        <span
          className={cx(
            "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-semibold",
            approved ? "bg-ink text-paper" : rejected ? "bg-line text-muted" : "bg-mark-2 text-forest",
          )}
        >
          {approved ? <IconCheck size={15} /> : null}
          {STATUS_LABEL[habit.status]}
        </span>
      </div>

      {editing ? (
        <div className="mt-4">
          <h3 id={headingId} className="mb-4 text-lg font-bold break-words">
            <span className="sr-only">Editing </span>
            {habit.name}
          </h3>
          <HabitForm
            habit={habit}
            action={updateHabitAction.bind(null, habit.id, routineId)}
            submitLabel="Save changes"
            onDone={() => setEditing(false)}
            onCancel={() => setEditing(false)}
          />
        </div>
      ) : (
        <>
          <h3 id={headingId} className={cx("mt-2 text-heading break-words", rejected && "line-through decoration-2")}>
            {habit.name}
          </h3>
          <p className="mt-2 break-words text-ink-2">{habit.instruction}</p>

          <dl className="mt-4 grid grid-cols-1 gap-x-4 gap-y-2 text-[0.9375rem] sm:grid-cols-3">
            <Detail label="When" value={d.when} />
            <Detail label="How often" value={d.often} note={d.often && !d.oftenFromMessage ? "your words" : undefined} />
            <Detail label="How much" value={d.amount} note={d.amount && !d.amountFromMessage ? "your words" : undefined} />
          </dl>

          {habit.sourceEvidence ? (
            <figure className="mt-4 rounded-xl bg-paper px-4 py-3">
              <figcaption className="text-sm font-semibold text-muted">From the message</figcaption>
              <blockquote className="mt-1 break-words text-[0.9375rem]">
                <span className="mark mark-soft">{habit.sourceEvidence}</span>
              </blockquote>
            </figure>
          ) : null}

          {needsInput || habit.clarificationNotes.length ? (
            <div className={cx("mt-4 rounded-xl border px-4 py-3 text-[0.9375rem]", needsInput ? "border-[#ecd27a] bg-mark-2/50" : "border-line")}>
              <p className="flex items-center gap-2 font-semibold">
                <IconQuestion size={18} />
                {needsInput ? "Worth checking before you approve" : "Notes"}
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-6 text-ink-2">
                {habit.clarificationNotes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
              {needsInput ? <p className="mt-1 text-muted">Add the missing detail with Edit, or approve it as written.</p> : null}
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center gap-2">
            {!approved ? (
              <form action={setHabitStatusAction.bind(null, habit.id, routineId, "active")}>
                <SubmitButton pendingLabel="Approving…">
                  <IconCheck size={18} /> {rejected ? "Approve after all" : "Approve"}
                </SubmitButton>
              </form>
            ) : null}
            {!rejected ? (
              <form action={setHabitStatusAction.bind(null, habit.id, routineId, "rejected")}>
                <SubmitButton variant="secondary" pendingLabel="Saving…">
                  <IconClose size={18} /> {approved ? "Leave out" : "Not a habit"}
                </SubmitButton>
              </form>
            ) : null}
            <Button variant="ghost" onClick={() => setEditing(true)}>
              <IconEdit size={18} /> Edit
            </Button>
            <form action={deleteHabitAction.bind(null, habit.id, routineId)} className="ml-auto">
              <ConfirmSubmit label="Remove" confirmLabel="Remove" question="Remove this suggestion?" icon={<IconTrash size={17} />} />
            </form>
          </div>
        </>
      )}
    </article>
  );
}

function Detail({ label, value, note }: { label: string; value: string | null; note?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm font-semibold text-muted">{label}</dt>
      <dd className={cx("break-words", value ? "font-semibold text-ink" : "text-muted italic")}>
        {value ?? "Not stated"}
        {note ? <span className="ml-1 text-sm font-normal not-italic text-muted">({note})</span> : null}
      </dd>
    </div>
  );
}
