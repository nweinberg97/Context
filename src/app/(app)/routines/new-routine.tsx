"use client";

import { useActionState, useState } from "react";
import { createRoutineAction } from "@/app/(app)/habit-actions";
import { SubmitButton } from "@/components/habits/confirm-button";
import { IconAdd } from "@/components/icons";
import { Button, Field } from "@/components/ui";

export function NewRoutine({ startOpen }: { startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const [state, action] = useActionState(createRoutineAction, {});
  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <IconAdd size={18} /> Write a routine yourself
      </Button>
    );
  }
  return (
    <form action={action} className="card flex w-full max-w-lg flex-col gap-4 p-5">
      <Field label="Routine name" htmlFor="new-routine" error={state.fieldErrors?.title} hint="You'll add habits on the next screen.">
        <input id="new-routine" name="title" required maxLength={120} autoFocus className="field" placeholder="e.g. Piano practice" />
      </Field>
      <div className="flex gap-2">
        <SubmitButton pendingLabel="Creating…">Create routine</SubmitButton>
        <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  );
}
