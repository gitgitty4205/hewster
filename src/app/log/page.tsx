"use client";



import { Check, ChevronDown, Clock3, History, Tablets } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";



import { ActivityDetailForm } from "@/components/activity-detail-form";

import { ActivityFeed } from "@/components/activity-feed";

import { BottomNav } from "@/components/bottom-nav";
import { Button } from "@/components/ui/button";
import { CenteredLoadingIcon } from "@/components/centered-loading-icon";
import { ExpandableNoteText } from "@/components/expandable-note-text";
import { EmojiAsset } from "@/components/emoji-asset";
import { PetAvatarMenu } from "@/components/pet-avatar-menu";

import { MealTimeForm } from "@/components/meal-time-form";

import { QuickLogCard } from "@/components/quick-log-card";

import { MedicationPillIcon } from "@/components/medication-pill-icon";

import {

  ACTIVITY_LOGS_STORAGE_KEY,

  currentTodayKey,

  deleteActivityLogInSupabase,
  deleteMealLogInSupabase,

  type ActivityLog,

  type ActivityType,

  type DailyMealState,

  type MealLog,
  type MealTemplateAuditSnapshot,

  MEAL_LOGS_STORAGE_KEY,
  activeProfileStorageKey,

  loadAppState,
  loadNotebookEntryPermissions,
  mealTemplatesForHistoryDay,
  persistDailyMealStateLocally,
  activityAttachmentFileNamesForSave,
  saveDailyMealsToSupabase,

  saveCompletedMealToSupabase,

  saveActivityLogToSupabase,
  saveActivityAttachmentsToSupabase,

  updateActivityLogInSupabase,

} from "@/lib/hewster-data";

import { compareActivitiesReverseChronological, formatActivityLabel, formatActivityTime, renderActivityDetail, renderHealthTimelineActivityDetail, savedHealthMedicationShortcutNotes, savedWellnessSupplementShortcutNotes } from "@/lib/activity";

import { initialTemplates, isMealTemplateActiveForDay, type MealStatus, type MealTemplate } from "@/lib/meal-templates";

import { careItemsForMeal, customScheduledCareItems, loadCareTemplates, loadCareTemplatesFromSupabase, mealPlanDoseNumberForMeal, mealPlanTotalDoseCount, type CareItemKind, type CareItemTemplate } from "@/lib/care-settings";

import { getActiveProfileSlug, isSupabaseConfigured } from "@/lib/supabase";
import { PetNotebookTitle } from "@/components/pet-notebook-title";
import {
  FREE_MEDICAL_ATTACHMENT_USE_LIMIT,
  FREE_POTTY_IMAGE_USE_LIMIT,
  activityAttachmentCounts,
  loadStoredSubscriptionPlan,
  type SubscriptionPlanId,
} from "@/lib/subscription-plan";



function nowForTimeInput() {

  return new Intl.DateTimeFormat("en-CA", {

    hour: "2-digit",

    minute: "2-digit",

    hour12: false,

  }).format(new Date());

}

function firstNonBlankTime(...values: Array<string | null | undefined>) {
  return values.map((value) => value?.trim()).find(Boolean) ?? null;
}



function toTimeInputValue(isoString: string) {

  return new Intl.DateTimeFormat("en-CA", {

    hour: "2-digit",

    minute: "2-digit",

    hour12: false,

  }).format(new Date(isoString));

}



function isValidDayKey(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime()) && currentTodayKeyFromDate(date) === value;
}

function initialLogDayKey() {
  if (typeof window === "undefined") return currentTodayKey();

  const requestedDay = new URLSearchParams(window.location.search).get("date");
  return requestedDay && isValidDayKey(requestedDay) && requestedDay <= currentTodayKey()
    ? requestedDay
    : currentTodayKey();
}

function mergeMealStateForEditing(currentState: DailyMealState[], historicalState: DailyMealState[] | undefined, fallbackDayKey: string) {
  const mealStateByKey = new Map<string, DailyMealState>();

  [...(historicalState ?? []), ...currentState].forEach((meal) => {
    const dayKey = meal.dayKey ?? fallbackDayKey;
    mealStateByKey.set(`${dayKey}-${meal.mealId}`, { ...meal, dayKey });
  });

  return [...mealStateByKey.values()];
}

function LogPencilIcon() {
  return (
    <span className="flex size-5 items-center justify-center text-[var(--hewie-accent-text)]/88">
      <svg
        className="size-full"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.75"
        aria-hidden="true"
      >
        <path d="M5.2 18.8 6.4 14 15.8 4.6a2 2 0 0 1 2.8 0l.8.8a2 2 0 0 1 0 2.8L10 17.6l-4.8 1.2Z" />
        <path d="m14.3 6.1 3.6 3.6" />
        <path d="m6.4 14 3.6 3.6" />
      </svg>
    </span>
  );
}

function LogTitle() {
  return (
    <span className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--hewie-accent-text)]/10 px-3.5 py-1.5 text-[var(--hewie-accent-text)]/92 shadow-[0_1px_5px_rgba(15,23,42,0.12),0_1px_2px_rgba(255,255,255,0.18)_inset] ring-1 ring-[var(--hewie-accent-text)]/18 drop-shadow-[0_1px_1px_rgba(15,23,42,0.14)]">
      <LogPencilIcon />
      <span className="font-semibold">Log</span>
    </span>
  );
}

function currentTodayKeyFromDate(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatLogDayLabel(dayKey: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${dayKey}T00:00:00`));
}

function mergeDayWithTime(dayKey: string, timeValue: string) {

  const [hours, minutes] = timeValue.split(":").map(Number);

  const now = new Date(`${dayKey}T00:00:00`);

  now.setHours(hours, minutes, 0, 0);

  return now.toISOString();

}

function attachmentDocumentTypesForActivity(activityType: ActivityType) {
  return activityType === "poop" || activityType === "potty" ? ["Potty Image"] : ["Medical Attachment"];
}



const generatedCareNoteValues = new Set(["With Food", "Empty Stomach", "Oral", "Topical", "Injection", "Other"]);



function isCareActivityType(activityType: ActivityType) {

  return activityType === "medication" || activityType === "supplement";

}



function careStatusFromActivity(activity: ActivityLog) {

  const detail = activity.detail ?? "";

  const notes = activity.notes ?? "";

  if (/\bSkipped\b/i.test(detail) || notes.includes("Skip Note: ")) return "Skipped";

  if (/\bMissed\b/i.test(detail)) return "Missed";

  return "Given";

}



function careNameFromDetail(detail: string | null) {

  return (detail ?? "").replace(/\s*(?:[•·-]\s*)?(Given|Skipped|Missed)\b/i, "").trim();

}

function careTemplateForActivity(activity: ActivityLog, careTemplates: CareItemTemplate[]) {

  if (!isCareActivityType(activity.activityType)) return null;

  const detailName = careNameFromDetail(activity.detail).toLowerCase();

  return careTemplates.find((item) => {
    if (item.kind !== activity.activityType) return false;
    if (activity.id.includes(`${item.kind}-${item.id}-`)) return true;

    const itemName = item.name.trim().toLowerCase();
    return Boolean(itemName && detailName && detailName.includes(itemName));
  }) ?? null;

}



function editableActivityNoteText(notes: string | null) {

  return notes?.split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("Attachments: ") && !line.startsWith("Record Tags: "))
    .join("\n") ?? "";

}



function editableCareNoteText(notes: string | null, planNotes = "") {

  const lines = notes?.split("\n").map((line) => line.trim()).filter(Boolean) ?? [];
  const normalizedPlanNotes = planNotes.trim();
  const normalizeEditableNote = (line: string) => line.replace(/^(?:Plan\s+)?Notes:\s*/i, "").trim();

  const skipNote = lines.find((line) => line.startsWith("Skip Note: "))?.replace("Skip Note: ", "").trim();

  if (skipNote) {
    const normalizedSkipNote = normalizeEditableNote(skipNote);
    return normalizedPlanNotes && normalizedSkipNote === normalizedPlanNotes ? "" : normalizedSkipNote;
  }



  const explicitNotes = lines
    .filter((line) => line.startsWith("Notes: "))
    .map(normalizeEditableNote)
    .filter((line) => line !== normalizedPlanNotes);

  if (explicitNotes.length) return explicitNotes.join("\n");



  return lines

    .filter((line) => {

      if (line.startsWith("Give ")) return false;

      if (line.startsWith("Every ") || line.endsWith("Schedules")) return false;

      if (generatedCareNoteValues.has(line)) return false;

      if (line.startsWith("Plan Notes: ")) return false;

      if (normalizedPlanNotes && line === normalizedPlanNotes) return false;

      if (line.startsWith("Attachments: ") || line.startsWith("Record Tags: ")) return false;

      return true;

    })

    .join("\n");

}



function careNotesForSave(originalNotes: string | null, status: string, editableNotes: string, recordTagNote: string, attachmentNote: string, planNotes = "") {

  const normalizedPlanNotes = planNotes.trim();
  const preserved = originalNotes?.split("\n").map((line) => line.trim()).filter((line) => {

    if (!line) return false;

    if (line.startsWith("Skip Note: ") || line.startsWith("Plan Notes: ")) return false;

    if (line.startsWith("Notes: ")) return false;

    if (line.startsWith("Attachments: ") || line.startsWith("Record Tags: ")) return false;

    return true;

  }) ?? [];

  const trimmedNotes = editableNotes.trim();

  const planNote = normalizedPlanNotes ? `Plan Notes: ${normalizedPlanNotes}` : "";

  const userNote = trimmedNotes ? (status === "Skipped" ? `Skip Note: ${trimmedNotes}` : `Notes: ${trimmedNotes}`) : "";

  return [preserved.join("\n"), planNote, userNote, recordTagNote, attachmentNote].filter(Boolean).join("\n") || null;

}



function careDetailForSave(originalDetail: string | null, status: string) {

  const name = careNameFromDetail(originalDetail);

  if (status === "Given") return name || "Medication";

  if (!name && !["Skipped", "Missed"].includes(status)) return status;

  return `${name || "Medication"} ${status}`;

}



function isMissedMealLog(meal: MealLog) {
  return meal.fedNotes === "Missed" || meal.id.endsWith("-missed");
}

function isSkippedMealLog(meal: MealLog) {
  return meal.fedNotes === "Skipped";
}

function statusClasses(status: MealStatus) {
  switch (status) {
    case "done":
      return "bg-[#8a5a35]/12 text-[#6b3f22] ring-1 ring-[#d8b895]/60";
    case "late":
      return "bg-rose-50/80 text-rose-700 ring-1 ring-rose-200/70";
    default:
      return "bg-white/75 text-[#7a5636] ring-1 ring-[#d8b895]/55";
  }
}

function mealLogStatus(mealLog: MealLog | undefined, fallbackStatus: MealStatus) {
  if (!mealLog) return fallbackStatus;
  if (isMissedMealLog(mealLog)) return "late";
  if (isSkippedMealLog(mealLog)) return "upcoming";
  return "done";
}

function buildMealLog(meal: MealTemplate, actualTime: string, fedNotes: string | null, dayKey: string, skippedCareItemIds: string[] = [], loggedCareItems: MealLog["loggedCareItems"] = []): MealLog {
  return {
    id: `${dayKey}-${meal.id}`,
    profileSlug: getActiveProfileSlug(),
    dayKey,
    mealId: meal.id,
    mealName: meal.name,
    food: meal.food,
    defaultNotes: meal.notes,
    fedNotes,
    skippedCareItemIds,
    loggedCareItems,
    actualTime,
    createdAt: new Date().toISOString(),
  };
}

function missedMealLogId(dayKey: string, mealId: number) {
  return `${dayKey}-${mealId}-missed`;
}

function buildMissedMealLog(meal: MealTemplate, dayKey: string, skippedCareItemIds: string[] = [], loggedCareItems: MealLog["loggedCareItems"] = []): MealLog {
  return {
    id: missedMealLogId(dayKey, meal.id),
    profileSlug: getActiveProfileSlug(),
    dayKey,
    mealId: meal.id,
    mealName: meal.name,
    food: meal.food,
    defaultNotes: meal.notes,
    fedNotes: "Missed",
    skippedCareItemIds,
    loggedCareItems,
    actualTime: meal.plannedTime,
    createdAt: new Date().toISOString(),
  };
}

function careTypeLabel(item: CareItemTemplate) {
  if (item.kind === "supplement" && item.scheduleKind === "meal") return null;
  if (item.medicationType === "topical") return "Topical";
  if (item.medicationType === "injection") return "Injection";
  if (item.medicationType === "other") return "Other";
  return null;
}

function customCareDisplayDate(activity: ActivityLog) {
  return new Date(activity.happenedAt);
}

type CustomCareOccurrence = {
  key: string;
  item: CareItemTemplate;
  scheduledAt: Date;
  timeLabel: string;
  frequencyText: string;
  isLastDose: boolean;
};

type TodayPlanItem =
  | { type: "meal"; sortAt: Date; sortKey: string; meal: MealTemplate }
  | { type: "custom-care"; sortAt: Date; sortKey: string; occurrence: CustomCareOccurrence };

function dayKeyFromDate(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function dateFromDayKey(dayKey: string) {
  const [year, month, day] = dayKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function dateFromDateTimeLocal(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function sameScheduledMinute(first: Date, second: Date) {
  return Math.abs(first.getTime() - second.getTime()) < 60 * 1000;
}

function customCareScheduleSteps(item: CareItemTemplate) {
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

function customCareFrequencyText(item: CareItemTemplate) {
  const steps = customCareScheduleSteps(item);
  if (!steps.length) return "";
  if (steps.length > 1) return `${steps.length} schedules`;
  return item.ongoing ? `Every ${steps[0].everyHours} hours • Ongoing` : `Every ${steps[0].everyHours} hours for ${steps[0].forDays} days`;
}

function customCareDoseOffsets(item: CareItemTemplate) {
  const offsets: Array<{ offsetHours: number; stepIndex: number; doseIndex: number; frequencyText: string }> = [];

  customCareScheduleSteps(item).forEach((step, stepIndex) => {
    const stepHours = step.forDays * 24;
    const doseCount = Math.ceil(stepHours / step.everyHours);
    for (let index = 0; index < doseCount; index += 1) {
      offsets.push({
        offsetHours: index * step.everyHours,
        stepIndex,
        doseIndex: index,
        frequencyText: `Every ${step.everyHours} hours for ${step.forDays} days`,
      });
    }
  });

  return offsets;
}

function customCareOccurrencesForDay(items: CareItemTemplate[], targetDayKey: string): CustomCareOccurrence[] {
  return customScheduledCareItems(items).flatMap((item) => {
    if (item.asNeeded) return [];

    const startAt = dateFromDateTimeLocal(item.startDateTime);
    if (!startAt) return [];
    const scheduleCreatedAt = dateFromDateTimeLocal(item.customScheduleCreatedAt) ?? startAt;

    if (item.ongoing) {
      const [year, month, day] = targetDayKey.split("-").map(Number);
      const dayStart = new Date(year, month - 1, day);
      const dayEnd = new Date(year, month - 1, day + 1);
      const steps = customCareScheduleSteps(item);

      if (!steps.length) {
        const scheduledAt = new Date(year, month - 1, day, startAt.getHours(), startAt.getMinutes(), 0, 0);
        if (scheduledAt < dayStart || scheduledAt >= dayEnd || scheduledAt < startAt) return [];

        return [{
          key: `${item.kind}-${item.id}-schedule-daily-${scheduledAt.toISOString()}`,
          item,
          scheduledAt,
          timeLabel: formatActivityTime(scheduledAt.toISOString()),
          frequencyText: "",
          isLastDose: false,
        }];
      }

      return steps.flatMap((step, stepIndex) => {
        const firstOffset = Math.max(0, Math.ceil((dayStart.getTime() - startAt.getTime()) / (step.everyHours * 60 * 60 * 1000)));
        const occurrences: CustomCareOccurrence[] = [];

        for (let doseIndex = firstOffset; ; doseIndex += 1) {
          const scheduledAt = new Date(startAt.getTime() + doseIndex * step.everyHours * 60 * 60 * 1000);
          if (scheduledAt >= dayEnd) break;
          const explicitStartDose = sameScheduledMinute(scheduledAt, startAt);
          if (scheduledAt < dayStart || (!explicitStartDose && scheduledAt < scheduleCreatedAt)) continue;

          occurrences.push({
            key: `${item.kind}-${item.id}-schedule-${stepIndex + 1}-dose-${doseIndex + 1}-${scheduledAt.toISOString()}`,
            item,
            scheduledAt,
            timeLabel: formatActivityTime(scheduledAt.toISOString()),
            frequencyText: `Every ${step.everyHours} hours • Ongoing`,
            isLastDose: false,
          });
        }

        return occurrences;
      });
    }

    const offsets = customCareDoseOffsets(item);
    const effectiveOffsets = offsets.length ? offsets : [{ offsetHours: 0, stepIndex: 0, doseIndex: 0, frequencyText: customCareFrequencyText(item) }];
    const lastOffsetHours = Math.max(...effectiveOffsets.map((offset) => offset.offsetHours));

    return effectiveOffsets.flatMap((offset) => {
      const scheduledAt = new Date(startAt.getTime() + offset.offsetHours * 60 * 60 * 1000);
      const explicitStartDose = sameScheduledMinute(scheduledAt, startAt);
      if (dayKeyFromDate(scheduledAt) !== targetDayKey || (!explicitStartDose && scheduledAt.getTime() < scheduleCreatedAt.getTime())) return [];

      return [{
        key: `${item.kind}-${item.id}-schedule-${offset.stepIndex + 1}-dose-${offset.doseIndex + 1}-${scheduledAt.toISOString()}`,
        item,
        scheduledAt,
        timeLabel: formatActivityTime(scheduledAt.toISOString()),
        frequencyText: offset.frequencyText,
        isLastDose: offset.offsetHours === lastOffsetHours,
      }];
    });
  }).sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
}

function activityMatchesCustomCareOccurrence(activity: ActivityLog, occurrence: CustomCareOccurrence) {
  if (activity.activityType !== occurrence.item.kind) return false;

  const activityAt = new Date(activity.happenedAt);
  if (Number.isNaN(activityAt.getTime())) return false;
  if (Math.abs(activityAt.getTime() - occurrence.scheduledAt.getTime()) >= 60 * 1000) return false;

  const detail = activity.detail ?? "";
  return detail.toLowerCase().startsWith(occurrence.item.name.toLowerCase());
}

function customCareStatusForOccurrence(activityLogs: ActivityLog[], occurrence: CustomCareOccurrence) {
  const activity = activityLogs.find((entry) =>
    entry.id === occurrence.key ||
    entry.id === `${occurrence.key}-skipped` ||
    entry.id === `${occurrence.key}-missed` ||
    activityMatchesCustomCareOccurrence(entry, occurrence)
  );

  return activity ? { activity, status: careStatusFromActivity(activity) } : null;
}

function customCareTimingLabel(item: CareItemTemplate) {
  if (item.medicationType !== "oral") return null;
  return item.customTiming === "empty-stomach" ? "Empty Stomach" : "With Food";
}

function customCareMissedActivityLog(occurrence: CustomCareOccurrence, existingActivity: ActivityLog | null = null): ActivityLog {
  const { item } = occurrence;
  const planNotes = item.notes.trim() ? `Plan Notes: ${item.notes.trim()}` : "";
  const preservedNotes = existingActivity?.notes
    ?.split("\n")
    .map((line) => line.trim())
    .filter((line) =>
      line &&
      !line.startsWith("Skip Note: ") &&
      !line.startsWith("Notes: ") &&
      !line.startsWith("Plan Notes: ") &&
      line !== "Missed"
    )
    .join("\n");

  return {
    id: `${occurrence.key}-missed`,
    profileSlug: getActiveProfileSlug(),
    activityType: item.kind,
    happenedAt: occurrence.scheduledAt.toISOString(),
    detail: `${item.name} Missed`,
    notes: [preservedNotes, occurrence.frequencyText, customCareTimingLabel(item), planNotes, "Missed"].filter(Boolean).join("\n") || null,
    createdAt: existingActivity?.createdAt ?? new Date().toISOString(),
    attachments: existingActivity?.attachments,
  };
}

function parsePlanClockMinutes(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ").toUpperCase();
  const twentyFourHourParts = normalized.match(/^(\d{1,2}):(\d{2})$/);

  if (twentyFourHourParts) {
    const hours = Number(twentyFourHourParts[1]);
    const minutes = Number(twentyFourHourParts[2]);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) return hours * 60 + minutes;
    return Number.MAX_SAFE_INTEGER;
  }

  const parts = normalized.match(/^(\d{1,2})(?::(\d{2}))?\s?(AM|PM)$/i);
  if (!parts) return Number.MAX_SAFE_INTEGER;

  let hours = Number(parts[1]);
  const minutes = Number(parts[2] ?? "0");
  const meridiem = parts[3].toUpperCase();

  if (minutes < 0 || minutes > 59 || hours < 1 || hours > 12) return Number.MAX_SAFE_INTEGER;
  if (meridiem === "PM" && hours !== 12) hours += 12;
  if (meridiem === "AM" && hours === 12) hours = 0;

  return hours * 60 + minutes;
}

function plannedMealDate(dayKey: string, plannedTime: string) {
  const date = dateFromDayKey(dayKey);
  const minutes = parsePlanClockMinutes(plannedTime);
  if (minutes !== Number.MAX_SAFE_INTEGER) date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return date;
}

function todayPlanItems(meals: MealTemplate[], careTemplates: CareItemTemplate[], dayKey: string): TodayPlanItem[] {
  const mealItems = meals.map((meal) => ({
    type: "meal" as const,
    sortAt: plannedMealDate(dayKey, meal.plannedTime),
    sortKey: `meal-${meal.id}`,
    meal,
  }));
  const careItems = customCareOccurrencesForDay(careTemplates, dayKey).map((occurrence) => ({
    type: "custom-care" as const,
    sortAt: occurrence.scheduledAt,
    sortKey: occurrence.key,
    occurrence,
  }));

  return [...mealItems, ...careItems].sort((a, b) => a.sortAt.getTime() - b.sortAt.getTime() || a.sortKey.localeCompare(b.sortKey));
}

function mealPlanCareTimingLabel(item: CareItemTemplate) {
  if (item.medicationType !== "oral") return null;
  return "With Food";
}

function medicationTimingBadgeColorClassName(timingLabel: string | null) {
  return timingLabel === "Empty Stomach"
    ? "bg-sky-200/90 text-zinc-950"
    : "bg-pink-200/90 text-sky-600";
}

function planCareStyle(kind: CareItemKind) {
  return kind === "supplement"
    ? {
        card: "bg-[#c4d8ee]/94 ring-[#5e82aa]/75 hover:bg-[#b8cfe8]",
        icon: "bg-[#dbe9f7] text-[#173b63] ring-[#7fa0c4]",
        text: "text-[#173b63]",
        subtleText: "text-[#173b63]/68",
        divider: "border-[#7fa0c4]/45",
        done: "bg-[#173b63]/90 text-white",
        upcoming: "bg-white/75 text-[#173b63]/72 ring-[#7fa0c4]/55",
      }
    : {
        card: "bg-[#eef8ff]/92 ring-sky-200/80 hover:bg-[#e4f3ff]",
        icon: "bg-sky-50 text-sky-600 ring-sky-200",
        text: "text-sky-700",
        subtleText: "text-sky-700/68",
        divider: "border-sky-200/60",
        done: "bg-sky-500/90 text-white",
        upcoming: "bg-white/75 text-sky-700/72 ring-sky-200/70",
      };
}

function planCareCardClassName(kind: CareItemKind, canOpen: boolean) {
  const categoryClassName = planCareStyle(kind).card;
  const interactiveClassName = canOpen ? " cursor-pointer active:scale-[0.995]" : "";
  return `rounded-2xl p-4 shadow-sm ring-1 transition ${categoryClassName}${interactiveClassName}`;
}

function mealPlanCareDetailText(item: CareItemTemplate) {
  const dose = item.dose ? ` — ${item.dose}` : "";
  const route = careTypeLabel(item);
  const routeText = route ? ` (${route})` : "";
  return `${dose}${routeText}`;
}

function scheduledCareFrequencyText(value: string) {
  return value.replace(/\s*•\s*/g, " ");
}

function CareItemLine({ item, skipped = false }: { item: CareItemTemplate & { isLastDose?: boolean }; skipped?: boolean }) {
  const careStyle = planCareStyle(item.kind);
  const iconClassName = careStyle.icon;
  const lineClassName = skipped
    ? "rounded-2xl bg-rose-50/70 px-2 py-1.5 text-rose-700 ring-1 ring-rose-200/70"
    : careStyle.subtleText;
  const textClassName = skipped ? "text-rose-800" : careStyle.text;
  const timingLabel = item.kind === "supplement" ? null : mealPlanCareTimingLabel(item);
  const timingBadgeClassName = medicationTimingBadgeColorClassName(timingLabel);

  return (
    <div className={`flex items-start gap-2 text-sm leading-5 ${lineClassName}`}>
      <span className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ring-1 ${iconClassName}`}>
        {item.kind === "supplement" ? <Tablets className="size-3" /> : <MedicationPillIcon className="size-3.5" />}
      </span>
      <div className="min-w-0 flex-1">
        <p>
          <span className={`font-semibold ${textClassName}`}>{item.name}</span>
          <span className={`font-normal ${textClassName}`}>{mealPlanCareDetailText(item)}</span>
          {timingLabel ? <span className={`ml-2 inline-flex rounded-full px-2 py-0.5 text-xs font-normal ${timingBadgeClassName}`}>{timingLabel}</span> : null}
          {item.isLastDose ? <span className="ml-2 inline-flex rounded-full bg-amber-100/80 px-2 py-0.5 text-xs font-normal text-[#173b63]">Last Dose</span> : null}
          {skipped ? <span className="ml-2 inline-flex rounded-full bg-white/70 px-2 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-200/80">Skipped</span> : null}
        </p>
        {!skipped && item.notes ? <ExpandableNoteText className={`mt-0.5 ${careStyle.subtleText}`}>{item.notes}</ExpandableNoteText> : null}
      </div>
    </div>
  );
}

function ScheduledCarePlanCard({
  occurrence,
  activityLogs,
  onOpenOccurrenceEditor,
  children,
}: {
  occurrence: CustomCareOccurrence;
  activityLogs: ActivityLog[];
  onOpenOccurrenceEditor?: (occurrence: CustomCareOccurrence) => void;
  children?: ReactNode;
}) {
  const { item } = occurrence;
  const statusInfo = customCareStatusForOccurrence(activityLogs, occurrence);
  const status = statusInfo?.status ?? "upcoming";
  const actualTime = statusInfo?.activity ? formatActivityTime(statusInfo.activity.happenedAt) : null;
  const checked = status === "Given";
  const skipped = status === "Skipped";
  const missed = status === "Missed";
  const timingLabel = customCareTimingLabel(item);
  const route = careTypeLabel(item);
  const careStyle = planCareStyle(item.kind);
  const doseDetail = [item.dose || null, route ? `(${route})` : null].filter(Boolean).join(" ");
  const frequencyText = scheduledCareFrequencyText(occurrence.frequencyText);
  const canOpen = Boolean(onOpenOccurrenceEditor);

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`flex size-7 shrink-0 items-center justify-center rounded-full ring-1 ${careStyle.icon}`}>
              {item.kind === "supplement" ? <Tablets className="size-3.5" /> : <MedicationPillIcon className="size-4" />}
            </span>
            <h3 className={`min-w-0 font-semibold leading-6 ${careStyle.text}`}>{item.name}</h3>
            {checked ? (
              <span className={`flex size-5 shrink-0 -translate-y-0.5 items-center justify-center rounded-full ${careStyle.done}`} aria-label="Done" title="Done">
                <Check className="size-3" strokeWidth={3} />
              </span>
            ) : skipped ? (
              <span className="mt-0.5 shrink-0 whitespace-nowrap rounded-full bg-rose-50/80 px-2.5 py-1 text-xs font-medium text-rose-700 ring-1 ring-rose-200/70">Skipped</span>
            ) : missed ? (
              <span className="mt-0.5 shrink-0 whitespace-nowrap rounded-full bg-rose-50/80 px-2.5 py-1 text-xs font-medium text-rose-700 ring-1 ring-rose-200/70">Missed</span>
            ) : (
              <span className={`mt-0.5 shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${careStyle.upcoming}`}>Upcoming</span>
            )}
          </div>
          <div className={`mt-2 flex flex-wrap items-center gap-2 text-sm ${careStyle.subtleText}`}>
            {doseDetail ? <span>{doseDetail}</span> : null}
            {timingLabel ? <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-normal ${medicationTimingBadgeColorClassName(timingLabel)}`}>{timingLabel}</span> : null}
            {occurrence.isLastDose ? <span className="inline-flex rounded-full bg-amber-100/80 px-2 py-0.5 text-xs font-normal text-[#173b63]">Last Dose</span> : null}
          </div>
          {frequencyText ? <p className={`mt-1 text-sm ${careStyle.subtleText}`}>{frequencyText}</p> : null}
        </div>
      </div>
      <div className={`mt-3 grid grid-cols-2 gap-3 text-sm ${careStyle.subtleText}`}>
        <p className="flex min-w-0 items-center gap-1.5">
          <Clock3 className="size-4 shrink-0" /> <span>Planned:</span> <span className="whitespace-nowrap">{occurrence.timeLabel}</span>
        </p>
        <p>Actual: {actualTime ?? "Not Logged"}</p>
      </div>
      {item.notes ? <ExpandableNoteText className={`mt-3 text-sm ${careStyle.subtleText}`}>{item.notes}</ExpandableNoteText> : null}
      {children}
    </>
  );

  const className = planCareCardClassName(item.kind, canOpen);

  if (!canOpen) {
    return <article className={className}>{content}</article>;
  }

  return (
    <article
      className={className}
      role="button"
      tabIndex={0}
      onClick={() => onOpenOccurrenceEditor?.(occurrence)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpenOccurrenceEditor?.(occurrence);
        }
      }}
      aria-label={`Edit ${item.name}`}
    >
      {content}
    </article>
  );
}

function mealCareItemsWithDoseBadges(careTemplates: CareItemTemplate[], meal: MealTemplate, meals: MealTemplate[], dayKey: string) {
  return careItemsForMeal(careTemplates, meal.id, meals, dayKey).map((item) => {
    const doseNumber = mealPlanDoseNumberForMeal(item, meal, meals, dayKey);
    const totalDoses = mealPlanTotalDoseCount(item);
    return {
      ...item,
      isLastDose: Boolean(doseNumber && totalDoses && doseNumber === totalDoses),
    };
  });
}

function loggedCareItemsForMeal(careTemplates: CareItemTemplate[], meal: MealTemplate, meals: MealTemplate[], dayKey: string, skippedCareItemIds: string[] = []) {
  return mealCareItemsWithDoseBadges(careTemplates, meal, meals, dayKey).map((item) => ({
    ...item,
    skipped: skippedCareItemIds.includes(`${item.kind}-${item.id}`),
  }));
}

function TodayMealPlanCard({
  dayKey,
  isToday,
  templates,
  dailyMealState,
  mealLogs,
  activityLogs,
  careTemplates,
  editingMealTimeId,
  editingMealTimeValue,
  editingMealStatus,
  editingMealNoteValue,
  editingSkippedCareItemIds,
  onOpenMealEditor,
  editingActivityId,
  onOpenOccurrenceEditor,
  renderScheduledCareEditor,
  onActualTimeChange,
  onMealStatusChange,
  onFedNoteChange,
  onToggleCareItem,
  onSkippedCareItemIdsChange,
  onSaveMeal,
  onCancelMealEdit,
  onUndoMeal,
  canUndoMeal,
}: {
  dayKey: string;
  isToday: boolean;
  templates: MealTemplate[];
  dailyMealState: DailyMealState[];
  mealLogs: MealLog[];
  activityLogs: ActivityLog[];
  careTemplates: CareItemTemplate[];
  editingMealTimeId: number | null;
  editingMealTimeValue: string;
  editingMealStatus: "Fed" | "Skipped";
  editingMealNoteValue: string;
  editingSkippedCareItemIds: string[];
  onOpenMealEditor: (mealId: number, actualTime: string | null) => void;
  editingActivityId?: string | null;
  onOpenOccurrenceEditor?: (occurrence: CustomCareOccurrence) => void;
  renderScheduledCareEditor?: (occurrence: CustomCareOccurrence, activity: ActivityLog | null) => ReactNode;
  onActualTimeChange: (value: string) => void;
  onMealStatusChange: (value: "Fed" | "Skipped") => void;
  onFedNoteChange: (value: string) => void;
  onToggleCareItem: (careItemId: string) => void;
  onSkippedCareItemIdsChange: (careItemIds: string[]) => void;
  onSaveMeal: () => void;
  onCancelMealEdit: () => void;
  onUndoMeal: (mealId: number) => void;
  canUndoMeal: boolean;
}) {
  const dayMealLogs = mealLogs.filter((mealLog) => mealLog.dayKey === dayKey);
  const dayMealState = dailyMealState.filter((meal) => (meal.dayKey ?? currentTodayKey()) === dayKey);
  const planItems = todayPlanItems(templates, careTemplates, dayKey);

  return (
    <section className="mb-4 rounded-3xl bg-[var(--hewie-accent)] p-5 text-[var(--hewie-accent-text)] shadow-sm ring-1 ring-[var(--hewie-accent)]/45">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-[var(--hewie-accent-text)]">{isToday ? "Today's Plan" : `${formatLogDayLabel(dayKey)} Plan`}</h2>
        <p className="mt-1 text-sm leading-5 text-[var(--hewie-accent-text)]/72">
          {planItems.length
            ? isToday
              ? "Today's scheduled meals, medications, and supplements appear here in time order."
              : "Scheduled meals, medications, and supplements for this day appear here in time order."
            : isToday
              ? "No meals, medications, or supplements scheduled yet."
              : "No meals, medications, or supplements were scheduled for this day."}
        </p>
      </div>

      <div className="space-y-3">
        {planItems.map((planItem) => {
          if (planItem.type === "custom-care") {
            const statusInfo = customCareStatusForOccurrence(activityLogs, planItem.occurrence);
            const scheduledCareEditorOpen = editingActivityId === planItem.occurrence.key || editingActivityId === statusInfo?.activity?.id;
            return (
              <ScheduledCarePlanCard
                key={planItem.sortKey}
                occurrence={planItem.occurrence}
                activityLogs={activityLogs}
                onOpenOccurrenceEditor={onOpenOccurrenceEditor}
              >
                {scheduledCareEditorOpen ? renderScheduledCareEditor?.(planItem.occurrence, statusInfo?.activity ?? null) : null}
              </ScheduledCarePlanCard>
            );
          }

          const meal = planItem.meal;
          const mealState = dayMealState.find((entry) => entry.mealId === meal.id);
          const mealLog = dayMealLogs.find((entry) => entry.mealId === meal.id && !isMissedMealLog(entry)) ?? dayMealLogs.find((entry) => entry.mealId === meal.id);
          const status = mealLogStatus(mealLog, mealState?.status ?? "upcoming");
          const actualTime = firstNonBlankTime(mealLog?.actualTime, mealState?.actualTime);
          const fedNotes = mealLog?.fedNotes ?? mealState?.fedNotes ?? null;
          const skipped = mealLog ? isSkippedMealLog(mealLog) : fedNotes === "Skipped";
          const missed = mealLog ? isMissedMealLog(mealLog) : false;
          const checked = status === "done" && !skipped && !missed;
          const notLoggedPast = !isToday && !actualTime && !skipped && !missed;
          const skippedCareItemIds = mealLog?.skippedCareItemIds ?? mealState?.skippedCareItemIds ?? [];
          const mealCareItems = mealLog?.loggedCareItems?.length
            ? mealLog.loggedCareItems.map((item) => ({ ...item, skipped: Boolean(item.skipped) }))
            : mealCareItemsWithDoseBadges(careTemplates, meal, templates, dayKey).map((item) => ({
                ...item,
                skipped: skippedCareItemIds.includes(`${item.kind}-${item.id}`),
              }));
          const displayMealName = mealLog?.mealName || meal.name;
          const displayMealFood = mealLog?.food || meal.food;
          const displayMealNotes = mealLog?.defaultNotes ?? meal.notes;

          const openMealEditor = () => onOpenMealEditor(meal.id, actualTime);

          return (
            <article
              key={planItem.sortKey}
              className="cursor-pointer rounded-2xl bg-[#fff3e6]/94 p-4 shadow-sm ring-1 ring-[#c9884a]/65 transition hover:bg-[#ffead4] active:scale-[0.995]"
              role="button"
              tabIndex={0}
              onClick={openMealEditor}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openMealEditor();
                }
              }}
              aria-label={`Edit ${displayMealName}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#8a5a35]/75 text-white ring-1 ring-[#c9884a]/60">
                      <EmojiAsset name="steak" label="Meal plan" className="size-5" />
                    </span>
                    <h3 className="min-w-0 font-semibold leading-6 text-[#4f2f1b]">{displayMealName}</h3>
                    {checked ? (
                      <span className="flex size-5 shrink-0 -translate-y-0.5 items-center justify-center rounded-full bg-[#8a5a35]/85 text-white" aria-label="Done" title="Done">
                        <Check className="size-3" strokeWidth={3} />
                      </span>
                    ) : skipped ? (
                      <span className="mt-0.5 shrink-0 whitespace-nowrap rounded-full bg-rose-50/80 px-2.5 py-1 text-xs font-medium text-rose-700 ring-1 ring-rose-200/70">Skipped</span>
                    ) : missed ? (
                      <span className="mt-0.5 shrink-0 whitespace-nowrap rounded-full bg-rose-50/80 px-2.5 py-1 text-xs font-medium text-rose-700 ring-1 ring-rose-200/70">Missed</span>
                    ) : notLoggedPast ? (
                      <span className="mt-0.5 shrink-0 whitespace-nowrap rounded-full bg-white/75 px-2.5 py-1 text-xs font-medium text-[#7a5636]/70 ring-1 ring-[#d8b895]/55">Not logged</span>
                    ) : (
                      <span className={`mt-0.5 shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium capitalize ${statusClasses(status)}`}>{status}</span>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-[#6b3f22]/72">{displayMealFood}</p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-[#6b3f22]/58">
                <p className="flex min-w-0 items-center gap-1.5">
                  <Clock3 className="size-4 shrink-0" /> <span>Planned:</span> <span className="whitespace-nowrap">{meal.plannedTime}</span>
                </p>
                <p>Actual: {actualTime ?? "Not Logged"}</p>
              </div>
              <div className="mt-3">
                {displayMealNotes ? <ExpandableNoteText className="text-sm text-[#6b3f22]/58">{displayMealNotes}</ExpandableNoteText> : null}
                {fedNotes && !skipped && !missed ? <ExpandableNoteText className="mt-1 text-sm font-semibold leading-6 text-[#6b3f22]/72">Notes: {fedNotes}</ExpandableNoteText> : null}
              </div>

              {mealCareItems.length ? (
                <div className="mt-3 space-y-1.5 border-t border-[#d8b895]/45 pt-3">
                  {mealCareItems.map((item) => <CareItemLine key={`${item.kind}-${item.id}`} item={item} skipped={("skipped" in item && Boolean(item.skipped)) || skippedCareItemIds.includes(`${item.kind}-${item.id}`)} />)}
                </div>
              ) : null}

              {editingMealTimeId === meal.id ? (
                <div className="mt-3" onClick={(event) => event.stopPropagation()}>
                  <MealTimeForm
                    mealName={displayMealName}
                    actualTime={firstNonBlankTime(editingMealTimeValue, actualTime, meal.plannedTime) ?? ""}
                    onActualTimeChange={onActualTimeChange}
                    mealStatus={editingMealStatus}
                    onMealStatusChange={onMealStatusChange}
                    fedNote={editingMealNoteValue}
                    onFedNoteChange={onFedNoteChange}
                    onSave={onSaveMeal}
                    saveLabel={actualTime ? "Save" : "Mark Fed"}
                    onCancel={onCancelMealEdit}
                    onUndo={actualTime && canUndoMeal ? () => onUndoMeal(meal.id) : undefined}
                    undoLabel={isToday ? "Undo Log" : "Mark Missed"}
                    careItems={mealCareItems}
                    skippedCareItemIds={editingSkippedCareItemIds}
                    onToggleCareItem={onToggleCareItem}
                    onSkippedCareItemIdsChange={onSkippedCareItemIdsChange}
                  />
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function resolveActivityTypeForSave(activityType: ActivityType, detail: string): ActivityType {

  if (activityType !== "potty") return activityType;



  if (detail === "Pee") return "pee";

  if (detail === "No Poop") return "potty";

  if (detail === "Poop" || detail === "Pee & Poop" || detail.includes("• Type ") || detail.startsWith("Type ")) return "poop";

  return "potty";

}



function LogPageContent() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedLogDay = searchParams.get("date");
  const requestedEditActivityId = searchParams.get("editActivity");
  const requestedEditMealId = searchParams.get("editMeal");
  const [logDayKey, setLogDayKey] = useState(initialLogDayKey);
  const isTodayLog = logDayKey === currentTodayKey();

  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);

  const [mealLogs, setMealLogs] = useState<MealLog[]>([]);

  const [templates, setTemplates] = useState<MealTemplate[]>(initialTemplates);
  const [mealTemplateAuditSnapshots, setMealTemplateAuditSnapshots] = useState<MealTemplateAuditSnapshot[]>([]);

  const [dailyMealState, setDailyMealState] = useState<DailyMealState[]>([]);

  const [editingMealTimeId, setEditingMealTimeId] = useState<number | null>(null);

  const [editingMealTimeValue, setEditingMealTimeValue] = useState("");

  const [editingMealStatus, setEditingMealStatus] = useState<"Fed" | "Skipped">("Fed");

  const [editingMealNoteValue, setEditingMealNoteValue] = useState("");

  const [editingSkippedCareItemIds, setEditingSkippedCareItemIds] = useState<string[]>([]);

  const [supplementTemplates, setSupplementTemplates] = useState<CareItemTemplate[]>([]);

  const [medicationTemplates, setMedicationTemplates] = useState<CareItemTemplate[]>([]);

  const [activityState, setActivityState] = useState<"idle" | "saved" | "saving" | "error">("idle");
  const activitySaveInFlightRef = useRef(false);

  const [logEventOpen, setLogEventOpen] = useState(false);

  const [detailActivityType, setDetailActivityType] = useState<ActivityType | null>(null);

  const [editingActivityId, setEditingActivityId] = useState<string | null>(null);

  const [detailValue, setDetailValue] = useState("");

  const [notesValue, setNotesValue] = useState("");

  const [extraNotesValue, setExtraNotesValue] = useState("");

  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);

  const [recordTags, setRecordTags] = useState<string[]>([]);

  const [happenedAtValue, setHappenedAtValue] = useState(nowForTimeInput());

  const [hydrated, setHydrated] = useState(false);
  const [autoOpenedHistoryEditor, setAutoOpenedHistoryEditor] = useState(false);
  const [canEditEntries, setCanEditEntries] = useState(true);
  const [canDeleteEntries, setCanDeleteEntries] = useState(true);
  const [canUseAttachments, setCanUseAttachments] = useState(true);
  const [pendingUndoMealId, setPendingUndoMealId] = useState<number | null>(null);
  const [pendingDeleteActivityId, setPendingDeleteActivityId] = useState<string | null>(null);
  const [notebookOwnerId, setNotebookOwnerId] = useState<string | null>(null);
  const [subscriptionPlan, setSubscriptionPlan] = useState<SubscriptionPlanId>("free");

  const supabaseReady = isSupabaseConfigured();
  const historyPath = pathname?.startsWith("/hewie") ? "/hewie/history" : "/notebook/history";
  const templatesForLogDay = useMemo(
    () => isTodayLog ? templates : mealTemplatesForHistoryDay(templates, mealTemplateAuditSnapshots, logDayKey),
    [isTodayLog, logDayKey, mealTemplateAuditSnapshots, templates]
  );
  const activeTemplates = useMemo(
    () => templatesForLogDay.filter((template) => isMealTemplateActiveForDay(template, logDayKey)),
    [logDayKey, templatesForLogDay]
  );

  useEffect(() => {
    const refreshPlan = () => setSubscriptionPlan(loadStoredSubscriptionPlan());
    refreshPlan();
    window.addEventListener("storage", refreshPlan);
    window.addEventListener("focus", refreshPlan);
    return () => {
      window.removeEventListener("storage", refreshPlan);
      window.removeEventListener("focus", refreshPlan);
    };
  }, []);

  const freeAttachmentCounts = useMemo(
    () => activityAttachmentCounts(activityLogs, editingActivityId),
    [activityLogs, editingActivityId]
  );

  const detailAttachmentLimit = useMemo(() => {
    if (subscriptionPlan === "plus") return 5;
    return 5;
  }, [subscriptionPlan]);

  const detailAttachmentPickerBlocked =
    !canUseAttachments ||
    (subscriptionPlan !== "plus" && (
      detailActivityType === "potty" || detailActivityType === "poop"
        ? freeAttachmentCounts.pottyImageUses >= FREE_POTTY_IMAGE_USE_LIMIT
        : freeAttachmentCounts.medicalAttachmentUses >= FREE_MEDICAL_ATTACHMENT_USE_LIMIT
    ));

  const detailAttachmentPickerBlockedMessage =
    !canUseAttachments
      ? "Caretakers cannot add attachments."
      : detailActivityType === "potty" || detailActivityType === "poop"
      ? "Your first poop image is free. Upgrade to Plus to add more images."
      : "Your first attachment is free. Upgrade to Plus to add more files.";

  useEffect(() => {
    const nextLogDay = requestedLogDay && isValidDayKey(requestedLogDay) && requestedLogDay <= currentTodayKey()
      ? requestedLogDay
      : currentTodayKey();

    setLogDayKey((current) => current === nextLogDay ? current : nextLogDay);
    setAutoOpenedHistoryEditor(false);
    cancelMealTimeEditor();
    resetEditor();
  }, [requestedEditActivityId, requestedEditMealId, requestedLogDay]);



  useEffect(() => {
    let cancelled = false;
    const refreshPermissions = () => {
      void loadNotebookEntryPermissions().then((permissions) => {
        if (!cancelled) {
          setCanEditEntries(permissions.canEditEntries);
          setCanDeleteEntries(permissions.canDeleteEntries);
          setCanUseAttachments(permissions.canUseAttachments);
        }
      });
    };

    refreshPermissions();
    window.addEventListener("petnotebook-active-notebook-updated", refreshPermissions);
    window.addEventListener("focus", refreshPermissions);
    return () => {
      cancelled = true;
      window.removeEventListener("petnotebook-active-notebook-updated", refreshPermissions);
      window.removeEventListener("focus", refreshPermissions);
    };
  }, []);

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

        setActivityLogs(state.activityLogs);

        setMealLogs(state.mealLogs ?? []);

        setTemplates(state.templates ?? initialTemplates);
        setMealTemplateAuditSnapshots(state.mealTemplateAuditSnapshots ?? []);

        setDailyMealState(mergeMealStateForEditing(state.dailyMealState ?? [], state.dailyMealHistory, state.todayKey));
        setNotebookOwnerId(state.notebookOwnerId ?? null);

        const [supplements, medications] = await Promise.all([
          loadCareTemplatesFromSupabase("supplement"),
          loadCareTemplatesFromSupabase("medication"),
        ]);

        setSupplementTemplates(supplements);

        setMedicationTemplates(medications);

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
    if (!hydrated) return;

    const refreshCareSettings = () => {
      setSupplementTemplates(loadCareTemplates("supplement"));
      setMedicationTemplates(loadCareTemplates("medication"));
      void Promise.all([loadCareTemplatesFromSupabase("supplement"), loadCareTemplatesFromSupabase("medication")]).then(([supplements, medications]) => {
        setSupplementTemplates(supplements);
        setMedicationTemplates(medications);
      });
    };

    window.addEventListener("focus", refreshCareSettings);
    window.addEventListener("hewster:care-settings-updated", refreshCareSettings);
    document.addEventListener("visibilitychange", refreshCareSettings);

    return () => {
      window.removeEventListener("focus", refreshCareSettings);
      window.removeEventListener("hewster:care-settings-updated", refreshCareSettings);
      document.removeEventListener("visibilitychange", refreshCareSettings);
    };
  }, [hydrated]);



  useEffect(() => {

    if (!hydrated) return;

    window.localStorage.setItem(activeProfileStorageKey(ACTIVITY_LOGS_STORAGE_KEY), JSON.stringify(activityLogs));

  }, [activityLogs, hydrated]);



  const selectedDayActivityLogs = useMemo(() => {

    return activityLogs.filter((activity) => {

      const activityDayKey = new Intl.DateTimeFormat("en-CA", {

        year: "numeric",

        month: "2-digit",

        day: "2-digit",

      }).format(new Date(activity.happenedAt));



      return activityDayKey === logDayKey;

    });

  }, [activityLogs, logDayKey]);

  const careTemplates = useMemo(
    () => [...supplementTemplates, ...medicationTemplates],
    [supplementTemplates, medicationTemplates]
  );

  const selectedDayCustomCareOccurrences = useMemo(
    () => customCareOccurrencesForDay(careTemplates, logDayKey),
    [careTemplates, logDayKey]
  );

  const selectedDayManualActivityLogs = useMemo(
    () => selectedDayActivityLogs.filter((activity) => !selectedDayCustomCareOccurrences.some((occurrence) =>
      activity.id === occurrence.key ||
      activity.id === `${occurrence.key}-skipped` ||
      activity.id === `${occurrence.key}-missed` ||
      activityMatchesCustomCareOccurrence(activity, occurrence)
    )),
    [selectedDayActivityLogs, selectedDayCustomCareOccurrences]
  );

  const persistMealState = (nextMealState: DailyMealState[], nextMealLogs: MealLog[]) => {
    persistDailyMealStateLocally(nextMealState);
    window.localStorage.setItem(activeProfileStorageKey(MEAL_LOGS_STORAGE_KEY), JSON.stringify(nextMealLogs));
  };

  const persistHistoricalMealState = (nextMealState: DailyMealState[], nextMealLogs: MealLog[]) => {
    persistDailyMealStateLocally(nextMealState, logDayKey);
    window.localStorage.setItem(activeProfileStorageKey(MEAL_LOGS_STORAGE_KEY), JSON.stringify(nextMealLogs));
  };

  const openMealTimeEditor = useCallback((mealId: number, actualTime: string | null) => {
    const mealState = dailyMealState.find((entry) => entry.mealId === mealId && (entry.dayKey ?? currentTodayKey()) === logDayKey);
    const mealLog = mealLogs.find((entry) => entry.dayKey === logDayKey && entry.mealId === mealId && !isMissedMealLog(entry)) ?? mealLogs.find((entry) => entry.dayKey === logDayKey && entry.mealId === mealId);
    const skipped = mealLog ? isSkippedMealLog(mealLog) : mealState?.fedNotes === "Skipped";
    const missed = mealLog ? isMissedMealLog(mealLog) : mealState?.fedNotes === "Missed";
    setEditingMealTimeId(mealId);
    setEditingMealTimeValue(firstNonBlankTime(actualTime, mealLog?.actualTime, mealState?.actualTime) ?? nowForTimeInput());
    setEditingMealStatus(skipped ? "Skipped" : "Fed");
    setEditingMealNoteValue(skipped || missed ? "" : mealLog?.fedNotes ?? mealState?.fedNotes ?? "");
    setEditingSkippedCareItemIds(mealLog?.skippedCareItemIds ?? mealState?.skippedCareItemIds ?? []);
  }, [dailyMealState, logDayKey, mealLogs]);

  const cancelMealTimeEditor = () => {
    setEditingMealTimeId(null);
    setEditingMealTimeValue("");
    setEditingMealStatus("Fed");
    setEditingMealNoteValue("");
    setEditingSkippedCareItemIds([]);
  };

  const toggleEditingCareItem = (careItemId: string) => {
    setEditingSkippedCareItemIds((current) =>
      current.includes(careItemId) ? current.filter((id) => id !== careItemId) : [...current, careItemId]
    );
  };

  const saveMealTime = async () => {
    if (editingMealTimeId === null) return;

    const template = templatesForLogDay.find((entry) => entry.id === editingMealTimeId) ?? templates.find((entry) => entry.id === editingMealTimeId);
    if (!template) return;

    const mealState = dailyMealState.find((entry) => entry.mealId === editingMealTimeId && (entry.dayKey ?? currentTodayKey()) === logDayKey);
    const mealLog = mealLogs.find((entry) => entry.dayKey === logDayKey && entry.mealId === editingMealTimeId && !isMissedMealLog(entry)) ?? mealLogs.find((entry) => entry.dayKey === logDayKey && entry.mealId === editingMealTimeId);
    const actualTime = firstNonBlankTime(editingMealTimeValue, mealLog?.actualTime, mealState?.actualTime) ?? "";
    const fedNotes = editingMealStatus === "Skipped" ? "Skipped" : editingMealNoteValue.trim() || null;
    const resolvedSkippedCareItemIds = editingMealStatus === "Skipped"
      ? mealCareItemsWithDoseBadges(careTemplates, template, templatesForLogDay, logDayKey).map((item) => `${item.kind}-${item.id}`)
      : editingSkippedCareItemIds;
    const mealLogId = `${logDayKey}-${editingMealTimeId}`;
    const updatedMealState = {
      mealId: editingMealTimeId,
      actualTime: actualTime || null,
      status: actualTime ? ("done" as const) : ("upcoming" as const),
      fedNotes,
      skippedCareItemIds: resolvedSkippedCareItemIds,
      dayKey: logDayKey,
    };
    const nextMealState = [
      updatedMealState,
      ...dailyMealState.filter((meal) => !(meal.mealId === editingMealTimeId && (meal.dayKey ?? currentTodayKey()) === logDayKey)),
    ];

    let nextMealLogs = mealLogs;
    if (actualTime) {
      const mealLog = buildMealLog(
        template,
        actualTime,
        fedNotes,
        logDayKey,
        resolvedSkippedCareItemIds,
        loggedCareItemsForMeal(careTemplates, template, templatesForLogDay, logDayKey, resolvedSkippedCareItemIds)
      );
      nextMealLogs = [mealLog, ...mealLogs.filter((entry) => entry.id !== mealLogId && entry.id !== missedMealLogId(logDayKey, editingMealTimeId))];
      if (supabaseReady) {
        try {
          await saveCompletedMealToSupabase(mealLog, nextMealState, missedMealLogId(logDayKey, editingMealTimeId));
        } catch {
          // local fallback already captured
        }
      }
    }

    if (isTodayLog) {
      setDailyMealState(nextMealState);
      persistMealState(nextMealState, nextMealLogs);
    } else {
      persistHistoricalMealState(nextMealState, nextMealLogs);
    }
    setMealLogs(nextMealLogs);
    cancelMealTimeEditor();
  };

  const undoMealFed = (mealId: number) => {
    setPendingUndoMealId(mealId);
  };

  const confirmUndoMealFed = async () => {
    if (pendingUndoMealId === null) return;

    const mealId = pendingUndoMealId;
    const mealLogId = `${logDayKey}-${mealId}`;
    const template = templatesForLogDay.find((entry) => entry.id === mealId) ?? templates.find((entry) => entry.id === mealId);
    if (!template) return;

    if (isTodayLog) {
      const resetMealState = {
        mealId,
        actualTime: null,
        status: "upcoming" as const,
        fedNotes: null,
        skippedCareItemIds: [],
        dayKey: logDayKey,
      };
      const nextMealState = [
        resetMealState,
        ...dailyMealState.filter((meal) => !(meal.mealId === mealId && (meal.dayKey ?? currentTodayKey()) === logDayKey)),
      ];
      const nextMealLogs = mealLogs.filter((entry) => !(entry.dayKey === logDayKey && entry.mealId === mealId));

      setDailyMealState(nextMealState);
      persistMealState(nextMealState, nextMealLogs);
      setMealLogs(nextMealLogs);
      setPendingUndoMealId(null);
      cancelMealTimeEditor();

      if (supabaseReady) {
        try {
          await saveDailyMealsToSupabase(nextMealState);
          await deleteMealLogInSupabase(mealLogId);
          await deleteMealLogInSupabase(missedMealLogId(logDayKey, mealId));
        } catch {
          // local fallback already captured
        }
      }

      return;
    }

    const skippedCareItemIds = mealCareItemsWithDoseBadges(careTemplates, template, templatesForLogDay, logDayKey).map((item) => `${item.kind}-${item.id}`);
    const missedMealLog = buildMissedMealLog(
      template,
      logDayKey,
      skippedCareItemIds,
      loggedCareItemsForMeal(careTemplates, template, templatesForLogDay, logDayKey, skippedCareItemIds)
    );
    const missedMealState = {
      mealId,
      actualTime: template.plannedTime,
      status: "late" as const,
      fedNotes: "Missed",
      skippedCareItemIds,
      dayKey: logDayKey,
    };
    const nextMealState = [
      missedMealState,
      ...dailyMealState.filter((meal) => !(meal.mealId === mealId && (meal.dayKey ?? currentTodayKey()) === logDayKey)),
    ];
    const nextMealLogs = [
      missedMealLog,
      ...mealLogs.filter((entry) =>
        entry.id !== mealLogId &&
        entry.id !== missedMealLog.id &&
        !(entry.dayKey === logDayKey && entry.mealId === mealId)
      ),
    ];

    if (isTodayLog) {
      setDailyMealState(nextMealState);
      persistMealState(nextMealState, nextMealLogs);
    } else {
      window.localStorage.setItem(activeProfileStorageKey(MEAL_LOGS_STORAGE_KEY), JSON.stringify(nextMealLogs));
    }
    setMealLogs(nextMealLogs);
    setPendingUndoMealId(null);
    cancelMealTimeEditor();

    if (supabaseReady) {
      try {
        await saveCompletedMealToSupabase(missedMealLog, nextMealState, mealLogId);
      } catch {
        // local fallback already captured
      }
    }
  };

  const selectedDayEventItems = useMemo(() => {

    const activityItems = selectedDayManualActivityLogs.map((activity) => {

      const happenedAt = customCareDisplayDate(activity);

      return {

        time: formatActivityTime(happenedAt.toISOString()),

        label: formatActivityLabel(activity.activityType),

        detail: activity.activityType === "sick" ? renderHealthTimelineActivityDetail(activity, careTemplates) : renderActivityDetail(activity),

        activity,

        activityType: activity.activityType,

        sortMinutes: happenedAt.getHours() * 60 + happenedAt.getMinutes(),

        sortKey: activity.createdAt ?? activity.id,

      };

    });

    return activityItems.sort((a, b) => a.sortMinutes - b.sortMinutes || a.sortKey.localeCompare(b.sortKey));

  }, [careTemplates, selectedDayManualActivityLogs]);



  const resetEditor = () => {

    setDetailActivityType(null);

    setEditingActivityId(null);

    setDetailValue("");

    setNotesValue("");

    setExtraNotesValue("");

    setAttachmentFiles([]);

    setRecordTags([]);

    setHappenedAtValue(nowForTimeInput());

  };



  const openEditorForActivity = useCallback((activity: ActivityLog) => {

    const editorActivityType: ActivityType = ["pee", "poop", "potty"].includes(activity.activityType) ? "potty" : activity.activityType;

    setDetailActivityType(editorActivityType);

    setEditingActivityId(activity.id);

    setDetailValue(isCareActivityType(activity.activityType) ? careStatusFromActivity(activity) : activity.detail ?? "");

    const notesParts = activity.notes?.split(/\s*(?:•\s*)?Notes:\s*/);

    if (activity.activityType === "treat" && notesParts && notesParts.length > 1) {

      const [treatName, extraNotes] = notesParts;

      setNotesValue(treatName);

      setExtraNotesValue(extraNotes ?? "");

    } else if (isCareActivityType(activity.activityType)) {

      const planNotes = careTemplateForActivity(activity, careTemplates)?.notes.trim() ?? "";

      setNotesValue(editableCareNoteText(activity.notes, planNotes));

      setExtraNotesValue("");

    } else {

      setNotesValue(editableActivityNoteText(activity.notes));

      setExtraNotesValue("");

    }

    setHappenedAtValue(toTimeInputValue(activity.happenedAt));
    setAttachmentFiles([]);

  }, [careTemplates]);

  const openEditorForCustomCareOccurrence = useCallback((occurrence: CustomCareOccurrence) => {
    const statusInfo = customCareStatusForOccurrence(activityLogs, occurrence);

    if (statusInfo?.activity) {
      openEditorForActivity(statusInfo.activity);
      return;
    }

    setDetailActivityType(occurrence.item.kind);
    setEditingActivityId(occurrence.key);
    setDetailValue("Given");
    setNotesValue("");
    setExtraNotesValue("");
    setHappenedAtValue(toTimeInputValue(occurrence.scheduledAt.toISOString()));
    setAttachmentFiles([]);
    setRecordTags([]);
  }, [activityLogs, openEditorForActivity]);

  useEffect(() => {
    if (!hydrated || autoOpenedHistoryEditor) return;

    if (requestedLogDay && isValidDayKey(requestedLogDay) && requestedLogDay !== logDayKey) return;

    if (requestedEditActivityId) {
      const activity = activityLogs.find((entry) => entry.id === requestedEditActivityId);
      if (!activity) return;
      openEditorForActivity(activity);
      setAutoOpenedHistoryEditor(true);
      return;
    }

    const editMealId = Number(requestedEditMealId);
    if (Number.isFinite(editMealId) && editMealId > 0) {
      const mealLog = mealLogs.find((entry) => entry.dayKey === logDayKey && entry.mealId === editMealId && !isMissedMealLog(entry)) ?? mealLogs.find((entry) => entry.dayKey === logDayKey && entry.mealId === editMealId);
      openMealTimeEditor(editMealId, firstNonBlankTime(mealLog?.actualTime));
      setAutoOpenedHistoryEditor(true);
    }
  }, [activityLogs, autoOpenedHistoryEditor, hydrated, logDayKey, mealLogs, openEditorForActivity, openMealTimeEditor, requestedEditActivityId, requestedEditMealId, requestedLogDay]);



  const saveActivity = async (activity: ActivityLog, mode: "create" | "update") => {

    const nextLogs = [activity, ...activityLogs.filter((entry) => entry.id !== activity.id)].sort(compareActivitiesReverseChronological);

    window.localStorage.setItem(activeProfileStorageKey(ACTIVITY_LOGS_STORAGE_KEY), JSON.stringify(nextLogs));

    setActivityLogs(nextLogs);

    setActivityState("saving");



    try {

      if (supabaseReady) {

        if (mode === "update") {

          await updateActivityLogInSupabase(activity);

        } else {

          await saveActivityLogToSupabase(activity);

        }

      }



      setActivityState("saved");

      window.setTimeout(() => setActivityState("idle"), 1800);

    } catch {

      setActivityState("error");

    }

  };



  const quickLogActivity = async (activityType: ActivityType) => {

    if (["potty", "activity", "outdoor", "food", "treat", "care", "wellness", "medication", "sick", "other"].includes(activityType)) {

      setLogEventOpen(true);

      setDetailActivityType(activityType);

      setEditingActivityId(null);

      setDetailValue(activityType === "food" ? "Food" : "");

      setNotesValue("");

      setExtraNotesValue("");

      setAttachmentFiles([]);

      setRecordTags([]);

      setHappenedAtValue(nowForTimeInput());

      return;

    }



    const activity: ActivityLog = {

      id: `${activityType}-${Date.now()}`,

      profileSlug: getActiveProfileSlug(),

      activityType,

      happenedAt: mergeDayWithTime(logDayKey, nowForTimeInput()),

      detail: null,

      notes: null,

      createdAt: new Date().toISOString(),

    };



    setEditingActivityId(null);

    await saveActivity(activity, "create");

    openEditorForActivity(activity);

  };



  const saveDetailedActivity = async () => {

    if (!detailActivityType || activitySaveInFlightRef.current) return;
    activitySaveInFlightRef.current = true;
    setActivityState("saving");

    try {



    const recordTagNote = "";

    const existingActivity = editingActivityId ? activityLogs.find((entry) => entry.id === editingActivityId) : null;
    const editingCustomCareOccurrence = editingActivityId ? selectedDayCustomCareOccurrences.find((occurrence) => occurrence.key === editingActivityId) ?? null : null;
    const existingCarePlanNotes = existingActivity
      ? careTemplateForActivity(existingActivity, careTemplates)?.notes.trim() ?? ""
      : editingCustomCareOccurrence?.item.notes.trim() ?? "";

    const trimmedDetail = detailValue.trim();

    const resolvedActivityType = resolveActivityTypeForSave(detailActivityType, trimmedDetail);
    const originalCareDetail = existingActivity?.detail ?? editingCustomCareOccurrence?.item.name ?? null;

    const happenedAt = mergeDayWithTime(logDayKey, happenedAtValue);

    const attachmentDocumentTypes = attachmentDocumentTypesForActivity(resolvedActivityType);

    const attachmentNames = activityAttachmentFileNamesForSave(
      { id: editingActivityId ?? "", profileSlug: getActiveProfileSlug(), activityType: resolvedActivityType, happenedAt, detail: null, notes: null },
      attachmentFiles,
      attachmentDocumentTypes
    );

    const attachmentNote = attachmentNames.length ? `Attachments: ${attachmentNames.join(", ")}` : "";
    const savedMedicationNotes =
      detailActivityType === "sick" && trimmedDetail.startsWith("Medication: ")
        ? savedHealthMedicationShortcutNotes(trimmedDetail, careTemplates)
        : "";
    const savedSupplementNotes =
      detailActivityType === "wellness" && trimmedDetail === "Supplements"
        ? savedWellnessSupplementShortcutNotes(notesValue, careTemplates)
        : "";

    const resolvedNotes =

      detailActivityType === "treat"

        ? [notesValue.trim(), extraNotesValue.trim() ? `Notes: ${extraNotesValue.trim()}` : ""].filter(Boolean).join(" ") || null

        : isCareActivityType(detailActivityType)

          ? careNotesForSave(existingActivity?.notes ?? null, detailValue.trim(), notesValue, recordTagNote, attachmentNote, existingCarePlanNotes)

          : [savedMedicationNotes, savedSupplementNotes, notesValue.trim(), recordTagNote, attachmentNote].filter(Boolean).join("\n") || null;

    const activity: ActivityLog = {

      id: editingActivityId ?? `${resolvedActivityType}-${Date.now()}`,

      profileSlug: getActiveProfileSlug(),

      activityType: resolvedActivityType,

      happenedAt,

      detail: resolvedActivityType === "pee" ? "Pee" : detailActivityType === "potty" ? trimmedDetail || null : isCareActivityType(detailActivityType) ? careDetailForSave(originalCareDetail, trimmedDetail || "Given") : trimmedDetail || null,

      notes: resolvedNotes,

      createdAt: existingActivity?.createdAt ?? new Date().toISOString(),

    };



    await saveActivity(activity, existingActivity ? "update" : "create");

    if (attachmentFiles.length) {
      const savedAttachments = await saveActivityAttachmentsToSupabase(activity, attachmentFiles, attachmentDocumentTypes);

      if (savedAttachments.length) {
        setActivityLogs((current) => {
          const nextLogs = current.map((entry) =>
            entry.id === activity.id ? { ...entry, attachments: savedAttachments } : entry
          );
          window.localStorage.setItem(activeProfileStorageKey(ACTIVITY_LOGS_STORAGE_KEY), JSON.stringify(nextLogs));
          return nextLogs;
        });
      }
    }

      resetEditor();
      setLogEventOpen(false);
    } finally {
      activitySaveInFlightRef.current = false;
    }

  };



  const openLogEvent = () => {

    setLogEventOpen(true);

  };



  const collapseLogEvent = () => {

    resetEditor();

    setLogEventOpen(false);

  };

  const markScheduledCareMissed = async (occurrence: CustomCareOccurrence, existingActivity: ActivityLog | null) => {
    const missedActivity = customCareMissedActivityLog(occurrence, existingActivity);
    const staleActivityIds = [occurrence.key, `${occurrence.key}-skipped`].filter((id) => id !== missedActivity.id);
    if (existingActivity?.id && existingActivity.id !== missedActivity.id) staleActivityIds.push(existingActivity.id);

    setActivityLogs((current) => {
      const staleIds = new Set(staleActivityIds);
      const nextLogs = [missedActivity, ...current.filter((activity) => activity.id !== missedActivity.id && !staleIds.has(activity.id))].sort(compareActivitiesReverseChronological);
      window.localStorage.setItem(activeProfileStorageKey(ACTIVITY_LOGS_STORAGE_KEY), JSON.stringify(nextLogs));
      return nextLogs;
    });

    setActivityState("saving");
    try {
      if (supabaseReady) {
        await saveActivityLogToSupabase(missedActivity);
        await Promise.all([...new Set(staleActivityIds)].map((id) => deleteActivityLogInSupabase(id)));
      }
      setActivityState("saved");
      window.setTimeout(() => setActivityState("idle"), 1800);
      resetEditor();
    } catch {
      setActivityState("error");
    }
  };



  const requestDeleteActivity = () => {

    if (!editingActivityId) return;

    setPendingDeleteActivityId(editingActivityId);

  };

  const confirmDeleteActivity = async () => {

    if (!pendingDeleteActivityId) return;



    const deletingId = pendingDeleteActivityId;

    setActivityLogs((current) => current.filter((activity) => activity.id !== deletingId));

    setActivityState("saving");
    setPendingDeleteActivityId(null);



    try {

      if (supabaseReady) {

        await deleteActivityLogInSupabase(deletingId);

      }



      setActivityState("saved");

      window.setTimeout(() => setActivityState("idle"), 1800);

      resetEditor();

    } catch {

      setActivityState("error");

    }

  };

  const activityFeed = (
    <ActivityFeed
      activityLogs={selectedDayManualActivityLogs}
      timelineItems={selectedDayEventItems}
      grouped
      title={
        logDayKey < currentTodayKey() ? (
          <span className="block w-full max-w-full">
            <Link href={`${historyPath}?date=${logDayKey}`} className="inline-flex w-full max-w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-[#fff4c6] px-3 py-1 text-[clamp(0.86rem,3.9vw,1.12rem)] font-bold leading-6 text-[var(--hewie-active-text)] ring-1 ring-[#ecd98d] sm:px-4">
              <History className="size-4 shrink-0" strokeWidth={2.5} aria-hidden="true" />
              <span>Past Entries:</span>
              <span>{formatLogDayLabel(logDayKey)}</span>
            </Link>
          </span>
        ) : isTodayLog ? (
          "Today's Events"
        ) : (
          formatLogDayLabel(logDayKey)
        )
      }
      subtitle={isTodayLog ? "Events logged today appear here." : ""}
      onSelectActivity={canEditEntries ? openEditorForActivity : undefined}
      careTemplates={careTemplates}
      emptyMessage="No events logged yet. Add an event to get started."
      renderInlineEditor={(activity) =>
        activity.id === editingActivityId || (!editingActivityId && detailActivityType === activity.activityType && activity.happenedAt === selectedDayManualActivityLogs[0]?.happenedAt)
          ? (
              <ActivityDetailForm
                activityType={detailActivityType as Exclude<ActivityType, "pee">}
                detail={detailValue}
                notes={notesValue}
                extraNotes={extraNotesValue}
                happenedAt={happenedAtValue}
                isEditing={Boolean(editingActivityId)}
                embedded
                onDetailChange={setDetailValue}
                onNotesChange={setNotesValue}
                onExtraNotesChange={setExtraNotesValue}
                attachmentFiles={attachmentFiles}
                attachmentNames={activity.attachments?.map((attachment) => attachment.fileName) ?? []}
                onAttachmentsChange={setAttachmentFiles}
                maxAttachmentFiles={detailAttachmentLimit}
                attachmentPickerBlocked={detailAttachmentPickerBlocked}
                attachmentPickerBlockedMessage={detailAttachmentPickerBlockedMessage}
                recordTags={recordTags}
                onRecordTagsChange={setRecordTags}
                onHappenedAtChange={setHappenedAtValue}
                onSave={saveDetailedActivity}
                onCancel={resetEditor}
                onDelete={editingActivityId && canDeleteEntries ? requestDeleteActivity : undefined}
                saveLabel="Save"
                saving={activityState === "saving"}
                savedCareItems={editingActivityId ? [] : careTemplates.filter((item) => item.asNeeded && (item.kind === detailActivityType || (detailActivityType === "sick" && item.kind === "medication") || (detailActivityType === "wellness" && item.kind === "supplement")))}
              />
            )
          : null
      }
      notebookOwnerId={notebookOwnerId}
    />
  );

  const pendingDeleteActivityIsTodayPlanLog = Boolean(
    pendingDeleteActivityId &&
    isTodayLog &&
    selectedDayCustomCareOccurrences.some((occurrence) => customCareStatusForOccurrence(activityLogs, occurrence)?.activity?.id === pendingDeleteActivityId)
  );



  if (!hydrated) {

    return (

      <main className="min-h-screen bg-[var(--hewie-bg)] text-zinc-900">

        <CenteredLoadingIcon className="min-h-screen" />

      </main>

    );

  }



  return (

    <main className="min-h-screen bg-[var(--hewie-bg)] text-zinc-900">

      <div className="content-fade-in mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-24 pt-6">

        <header className="mb-5 px-1 pb-2">

          <div className="flex min-h-[4.5rem] items-center justify-between gap-3">

            <div className="min-w-0 flex-1">

              <PetNotebookTitle href="/notebook" className="text-sm font-bold text-[var(--hewie-active-text)]" />
              <h1 className="mt-1 text-xl font-bold tracking-tight text-[#3b2832]">Manage Plan &amp; Events</h1>

            </div>

            <PetAvatarMenu shape="tile" />

          </div>

        </header>


        {!isTodayLog ? <div data-guide="log-review">{activityFeed}</div> : null}

        {logEventOpen ? (
          <div data-guide="log-events" className="log-event-open-panel relative mb-7 [&>section]:mb-0">
            <QuickLogCard
              activityState={activityState}
              onQuickLog={quickLogActivity}
              title={<LogTitle />}
              accentBackground
              onHeaderClick={collapseLogEvent}
              headerClickLabel="Collapse Log"
            >

            {detailActivityType && !editingActivityId ? (

              <ActivityDetailForm

                activityType={detailActivityType}

                detail={detailValue}

                notes={notesValue}

                extraNotes={extraNotesValue}

                happenedAt={happenedAtValue}

                embedded

                onDetailChange={setDetailValue}

                onNotesChange={setNotesValue}

                onExtraNotesChange={setExtraNotesValue}

                attachmentFiles={attachmentFiles}

                onAttachmentsChange={setAttachmentFiles}
                maxAttachmentFiles={detailAttachmentLimit}
                attachmentPickerBlocked={detailAttachmentPickerBlocked}
                attachmentPickerBlockedMessage={detailAttachmentPickerBlockedMessage}

                recordTags={recordTags}

                onRecordTagsChange={setRecordTags}

                onHappenedAtChange={setHappenedAtValue}

                onSave={saveDetailedActivity}

                onCancel={collapseLogEvent}

                saveLabel="Save"

                saving={activityState === "saving"}

                savedCareItems={careTemplates.filter((item) => item.asNeeded && (item.kind === detailActivityType || (detailActivityType === "sick" && item.kind === "medication") || (detailActivityType === "wellness" && item.kind === "supplement")))}

              />

            ) : null}

            </QuickLogCard>
            <button
              type="button"
              onClick={collapseLogEvent}
              className="absolute inset-x-0 -bottom-4 z-10 mx-auto flex h-7 w-20 items-center justify-center rounded-b-2xl rounded-t-none bg-[var(--hewie-accent)] text-[var(--hewie-accent-text)]/70 shadow-[0_8px_12px_-8px_rgba(15,23,42,0.35)] transition duration-200 ease-out hover:translate-y-0.5 hover:text-[var(--hewie-accent-text)]/90 active:translate-y-1 active:scale-95"
              aria-label="Collapse Log"
            >
              <ChevronDown className="log-event-handle-sheen size-7 opacity-80" strokeWidth={3} aria-hidden="true" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={openLogEvent}
            data-guide="log-events"
            className="group relative mb-7 flex w-full cursor-pointer items-center justify-center overflow-visible rounded-t-3xl rounded-b-[1.35rem] bg-[var(--hewie-accent)] px-5 pb-6 pt-4 text-center text-[var(--hewie-accent-text)] shadow-sm ring-1 ring-[var(--hewie-accent)]/35 transition duration-200 ease-out hover:opacity-95 active:translate-y-0.5 active:scale-[0.985]"
          >
            <h2 className="text-lg"><LogTitle /></h2>
            <div className="pointer-events-none absolute inset-x-0 -bottom-4 flex justify-center">
              <div className="flex h-7 w-20 items-center justify-center rounded-b-2xl rounded-t-none bg-[var(--hewie-accent)] text-[var(--hewie-accent-text)]/70 shadow-[0_8px_12px_-8px_rgba(15,23,42,0.35)] transition duration-200 ease-out group-hover:translate-y-0.5 group-hover:text-[var(--hewie-accent-text)]/90 group-active:translate-y-1">
                <ChevronDown className="log-event-handle-sheen size-7 opacity-80" strokeWidth={3} aria-hidden="true" />
              </div>
            </div>
          </button>
        )}



        {isTodayLog ? <div data-guide="log-review">{activityFeed}</div> : null}



        <div data-guide="log-meal-plan">
          <TodayMealPlanCard
            dayKey={logDayKey}
            isToday={isTodayLog}
            templates={activeTemplates}
            dailyMealState={dailyMealState}
            mealLogs={mealLogs}
            activityLogs={selectedDayActivityLogs}
            careTemplates={careTemplates}
            editingMealTimeId={editingMealTimeId}
            editingMealTimeValue={editingMealTimeValue}
            editingMealStatus={editingMealStatus}
            editingMealNoteValue={editingMealNoteValue}
            editingSkippedCareItemIds={editingSkippedCareItemIds}
            onOpenMealEditor={canEditEntries ? openMealTimeEditor : () => undefined}
            editingActivityId={editingActivityId}
            onOpenOccurrenceEditor={canEditEntries ? openEditorForCustomCareOccurrence : undefined}
            renderScheduledCareEditor={(occurrence, activity) => (
              <div onClick={(event) => event.stopPropagation()}>
                <ActivityDetailForm
                  activityType={detailActivityType as Exclude<ActivityType, "pee">}
                  detail={detailValue}
                  notes={notesValue}
                  extraNotes={extraNotesValue}
                  happenedAt={happenedAtValue}
                  isEditing={Boolean(editingActivityId)}
                  embedded
                  onDetailChange={setDetailValue}
                  onNotesChange={setNotesValue}
                  onExtraNotesChange={setExtraNotesValue}
                  attachmentFiles={attachmentFiles}
                  attachmentNames={activity?.attachments?.map((attachment) => attachment.fileName) ?? []}
                  onAttachmentsChange={setAttachmentFiles}
                  maxAttachmentFiles={detailAttachmentLimit}
                  attachmentPickerBlocked={detailAttachmentPickerBlocked}
                  attachmentPickerBlockedMessage={detailAttachmentPickerBlockedMessage}
                  recordTags={recordTags}
                  onRecordTagsChange={setRecordTags}
                  onHappenedAtChange={setHappenedAtValue}
                  onSave={saveDetailedActivity}
                  onCancel={resetEditor}
                  onDelete={activity && canDeleteEntries ? (isTodayLog ? requestDeleteActivity : () => void markScheduledCareMissed(occurrence, activity)) : undefined}
                  deleteLabel={isTodayLog ? "Undo Log" : "Mark Missed"}
                  saveLabel="Save"
                  saving={activityState === "saving"}
                  savedCareItems={[]}
                  carePlanEditor
                  carePlanTitle={`Edit ${occurrence.item.name.trim() || (occurrence.item.kind === "medication" ? "Medication" : "Supplement")}`}
                />
              </div>
            )}
            onActualTimeChange={setEditingMealTimeValue}
            onMealStatusChange={setEditingMealStatus}
            onFedNoteChange={setEditingMealNoteValue}
            onToggleCareItem={toggleEditingCareItem}
            onSkippedCareItemIdsChange={setEditingSkippedCareItemIds}
            onSaveMeal={saveMealTime}
            onCancelMealEdit={cancelMealTimeEditor}
            onUndoMeal={undoMealFed}
            canUndoMeal={canDeleteEntries}
          />
        </div>



        {pendingUndoMealId !== null ? (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-zinc-950/35 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="undo-meal-title">
            <button type="button" aria-label="Cancel undo meal" className="absolute inset-0 cursor-default" onClick={() => setPendingUndoMealId(null)} />
            <div className="relative w-full max-w-md rounded-3xl bg-white p-4 text-zinc-900 shadow-2xl ring-1 ring-zinc-200">
              <div className="mb-4">
                <h2 id="undo-meal-title" className="text-base font-semibold">{isTodayLog ? "Undo meal log?" : "Mark meal missed?"}</h2>
                <p className="mt-1 text-sm leading-6 text-zinc-500">{isTodayLog ? "Remove this meal log from today's plan?" : "Change this planned meal entry to Missed?"}</p>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" className="rounded-full" onClick={() => setPendingUndoMealId(null)}>
                  Cancel
                </Button>
                <Button type="button" className="rounded-full bg-rose-600 text-white hover:bg-rose-700" onClick={confirmUndoMealFed}>
                  {isTodayLog ? "Undo Log" : "Mark Missed"}
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {pendingDeleteActivityId ? (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-zinc-950/35 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="delete-event-title">
            <button type="button" aria-label="Cancel delete event" className="absolute inset-0 cursor-default" onClick={() => setPendingDeleteActivityId(null)} />
            <div className="relative w-full max-w-md rounded-3xl bg-white p-4 text-zinc-900 shadow-2xl ring-1 ring-zinc-200">
              <div className="mb-4">
                <h2 id="delete-event-title" className="text-base font-semibold">{pendingDeleteActivityIsTodayPlanLog ? "Undo plan log?" : "Delete event?"}</h2>
                <p className="mt-1 text-sm leading-6 text-zinc-500">{pendingDeleteActivityIsTodayPlanLog ? "Remove this log from today's plan item?" : "Delete this event? This cannot be undone."}</p>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" className="rounded-full" onClick={() => setPendingDeleteActivityId(null)}>
                  Cancel
                </Button>
                <Button type="button" className="rounded-full bg-rose-600 text-white hover:bg-rose-700" onClick={confirmDeleteActivity}>
                  {pendingDeleteActivityIsTodayPlanLog ? "Undo Log" : "Delete"}
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        <BottomNav />

      </div>

    </main>

  );

}

export default function LogPage() {
  return (
    <Suspense fallback={<CenteredLoadingIcon className="min-h-screen bg-[var(--hewie-bg)]" />}>
      <LogPageContent />
    </Suspense>
  );
}

