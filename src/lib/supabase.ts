import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let supabaseClient: SupabaseClient | null = null;

export function getSupabaseEnv() {
  return {
    url,
    anonKey,
  };
}

export function isSupabaseConfigured() {
  return Boolean(url && anonKey);
}

export function getSupabaseBrowserClient() {
  if (!isSupabaseConfigured()) {
    return null;
  }

  if (!supabaseClient) {
    supabaseClient = createClient(url as string, anonKey as string);
  }

  return supabaseClient;
}

export const HEWSTER_PROFILE_SLUG = process.env.NEXT_PUBLIC_HEWSTER_PROFILE_SLUG || "lindy";
