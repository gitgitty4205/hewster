"use client";

import type { Session, User } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

import {
  cacheSupabaseCurrentSession,
  getSupabaseBrowserClient,
  getSupabaseCurrentSession,
  PASSWORD_RESET_REQUIRED_STORAGE_KEY,
  isSupabaseConfigured,
} from "@/lib/supabase";

type AuthContextValue = {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const AUTH_BOOT_TIMEOUT_MS = 9_000;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const configured = isSupabaseConfigured();
  const supabase = getSupabaseBrowserClient();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));

  useEffect(() => {
    if (!supabase) return;

    let active = true;
    const bootTimeoutId = window.setTimeout(() => {
      if (!active) return;
      cacheSupabaseCurrentSession(null);
      setSession(null);
      setLoading(false);
    }, AUTH_BOOT_TIMEOUT_MS);

    getSupabaseCurrentSession(supabase).then((nextSession) => {
      if (!active) return;
      window.clearTimeout(bootTimeoutId);
      cacheSupabaseCurrentSession(nextSession);
      setSession(nextSession);
      setLoading(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      window.clearTimeout(bootTimeoutId);
      cacheSupabaseCurrentSession(nextSession);
      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      active = false;
      window.clearTimeout(bootTimeoutId);
      authListener.subscription.unsubscribe();
    };
  }, [supabase]);

  const value = useMemo<AuthContextValue>(() => ({
    configured,
    loading,
    session,
    user: session?.user ?? null,
    signOut: async () => {
      if (!supabase) return;
      await supabase.auth.signOut();
      window.localStorage.removeItem(PASSWORD_RESET_REQUIRED_STORAGE_KEY);
      setSession(null);
    },
  }), [configured, loading, session, supabase]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return value;
}
