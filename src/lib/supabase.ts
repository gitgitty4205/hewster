import { createClient, type Session, type SupabaseClient, type User } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let supabaseClient: SupabaseClient | null = null;
let supabaseDevFetchNoiseFilterInstalled = false;
let currentSessionCache: { expiresAt: number; session: Session | null } | null = null;
let currentSessionPromise: Promise<Session | null> | null = null;
const SESSION_CACHE_TTL_MS = 60_000;
const SESSION_LOOKUP_TIMEOUT_MS = 8_000;
const AUTH_REACHABILITY_TIMEOUT_MS = 8_000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timeoutId = globalThis.setTimeout(() => resolve(fallback), timeoutMs);
    promise.then(
      (value) => {
        globalThis.clearTimeout(timeoutId);
        resolve(value);
      },
      () => {
        globalThis.clearTimeout(timeoutId);
        resolve(fallback);
      },
    );
  });
}

function sessionFromStoredAuthValue(value: string | null): Session | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Partial<Session> & {
      currentSession?: Session | null;
      session?: Session | null;
    };
    const session = parsed.currentSession ?? parsed.session ?? (parsed.access_token && parsed.user ? parsed as Session : null);
    if (!session?.access_token || !session.user) return null;

    const expiresAt = typeof session.expires_at === "number" ? session.expires_at : null;
    if (expiresAt && expiresAt * 1000 <= Date.now()) return null;

    return session;
  } catch {
    return null;
  }
}

export function getStoredSupabaseSession(): Session | null {
  if (typeof window === "undefined") return null;

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key || !(key.includes("auth-token") || key.includes("supabase.auth.token"))) continue;

    const session = sessionFromStoredAuthValue(window.localStorage.getItem(key));
    if (session) return session;
  }

  return null;
}

function installSupabaseDevFetchNoiseFilter() {
  if (
    supabaseDevFetchNoiseFilterInstalled ||
    process.env.NODE_ENV !== "development" ||
    typeof window === "undefined"
  ) {
    return;
  }

  supabaseDevFetchNoiseFilterInstalled = true;
  const originalConsoleError = console.error.bind(console);

  console.error = (...args: unknown[]) => {
    const [firstArg] = args;
    const errorName = firstArg instanceof Error ? firstArg.name : "";
    const errorMessage = firstArg instanceof Error ? firstArg.message : String(firstArg ?? "");
    const errorStack = firstArg instanceof Error ? firstArg.stack ?? "" : "";

    const isSupabaseAuthFetchNoise =
      (errorMessage === "Failed to fetch" || errorName === "AuthRetryableFetchError") &&
      /supabase|GoTrueClient|_handleRequest|_request/.test(errorStack);

    if (isSupabaseAuthFetchNoise) {
      return;
    }

    originalConsoleError(...args);
  };
}

export function getSupabaseEnv() {
  return {
    url,
    anonKey,
  };
}

export const PASSWORD_RESET_REQUIRED_STORAGE_KEY = "petnotebook.passwordResetRequired";

export async function checkSupabaseAuthReachable(): Promise<boolean> {
  if (!url || !anonKey) return false;

  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), AUTH_REACHABILITY_TIMEOUT_MS);

  try {
    const response = await fetch(`${url.replace(/\/$/, "")}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: "auth-probe@petnotebook.invalid", password: "auth-probe" }),
      signal: controller.signal,
    });

    return response.status > 0 && response.status < 500;
  } catch {
    return false;
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

export function isSupabaseConfigured() {
  return Boolean(url && anonKey);
}

export function getSupabaseBrowserClient() {
  if (!isSupabaseConfigured()) {
    return null;
  }

  if (!supabaseClient) {
    installSupabaseDevFetchNoiseFilter();
    supabaseClient = createClient(url as string, anonKey as string, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "implicit",
        persistSession: true,
      },
    });
  }

  return supabaseClient;
}

export async function getSupabaseCurrentUser(supabase: SupabaseClient): Promise<User | null> {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    return data.user;
  } catch {
    return null;
  }
}

export async function getSupabaseCurrentSession(supabase: SupabaseClient): Promise<Session | null> {
  if (currentSessionCache && currentSessionCache.expiresAt > Date.now()) {
    return currentSessionCache.session;
  }

  if (currentSessionPromise) return currentSessionPromise;

  currentSessionPromise = (async () => {
    try {
      const { data, error } = await withTimeout(
        supabase.auth.getSession(),
        SESSION_LOOKUP_TIMEOUT_MS,
        { data: { session: null }, error: null },
      );
      const session = error ? null : data.session;
      currentSessionCache = { session, expiresAt: Date.now() + SESSION_CACHE_TTL_MS };
      return session;
    } catch {
      currentSessionCache = { session: null, expiresAt: Date.now() + SESSION_CACHE_TTL_MS };
      return null;
    } finally {
      globalThis.setTimeout(() => {
        currentSessionPromise = null;
      }, 0);
    }
  })();

  return currentSessionPromise;
}

export function cacheSupabaseCurrentSession(session: Session | null) {
  currentSessionPromise = null;
  currentSessionCache = { session, expiresAt: Date.now() + SESSION_CACHE_TTL_MS };
}

export async function refreshSupabaseCurrentSession(supabase: SupabaseClient): Promise<Session | null> {
  currentSessionCache = null;
  currentSessionPromise = null;

  try {
    const { data, error } = await withTimeout(
      supabase.auth.getSession(),
      SESSION_LOOKUP_TIMEOUT_MS,
      { data: { session: null }, error: null },
    );
    const session = error ? null : data.session;
    currentSessionCache = { session, expiresAt: Date.now() + SESSION_CACHE_TTL_MS };
    return session;
  } catch {
    currentSessionCache = { session: null, expiresAt: Date.now() + SESSION_CACHE_TTL_MS };
    return null;
  }
}

export const HEWSTER_PROFILE_SLUG = process.env.NEXT_PUBLIC_HEWSTER_PROFILE_SLUG || "lindy";
