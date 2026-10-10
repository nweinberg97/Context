"use client";

import { useActionState, useMemo, useState } from "react";
import { SubmitButton } from "@/components/habits/confirm-button";
import { Field, Notice } from "@/components/ui";
import type { ReminderSettings } from "@/lib/domain/types";
import { deleteAccountAction, saveRemindersAction, updateTimezoneAction } from "./actions";

export function TimezoneForm({ timezone }: { timezone: string }) {
  const [state, action] = useActionState(updateTimezoneAction, {});
  const zones = useMemo(() => {
    const list = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
    return list.includes(timezone) ? list : [timezone, ...list];
  }, [timezone]);
  return (
    <form action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <Field label="Time zone" htmlFor="timezone" className="flex-1" error={state.error}>
        <select id="timezone" name="timezone" defaultValue={timezone} className="field">
          {zones.map((z) => (
            <option key={z} value={z}>{z.replaceAll("_", " ")}</option>
          ))}
        </select>
      </Field>
      <SubmitButton variant="secondary" pendingLabel="Saving…">Save</SubmitButton>
      {state.saved ? <span role="status" className="text-sm font-semibold text-ink sm:pb-3">Saved</span> : null}
    </form>
  );
}

const DAYS = [
  [1, "Mon"], [2, "Tue"], [3, "Wed"], [4, "Thu"], [5, "Fri"], [6, "Sat"], [7, "Sun"],
] as const;

export function RemindersForm({ settings, available }: { settings: ReminderSettings; available: boolean }) {
  const [state, action] = useActionState(saveRemindersAction, {});
  const [enabled, setEnabled] = useState(settings.enabled);
  return (
    <form action={action} className="flex flex-col gap-5">
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          name="enabled"
          checked={enabled}
          disabled={!available && !enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="mt-1 size-5 accent-[var(--color-ink)]"
        />
        <span>
          <span className="block font-semibold">Email me a check-in</span>
          <span className="block text-[0.9375rem] text-muted">
            One short email on the days you choose. It says your routine is ready — no habit names, nothing from your messages.
          </span>
        </span>
      </label>
      <div className="grid gap-5 sm:grid-cols-[10rem_1fr]">
        <Field label="Time" htmlFor="time" hint="Your local time">
          <input id="time" name="time" type="time" required defaultValue={settings.preferredLocalTime} className="field" />
        </Field>
        <fieldset>
          <legend className="text-[0.9375rem] font-semibold">Days</legend>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {DAYS.map(([value, label]) => (
              <label key={value} className="cursor-pointer">
                <input type="checkbox" name="days" value={value} defaultChecked={settings.days.includes(value)} className="peer sr-only" />
                <span className="inline-flex h-10 w-12 items-center justify-center rounded-full border border-line-2 bg-white font-semibold text-muted peer-checked:border-ink peer-checked:bg-ink peer-checked:text-paper peer-focus-visible:outline peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink">
                  {label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="flex items-center gap-3">
        <SubmitButton pendingLabel="Saving…">Save check-in settings</SubmitButton>
        {state.saved ? <span role="status" className="text-sm font-semibold">Saved</span> : null}
      </div>
    </form>
  );
}

export function DeleteAccountForm() {
  const [state, action] = useActionState(deleteAccountAction, {});
  const [typed, setTyped] = useState("");
  return (
    <form action={action} className="flex flex-col gap-3">
      <Field label={<>Type <span className="font-extrabold">delete</span> to confirm</>} htmlFor="confirm" error={state.error}>
        <input id="confirm" name="confirm" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} className="field max-w-xs" />
      </Field>
      <div>
        <SubmitButton variant="danger" disabled={typed.trim().toLowerCase() !== "delete"} pendingLabel="Deleting…">
          Delete my account and data
        </SubmitButton>
      </div>
    </form>
  );
}
