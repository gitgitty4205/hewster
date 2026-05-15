"use client";

import { Bell, Ellipsis, TriangleAlert } from "lucide-react";
import { PetAvatarMenu } from "@/components/pet-avatar-menu";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { BottomNav } from "@/components/bottom-nav";
import { Button } from "@/components/ui/button";
import {
  formatReminderTime,
  loadReminderAlertRules,
  reminderEventLabel,
  resolveAlerts,
  saveReminderAlertRules,
  type ReminderAlertEvent,
  type ReminderAlertRule,
} from "@/lib/alerts";
import { loadCareTemplatesFromSupabase, type CareItemTemplate } from "@/lib/care-settings";
import {
  type ActivityLog,
  type DailyMealState,
  deleteManualAlertInSupabase,
  type ManualAlert,
  loadAppState,
  persistLocalState,
  saveManualAlertToSupabase,
  type WeightLog,
  updateManualAlertInSupabase,
} from "@/lib/hewster-data";
import type { MealTemplate } from "@/lib/meal-templates";
import { HEWSTER_PROFILE_SLUG, isSupabaseConfigured } from "@/lib/supabase";

function currentAlertMinuteKey() {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}-${now.getHours()}:${now.getMinutes()}`;
}

function dayKeyFromDate(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addDays(dayKey: string, days: number) {
  const [year, month, day] = dayKey.split("-").map(Number);
  return dayKeyFromDate(new Date(year, month - 1, day + days));
}

function timeIsPastToday(dayKey: string, time: string) {
  if (dayKey !== dayKeyFromDate(new Date()) || !time) return false;
  const [hours, minutes] = time.split(":").map(Number);
  const scheduled = new Date();
  scheduled.setHours(hours, minutes, 0, 0);
  return scheduled.getTime() <= Date.now();
}

function repeatHelperText(scope: ManualAlert["scope"]) {
  if (scope === "ongoing") return "Starts today, then repeats every day.";
  if (scope === "every-other-day") return "Starts today, then repeats every other day.";
  if (scope === "certain-days") return "Starts today, then repeats on the selected days.";
  return null;
}

export default function AlertsPage() {
  const [templates, setTemplates] = useState<MealTemplate[]>([]);
  const [dailyMealState, setDailyMealState] = useState<DailyMealState[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([]);
  const [manualAlerts, setManualAlerts] = useState<ManualAlert[]>([]);
  const [careTemplates, setCareTemplates] = useState<CareItemTemplate[]>([]);
  const [titleValue, setTitleValue] = useState("");
  const [messageValue, setMessageValue] = useState("");
  const [scopeValue, setScopeValue] = useState<ManualAlert["scope"]>("today");
  const [alertTimeValue, setAlertTimeValue] = useState("09:00");
  const [alertDateValue, setAlertDateValue] = useState(dayKeyFromDate(new Date()));
  const [alertWeekdaysValue, setAlertWeekdaysValue] = useState<number[]>([]);
  const [showAlertForm, setShowAlertForm] = useState(false);
  const [editingAlertId, setEditingAlertId] = useState<string | null>(null);
  const [editingTitleValue, setEditingTitleValue] = useState("");
  const [editingMessageValue, setEditingMessageValue] = useState("");
  const [editingScopeValue, setEditingScopeValue] = useState<ManualAlert["scope"]>("today");
  const [editingAlertTimeValue, setEditingAlertTimeValue] = useState("09:00");
  const [editingAlertDateValue, setEditingAlertDateValue] = useState(dayKeyFromDate(new Date()));
  const [editingAlertWeekdaysValue, setEditingAlertWeekdaysValue] = useState<number[]>([]);
  const [reminderRules, setReminderRules] = useState<ReminderAlertRule[]>([]);
  const [reminderEventValue, setReminderEventValue] = useState<ReminderAlertEvent>("potty");
  const [reminderTimeValue, setReminderTimeValue] = useState("15:00");
  const [showReminderForm, setShowReminderForm] = useState(false);
  const [editingReminderRuleId, setEditingReminderRuleId] = useState<string | null>(null);
  const [editingReminderEventValue, setEditingReminderEventValue] = useState<ReminderAlertEvent>("potty");
  const [editingReminderTimeValue, setEditingReminderTimeValue] = useState("15:00");
  const [hydrated, setHydrated] = useState(false);
  const [alertMinuteKey, setAlertMinuteKey] = useState("");
  const supabaseReady = isSupabaseConfigured();

  useEffect(() => {
    let cancelled = false;
    const fallbackTimer = window.setTimeout(() => {
      if (!cancelled) {
        setHydrated(true);
        setAlertMinuteKey(currentAlertMinuteKey());
      }
    }, 2200);

    async function hydrate() {
      try {
        const state = await loadAppState();
        if (cancelled) return;
        setTemplates(state.templates);
        setDailyMealState(state.dailyMealState);
        setActivityLogs(state.activityLogs);
        setWeightLogs(state.weightLogs ?? []);
        setManualAlerts(state.manualAlerts ?? []);
        const [supplements, medications] = await Promise.all([
          loadCareTemplatesFromSupabase("supplement"),
          loadCareTemplatesFromSupabase("medication"),
        ]);
        setCareTemplates([...supplements, ...medications]);
        setReminderRules(loadReminderAlertRules());
        setAlertMinuteKey(currentAlertMinuteKey());
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

  useEffect(() => {
    const refreshAlertClock = () => setAlertMinuteKey(currentAlertMinuteKey());
    refreshAlertClock();
    const interval = window.setInterval(refreshAlertClock, 60000);
    window.addEventListener("focus", refreshAlertClock);
    document.addEventListener("visibilitychange", refreshAlertClock);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshAlertClock);
      document.removeEventListener("visibilitychange", refreshAlertClock);
    };
  }, []);

  useEffect(() => {
    if (!templates.length && !dailyMealState.length && !activityLogs.length && !weightLogs.length && !manualAlerts.length) return;
    persistLocalState(templates, dailyMealState, activityLogs, weightLogs, undefined, manualAlerts);
  }, [templates, dailyMealState, activityLogs, weightLogs, manualAlerts]);

  const alerts = useMemo(() => {
    void alertMinuteKey;
    return resolveAlerts(templates, dailyMealState, activityLogs, manualAlerts, reminderRules, careTemplates);
  }, [templates, dailyMealState, activityLogs, manualAlerts, reminderRules, careTemplates, alertMinuteKey]);
  const alertCards = alerts.filter((alert) => alert.kind !== "reminder");
  const activeManualAlerts = manualAlerts.filter((alert) => !alert.resolved);

  const todayKey = dayKeyFromDate(new Date());
  const tomorrowKey = addDays(todayKey, 1);

  const alertTargetDayKey = (scope: ManualAlert["scope"], dateValue: string) => {
    if (scope === "tomorrow") return tomorrowKey;
    if (scope === "date") return dateValue || todayKey;
    return todayKey;
  };

  const alertFormError = (scope: ManualAlert["scope"], time: string, dateValue: string, weekdays: number[]) => {
    const targetDayKey = alertTargetDayKey(scope, dateValue);
    if ((scope === "today" || scope === "date") && timeIsPastToday(targetDayKey, time)) return "Choose a future time for today.";
    if (scope === "date" && targetDayKey < todayKey) return "Choose today or a future date.";
    if (scope === "certain-days" && !weekdays.length) return "Choose at least one day.";
    return null;
  };

  const alertScopeLabel = (alert: Pick<ManualAlert, "scope" | "createdDayKey">) => {
    const scope = alert.scope ?? "today";
    if (scope === "ongoing") return "Everyday";
    if (scope === "every-other-day") return "Every Other Day";
    if (scope === "certain-days") return "Certain Days";
    const dayKey = alert.createdDayKey ?? todayKey;
    if (dayKey === todayKey) return "Today";
    if (dayKey === tomorrowKey) return "Tomorrow";
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(`${dayKey}T00:00:00`));
  };

  const weekdayOptions = [
    { value: 1, label: "Mon" },
    { value: 2, label: "Tue" },
    { value: 3, label: "Wed" },
    { value: 4, label: "Thu" },
    { value: 5, label: "Fri" },
    { value: 6, label: "Sat" },
    { value: 0, label: "Sun" },
  ];

  const toggleWeekday = (day: number, editing = false) => {
    const setter = editing ? setEditingAlertWeekdaysValue : setAlertWeekdaysValue;
    setter((current) => (current.includes(day) ? current.filter((value) => value !== day) : [...current, day]));
  };

  const newAlertError = alertFormError(scopeValue, alertTimeValue, alertDateValue, alertWeekdaysValue);

  const editingAlertError = alertFormError(editingScopeValue, editingAlertTimeValue, editingAlertDateValue, editingAlertWeekdaysValue);

  const addManualAlert = async () => {
    if (!titleValue.trim() || newAlertError) return;

    const targetDayKey = alertTargetDayKey(scopeValue, alertDateValue);

    const alert: ManualAlert = {
      id: `manual-alert-${Date.now()}`,
      profileSlug: HEWSTER_PROFILE_SLUG,
      title: titleValue.trim(),
      message: messageValue.trim(),
      scope: scopeValue,
      weekdays: scopeValue === "certain-days" ? alertWeekdaysValue : undefined,
      time: alertTimeValue,
      createdDayKey: targetDayKey,
      resolved: false,
      resolvedAt: null,
    };

    setManualAlerts((current) => [alert, ...current]);
    setTitleValue("");
    setMessageValue("");
    setScopeValue("today");
    setAlertTimeValue("09:00");
    setAlertDateValue(todayKey);
    setAlertWeekdaysValue([]);
    setShowAlertForm(false);

    if (supabaseReady) {
      try {
        await saveManualAlertToSupabase(alert);
      } catch {
        // local fallback already captured
      }
    }
  };

  const startEditingAlert = (alert: ManualAlert) => {
    setEditingAlertId(alert.id);
    setEditingTitleValue(alert.title);
    setEditingMessageValue(alert.message);
    setEditingScopeValue(alert.scope ?? "today");
    setEditingAlertWeekdaysValue(alert.weekdays ?? []);
    setEditingAlertTimeValue(alert.time ?? "09:00");
    setEditingAlertDateValue(alert.createdDayKey ?? todayKey);
  };

  const cancelEditingAlert = () => {
    setEditingAlertId(null);
    setEditingTitleValue("");
    setEditingMessageValue("");
    setEditingScopeValue("today");
    setEditingAlertTimeValue("09:00");
    setEditingAlertDateValue(todayKey);
    setEditingAlertWeekdaysValue([]);
  };

  const saveEditedAlert = async () => {
    if (!editingAlertId || !editingTitleValue.trim() || editingAlertError) return;

    const targetDayKey = alertTargetDayKey(editingScopeValue, editingAlertDateValue);

    const nextAlerts = manualAlerts.map((alert) =>
      alert.id === editingAlertId
        ? {
            ...alert,
            title: editingTitleValue.trim(),
            message: editingMessageValue.trim(),
            scope: editingScopeValue,
            weekdays: editingScopeValue === "certain-days" ? editingAlertWeekdaysValue : undefined,
            time: editingAlertTimeValue,
            createdDayKey: targetDayKey,
          }
        : alert
    );

    setManualAlerts(nextAlerts);
    const editedAlert = nextAlerts.find((alert) => alert.id === editingAlertId);
    cancelEditingAlert();

    if (supabaseReady && editedAlert) {
      try {
        await updateManualAlertInSupabase(editedAlert);
      } catch {
        // local fallback already captured
      }
    }
  };

  const deleteManualAlert = async (alertId: string) => {
    const confirmed = window.confirm("Delete this alert?");
    if (!confirmed) return;

    setManualAlerts((current) => current.filter((alert) => alert.id !== alertId));
    cancelEditingAlert();

    if (supabaseReady) {
      try {
        await deleteManualAlertInSupabase(alertId);
      } catch {
        // local fallback already captured
      }
    }
  };

  const commitReminderRules = (rules: ReminderAlertRule[]) => {
    setReminderRules(rules);
    saveReminderAlertRules(rules);
  };

  const addReminderRule = () => {
    const nextRule: ReminderAlertRule = {
      id: `reminder-rule-${Date.now()}`,
      eventType: reminderEventValue,
      time: reminderTimeValue,
      frequency: "daily",
      createdDayKey: todayKey,
      active: true,
    };

    commitReminderRules([nextRule, ...reminderRules]);
    setReminderEventValue("potty");
    setReminderTimeValue("15:00");
    setShowReminderForm(false);
  };

  const startEditingReminderRule = (rule: ReminderAlertRule) => {
    setEditingReminderRuleId(rule.id);
    setEditingReminderEventValue(rule.eventType);
    setEditingReminderTimeValue(rule.time);
  };

  const cancelEditingReminderRule = () => {
    setEditingReminderRuleId(null);
    setEditingReminderEventValue("potty");
    setEditingReminderTimeValue("15:00");
  };

  const saveEditedReminderRule = () => {
    if (!editingReminderRuleId) return;

    commitReminderRules(
      reminderRules.map((rule) =>
        rule.id === editingReminderRuleId
          ? {
              ...rule,
              eventType: editingReminderEventValue,
              time: editingReminderTimeValue,
              frequency: "daily",
              weekdays: undefined,
            }
          : rule
      )
    );
    cancelEditingReminderRule();
  };

  const deleteReminderRule = (ruleId: string) => {
    const confirmed = window.confirm("Delete this reminder setting?");
    if (!confirmed) return;
    commitReminderRules(reminderRules.filter((rule) => rule.id !== ruleId));
    cancelEditingReminderRule();
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

  if (!hydrated) {
    return (
      <main className="min-h-screen bg-[var(--hewie-bg,#979ca7)] text-zinc-900">
        <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-24 pt-6">
          <header className="mb-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Link href="/hewie" className="text-sm font-bold text-[var(--hewie-active-text,#6d28d9)]">
                  Hewster&apos;s Notebook
                </Link>
                <div className="skeleton-pulse mt-1 h-10 w-32 rounded-xl bg-white/40" />
              </div>
              <PetAvatarMenu className="mt-0.5 size-20 rounded-full object-cover object-center ring-1 ring-zinc-500/60 shadow-sm" />
            </div>
          </header>

          <div className="space-y-4">
            <div className="skeleton-pulse h-64 rounded-3xl bg-white/60 shadow-sm ring-1 ring-white/50" />
            <div className="skeleton-pulse h-40 rounded-3xl bg-white/60 shadow-sm ring-1 ring-white/50" />
          </div>

          <BottomNav />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--hewie-bg,#979ca7)] text-zinc-900">
      <div className="content-fade-in mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-24 pt-6">
        <header className="mb-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Link href="/hewie" className="text-sm font-bold text-[var(--hewie-active-text,#6d28d9)]">
                Hewster&apos;s Notebook
              </Link>
              <h1 className="mt-1 text-xl font-bold tracking-tight text-zinc-700">Alerts</h1>
            </div>
            <PetAvatarMenu className="mt-0.5 size-20 rounded-full object-cover object-center ring-1 ring-zinc-500/60 shadow-sm" />
          </div>
        </header>

        <section className="mb-4 rounded-3xl bg-[#fff0f1] p-5 text-[#d91f56] shadow-sm ring-1 ring-[#e6c8ce]/80">
          <div className="mb-4 flex items-center gap-2">
            <TriangleAlert className="size-5 text-[#8f1739]" />
            <h2 className="text-lg font-semibold text-[#8f1739]">Alerts</h2>
          </div>
          <p className="mb-4 text-sm leading-5 text-[#b71f48]/70">
            Create a one-time or everyday alert for something that needs special attention.
          </p>

          <div className="space-y-3">
            {!showAlertForm ? (
              <Button onClick={() => setShowAlertForm(true)} className="rounded-full bg-[#8f1739] text-white hover:bg-[#7c1431]">Add Alert</Button>
            ) : (
              <div className="space-y-3 rounded-2xl bg-white/60 p-3 ring-1 ring-[var(--hewie-ring,#cbd5e1)]">
                <input
                  value={titleValue}
                  onChange={(event) => setTitleValue(event.target.value)}
                  placeholder="Alert Title"
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--hewie-accent,#64748b)] focus:ring-4 focus:ring-[var(--hewie-ring,#cbd5e1)]/45"
                />
                <div className="grid grid-cols-[1fr_auto] gap-3">
                  <select
                    value={scopeValue}
                    onChange={(event) => {
                      const nextScope = event.target.value as ManualAlert["scope"];
                      setScopeValue(nextScope);
                      if (nextScope === "today") setAlertDateValue(todayKey);
                      if (nextScope === "tomorrow") setAlertDateValue(tomorrowKey);
                    }}
                    className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--hewie-accent,#64748b)] focus:ring-4 focus:ring-[var(--hewie-ring,#cbd5e1)]/45"
                  >
                    <option value="today">Today</option>
                    <option value="tomorrow">Tomorrow</option>
                    <option value="date">Pick Date</option>
                    <option value="ongoing">Everyday</option>
                    <option value="every-other-day">Every Other Day</option>
                    <option value="certain-days">Certain Days</option>
                  </select>
                  <input
                    type="time"
                    value={alertTimeValue}
                    onChange={(event) => setAlertTimeValue(event.target.value)}
                    className="w-28 rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--hewie-accent,#64748b)] focus:ring-4 focus:ring-[var(--hewie-ring,#cbd5e1)]/45"
                  />
                </div>
                {scopeValue === "date" ? (
                  <input
                    type="date"
                    value={alertDateValue}
                    min={todayKey}
                    onChange={(event) => setAlertDateValue(event.target.value)}
                    className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--hewie-accent,#64748b)] focus:ring-4 focus:ring-[var(--hewie-ring,#cbd5e1)]/45"
                  />
                ) : null}
                {repeatHelperText(scopeValue) ? (
                  <p className="text-center text-xs font-medium text-[#b71f48]/65">{repeatHelperText(scopeValue)}</p>
                ) : null}
                {scopeValue === "certain-days" ? (
                  <div className="flex flex-wrap gap-2">
                    {weekdayOptions.map((day) => (
                      <button
                        key={day.value}
                        type="button"
                        onClick={() => toggleWeekday(day.value)}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition ${
                          alertWeekdaysValue.includes(day.value)
                            ? "bg-[#8f1739] text-white ring-[#8f1739]"
                            : "bg-white text-zinc-500 ring-zinc-200"
                        }`}
                      >
                        {day.label}
                      </button>
                    ))}
                  </div>
                ) : null}
                <textarea
                  value={messageValue}
                  onChange={(event) => setMessageValue(event.target.value.slice(0, 180))}
                  maxLength={180}
                  rows={3}
                  placeholder="Alert Details / Message For Myself And Other Caretakers"
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--hewie-accent,#64748b)] focus:ring-4 focus:ring-[var(--hewie-ring,#cbd5e1)]/45"
                />
                {newAlertError ? <p className="text-sm font-medium text-[#8f1739]">{newAlertError}</p> : null}
                <div className="flex flex-wrap gap-2">
                  <Button disabled={Boolean(newAlertError)} onClick={addManualAlert} className="rounded-full bg-[#8f1739] text-white hover:bg-[#7c1431] disabled:opacity-45">Save Alert</Button>
                  <Button variant="outline" onClick={() => setShowAlertForm(false)} className="rounded-full">Cancel</Button>
                </div>
              </div>
            )}

            {activeManualAlerts.length ? (
              <div className="space-y-3 border-t border-[var(--hewie-ring,#cbd5e1)]/70 pt-3">
                <h3 className="text-sm font-semibold text-[#8f1739]/80">Saved Alerts</h3>
                {activeManualAlerts.map((alert) => (
                <article key={alert.id} className="rounded-2xl bg-white/75 p-4 ring-1 ring-[#e6c8ce]/70">
                  {editingAlertId === alert.id ? (
                    <div className="space-y-3">
                      <input
                        value={editingTitleValue}
                        onChange={(event) => setEditingTitleValue(event.target.value)}
                        placeholder="Alert Title"
                        className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--hewie-accent,#64748b)] focus:ring-4 focus:ring-[var(--hewie-ring,#cbd5e1)]/45"
                      />
                      <div className="grid grid-cols-[1fr_auto] gap-3">
                        <select
                          value={editingScopeValue}
                          onChange={(event) => {
                            const nextScope = event.target.value as ManualAlert["scope"];
                            setEditingScopeValue(nextScope);
                            if (nextScope === "today") setEditingAlertDateValue(todayKey);
                            if (nextScope === "tomorrow") setEditingAlertDateValue(tomorrowKey);
                          }}
                          className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--hewie-accent,#64748b)] focus:ring-4 focus:ring-[var(--hewie-ring,#cbd5e1)]/45"
                        >
                          <option value="today">Today</option>
                          <option value="tomorrow">Tomorrow</option>
                          <option value="date">Pick Date</option>
                          <option value="ongoing">Everyday</option>
                          <option value="every-other-day">Every Other Day</option>
                          <option value="certain-days">Certain Days</option>
                        </select>
                        <input
                          type="time"
                          value={editingAlertTimeValue}
                          onChange={(event) => setEditingAlertTimeValue(event.target.value)}
                          className="w-28 rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--hewie-accent,#64748b)] focus:ring-4 focus:ring-[var(--hewie-ring,#cbd5e1)]/45"
                        />
                      </div>
                      {editingScopeValue === "date" ? (
                        <input
                          type="date"
                          value={editingAlertDateValue}
                          min={todayKey}
                          onChange={(event) => setEditingAlertDateValue(event.target.value)}
                          className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--hewie-accent,#64748b)] focus:ring-4 focus:ring-[var(--hewie-ring,#cbd5e1)]/45"
                        />
                      ) : null}
                      {repeatHelperText(editingScopeValue) ? (
                        <p className="text-center text-xs font-medium text-[#b71f48]/65">{repeatHelperText(editingScopeValue)}</p>
                      ) : null}
                      {editingScopeValue === "certain-days" ? (
                        <div className="flex flex-wrap gap-2">
                          {weekdayOptions.map((day) => (
                            <button
                              key={day.value}
                              type="button"
                              onClick={() => toggleWeekday(day.value, true)}
                              className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition ${
                                editingAlertWeekdaysValue.includes(day.value)
                                  ? "bg-[#8f1739] text-white ring-[#8f1739]"
                                  : "bg-white text-zinc-500 ring-zinc-200"
                              }`}
                            >
                              {day.label}
                            </button>
                          ))}
                        </div>
                      ) : null}
                      <textarea
                        value={editingMessageValue}
                        onChange={(event) => setEditingMessageValue(event.target.value.slice(0, 180))}
                        maxLength={180}
                        rows={3}
                        placeholder="Alert Details / Message For Myself And Other Caretakers"
                        className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--hewie-accent,#64748b)] focus:ring-4 focus:ring-[var(--hewie-ring,#cbd5e1)]/45"
                      />
                      {editingAlertError ? <p className="text-sm font-medium text-[#8f1739]">{editingAlertError}</p> : null}
                      <div className="grid grid-cols-4 gap-2">
                        <Button disabled={Boolean(editingAlertError)} className="rounded-full bg-[#8f1739] px-2 text-white hover:bg-[#7c1431] disabled:opacity-45" onClick={saveEditedAlert}>Save</Button>
                        <Button variant="outline" className="rounded-full border-[#e6c8ce] px-2 text-[#d91f56] hover:bg-[#fff0f1]" onClick={cancelEditingAlert}>Cancel</Button>
                        <Button variant="outline" className="rounded-full border-[#e6c8ce] px-2 text-[#d91f56] hover:bg-[#fff0f1]" onClick={() => deleteManualAlert(alert.id)}>Delete</Button>
                        <Button variant="outline" className="rounded-full border-[#ff1b5a] px-2 text-[#d91f56] hover:bg-[#fff0f1]" onClick={() => resolveManualAlert(alert.id)}>Done</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-[#8f1739]">{alert.title}</p>
                          <span className="rounded-full bg-[#fff0f1] px-2 py-0.5 text-xs font-semibold text-[#b71f48]/70 ring-1 ring-[#e6c8ce]/75">
                            {alertScopeLabel(alert)}{alert.time ? ` • ${formatReminderTime(alert.time)}` : ""}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-[#b71f48]/65">{alert.message}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => startEditingAlert(alert)}
                        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/75 text-[#d91f56]/60 ring-1 ring-[#e6c8ce]/70 transition hover:bg-white hover:text-[#d91f56]"
                        aria-label={`Edit ${alert.title}`}
                      >
                        <Ellipsis className="size-3.5" />
                      </button>
                    </div>
                  )}
                </article>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        <section className="mb-4 rounded-3xl bg-white/75 p-5 text-[var(--hewie-active-text,#334155)] shadow-sm ring-1 ring-white/70">
          <div className="mb-4 flex items-center gap-2">
            <Bell className="size-5 text-[var(--hewie-active-text,#334155)]" />
            <h2 className="text-lg font-semibold text-[var(--hewie-active-text,#334155)]">Reminders</h2>
          </div>
          <p className="mb-4 text-sm leading-5 text-[var(--hewie-active-text,#334155)]/65">
            Set a reminder if a regular task isn’t logged by a certain time.
          </p>

          <div className="space-y-3">
            {!showReminderForm ? (
              <Button onClick={() => setShowReminderForm(true)} className="rounded-full bg-[var(--hewie-active-text,#334155)] text-white hover:opacity-90">Add Reminder</Button>
            ) : (
              <div className="space-y-3 rounded-2xl bg-white/60 p-3 ring-1 ring-[var(--hewie-ring,#cbd5e1)]">
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <select
                value={reminderEventValue}
                onChange={(event) => setReminderEventValue(event.target.value as ReminderAlertEvent)}
                className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--hewie-accent,#64748b)] focus:ring-4 focus:ring-[var(--hewie-ring,#cbd5e1)]/45"
              >
                <option value="meal">Meal / Food</option>
                <option value="potty">Potty</option>
                <option value="supplement">Supplement</option>
                <option value="medication">Medication</option>
              </select>
              <input
                type="time"
                value={reminderTimeValue}
                onChange={(event) => setReminderTimeValue(event.target.value)}
                className="w-28 rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--hewie-accent,#64748b)] focus:ring-4 focus:ring-[var(--hewie-ring,#cbd5e1)]/45"
              />
            </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={addReminderRule} className="rounded-full bg-[var(--hewie-active-text,#334155)] text-white hover:opacity-90">Save Reminder</Button>
                  <Button variant="outline" onClick={() => setShowReminderForm(false)} className="rounded-full">Cancel</Button>
                </div>
              </div>
            )}

            {reminderRules.length ? (
              <div className="space-y-2 border-t border-[var(--hewie-ring,#cbd5e1)]/70 pt-3">
                <h3 className="text-sm font-semibold text-[var(--hewie-active-text,#334155)]/85">Saved Reminders</h3>
                {reminderRules.map((rule) => (
                  <article key={rule.id} className="rounded-2xl bg-white/70 p-4 ring-1 ring-[var(--hewie-ring,#cbd5e1)]">
                    {editingReminderRuleId === rule.id ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-[1fr_auto] gap-3">
                          <select
                            value={editingReminderEventValue}
                            onChange={(event) => setEditingReminderEventValue(event.target.value as ReminderAlertEvent)}
                            className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--hewie-accent,#64748b)] focus:ring-4 focus:ring-[var(--hewie-ring,#cbd5e1)]/45"
                          >
                            <option value="meal">Meal / Food</option>
                            <option value="potty">Potty</option>
                            <option value="supplement">Supplement</option>
                            <option value="medication">Medication</option>
                          </select>
                          <input
                            type="time"
                            value={editingReminderTimeValue}
                            onChange={(event) => setEditingReminderTimeValue(event.target.value)}
                            className="w-28 rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--hewie-accent,#64748b)] focus:ring-4 focus:ring-[var(--hewie-ring,#cbd5e1)]/45"
                          />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button className="rounded-full bg-[var(--hewie-active-text,#334155)] text-white hover:opacity-90" onClick={saveEditedReminderRule}>Save</Button>
                          <Button variant="outline" className="rounded-full" onClick={cancelEditingReminderRule}>Cancel</Button>
                          <Button variant="outline" className="rounded-full border-[var(--hewie-ring,#cbd5e1)] text-[var(--hewie-active-text,#334155)] hover:bg-[var(--hewie-active-bg,#f1f5f9)]" onClick={() => deleteReminderRule(rule.id)}>Delete</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-[var(--hewie-active-text,#334155)]">
                            {reminderEventLabel(rule.eventType)} by {formatReminderTime(rule.time)}
                          </p>
                          <p className="mt-1 text-sm text-[var(--hewie-active-text,#334155)]/65">Every Day</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => startEditingReminderRule(rule)}
                          className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/75 text-[var(--hewie-active-text,#334155)]/55 ring-1 ring-[var(--hewie-ring,#cbd5e1)] transition hover:bg-white hover:text-[var(--hewie-active-text,#334155)]"
                          aria-label={`Edit ${reminderEventLabel(rule.eventType)} reminder`}
                        >
                          <Ellipsis className="size-3.5" />
                        </button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            ) : null}
          </div>
        </section>


        <BottomNav alertsCount={alertCards.length} />
      </div>
    </main>
  );
}
