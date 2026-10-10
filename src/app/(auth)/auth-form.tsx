"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button, Field, Notice } from "@/components/ui";
import type { AuthFormState } from "./actions";

export function AuthForm({
  mode,
  action,
  next,
  initialError,
}: {
  mode: "sign-in" | "sign-up";
  action: (state: AuthFormState, formData: FormData) => Promise<AuthFormState>;
  next?: string;
  initialError?: string;
}) {
  const [state, formAction, pending] = useActionState(action, { error: initialError });
  const isSignUp = mode === "sign-up";

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate={false}>
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      {state.notice ? <Notice tone="success">{state.notice}</Notice> : null}
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <Field label="Email" htmlFor="email">
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.email}
          className="field"
          aria-invalid={state.error ? true : undefined}
        />
      </Field>
      <Field label="Password" htmlFor="password" hint={isSignUp ? "At least 10 characters." : undefined}>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete={isSignUp ? "new-password" : "current-password"}
          required
          minLength={isSignUp ? 10 : undefined}
          className="field"
          aria-describedby={isSignUp ? "password-hint" : undefined}
        />
      </Field>
      <Button type="submit" size="lg" disabled={pending} className="mt-1 w-full">
        {pending ? (isSignUp ? "Creating account…" : "Signing in…") : isSignUp ? "Create account" : "Sign in"}
      </Button>
      <p className="text-center text-[0.9375rem] text-muted">
        {isSignUp ? (
          <>
            Already have an account?{" "}
            <Link href="/sign-in" className="font-semibold text-ink underline underline-offset-4">Sign in</Link>
          </>
        ) : (
          <>
            New to Context?{" "}
            <Link href="/sign-up" className="font-semibold text-ink underline underline-offset-4">Create an account</Link>
          </>
        )}
      </p>
    </form>
  );
}
