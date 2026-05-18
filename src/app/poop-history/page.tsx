"use client";

import { useEffect, useMemo, useState } from "react";

import { BottomNav } from "@/components/bottom-nav";
import { PetNotebookTitle } from "@/components/pet-notebook-title";
import { PottyDetailBadges } from "@/components/potty-detail-badges";
import {
  type ActivityLog,
  loadAppState,
} from "@/lib/hewster-data";
import { formatActivityTime } from "@/lib/activity";

function formatDayLabel(isoString: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(isoString));
}

function isActualPoopRecord(activity: ActivityLog) {
  const detail = activity.detail?.trim() ?? "";
  if (detail === "Pee") return false;
  if (detail === "No Poop") return activity.activityType === "poop" || activity.activityType === "potty";
  if (activity.activityType !== "poop") return false;
  return detail === "Poop" || detail === "Pee & Poop" || detail.includes("• Type ") || detail.startsWith("Type ");
}

export default function PoopHistoryPage() {
  const [poopLogs, setPoopLogs] = useState<ActivityLog[]>([]);

  useEffect(() => {
    async function hydrate() {
      const state = await loadAppState();
      setPoopLogs(
        state.activityLogs
          .filter(isActualPoopRecord)
          .sort((a, b) => b.happenedAt.localeCompare(a.happenedAt))
      );
    }

    hydrate();
  }, []);

  const groupedLogs = useMemo(() => {
    return poopLogs.reduce<Record<string, ActivityLog[]>>((groups, log) => {
      const day = new Intl.DateTimeFormat("en-CA", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(log.happenedAt));

      if (!groups[day]) {
        groups[day] = [];
      }

      groups[day].push(log);
      return groups;
    }, {});
  }, [poopLogs]);

  const dayEntries = Object.entries(groupedLogs).sort((a, b) => b[0].localeCompare(a[0]));

  return (
    <main className="min-h-screen bg-[var(--hewie-bg,#979ca7)] text-zinc-900">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-24 pt-6">
        <header className="mb-6">
          <p className="text-sm font-medium text-[var(--hewie-active-text,#6d28d9)]"><PetNotebookTitle /></p>
          <h1 className="mt-1 text-xl font-bold tracking-tight text-zinc-700">Poop History</h1>
        </header>

        <div className="space-y-4">
          {dayEntries.length ? (
            dayEntries.map(([day, logs]) => (
              <section key={day} className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
                <h2 className="mb-3 text-sm font-semibold text-zinc-700">{formatDayLabel(`${day}T00:00:00`)}</h2>
                <div className="space-y-3">
                  {logs.map((log) => (
                    <article key={log.id} className="rounded-2xl border border-orange-200 bg-orange-50/60 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="flex size-9 items-center justify-center rounded-full bg-[rgba(255,255,255,0.55)] text-[#8a6200] ring-1 ring-[rgba(240,210,122,0.6)]">
                            <span className="text-lg leading-none">{"\u{1F6BD}"}</span>
                          </span>
                          <p className="font-medium text-zinc-900">Potty</p>
                        </div>
                        <p className="whitespace-nowrap text-sm text-zinc-500">{formatActivityTime(log.happenedAt)}</p>
                      </div>
                      <PottyDetailBadges detail={log.detail} notes={log.notes} />
                    </article>
                  ))}
                </div>
              </section>
            ))
          ) : (
            <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
              <p className="text-sm text-zinc-500">No Poop Records Logged Yet.</p>
            </section>
          )}
        </div>

        <BottomNav />
      </div>
    </main>
  );
}
