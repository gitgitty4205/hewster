"use client";

import { Activity, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

type FitBarkRecord = {
  date: string;
  activity_value?: number;
  min_play?: number;
  min_active?: number;
  min_rest?: number;
  daily_target?: number;
  has_trophy?: number;
};

type FitBarkActivityResponse = {
  configured: boolean;
  message?: string;
  today?: FitBarkRecord | null;
  sevenDayActivity?: number;
  records: FitBarkRecord[];
};

function formatNumber(value?: number) {
  return typeof value === "number" ? new Intl.NumberFormat("en-US").format(value) : "—";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(`${value.slice(0, 10)}T12:00:00`));
}

export function FitBarkActivityCard() {
  const [data, setData] = useState<FitBarkActivityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadActivity() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/fitbark/activity", { cache: "no-store" });
      const payload = (await response.json()) as FitBarkActivityResponse;

      if (!response.ok) {
        throw new Error(payload.message ?? "FitBark activity could not be loaded.");
      }

      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "FitBark activity could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadActivity();
  }, []);

  const latestRecords = data?.records.slice(-4).reverse() ?? [];

  return (
    <section className="mb-4 rounded-3xl bg-lime-50 p-5 shadow-sm ring-1 ring-lime-200">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-lime-100 text-lime-700">
            <Activity className="size-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">FitBark Activity</h2>
            <p className="text-sm text-zinc-500">Activity-only sync for your pet.</p>
          </div>
        </div>
        <Button
          variant="outline"
          className="rounded-full border-lime-200 bg-white/70 px-3 text-xs"
          onClick={() => void loadActivity()}
          disabled={loading}
        >
          <RefreshCw className={`mr-1.5 size-3.5 ${loading ? "animate-spin" : ""}`} />
          Sync
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-zinc-500">Loading FitBark activity…</p>
      ) : error ? (
        <p className="text-sm text-rose-600">{error}</p>
      ) : data && !data.configured ? (
        <p className="text-sm text-zinc-500">{data.message}</p>
      ) : data?.today ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white/80 p-4 ring-1 ring-lime-100">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-lime-600">Today</p>
              <p className="mt-1 text-2xl font-bold text-zinc-900">{formatNumber(data.today.activity_value)}</p>
              <p className="text-xs text-zinc-500">activity points</p>
            </div>
            <div className="rounded-2xl bg-white/80 p-4 ring-1 ring-lime-100">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-lime-600">7 days</p>
              <p className="mt-1 text-2xl font-bold text-zinc-900">{formatNumber(data.sevenDayActivity)}</p>
              <p className="text-xs text-zinc-500">activity points</p>
            </div>
          </div>

          <div className="space-y-2">
            {latestRecords.map((record) => (
              <div key={record.date} className="flex items-center justify-between rounded-2xl bg-white/70 px-4 py-3 text-sm ring-1 ring-lime-100">
                <div>
                  <p className="font-medium text-zinc-900">{formatDate(record.date)}</p>
                  <p className="text-xs text-zinc-500">
                    Active {record.min_active ?? 0}m · Play {record.min_play ?? 0}m · Rest {record.min_rest ?? 0}m
                  </p>
                </div>
                <p className="font-semibold text-lime-700">{formatNumber(record.activity_value)}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-zinc-500">No FitBark activity returned yet.</p>
      )}
    </section>
  );
}
