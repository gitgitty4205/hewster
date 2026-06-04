"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth-provider";
import { getSupabaseBrowserClient, getSupabaseEnv, PASSWORD_RESET_REQUIRED_STORAGE_KEY } from "@/lib/supabase";
import { TEXT_LIMITS, clampText } from "@/lib/text-limits";

type AuthMode = "login" | "register";
type ResetStatus = "idle" | "sending" | "sent" | "error";

const AUTH_REQUEST_TIMEOUT_MS = 12_000;
const LOGIN_SERVICE_DOWN_MESSAGE = "The login service did not respond. Please try again in a minute.";
const EMAIL_MAX_LENGTH = 254;
const PASSWORD_MAX_LENGTH = 128;
const PASSWORD_RESET_RESEND_COOLDOWN_SECONDS = 60;

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

function getPasswordResetCooldownSeconds(message: string) {
  const match = message.match(/after\s+(\d+)\s+seconds?/i);
  return match ? Number(match[1]) : 0;
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
  const [resetStatus, setResetStatus] = useState<ResetStatus>("idle");
  const [resetMessage, setResetMessage] = useState("");
  const [resetCooldownSeconds, setResetCooldownSeconds] = useState(0);

  const title = mode === "register" ? "Create Your Pet Notebook Account" : "Welcome Back";
  const subtitle = mode === "register" ? "" : "Sign in to your pet notebook.";

  const redirectTo = useMemo(() => {
    if (typeof window === "undefined") return undefined;
    return `${window.location.origin}/auth/callback`;
  }, []);

  const passwordResetRedirectTo = useMemo(() => {
    if (typeof window === "undefined") return undefined;
    return `${window.location.origin}/auth/callback/reset-password`;
  }, []);

  useEffect(() => {
    if (!loading && user) {
      router.replace("/hewie");
    }
  }, [loading, router, user]);

  useEffect(() => {
    if (resetCooldownSeconds <= 0) return;

    const intervalId = window.setInterval(() => {
      setResetCooldownSeconds((seconds) => {
        const nextSeconds = Math.max(0, seconds - 1);
        if (nextSeconds === 0 && resetStatus === "error") {
          setResetStatus("idle");
          setResetMessage("");
        }
        return nextSeconds;
      });
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [resetCooldownSeconds, resetStatus]);

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
      window.localStorage.removeItem(PASSWORD_RESET_REQUIRED_STORAGE_KEY);
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

    const trimmedFirstName = clampText(firstName.trim(), TEXT_LIMITS.shortName);
    const trimmedLastName = clampText(lastName.trim(), TEXT_LIMITS.shortName);

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
          window.localStorage.removeItem(PASSWORD_RESET_REQUIRED_STORAGE_KEY);
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

      window.localStorage.removeItem(PASSWORD_RESET_REQUIRED_STORAGE_KEY);
      router.replace("/hewie");
    } catch (signInError) {
      setError(getAuthErrorMessage(signInError));
      setAuthServiceDown(isLoginServiceDownError(signInError));
    } finally {
      setBusy(false);
    }
  }

  async function handlePasswordReset() {
    if (resetCooldownSeconds > 0) return;

    setError("");
    setMessage("");
    setResetMessage("");
    setAuthServiceDown(false);

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setResetStatus("error");
      setResetMessage("Enter your email first, then tap Forgot password.");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setResetStatus("error");
      setResetMessage("Supabase is not configured yet.");
      return;
    }

    setResetStatus("sending");
    try {
      await assertAuthServiceReachable();
      const { error: resetError } = await withAuthTimeout(
        supabase.auth.resetPasswordForEmail(trimmedEmail, {
          redirectTo: passwordResetRedirectTo,
        }),
      );

      if (resetError) {
        const resetErrorMessage = getAuthErrorMessage(resetError);
        setResetCooldownSeconds(getPasswordResetCooldownSeconds(resetErrorMessage));
        setResetStatus("error");
        setResetMessage(resetErrorMessage);
        return;
      }

      setResetCooldownSeconds(PASSWORD_RESET_RESEND_COOLDOWN_SECONDS);
      setResetStatus("sent");
      setResetMessage("Password reset email sent. Open the link in your email to choose a new password.");
    } catch (resetError) {
      const resetErrorMessage = getAuthErrorMessage(resetError);
      setResetCooldownSeconds(getPasswordResetCooldownSeconds(resetErrorMessage));
      setResetStatus("error");
      setResetMessage(resetErrorMessage);
      setAuthServiceDown(isLoginServiceDownError(resetError));
    }
  }

  return (
    <main className="min-h-screen bg-[#999b96] px-4 py-8 text-[#3f4540]">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md flex-col justify-center">
        <section className="rounded-[2rem] bg-[#f1f1ed] p-6 shadow-sm ring-1 ring-[#cccec8]/80">
          <div className="mb-6 text-center">
            <span className="mx-auto mb-4 flex size-16 items-center justify-center rounded-[1.35rem] bg-[#686d67] shadow-[0_10px_22px_rgba(15,23,42,0.18)] ring-1 ring-[#3f4540]/10">
              <Image
                src="/paw-notes-transparent.svg"
                alt=""
                width={56}
                height={56}
                className="pointer-events-none h-14 w-14 object-contain drop-shadow-[0_4px_7px_rgba(15,23,42,0.28)]"
                aria-hidden="true"
              />
            </span>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#3f4540]/65">Pet Notebook</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#3f4540]">{title}</h1>
            {subtitle ? <p className="mt-2 text-sm leading-6 text-[#3f4540]/68">{subtitle}</p> : null}
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
            className="h-12 w-full rounded-full border-[#cccec8] bg-white text-[#3f4540] shadow-sm ring-1 ring-[#cccec8]/75 hover:bg-[#f8f8f5]"
          >
            Continue with Google
          </Button>

          <div className="my-5 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-[#3f4540]/55">
            <span className="h-px flex-1 bg-[#cccec8]/80" />
            or
            <span className="h-px flex-1 bg-[#cccec8]/80" />
          </div>

          <form className="space-y-3" onSubmit={handleEmailSubmit}>
            {mode === "register" ? (
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-[#3f4540]/70">
                  First Name
                  <input
                    type="text"
                    value={firstName}
                    onChange={(event) => setFirstName(clampText(event.target.value, TEXT_LIMITS.shortName))}
                    maxLength={TEXT_LIMITS.shortName}
                    placeholder="First"
                    autoComplete="given-name"
                    required
                    className="mt-2 w-full rounded-2xl border-0 bg-white px-4 py-3 text-sm font-medium normal-case tracking-normal text-[#3f4540] ring-1 ring-[#cccec8]/75 placeholder:text-[#3f4540]/40 focus:ring-2 focus:ring-[#686d67]/35"
                  />
                </label>
                <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-[#3f4540]/70">
                  Last Name
                  <input
                    type="text"
                    value={lastName}
                    onChange={(event) => setLastName(clampText(event.target.value, TEXT_LIMITS.shortName))}
                    maxLength={TEXT_LIMITS.shortName}
                    placeholder="Last"
                    autoComplete="family-name"
                    required
                    className="mt-2 w-full rounded-2xl border-0 bg-white px-4 py-3 text-sm font-medium normal-case tracking-normal text-[#3f4540] ring-1 ring-[#cccec8]/75 placeholder:text-[#3f4540]/40 focus:ring-2 focus:ring-[#686d67]/35"
                  />
                </label>
              </div>
            ) : null}

            <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-[#3f4540]/70">
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(clampText(event.target.value, EMAIL_MAX_LENGTH))}
                maxLength={EMAIL_MAX_LENGTH}
                placeholder="name@example.com"
                autoComplete="email"
                required
                className="mt-2 w-full rounded-2xl border-0 bg-white px-4 py-3 text-sm font-medium normal-case tracking-normal text-[#3f4540] ring-1 ring-[#cccec8]/75 placeholder:text-[#3f4540]/40 focus:ring-2 focus:ring-[#686d67]/35"
              />
            </label>

            <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-[#3f4540]/70">
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(clampText(event.target.value, PASSWORD_MAX_LENGTH))}
                placeholder="Password"
                autoComplete={mode === "register" ? "new-password" : "current-password"}
                minLength={6}
                maxLength={PASSWORD_MAX_LENGTH}
                required
                className="mt-2 w-full rounded-2xl border-0 bg-white px-4 py-3 text-sm font-medium normal-case tracking-normal text-[#3f4540] ring-1 ring-[#cccec8]/75 placeholder:text-[#3f4540]/40 focus:ring-2 focus:ring-[#686d67]/35"
              />
            </label>

            {mode === "register" ? (
              <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-[#3f4540]/70">
                Confirm Password
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(clampText(event.target.value, PASSWORD_MAX_LENGTH))}
                  placeholder="Confirm password"
                  autoComplete="new-password"
                  minLength={6}
                  maxLength={PASSWORD_MAX_LENGTH}
                  required
                  className="mt-2 w-full rounded-2xl border-0 bg-white px-4 py-3 text-sm font-medium normal-case tracking-normal text-[#3f4540] ring-1 ring-[#cccec8]/75 placeholder:text-[#3f4540]/40 focus:ring-2 focus:ring-[#686d67]/35"
                />
              </label>
            ) : null}

            {mode === "login" ? (
              <div className="-mt-1 flex justify-end">
                <button
                  type="button"
                  onClick={() => void handlePasswordReset()}
                  disabled={busy || resetStatus === "sending" || resetCooldownSeconds > 0 || !configured}
                  className="text-sm font-semibold text-[#686d67] underline-offset-4 hover:underline disabled:opacity-50"
                >
                  {resetStatus === "sending"
                    ? "Sending..."
                    : resetCooldownSeconds > 0
                      ? `Resend in ${resetCooldownSeconds}s`
                      : resetStatus === "sent"
                        ? "Resend email"
                        : "Forgot password?"}
                </button>
              </div>
            ) : null}

            {error ? <p className="rounded-2xl bg-rose-50 p-3 text-sm text-rose-700 ring-1 ring-rose-100">{error}</p> : null}
            {resetMessage ? (
              <p className={`rounded-2xl p-3 text-sm ring-1 ${resetStatus === "error" ? "bg-rose-50 text-rose-700 ring-rose-100" : "bg-emerald-50 text-emerald-700 ring-emerald-100"}`}>
                {resetCooldownSeconds > 0 && resetStatus === "error"
                  ? `For security purposes, you can request another reset email in ${resetCooldownSeconds} seconds.`
                  : resetMessage}
              </p>
            ) : null}
            {authServiceDown ? (
              <div className="rounded-2xl bg-amber-50 p-3 text-sm leading-6 text-amber-900 ring-1 ring-amber-200">
                <p>Supabase login is not answering right now. You can still open Hewie in local mode while Auth recovers.</p>
                <Button
                  type="button"
                  onClick={() => router.push("/hewie")}
                  className="mt-3 h-10 w-full rounded-full bg-[#3f4540] text-white shadow-sm hover:bg-[#30352f]"
                >
                  Open Hewie&apos;s Notebook
                </Button>
              </div>
            ) : null}
            {message ? <p className="rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-700 ring-1 ring-emerald-100">{message}</p> : null}

            <Button
              type="submit"
              disabled={busy || !configured}
              className="h-12 w-full rounded-full bg-[#686d67] text-white shadow-sm hover:bg-[#575c56]"
            >
              {busy ? "Working..." : mode === "register" ? "Create Account" : "Sign In"}
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-[#3f4540]/68">
            {mode === "register" ? "Already have an account?" : "New here?"}{" "}
            <button
              type="button"
              onClick={() => {
                setMode(mode === "register" ? "login" : "register");
                setError("");
                setMessage("");
                setResetMessage("");
                setResetStatus("idle");
              }}
              className="font-semibold text-[#686d67] underline-offset-4 hover:underline"
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
