"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { IconBell, IconHighlighter, IconToday } from "@/components/icons";
import { Button, Field, Notice, cx } from "@/components/ui";
import { completeOnboardingAction } from "./actions";

const STEPS = ["Welcome", "Time zone", "Check-ins"] as const;

export function OnboardingFlow({ remindersAvailable, savedTimezone }: { remindersAvailable: boolean; savedTimezone: string | null }) {
  const [step, setStep] = useState(0);
  const [timezone, setTimezone] = useState(savedTimezone ?? "UTC");
  const [reminders, setReminders] = useState(false);
  const [state, formAction, pending] = useActionState(completeOnboardingAction, {});

  useEffect(() => {
    if (!savedTimezone) {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (detected) setTimezone(detected);
    }
  }, [savedTimezone]);

  const zones = useMemo(() => {
    const list = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
    return list.includes(timezone) ? list : [timezone, ...list];
  }, [timezone]);

  return (
    <div className="mx-auto max-w-xl">
      <ol aria-label="Setup progress" className="mb-10 flex gap-2">
        {STEPS.map((label, i) => (
          <li key={label} className="flex-1">
            <span className={cx("block h-1.5 rounded-full", i <= step ? "bg-ink" : "bg-line-2")} />
            <span className={cx("mt-2 block text-sm font-semibold", i === step ? "text-ink" : "text-muted")}>
              <span className="sr-only">Step {i + 1}: </span>
              {label}
            </span>
          </li>
        ))}
      </ol>

      <form action={formAction}>
        <input type="hidden" name="timezone" value={timezone} />

        {step === 0 ? (
          <section aria-labelledby="welcome-title">
            <h1 id="welcome-title" className="text-title">Let&rsquo;s turn advice into a routine.</h1>
            <ul className="mt-8 space-y-5">
              <Point icon={<IconHighlighter />} title="Paste the advice">
                Copy the useful part of an email or note. Context finds the habits in it — it doesn&rsquo;t read your inbox.
              </Point>
              <Point icon={<IconToday />} title="Approve each habit">
                You see exactly which words each habit came from. Nothing starts until you say so.
              </Point>
              <Point icon={<IconBell />} title="Check in your way">
                Tick things off on your one-page routine. Email check-ins are optional and off by default.
              </Point>
            </ul>
            <Button size="lg" className="mt-10" onClick={() => setStep(1)}>Get started</Button>
          </section>
        ) : null}

        {step === 1 ? (
          <section aria-labelledby="tz-title">
            <h1 id="tz-title" className="text-title">Where are you?</h1>
            <p className="mt-3 text-muted">Your day starts and ends in this time zone, so check-ins land on the right date.</p>
            <Field label="Time zone" htmlFor="tz-select" className="mt-8" hint="Detected from this device. Change it if it's wrong.">
              <select id="tz-select" className="field" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                {zones.map((z) => (
                  <option key={z} value={z}>{z.replaceAll("_", " ")}</option>
                ))}
              </select>
            </Field>
            <div className="mt-10 flex gap-3">
              <Button size="lg" onClick={() => setStep(2)}>Continue</Button>
              <Button size="lg" variant="ghost" onClick={() => setStep(0)}>Back</Button>
            </div>
          </section>
        ) : null}

        {step === 2 ? (
          <section aria-labelledby="checkin-title">
            <h1 id="checkin-title" className="text-title">Want a nudge?</h1>
            <p className="mt-3 text-muted">
              A short email that says your routine is ready. It never includes your habits or the original message. You can
              change this any time.
            </p>
            {!remindersAvailable ? (
              <Notice tone="warning" className="mt-6">
                Email check-ins aren&rsquo;t set up on this server yet, so this stays off. Everything else works.
              </Notice>
            ) : null}
            <div className="card mt-6 p-5">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  name="reminders"
                  checked={reminders}
                  disabled={!remindersAvailable}
                  onChange={(e) => setReminders(e.target.checked)}
                  className="mt-1 size-5 accent-[var(--color-ink)]"
                />
                <span>
                  <span className="block font-semibold">Email me a daily check-in</span>
                  <span className="block text-[0.9375rem] text-muted">Off unless you turn it on.</span>
                </span>
              </label>
              <Field label="Preferred time" htmlFor="checkinTime" className="mt-5" hint="Optional. Your local time.">
                <input id="checkinTime" name="checkinTime" type="time" defaultValue="08:00" className="field max-w-40" />
              </Field>
            </div>
            {state.error ? <Notice tone="error" className="mt-6">{state.error}</Notice> : null}
            <div className="mt-10 flex flex-wrap gap-3">
              <Button type="submit" size="lg" disabled={pending}>{pending ? "Saving…" : "Add my first advice"}</Button>
              <Button size="lg" variant="ghost" onClick={() => setStep(1)}>Back</Button>
            </div>
          </section>
        ) : null}
      </form>
    </div>
  );
}

function Point({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-mark text-forest">{icon}</span>
      <span>
        <span className="block text-lg font-bold">{title}</span>
        <span className="block text-ink-2">{children}</span>
      </span>
    </li>
  );
}
