"use client";

import { AlertCircle, LogIn } from "lucide-react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

export function LoginForm() {
  const searchParams = useSearchParams();
  const [isWorking, setIsWorking] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);

  const configured = isSupabaseConfigured();
  const nextParam = searchParams.get("next");
  const error = clientError || searchParams.get("error");

  async function handleGoogleLogin() {
    setClientError(null);

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setClientError("Supabase is not configured for this deployment.");
      return;
    }

    setIsWorking(true);
    const nextPath = nextParam?.startsWith("/") ? nextParam : "/hewie";
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
      },
    });

    if (signInError) {
      setClientError(signInError.message);
      setIsWorking(false);
    }
  }

  return (
    <main className="min-h-dvh bg-[#f8f4ef] text-zinc-950">
      <section className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10">
        <div className="mb-8 flex items-center gap-3">
          <span className="flex size-12 items-center justify-center rounded-xl bg-zinc-950 shadow-sm">
            <Image
              src="/paw-notes-transparent.svg"
              alt=""
              width={40}
              height={40}
              className="pointer-events-none size-10 object-contain"
              aria-hidden="true"
            />
          </span>
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-zinc-500">PetNoteBook</p>
            <h1 className="text-3xl font-semibold tracking-normal">Sign in</h1>
          </div>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">Continue to PetNoteBook</h2>
            <p className="text-sm leading-6 text-zinc-600">
              Use the Google account that has access to this pet profile.
            </p>
          </div>

          {error ? (
            <div className="mt-5 flex gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <p>{error}</p>
            </div>
          ) : null}

          {!configured ? (
            <div className="mt-5 flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <p>Supabase environment variables are missing on this server.</p>
            </div>
          ) : null}

          <Button
            className="mt-6 h-11 w-full gap-2"
            disabled={!configured || isWorking}
            onClick={handleGoogleLogin}
            size="lg"
            type="button"
          >
            <LogIn className="size-4" aria-hidden="true" />
            {isWorking ? "Working..." : "Continue with Google"}
          </Button>
        </div>
      </section>
    </main>
  );
}
