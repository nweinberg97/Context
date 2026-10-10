import Link from "next/link";
import { Wordmark } from "@/components/ui";
import { getPublicStatus } from "@/lib/config";

export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const status = getPublicStatus();
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      <aside className="on-dark relative hidden flex-col justify-between overflow-hidden bg-forest p-12 text-paper lg:flex">
        <Link href="/" aria-label="Context home" className="text-[2rem]">
          <Wordmark tone="paper" />
        </Link>
        <p className="text-title max-w-[14ch] font-extrabold">
          The advice you paid for, <span className="mark">on one page.</span>
        </p>
        <p className="max-w-sm text-paper/70">
          Paste what your physio, coach or tutor sent. Approve the habits. Check in each day.
        </p>
      </aside>
      <main id="main" className="flex flex-col px-4 py-8 sm:px-10">
        <Link href="/" aria-label="Context home" className="text-[1.75rem] lg:hidden">
          <Wordmark />
        </Link>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          {status.authMode === "local" ? (
            <p className="mb-6 rounded-2xl bg-forest px-4 py-3 text-sm text-paper">
              <strong className="text-mark">Local development mode.</strong> Accounts are stored in your local database and are
              not production authentication.
            </p>
          ) : null}
          {children}
        </div>
      </main>
    </div>
  );
}
