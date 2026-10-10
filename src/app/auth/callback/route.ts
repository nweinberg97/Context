import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/auth/supabase";
import { getConfig } from "@/lib/config";

/** Supabase email-confirmation / magic-link callback (PKCE code exchange). */
export async function GET(request: NextRequest) {
  const config = getConfig();
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextParam = url.searchParams.get("next") ?? "/today";
  const next = /^\/(?!\/)[\w\-/]*$/.test(nextParam) ? nextParam : "/today";

  if (config.auth.mode !== "supabase" || !code) {
    return NextResponse.redirect(new URL("/sign-in", config.appUrl));
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL("/sign-in?error=link", config.appUrl));
  }
  return NextResponse.redirect(new URL(next, config.appUrl));
}
