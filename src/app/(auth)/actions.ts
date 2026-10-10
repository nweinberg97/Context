"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  LOCAL_SESSION_COOKIE,
  LOCAL_SESSION_DAYS,
  createLocalSession,
  createLocalUser,
  decodeSessionCookie,
  encodeSessionCookie,
  revokeLocalSession,
  verifyLocalCredentials,
} from "@/lib/auth/local";
import { createSupabaseServerClient } from "@/lib/auth/supabase";
import { getConfig } from "@/lib/config";
import { log } from "@/lib/log";
import { clientIpKey, hashKey, rateLimit } from "@/lib/security/ratelimit";

export interface AuthFormState {
  error?: string;
  notice?: string;
  email?: string;
}

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(254),
  password: z.string().min(10, "Use at least 10 characters for your password.").max(200),
});

async function setLocalCookie(sessionId: string, secret: string) {
  const store = await cookies();
  store.set(LOCAL_SESSION_COOKIE, encodeSessionCookie(sessionId, secret), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && getConfig().appUrl.startsWith("https://"),
    path: "/",
    maxAge: LOCAL_SESSION_DAYS * 24 * 3600,
  });
}

function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  return /^\/(?!\/)[\w\-/?=&#%.]*$/.test(next) ? next : "/today";
}

export async function signUpAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = credentialsSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  const email = String(formData.get("email") ?? "");
  if (!parsed.success) return { error: parsed.error.issues[0]?.message, email };

  if (!(await rateLimit("authAttempt", await clientIpKey()))) {
    return { error: "Too many attempts. Wait a few minutes and try again.", email };
  }

  const config = getConfig();
  if (config.auth.mode === "supabase") {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: { emailRedirectTo: `${config.appUrl}/auth/callback?next=/onboarding` },
    });
    if (error) {
      log.warn("auth.signup_failed", { code: error.code ?? "unknown" });
      return { error: friendlyAuthError(error.code), email };
    }
    if (!data.session) {
      return { notice: "Check your inbox to confirm your email, then sign in.", email };
    }
    redirect("/onboarding");
  }

  const created = await createLocalUser(parsed.data.email, parsed.data.password);
  if ("error" in created) return { error: "An account with that email already exists. Sign in instead.", email };
  await setLocalCookie(await createLocalSession(created.userId), config.auth.secret);
  log.info("auth.signup", { mode: "local" });
  redirect("/onboarding");
}

export async function signInAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password.", email };

  const allowed =
    (await rateLimit("authAttempt", await clientIpKey())) && (await rateLimit("authAttempt", hashKey(`email:${email}`)));
  if (!allowed) return { error: "Too many attempts. Wait a few minutes and try again.", email };

  const next = safeNext(formData.get("next"));
  const config = getConfig();
  if (config.auth.mode === "supabase") {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: friendlyAuthError(error.code), email };
    redirect(next);
  }

  const userId = await verifyLocalCredentials(email, password);
  if (!userId) return { error: "That email and password don't match an account.", email };
  await setLocalCookie(await createLocalSession(userId), config.auth.secret);
  redirect(next);
}

export async function signOutAction(): Promise<void> {
  const config = getConfig();
  if (config.auth.mode === "supabase") {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  } else {
    const store = await cookies();
    const sessionId = decodeSessionCookie(store.get(LOCAL_SESSION_COOKIE)?.value, config.auth.secret);
    if (sessionId) await revokeLocalSession(sessionId);
    store.delete(LOCAL_SESSION_COOKIE);
  }
  redirect("/");
}

function friendlyAuthError(code: string | undefined): string {
  switch (code) {
    case "invalid_credentials":
      return "That email and password don't match an account.";
    case "email_not_confirmed":
      return "Confirm your email first — check your inbox for the link.";
    case "user_already_exists":
    case "email_exists":
      return "An account with that email already exists. Sign in instead.";
    case "weak_password":
      return "Choose a stronger password.";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "Too many attempts. Wait a few minutes and try again.";
    default:
      return "Sign-in didn't work. Try again in a moment.";
  }
}
