"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { PawPrint } from "lucide-react";
import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth-provider";
import { getSupabaseBrowserClient, getSupabaseEnv } from "@/lib/supabase";

type AuthMode = "login" | "register";

const AUTH_REQUEST_TIMEOUT_MS = 12_000;
const LOGIN_SERVICE_DOWN_MESSAGE = "The login service did not respond. Please try again in a minute.";

function withAuthTimeout<T>(request: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error(LOGIN_SERVICE_DOWN_MESSAGE));
    }, AUTH_REQUEST_TIMEOUT_MS);

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

function getAuthErrorMessage(error: unknown) {
  if (error instanceof Error) {
    if (error.message === "Failed to fetch" || error.name === "AuthRetryableFetchError") {
      return "The login service could not be reached. This usually means the auth server did not answer, not that your password is wrong.";
    }

    return error.message;
  }

  return "Sign-in failed. Please try again.";
}

function isLoginServiceDownError(error: unknown) {
  if (!(error instanceof Error)) return false;

  return (
    error.message === LOGIN_SERVICE_DOWN_MESSAGE ||
    error.message === "Failed to fetch" ||
    error.name === "AuthRetryableFetchError"
  );
}

async function assertAuthServiceReachable() {
  const { url, anonKey } = getSupabaseEnv();
  if (!url || !anonKey) return;

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), AUTH_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: "auth-preflight@petnotebook.invalid", password: "auth-preflight" }),
      signal: controller.signal,
    });

    if (response.status >= 500 || response.status === 0) {
      throw new Error(LOGIN_SERVICE_DOWN_MESSAGE);
    }
  } catch {
    throw new Error(LOGIN_SERVICE_DOWN_MESSAGE);
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { configured, loading, user } = useAuth();
  const [mode, setMode] = useState<AuthMode>(searchParams.get("mode") === "register" ? "register" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [authServiceDown, setAuthServiceDown] = useState(false);

  const title = mode === "register" ? "Create Your Pet Notebook Account" : "Welcome Back";
  const subtitle = mode === "register" ? "" : "Sign in to get back to your pet notebook.";

  const redirectTo = useMemo(() => {
    if (typeof window === "undefined") return undefined;
    return `${window.location.origin}/auth/callback`;
  }, []);

  useEffect(() => {
    if (!loading && user) {
      router.replace("/hewie");
    }
  }, [loading, router, user]);

  async function handleGoogleSignIn() {
    setError("");
    setMessage("");
    setAuthServiceDown(false);
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError("Supabase is not configured yet. Add the public URL and anon key first.");
      return;
    }

    setBusy(true);
    try {
      await assertAuthServiceReachable();
      const { error: googleError } = await withAuthTimeout(
        supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo },
        }),
      );
      if (googleError) {
        setError(getAuthErrorMessage(googleError));
        setBusy(false);
      }
    } catch (googleError) {
      setError(getAuthErrorMessage(googleError));
      setAuthServiceDown(isLoginServiceDownError(googleError));
      setBusy(false);
    }
  }

  async function handleEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setAuthServiceDown(false);

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError("Supabase is not configured yet. Add the public URL and anon key first.");
      return;
    }

    if (mode === "register" && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    const trimmedFirstName = firstName.trim();
    const trimmedLastName = lastName.trim();

    if (mode === "register" && (!trimmedFirstName || !trimmedLastName)) {
      setError("Enter your first and last name.");
      return;
    }

    setBusy(true);

    if (mode === "register") {
      const fullName = `${trimmedFirstName} ${trimmedLastName}`;
      try {
        const { data, error: signUpError } = await withAuthTimeout(
          supabase.auth.signUp({
            email,
            password,
            options: {
              data: { first_name: trimmedFirstName, last_name: trimmedLastName, full_name: fullName },
              emailRedirectTo: redirectTo,
            },
          }),
        );

        if (signUpError) {
          setError(getAuthErrorMessage(signUpError));
          return;
        }

        if (data.session) {
          router.replace("/hewie");
          return;
        }

        setMessage("Account created. Check your email to confirm your login.");
      } catch (signUpError) {
        setError(getAuthErrorMessage(signUpError));
      } finally {
        setBusy(false);
      }
      return;
    }

    try {
      const { error: signInError } = await withAuthTimeout(supabase.auth.signInWithPassword({ email, password }));

      if (signInError) {
        setError(getAuthErrorMessage(signInError));
        setAuthServiceDown(isLoginServiceDownError(signInError));
        return;
      }

      router.replace("/hewie");
    } catch (signInError) {
      setError(getAuthErrorMessage(signInError));
      setAuthServiceDown(isLoginServiceDownError(signInError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#e8ece4] px-4 py-8 text-[#4f2f1b]">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md flex-col justify-center">
        <section className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-[#d8b895]/55">
          <div className="mb-6 text-center">
            <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-[#f4eadf] text-[#8a5a35] ring-1 ring-[#d8b895]/65">
              <PawPrint className="size-7" />
            </span>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#8a5a35]/65">Pet Notebook</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#4f2f1b]">{title}</h1>
            {subtitle ? <p className="mt-2 text-sm leading-6 text-[#6b3f22]/68">{subtitle}</p> : null}
          </div>

          {!configured ? (
            <div className="mb-4 rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-800 ring-1 ring-amber-200">
              Auth needs Supabase env values before sign-in will work. Fill in <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>.
            </div>
          ) : null}

          <Button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={busy || !configured}
            className="h-12 w-full rounded-full border-[#d8b895] bg-white text-[#5f3a22] shadow-sm ring-1 ring-[#d8b895]/65 hover:bg-[#f8f2ec]"
          >
            Continue with Google
          </Button>

          <div className="my-5 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-[#8a5a35]/55">
            <span className="h-px flex-1 bg-[#d8b895]/60" />
            or
            <span className="h-px flex-1 bg-[#d8b895]/60" />
          </div>

          <form className="space-y-3" onSubmit={handleEmailSubmit}>
            {mode === "register" ? (
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-[#7a5636]/70">
                  First Name
                  <input
                    type="text"
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    placeholder="First"
                    autoComplete="given-name"
                    required
                    className="mt-2 w-full rounded-2xl border-0 bg-[#fbf8f5] px-4 py-3 text-sm font-medium normal-case tracking-normal text-[#4f2f1b] ring-1 ring-[#d8b895]/55 placeholder:text-[#7a5636]/40 focus:ring-2 focus:ring-[#8a5a35]/35"
                  />
                </label>
                <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-[#7a5636]/70">
                  Last Name
                  <input
                    type="text"
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                    placeholder="Last"
                    autoComplete="family-name"
                    required
                    className="mt-2 w-full rounded-2xl border-0 bg-[#fbf8f5] px-4 py-3 text-sm font-medium normal-case tracking-normal text-[#4f2f1b] ring-1 ring-[#d8b895]/55 placeholder:text-[#7a5636]/40 focus:ring-2 focus:ring-[#8a5a35]/35"
                  />
                </label>
              </div>
            ) : null}

            <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-[#7a5636]/70">
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@example.com"
                autoComplete="email"
                required
                className="mt-2 w-full rounded-2xl border-0 bg-[#fbf8f5] px-4 py-3 text-sm font-medium normal-case tracking-normal text-[#4f2f1b] ring-1 ring-[#d8b895]/55 placeholder:text-[#7a5636]/40 focus:ring-2 focus:ring-[#8a5a35]/35"
              />
            </label>

            <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-[#7a5636]/70">
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Password"
                autoComplete={mode === "register" ? "new-password" : "current-password"}
                minLength={6}
                required
                className="mt-2 w-full rounded-2xl border-0 bg-[#fbf8f5] px-4 py-3 text-sm font-medium normal-case tracking-normal text-[#4f2f1b] ring-1 ring-[#d8b895]/55 placeholder:text-[#7a5636]/40 focus:ring-2 focus:ring-[#8a5a35]/35"
              />
            </label>

            {mode === "register" ? (
              <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-[#7a5636]/70">
                Confirm Password
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Confirm password"
                  autoComplete="new-password"
                  minLength={6}
                  required
                  className="mt-2 w-full rounded-2xl border-0 bg-[#fbf8f5] px-4 py-3 text-sm font-medium normal-case tracking-normal text-[#4f2f1b] ring-1 ring-[#d8b895]/55 placeholder:text-[#7a5636]/40 focus:ring-2 focus:ring-[#8a5a35]/35"
                />
              </label>
            ) : null}

            {error ? <p className="rounded-2xl bg-rose-50 p-3 text-sm text-rose-700 ring-1 ring-rose-100">{error}</p> : null}
            {authServiceDown ? (
              <div className="rounded-2xl bg-amber-50 p-3 text-sm leading-6 text-amber-900 ring-1 ring-amber-200">
                <p>Supabase login is not answering right now. You can still open Hewie in local mode while Auth recovers.</p>
                <Button
                  type="button"
                  onClick={() => router.push("/hewie")}
                  className="mt-3 h-10 w-full rounded-full bg-[#4f2f1b] text-white shadow-sm hover:bg-[#3f2515]"
                >
                  Open Hewie&apos;s Notebook
                </Button>
              </div>
            ) : null}
            {message ? <p className="rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-700 ring-1 ring-emerald-100">{message}</p> : null}

            <Button
              type="submit"
              disabled={busy || !configured}
              className="h-12 w-full rounded-full bg-[#8a5a35] text-white shadow-sm hover:bg-[#764a2b]"
            >
              {busy ? "Working..." : mode === "register" ? "Create Account" : "Sign In"}
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-[#6b3f22]/68">
            {mode === "register" ? "Already have an account?" : "New here?"}{" "}
            <button
              type="button"
              onClick={() => {
                setMode(mode === "register" ? "login" : "register");
                setError("");
                setMessage("");
              }}
              className="font-semibold text-[#8a5a35] underline-offset-4 hover:underline"
            >
              {mode === "register" ? "Sign in" : "Create one"}
            </button>
          </p>
        </section>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[var(--hewie-bg,#999b96)]" />}>
      <LoginPageContent />
    </Suspense>
  );
}
