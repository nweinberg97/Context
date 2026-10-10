import Link from "next/link";
import type { ReactNode } from "react";
import type { PublicStatus } from "@/lib/config";
import { Wordmark } from "../ui";
import { BottomNav, TopNav } from "./nav";

export function AppShell({ status, children }: { status: Pick<PublicStatus, "authMode" | "extractionMode">; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      {status.authMode === "local" ? (
        <div className="no-print bg-forest px-4 py-2 text-center text-sm text-paper">
          <strong className="font-semibold text-mark">Local development mode.</strong> Sign-in here is for testing only — it isn&rsquo;t
          production authentication.
        </div>
      ) : null}
      <header className="no-print sticky top-0 z-20 border-b border-line/70 bg-paper/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/today" aria-label="Context, today" className="text-[1.6rem]">
            <Wordmark />
          </Link>
          <TopNav />
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 pb-32 pt-8 sm:px-6 sm:pt-12 md:pb-16">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
