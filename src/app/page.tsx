import Link from "next/link";
import { SignalField } from "@/components/marketing/signal-field";
import { buttonClass, cx, Wordmark } from "@/components/ui";

const NAV = [
  { href: "#how", label: "How it works" },
  { href: "#accuracy", label: "Accuracy" },
  { href: "#privacy", label: "Privacy" },
  { href: "#pricing", label: "Pricing" },
];

export default async function LandingPage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const { deleted } = await searchParams;
  return (
    <div className="on-dark bg-void text-ice">
      {deleted ? (
        <div role="status" className="bg-blue px-4 py-3 text-center font-semibold text-white">
          Your account and data have been deleted.
        </div>
      ) : null}

      {/* ------------------------------------------------------------ Hero */}
      <section className="relative isolate overflow-hidden" aria-labelledby="hero-title">
        <SignalField className="absolute inset-0 -z-10 h-full w-full" />
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgb(3_5_9/0.92)_0%,rgb(3_5_9/0.55)_45%,rgb(3_5_9/0)_80%)]" />
        <div aria-hidden="true" className="absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-t from-void to-transparent" />

        <header className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-4 py-6 sm:px-8">
          <Link href="/" aria-label="Context home" className="text-[1.05rem] sm:text-[1.15rem]">
            <Wordmark tone="paper" />
          </Link>
          <nav aria-label="Main" className="flex items-center gap-1 sm:gap-2">
            {NAV.map((item) => (
              <a key={item.href} href={item.href} className="launch-label hidden px-3 py-2 text-ice/70 transition-colors hover:text-ice lg:inline">
                {item.label}
              </a>
            ))}
            <Link href="/sign-in" className="launch-label px-3 py-2 text-ice/85 transition-colors hover:text-ice">
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="launch-label hidden h-10 items-center rounded-md border border-ice/40 px-4 text-ice transition-colors hover:border-ice hover:bg-ice hover:text-void sm:inline-flex"
            >
              Start free
            </Link>
          </nav>
        </header>

        <div className="mx-auto flex max-w-7xl flex-col px-4 pb-12 pt-20 sm:px-8 sm:pb-16 sm:pt-32 lg:pt-40">
          <h1 id="hero-title" className="launch-display max-w-[15ch] text-[clamp(2.4rem,1rem+5.4vw,5.6rem)]">
            Don&rsquo;t let good advice get lost in your inbox.
          </h1>
          <p className="mt-8 max-w-[36rem] text-lg leading-relaxed text-ice/75 sm:text-xl">
            You invest time and money in your physio, coach, or tutor. Context helps you put that advice into practice.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/sign-up" className={buttonClass("mark", "lg", "launch-label h-14 px-7 text-[0.8125rem]")}>
              Build your first routine
            </Link>
            <a
              href="#how"
              className="launch-label inline-flex h-14 items-center rounded-md border border-ice/30 px-7 text-[0.8125rem] text-ice transition-colors hover:border-ice"
            >
              See how it works
            </a>
          </div>

          <dl className="mt-20 grid max-w-3xl grid-cols-1 border-t border-ice/15 sm:mt-28 sm:grid-cols-3">
            <Readout label="Inbox access" value="None" note="You paste what you choose." />
            <Readout label="Auto-approved" value="0" note="Every habit waits for you." />
            <Readout label="Early access" value="Free" note="No card required." />
          </dl>
        </div>
      </section>

      <main id="main">
        {/* ------------------------------------------------------- Showcase */}
        <section aria-labelledby="showcase-title" className="mx-auto max-w-7xl px-4 py-24 sm:px-8 sm:py-32">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <h2 id="showcase-title" className="launch-display max-w-[18ch] text-[clamp(1.75rem,1rem+2.6vw,3.25rem)]">
              One email in. One page out.
            </h2>
            <p className="max-w-md text-ice/65">
              Context reads the message you paste, lifts out the instructions, and lays them out by when you do them.
            </p>
          </div>

          <div className="mt-12 grid overflow-hidden rounded-xl border border-rule bg-space lg:grid-cols-[1.1fr_auto_1fr]">
            <figure className="min-w-0 p-6 sm:p-9">
              <figcaption className="launch-label text-steel">The message</figcaption>
              <div className="mt-6 flex items-center gap-3 border-b border-rule pb-5">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-space-2 text-sm font-semibold text-ice">MC</span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold">Marina Chen, Northside Physio</span>
                  <span className="block truncate text-sm text-steel">Re: your home program</span>
                </span>
              </div>
              <div className="mt-5 space-y-4 text-[1.0625rem] leading-relaxed text-ice/60">
                <p>Hi Jordan, great work today. Your posture is already better.</p>
                <p>
                  <span className="signal">Do the chin tucks, 2 x 10, every morning.</span> Keep your shoulders relaxed.{" "}
                  <span className="signal">Try the doorway stretch before bed.</span>
                </p>
                <p>
                  <span className="signal">Walk for 20 minutes after lunch.</span> See you on the 24th.
                </p>
              </div>
            </figure>

            <div aria-hidden="true" className="flex items-center justify-center border-y border-rule px-6 py-4 lg:border-x lg:border-y-0 lg:py-0">
              <span className="launch-label flex items-center gap-3 text-blue-2 lg:flex-col">
                <span className="h-px w-10 bg-blue lg:h-10 lg:w-px" />3 found
                <span className="h-px w-10 bg-blue lg:h-10 lg:w-px" />
              </span>
            </div>

            <div className="min-w-0 p-6 sm:p-9">
              <p className="launch-label text-steel">Your routine · Today</p>
              <p className="mt-6 text-2xl font-semibold [font-stretch:112%]">Neck &amp; shoulders</p>
              <div className="mt-6 flex flex-col gap-6">
                <RoutineGroup cue="Every morning" items={[{ name: "Chin tucks", detail: "2 x 10", done: true }]} />
                <RoutineGroup cue="After lunch" items={[{ name: "Walk", detail: "20 minutes" }]} />
                <RoutineGroup cue="Before bed" items={[{ name: "Doorway stretch", detail: "Amount not stated" }]} />
              </div>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------- Steps */}
        <section id="how" aria-labelledby="how-title" className="border-t border-rule">
          <div className="mx-auto max-w-7xl px-4 py-24 sm:px-8 sm:py-32">
            <h2 id="how-title" className="launch-display max-w-[16ch] text-[clamp(1.75rem,1rem+2.6vw,3.25rem)]">
              Three steps. About two minutes.
            </h2>
            <ol className="mt-16 grid border-t border-rule md:grid-cols-3">
              <Step n="01" title="Paste the message">
                Copy the part of an email or note with the advice. Context never connects to your inbox; it only sees what you
                paste.
              </Step>
              <Step n="02" title="Approve what matters">
                Each suggested habit shows the sentence it came from. Edit it, approve it, or leave it out.
              </Step>
              <Step n="03" title="Follow your one-pager">
                Today&rsquo;s routine, grouped by when you do it. Check in with a tap, fix mistakes later, or print it.
              </Step>
            </ol>
          </div>
        </section>

        {/* ------------------------------------------------------- Accuracy */}
        <section id="accuracy" aria-labelledby="accuracy-title" className="bg-ice text-ink">
          <div className="mx-auto grid max-w-7xl items-center gap-14 px-4 py-24 sm:px-8 sm:py-32 lg:grid-cols-[1fr_1.05fr]">
            <div>
              <h2 id="accuracy-title" className="launch-display max-w-[14ch] text-[clamp(1.75rem,1rem+2.6vw,3.25rem)]">
                If it wasn&rsquo;t said, it isn&rsquo;t added.
              </h2>
              <p className="mt-6 max-w-md text-lg text-ink-2">
                When a message doesn&rsquo;t say how often or how much, Context leaves it blank and asks you. It never invents
                reps, schedules or deadlines.
              </p>
            </div>
            <ReviewExample />
          </div>
        </section>

        {/* -------------------------------------------------------- Privacy */}
        <section id="privacy" aria-labelledby="privacy-title" className="mx-auto max-w-7xl px-4 py-24 sm:px-8 sm:py-32">
          <h2 id="privacy-title" className="launch-display max-w-[14ch] text-[clamp(1.75rem,1rem+2.6vw,3.25rem)]">
            Your advice stays yours.
          </h2>
          <ul className="mt-14 grid border-l border-t border-rule sm:grid-cols-2 lg:grid-cols-4">
            <Commitment title="No inbox access">You paste exactly what you want processed. Nothing else is read.</Commitment>
            <Commitment title="Nothing starts without you">Suggested habits stay drafts until you approve each one.</Commitment>
            <Commitment title="Every habit is traceable">Each one links back to the words it came from.</Commitment>
            <Commitment title="Export or delete anytime">Download everything, remove message text, or delete your account.</Commitment>
          </ul>
          <p className="mt-8 max-w-3xl text-[0.9375rem] text-steel">
            When AI reading is on, the text you paste is sent to an AI provider to find the habits in it, and Settings shows which
            one. Context is a personal organising tool, not medical or professional advice.
          </p>
        </section>

        {/* -------------------------------------------------------- Pricing */}
        <section id="pricing" aria-labelledby="pricing-title" className="bg-ice text-ink">
          <div className="mx-auto max-w-7xl px-4 py-24 sm:px-8 sm:py-32">
            <h2 id="pricing-title" className="launch-display text-[clamp(1.75rem,1rem+2.6vw,3.25rem)]">Free to start.</h2>
            <div className="mt-14 grid gap-5 md:grid-cols-2">
              <div className="flex flex-col rounded-xl bg-void p-8 text-ice sm:p-10">
                <p className="launch-label text-blue-2">Available now</p>
                <h3 className="mt-3 text-3xl font-semibold [font-stretch:112%]">Free</h3>
                <ul className="mt-8 flex flex-col gap-3 text-ice/80">
                  {["Paste advice from any message", "Review and approve every habit", "Daily one-pager and print view", "Optional email check-ins", "Export and delete your data"].map((f) => (
                    <li key={f} className="flex gap-3">
                      <span aria-hidden="true" className="mt-2.5 size-1.5 shrink-0 bg-blue" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link href="/sign-up" className={buttonClass("mark", "lg", "launch-label mt-10 self-start text-[0.8125rem]")}>
                  Start free
                </Link>
              </div>
              <div className="flex flex-col rounded-xl border border-line-2 p-8 sm:p-10">
                <p className="launch-label text-muted">Planned</p>
                <h3 className="mt-3 text-3xl font-semibold [font-stretch:112%]">Plus</h3>
                <p className="mt-2 text-muted">For people working with more than one advisor.</p>
                <ul className="mt-8 flex flex-col gap-3 text-ink-2">
                  {["Forward emails to a private Context address", "Share a routine with your practitioner", "Longer history"].map((f) => (
                    <li key={f} className="flex gap-3">
                      <span aria-hidden="true" className="mt-2.5 size-1.5 shrink-0 bg-line-2" />
                      {f}
                    </li>
                  ))}
                </ul>
                <p className="mt-auto pt-10 text-[0.9375rem] text-muted">
                  Plus isn&rsquo;t available yet. Pricing will be announced before anything is charged.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------ Final CTA */}
        <section aria-labelledby="final-title" className="bg-blue text-white">
          <div className="mx-auto flex max-w-7xl flex-col items-start gap-10 px-4 py-24 sm:px-8 sm:py-28">
            <h2 id="final-title" className="launch-display max-w-[20ch] text-[clamp(1.9rem,1rem+3.4vw,4rem)]">
              Your next appointment is weeks away. Your routine can start today.
            </h2>
            <Link
              href="/sign-up"
              className="launch-label inline-flex h-14 items-center rounded-md bg-white px-7 text-[0.8125rem] text-void transition-colors hover:bg-ice"
            >
              Build your first routine
            </Link>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-12 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <Wordmark tone="paper" className="text-base" />
        <p className="max-w-md text-[0.9375rem] text-steel">
          Context organises advice you already received. It doesn&rsquo;t diagnose, treat, or replace your practitioner.
        </p>
        <Link href="/sign-in" className="launch-label text-ice/70 hover:text-ice">Sign in</Link>
      </footer>
    </div>
  );
}

function Readout({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="border-b border-ice/15 py-5 sm:border-b-0 sm:border-r sm:px-6 sm:first:pl-0 sm:last:border-r-0">
      <dt className="launch-label text-steel">{label}</dt>
      <dd className="mt-2 text-3xl font-semibold tabular-nums [font-stretch:112%]">{value}</dd>
      <dd className="mt-1 text-sm text-ice/55">{note}</dd>
    </div>
  );
}

function RoutineGroup({ cue, items }: { cue: string; items: Array<{ name: string; detail: string; done?: boolean }> }) {
  return (
    <div>
      <p className="launch-label text-blue-2">{cue}</p>
      <ul className="mt-3 flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.name} className="flex items-center gap-4 rounded-lg border border-rule bg-void/60 px-4 py-3.5">
            <span
              aria-hidden="true"
              className={cx("grid size-6 shrink-0 place-items-center rounded-full border", item.done ? "border-blue bg-blue" : "border-steel/50")}
            >
              {item.done ? (
                <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m5 12.5 4.5 4.5L19 7.5" />
                </svg>
              ) : null}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{item.name}</span>
              <span className={cx("block truncate text-sm", item.detail.includes("not stated") ? "text-steel italic" : "text-ice/60")}>
                {item.detail}
              </span>
            </span>
            <span className="sr-only">{item.done ? "Done" : "Not reported yet"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <li className="flex flex-col gap-4 border-b border-rule py-10 md:border-b-0 md:border-r md:px-8 md:first:pl-0 md:last:border-r-0">
      <span aria-hidden="true" className="text-5xl font-extralight tabular-nums text-blue-2 [font-stretch:125%]">{n}</span>
      <h3 className="text-xl font-semibold [font-stretch:112%]">{title}</h3>
      <p className="max-w-sm text-ice/65">{children}</p>
    </li>
  );
}

function Commitment({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <li className="flex flex-col gap-3 border-b border-r border-rule p-7">
      <span aria-hidden="true" className="size-2 bg-blue" />
      <h3 className="text-lg font-semibold [font-stretch:112%]">{title}</h3>
      <p className="text-ice/65">{children}</p>
    </li>
  );
}

function ReviewExample() {
  const fields = [
    ["When", "Not stated"],
    ["How often", "Not stated"],
    ["How much", "Not stated"],
  ];
  return (
    <figure className="rounded-xl border border-line bg-white p-6 shadow-[var(--shadow-lift)] sm:p-8" aria-label="Example of a suggested habit with missing details">
      <div className="flex items-center justify-between gap-3">
        <span className="launch-label text-muted">Suggestion 3</span>
        <span className="rounded-md bg-sage px-2.5 py-1 text-sm font-semibold text-blue">Waiting for you</span>
      </div>
      <p className="mt-3 text-2xl font-semibold [font-stretch:112%]">Breathing exercises</p>
      <dl className="mt-5 grid grid-cols-3 gap-4 border-y border-line py-4 text-[0.9375rem]">
        {fields.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-sm text-muted">{label}</dt>
            <dd className="italic text-muted">{value}</dd>
          </div>
        ))}
      </dl>
      <blockquote className="mt-5 border-l-2 border-blue pl-4 text-ink-2">&ldquo;Keep working on your breathing exercises.&rdquo;</blockquote>
      <p className="mt-5 rounded-lg bg-sage/70 px-4 py-3 text-[0.9375rem] text-ink-2">
        The message doesn&rsquo;t say when or how often. Add it yourself, or approve it as written.
      </p>
      <div className="mt-6 flex flex-wrap gap-2" aria-hidden="true">
        <span className={buttonClass("primary", "md")}>Approve</span>
        <span className={buttonClass("secondary", "md")}>Edit</span>
        <span className={buttonClass("ghost", "md")}>Not a habit</span>
      </div>
    </figure>
  );
}
