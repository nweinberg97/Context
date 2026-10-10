"use client";

import Link from "next/link";
import { Button } from "@/components/ui";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="mx-auto flex min-h-[70dvh] max-w-lg flex-col justify-center px-4 py-16">
      <h1 className="text-title">That didn&rsquo;t load.</h1>
      <p className="mt-4 text-lg text-muted">
        Something went wrong on our side. Your saved routines are safe. Try again, or head back to today.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Button onClick={reset}>Try again</Button>
        <Link href="/today" className="inline-flex h-11 items-center rounded-full px-5 font-semibold underline underline-offset-4">Go to today</Link>
      </div>
    </main>
  );
}
