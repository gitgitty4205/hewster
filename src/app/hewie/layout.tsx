"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { PetNotebookTitle } from "@/components/pet-notebook-title";
import { checkSupabaseAuthReachable, PASSWORD_RESET_REQUIRED_STORAGE_KEY } from "@/lib/supabase";

const HEWIE_AUTH_GATE_TIMEOUT_MS = 5_000;
const PASSWORD_RESET_PATH = "/hewie/account-settings?resetPassword=1";

export default function HewieLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { configured, loading, user } = useAuth();
  const [authGateTimedOut, setAuthGateTimedOut] = useState(false);
  const [authReachable, setAuthReachable] = useState<boolean | null>(null);
  const [browserHostname, setBrowserHostname] = useState<string | null>(null);
  const [passwordResetRequired, setPasswordResetRequired] = useState(false);
  const shouldBypassAuthGate =
    process.env.NODE_ENV === "development" &&
    browserHostname !== null &&
    ["localhost", "127.0.0.1", "::1"].includes(browserHostname);
  const shouldProbeAuth = !shouldBypassAuthGate && configured && !user && (!loading || authGateTimedOut);
  const shouldRequireLogin = shouldProbeAuth && authReachable === true;
  const shouldUseLocalMode = shouldProbeAuth && authReachable === false;
  const shouldShowAuthGate = !shouldBypassAuthGate && configured && !shouldUseLocalMode && !shouldRequireLogin && (loading || !user);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setBrowserHostname(window.location.hostname), 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    const refreshPasswordResetRequired = () => {
      setPasswordResetRequired(window.localStorage.getItem(PASSWORD_RESET_REQUIRED_STORAGE_KEY) === "1");
    };

    refreshPasswordResetRequired();
    window.addEventListener("focus", refreshPasswordResetRequired);
    window.addEventListener("storage", refreshPasswordResetRequired);
    return () => {
      window.removeEventListener("focus", refreshPasswordResetRequired);
      window.removeEventListener("storage", refreshPasswordResetRequired);
    };
  }, []);

  useEffect(() => {
    if (passwordResetRequired && pathname !== "/hewie/account-settings") {
      router.replace(PASSWORD_RESET_PATH);
    }
  }, [passwordResetRequired, pathname, router]);

  useEffect(() => {
    if (shouldBypassAuthGate || !configured || user) {
      return;
    }

    const timeoutId = window.setTimeout(() => setAuthGateTimedOut(true), HEWIE_AUTH_GATE_TIMEOUT_MS);
    return () => window.clearTimeout(timeoutId);
  }, [configured, shouldBypassAuthGate, user]);

  useEffect(() => {
    if (!shouldProbeAuth || authReachable !== null) return;

    let active = true;
    checkSupabaseAuthReachable().then((reachable) => {
      if (active) setAuthReachable(reachable);
    });

    return () => {
      active = false;
    };
  }, [authReachable, shouldProbeAuth]);

  useEffect(() => {
    if (shouldRequireLogin) {
      router.replace("/login");
    }
  }, [router, shouldRequireLogin]);

  if (shouldShowAuthGate) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--hewie-bg,#999b96)] px-4 text-zinc-900">
        <section className="w-full max-w-sm rounded-[2rem] bg-white p-6 text-center shadow-sm ring-1 ring-zinc-200">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-zinc-400">Pet Notebook</p>
          <h1 className="mt-2 text-xl font-bold text-zinc-800">
            Opening <PetNotebookTitle />...
          </h1>
          <p className="mt-2 text-sm leading-6 text-zinc-500">Getting the notebook ready.</p>
        </section>
      </main>
    );
  }

  if (passwordResetRequired && pathname !== "/hewie/account-settings") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--hewie-bg,#999b96)] px-4 text-zinc-900">
        <section className="w-full max-w-sm rounded-[2rem] bg-white p-6 text-center shadow-sm ring-1 ring-zinc-200">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-zinc-400">Pet Notebook</p>
          <h1 className="mt-2 text-xl font-bold text-zinc-800">Finish password reset</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-500">Choose a new password before opening the notebook.</p>
        </section>
      </main>
    );
  }

  if (shouldUseLocalMode) {
    return (
      <>
        <div className="sticky top-0 z-[70] bg-amber-50 px-4 py-2 text-center text-xs font-semibold leading-5 text-amber-800 shadow-sm ring-1 ring-amber-200">
          Supabase login is down right now. Hewie is open in local mode on this device until Google sign-in answers again.
        </div>
        {children}
      </>
    );
  }

  return children;
}
