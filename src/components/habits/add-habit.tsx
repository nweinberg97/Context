"use client";

import { useState } from "react";
import { addHabitAction } from "@/app/(app)/habit-actions";
import { IconAdd } from "../icons";
import { Button } from "../ui";
import { HabitForm } from "./habit-form";

export function AddHabit({ routineId, label = "Add a habit yourself" }: { routineId: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <IconAdd size={18} /> {label}
      </Button>
    );
  }
  return (
    <section aria-label={label} className="card p-5 sm:p-6">
      <h3 className="text-lg font-bold">{label}</h3>
      <p className="mb-4 text-[0.9375rem] text-muted">Habits you write yourself are approved as soon as you add them.</p>
      <HabitForm
        key={key}
        action={addHabitAction.bind(null, routineId)}
        submitLabel="Add habit"
        onDone={() => {
          setKey((k) => k + 1);
          setOpen(false);
        }}
        onCancel={() => setOpen(false)}
      />
    </section>
  );
}
