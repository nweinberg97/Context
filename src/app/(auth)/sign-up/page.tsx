import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth/session";
import { signUpAction } from "../actions";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Create your account" };

export default async function SignUpPage() {
  if (await getViewer()) redirect("/today");
  return (
    <>
      <h1 className="text-title">Start your first routine.</h1>
      <p className="mb-8 mt-3 text-muted">Free while Context is in early access.</p>
      <AuthForm mode="sign-up" action={signUpAction} />
      <p className="mt-8 text-sm text-muted">
        Context organises advice you already received. It doesn&rsquo;t diagnose, treat, or replace your practitioner.
      </p>
    </>
  );
}
