"use client";

import { Activity, Bluetooth, Clock } from "lucide-react";

const upcomingIntegrations = ["FitBark", "Whistle", "Tractive"];

export function FitBarkActivityCard() {
  return (
    <section className="mb-4 rounded-3xl bg-lime-50/65 p-5 shadow-sm ring-1 ring-lime-100">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-lime-100/80 text-lime-700 ring-1 ring-lime-200/70">
          <Activity className="size-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Fitness Tracking</h2>
          <p className="text-sm leading-5 text-zinc-500">Connect FitBark, Whistle, Tractive, and other fitness trackers to automatically sync activity and wellness data.</p>
        </div>
      </div>

      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-lime-700/80">Coming Soon</p>
      <div className="grid grid-cols-3 gap-2">
        {upcomingIntegrations.map((integration) => (
          <div key={integration} className="rounded-2xl bg-white/55 px-3 py-3 text-center opacity-75 ring-1 ring-lime-100/80">
            <p className="text-sm font-semibold text-zinc-800/85">{integration}</p>
            <p className="mt-1 text-[11px] font-semibold text-lime-700/80">Coming Soon</p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-2xl bg-white/60 p-4 ring-1 ring-lime-100/80">
          <Bluetooth className="mb-2 size-4 text-lime-700" />
          <p className="font-semibold text-zinc-900">Automatic Sync</p>
          <p className="mt-1 text-xs leading-5 text-zinc-500">Import activity, sleep, and exercise data from supported trackers.</p>
        </div>
        <div className="rounded-2xl bg-white/60 p-4 ring-1 ring-lime-100/80">
          <Clock className="mb-2 size-4 text-lime-700" />
          <p className="font-semibold text-zinc-900">Daily Trends</p>
          <p className="mt-1 text-xs leading-5 text-zinc-500">View activity, rest, and routine patterns alongside daily logs.</p>
        </div>
      </div>
    </section>
  );
}
