import { IconCheck } from "../icons";

/**
 * The product in one picture: a real-looking message with the advice highlighted,
 * and the routine card that comes out of it. One orchestrated motion — the
 * highlighter swipes, then the card rises. Static under reduced motion.
 */
export function HeroDemo() {
  return (
    <div className="relative mx-auto w-full max-w-[34rem]" aria-label="Example: a physio's email turned into a routine" role="img">
      <div className="card relative rotate-[-1.5deg] p-5 pb-8 text-ink shadow-[var(--shadow-lift)] sm:p-7 sm:pb-9">
        <div className="flex items-center gap-3 border-b border-line pb-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-sage font-bold text-forest">MC</span>
          <div className="min-w-0">
            <p className="truncate font-bold leading-tight">Marina Chen, Northside Physio</p>
            <p className="truncate text-sm text-muted">Re: your home program</p>
          </div>
        </div>
        <div className="space-y-3 pt-4 text-[0.98rem] leading-relaxed sm:text-[1.05rem]">
          <p>Hi Jordan, great work today. Your posture is already better.</p>
          <p>
            <span className="mark mark-swipe" style={{ ["--delay" as string]: "450ms" }}>
              Do the chin tucks, 2 x 10, every morning.
            </span>{" "}
            Keep your shoulders relaxed.
          </p>
          <p>
            <span className="mark mark-swipe" style={{ ["--delay" as string]: "1250ms" }}>
              Walk for 20 minutes after lunch.
            </span>{" "}
            See you on the 24th.
          </p>
        </div>
      </div>

      <div
        className="card rise-in relative z-10 -mt-5 ml-auto w-[88%] max-w-[22rem] rotate-[2deg] border-sage-2 bg-paper p-4 text-ink sm:-mr-8 sm:p-5"
        style={{ ["--delay" as string]: "2000ms", ["--tilt" as string]: "2deg" }}
      >
        <p className="text-sm font-semibold text-muted">Today</p>
        <p className="text-xl font-extrabold tracking-tight">Neck &amp; shoulder routine</p>
        <ul className="mt-3 space-y-2">
          <DemoHabit cue="Every morning" name="Chin tucks" detail="2 x 10" done />
          <DemoHabit cue="After lunch" name="Walk" detail="20 minutes" />
        </ul>
      </div>
    </div>
  );
}

function DemoHabit({ cue, name, detail, done }: { cue: string; name: string; detail: string; done?: boolean }) {
  return (
    <li className="flex items-center gap-3 rounded-xl bg-white px-3 py-2.5 ring-1 ring-line">
      <span className={done ? "grid size-7 shrink-0 place-items-center rounded-full bg-ink text-paper" : "size-7 shrink-0 rounded-full border-2 border-line-2"}>
        {done ? <IconCheck size={16} /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-muted">{cue}</span>
        <span className="block truncate font-bold leading-tight">
          {name} <span className="font-medium text-muted">· {detail}</span>
        </span>
      </span>
    </li>
  );
}
