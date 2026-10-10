import Link from "next/link";
import { LinkButton, Wordmark } from "@/components/ui";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4 py-16">
      <Link href="/" aria-label="Context home" className="mb-10 text-[1.75rem]"><Wordmark /></Link>
      <h1 className="text-title">Nothing here.</h1>
      <p className="mt-4 text-lg text-muted">This page doesn&rsquo;t exist, or it belongs to a different account.</p>
      <div className="mt-8"><LinkButton href="/today">Go to today</LinkButton></div>
    </main>
  );
}
