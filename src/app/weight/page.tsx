"use client";

import { Scale } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { BottomNav } from "@/components/bottom-nav";
import { Button } from "@/components/ui/button";
import {
  type WeightLog,
  loadAppState,
  loadLocalState,
  persistLocalState,
  saveWeightLogToSupabase,
} from "@/lib/hewster-data";
import { HEWSTER_PROFILE_SLUG, isSupabaseConfigured } from "@/lib/supabase";

function todayInputValue() {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatWeightDate(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00`));
}

export default function WeightPage() {
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([]);
  const [dateValue, setDateValue] = useState(todayInputValue());
  const [weightValue, setWeightValue] = useState("");
  const [noteValue, setNoteValue] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saved" | "saving" | "error">("idle");
  const [hydrated, setHydrated] = useState(false);
  const supabaseReady = isSupabaseConfigured();

  useEffect(() => {
    let cancelled = false;
    const fallbackTimer = window.setTimeout(() => {
      if (!cancelled) {
        setHydrated(true);
      }
    }, 2200);

    async function hydrate() {
      try {
        const state = await loadAppState();
        if (cancelled) return;
        setWeightLogs(state.weightLogs ?? []);
      } finally {
        if (!cancelled) {
          window.clearTimeout(fallbackTimer);
          setHydrated(true);
        }
      }
    }

    hydrate();

    return () => {
      cancelled = true;
      window.clearTimeout(fallbackTimer);
    };
  }, []);

  const sortedLogs = useMemo(
    () => [...weightLogs].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)),
    [weightLogs]
  );

  const saveWeight = async () => {
    if (!dateValue || !weightValue.trim()) return;

    const entry: WeightLog = {
      id: `weight-${Date.now()}`,
      profileSlug: HEWSTER_PROFILE_SLUG,
      date: dateValue,
      weight: weightValue.trim(),
      note: noteValue.trim() || null,
    };

    const nextLogs = [entry, ...weightLogs];
    const localState = loadLocalState();

    setWeightLogs(nextLogs);
    persistLocalState(localState.templates, localState.dailyMealState, localState.activityLogs, nextLogs);
    setSaveState("saving");

    try {
      if (supabaseReady) {
        await saveWeightLogToSupabase(entry);
      }

      setSaveState("saved");
      setWeightValue("");
      setNoteValue("");
      window.setTimeout(() => setSaveState("idle"), 1800);
    } catch {
      setSaveState("error");
    }
  };

  if (!hydrated) {
    return (
      <main className="min-h-screen bg-[#979ca7] text-zinc-900">
        <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-24 pt-6">
          <header className="mb-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Link href="/hewie" className="text-sm font-bold text-violet-500">
                  Hewster&apos;s Notebook
                </Link>
                <div className="skeleton-pulse mt-1 h-10 w-32 rounded-xl bg-white/40" />
              </div>
              <Image
                src="/hewster-profile.jpg"
                alt="Hewster"
                width={48}
                height={48}
                className="mt-0.5 size-12 rounded-full object-cover object-center ring-1 ring-zinc-500/60 shadow-sm"
              />
            </div>
          </header>

          <div className="space-y-4">
            <div className="skeleton-pulse h-72 rounded-3xl bg-white/60 shadow-sm ring-1 ring-white/50" />
            <div className="skeleton-pulse h-48 rounded-3xl bg-white/60 shadow-sm ring-1 ring-white/50" />
          </div>

          <BottomNav />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#979ca7] text-zinc-900">
      <div className="content-fade-in mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-24 pt-6">
        <header className="mb-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Link href="/hewie" className="text-sm font-bold text-violet-500">
                Hewster&apos;s Notebook
              </Link>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight">Weight</h1>
            </div>
            <Image
              src="/hewster-profile.jpg"
              alt="Hewster"
              width={48}
              height={48}
              className="mt-0.5 size-12 rounded-full object-cover object-center ring-1 ring-zinc-500/60 shadow-sm"
            />
          </div>
        </header>

        <section className="mb-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Add Weight</h2>
            </div>
            <div className="text-right text-xs text-zinc-500">
              {saveState === "saving"
                ? "Saving..."
                : saveState === "saved"
                  ? "Saved"
                  : saveState === "error"
                    ? "Saved in browser only"
                    : ""}
            </div>
          </div>

          <div className="space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-zinc-700">Date</span>
              <input
                type="date"
                value={dateValue}
                onChange={(event) => setDateValue(event.target.value)}
                className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-rose-300 focus:ring-4 focus:ring-rose-100"
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block font-medium text-zinc-700">Weight</span>
              <input
                inputMode="decimal"
                value={weightValue}
                onChange={(event) => setWeightValue(event.target.value)}
                placeholder="e.g. 24.8 lb"
                className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-rose-300 focus:ring-4 focus:ring-rose-100"
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block font-medium text-zinc-700">Note</span>
              <textarea
                value={noteValue}
                onChange={(event) => setNoteValue(event.target.value)}
                rows={3}
                placeholder="Optional note"
                className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-rose-300 focus:ring-4 focus:ring-rose-100"
              />
            </label>

            <Button onClick={saveWeight} className="rounded-full bg-zinc-300 text-zinc-800 hover:bg-zinc-400">
              Save Weight
            </Button>
          </div>
        </section>

        <section className="mb-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
          <div className="mb-4 flex items-center gap-2">
            <Scale className="size-4 text-violet-500" />
            <h2 className="text-lg font-semibold">Weight History</h2>
          </div>

          <div className="space-y-3">
            {sortedLogs.length ? (
              sortedLogs.map((entry) => (
                <article key={entry.id} className="rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-zinc-900">{formatWeightDate(entry.date)}</p>
                    <p className="text-sm font-semibold text-zinc-800">{entry.weight}</p>
                  </div>
                  {entry.note ? <p className="mt-2 text-sm text-zinc-600">{entry.note}</p> : null}
                </article>
              ))
            ) : (
              <p className="text-sm text-zinc-500">No weight entries yet.</p>
            )}
          </div>
        </section>

        <BottomNav />
      </div>
    </main>
  );
}
