"use client";

import { useActionState, useEffect, useState } from "react";
import { renameRoutineAction } from "@/app/(app)/habit-actions";
import { SubmitButton } from "@/components/habits/confirm-button";
import { IconEdit } from "@/components/icons";
import { Button } from "@/components/ui";

export function RenameRoutine({ routineId, title }: { routineId: string; title: string }) {
  const [editing, setEditing] = useState(false);
  const [state, action] = useActionState(renameRoutineAction.bind(null, routineId), {});
  useEffect(() => {
    if (state.ok) setEditing(false);
  }, [state]);

  if (!editing) {
    return (
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <h1 className="text-title min-w-0 break-words">{title}</h1>
        <Button variant="ghost" size="sm" onClick={() => setEditing(true)} className="no-print">
          <IconEdit size={17} /> Rename
        </Button>
      </div>
    );
  }
  return (
    <form action={action} className="flex max-w-xl flex-col gap-2">
      <label htmlFor="rename" className="text-sm font-semibold">Routine name</label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input id="rename" name="title" defaultValue={title} maxLength={120} required autoFocus className="field text-lg font-bold" />
        <div className="flex gap-2">
          <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
          <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
        </div>
      </div>
      {state.fieldErrors?.title || state.error ? (
        <p role="alert" className="text-sm font-medium text-danger">{state.fieldErrors?.title ?? state.error}</p>
      ) : null}
    </form>
  );
}
