"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo } from "react";

import { useAuth } from "@/components/auth-provider";

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { loading, user } = useAuth();
  const error = useMemo(() => {
    const queryError = searchParams.get("error_description") ?? searchParams.get("error");
    if (queryError) return queryError;
    if (typeof window === "undefined") return "";
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    return hash.get("error_description") ?? hash.get("error") ?? "";
  }, [searchParams]);

  useEffect(() => {
    if (!loading && user) {
      router.replace("/hewie");
    }
  }, [loading, router, user]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--hewie-bg,#999b96)] px-4 text-zinc-900">
      <section className="w-full max-w-sm rounded-[2rem] bg-white p-6 text-center shadow-sm ring-1 ring-zinc-200">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-zinc-400">Pet Notebook</p>
        <h1 className="mt-2 text-xl font-bold text-zinc-800">{error ? "Sign-in needs attention" : "Signing you in..."}</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-500">
          {error || "Hang tight while we finish connecting your account."}
        </p>
      </section>
    </main>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[var(--hewie-bg,#999b96)]" />}>
      <AuthCallbackContent />
    </Suspense>
  );
}
