"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { cacheSupabaseCurrentSession, getSupabaseBrowserClient, PASSWORD_RESET_REQUIRED_STORAGE_KEY } from "@/lib/supabase";

const AUTH_CALLBACK_TIMEOUT_MS = 12_000;
const PASSWORD_RESET_PATH = "/hewie/account-settings?resetPassword=1";

function getHashParams() {
  if (typeof window === "undefined") return new URLSearchParams();
  return new URLSearchParams(window.location.hash.replace(/^#/, ""));
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "This sign-in link could not be opened. Please request a fresh link.";
}

function withAuthCallbackTimeout<T>(request: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error("The sign-in link took too long to open. Please request a fresh link and try again."));
    }, AUTH_CALLBACK_TIMEOUT_MS);

    request.then(
      (value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

export function AuthCallbackContent({ forcePasswordRecovery = false }: { forcePasswordRecovery?: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { loading, user } = useAuth();
  const [callbackError, setCallbackError] = useState("");
  const isPasswordRecovery = useMemo(() => {
    if (forcePasswordRecovery || searchParams.get("resetPassword") === "1") return true;

    const queryType = searchParams.get("type");
    if (queryType === "recovery") return true;

    const hash = getHashParams();
    return hash.get("type") === "recovery" || hash.get("resetPassword") === "1";
  }, [forcePasswordRecovery, searchParams]);
  const nextPath = useMemo(() => {
    if (isPasswordRecovery) return PASSWORD_RESET_PATH;
    const next = searchParams.get("next");
    return next?.startsWith("/") ? next : "/hewie";
  }, [isPasswordRecovery, searchParams]);
  const error = useMemo(() => {
    const queryError = searchParams.get("error_description") ?? searchParams.get("error");
    if (queryError) return queryError;
    const hash = getHashParams();
    return hash.get("error_description") ?? hash.get("error") ?? "";
  }, [searchParams]);
  const displayedError = error || callbackError;

  useEffect(() => {
    let active = true;

    async function finishAuthCallback() {
      if (error) return;

      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setCallbackError("Login is not configured yet.");
        return;
      }

      try {
        const code = searchParams.get("code");
        if (code) {
          const { data, error: exchangeError } = await withAuthCallbackTimeout(supabase.auth.exchangeCodeForSession(code));
          if (exchangeError) throw exchangeError;
          if (!active) return;
          cacheSupabaseCurrentSession(data.session);
          if (isPasswordRecovery) window.localStorage.setItem(PASSWORD_RESET_REQUIRED_STORAGE_KEY, "1");
          router.replace(nextPath);
          return;
        }

        const hash = getHashParams();
        const accessToken = hash.get("access_token");
        const refreshToken = hash.get("refresh_token");
        if (accessToken && refreshToken) {
          const { data, error: sessionError } = await withAuthCallbackTimeout(
            supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            }),
          );
          if (sessionError) throw sessionError;
          if (!active) return;
          cacheSupabaseCurrentSession(data.session);
          if (isPasswordRecovery) window.localStorage.setItem(PASSWORD_RESET_REQUIRED_STORAGE_KEY, "1");
          router.replace(nextPath);
          return;
        }

        const { data, error: sessionError } = await withAuthCallbackTimeout(supabase.auth.getSession());
        if (sessionError) throw sessionError;
        if (!active) return;

        if (data.session) {
          cacheSupabaseCurrentSession(data.session);
          if (isPasswordRecovery) window.localStorage.setItem(PASSWORD_RESET_REQUIRED_STORAGE_KEY, "1");
          router.replace(nextPath);
          return;
        }

        if (!loading && user) {
          if (isPasswordRecovery) window.localStorage.setItem(PASSWORD_RESET_REQUIRED_STORAGE_KEY, "1");
          router.replace(nextPath);
          return;
        }

        if (!loading) {
          setCallbackError("This link did not include a valid sign-in token. Please request a fresh link.");
        }
      } catch (authError) {
        if (!active) return;
        setCallbackError(getErrorMessage(authError));
      }
    }

    void finishAuthCallback();

    return () => {
      active = false;
    };
  }, [error, isPasswordRecovery, loading, nextPath, router, searchParams, user]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--hewie-bg,#999b96)] px-4 text-zinc-900">
      <section className="w-full max-w-sm rounded-[2rem] bg-white p-6 text-center shadow-sm ring-1 ring-zinc-200">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-zinc-400">PetNoteBook</p>
        <h1 className="mt-2 text-xl font-bold text-zinc-800">
          {displayedError ? "Sign-in needs attention" : isPasswordRecovery ? "Opening password reset..." : "Signing you in..."}
        </h1>
        <p className="mt-2 text-sm leading-6 text-zinc-500">
          {displayedError || (isPasswordRecovery ? "Hang tight while we open the password form." : "Hang tight while we finish connecting your account.")}
        </p>
      </section>
    </main>
  );
}
