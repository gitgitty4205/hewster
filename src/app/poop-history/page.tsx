"use client";

import { useEffect, useMemo, useState } from "react";

import { BottomNav } from "@/components/bottom-nav";
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

function poopBadgeClasses(detail: string | null) {
  const normalized = detail?.trim().toLowerCase() ?? "";

  switch (normalized) {
    case "no poop":
      return "bg-white text-zinc-600 ring-1 ring-zinc-300";
    case "constipated":
      return "bg-zinc-700 text-white";
    case "normal-hard":
    case "normal-soft":
      return "bg-orange-800 text-white";
    case "soft":
      return "bg-orange-500 text-white";
    case "1 time diarrhea":
      return "bg-rose-500 text-white";
    case "severe diarrhea":
      return "bg-rose-700 text-white";
    default:
      return "bg-orange-800 text-white";
  }
}

export default function PoopHistoryPage() {
  const [poopLogs, setPoopLogs] = useState<ActivityLog[]>([]);

  useEffect(() => {
    async function hydrate() {
      const state = await loadAppState();
      setPoopLogs(
        state.activityLogs
          .filter((activity) => activity.activityType === "poop")
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
    <main className="min-h-screen bg-[#979ca7] text-zinc-900">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-24 pt-6">
        <header className="mb-6">
          <p className="text-sm font-medium text-violet-500">Hewster</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Poop History</h1>
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
                          <span className="flex size-9 items-center justify-center rounded-full bg-orange-100 text-orange-600">
                            <span className="text-lg leading-none">💩</span>
                          </span>
                          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${poopBadgeClasses(log.detail)}`}>
                            {log.detail ?? "Logged"}
                          </span>
                        </div>
                        <p className="text-sm text-zinc-500">{formatActivityTime(log.happenedAt)}</p>
                      </div>
                      {log.notes ? <p className="mt-2 text-sm text-zinc-600">{log.notes}</p> : null}
                    </article>
                  ))}
                </div>
              </section>
            ))
          ) : (
            <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
              <p className="text-sm text-zinc-500">No poop records logged yet.</p>
            </section>
          )}
        </div>

        <BottomNav />
      </div>
    </main>
  );
}
