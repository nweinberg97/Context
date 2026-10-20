import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SubmitButton } from "@/components/habits/confirm-button";
import { Wordmark } from "@/components/ui";
import { unsubscribeByKey, unsubscribeKeyExists } from "@/lib/domain/profile";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Opening this page (GET) changes nothing — email scanners follow links. The person
 * confirms with a button, which submits a POST server action.
 */
async function unsubscribe(key: string) {
  "use server";
  await unsubscribeByKey(key);
  redirect("/unsubscribe/done");
}

export default async function UnsubscribePage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const done = key === "done";
  const valid = done ? true : await unsubscribeKeyExists(key);

  return (
    <main id="main" tabIndex={-1} className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4 py-16">
      <Link href="/" aria-label="Context home" className="mb-10 text-[1.75rem]"><Wordmark /></Link>
      {done ? (
        <>
          <h1 className="text-title">You&rsquo;re unsubscribed.</h1>
          <p className="mt-4 text-lg text-muted">No more check-in emails. You can turn them back on in Settings any time.</p>
        </>
      ) : valid ? (
        <>
          <h1 className="text-title">Stop check-in emails?</h1>
          <p className="mt-4 text-lg text-muted">Your routines stay exactly as they are. Only the emails stop.</p>
          <form action={unsubscribe.bind(null, key)} className="mt-8">
            <SubmitButton size="lg" pendingLabel="Unsubscribing…">Unsubscribe</SubmitButton>
          </form>
        </>
      ) : (
        <>
          <h1 className="text-title">This link doesn&rsquo;t work.</h1>
          <p className="mt-4 text-lg text-muted">
            It may be out of date. Sign in and change check-ins under{" "}
            <Link href="/settings#reminders" className="font-semibold text-ink underline underline-offset-4">Settings</Link>.
          </p>
        </>
      )}
    </main>
  );
}
