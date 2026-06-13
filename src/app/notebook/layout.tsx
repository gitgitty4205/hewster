"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { CenteredLoadingIcon } from "@/components/centered-loading-icon";
import { NotebookAccessRevokedError, resolveActiveNotebookAccess } from "@/lib/notebook-access";
import { checkSupabaseAuthReachable, getActiveProfileSlug, HEWSTER_PROFILE_SLUG, PASSWORD_RESET_REQUIRED_STORAGE_KEY, setActiveProfileSlug, UNSCOPED_PROFILE_SLUG } from "@/lib/supabase";
import { getSupabaseBrowserClient } from "@/lib/supabase";

const NOTEBOOK_AUTH_GATE_TIMEOUT_MS = 5_000;
const PASSWORD_RESET_PATH = "/notebook/account-settings?resetPassword=1";

export default function NotebookLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { configured, loading, user, signOut } = useAuth();
  const [authGateTimedOut, setAuthGateTimedOut] = useState(false);
  const [authReachable, setAuthReachable] = useState<boolean | null>(null);
  const [browserHostname, setBrowserHostname] = useState<string | null>(null);
  const [passwordResetRequired, setPasswordResetRequired] = useState(false);
  const [profileSlugReady, setProfileSlugReady] = useState(false);
  const shouldBypassAuthGate =
    process.env.NODE_ENV === "development" &&
    browserHostname !== null &&
    ["localhost", "127.0.0.1", "::1"].includes(browserHostname);
  const shouldProbeAuth = !shouldBypassAuthGate && configured && !user && (!loading || authGateTimedOut);
  const shouldRequireLogin = shouldProbeAuth && authReachable === true;
  const shouldUseLocalMode = shouldProbeAuth && authReachable === false;
  const shouldShowAuthGate = !shouldBypassAuthGate && configured && !shouldUseLocalMode && !shouldRequireLogin && (loading || !user);
  const shouldShowProfileSlugGate = !shouldShowAuthGate && configured && !loading && Boolean(user) && !profileSlugReady;

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
    if (passwordResetRequired && pathname !== "/notebook/account-settings") {
      router.replace(PASSWORD_RESET_PATH);
    }
  }, [passwordResetRequired, pathname, router]);

  useEffect(() => {
    if (shouldBypassAuthGate || !configured || user) {
      return;
    }

    const timeoutId = window.setTimeout(() => setAuthGateTimedOut(true), NOTEBOOK_AUTH_GATE_TIMEOUT_MS);
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

  useEffect(() => {
    if (!configured || loading || !user) {
      setProfileSlugReady(true);
      return;
    }

    if (getActiveProfileSlug() !== UNSCOPED_PROFILE_SLUG) {
      setProfileSlugReady(true);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setProfileSlugReady(true);
      return;
    }

    let active = true;
    setProfileSlugReady(false);

    void Promise.resolve().then(async () => {
      const access = await resolveActiveNotebookAccess(supabase, user);
      const { data } = await supabase
        .from("pet_profiles")
        .select("profile_slug")
        .eq("owner_id", access.notebookOwnerId)
        .eq("profile_slug", HEWSTER_PROFILE_SLUG)
        .maybeSingle();

      if (active && data) setActiveProfileSlug(HEWSTER_PROFILE_SLUG);
    }).catch(() => undefined).finally(() => {
      if (active) setProfileSlugReady(true);
    });

    return () => {
      active = false;
    };
  }, [configured, loading, user]);

  useEffect(() => {
    if (!configured || loading || !user) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    let active = true;
    let checking = false;

    const checkActiveNotebookAccess = async () => {
      if (checking) return;
      checking = true;

      try {
        await resolveActiveNotebookAccess(supabase, user, { forceRefresh: true });
      } catch (error) {
        if (active && error instanceof NotebookAccessRevokedError) {
          await signOut();
          router.replace("/login");
        }
      } finally {
        checking = false;
      }
    };

    void checkActiveNotebookAccess();
    window.addEventListener("focus", checkActiveNotebookAccess);
    window.addEventListener("petnotebook-active-notebook-updated", checkActiveNotebookAccess);

    return () => {
      active = false;
      window.removeEventListener("focus", checkActiveNotebookAccess);
      window.removeEventListener("petnotebook-active-notebook-updated", checkActiveNotebookAccess);
    };
  }, [configured, loading, router, signOut, user]);

  if (shouldShowAuthGate) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--hewie-bg,#999b96)] px-4 text-zinc-900">
        <CenteredLoadingIcon className="min-h-32" />
      </main>
    );
  }

  if (shouldShowProfileSlugGate) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--hewie-bg,#999b96)] px-4 text-zinc-900">
        <CenteredLoadingIcon className="min-h-32" />
      </main>
    );
  }

  if (passwordResetRequired && pathname !== "/notebook/account-settings") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--hewie-bg,#999b96)] px-4 text-zinc-900">
        <section className="w-full max-w-sm rounded-[2rem] bg-white p-6 text-center shadow-sm ring-1 ring-zinc-200">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-zinc-400">PetNoteBook</p>
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
          Supabase login is down right now. PetNoteBook is open in local mode on this device until Google sign-in answers again.
        </div>
        {children}
      </>
    );
  }

  return children;
}
