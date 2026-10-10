import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getConfig } from "../config";
import { LOCAL_SESSION_COOKIE, decodeSessionCookie, resolveLocalSession } from "./local";
import { createSupabaseServerClient } from "./supabase";

export interface Viewer {
  id: string;
  email: string | null;
  authMode: "supabase" | "local";
}

/**
 * Verified identity for the current request. In Supabase mode the token is checked
 * with the Auth server (getUser), never trusted from the cookie alone. In local mode
 * the signed cookie must reference a live, unrevoked session row.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const config = getConfig();
  if (config.auth.mode === "supabase") {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    return { id: data.user.id, email: data.user.email ?? null, authMode: "supabase" };
  }
  const cookieStore = await cookies();
  const sessionId = decodeSessionCookie(cookieStore.get(LOCAL_SESSION_COOKIE)?.value, config.auth.secret);
  if (!sessionId) return null;
  const session = await resolveLocalSession(sessionId);
  return session ? { id: session.userId, email: session.email, authMode: "local" } : null;
});

export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in");
  return viewer;
}
