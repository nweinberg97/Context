import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth/session";
import { signInAction } from "../actions";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  if (await getViewer()) redirect("/today");
  const params = await searchParams;
  const next = params.next && /^\/(?!\/)[\w\-/]*$/.test(params.next) ? params.next : undefined;
  return (
    <>
      <h1 className="text-title">Welcome back.</h1>
      <p className="mb-8 mt-3 text-muted">Sign in to see today&rsquo;s routine.</p>
      <AuthForm
        mode="sign-in"
        action={signInAction}
        next={next}
        initialError={params.error === "link" ? "That sign-in link has expired. Sign in with your password instead." : undefined}
      />
    </>
  );
}
