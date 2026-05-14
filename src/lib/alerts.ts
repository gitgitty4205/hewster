import type { ActivityLog, DailyMealState, ManualAlert } from "@/lib/hewster-data";
import type { CareItemKind, CareItemTemplate } from "@/lib/care-settings";
import type { MealTemplate } from "@/lib/meal-templates";

export type ResolvedAlert = {
  id: string;
  kind: "manual" | "reminder";
  title: string;
  detail: string;
  severity: "info" | "warning";
};

export type ReminderAlertEvent = "meal" | "potty" | "supplement" | "medication";
export type ReminderAlertFrequency = "daily";

export type ReminderAlertRule = {
  id: string;
  eventType: ReminderAlertEvent;
  time: string;
  frequency: ReminderAlertFrequency;
  weekdays?: number[];
  createdDayKey?: string;
  active: boolean;
};

export const REMINDER_ALERT_RULES_STORAGE_KEY = "hewster.reminderAlertRules";

export const defaultReminderAlertRules: ReminderAlertRule[] = [
  {
    id: "rule-potty-3pm",
    eventType: "potty",
    time: "15:00",
    frequency: "daily",
    active: true,
  },
];

export function reminderEventLabel(eventType: ReminderAlertEvent) {
  switch (eventType) {
    case "meal":
      return "Meal / Food";
    case "supplement":
      return "Supplement";
    case "medication":
      return "Medication";
    case "potty":
    default:
      return "Potty";
  }
}

export function formatReminderTime(value: string) {
  const [hoursValue, minutesValue] = value.split(":").map(Number);
  if (!Number.isFinite(hoursValue) || !Number.isFinite(minutesValue)) return value;

  const suffix = hoursValue >= 12 ? "PM" : "AM";
  const hours = hoursValue % 12 === 0 ? 12 : hoursValue % 12;
  return `${hours}:${String(minutesValue).padStart(2, "0")} ${suffix}`;
}

export function reminderFrequencyLabel(rule: Pick<ReminderAlertRule, "frequency" | "weekdays">) {
  void rule;
  return "Every Day";
}

function isReminderAlertRuleArray(value: unknown): value is ReminderAlertRule[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        "id" in item &&
        "eventType" in item &&
        "time" in item &&
        "frequency" in item &&
        "active" in item
    )
  );
}

export function loadReminderAlertRules() {
  if (typeof window === "undefined") return defaultReminderAlertRules;

  try {
    const stored = window.localStorage.getItem(REMINDER_ALERT_RULES_STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : null;
    return isReminderAlertRuleArray(parsed)
      ? parsed.map((rule) => ({ ...rule, frequency: "daily" as const, weekdays: undefined }))
      : defaultReminderAlertRules;
  } catch {
    return defaultReminderAlertRules;
  }
}

export function saveReminderAlertRules(rules: ReminderAlertRule[]) {
  window.localStorage.setItem(REMINDER_ALERT_RULES_STORAGE_KEY, JSON.stringify(rules));
}

function parsePlannedTimeToMinutes(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ").toUpperCase();
  const parts = normalized.match(/^(\d{1,2})(?::(\d{2}))?\s?(AM|PM)$/i);
  if (!parts) return null;

  let hours = Number(parts[1]);
  const minutes = Number(parts[2] ?? "0");
  const meridiem = parts[3].toUpperCase();

  if (meridiem === "PM" && hours !== 12) hours += 12;
  if (meridiem === "AM" && hours === 12) hours = 0;

  return hours * 60 + minutes;
}

function nowMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function dayKeyFromDate(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function dateFromDayKey(dayKey: string) {
  const [year, month, day] = dayKey.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function manualAlertAppliesToday(alert: ManualAlert, todayKey: string) {
  const scope = alert.scope ?? "today";
  if (scope === "ongoing") return true;
  if (scope === "certain-days") return (alert.weekdays ?? []).includes(new Date().getDay());
  if (scope === "every-other-day") {
    const startDate = dateFromDayKey(alert.createdDayKey ?? todayKey);
    const todayDate = dateFromDayKey(todayKey);
    if (!startDate || !todayDate) return true;
    const daysSinceStart = Math.floor((todayDate.getTime() - startDate.getTime()) / 86400000);
    return daysSinceStart % 2 === 0;
  }
  return (alert.createdDayKey ?? todayKey) === todayKey;
}

export function resolveAlerts(
  templates: MealTemplate[],
  dailyMealState: DailyMealState[],
  activityLogs: ActivityLog[],
  manualAlerts: ManualAlert[],
  reminderRules: ReminderAlertRule[] = defaultReminderAlertRules,
  careTemplates: CareItemTemplate[] = []
): ResolvedAlert[] {
  const alerts: ResolvedAlert[] = [];
  const stateByMealId = new Map(dailyMealState.map((entry) => [entry.mealId, entry]));
  const currentMinutes = nowMinutes();
  const todayKey = dayKeyFromDate(new Date());

  templates.forEach((meal) => {
    const state = stateByMealId.get(meal.id);
    const plannedMinutes = parsePlannedTimeToMinutes(meal.plannedTime);
    const isLogged = Boolean(state?.actualTime);

    if (!isLogged && plannedMinutes !== null && currentMinutes > plannedMinutes) {
      alerts.push({
        id: `meal-${meal.id}`,
        kind: "reminder",
        title: `${meal.name} is overdue`,
        detail: `Planned for ${meal.plannedTime} and still not logged.`,
        severity: "info",
      });
    }
  });

  reminderRules
    .filter((rule) => rule.active)
    .forEach((rule) => {
      const ruleMinutes = parsePlannedTimeToMinutes(formatReminderTime(rule.time));
      if (ruleMinutes === null || currentMinutes < ruleMinutes) return;

      const hasLoggedActivity = activityLogs.some((activity) => {
        const happened = new Date(activity.happenedAt);
        if (dayKeyFromDate(happened) !== todayKey) return false;
        if (rule.eventType === "potty") return activity.activityType === "pee" || activity.activityType === "poop";
        if (rule.eventType === "meal") return activity.activityType === "food";
        return activity.activityType === rule.eventType;
      });

      const hasFedMeal = dailyMealState.some((meal) => Boolean(meal.actualTime) && (meal.dayKey ?? todayKey) === todayKey);
      const hasMealLinkedCare = ["supplement", "medication"].includes(rule.eventType)
        ? dailyMealState.some((meal) => {
            if (!meal.actualTime || (meal.dayKey ?? todayKey) !== todayKey) return false;
            return careTemplates.some(
              (item) =>
                item.active &&
                item.kind === (rule.eventType as CareItemKind) &&
                item.scheduleKind === "meal" &&
                item.mealIds.includes(meal.mealId) &&
                !(meal.skippedCareItemIds ?? []).includes(`${item.kind}-${item.id}`)
            );
          })
        : false;

      const hasEvent = rule.eventType === "meal" ? hasFedMeal || hasLoggedActivity : hasLoggedActivity || hasMealLinkedCare;

      if (hasEvent) return;

      alerts.push({
        id: `reminder-${rule.id}`,
        kind: "reminder",
        title: `No ${reminderEventLabel(rule.eventType).toLowerCase()} logged by ${formatReminderTime(rule.time)}`,
        detail: `Everyday check-in: log it when it happens.`,
        severity: "info",
      });
    });

  manualAlerts
    .filter((alert) => {
      if (alert.resolved) return false;
      return manualAlertAppliesToday(alert, todayKey);
    })
    .filter((alert) => {
      if (!alert.time) return true;
      const alertMinutes = parsePlannedTimeToMinutes(formatReminderTime(alert.time));
      return alertMinutes === null || currentMinutes >= alertMinutes;
    })
    .forEach((alert) => {
      alerts.push({
        id: alert.id,
        kind: "manual",
        title: alert.title,
        detail: [alert.time ? formatReminderTime(alert.time) : null, alert.message].filter(Boolean).join(" • "),
        severity: "info",
      });
    });

  return alerts;
}
