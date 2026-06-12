"use client";

import { Bell, ChevronDown, TriangleAlert } from "lucide-react";
import { usePathname } from "next/navigation";
import { PetAvatarMenu } from "@/components/pet-avatar-menu";
import { type MouseEvent, type ReactNode, useEffect, useMemo, useState } from "react";

import { BottomNav } from "@/components/bottom-nav";
import { CenteredLoadingIcon } from "@/components/centered-loading-icon";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth-provider";
import {
  ALERT_BADGE_COUNT_STORAGE_KEY,
  formatReminderTime,
  loadReminderAlertRules,
  reminderEventLabel,
  resolveAlerts,
  saveReminderAlertRules,
  type ReminderAlertEvent,
  type ReminderAlertRule,
  type ResolvedAlert,
} from "@/lib/alerts";
import { loadCareTemplates, loadCareTemplatesFromSupabase, mergeCareTemplateSources, type CareItemTemplate } from "@/lib/care-settings";
import {
  ACTIVITY_LOGS_STORAGE_KEY,
  type ActivityLog,
  type DailyMealState,
  deleteActivityLogInSupabase,
  deleteManualAlertInSupabase,
  type ManualAlert,
  type MealLog,
  loadAppState,
  persistLocalState,
  saveActivityLogToSupabase,
  saveCompletedMealToSupabase,
  saveManualAlertToSupabase,
  type WeightLog,
  updateManualAlertInSupabase,
} from "@/lib/hewster-data";
import type { MealTemplate } from "@/lib/meal-templates";
import { HEWSTER_PROFILE_SLUG, isSupabaseConfigured } from "@/lib/supabase";
import { loadPetProfile } from "@/lib/pet-profile";
import { PetNotebookTitle } from "@/components/pet-notebook-title";
import { compareActivitiesReverseChronological } from "@/lib/activity";
import { TEXT_LIMITS, clampText } from "@/lib/text-limits";

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

function alertRepeats(scope: ManualAlert["scope"]) {
  return ["ongoing", "every-other-day", "certain-days"].includes(scope ?? "today");
}

function reminderActionLabel(eventType: ReminderAlertEvent) {
  return reminderEventLabel(eventType).replace(" / ", "/").toLowerCase();
}

function repeatHelperText(scope: ManualAlert["scope"]) {
  if (scope === "ongoing") return "Repeats every day. If today's time already passed, it starts tomorrow.";
  if (scope === "every-other-day") return "Repeats every other day. If today's time already passed, it starts tomorrow.";
  if (scope === "certain-days") return "Repeats on the selected days. If today's time already passed, it starts on the next matching day.";
  return null;
}

function ExpandDetailsButton({
  expanded,
  onClick,
  className,
}: {
  expanded: boolean;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  className: string;
}) {
  return (
    <button
      type="button"
      aria-label={expanded ? "Hide details" : "Show details"}
      aria-expanded={expanded}
      onClick={onClick}
      className={`inline-flex size-7 shrink-0 items-center justify-center transition active:translate-y-px ${className}`}
    >
      <ChevronDown className={`size-5 transition-transform ${expanded ? "rotate-180" : ""}`} strokeWidth={2.8} />
    </button>
  );
}

function InlineDetails({
  expanded,
  children,
  className,
}: {
  expanded: boolean;
  children: ReactNode;
  className: string;
}) {
  if (!expanded) return null;

  return (
    <div className={`mt-2 whitespace-pre-line rounded-2xl px-3 py-2 text-sm leading-5 ${className}`}>
      {children}
    </div>
  );
}

function timeInputValueFromDisplay(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ").toUpperCase();
  const twelveHourMatch = normalized.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/);
  if (twelveHourMatch) {
    let hours = Number(twelveHourMatch[1]);
    const minutes = Number(twelveHourMatch[2] ?? "0");
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return "";
    if (twelveHourMatch[3] === "PM" && hours < 12) hours += 12;
    if (twelveHourMatch[3] === "AM" && hours === 12) hours = 0;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }

  const twentyFourHourMatch = normalized.match(/^(\d{1,2}):(\d{2})$/);
  if (!twentyFourHourMatch) return "";
  const hours = Number(twentyFourHourMatch[1]);
  const minutes = Number(twentyFourHourMatch[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours > 23 || minutes > 59) return "";
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function timeInputValueFromIso(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function displayTimeFromInput(value: string) {
  const [hoursValue, minutesValue] = value.split(":").map(Number);
  if (!Number.isFinite(hoursValue) || !Number.isFinite(minutesValue)) return value;
  const suffix = hoursValue >= 12 ? "PM" : "AM";
  const hours = hoursValue % 12 === 0 ? 12 : hoursValue % 12;
  return `${hours}:${String(minutesValue).padStart(2, "0")} ${suffix}`;
}

function todayIsoFromTimeInput(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  const date = new Date();
  if (Number.isFinite(hours) && Number.isFinite(minutes)) {
    date.setHours(hours, minutes, 0, 0);
  }
  return date.toISOString();
}

function missedMealLogId(dayKey: string, mealId: number) {
  return `${dayKey}-${mealId}-missed`;
}

function buildMealLog(meal: MealTemplate, actualTime: string, fedNotes: string | null, dayKey: string): MealLog {
  return {
    id: `${dayKey}-${meal.id}`,
    profileSlug: HEWSTER_PROFILE_SLUG,
    dayKey,
    mealId: meal.id,
    mealName: meal.name,
    food: meal.food,
    defaultNotes: meal.notes,
    fedNotes,
    skippedCareItemIds: [],
    actualTime,
    createdAt: new Date().toISOString(),
  };
}

type ReviewAction = NonNullable<ResolvedAlert["reviewAction"]>;

function medicationTypeLabel(item: CareItemTemplate) {
  if (item.kind !== "medication") return null;
  if (item.medicationType === "topical") return "Topical";
  if (item.medicationType === "injection") return "Injection";
  if (item.medicationType === "other") return "Other";
  return "Oral";
}

function customCareTimingLabel(item: CareItemTemplate) {
  if (item.kind === "medication" && item.medicationType !== "oral") return null;
  return item.customTiming === "empty-stomach" ? "Empty Stomach" : "With Food";
}

function customCareGiveText(item: CareItemTemplate) {
  const medicationType = medicationTypeLabel(item);
  return `Give ${item.dose || "as directed"}${medicationType ? ` (${medicationType})` : ""}`;
}

function syncStoredAlertBadgeCount(count: number) {
  window.localStorage.setItem(ALERT_BADGE_COUNT_STORAGE_KEY, String(Math.max(0, count)));
  window.dispatchEvent(new Event("alert-badge-count-updated"));
}

function buildCustomCareActivityLog(
  action: Extract<ReviewAction, { type: "custom-care" }>,
  status: "done" | "skipped",
  happenedAt: string
): ActivityLog {
  const statusNote = status === "skipped" ? "Skipped" : "";

  return {
    id: status === "done" ? action.occurrenceKey : `${action.occurrenceKey}-skipped`,
    profileSlug: HEWSTER_PROFILE_SLUG,
    activityType: action.item.kind,
    happenedAt,
    detail: `${action.item.name}${action.item.dose && status === "done" ? ` • ${action.item.dose}` : ""}${status === "skipped" ? " Skipped" : ""}`,
    notes: [
      customCareGiveText(action.item),
      customCareTimingLabel(action.item),
      action.item.kind === "medication" ? medicationTypeLabel(action.item) : null,
      statusNote,
      action.item.notes ? `Notes: ${action.item.notes}` : "",
    ].filter(Boolean).join("\n") || null,
    createdAt: new Date().toISOString(),
  };
}

export default function AlertsPage() {
  const { loading: authLoading } = useAuth();
  const pathname = usePathname();
  const reminderRulesScope = pathname.startsWith("/hewie") ? "hewie" : "default";
  const includeDefaultReminderRules = pathname.startsWith("/hewie");
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
  const [reviewMealTimeValues, setReviewMealTimeValues] = useState<Record<string, string>>({});
  const [activeReviewLogId, setActiveReviewLogId] = useState<string | null>(null);
  const [expandedAlertDetails, setExpandedAlertDetails] = useState<Record<string, boolean>>({});
  const [hydrated, setHydrated] = useState(false);
  const [alertMinuteKey, setAlertMinuteKey] = useState("");
  const [petRemembered, setPetRemembered] = useState(false);
  const supabaseReady = isSupabaseConfigured();

  useEffect(() => {
    const refreshPetProfile = () => setPetRemembered(loadPetProfile().hasPassedAway);
    refreshPetProfile();
    window.addEventListener("pet-profile-updated", refreshPetProfile);
    window.addEventListener("storage", refreshPetProfile);
    return () => {
      window.removeEventListener("pet-profile-updated", refreshPetProfile);
      window.removeEventListener("storage", refreshPetProfile);
    };
  }, []);

  useEffect(() => {
    if (supabaseReady && authLoading) return;

    let cancelled = false;

    async function hydrate() {
      try {
        setReminderRules(loadReminderAlertRules({ scope: reminderRulesScope, includeDefaults: includeDefaultReminderRules }));
        const state = await loadAppState();
        if (cancelled) return;
        setTemplates(state.templates);
        setDailyMealState(state.dailyMealState);
        setActivityLogs(state.activityLogs);
        setWeightLogs(state.weightLogs ?? []);
        setManualAlerts(state.manualAlerts ?? []);
        const localSupplements = loadCareTemplates("supplement");
        const localMedications = loadCareTemplates("medication");
        const [remoteSupplements, remoteMedications] = await Promise.all([
          loadCareTemplatesFromSupabase("supplement").catch(() => loadCareTemplates("supplement")),
          loadCareTemplatesFromSupabase("medication").catch(() => loadCareTemplates("medication")),
        ]);
        setCareTemplates([
          ...mergeCareTemplateSources("supplement", localSupplements, remoteSupplements),
          ...mergeCareTemplateSources("medication", localMedications, remoteMedications),
        ]);
        setReminderRules(loadReminderAlertRules({ scope: reminderRulesScope, includeDefaults: includeDefaultReminderRules }));
        setAlertMinuteKey(currentAlertMinuteKey());
      } finally {
        if (!cancelled) {
          setHydrated(true);
        }
      }
    }

    hydrate();

    return () => {
      cancelled = true;
    };
  }, [authLoading, includeDefaultReminderRules, reminderRulesScope, supabaseReady]);

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
    if (petRemembered) return [];
    return resolveAlerts(templates, dailyMealState, activityLogs, manualAlerts, reminderRules, careTemplates);
  }, [templates, dailyMealState, activityLogs, manualAlerts, reminderRules, careTemplates, alertMinuteKey, petRemembered]);
  const alertCards = alerts.filter((alert) => alert.kind !== "reminder");
  const visibleReminderRules = useMemo(
    () =>
      reminderRules.filter(
        (rule) => !(reminderRulesScope === "default" && rule.eventType === "potty" && rule.time === "15:00")
      ),
    [reminderRules, reminderRulesScope]
  );
  const unresolvedAlertCountFor = (
    nextDailyMealState: DailyMealState[] = dailyMealState,
    nextActivityLogs: ActivityLog[] = activityLogs,
    nextManualAlerts: ManualAlert[] = manualAlerts
  ) =>
    petRemembered ? 0 : resolveAlerts(templates, nextDailyMealState, nextActivityLogs, nextManualAlerts, reminderRules, careTemplates).filter(
      (alert) => alert.kind !== "reminder"
    ).length;

  useEffect(() => {
    if (!hydrated) return;
    syncStoredAlertBadgeCount(alertCards.length);
  }, [alertCards.length, hydrated]);

  const todayKey = dayKeyFromDate(new Date());
  const tomorrowKey = addDays(todayKey, 1);

  const alertTargetDayKey = (scope: ManualAlert["scope"], dateValue: string, time: string) => {
    if (scope === "tomorrow") return tomorrowKey;
    if (scope === "date") return dateValue || todayKey;
    if (alertRepeats(scope) && timeIsPastToday(todayKey, time)) return tomorrowKey;
    return todayKey;
  };

  const alertFormError = (scope: ManualAlert["scope"], time: string, dateValue: string, weekdays: number[]) => {
    const targetDayKey = alertTargetDayKey(scope, dateValue, time);
    if ((scope === "today" || scope === "date") && timeIsPastToday(targetDayKey, time)) return "Choose a future time for today.";
    if (scope === "date" && targetDayKey < todayKey) return "Choose today or a future date.";
    if (scope === "certain-days" && !weekdays.length) return "Choose at least one day.";
    return null;
  };

  const manualAlertRepeats = (alert: Pick<ManualAlert, "scope">) => alertRepeats(alert.scope);
  const savedManualAlerts = manualAlerts.filter((alert) => !alert.resolved || manualAlertRepeats(alert));

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

  const reviewMealTimeValue = (alertId: string, plannedTime: string) =>
    reviewMealTimeValues[alertId] || timeInputValueFromDisplay(plannedTime) || new Intl.DateTimeFormat("en-CA", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date());

  const updateReviewMealTime = (alertId: string, value: string) => {
    setReviewMealTimeValues((current) => ({ ...current, [alertId]: value }));
  };

  const openReviewLogTime = (alertId: string, plannedTime: string) => {
    setReviewMealTimeValues((current) => ({
      ...current,
      [alertId]: current[alertId] || timeInputValueFromDisplay(plannedTime) || plannedTime,
    }));
    setActiveReviewLogId(alertId);
  };

  const resolveReviewMeal = async (alertId: string, mealId: number, status: "done" | "skipped") => {
    const template = templates.find((entry) => entry.id === mealId);
    if (!template) return;

    const actualTime = status === "done"
      ? displayTimeFromInput(reviewMealTimeValue(alertId, template.plannedTime))
      : template.plannedTime;
    const fedNotes = status === "skipped" ? "Skipped" : null;
    const mealLog = buildMealLog(template, actualTime, fedNotes, todayKey);

    const foundExistingMealState = dailyMealState.some((meal) => meal.mealId === mealId && (meal.dayKey ?? todayKey) === todayKey);
    const nextMealState: DailyMealState[] = foundExistingMealState
      ? dailyMealState.map((meal) =>
          meal.mealId === mealId && (meal.dayKey ?? todayKey) === todayKey
            ? {
                ...meal,
                actualTime,
                status: "done",
                fedNotes,
                skippedCareItemIds: [],
                dayKey: todayKey,
              }
            : meal
        )
      : [
          ...dailyMealState,
          {
            mealId,
            actualTime,
            status: "done",
            fedNotes,
            skippedCareItemIds: [],
            dayKey: todayKey,
          },
        ];

    setDailyMealState(nextMealState);
    syncStoredAlertBadgeCount(unresolvedAlertCountFor(nextMealState));
    setReviewMealTimeValues((current) => {
      const next = { ...current };
      delete next[alertId];
      return next;
    });
    setActiveReviewLogId((current) => (current === alertId ? null : current));

    try {
      await saveCompletedMealToSupabase(mealLog, nextMealState, missedMealLogId(todayKey, mealId));
    } catch {
      // Local state is already updated; the shared save helper keeps its own local cache.
    }
  };

  const resolveReviewCustomCare = async (
    alertId: string,
    action: Extract<ReviewAction, { type: "custom-care" }>,
    status: "done" | "skipped"
  ) => {
    const timeValue = reviewMealTimeValue(alertId, timeInputValueFromIso(action.scheduledAt));
    const activity = buildCustomCareActivityLog(action, status, todayIsoFromTimeInput(timeValue));
    const supersededActivityIds = [action.occurrenceKey, `${action.occurrenceKey}-skipped`, `${action.occurrenceKey}-missed`];
    setActivityLogs((current) => {
      const nextActivityLogs = [
        activity,
        ...current.filter((entry) => !supersededActivityIds.includes(entry.id)),
      ].sort(compareActivitiesReverseChronological);

      window.localStorage.setItem(ACTIVITY_LOGS_STORAGE_KEY, JSON.stringify(nextActivityLogs));
      persistLocalState(templates, dailyMealState, nextActivityLogs, weightLogs, undefined, manualAlerts);
      syncStoredAlertBadgeCount(unresolvedAlertCountFor(undefined, nextActivityLogs));
      return nextActivityLogs;
    });
    setReviewMealTimeValues((current) => {
      const next = { ...current };
      delete next[alertId];
      return next;
    });
    setActiveReviewLogId((current) => (current === alertId ? null : current));

    try {
      await saveActivityLogToSupabase(activity);
      await Promise.all(
        supersededActivityIds
          .filter((activityId) => activityId !== activity.id)
          .map((activityId) => deleteActivityLogInSupabase(activityId))
      );
    } catch {
      // Local state is already updated.
    }
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

    const targetDayKey = alertTargetDayKey(scopeValue, alertDateValue, alertTimeValue);

    const alert: ManualAlert = {
      id: `manual-alert-${Date.now()}`,
      profileSlug: HEWSTER_PROFILE_SLUG,
      title: clampText(titleValue.trim(), TEXT_LIMITS.shortName),
      message: clampText(messageValue.trim(), TEXT_LIMITS.note),
      scope: scopeValue,
      weekdays: scopeValue === "certain-days" ? alertWeekdaysValue : undefined,
      time: alertTimeValue,
      createdDayKey: targetDayKey,
      resolved: false,
      resolvedAt: null,
      createdAt: new Date().toISOString(),
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

    const targetDayKey = alertTargetDayKey(editingScopeValue, editingAlertDateValue, editingAlertTimeValue);

    const nextAlerts = manualAlerts.map((alert) =>
      alert.id === editingAlertId
        ? {
            ...alert,
            title: clampText(editingTitleValue.trim(), TEXT_LIMITS.shortName),
            message: clampText(editingMessageValue.trim(), TEXT_LIMITS.note),
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
    saveReminderAlertRules(rules, { scope: reminderRulesScope });
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
    const nowIso = new Date().toISOString();
    const nextAlerts = manualAlerts.map((alert) => {
      if (alert.id !== alertId) return alert;
      const repeats = manualAlertRepeats(alert);
      return {
        ...alert,
        resolved: repeats ? false : true,
        resolvedAt: nowIso,
      };
    });

    setManualAlerts(nextAlerts);
    syncStoredAlertBadgeCount(unresolvedAlertCountFor(undefined, undefined, nextAlerts));

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
        <CenteredLoadingIcon className="min-h-screen" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--hewie-bg,#979ca7)] text-zinc-900">
      <div className="content-fade-in mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-24 pt-6">
        <header className="mb-6">
          <div className="flex min-h-[4.5rem] items-center justify-between gap-3">
            <div>
              <PetNotebookTitle href="/hewie" className="text-sm font-bold text-[var(--hewie-active-text,#6d28d9)]" />
              <h1 className="mt-1 text-xl font-bold tracking-tight text-[#3b2832]">Alerts &amp; Reminders</h1>
            </div>
            <PetAvatarMenu shape="tile" />
          </div>
        </header>

        <div data-guide="alerts-reminders" className="mb-4 space-y-4">
        <section className="rounded-3xl bg-[#fff0f1] p-5 text-[#d91f56] shadow-sm ring-1 ring-[#e6c8ce]/80">
          <div className="mb-4 flex items-center gap-2">
            <TriangleAlert className="size-5 text-[#8f1739]" />
            <h2 className="text-lg font-semibold text-[#8f1739]">Care Alerts</h2>
          </div>
          <p className="mb-4 text-sm leading-5 text-[#b71f48]/70">
            Custom alerts for important care notes.
          </p>
          <div className="space-y-3">
            {!showAlertForm ? (
              <Button onClick={() => setShowAlertForm(true)} className="rounded-full bg-[#8f1739] text-white hover:bg-[#7c1431]">Add Care Alert</Button>
            ) : (
              <div className="space-y-3 rounded-2xl bg-white/60 p-3 ring-1 ring-[var(--hewie-ring,#cbd5e1)]">
                <input
                  value={titleValue}
                  onChange={(event) => setTitleValue(clampText(event.target.value, TEXT_LIMITS.shortName))}
                  maxLength={TEXT_LIMITS.shortName}
                  placeholder="Care alert title"
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
                  onChange={(event) => setMessageValue(event.target.value.slice(0, 100))}
                  maxLength={100}
                  rows={3}
                  placeholder="Care alert details / message for myself and other caretakers"
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--hewie-accent,#64748b)] focus:ring-4 focus:ring-[var(--hewie-ring,#cbd5e1)]/45"
                />
                {newAlertError ? <p className="text-sm font-medium text-[#8f1739]">{newAlertError}</p> : null}
                <div className="flex flex-wrap gap-2">
                  <Button disabled={Boolean(newAlertError)} onClick={addManualAlert} className="rounded-full bg-[#8f1739] text-white hover:bg-[#7c1431] disabled:opacity-45">Save Care Alert</Button>
                  <Button variant="outline" onClick={() => setShowAlertForm(false)} className="rounded-full">Cancel</Button>
                </div>
              </div>
            )}

            {alertCards.length ? (
              <div className="space-y-3 border-t border-[#e6c8ce]/70 pt-3">
                <h3 className="text-sm font-semibold text-[#8f1739]/80">Unresolved Care Alerts</h3>
                {alertCards.map((alert) => {
                  const mealReviewAction = alert.reviewAction?.type === "meal" ? alert.reviewAction : null;
                  const customCareReviewAction = alert.reviewAction?.type === "custom-care" ? alert.reviewAction : null;
                  const reviewPlannedTime = mealReviewAction?.plannedTime ?? (customCareReviewAction ? timeInputValueFromIso(customCareReviewAction.scheduledAt) : "");
                  const showLogTime = activeReviewLogId === alert.id;
                  const reviewActionButtonClass = "h-8 min-w-14 rounded-full px-2.5 text-xs font-semibold";
                  const detailKey = `unresolved-${alert.id}`;
                  const detailsExpanded = Boolean(expandedAlertDetails[detailKey]);
                  const expandedDetail = alert.expandedDetail?.trim();
                  const hasExpandedDetail = Boolean(expandedDetail && expandedDetail !== alert.detail.trim());

                  return (
                    <article
                      key={alert.id}
                      className="rounded-2xl bg-white/80 p-4 ring-1 ring-[#e6c8ce]/75"
                    >
                      <div className="flex items-start gap-3">
                        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[#8f1739]" />
                        <div className="min-w-0 flex-1">
                          <p className="block min-w-0 text-left font-semibold text-[#8f1739]">
                            {alert.title}
                          </p>
                          <p className="mt-1 truncate text-sm leading-5 text-[#b71f48]/70">{alert.detail}</p>
                        </div>
                        {hasExpandedDetail ? (
                          <ExpandDetailsButton
                            expanded={detailsExpanded}
                            className="text-[#8f1739] hover:text-[#7c1431]"
                            onClick={(event) => {
                              event.stopPropagation();
                              setExpandedAlertDetails((current) => ({ ...current, [detailKey]: !current[detailKey] }));
                            }}
                          />
                        ) : null}
                        {alert.kind === "manual" ? (
                          <Button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              resolveManualAlert(alert.id);
                            }}
                            className="h-8 shrink-0 rounded-full bg-[#8f1739] px-3 text-xs text-white hover:bg-[#7c1431]"
                          >
                            Done
                          </Button>
                        ) : null}
                      </div>
                      {hasExpandedDetail ? (
                        <InlineDetails expanded={detailsExpanded} className="mx-auto w-full max-w-[23rem] bg-[#fff0f1]/75 px-4 text-[#8f1739] ring-1 ring-[#e6c8ce]/70">
                          {expandedDetail}
                        </InlineDetails>
                      ) : null}
                      {mealReviewAction || customCareReviewAction ? (
                        <div className={`mt-3 items-center justify-end gap-2 ${showLogTime ? "ml-auto grid w-fit max-w-full grid-cols-[7.75rem_auto_auto]" : "flex"}`} onKeyDown={(event) => event.stopPropagation()}>
                          {showLogTime ? (
                            <label className="min-w-0">
                              <span className="sr-only">Log time</span>
                              <input
                                type="time"
                                value={reviewMealTimeValue(alert.id, reviewPlannedTime)}
                                onClick={(event) => event.stopPropagation()}
                                onChange={(event) => updateReviewMealTime(alert.id, event.target.value)}
                                className="h-10 w-full min-w-0 rounded-full border border-[#8f1739] bg-white px-3 text-sm font-semibold text-[#8f1739] outline-none transition focus:ring-4 focus:ring-[#e6c8ce]/55"
                              />
                            </label>
                          ) : null}
                          {!showLogTime ? (
                            <Button
                              type="button"
                              variant="outline"
                              onClick={(event) => {
                                event.stopPropagation();
                                if (mealReviewAction) {
                                  void resolveReviewMeal(alert.id, mealReviewAction.mealId, "skipped");
                                  return;
                                }

                                if (customCareReviewAction) {
                                  void resolveReviewCustomCare(alert.id, customCareReviewAction, "skipped");
                                }
                              }}
                              className={`${reviewActionButtonClass} border-[#e6c8ce] text-[#d91f56] hover:bg-[#fff0f1]`}
                            >
                              Skip
                            </Button>
                          ) : null}
                          {showLogTime ? (
                            <Button
                              type="button"
                              variant="outline"
                              onClick={(event) => {
                                event.stopPropagation();
                                setActiveReviewLogId((current) => (current === alert.id ? null : current));
                              }}
                              className={`${reviewActionButtonClass} border-[#e6c8ce] text-[#d91f56] hover:bg-[#fff0f1]`}
                            >
                              Cancel
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              if (!showLogTime) {
                                openReviewLogTime(alert.id, reviewPlannedTime);
                                return;
                              }

                              if (mealReviewAction) {
                                void resolveReviewMeal(alert.id, mealReviewAction.mealId, "done");
                                return;
                              }

                              if (customCareReviewAction) {
                                void resolveReviewCustomCare(alert.id, customCareReviewAction, "done");
                              }
                            }}
                            className={`${reviewActionButtonClass} bg-[#8f1739] text-white hover:bg-[#7c1431]`}
                          >
                            {showLogTime ? "Done" : "Log"}
                          </Button>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            ) : null}

            {savedManualAlerts.length ? (
              <div className="space-y-3 border-t border-[var(--hewie-ring,#cbd5e1)]/70 pt-3">
                <h3 className="text-sm font-semibold text-[#8f1739]/80">Saved Care Alerts</h3>
                {savedManualAlerts.map((alert) => {
                  const detailKey = `saved-alert-${alert.id}`;
                  const detailsExpanded = Boolean(expandedAlertDetails[detailKey]);
                  const savedAlertMessage = alert.message.trim();

                  return (
                    <article
                      key={alert.id}
                      role={editingAlertId === alert.id ? undefined : "button"}
                      tabIndex={editingAlertId === alert.id ? undefined : 0}
                      onClick={editingAlertId === alert.id ? undefined : () => startEditingAlert(alert)}
                      onKeyDown={
                        editingAlertId === alert.id
                          ? undefined
                          : (event) => {
                              if (event.key !== "Enter" && event.key !== " ") return;
                              event.preventDefault();
                              startEditingAlert(alert);
                            }
                      }
                      className={`rounded-2xl bg-white/75 p-4 ring-1 ring-[#e6c8ce]/70 ${
                        editingAlertId === alert.id ? "" : "cursor-pointer transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-[#d91f56]/35"
                      }`}
                    >
                      {editingAlertId === alert.id ? (
                        <div className="space-y-3">
                      <input
                        value={editingTitleValue}
                        onChange={(event) => setEditingTitleValue(clampText(event.target.value, TEXT_LIMITS.shortName))}
                        maxLength={TEXT_LIMITS.shortName}
                        placeholder="Care alert title"
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
                        onChange={(event) => setEditingMessageValue(event.target.value.slice(0, 100))}
                        maxLength={100}
                        rows={3}
                        placeholder="Care alert details / message for myself and other caretakers"
                        className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--hewie-accent,#64748b)] focus:ring-4 focus:ring-[var(--hewie-ring,#cbd5e1)]/45"
                      />
                      {editingAlertError ? <p className="text-sm font-medium text-[#8f1739]">{editingAlertError}</p> : null}
                      <div className="grid grid-cols-3 gap-2">
                        <Button disabled={Boolean(editingAlertError)} className="rounded-full bg-[#8f1739] px-2 text-white hover:bg-[#7c1431] disabled:opacity-45" onClick={saveEditedAlert}>Save</Button>
                        <Button variant="outline" className="rounded-full border-[#e6c8ce] px-2 text-[#d91f56] hover:bg-[#fff0f1]" onClick={cancelEditingAlert}>Cancel</Button>
                        <Button variant="outline" className="rounded-full border-[#e6c8ce] px-2 text-[#d91f56] hover:bg-[#fff0f1]" onClick={() => deleteManualAlert(alert.id)}>Delete</Button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="block min-w-0 text-left font-medium text-[#8f1739]">
                            {alert.title}
                          </p>
                          <p className="mt-1 text-sm text-[#b71f48]/70">
                            {alertScopeLabel(alert)}{alert.time ? ` ${formatReminderTime(alert.time)}` : ""}
                          </p>
                          {savedAlertMessage ? <p className="mt-1 truncate text-sm text-[#b71f48]/65">{savedAlertMessage}</p> : null}
                        </div>
                        {savedAlertMessage ? (
                          <ExpandDetailsButton
                            expanded={detailsExpanded}
                            className="shrink-0 text-[#8f1739] hover:text-[#7c1431]"
                            onClick={(event) => {
                              event.stopPropagation();
                              setExpandedAlertDetails((current) => ({ ...current, [detailKey]: !current[detailKey] }));
                            }}
                          />
                        ) : null}
                      </div>
                      {savedAlertMessage ? (
                        <InlineDetails expanded={detailsExpanded} className="mx-auto w-full max-w-[23rem] bg-[#fff0f1]/75 px-4 text-[#8f1739] ring-1 ring-[#e6c8ce]/70">
                          {savedAlertMessage}
                        </InlineDetails>
                      ) : null}
                    </div>
                  )}
                    </article>
                  );
                })}
              </div>
            ) : null}
          </div>
        </section>

        <section className="rounded-3xl bg-white/75 p-5 text-[var(--hewie-active-text,#334155)] shadow-sm ring-1 ring-white/70">
          <div className="mb-4 flex items-center gap-2">
            <Bell className="size-5 text-[var(--hewie-active-text,#334155)]" />
            <h2 className="text-lg font-semibold text-[var(--hewie-active-text,#334155)]">Reminders</h2>
          </div>
          <p className="mb-4 text-sm leading-5 text-[var(--hewie-active-text,#334155)]/65">
            Reminders for tasks that haven&apos;t been logged.
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

            {visibleReminderRules.length ? (
              <div className="space-y-2 border-t border-[var(--hewie-ring,#cbd5e1)]/70 pt-3">
                <h3 className="text-sm font-semibold text-[var(--hewie-active-text,#334155)]/85">Saved Reminders</h3>
                {visibleReminderRules.map((rule) => (
                  <article
                    key={rule.id}
                    role={editingReminderRuleId === rule.id ? undefined : "button"}
                    tabIndex={editingReminderRuleId === rule.id ? undefined : 0}
                    onClick={editingReminderRuleId === rule.id ? undefined : () => startEditingReminderRule(rule)}
                    onKeyDown={
                      editingReminderRuleId === rule.id
                        ? undefined
                        : (event) => {
                            if (event.key !== "Enter" && event.key !== " ") return;
                            event.preventDefault();
                            startEditingReminderRule(rule);
                          }
                    }
                    className={`rounded-2xl bg-white/70 p-4 ring-1 ring-[var(--hewie-ring,#cbd5e1)] ${
                      editingReminderRuleId === rule.id
                        ? ""
                        : "cursor-pointer transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--hewie-active-text,#334155)]/25"
                    }`}
                  >
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
                        <div className="grid grid-cols-3 gap-2">
                          <Button className="rounded-full bg-[var(--hewie-active-text,#334155)] px-2 text-white hover:opacity-90" onClick={saveEditedReminderRule}>Save</Button>
                          <Button variant="outline" className="rounded-full px-2" onClick={cancelEditingReminderRule}>Cancel</Button>
                          <Button variant="outline" className="rounded-full border-[var(--hewie-ring,#cbd5e1)] px-2 text-[var(--hewie-active-text,#334155)] hover:bg-[var(--hewie-active-bg,#f1f5f9)]" onClick={() => deleteReminderRule(rule.id)}>Delete</Button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div>
                          <p className="font-medium text-[var(--hewie-active-text,#334155)]">
                            Remind if {reminderActionLabel(rule.eventType)} not logged by {formatReminderTime(rule.time)}
                          </p>
                          <p className="mt-1 text-sm text-[var(--hewie-active-text,#334155)]/65">Every day</p>
                        </div>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            ) : null}
          </div>
        </section>
        </div>

        <BottomNav alertsCount={alertCards.length} />
      </div>
    </main>
  );
}
