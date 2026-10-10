import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getConfig } from "../config";

export async function createSupabaseServerClient() {
  const config = getConfig();
  if (config.auth.mode !== "supabase") throw new Error("Supabase is not configured");
  const cookieStore = await cookies();
  return createServerClient(config.auth.url, config.auth.anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component: the middleware refreshes cookies instead.
        }
      },
    },
  });
}

/** Admin client — used only to delete an auth user during account deletion. */
export function createSupabaseAdmin() {
  const config = getConfig();
  if (config.auth.mode !== "supabase" || !config.auth.serviceRoleKey) return null;
  return createClient(config.auth.url, config.auth.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
