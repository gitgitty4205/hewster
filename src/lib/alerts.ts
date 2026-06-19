import type { ActivityLog, DailyMealState, ManualAlert } from "@/lib/hewster-data";
import { careItemOccursWithMeal, customScheduledCareItems, type CareItemKind, type CareItemTemplate } from "@/lib/care-settings";
import { formatActivityTime } from "@/lib/activity";
import { isMealTemplateActiveForDay, type MealTemplate } from "@/lib/meal-templates";
import { getActiveProfileSlug, UNSCOPED_PROFILE_SLUG } from "@/lib/supabase";

export type ResolvedAlert = {
  id: string;
  kind: "manual" | "reminder" | "review";
  title: string;
  detail: string;
  expandedDetail?: string;
  severity: "info" | "warning";
  eventType?: ReminderAlertEvent;
  reviewAction?:
    | { type: "meal"; mealId: number; plannedTime: string }
    | { type: "custom-care"; occurrenceKey: string; scheduledAt: string; item: CareItemTemplate };
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
export const ALERT_BADGE_COUNT_STORAGE_KEY = "hewster.alertBadgeCount";
const DUE_REVIEW_GRACE_MINUTES = 60;

function normalizeAlertDisplayText(value: string) {
  return value
    .toLowerCase()
    .replace(/^meal:\s*.+\s+at\s+/g, "")
    .replace(/\b(planned|scheduled)\s+(?:with\s+.+?\s+)?(?:for|at)\s+/g, "")
    .replace(/^meal:\s*/g, "")
    .replace(/[.:]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function alertDetailLines(value?: string) {
  return value?.split("\n").map((line) => line.trim()).filter(Boolean) ?? [];
}

function isDuplicateAlertDetailLine(line: string, visibleLines: Set<string>) {
  const normalizedLine = normalizeAlertDisplayText(line);
  return Boolean(normalizedLine && visibleLines.has(normalizedLine));
}

export function alertExpandedDetail(alert: Pick<ResolvedAlert, "title" | "detail" | "expandedDetail">) {
  const visibleLines = new Set(
    [alert.title, ...alertDetailLines(alert.detail)]
      .map(normalizeAlertDisplayText)
      .filter(Boolean)
  );
  const uniqueLines = alertDetailLines(alert.expandedDetail).filter((line) => !isDuplicateAlertDetailLine(line, visibleLines));

  return uniqueLines.length ? uniqueLines.join("\n") : undefined;
}

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

const manualAlertWeekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatManualAlertDate(dayKey?: string) {
  if (!dayKey) return "Selected Date";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(`${dayKey}T00:00:00`));
}

export function manualAlertScheduleLabel(alert: Pick<ManualAlert, "scope" | "weekdays" | "time" | "createdDayKey">) {
  const scope = alert.scope ?? "today";
  const schedule =
    scope === "ongoing"
      ? "Everyday"
      : scope === "every-other-day"
        ? "Every Other Day"
        : scope === "certain-days"
          ? (alert.weekdays?.length ? alert.weekdays.map((day) => manualAlertWeekdayLabels[day]).filter(Boolean).join(", ") : "Certain Days")
          : scope === "tomorrow"
            ? "Tomorrow"
            : scope === "date"
              ? formatManualAlertDate(alert.createdDayKey)
              : "Today";

  return [schedule, alert.time ? `at ${formatReminderTime(alert.time)}` : null].filter(Boolean).join(" ");
}

export function formatManualAlertTimelineDetail(alert: Pick<ManualAlert, "title" | "message" | "scope" | "weekdays" | "time" | "createdDayKey">) {
  const summary = [alert.title, alert.message].filter(Boolean).join(": ");
  return [summary, manualAlertScheduleLabel(alert)].filter(Boolean).join("\n");
}

export function reminderFrequencyLabel(rule: Pick<ReminderAlertRule, "frequency" | "weekdays">) {
  void rule;
  return "Every day";
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

function normalizeReminderAlertRules(rules: ReminderAlertRule[]) {
  return rules.map((rule) => ({ ...rule, frequency: "daily" as const, weekdays: undefined }));
}

function sanitizeStoragePart(value: string) {
  return value.replace(/[^a-z0-9_-]/gi, "-");
}

function reminderAlertRulesStorageKey(ownerId?: string | null, profileSlug = getActiveProfileSlug()) {
  return `${REMINDER_ALERT_RULES_STORAGE_KEY}.${sanitizeStoragePart(ownerId || "anon")}.${sanitizeStoragePart(profileSlug)}`;
}

function parseStoredReminderAlertRules(storageKey: string) {
  const stored = window.localStorage.getItem(storageKey);
  if (!stored) return null;

  const parsed = JSON.parse(stored);
  if (!isReminderAlertRuleArray(parsed)) return null;

  return normalizeReminderAlertRules(parsed);
}

function tryParseStoredReminderAlertRules(storageKey: string) {
  try {
    return parseStoredReminderAlertRules(storageKey);
  } catch {
    return null;
  }
}

function migrateLegacyReminderAlertRules(storageKey: string) {
  const legacyStorageKeys = [
    REMINDER_ALERT_RULES_STORAGE_KEY,
    `${REMINDER_ALERT_RULES_STORAGE_KEY}.hewie`,
    `${REMINDER_ALERT_RULES_STORAGE_KEY}.default`,
  ];
  const existingRules = tryParseStoredReminderAlertRules(storageKey);
  if (!existingRules?.length) {
    const migratedRules = new Map<string, ReminderAlertRule>();
    for (const legacyStorageKey of legacyStorageKeys) {
      const legacyRules = tryParseStoredReminderAlertRules(legacyStorageKey) ?? [];
      legacyRules.forEach((rule) => {
        if (rule.id === "rule-potty-3pm") return;
        migratedRules.set(rule.id, rule);
      });
    }

    if (migratedRules.size) {
      window.localStorage.setItem(storageKey, JSON.stringify([...migratedRules.values()]));
    }
  }

  for (const legacyStorageKey of legacyStorageKeys) {
    window.localStorage.removeItem(legacyStorageKey);
  }
}

function migrateUnscopedReminderAlertRules(storageKey: string, ownerId?: string | null, profileSlug = getActiveProfileSlug()) {
  if (!ownerId || profileSlug === UNSCOPED_PROFILE_SLUG) return;
  const unscopedStorageKey = reminderAlertRulesStorageKey(ownerId, UNSCOPED_PROFILE_SLUG);
  if (unscopedStorageKey === storageKey) return;

  const existingRules = tryParseStoredReminderAlertRules(storageKey);
  if (existingRules?.length) return;

  const unscopedRules = tryParseStoredReminderAlertRules(unscopedStorageKey) ?? [];
  if (!unscopedRules.length) return;

  window.localStorage.setItem(storageKey, JSON.stringify(unscopedRules));
  window.localStorage.removeItem(unscopedStorageKey);
}

type ReminderAlertRulesStorageOptions = {
  ownerId?: string | null;
  profileSlug?: string;
};

export function loadReminderAlertRules(options: ReminderAlertRulesStorageOptions = {}) {
  if (typeof window === "undefined") return [];

  try {
    const profileSlug = options.profileSlug ?? getActiveProfileSlug();
    const storageKey = reminderAlertRulesStorageKey(options.ownerId, profileSlug);
    migrateUnscopedReminderAlertRules(storageKey, options.ownerId, profileSlug);
    migrateLegacyReminderAlertRules(storageKey);
    return parseStoredReminderAlertRules(storageKey) ?? [];
  } catch {
    return [];
  }
}

export function saveReminderAlertRules(rules: ReminderAlertRule[], options: ReminderAlertRulesStorageOptions = {}) {
  window.localStorage.setItem(reminderAlertRulesStorageKey(options.ownerId, options.profileSlug), JSON.stringify(rules));
}

function parsePlannedTimeToMinutes(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ").toUpperCase();

  const twentyFourHourParts = normalized.match(/^(\d{1,2})(?::(\d{2}))(?::\d{2})?$/);
  if (twentyFourHourParts) {
    const hours = Number(twentyFourHourParts[1]);
    const minutes = Number(twentyFourHourParts[2]);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) return hours * 60 + minutes;
    return null;
  }

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

function dateTimeForDayMinutes(dayKey: string, minutes: number) {
  const date = dateFromDayKey(dayKey) ?? new Date();
  date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return date;
}

function dateFromDateTimeLocal(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function sameScheduledMinute(first: Date, second: Date) {
  return Math.abs(first.getTime() - second.getTime()) < 60 * 1000;
}

function careScheduleSteps(item: CareItemTemplate) {
  const steps = item.scheduleSteps.length ? item.scheduleSteps : [{ id: 1, everyHours: item.repeatEveryHours, forDays: item.repeatForDays }];

  return steps
    .map((step) => ({
      everyHours: Number.parseInt(step.everyHours, 10),
      forDays: Number.parseInt(step.forDays, 10),
    }))
    .filter((step) => {
      const hasFrequency = Number.isFinite(step.everyHours) && step.everyHours > 0;
      if (item.ongoing || item.asNeeded) return hasFrequency;
      return hasFrequency && Number.isFinite(step.forDays) && step.forDays > 0;
    });
}

function customCareOccurrencesForDay(items: CareItemTemplate[], targetDayKey: string) {
  return customScheduledCareItems(items).flatMap((item) => {
    if (item.asNeeded) return [];

    const startAt = dateFromDateTimeLocal(item.startDateTime);
    if (!startAt) return [];

    const scheduleCreatedAt = dateFromDateTimeLocal(item.customScheduleCreatedAt) ?? startAt;
    const [year, month, day] = targetDayKey.split("-").map(Number);
    const dayStart = new Date(year, month - 1, day);
    const dayEnd = new Date(year, month - 1, day + 1);

    const steps = careScheduleSteps(item);
    if (item.ongoing && !steps.length) {
      const scheduledAt = new Date(year, month - 1, day, startAt.getHours(), startAt.getMinutes(), 0, 0);
      if (scheduledAt < dayStart || scheduledAt >= dayEnd || scheduledAt < startAt) return [];

      return [
        {
          key: `${item.kind}-${item.id}-schedule-daily-${scheduledAt.toISOString()}`,
          item,
          scheduledAt,
        },
      ];
    }

    const effectiveSteps = steps.length || item.ongoing
      ? steps
      : [{ everyHours: 0, forDays: 0 }];

    return effectiveSteps.flatMap((step, stepIndex) => {
      const isOneTime = step.everyHours <= 0;
      const maxDoseCount = item.ongoing ? Number.POSITIVE_INFINITY : isOneTime ? 1 : Math.ceil((step.forDays * 24) / step.everyHours);
      const firstOffset = isOneTime ? 0 : Math.max(0, Math.ceil((dayStart.getTime() - startAt.getTime()) / (step.everyHours * 60 * 60 * 1000)));
      const occurrences: Array<{ key: string; item: CareItemTemplate; scheduledAt: Date }> = [];

      for (let doseIndex = firstOffset; doseIndex < maxDoseCount; doseIndex += 1) {
        const scheduledAt = new Date(startAt.getTime() + doseIndex * step.everyHours * 60 * 60 * 1000);
        if (scheduledAt >= dayEnd) break;
        const explicitStartDose = sameScheduledMinute(scheduledAt, startAt);
        if (scheduledAt < dayStart || (!explicitStartDose && scheduledAt < scheduleCreatedAt)) continue;

        occurrences.push({
          key: `${item.kind}-${item.id}-schedule-${stepIndex + 1}-dose-${doseIndex + 1}-${scheduledAt.toISOString()}`,
          item,
          scheduledAt,
        });
      }

      return occurrences;
    });
  });
}

function activityMatchesCustomCareOccurrence(activity: ActivityLog, occurrence: { item: CareItemTemplate; scheduledAt: Date }) {
  if (activity.activityType !== occurrence.item.kind) return false;

  const activityAt = new Date(activity.happenedAt);
  if (Number.isNaN(activityAt.getTime())) return false;

  const detail = activity.detail ?? "";
  if (!detail.toLowerCase().startsWith(occurrence.item.name.toLowerCase())) return false;

  const sameScheduledMinute = Math.abs(activityAt.getTime() - occurrence.scheduledAt.getTime()) < 60 * 1000;
  if (sameScheduledMinute) return true;

  const sameDay = dayKeyFromDate(activityAt) === dayKeyFromDate(occurrence.scheduledAt);
  const singleDailyOngoingOccurrence = occurrence.item.ongoing && careScheduleSteps(occurrence.item).length === 0;
  return sameDay && singleDailyOngoingOccurrence;
}

function activityMatchesMealLinkedCare(activity: ActivityLog, item: CareItemTemplate, mealAt: Date) {
  if (activity.activityType !== item.kind) return false;

  const activityAt = new Date(activity.happenedAt);
  if (Number.isNaN(activityAt.getTime())) return false;
  if (dayKeyFromDate(activityAt) !== dayKeyFromDate(mealAt)) return false;

  const detail = (activity.detail ?? "").toLowerCase();
  return detail.startsWith(item.name.toLowerCase());
}

function dateFromDayKey(dayKey: string) {
  const [year, month, day] = dayKey.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function manualAlertAppliesToday(alert: ManualAlert, todayKey: string) {
  const scope = alert.scope ?? "today";
  const startDayKey = alert.createdDayKey ?? todayKey;
  if (todayKey < startDayKey) return false;
  if (scope === "ongoing") return true;
  if (scope === "certain-days") return (alert.weekdays ?? []).includes(new Date().getDay());
  if (scope === "every-other-day") {
    const startDate = dateFromDayKey(startDayKey);
    const todayDate = dateFromDayKey(todayKey);
    if (!startDate || !todayDate) return true;
    const daysSinceStart = Math.floor((todayDate.getTime() - startDate.getTime()) / 86400000);
    return daysSinceStart >= 0 && daysSinceStart % 2 === 0;
  }
  return startDayKey === todayKey;
}

function manualAlertRepeats(alert: ManualAlert) {
  return ["ongoing", "every-other-day", "certain-days"].includes(alert.scope ?? "today");
}

function manualAlertResolvedForToday(alert: ManualAlert, todayKey: string) {
  if (!manualAlertRepeats(alert) || !alert.resolvedAt) return false;
  return dayKeyFromDate(new Date(alert.resolvedAt)) === todayKey;
}

function manualAlertCreatedAfterScheduledTime(alert: ManualAlert, todayKey: string) {
  if (!manualAlertRepeats(alert) || !alert.createdAt || !alert.time) return false;
  const createdAt = new Date(alert.createdAt);
  if (Number.isNaN(createdAt.getTime()) || dayKeyFromDate(createdAt) !== todayKey) return false;
  const alertMinutes = parsePlannedTimeToMinutes(alert.time);
  if (alertMinutes === null) return false;
  return createdAt.getHours() * 60 + createdAt.getMinutes() > alertMinutes;
}

function careTypeLabel(item: CareItemTemplate) {
  if (item.kind === "supplement" && item.scheduleKind === "meal") return null;
  if (item.medicationType === "topical") return "Topical";
  if (item.medicationType === "injection") return "Injection";
  if (item.medicationType === "other") return "Other";
  return null;
}

function careItemGiveText(item: CareItemTemplate) {
  const route = careTypeLabel(item);
  return [item.dose.trim(), route ? `(${route})` : ""].filter(Boolean).join(" ");
}

function customCareTimingLabel(item: CareItemTemplate) {
  if (item.medicationType !== "oral") return null;
  return item.customTiming === "empty-stomach" ? "Empty Stomach" : "With Food";
}

function customCareFrequencyText(item: CareItemTemplate) {
  const steps = careScheduleSteps(item);
  if (steps.length > 1) return `${steps.length} Schedules`;
  if (!steps[0]) return item.ongoing ? null : "Schedule Needed";
  if (item.ongoing) return `Every ${steps[0].everyHours} hours • Ongoing`;
  if (item.asNeeded) return `Every ${steps[0].everyHours} hours, As Needed`;
  return `Every ${steps[0].everyHours} hours for ${steps[0].forDays} days`;
}

function careItemExpandedDetail(item: CareItemTemplate, scheduleLine?: string) {
  const giveText = careItemGiveText(item);
  const timingLabel = item.scheduleKind === "custom" ? customCareTimingLabel(item) : null;
  const frequencyText = item.scheduleKind === "custom" ? customCareFrequencyText(item) : null;

  return [
    scheduleLine ?? null,
    giveText ? `Give: ${giveText}` : null,
    timingLabel,
    frequencyText,
    item.notes.trim() ? `Notes: ${item.notes.trim()}` : null,
  ].filter(Boolean).join("\n");
}

function mealCareGroupLabel() {
  return "Supplements";
}

function mealExpandedDetail(meal: MealTemplate, templates: MealTemplate[], todayKey: string, careTemplates: CareItemTemplate[]) {
  const mealCareItems = careTemplates
    .filter((item) => careItemOccursWithMeal(item, meal, templates, todayKey))
    .map((item) => {
      const giveText = careItemGiveText(item);
      const notes = item.notes.trim();
      return [item.name, giveText, notes].filter(Boolean).join(" — ");
    });

  return [
    meal.food.trim() ? `Food: ${meal.food.trim()}` : null,
    meal.notes.trim() ? `Notes: ${meal.notes.trim()}` : null,
    mealCareItems.length ? `${mealCareGroupLabel()}: ${mealCareItems.join("; ")}` : null,
  ].filter(Boolean).join("\n");
}

export function resolveAlerts(
  templates: MealTemplate[],
  dailyMealState: DailyMealState[],
  activityLogs: ActivityLog[],
  manualAlerts: ManualAlert[],
  reminderRules: ReminderAlertRule[] = [],
  careTemplates: CareItemTemplate[] = []
): ResolvedAlert[] {
  const alerts: ResolvedAlert[] = [];
  const stateByMealId = new Map(dailyMealState.map((entry) => [entry.mealId, entry]));
  const currentMinutes = nowMinutes();
  const todayKey = dayKeyFromDate(new Date());
  const activeMealTemplates = templates.filter((meal) => isMealTemplateActiveForDay(meal, todayKey));

  const pushMealLinkedCareReviewAlerts = (meal: MealTemplate, mealAt: Date, skippedCareItemIds: string[] = [], mealLogged = false) => {
    careTemplates
      .filter((item) => item.scheduleKind === "meal" && careItemOccursWithMeal(item, meal, activeMealTemplates, todayKey))
      .forEach((item) => {
        const occurrenceKey = `${item.kind}-${item.id}-meal-${meal.id}-${todayKey}`;
        if (skippedCareItemIds.includes(`${item.kind}-${item.id}`)) return;
        if (mealLogged) return;

        const hasResolvedActivity = activityLogs.some(
          (activity) =>
            activity.id === occurrenceKey ||
            activity.id === `${occurrenceKey}-skipped` ||
            (
              !/\bMissed\b/i.test(activity.detail ?? "") &&
              (
                activityMatchesCustomCareOccurrence(activity, { item, scheduledAt: mealAt }) ||
                activityMatchesMealLinkedCare(activity, item, mealAt)
              )
            )
        );
        if (hasResolvedActivity) return;

        alerts.push({
          id: `review-${occurrenceKey}`,
          kind: "review",
          title: `${item.name} missing`,
          detail: `Scheduled with ${meal.name} at ${meal.plannedTime}.`,
          expandedDetail: careItemExpandedDetail(item, `Meal: ${meal.name} at ${meal.plannedTime}`),
          severity: "warning",
          reviewAction: {
            type: "custom-care",
            occurrenceKey,
            scheduledAt: mealAt.toISOString(),
            item,
          },
        });
      });
  };

  activeMealTemplates.forEach((meal) => {
    const state = stateByMealId.get(meal.id);
    const plannedMinutes = parsePlannedTimeToMinutes(meal.plannedTime);
    const isLogged = Boolean(state?.actualTime);

    if (!isLogged && plannedMinutes !== null && currentMinutes > plannedMinutes) {
      const plannedAt = dateTimeForDayMinutes(todayKey, plannedMinutes);
      const needsReview = Date.now() - plannedAt.getTime() > DUE_REVIEW_GRACE_MINUTES * 60 * 1000;

      alerts.push({
        id: `meal-${meal.id}`,
        kind: needsReview ? "review" : "reminder",
        title: needsReview ? `${meal.name} missing` : `${meal.name} is overdue`,
        detail: `Planned for ${meal.plannedTime}.`,
        expandedDetail: mealExpandedDetail(meal, activeMealTemplates, todayKey, careTemplates) || `Planned for ${meal.plannedTime}.`,
        severity: needsReview ? "warning" : "info",
        reviewAction: needsReview ? { type: "meal", mealId: meal.id, plannedTime: meal.plannedTime } : undefined,
      });

      return;
    }

    if (!isLogged || plannedMinutes === null) return;

    const loggedTimeMinutes = state?.actualTime ? parsePlannedTimeToMinutes(state.actualTime) : null;
    const mealAt = dateTimeForDayMinutes(todayKey, loggedTimeMinutes ?? plannedMinutes);
    const needsCareReview = Date.now() - mealAt.getTime() > DUE_REVIEW_GRACE_MINUTES * 60 * 1000;
    if (!needsCareReview) return;

    pushMealLinkedCareReviewAlerts(meal, mealAt, state?.skippedCareItemIds ?? [], true);
  });

  customCareOccurrencesForDay(careTemplates, todayKey).forEach((occurrence) => {
    if (Date.now() - occurrence.scheduledAt.getTime() <= DUE_REVIEW_GRACE_MINUTES * 60 * 1000) return;

    const hasResolvedActivity = activityLogs.some((activity) => activity.id === occurrence.key || activity.id === `${occurrence.key}-skipped` || (!/\bMissed\b/i.test(activity.detail ?? "") && activityMatchesCustomCareOccurrence(activity, occurrence)));
    if (hasResolvedActivity) return;

    alerts.push({
      id: `review-${occurrence.key}`,
      kind: "review",
      title: `${occurrence.item.name} missing`,
      detail: `Scheduled for ${formatActivityTime(occurrence.scheduledAt.toISOString())}.`,
      expandedDetail: careItemExpandedDetail(occurrence.item),
      severity: "warning",
      reviewAction: {
        type: "custom-care",
        occurrenceKey: occurrence.key,
        scheduledAt: occurrence.scheduledAt.toISOString(),
        item: occurrence.item,
      },
    });
  });

  reminderRules
    .filter((rule) => rule.active)
    .forEach((rule) => {
      const ruleMinutes = parsePlannedTimeToMinutes(rule.time);
      if (ruleMinutes === null || currentMinutes < ruleMinutes) return;

      const hasLoggedActivity = activityLogs.some((activity) => {
        const happened = new Date(activity.happenedAt);
        if (dayKeyFromDate(happened) !== todayKey) return false;
        if (rule.eventType === "potty") return activity.activityType === "potty" || activity.activityType === "pee" || activity.activityType === "poop";
        if (rule.eventType === "meal") return activity.activityType === "food";
        return activity.activityType === rule.eventType;
      });

      const hasFedMeal = dailyMealState.some((meal) => Boolean(meal.actualTime) && (meal.dayKey ?? todayKey) === todayKey);
      const hasMealLinkedCare = rule.eventType === "supplement"
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
        eventType: rule.eventType,
      });
    });

  manualAlerts
    .filter((alert) => {
      if (alert.resolved) return false;
      if (manualAlertResolvedForToday(alert, todayKey)) return false;
      if (manualAlertCreatedAfterScheduledTime(alert, todayKey)) return false;
      return manualAlertAppliesToday(alert, todayKey);
    })
    .filter((alert) => {
      if (!alert.time) return true;
      const alertMinutes = parsePlannedTimeToMinutes(alert.time);
      return alertMinutes !== null && currentMinutes >= alertMinutes;
    })
    .forEach((alert) => {
      const scheduleDetail = alert.time ? formatReminderTime(alert.time) : manualAlertScheduleLabel(alert);
      alerts.push({
        id: alert.id,
        kind: "manual",
        title: alert.title,
        detail: scheduleDetail,
        expandedDetail: alert.message.trim() || undefined,
        severity: "info",
      });
    });

  return alerts;
}
