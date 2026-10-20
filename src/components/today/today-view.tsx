import Link from "next/link";
import type { CompletionState, HabitEvent, RoutineWithHabits } from "@/lib/domain/types";
import { habitDetails, groupKey, groupRank } from "../habits/format";
import { IconAdd, IconBell, IconDownload } from "../icons";
import { Chip, LinkButton, Notice, buttonClass, cx } from "../ui";
import { CompletionControl } from "./completion";
import { PrintButton } from "./print-button";

export interface TodayViewProps {
  date: string; // the day being viewed, YYYY-MM-DD
  today: string;
  days: string[]; // recent days, oldest first, ending today
  routines: RoutineWithHabits[];
  events: HabitEvent[];
  banner?: "saved" | null;
  /** The routine that was just saved, for the PDF link in the banner. */
  savedRoutineId?: string | null;
  remindersOn: boolean;
}

function formatDay(date: string, opts: Intl.DateTimeFormatOptions) {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Intl.DateTimeFormat("en-US", { ...opts, timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function TodayView({ date, today, days, routines, events, banner, savedRoutineId, remindersOn }: TodayViewProps) {
  const habits = routines.flatMap((r) => r.habits.map((h) => ({ ...h, routineTitle: r.title })));
  const isToday = date === today;
  const stateFor = (habitId: string, day: string): CompletionState | null =>
    events.find((e) => e.habitId === habitId && e.occurredOn === day)?.state ?? null;

  const reported = habits.filter((h) => stateFor(h.id, date) !== null).length;
  const done = habits.filter((h) => stateFor(h.id, date) === "done").length;

  const groups = new Map<string, typeof habits>();
  for (const h of habits) {
    const key = groupKey(h);
    groups.set(key, [...(groups.get(key) ?? []), h]);
  }
  const ordered = [...groups.entries()].sort((a, b) => groupRank(a[0]) - groupRank(b[0]));
  const multipleRoutines = routines.length > 1;

  if (habits.length === 0) {
    return (
      <section className="mx-auto max-w-2xl py-6 text-center sm:py-16">
        <p className="text-sm font-semibold text-muted">{formatDay(today, { weekday: "long", month: "long", day: "numeric" })}</p>
        <h1 className="text-title mt-3">Your page is empty — for now.</h1>
        <p className="mx-auto mt-4 max-w-md text-lg text-muted">
          Paste the advice from a recent appointment or lesson. You&rsquo;ll approve each habit before it shows up here.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <LinkButton href="/import" size="lg"><IconAdd size={20} /> Add advice</LinkButton>
          <LinkButton href="/routines?new=1" size="lg" variant="secondary">Write one yourself</LinkButton>
        </div>
      </section>
    );
  }

  return (
    <div>
      {banner === "saved" ? (
        <Notice tone="success" className="no-print mb-8" title="Routine saved.">
          It&rsquo;s on your page below. Check things off as you go — anything you don&rsquo;t report just stays blank.
          {savedRoutineId && routines.some((r) => r.id === savedRoutineId) ? (
            <>
              {" "}
              <a href={`/routines/${savedRoutineId}/pdf`} className="font-semibold underline underline-offset-4">
                Download it as a PDF
              </a>
              .
            </>
          ) : null}
        </Notice>
      ) : null}

      <header className="mb-8 flex flex-wrap items-end justify-between gap-6">
        <div className="min-w-0">
          <p className="font-semibold text-muted">{isToday ? "Today" : formatDay(date, { weekday: "long" })}</p>
          <h1 className="text-title">{formatDay(date, { weekday: isToday ? "long" : undefined, month: "long", day: "numeric" })}</h1>
          <p className="mt-2 text-muted">
            {habits.length} habit{habits.length === 1 ? "" : "s"}
            {multipleRoutines ? ` from ${routines.length} routines` : ` · ${routines[0]!.title}`}
          </p>
        </div>
        <div className="no-print w-full max-w-xs sm:w-64" aria-label="Progress">
          <p className="text-[0.9375rem]">
            <strong className="font-bold">{done}</strong> done · {reported} of {habits.length} checked in
          </p>
          <div className="mt-2 flex gap-1" aria-hidden="true">
            {habits.map((h) => {
              const s = stateFor(h.id, date);
              return (
                <span
                  key={h.id}
                  className={cx(
                    "h-1.5 flex-1 rounded-full",
                    s === "done" ? "bg-ink" : s === "partial" ? "bg-mark" : s === "skipped" ? "bg-sage-2" : "bg-line-2",
                  )}
                />
              );
            })}
          </div>
        </div>
      </header>

      <nav aria-label="Recent days" className="no-print -mx-4 mb-10 overflow-x-auto px-4">
        <ol className="flex gap-2">
          {days.map((d) => {
            const active = d === date;
            const any = habits.some((h) => stateFor(h.id, d) !== null);
            return (
              <li key={d}>
                <Link
                  href={d === today ? "/today" : `/today?date=${d}`}
                  aria-current={active ? "date" : undefined}
                  className={cx(
                    "flex w-14 flex-col items-center rounded-2xl py-2 transition-colors",
                    active ? "bg-ink text-paper" : "bg-white text-ink ring-1 ring-line hover:ring-ink",
                  )}
                >
                  <span className={cx("text-xs font-semibold", active ? "text-paper/70" : "text-muted")}>{formatDay(d, { weekday: "short" })}</span>
                  <span className="text-lg font-extrabold leading-tight">{formatDay(d, { day: "numeric" })}</span>
                  <span aria-hidden="true" className={cx("mt-0.5 size-1.5 rounded-full", any ? (active ? "bg-mark" : "bg-ink") : "bg-transparent")} />
                </Link>
              </li>
            );
          })}
        </ol>
      </nav>

      {!isToday ? (
        <Notice tone="info" className="no-print mb-8">
          You&rsquo;re looking at {formatDay(date, { weekday: "long", month: "long", day: "numeric" })}. Changes here correct that day.{" "}
          <Link href="/today" className="font-semibold underline underline-offset-4">Back to today</Link>
        </Notice>
      ) : null}

      <div className="flex flex-col gap-10">
        {ordered.map(([label, items]) => (
          <section key={label} aria-labelledby={`group-${label}`}>
            <h2 id={`group-${label}`} className="mb-4 text-heading">
              <span className="mark">{label}</span>
            </h2>
            <ul className="flex flex-col gap-3">
              {items.map((h) => {
                const d = habitDetails(h);
                return (
                  <li key={h.id} className="card flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <h3 className="text-lg font-bold leading-snug break-words">{h.name}</h3>
                        {d.often && d.often.toLowerCase() !== label.toLowerCase() ? <Chip tone="sage">{d.often}</Chip> : null}
                        {d.amount ? <Chip tone="sage">{d.amount}</Chip> : null}
                      </div>
                      <p className="mt-1 break-words text-[0.9375rem] text-muted">{h.instruction}</p>
                      {multipleRoutines ? <p className="mt-1 text-sm font-semibold text-ink-2">{h.routineTitle}</p> : null}
                      <span className="print-only mt-2 text-sm">□ M&nbsp;&nbsp;□ T&nbsp;&nbsp;□ W&nbsp;&nbsp;□ T&nbsp;&nbsp;□ F&nbsp;&nbsp;□ S&nbsp;&nbsp;□ S</span>
                    </div>
                    <div className="no-print">
                      <CompletionControl habitId={h.id} habitName={h.name} date={date} current={stateFor(h.id, date)} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <footer className="no-print mt-12 flex flex-wrap items-center gap-3 border-t border-line pt-6">
        {routines.map((r) => (
          <a key={r.id} href={`/routines/${r.id}/pdf`} className={buttonClass("primary")}>
            <IconDownload size={18} /> {multipleRoutines ? `${r.title} PDF` : "Download PDF"}
          </a>
        ))}
        <PrintButton />
        <LinkButton href="/routines" variant="ghost">Edit routines</LinkButton>
        <LinkButton href="/settings#reminders" variant="ghost">
          <IconBell size={18} /> {remindersOn ? "Check-ins are on" : "Set up check-ins"}
        </LinkButton>
      </footer>
      <p className="print-only mt-8 text-sm">Printed from Context. Tick a box each day you do it.</p>
    </div>
  );
}

