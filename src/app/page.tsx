import Link from "next/link";
import { HeroDemo } from "@/components/marketing/hero-demo";
import { IconArchive, IconCheck, IconHighlighter, IconLock } from "@/components/icons";
import { LinkButton, Wordmark } from "@/components/ui";

export default async function LandingPage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const { deleted } = await searchParams;
  return (
    <>
      {deleted ? (
        <div role="status" className="bg-mark px-4 py-3 text-center font-semibold text-forest">
          Your account and data have been deleted.
        </div>
      ) : null}
      <div className="on-dark bg-forest text-paper">
        <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 pt-5 sm:px-6 sm:pt-7">
          <Link href="/" aria-label="Context home" className="text-[1.75rem]">
            <Wordmark tone="paper" />
          </Link>
          <nav aria-label="Main" className="flex items-center gap-1 sm:gap-2">
            <a href="#how" className="hidden rounded-full px-3 py-2 font-medium text-paper/80 hover:text-paper md:inline">How it works</a>
            <a href="#privacy" className="hidden rounded-full px-3 py-2 font-medium text-paper/80 hover:text-paper md:inline">Privacy</a>
            <a href="#pricing" className="hidden rounded-full px-3 py-2 font-medium text-paper/80 hover:text-paper md:inline">Pricing</a>
            <Link href="/sign-in" className="rounded-full px-3 py-2 font-medium text-paper/90 hover:text-paper">Sign in</Link>
            <LinkButton href="/sign-up" variant="mark" size="sm" className="hidden sm:inline-flex">Start free</LinkButton>
          </nav>
        </header>

        <main id="main">
          <section className="mx-auto grid max-w-6xl items-center gap-x-10 gap-y-14 px-4 pb-20 pt-14 sm:px-6 sm:pt-20 lg:grid-cols-[1.15fr_1fr] lg:pb-28 lg:pt-24">
            <div className="min-w-0">
              <h1 className="text-display max-w-[11ch] text-paper">Don&rsquo;t let good advice get lost in your inbox.</h1>
              <p className="mt-7 max-w-[34rem] text-lg leading-relaxed text-paper/80 sm:text-xl">
                You invest time and money in your physio, coach, or tutor. Context helps you put that advice into practice.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <LinkButton href="/sign-up" variant="mark" size="lg">Build your first routine</LinkButton>
                <a href="#how" className="inline-flex h-14 items-center rounded-full px-5 text-lg font-semibold text-paper underline decoration-paper/30 underline-offset-[6px] hover:decoration-mark">
                  See how it works
                </a>
              </div>
              <p className="mt-6 text-[0.9375rem] text-paper/60">Free while in early access. No inbox access, ever.</p>
            </div>
            <HeroDemo />
          </section>
        </main>
      </div>

      <section id="how" aria-labelledby="how-title" className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <h2 id="how-title" className="text-title max-w-[16ch]">From one email to one page.</h2>
        <ol className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
          <Step n={1} title="Paste the message">
            Copy the part of an email or note that has the advice. Context only ever sees what you paste.
          </Step>
          <Step n={2} title="Approve what matters">
            Each suggested habit shows the exact words it came from. Edit it, approve it, or leave it out. If the message
            doesn&rsquo;t say how often, neither does Context.
          </Step>
          <Step n={3} title="Follow your one-pager">
            Today&rsquo;s routine, grouped by when you do it. Check in with a tap, fix a mistake later, or print it for the fridge.
          </Step>
        </ol>
      </section>

      <section id="privacy" aria-labelledby="privacy-title" className="bg-sage">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <h2 id="privacy-title" className="text-title max-w-[12ch] text-forest">Your advice stays yours.</h2>
            <p className="mt-5 max-w-md text-lg text-ink-2">
              Context is built around consent. You decide what goes in, what becomes a habit, and what gets deleted.
            </p>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2">
            <Commitment icon={<IconLock />} title="No inbox access">
              You paste exactly what you want processed. Context never connects to your mailbox.
            </Commitment>
            <Commitment icon={<IconCheck />} title="Nothing starts without you">
              Suggested habits stay drafts until you approve each one.
            </Commitment>
            <Commitment icon={<IconHighlighter />} title="Nothing made up">
              Every habit links to the words it came from. Unstated details stay blank.
            </Commitment>
            <Commitment icon={<IconArchive />} title="Export or delete anytime">
              Download everything as a file, remove message text, or delete your account in Settings.
            </Commitment>
          </ul>
          <p className="text-[0.9375rem] text-ink-2 lg:col-start-2">
            When AI reading is switched on, the text you paste is sent to an AI provider to find the habits in it. Settings
            shows which provider is in use. Context is a personal organising tool, not medical or professional advice.
          </p>
        </div>
      </section>

      <section id="pricing" aria-labelledby="pricing-title" className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <h2 id="pricing-title" className="text-title">Free to start.</h2>
        <div className="mt-12 grid gap-5 md:grid-cols-2">
          <div className="card flex flex-col p-7 sm:p-9">
            <h3 className="text-heading">Free</h3>
            <p className="mt-1 text-muted">Everything in Context today.</p>
            <ul className="mt-6 space-y-3">
              {["Paste advice from any message", "Review and approve every habit", "Daily one-pager and print view", "Optional email check-ins", "Export and delete your data"].map((f) => (
                <li key={f} className="flex gap-3"><IconCheck className="mt-0.5 shrink-0 text-ink" />{f}</li>
              ))}
            </ul>
            <LinkButton href="/sign-up" className="mt-8 self-start">Start free</LinkButton>
          </div>
          <div className="flex flex-col rounded-[var(--radius-card)] border border-dashed border-line-2 p-7 sm:p-9">
            <div className="flex items-center gap-3">
              <h3 className="text-heading">Plus</h3>
              <span className="rounded-full bg-mark-2 px-2.5 py-0.5 text-sm font-semibold text-forest">Planned</span>
            </div>
            <p className="mt-1 text-muted">For people working with more than one advisor.</p>
            <ul className="mt-6 space-y-3 text-ink-2">
              {["Forward emails to a private Context address", "Share a routine with your practitioner", "Longer history"].map((f) => (
                <li key={f} className="flex gap-3"><span aria-hidden="true" className="mt-2.5 size-1.5 shrink-0 rounded-full bg-muted" />{f}</li>
              ))}
            </ul>
            <p className="mt-8 text-[0.9375rem] text-muted">Plus isn&rsquo;t available yet. Pricing will be announced before anything is charged.</p>
          </div>
        </div>
      </section>

      <section className="bg-mark">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-8 px-4 py-20 sm:px-6 sm:py-24">
          <h2 className="text-title max-w-[18ch] text-forest">Your next appointment is weeks away. Your routine can start today.</h2>
          <LinkButton href="/sign-up" size="lg">Build your first routine</LinkButton>
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 text-[0.9375rem] text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <Wordmark className="text-2xl" />
        <p className="max-w-md">Context organises advice you already received. It doesn&rsquo;t diagnose, treat, or replace your practitioner.</p>
      </footer>
    </>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex flex-col gap-4">
      <span aria-hidden="true" className="text-[4.5rem] font-extrabold leading-none tracking-[-0.05em] text-sage-2">{n}</span>
      <h3 className="text-heading">{title}</h3>
      <p className="max-w-sm text-ink-2">{children}</p>
    </li>
  );
}

function Commitment({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <li className="rounded-[var(--radius-card)] bg-paper/70 p-5">
      <span className="grid size-10 place-items-center rounded-full bg-forest text-mark">{icon}</span>
      <h3 className="mt-4 text-lg font-bold">{title}</h3>
      <p className="mt-1 text-ink-2">{children}</p>
    </li>
  );
}
