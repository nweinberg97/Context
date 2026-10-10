"use client";

import { useActionState, useEffect, useId } from "react";
import type { FormState } from "@/app/(app)/habit-actions";
import type { Habit } from "@/lib/domain/types";
import { Field, Notice } from "../ui";
import { SubmitButton } from "./confirm-button";
import { habitDetails } from "./format";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

/** Edit or create a habit. Labels use plain words: when, how often, how much. */
export function HabitForm({
  action,
  habit,
  submitLabel,
  onDone,
  onCancel,
}: {
  action: Action;
  habit?: Habit;
  submitLabel: string;
  onDone?: () => void;
  onCancel?: () => void;
}) {
  const [state, formAction] = useActionState(action, {});
  const id = useId();
  const d = habit ? habitDetails(habit) : null;
  const err = state.fieldErrors ?? {};

  useEffect(() => {
    if (state.ok) onDone?.();
  }, [state, onDone]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      <Field label="Name" htmlFor={`${id}-name`} error={err.name}>
        <input id={`${id}-name`} name="name" required maxLength={80} defaultValue={habit?.name} className="field" aria-invalid={Boolean(err.name) || undefined} />
      </Field>
      <Field label="Instruction" htmlFor={`${id}-instruction`} error={err.instruction} hint={habit?.origin === "extracted" ? "Kept in the advisor's words. Edit if it helps you." : undefined}>
        <textarea id={`${id}-instruction`} name="instruction" required maxLength={500} rows={3} defaultValue={habit?.instruction} className="field resize-y" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="When" htmlFor={`${id}-when`} hint="e.g. before work">
          <input id={`${id}-when`} name="timingCue" maxLength={80} defaultValue={d?.when ?? ""} className="field" />
        </Field>
        <Field label="How often" htmlFor={`${id}-often`} hint="e.g. twice a day">
          <input id={`${id}-often`} name="frequencyText" maxLength={80} defaultValue={d?.often ?? ""} className="field" />
        </Field>
        <Field label="How much" htmlFor={`${id}-amount`} hint="e.g. 2 x 10">
          <input id={`${id}-amount`} name="amountText" maxLength={80} defaultValue={d?.amount ?? ""} className="field" />
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <SubmitButton pendingLabel="Saving…">{submitLabel}</SubmitButton>
        {onCancel ? (
          <button type="button" onClick={onCancel} className="rounded-full px-4 font-semibold text-ink hover:bg-ink/5">
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}
