"use client";

import { BellPlus, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { BottomNav } from "@/components/bottom-nav";
import { Button } from "@/components/ui/button";
import { resolveAlerts } from "@/lib/alerts";
import {
  type ActivityLog,
  type DailyMealState,
  type ManualAlert,
  loadAppState,
  persistLocalState,
  saveManualAlertToSupabase,
  type WeightLog,
  updateManualAlertInSupabase,
} from "@/lib/hewster-data";
import type { MealTemplate } from "@/lib/meal-templates";
import { HEWSTER_PROFILE_SLUG, isSupabaseConfigured } from "@/lib/supabase";

export default function AlertsPage() {
  const [templates, setTemplates] = useState<MealTemplate[]>([]);
  const [dailyMealState, setDailyMealState] = useState<DailyMealState[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([]);
  const [manualAlerts, setManualAlerts] = useState<ManualAlert[]>([]);
  const [titleValue, setTitleValue] = useState("");
  const [messageValue, setMessageValue] = useState("");
  const supabaseReady = isSupabaseConfigured();

  useEffect(() => {
    async function hydrate() {
      const state = await loadAppState();
      setTemplates(state.templates);
      setDailyMealState(state.dailyMealState);
      setActivityLogs(state.activityLogs);
      setWeightLogs(state.weightLogs ?? []);
      setManualAlerts(state.manualAlerts ?? []);
    }

    hydrate();
  }, []);

  useEffect(() => {
    if (!templates.length && !dailyMealState.length && !activityLogs.length && !weightLogs.length && !manualAlerts.length) return;
    persistLocalState(templates, dailyMealState, activityLogs, weightLogs, undefined, manualAlerts);
  }, [templates, dailyMealState, activityLogs, weightLogs, manualAlerts]);

  const alerts = useMemo(
    () => resolveAlerts(templates, dailyMealState, activityLogs, manualAlerts),
    [templates, dailyMealState, activityLogs, manualAlerts]
  );

  const addManualAlert = async () => {
    if (!titleValue.trim() || !messageValue.trim()) return;

    const alert: ManualAlert = {
      id: `manual-alert-${Date.now()}`,
      profileSlug: HEWSTER_PROFILE_SLUG,
      title: titleValue.trim(),
      message: messageValue.trim(),
      resolved: false,
      resolvedAt: null,
    };

    setManualAlerts((current) => [alert, ...current]);
    setTitleValue("");
    setMessageValue("");

    if (supabaseReady) {
      try {
        await saveManualAlertToSupabase(alert);
      } catch {
        // local fallback already captured
      }
    }
  };

  const resolveManualAlert = async (alertId: string) => {
    const nextAlerts = manualAlerts.map((alert) =>
      alert.id === alertId
        ? {
            ...alert,
            resolved: true,
            resolvedAt: new Date().toISOString(),
          }
        : alert
    );

    setManualAlerts(nextAlerts);

    const resolvedAlert = nextAlerts.find((alert) => alert.id === alertId);
    if (supabaseReady && resolvedAlert) {
      try {
        await updateManualAlertInSupabase(resolvedAlert);
      } catch {
        // local fallback already captured
      }
    }
  };

  return (
    <main className="min-h-screen bg-[#979ca7] text-zinc-900">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-24 pt-6">
        <header className="mb-6">
          <p className="text-sm font-medium text-violet-500">Hewster</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Alerts</h1>

        </header>

        <section className="mb-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
          <div className="mb-4 flex items-center gap-2">
            <BellPlus className="size-4 text-violet-500" />
            <h2 className="text-lg font-semibold">Add Manual Alert</h2>
          </div>

          <div className="space-y-3">
            <input
              value={titleValue}
              onChange={(event) => setTitleValue(event.target.value)}
              placeholder="Short alert title"
              className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-rose-300 focus:ring-4 focus:ring-rose-100"
            />
            <textarea
              value={messageValue}
              onChange={(event) => setMessageValue(event.target.value)}
              rows={3}
              placeholder="Message for the other caretaker"
              className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-rose-300 focus:ring-4 focus:ring-rose-100"
            />
            <Button onClick={addManualAlert} className="rounded-full bg-zinc-300 text-zinc-800 hover:bg-zinc-400">Add Alert</Button>
          </div>
        </section>

        <section className="mb-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
          <div className="mb-4 flex items-center gap-2">
            <TriangleAlert className="size-4 text-violet-500" />
            <h2 className="text-lg font-semibold">Current Alerts</h2>
          </div>

          <div className="space-y-3">
            {alerts.length ? (
              alerts.map((alert) => (
                <article key={alert.id} className="rounded-2xl bg-rose-50/70 p-4 ring-1 ring-rose-200">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-zinc-900">{alert.title}</p>
                      <p className="mt-1 text-sm text-zinc-600">{alert.detail}</p>
                    </div>
                    {alert.kind === "manual" ? (
                      <Button variant="outline" className="rounded-full text-xs" onClick={() => resolveManualAlert(alert.id)}>
                        Resolve
                      </Button>
                    ) : null}
                  </div>
                </article>
              ))
            ) : (
              <p className="text-sm text-zinc-500">No alerts right now.</p>
            )}
          </div>
        </section>

        <BottomNav alertsCount={alerts.length} />
      </div>
    </main>
  );
}
