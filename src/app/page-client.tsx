"use client";

import { PetAvatarMenu } from "@/components/pet-avatar-menu";
import {
  Image as ImageIcon,
  Bell,
  ChevronDown,
  StickyNote,
  Tablets,
  TriangleAlert,
} from "lucide-react";
import { type MouseEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ActivityDetailForm } from "@/components/activity-detail-form";
import { ActivityFeed } from "@/components/activity-feed";
import { useAuth } from "@/components/auth-provider";
import { CenteredLoadingIcon } from "@/components/centered-loading-icon";
import { PottyDetailBadges } from "@/components/potty-detail-badges";
import { BottomNav } from "@/components/bottom-nav";
import { MedicationPillIcon } from "@/components/medication-pill-icon";
import { QuickLogCard } from "@/components/quick-log-card";
import { Button } from "@/components/ui/button";
import {
  ACTIVITY_LOGS_STORAGE_KEY,
  currentTodayKey,
  deleteActivityLogInSupabase,
  type ActivityLog,
  type ActivityType,
  type DailyMealState,
  type ManualAlert,
  type MealLog,
  type WeightLog,
  MEAL_LOGS_STORAGE_KEY,
  WEIGHT_LOGS_STORAGE_KEY,
  loadAppState,
  loadFreshAppState,
  loadNotebookEntryPermissions,
  activityAttachmentFileNamesForSave,
  persistLocalState,
  saveActivityLogToSupabase,
  saveActivityAttachmentsToSupabase,
  saveCompletedMealToSupabase,
  saveDailyMealsToSupabase,
  saveMealLogToSupabase,
  saveTemplatesToSupabase,
  saveWeightLogToSupabase,
  updateActivityLogInSupabase,
  updateManualAlertInSupabase,
  TODAY_KEY_STORAGE_KEY,
} from "@/lib/hewster-data";
import {
  type DailyMeal,
  type MealTemplate,
  isInitialMealTemplatePlan,
  isMealTemplateActiveForDay,
} from "@/lib/meal-templates";
import { compareActivitiesReverseChronological, formatActivityLabel, formatActivityTime, renderActivityDetail } from "@/lib/activity";
import { formatManualAlertTimelineDetail, loadReminderAlertRules, resolveAlerts, type ReminderAlertRule } from "@/lib/alerts";
import { getSupabaseBrowserClient, HEWSTER_PROFILE_SLUG, isSupabaseConfigured } from "@/lib/supabase";
import { loadPetProfile } from "@/lib/pet-profile";
import { TEXT_LIMITS, clampText } from "@/lib/text-limits";
import { PetNotebookTitle } from "@/components/pet-notebook-title";
import {
  careItemsForMeal,
  customScheduledCareItems,
  loadCareTemplates,
  loadCareTemplatesFromSupabase,
  mealPlanDoseNumberForMeal,
  mealPlanTotalDoseCount,
  saveCareTemplates,
  saveCareTemplatesToSupabase,
  type CareItemKind,
  type CareItemTemplate,
} from "@/lib/care-settings";

function formatCurrentTime() {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date());
}

function formatHeaderDate() {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());
}

function formatLastUpdated(timestamp: number | null) {
  if (!timestamp) return "No updates yet today";

  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (elapsedMinutes < 1) return "Last updated just now";
  if (elapsedMinutes < 60) return `Last updated ${elapsedMinutes} min ago`;

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `Last updated ${elapsedHours} ${elapsedHours === 1 ? "hr" : "hrs"} ago`;

  return "Last updated today";
}

function displayNameFromEmail(email: string) {
  const localPart = email.split("@")[0] ?? email;
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || email;
}

function compactNameLabel(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  if (parts.length === 1) return parts[0];

  const initials = parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join("");
  return initials || parts[0];
}

function userDisplayName(user: ReturnType<typeof useAuth>["user"]) {
  if (!user) return "";

  const metadata = user.user_metadata ?? {};
  const firstName = typeof metadata.first_name === "string" ? metadata.first_name.trim() : "";
  const lastName = typeof metadata.last_name === "string" ? metadata.last_name.trim() : "";
  const fullName = typeof metadata.full_name === "string" ? metadata.full_name.trim() : "";
  return [firstName, lastName].filter(Boolean).join(" ") || fullName || displayNameFromEmail(user.email ?? "");
}

function currentAlertMinuteKey() {
  const now = new Date();
  return `${currentTodayKey()}-${now.getHours()}:${now.getMinutes()}`;
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
    <div className={`mt-2 whitespace-pre-line rounded-2xl px-3 py-2 text-xs leading-4 ${className}`}>
      {children}
    </div>
  );
}

const DUE_ACTION_WINDOW_MS = 60 * 60 * 1000;
function resolveActivityTypeForSave(activityType: ActivityType, detail: string): ActivityType {
  if (activityType !== "potty") return activityType;

  if (detail === "Pee") return "pee";
  if (detail === "No Poop") return "poop";
  if (detail === "Poop" || detail === "Pee & Poop" || detail.includes("• Type ") || detail.startsWith("Type ")) return "poop";
  return "potty";
}

function isActualPoopRecord(activity: ActivityLog) {
  const detail = activity.detail?.trim() ?? "";
  if (detail === "Pee") return false;
  if (detail === "No Poop") return activity.activityType === "poop" || activity.activityType === "potty";
  if (activity.activityType !== "poop") return false;
  return detail === "Poop" || detail === "Pee & Poop" || detail.includes("• Type ") || detail.startsWith("Type ");
}

function isPottyTimelineActivity(activityType: ActivityType) {
  return ["pee", "poop", "potty"].includes(activityType);
}

function formatPottyTimelineDetail(detail: string | null) {
  return detail?.replace(/\s+•\s+/, "\n") ?? "";
}

function splitActivityNotes(notes: string | null) {
  const lines = notes?.split("\n").map((line) => line.trim()).filter(Boolean) ?? [];
  const attachmentLine = lines.find((line) => line.startsWith("Attachments: ")) ?? null;

  return {
    notesText: lines.filter((line) => line !== attachmentLine).join("\n"),
  };
}

function renderTodayTimelineActivityDetail(activity: ActivityLog) {
  if (isPottyTimelineActivity(activity.activityType)) return formatPottyTimelineDetail(activity.detail);
  if (activity.activityType === "sick") {
    const { notesText } = splitActivityNotes(activity.notes);
    const detail = renderActivityDetail({ ...activity, notes: null });
    return notesText && detail ? `${detail} • Notes: ${notesText}` : detail || notesText;
  }
  if (!activity.attachments?.length) return renderActivityDetail(activity);

  const { notesText } = splitActivityNotes(activity.notes);
  return renderActivityDetail({ ...activity, notes: notesText || null });
}

function careKindLabel(kind: CareItemKind) {
  return kind === "supplement" ? "Supplement" : "Medication";
}

function medicationTypeLabel(item: CareItemTemplate) {
  if (item.kind !== "medication") return null;
  if (item.medicationType === "topical") return "Topical";
  if (item.medicationType === "injection") return "Injection";
  if (item.medicationType === "other") return "Other";
  return "Oral";
}

function customCareFrequencyText(item: CareItemTemplate) {
  const steps = customCareScheduleSteps(item);
  if (steps.length > 1) {
    return `${steps.length} Schedules`;
  }

  if (steps[0]) {
    if (item.ongoing) return `Every ${steps[0].everyHours} Hours • Ongoing`;
    if (item.asNeeded) return `Every ${steps[0].everyHours} Hours • As Needed`;
    return `Every ${steps[0].everyHours} Hours For ${steps[0].forDays} Days`;
  }
  if (item.ongoing) return "";
  return "Schedule Needed";
}

function medicationTypeInlineLabel(item: CareItemTemplate) {
  return medicationTypeLabel(item);
}

function customCareGiveText(item: CareItemTemplate) {
  const medicationType = medicationTypeInlineLabel(item);
  return `Give ${item.dose || "as directed"}${medicationType ? ` (${medicationType})` : ""}`;
}

function customCareTimingLabel(item: CareItemTemplate) {
  if (item.kind === "medication" && item.medicationType !== "oral") return null;
  return item.customTiming === "empty-stomach" ? "Empty Stomach" : "With Food";
}

function mealPlanCareDetailText(item: CareItemTemplate) {
  const dose = item.dose ? ` — ${item.dose}` : "";
  const route = medicationTypeLabel(item);
  const routeText = route ? ` (${route})` : "";
  return `${dose}${routeText}`;
}

function mealPlanCareDetailParts(item: CareItemTemplate) {
  const route = medicationTypeLabel(item);
  return [item.dose.trim(), route ? `(${route})` : ""].filter(Boolean).join(" ");
}

const MAX_MEAL_PLAN_SUPPLEMENTS = 4;

function mealCareNameDose(item: CareItemTemplate) {
  return `${item.name}${item.dose ? ` ${item.dose}` : ""}`;
}

function OpenableClippedText({
  children,
  className = "",
  lines = 1,
  onOpen,
}: {
  children: ReactNode;
  className?: string;
  lines?: 1 | 2;
  onOpen: () => void;
}) {
  return (
    <button type="button" className={`relative block min-w-0 max-w-full text-left ${className}`} onClick={onOpen}>
      <span
        className={lines === 1 ? "block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap" : "block min-w-0 overflow-hidden break-words"}
        style={lines === 1
          ? undefined
          : {
              WebkitBoxOrient: "vertical",
              WebkitLineClamp: lines,
              display: "-webkit-box",
            }}
      >
        {children}
      </span>
    </button>
  );
}

function CompactMealCareSummary({
  items,
  onOpenDetail,
  onOpenNote,
}: {
  items: CareItemTemplate[];
  onOpenDetail: (item: CareItemTemplate) => void;
  onOpenNote: (item: CareItemTemplate) => void;
}) {
  const supplements = items.filter((item) => item.kind === "supplement").slice(0, MAX_MEAL_PLAN_SUPPLEMENTS);
  if (!supplements.length) return null;

  const singleSupplement = supplements.length === 1 ? supplements[0] : null;
  const singleSupplementNote = singleSupplement?.notes?.trim() ?? "";
  const containerClassName = singleSupplement
    ? "mt-1 flex w-full min-w-0 items-center gap-1 overflow-hidden rounded-xl bg-white/34 px-1.5 py-0.5 text-left text-[10.5px] font-bold leading-[11px] text-[#1f3d5c] ring-1 ring-white/35"
    : "mt-1.5 flex w-full min-w-0 items-center gap-1 overflow-hidden rounded-xl bg-white/34 px-1.5 py-0.5 text-left text-[10.5px] font-bold leading-[11px] text-[#1f3d5c] ring-1 ring-white/35";

  return (
    <div className={containerClassName}>
      <span className="inline-flex size-3.5 shrink-0 items-center justify-center rounded-full bg-[#eaf0f8] text-[#1f3d5c] ring-1 ring-[#b8c9dd]">
        <Tablets className="size-2.5" />
      </span>
      <span className="min-w-0 flex-1">
        {singleSupplement ? (
          <OpenableClippedText className="w-full" onOpen={() => onOpenDetail(singleSupplement)}>
            {mealCareNameDose(singleSupplement)}
          </OpenableClippedText>
        ) : (
          <span className="block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{supplements.length} supplements</span>
        )}
      </span>
      {singleSupplement && singleSupplementNote ? (
        <button
          type="button"
          aria-label="Show supplement notes"
          className="inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-[#d8e4f1] text-[#1f3d5c] ring-1 ring-[#8ca8c3]/70"
          onClick={() => onOpenNote(singleSupplement)}
        >
          <StickyNote className="size-2.5" />
        </button>
      ) : null}
    </div>
  );
}

function buildMealLog(meal: DailyMeal, fedNotes: string | null, dayKey: string, skippedCareItemIds: string[] = [], loggedCareItems: MealLog["loggedCareItems"] = []): MealLog {
  return {
    id: `${dayKey}-${meal.id}`,
    profileSlug: HEWSTER_PROFILE_SLUG,
    dayKey,
    mealId: meal.id,
    mealName: meal.name,
    food: meal.food,
    defaultNotes: meal.notes,
    fedNotes,
    skippedCareItemIds,
    loggedCareItems,
    actualTime: meal.actualTime ?? "",
    createdAt: new Date().toISOString(),
  };
}

function mealCareItemsWithDoseBadges(careTemplates: CareItemTemplate[], meal: MealTemplate, meals: MealTemplate[], dayKey: string) {
  return careItemsForMeal(careTemplates, meal.id, meals, dayKey).sort((a, b) => {
    const kindOrder = (item: CareItemTemplate) => item.kind === "medication" ? 0 : 1;
    return kindOrder(a) - kindOrder(b) || a.name.localeCompare(b.name) || a.id - b.id;
  }).map((item) => {
    const doseNumber = mealPlanDoseNumberForMeal(item, meal, meals, dayKey);
    const totalDoses = mealPlanTotalDoseCount(item);
    return {
      ...item,
      isLastDose: Boolean(doseNumber && totalDoses && doseNumber === totalDoses),
    };
  });
}

function mealCareGroupLabel() {
  return "Supplements";
}

function mealExpandedDetailText(careTemplates: CareItemTemplate[], meal: MealTemplate, meals: MealTemplate[], dayKey: string) {
  const mealCareItems = mealCareItemsWithDoseBadges(careTemplates, meal, meals, dayKey);
  const mealCareItemDetails = mealCareItems.map((item) => [item.name, mealPlanCareDetailParts(item), item.notes.trim()].filter(Boolean).join(" — "));

  return [
    meal.food.trim() ? `Food: ${meal.food.trim()}` : null,
    meal.notes.trim() ? `Notes: ${meal.notes.trim()}` : null,
    mealCareItemDetails.length ? `${mealCareGroupLabel()}: ${mealCareItemDetails.join("; ")}` : null,
  ].filter(Boolean).join("\n");
}

function customCareExpandedDetailText(occurrence: CustomCareOccurrence) {
  const timingLabel = customCareTimingLabel(occurrence.item);
  const notes = occurrence.item.notes.trim();

  return [
    `Scheduled for ${occurrence.timeLabel}`,
    customCareGiveText(occurrence.item),
    timingLabel,
    occurrence.frequencyText,
    occurrence.isLastDose ? "Last Dose" : null,
    notes ? `Notes: ${notes}` : null,
  ].filter(Boolean).join("\n");
}

function loggedCareItemsForMeal(careTemplates: CareItemTemplate[], meal: MealTemplate, meals: MealTemplate[], dayKey: string, skippedCareItemIds: string[] = []) {
  return mealCareItemsWithDoseBadges(careTemplates, meal, meals, dayKey).map((item) => ({
    ...item,
    skipped: skippedCareItemIds.includes(`${item.kind}-${item.id}`),
  }));
}

function missedMealLogId(dayKey: string, mealId: number) {
  return `${dayKey}-${mealId}-missed`;
}

function buildMissedMealLog(template: MealTemplate, dayKey: string, skippedCareItemIds: string[] = [], loggedCareItems: MealLog["loggedCareItems"] = []): MealLog {
  return {
    id: missedMealLogId(dayKey, template.id),
    profileSlug: HEWSTER_PROFILE_SLUG,
    dayKey,
    mealId: template.id,
    mealName: template.name,
    food: template.food,
    defaultNotes: template.notes,
    fedNotes: "Missed",
    skippedCareItemIds,
    loggedCareItems,
    actualTime: template.plannedTime,
    createdAt: new Date().toISOString(),
  };
}

function buildSkippedMealLog(template: MealTemplate, dayKey: string, skippedCareItemIds: string[] = [], loggedCareItems: MealLog["loggedCareItems"] = []): MealLog {
  return {
    id: `${dayKey}-${template.id}`,
    profileSlug: HEWSTER_PROFILE_SLUG,
    dayKey,
    mealId: template.id,
    mealName: template.name,
    food: template.food,
    defaultNotes: template.notes,
    fedNotes: "Skipped",
    skippedCareItemIds,
    loggedCareItems,
    actualTime: template.plannedTime,
    createdAt: new Date().toISOString(),
  };
}

function isMissedMealLog(meal: MealLog) {
  return meal.fedNotes === "Missed" || meal.id.endsWith("-missed");
}


function parseClockMinutes(value: string) {
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

  if (meridiem === "PM" && hours !== 12) hours += 12;
  if (meridiem === "AM" && hours === 12) hours = 0;

  return hours * 60 + minutes;
}

function mealScheduledAtForSort(meal: DailyMeal, allMealsDone: boolean) {
  const scheduledAt = new Date();
  const minutes = parseClockMinutes(meal.plannedTime);
  if (minutes === Number.MAX_SAFE_INTEGER) return scheduledAt;

  scheduledAt.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  if (allMealsDone) scheduledAt.setDate(scheduledAt.getDate() + 1);
  return scheduledAt;
}

function mealScheduledAtForDay(meal: Pick<MealTemplate, "plannedTime">, dayKey: string) {
  const scheduledAt = dateFromDayKey(dayKey);
  const minutes = parseClockMinutes(meal.plannedTime);
  if (minutes === Number.MAX_SAFE_INTEGER) return scheduledAt;

  scheduledAt.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return scheduledAt;
}

function dayKeyFromDate(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function scheduleTimeLabel(scheduledAt: Date, fallbackTimeLabel: string, activeTodayKey: string) {
  const scheduledDayKey = dayKeyFromDate(scheduledAt);
  if (scheduledDayKey === activeTodayKey) return fallbackTimeLabel;
  if (scheduledDayKey === nextDayKey(activeTodayKey)) return `Tomorrow, ${fallbackTimeLabel}`;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(scheduledAt);
}

function dateFromDayKey(dayKey: string) {
  const [year, month, day] = dayKey.split("-").map(Number);
  if (!year || !month || !day) return new Date();
  return new Date(year, month - 1, day);
}

function sortMsForClockTime(dayKey: string, time: string) {
  const minutes = parseClockMinutes(time);
  const date = dateFromDayKey(dayKey);
  if (minutes === Number.MAX_SAFE_INTEGER) return date.getTime();

  date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return date.getTime();
}

function attachmentDocumentTypesForActivity(activityType: ActivityType) {
  return activityType === "poop" || activityType === "potty" ? ["Potty Image"] : ["Medical Attachment"];
}

async function openPoopRecordAttachment(filePath: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;

  const { data, error } = await supabase.storage
    .from("pet-attachments")
    .createSignedUrl(filePath, 60 * 10);

  if (error || !data?.signedUrl) {
    console.warn("Could not open poop image", error);
    return;
  }

  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}

function PoopRecordImageLinks({ activity, className = "" }: { activity: ActivityLog; className?: string }) {
  const attachments = activity.attachments ?? [];
  if (!attachments.length) return null;

  return (
    <div className={`flex flex-wrap justify-end gap-2 ${className}`}>
      {attachments.map((attachment, index) => (
        <button
          key={attachment.id}
          type="button"
          aria-label={`Open image${attachments.length > 1 ? ` ${index + 1}` : ""}`}
          title={`Open image${attachments.length > 1 ? ` ${index + 1}` : ""}`}
          onClick={(event) => {
            event.stopPropagation();
            void openPoopRecordAttachment(attachment.filePath);
          }}
          className="inline-flex size-8 items-center justify-center rounded-lg bg-[#4f2f1b]/95 text-[#f6d978] shadow-sm shadow-[#4f2f1b]/15 ring-1 ring-[#f6d978]/45 transition hover:bg-[#5b3720]"
        >
          <ImageIcon className="size-3.5 shrink-0" />
        </button>
      ))}
    </div>
  );
}

type CustomCareOccurrence = {
  key: string;
  item: CareItemTemplate;
  scheduledAt: Date;
  timeLabel: string;
  frequencyText: string;
  isLastDose: boolean;
};

type UpcomingScheduleCard =
  | { type: "meal"; sortMinutes: number; sortAt: Date; sortKey: string; meal: DailyMeal }
  | { type: "custom-care"; sortMinutes: number; sortAt: Date; sortKey: string; occurrence: CustomCareOccurrence };

function scheduleCardTimeMs(card: UpcomingScheduleCard) {
  return card.sortAt.getTime();
}

function sortUpcomingScheduleCards(cards: UpcomingScheduleCard[]) {
  return [...cards].sort((a, b) => scheduleCardTimeMs(a) - scheduleCardTimeMs(b) || a.sortKey.localeCompare(b.sortKey));
}

function upcomingScheduleCardTitle(card: UpcomingScheduleCard) {
  return card.type === "meal" ? card.meal.name : card.occurrence.item.name;
}

function upcomingScheduleCardKindLabel(card: UpcomingScheduleCard) {
  if (card.type === "meal") return "Meal";
  return card.occurrence.item.kind === "supplement" ? "Supplement" : "Medication";
}

type CustomCareStatusValue = "given" | "skipped" | "missed" | { status: "given" | "skipped" | "missed"; note?: string };
type CustomCareStatus = Record<string, CustomCareStatusValue>;

const CUSTOM_CARE_STATUS_STORAGE_KEY = "hewster.customCareStatus";

function loadCustomCareStatus(): CustomCareStatus {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CUSTOM_CARE_STATUS_STORAGE_KEY) ?? "{}");
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
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
        frequencyText: `Every ${step.everyHours} Hours For ${step.forDays} Days`,
      });
    }
  });

  return offsets;
}

function dateFromDateTimeLocal(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function sameScheduledMinute(first: Date, second: Date) {
  return Math.abs(first.getTime() - second.getTime()) < 60 * 1000;
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

        return [
          {
            key: `${item.kind}-${item.id}-schedule-daily-${scheduledAt.toISOString()}`,
            item,
            scheduledAt,
            timeLabel: formatActivityTime(scheduledAt.toISOString()),
            frequencyText: "",
            isLastDose: false,
          },
        ];
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
            frequencyText: `Every ${step.everyHours} Hours • Ongoing`,
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

      return [
        {
          key: `${item.kind}-${item.id}-schedule-${offset.stepIndex + 1}-dose-${offset.doseIndex + 1}-${scheduledAt.toISOString()}`,
          item,
          scheduledAt,
          timeLabel: formatActivityTime(scheduledAt.toISOString()),
          frequencyText: offset.frequencyText,
          isLastDose: offset.offsetHours === lastOffsetHours,
        },
      ];
    });

  }).sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
}

function nextDayKey(dayKey: string) {
  const [year, month, day] = dayKey.split("-").map(Number);
  const date = new Date(year, month - 1, day + 1);
  return dayKeyFromDate(date);
}

function firstCustomCareOccurrencePerItem(occurrences: CustomCareOccurrence[]) {
  const seen = new Set<string>();
  return occurrences.filter((occurrence) => {
    const itemKey = `${occurrence.item.kind}-${occurrence.item.id}`;
    if (seen.has(itemKey)) return false;
    seen.add(itemKey);
    return true;
  });
}

function activityMatchesCustomCareOccurrence(activity: ActivityLog, occurrence: CustomCareOccurrence) {
  if (activity.activityType !== occurrence.item.kind) return false;

  const activityAt = new Date(activity.happenedAt);
  if (Number.isNaN(activityAt.getTime())) return false;

  const sameScheduledMinute = Math.abs(activityAt.getTime() - occurrence.scheduledAt.getTime()) < 60 * 1000;
  if (!sameScheduledMinute) return false;

  const detail = activity.detail ?? "";
  return detail.toLowerCase().startsWith(occurrence.item.name.toLowerCase());
}

function activityMatchesMealLinkedCareTimeline(
  activity: ActivityLog,
  item: CareItemTemplate,
  mealAt: Date,
  mealId: MealTemplate["id"],
  dayKey: string,
  itemOccurrenceCount: number
) {
  if (activity.activityType !== item.kind) return false;

  const activityAt = new Date(activity.happenedAt);
  if (Number.isNaN(activityAt.getTime())) return false;
  if (dayKeyFromDate(activityAt) !== dayKey) return false;

  const expectedId = `${item.kind}-${item.id}-meal-${mealId}-${dayKey}`;
  if (activity.id === expectedId || activity.id === `${expectedId}-skipped` || activity.id === `${expectedId}-missed`) return true;

  const detail = (activity.detail ?? "").trim().toLowerCase();
  const itemName = item.name.trim().toLowerCase();
  if (!itemName || !detail.startsWith(itemName)) return false;

  if (itemOccurrenceCount <= 1) return true;
  return Math.abs(activityAt.getTime() - mealAt.getTime()) < 60 * 1000;
}

function customCareDisplayDate(activity: ActivityLog) {
  return new Date(activity.happenedAt);
}

function customCareActivityLog(occurrence: CustomCareOccurrence, status: "given" | "skipped" | "missed", note = "", happenedAt = occurrence.scheduledAt): ActivityLog {
  const { item } = occurrence;
  const statusDetail = status === "given" ? "" : status === "skipped" ? " Skipped" : " Missed";
  const statusNote = status === "given" ? "" : status === "skipped" ? (note ? `Skip Note: ${note}` : "") : "Missed";

  return {
    id: status === "given" ? occurrence.key : `${occurrence.key}-${status}`,
    profileSlug: HEWSTER_PROFILE_SLUG,
    activityType: item.kind,
    happenedAt: happenedAt.toISOString(),
    detail: `${item.name}${item.dose && status === "given" ? ` • ${item.dose}` : ""}${statusDetail}`,
    notes: [customCareGiveText(item), occurrence.frequencyText, occurrence.isLastDose ? "Last Dose" : null, customCareTimingLabel(item), item.kind === "medication" ? medicationTypeLabel(item) : null, statusNote, item.notes ? `Notes: ${item.notes}` : ""].filter(Boolean).join("\n") || null,
    createdAt: new Date().toISOString(),
  };
}

function activityHasLastDoseMarker(activity: ActivityLog) {
  return activity.notes?.split("\n").some((line) => line.trim() === "Last Dose") ?? false;
}

function activityMatchesLastDoseOccurrence(activity: ActivityLog, occurrence: CustomCareOccurrence) {
  return (
    occurrence.isLastDose &&
    (activity.id === occurrence.key || activity.id === `${occurrence.key}-skipped` || activity.id === `${occurrence.key}-missed` || activityMatchesCustomCareOccurrence(activity, occurrence))
  );
}

function withLastDoseMarker(activity: ActivityLog) {
  return {
    ...activity,
    notes: [activity.notes, "Last Dose"].filter(Boolean).join("\n"),
  };
}

type HewsterBridgePayload = {
  weightLogs?: WeightLog[];
  supplementSettings?: CareItemTemplate[];
  medicationSettings?: CareItemTemplate[];
};

const HEWSTER_BRIDGE_SOURCE = "https://lindy.b-average.com";

function parseStoredArray<T>(value: string | null): T[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function buildBridgePayload(): HewsterBridgePayload {
  return {
    weightLogs: parseStoredArray<WeightLog>(window.localStorage.getItem(WEIGHT_LOGS_STORAGE_KEY)),
    supplementSettings: parseStoredArray<CareItemTemplate>(window.localStorage.getItem("hewster.supplementSettings")),
    medicationSettings: parseStoredArray<CareItemTemplate>(window.localStorage.getItem("hewster.medicationSettings")),
  };
}

async function importBridgePayload(payload: HewsterBridgePayload) {
  const incomingWeights = Array.isArray(payload.weightLogs) ? payload.weightLogs : [];
  const existingWeights = parseStoredArray<WeightLog>(window.localStorage.getItem(WEIGHT_LOGS_STORAGE_KEY));
  const mergedWeights = [...incomingWeights, ...existingWeights]
    .filter((entry) => entry && typeof entry.id === "string" && typeof entry.date === "string" && typeof entry.weight === "string")
    .filter((entry, index, all) => index === all.findIndex((candidate) => candidate.id === entry.id));

  if (mergedWeights.length > existingWeights.length) {
    window.localStorage.setItem(WEIGHT_LOGS_STORAGE_KEY, JSON.stringify(mergedWeights));
    await Promise.all(mergedWeights.map((entry) => saveWeightLogToSupabase(entry))).catch(() => undefined);
  }

  const careImports: Array<[CareItemKind, CareItemTemplate[] | undefined]> = [
    ["supplement", payload.supplementSettings],
    ["medication", payload.medicationSettings],
  ];

  await Promise.all(
    careImports.map(async ([kind, items]) => {
      if (!Array.isArray(items) || !items.length) return;

      const existingItems = loadCareTemplates(kind);
      const merged = new Map<number, CareItemTemplate>();
      existingItems.forEach((item) => merged.set(item.id, item));
      items.forEach((item) => merged.set(item.id, item));
      const nextItems = [...merged.values()];

      if (nextItems.length < existingItems.length) return;

      saveCareTemplates(kind, nextItems);
      await saveCareTemplatesToSupabase(kind, nextItems);
    })
  ).catch(() => undefined);
}

export default function HomeApp() {
  const { loading: authLoading, user } = useAuth();
  const [templates, setTemplates] = useState<MealTemplate[]>([]);
  const [dailyMealState, setDailyMealState] = useState<DailyMealState[]>(
    []
  );
  const [detailActivityType, setDetailActivityType] = useState<ActivityType | null>(null);
  const [editingActivityId, setEditingActivityId] = useState<string | null>(null);
  const [detailValue, setDetailValue] = useState("");
  const [notesValue, setNotesValue] = useState("");
  const [extraNotesValue, setExtraNotesValue] = useState("");
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [recordTags, setRecordTags] = useState<string[]>([]);
  const [happenedAtValue, setHappenedAtValue] = useState(() =>
    new Intl.DateTimeFormat("en-CA", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date())
  );
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [manualAlerts, setManualAlerts] = useState<ManualAlert[]>([]);
  const [mealLogs, setMealLogs] = useState<MealLog[]>([]);
  const [supplementTemplates, setSupplementTemplates] = useState<CareItemTemplate[]>([]);
  const [medicationTemplates, setMedicationTemplates] = useState<CareItemTemplate[]>([]);
  const [reminderRules, setReminderRules] = useState<ReminderAlertRule[]>([]);
  const [mealActionState, setMealActionState] = useState<"idle" | "saved" | "saving" | "error">("idle");
  const [activityState, setActivityState] = useState<"idle" | "saved" | "saving" | "error">("idle");
  const [hydrated, setHydrated] = useState(false);
  const [headerDateTime, setHeaderDateTime] = useState("");
  const [alertMinuteKey, setAlertMinuteKey] = useState("");
  const [todayKey, setTodayKey] = useState("");
  const [customCareStatus, setCustomCareStatus] = useState<CustomCareStatus>({});
  const [poopRecordsWindowDays, setPoopRecordsWindowDays] = useState<3 | 7>(3);
  const [customCareSkipKey, setCustomCareSkipKey] = useState<string | null>(null);
  const [customCareSkipNotes, setCustomCareSkipNotes] = useState<Record<string, string>>({});
  const [upcomingOverflowExpanded, setUpcomingOverflowExpanded] = useState(false);
  const [upcomingNoteModal, setUpcomingNoteModal] = useState<{
    title: string;
    subtitle: string;
    label?: string;
    text: string;
    sections?: { id?: string; label: string; text: string }[];
    tone: {
      panel: string;
      closeButton: string;
      noteBox: string;
    };
  } | null>(null);
  const [expandedAlertDetails, setExpandedAlertDetails] = useState<Record<string, boolean>>({});
  const [petRemembered, setPetRemembered] = useState(false);
  const [canDeleteEntries, setCanDeleteEntries] = useState(true);
  const [notebookDataUnavailable, setNotebookDataUnavailable] = useState(false);
  const [notebookOwnerId, setNotebookOwnerId] = useState<string | null>(null);
  const initialLoadComplete = useRef(false);
  const activitySaveInFlightRef = useRef(false);
  const previousTodayKeyRef = useRef<string | null>(null);
  const missedRolloverRef = useRef<string | null>(null);
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
    let cancelled = false;
    const refreshPermissions = () => {
      void loadNotebookEntryPermissions().then((permissions) => {
        if (!cancelled) setCanDeleteEntries(permissions.canDeleteEntries);
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

  const applySharedNotebookState = useCallback((state: Awaited<ReturnType<typeof loadAppState>>) => {
    const hasOnlySeedState = supabaseReady && (state.source === "seed" || (state.source === "local" && isInitialMealTemplatePlan(state.templates)));

    setNotebookDataUnavailable(hasOnlySeedState);
    if (hasOnlySeedState) {
      setTemplates([]);
      setDailyMealState([]);
      setActivityLogs([]);
      setManualAlerts([]);
      setMealLogs([]);
      setTodayKey(state.todayKey);
      setNotebookOwnerId(state.notebookOwnerId ?? user?.id ?? null);
      return;
    }

    setTemplates(state.templates);
    const activeTemplates = state.templates.filter((template) => isMealTemplateActiveForDay(template, state.todayKey));
    setDailyMealState(
      activeTemplates.map((template) => {
        const existing = state.dailyMealState.find((entry) => entry.mealId === template.id);
        return (
          existing ?? {
            mealId: template.id,
            actualTime: null,
            status: "upcoming" as const,
            fedNotes: null,
            skippedCareItemIds: [],
            dayKey: state.todayKey,
          }
        );
      })
    );
    setActivityLogs(state.activityLogs);
    setManualAlerts(state.manualAlerts ?? []);
    setMealLogs(state.mealLogs ?? []);
    setTodayKey(state.todayKey);
    setNotebookOwnerId(state.notebookOwnerId ?? user?.id ?? null);
  }, [supabaseReady, user?.id]);

  useEffect(() => {
    const handleBridgeRequest = (event: MessageEvent) => {
      if (event.data?.type !== "hewster:export-local-state") return;
      if (event.origin !== "https://www.petnotebook.com" && event.origin !== "https://petnotebook.com") return;
      event.source?.postMessage({ type: "hewster:local-state", payload: buildBridgePayload() }, { targetOrigin: event.origin });
    };

    if (window.parent !== window) {
      window.addEventListener("message", handleBridgeRequest);
      return () => window.removeEventListener("message", handleBridgeRequest);
    }

    if (window.location.hostname !== "www.petnotebook.com" && window.location.hostname !== "petnotebook.com") return;

    const iframe = document.createElement("iframe");
    iframe.src = `${HEWSTER_BRIDGE_SOURCE}/hewie?hewsterBridge=1`;
    iframe.title = "PetNoteBook local data bridge";
    iframe.style.display = "none";

    const handleBridgeResponse = (event: MessageEvent) => {
      if (event.origin !== HEWSTER_BRIDGE_SOURCE || event.data?.type !== "hewster:local-state") return;
      void importBridgePayload(event.data.payload as HewsterBridgePayload).then(() => {
        window.dispatchEvent(new CustomEvent("hewster:care-settings-updated"));
      });
    };

    iframe.addEventListener("load", () => {
      iframe.contentWindow?.postMessage({ type: "hewster:export-local-state" }, HEWSTER_BRIDGE_SOURCE);
    });
    window.addEventListener("message", handleBridgeResponse);
    document.body.appendChild(iframe);

    return () => {
      window.removeEventListener("message", handleBridgeResponse);
      iframe.remove();
    };
  }, []);

  useEffect(() => {
    if (supabaseReady && authLoading) return;

    let cancelled = false;

    async function hydrate() {
      try {
        previousTodayKeyRef.current = window.localStorage.getItem(TODAY_KEY_STORAGE_KEY);
        const state = await loadAppState();
        if (cancelled) return;

        applySharedNotebookState(state);
        const [supplements, medications] = await Promise.all([
          loadCareTemplatesFromSupabase("supplement"),
          loadCareTemplatesFromSupabase("medication"),
        ]);
        setSupplementTemplates(supplements);
        setMedicationTemplates(medications);
        setCustomCareStatus(loadCustomCareStatus());
        setReminderRules(loadReminderAlertRules());
        setHeaderDateTime(formatHeaderDate());
        setAlertMinuteKey(currentAlertMinuteKey());
      } catch {
        if (cancelled) return;
        setNotebookDataUnavailable(true);
        setTemplates([]);
        setDailyMealState([]);
        setHeaderDateTime(formatHeaderDate());
        setAlertMinuteKey(currentAlertMinuteKey());
        setTodayKey((current) => current || currentTodayKey());
        setSupplementTemplates(loadCareTemplates("supplement"));
        setMedicationTemplates(loadCareTemplates("medication"));
        setReminderRules(loadReminderAlertRules());
      } finally {
        if (!cancelled) {
          initialLoadComplete.current = true;
          setHydrated(true);
        }
      }
    }

    hydrate();

    return () => {
      cancelled = true;
    };
  }, [applySharedNotebookState, authLoading, supabaseReady]);

  useEffect(() => {
    if (!hydrated || !initialLoadComplete.current) return;
    if (notebookDataUnavailable) return;

    persistLocalState(templates, dailyMealState, activityLogs, undefined, todayKey, manualAlerts, mealLogs);
  }, [templates, dailyMealState, activityLogs, hydrated, todayKey, manualAlerts, mealLogs, notebookDataUnavailable]);

  useEffect(() => {
    if (!hydrated) return;

    let cancelled = false;

    const refreshSharedNotebookState = async () => {
      if (document.visibilityState === "hidden") return;

      try {
        const state = await loadFreshAppState();
        if (cancelled) return;
        applySharedNotebookState(state);
        setAlertMinuteKey(currentAlertMinuteKey());
      } catch {
        // Keep the current notebook view if the refresh is temporarily unavailable.
      }
    };

    const refreshOnVisibility = () => {
      if (document.visibilityState === "visible") {
        void refreshSharedNotebookState();
      }
    };

    const refreshInterval = window.setInterval(() => {
      void refreshSharedNotebookState();
    }, 20_000);

    window.addEventListener("focus", refreshSharedNotebookState);
    window.addEventListener("hewster:meal-templates-updated", refreshSharedNotebookState);
    window.addEventListener("petnotebook-active-notebook-updated", refreshSharedNotebookState);
    document.addEventListener("visibilitychange", refreshOnVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(refreshInterval);
      window.removeEventListener("focus", refreshSharedNotebookState);
      window.removeEventListener("hewster:meal-templates-updated", refreshSharedNotebookState);
      window.removeEventListener("petnotebook-active-notebook-updated", refreshSharedNotebookState);
      document.removeEventListener("visibilitychange", refreshOnVisibility);
    };
  }, [applySharedNotebookState, hydrated]);

  useEffect(() => {
    const refreshCareSettings = () => {
      setSupplementTemplates(loadCareTemplates("supplement"));
      setMedicationTemplates(loadCareTemplates("medication"));
      void Promise.all([loadCareTemplatesFromSupabase("supplement"), loadCareTemplatesFromSupabase("medication")]).then(([supplements, medications]) => {
        setSupplementTemplates(supplements);
        setMedicationTemplates(medications);
      });
      setCustomCareStatus(loadCustomCareStatus());
    };

    window.addEventListener("focus", refreshCareSettings);
    window.addEventListener("hewster:care-settings-updated", refreshCareSettings);
    document.addEventListener("visibilitychange", refreshCareSettings);

    return () => {
      window.removeEventListener("focus", refreshCareSettings);
      window.removeEventListener("hewster:care-settings-updated", refreshCareSettings);
      document.removeEventListener("visibilitychange", refreshCareSettings);
    };
  }, []);

  useEffect(() => {
    if (!hydrated || !initialLoadComplete.current) return;
    if (notebookDataUnavailable) return;

    let cancelled = false;

    async function persistTemplates() {
      try {
        if (!templates.length) return;
        if (supabaseReady) {
          await saveTemplatesToSupabase(templates);
        }
      } catch {
        if (cancelled) return;
      }
    }

    persistTemplates();

    return () => {
      cancelled = true;
    };
  }, [templates, hydrated, supabaseReady, notebookDataUnavailable]);

  useEffect(() => {
    if (!hydrated || mealActionState === "idle") return;

    let cancelled = false;
    let timeout: number | null = null;

    async function persistDailyMeals() {
      if (mealActionState === "saved") {
        timeout = window.setTimeout(() => {
          if (!cancelled) {
            setMealActionState("idle");
          }
        }, 1800);
        return;
      }

      setMealActionState("saving");

      try {
        if (supabaseReady) {
          await saveDailyMealsToSupabase(dailyMealState);
        }

        if (!cancelled) {
          setMealActionState("saved");
        }
      } catch {
        if (!cancelled) {
          setMealActionState("error");
        }
      }
    }

    void persistDailyMeals();

    return () => {
      cancelled = true;
      if (timeout !== null) {
        window.clearTimeout(timeout);
      }
    };
  }, [dailyMealState, hydrated, mealActionState, supabaseReady]);

  useEffect(() => {
    const activeTodayKey = todayKey || currentTodayKey();
    const activeTemplates = templates.filter((template) => isMealTemplateActiveForDay(template, activeTodayKey));

    setDailyMealState((current) => {
      const existingById = new Map(current.map((entry) => [entry.mealId, entry]));
      return activeTemplates.map((template) => {
        const existing = existingById.get(template.id);
        return (
          existing ?? {
            mealId: template.id,
            actualTime: null,
            status: "upcoming" as const,
            fedNotes: null,
            skippedCareItemIds: [],
            dayKey: activeTodayKey,
          }
        );
      });
    });
  }, [templates, todayKey]);

  useEffect(() => {
    if (petRemembered) return;
    const resetForNewDay = () => {
      setHeaderDateTime(formatHeaderDate());
      setAlertMinuteKey(currentAlertMinuteKey());
      const nextTodayKey = currentTodayKey();

      if (todayKey && nextTodayKey !== todayKey) {
        const activeTemplatesForPreviousDay = templates.filter((template) => isMealTemplateActiveForDay(template, todayKey));
        const activeTemplatesForNextDay = templates.filter((template) => isMealTemplateActiveForDay(template, nextTodayKey));
        const missedMealLogs = activeTemplatesForPreviousDay.flatMap((template) => {
          const mealState = dailyMealState.find((entry) => entry.mealId === template.id && (entry.dayKey ?? todayKey) === todayKey);
          if (mealState?.status === "done") return [];
          const skippedCareItemIds = mealState?.skippedCareItemIds ?? [];
          const rolloverCareTemplates = [...supplementTemplates, ...medicationTemplates];
          return [buildMissedMealLog(template, todayKey, skippedCareItemIds, loggedCareItemsForMeal(rolloverCareTemplates, template, activeTemplatesForPreviousDay, todayKey, skippedCareItemIds))];
        });

        if (missedMealLogs.length) {
          setMealLogs((current) => {
            const missedKeys = new Set(missedMealLogs.map((meal) => meal.id));
            const fedKeys = new Set(missedMealLogs.map((meal) => `${meal.dayKey}-${meal.mealId}`));
            const nextLogs = [
              ...missedMealLogs,
              ...current.filter((entry) => !missedKeys.has(entry.id) && !(fedKeys.has(entry.id) && !isMissedMealLog(entry))),
            ];
            window.localStorage.setItem(MEAL_LOGS_STORAGE_KEY, JSON.stringify(nextLogs));
            return nextLogs;
          });

          if (supabaseReady) {
            void Promise.all(missedMealLogs.map((mealLog) => saveMealLogToSupabase(mealLog))).catch(() => setMealActionState("error"));
          }
        }

        setTodayKey(nextTodayKey);
        setDailyMealState(
          activeTemplatesForNextDay.map((template) => ({
            mealId: template.id,
            actualTime: null,
            status: "upcoming" as const,
            fedNotes: null,
            skippedCareItemIds: [],
            dayKey: nextTodayKey,
          }))
        );
        setMealActionState("idle");
      }
    };

    resetForNewDay();

    const interval = window.setInterval(resetForNewDay, 60000);
    window.addEventListener("focus", resetForNewDay);
    document.addEventListener("visibilitychange", resetForNewDay);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", resetForNewDay);
      document.removeEventListener("visibilitychange", resetForNewDay);
    };
  }, [dailyMealState, medicationTemplates, petRemembered, supplementTemplates, supabaseReady, templates, todayKey]);

  const todayMealState = useMemo(() => {
    const activeTodayKey = todayKey || currentTodayKey();
    return dailyMealState.filter((entry) => (entry.dayKey ?? activeTodayKey) === activeTodayKey);
  }, [dailyMealState, todayKey]);

  const dailyMeals = useMemo<DailyMeal[]>(() => {
    const activeTodayKey = todayKey || currentTodayKey();
    const activeTemplates = templates.filter((template) => isMealTemplateActiveForDay(template, activeTodayKey));
    const stateByMealId = new Map(todayMealState.map((entry) => [entry.mealId, entry]));
    const loggedMealsById = new Map(
      mealLogs
        .filter((mealLog) => mealLog.dayKey === activeTodayKey && !isMissedMealLog(mealLog))
        .map((mealLog) => [mealLog.mealId, mealLog])
    );

    const activeMeals = activeTemplates.map((template) => {
      const existing = stateByMealId.get(template.id);
      const loggedMeal = loggedMealsById.get(template.id);
      return {
        ...template,
        name: loggedMeal?.mealName || template.name,
        food: loggedMeal?.food || template.food,
        notes: loggedMeal?.defaultNotes ?? template.notes,
        actualTime: existing?.actualTime ?? loggedMeal?.actualTime ?? null,
        status: existing?.status ?? "upcoming",
      };
    });

    const activeMealIds = new Set(activeMeals.map((meal) => meal.id));
    const loggedOnlyMeals = [...loggedMealsById.values()]
      .filter((mealLog) => !activeMealIds.has(mealLog.mealId))
      .map((mealLog) => ({
        id: mealLog.mealId,
        name: mealLog.mealName || "Meal",
        plannedTime: mealLog.actualTime,
        food: mealLog.food,
        notes: mealLog.defaultNotes,
        actualTime: mealLog.actualTime,
        status: "done" as const,
      }));

    return [...activeMeals, ...loggedOnlyMeals].sort((a, b) => parseClockMinutes(a.plannedTime) - parseClockMinutes(b.plannedTime) || a.id - b.id);
  }, [mealLogs, templates, todayMealState, todayKey]);

  const missedMealIds = useMemo(() => {
    void alertMinuteKey;

    const activeTodayKey = todayKey || currentTodayKey();
    const nowMs = Date.now();
    const templateById = new Map(templates.map((template) => [template.id, template]));
    return new Set(
      mealLogs
        .filter((mealLog) => mealLog.dayKey === activeTodayKey && isMissedMealLog(mealLog))
        .filter((mealLog) => {
          const template = templateById.get(mealLog.mealId);
          const scheduledTime = template?.plannedTime ?? mealLog.actualTime;
          return sortMsForClockTime(activeTodayKey, scheduledTime) <= nowMs;
        })
        .map((mealLog) => mealLog.mealId)
    );
  }, [alertMinuteKey, mealLogs, templates, todayKey]);
  const careTemplates = useMemo(
    () => [...supplementTemplates, ...medicationTemplates],
    [supplementTemplates, medicationTemplates]
  );
  const customCareOccurrences = useMemo(() => {
    void alertMinuteKey;
    const activeTodayKey = todayKey || currentTodayKey();
    const loggedCareActivityIds = new Set(activityLogs.map((activity) => activity.id));
    const isUnresolved = (occurrence: CustomCareOccurrence) => {
      const statusValue = customCareStatus[occurrence.key];
      const status = typeof statusValue === "string" ? statusValue : statusValue?.status;
      const isTodayOccurrence = dayKeyFromDate(occurrence.scheduledAt) === activeTodayKey;
      const hasGiven = status === "given" || loggedCareActivityIds.has(occurrence.key);
      const hasSkipped = status === "skipped" || loggedCareActivityIds.has(`${occurrence.key}-skipped`);
      const hasMissed = status === "missed" || loggedCareActivityIds.has(`${occurrence.key}-missed`);
      const hasResolvedActivity = activityLogs.some(
        (activity) => activityMatchesCustomCareOccurrence(activity, occurrence) && !/\bMissed\b/i.test(activity.detail ?? "")
      );

      if (hasGiven || hasSkipped || hasResolvedActivity) return false;
      if (hasMissed && !isTodayOccurrence) return false;
      return true;
    };
    const todayOccurrences = customCareOccurrencesForDay(careTemplates, activeTodayKey).filter(isUnresolved);
    const tomorrowOccurrences = firstCustomCareOccurrencePerItem(customCareOccurrencesForDay(careTemplates, nextDayKey(activeTodayKey))).filter(isUnresolved);

    return [...todayOccurrences, ...tomorrowOccurrences];
  }, [activityLogs, careTemplates, customCareStatus, todayKey, alertMinuteKey]);

  useEffect(() => {
    if (!hydrated || !careTemplates.length) return;

    const activeTodayKey = todayKey || currentTodayKey();
    const existingActivityIds = new Set(activityLogs.map((activity) => activity.id));
    const repairedActivities = customCareOccurrencesForDay(careTemplates, activeTodayKey)
      .flatMap((occurrence) => {
        const statusValue = customCareStatus[occurrence.key];
        const status = typeof statusValue === "string" ? statusValue : statusValue?.status;
        if (!status) return [];

        const expectedActivityId = status === "given" ? occurrence.key : `${occurrence.key}-${status}`;
        const hasActivity =
          existingActivityIds.has(expectedActivityId) ||
          activityLogs.some((activity) => activityMatchesCustomCareOccurrence(activity, occurrence));

        if (hasActivity) return [];

        const note = typeof statusValue === "string" ? "" : statusValue?.note ?? "";
        return [customCareActivityLog(occurrence, status, note, occurrence.scheduledAt)];
      });

    if (!repairedActivities.length) return;

    setActivityLogs((current) => {
      const currentIds = new Set(current.map((activity) => activity.id));
      const nextRepairActivities = repairedActivities.filter((activity) => !currentIds.has(activity.id));
      if (!nextRepairActivities.length) return current;

      const nextLogs = [...nextRepairActivities, ...current].sort(compareActivitiesReverseChronological);
      window.localStorage.setItem(ACTIVITY_LOGS_STORAGE_KEY, JSON.stringify(nextLogs));
      persistLocalState(templates, dailyMealState, nextLogs, undefined, activeTodayKey, manualAlerts, mealLogs);
      return nextLogs;
    });

    if (supabaseReady) {
      void Promise.all(repairedActivities.map((activity) => saveActivityLogToSupabase(activity))).catch(() => setActivityState("error"));
    }
  }, [activityLogs, careTemplates, customCareStatus, dailyMealState, hydrated, manualAlerts, mealLogs, supabaseReady, templates, todayKey]);

  useEffect(() => {
    if (!hydrated || !initialLoadComplete.current || !careTemplates.length || !activityLogs.length) return;

    const patchedActivities = activityLogs.map((activity) => {
      if (!["medication", "supplement"].includes(activity.activityType) || activityHasLastDoseMarker(activity)) return activity;
      const activityDayKey = dayKeyFromDate(new Date(activity.happenedAt));
      const lastDoseOccurrence = customCareOccurrencesForDay(careTemplates, activityDayKey).find((occurrence) => activityMatchesLastDoseOccurrence(activity, occurrence));
      return lastDoseOccurrence ? withLastDoseMarker(activity) : activity;
    });

    const changedActivities = patchedActivities.filter((activity, index) => activity !== activityLogs[index]);
    if (!changedActivities.length) return;

    window.localStorage.setItem(ACTIVITY_LOGS_STORAGE_KEY, JSON.stringify(patchedActivities));
    setActivityLogs(patchedActivities);

    if (supabaseReady) {
      void Promise.all(changedActivities.map((activity) => updateActivityLogInSupabase(activity))).catch(() => setActivityState("error"));
    }
  }, [activityLogs, careTemplates, hydrated, supabaseReady]);

  useEffect(() => {
    if (!hydrated || !todayKey || petRemembered) return;

    const activeTodayKey = currentTodayKey();
    const previousTodayKey = previousTodayKeyRef.current ?? todayKey;

    if (previousTodayKey === activeTodayKey) {
      window.localStorage.setItem(TODAY_KEY_STORAGE_KEY, activeTodayKey);
      return;
    }

    const rolloverKey = `${previousTodayKey}->${activeTodayKey}`;
    if (missedRolloverRef.current === rolloverKey) return;
    missedRolloverRef.current = rolloverKey;

    const missedOccurrences = customCareOccurrencesForDay(careTemplates, previousTodayKey).filter((occurrence) => !customCareStatus[occurrence.key]);

    if (missedOccurrences.length) {
      const existingActivityIds = new Set(activityLogs.map((activity) => activity.id));
      const missedActivities = missedOccurrences
        .map((occurrence) => customCareActivityLog(occurrence, "missed"))
        .filter((activity) => !existingActivityIds.has(activity.id));

      setCustomCareStatus((current) => {
        const next = { ...current };
        missedOccurrences.forEach((occurrence) => {
          if (!next[occurrence.key]) next[occurrence.key] = { status: "missed", note: "Missed" };
        });
        window.localStorage.setItem(CUSTOM_CARE_STATUS_STORAGE_KEY, JSON.stringify(next));
        return next;
      });

      if (missedActivities.length) {
        setActivityLogs((current) => {
          const nextLogs = [...missedActivities, ...current].sort(compareActivitiesReverseChronological);
          window.localStorage.setItem(ACTIVITY_LOGS_STORAGE_KEY, JSON.stringify(nextLogs));
          return nextLogs;
        });

        if (supabaseReady) {
          void Promise.all(missedActivities.map((activity) => saveActivityLogToSupabase(activity))).catch(() => setActivityState("error"));
        }
      }
    }

    previousTodayKeyRef.current = activeTodayKey;
    window.localStorage.setItem(TODAY_KEY_STORAGE_KEY, activeTodayKey);
  }, [activityLogs, careTemplates, customCareStatus, hydrated, petRemembered, supabaseReady, todayKey]);

  const allUpcomingScheduleCards = useMemo(() => {
    void alertMinuteKey;
    if (petRemembered) return [];

    const cards: UpcomingScheduleCard[] = [];
    const activeTodayKey = todayKey || currentTodayKey();
    const tomorrowKey = nextDayKey(activeTodayKey);
    const nowMs = Date.now();
    const todayMealById = new Map(dailyMeals.map((meal) => [meal.id, meal]));

    const mealCards = templates.flatMap<UpcomingScheduleCard>((template) => {
      const todayMeal = todayMealById.get(template.id);
      const todayScheduledAt = mealScheduledAtForDay(template, activeTodayKey);
      const todayScheduledMs = todayScheduledAt.getTime();
      const todayResolved = todayMeal?.status === "done" || missedMealIds.has(template.id);

      if (todayMeal && !todayResolved && todayScheduledMs >= nowMs) {
        return [{
          type: "meal" as const,
          sortMinutes: todayScheduledAt.getHours() * 60 + todayScheduledAt.getMinutes(),
          sortAt: todayScheduledAt,
          sortKey: `meal-${template.id}-${activeTodayKey}`,
          meal: todayMeal,
        }];
      }

      if (!isMealTemplateActiveForDay(template, tomorrowKey)) return [];

      const tomorrowScheduledAt = mealScheduledAtForDay(template, tomorrowKey);
      return [{
        type: "meal" as const,
        sortMinutes: tomorrowScheduledAt.getHours() * 60 + tomorrowScheduledAt.getMinutes(),
        sortAt: tomorrowScheduledAt,
        sortKey: `meal-${template.id}-${tomorrowKey}`,
        meal: {
          ...template,
          actualTime: null,
          status: "upcoming" as const,
        },
      }];
    });

    cards.push(...mealCards);

    customCareOccurrences.forEach((occurrence) => {
      cards.push({
        type: "custom-care",
        sortMinutes: occurrence.scheduledAt.getHours() * 60 + occurrence.scheduledAt.getMinutes(),
        sortAt: occurrence.scheduledAt,
        sortKey: occurrence.key,
        occurrence,
      });
    });

    return sortUpcomingScheduleCards(cards
      .filter((card) => card.sortAt.getTime() >= nowMs)
    );
  }, [alertMinuteKey, customCareOccurrences, dailyMeals, missedMealIds, petRemembered, templates, todayKey]);

  const upcomingClusterCards = useMemo(() => {
    const firstCard = allUpcomingScheduleCards[0];
    if (!firstCard) return [];

    const activeWindowMs = 60 * 60 * 1000;
    const activeWindowEnd = firstCard.sortAt.getTime() + activeWindowMs;
    return allUpcomingScheduleCards.filter((card) => card.sortAt.getTime() <= activeWindowEnd);
  }, [allUpcomingScheduleCards]);

  const upcomingVisibleCardCount = upcomingClusterCards.length > 5 ? 5 : 6;
  const upcomingScheduleCards = useMemo(() => upcomingClusterCards.slice(0, upcomingVisibleCardCount), [upcomingClusterCards, upcomingVisibleCardCount]);
  const hiddenUpcomingScheduleCards = useMemo(() => upcomingClusterCards.slice(upcomingVisibleCardCount), [upcomingClusterCards, upcomingVisibleCardCount]);
  const priorityScheduleTime = upcomingScheduleCards[0]?.sortAt.getTime() ?? null;
  const upcomingClusterFirstKey = upcomingClusterCards[0]?.sortKey ?? "";

  useEffect(() => {
    setUpcomingOverflowExpanded(false);
  }, [upcomingClusterFirstKey, hiddenUpcomingScheduleCards.length]);

  const overdueActionCards = useMemo(() => {
    void alertMinuteKey;
    if (petRemembered) return [];

    type OverdueActionCard =
      | { type: "meal"; sortAt: Date; sortKey: string; meal: DailyMeal }
      | { type: "custom-care"; sortAt: Date; sortKey: string; occurrence: CustomCareOccurrence };

    const activeTodayKey = todayKey || currentTodayKey();
    const nowMs = Date.now();
    const cutoff = nowMs - DUE_ACTION_WINDOW_MS;
    const mealCards = dailyMeals.flatMap<OverdueActionCard>((meal) => {
      const scheduledAt = mealScheduledAtForSort(meal, false);
      const hasResolvedLog = mealLogs.some((mealLog) => mealLog.dayKey === activeTodayKey && mealLog.mealId === meal.id && !isMissedMealLog(mealLog));

      const scheduledMs = scheduledAt.getTime();
      if (meal.status === "done" || hasResolvedLog || scheduledMs > nowMs || scheduledMs < cutoff) return [];
      return [{ type: "meal", sortAt: scheduledAt, sortKey: `meal-${meal.id}`, meal }];
    });
    const careCards = customCareOccurrences.flatMap<OverdueActionCard>((occurrence) => {
      const scheduledMs = occurrence.scheduledAt.getTime();
      if (dayKeyFromDate(occurrence.scheduledAt) !== activeTodayKey || scheduledMs > nowMs || scheduledMs < cutoff) return [];
      return [{ type: "custom-care", sortAt: occurrence.scheduledAt, sortKey: occurrence.key, occurrence }];
    });

    return [...mealCards, ...careCards].sort((a, b) => a.sortAt.getTime() - b.sortAt.getTime() || a.sortKey.localeCompare(b.sortKey));
  }, [alertMinuteKey, customCareOccurrences, dailyMeals, mealLogs, petRemembered, todayKey]);
  const todayActivityLogs = useMemo(() => {
    const today = todayKey || currentTodayKey();
    return activityLogs.filter((activity) => {
      const activityDayKey = new Intl.DateTimeFormat("en-CA", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(activity.happenedAt));

      return activityDayKey === today;
    });
  }, [activityLogs, todayKey]);

  const dynamicTimeline = useMemo(() => {
    const activeTodayKey = todayKey || currentTodayKey();
    const mealTimeline = dailyMeals
      .filter((meal) => meal.actualTime)
      .flatMap((meal) => {
        const actualTime = meal.actualTime as string;
        const mealState = todayMealState.find((entry) => entry.mealId === meal.id);
        const fedNotes = mealState?.fedNotes?.trim();
        const skippedMeal = fedNotes === "Skipped";
        const mealLog = mealLogs.find((entry) => entry.dayKey === activeTodayKey && entry.mealId === meal.id && !isMissedMealLog(entry));
        const mealName = mealLog?.mealName || meal.name;
        const mealFood = mealLog?.food || meal.food;
        const displayTime = skippedMeal ? meal.plannedTime || actualTime : actualTime;
        const sortMinutes = parseClockMinutes(displayTime);
        const sortMs = sortMsForClockTime(activeTodayKey, displayTime);
        const skippedCareItemIds = mealState?.skippedCareItemIds ?? [];
        const mealAt = new Date(sortMsForClockTime(activeTodayKey, displayTime));
        const mealCareItems = mealLog?.loggedCareItems?.length
          ? mealLog.loggedCareItems
          : mealCareItemsWithDoseBadges(careTemplates, meal, dailyMeals, activeTodayKey);
        const mealLinkedCareItems = mealCareItems.filter((item) => {
          const itemOccurrenceCount = dailyMeals.filter((dailyMeal) =>
            (
              mealLogs.find((entry) => entry.dayKey === activeTodayKey && entry.mealId === dailyMeal.id && !isMissedMealLog(entry))?.loggedCareItems ??
              mealCareItemsWithDoseBadges(careTemplates, dailyMeal, dailyMeals, activeTodayKey)
            ).some((candidate) => candidate.kind === item.kind && candidate.id === item.id)
          ).length;
          return !todayActivityLogs.some((activity) =>
            activityMatchesMealLinkedCareTimeline(activity, item, mealAt, meal.id, activeTodayKey, itemOccurrenceCount)
          );
        }).map((item) => {
          const skippedCare = skippedCareItemIds.includes(`${item.kind}-${item.id}`);
          const detailText = `${item.name}${mealPlanCareDetailText(item)}${!skippedCare && item.notes ? ` • Notes: ${item.notes}` : ""}`;
          return {
            label: skippedCare ? `Skipped ${careKindLabel(item.kind)}` : careKindLabel(item.kind),
            detail: detailText,
            careItem: item,
          };
        });
        const mealItem = {
          time: displayTime,
          label: skippedMeal ? "Skipped Meal" : "Fed",
          detail: fedNotes && !skippedMeal ? `${mealName}: ${mealFood} • Notes: ${fedNotes}` : `${mealName}: ${mealFood}`,
          activityType: "meal" as const,
          mealGroupId: `meal-${meal.id}`,
          mealLinkedCareItems,
          sortMinutes,
          sortMs,
          sortKey: mealLog?.createdAt ?? `meal-${meal.id}`,
        };

        return [mealItem];
      });

    const missedMealTimeline = mealLogs
      .filter((mealLog) => mealLog.dayKey === activeTodayKey && isMissedMealLog(mealLog))
      .map((mealLog) => {
        const displayTime = templates.find((template) => template.id === mealLog.mealId)?.plannedTime ?? mealLog.actualTime;
        const sortMinutes = parseClockMinutes(displayTime);
        return {
          time: displayTime,
          label: "Missed Meal",
          detail: `${mealLog.mealName}: ${mealLog.food}`,
          activityType: "meal" as const,
          sortMinutes,
          sortMs: sortMsForClockTime(activeTodayKey, displayTime),
          sortKey: mealLog.id,
        };
      });

    const activityTimeline = todayActivityLogs.map((activity) => {
      const happenedAt = customCareDisplayDate(activity);
      return {
        time: formatActivityTime(happenedAt.toISOString()),
        label: isPottyTimelineActivity(activity.activityType) ? "Potty" : formatActivityLabel(activity.activityType),
        detail: renderTodayTimelineActivityDetail(activity),
        activity,
        activityType: activity.activityType,
        sortMinutes: happenedAt.getHours() * 60 + happenedAt.getMinutes(),
        sortMs: happenedAt.getTime(),
        sortKey: activity.createdAt ?? activity.id,
      };
    });

    const manualAlertTimeline = manualAlerts
      .flatMap((alert) => {
        const events: Array<{ time: string; label: string; detail: string; activityType: "manual"; sortMinutes: number; sortMs: number; sortKey: string }> = [];
        const createdAt = alert.createdAt ? new Date(alert.createdAt) : null;
        const resolvedAt = alert.resolvedAt ? new Date(alert.resolvedAt) : null;
        const activeToday = todayKey || currentTodayKey();

        if (
          createdAt &&
          new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(createdAt) === activeToday
        ) {
          events.push({
            time: formatActivityTime(alert.createdAt as string),
            label: "Alert Created",
            detail: formatManualAlertTimelineDetail(alert),
            activityType: "manual",
            sortMinutes: createdAt.getHours() * 60 + createdAt.getMinutes(),
            sortMs: createdAt.getTime(),
            sortKey: `${alert.id}-created`,
          });
        }

        if (
          resolvedAt &&
          new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(resolvedAt) === activeToday
        ) {
          events.push({
            time: formatActivityTime(alert.resolvedAt as string),
            label: "Alert Resolved",
            detail: formatManualAlertTimelineDetail(alert),
            activityType: "manual",
            sortMinutes: resolvedAt.getHours() * 60 + resolvedAt.getMinutes(),
            sortMs: resolvedAt.getTime(),
            sortKey: `${alert.id}-resolved`,
          });
        }

        return events;
      });

    return [...mealTimeline, ...missedMealTimeline, ...activityTimeline, ...manualAlertTimeline].sort(
      (a, b) => a.sortMs - b.sortMs || a.sortMinutes - b.sortMinutes || a.sortKey.localeCompare(b.sortKey)
    );
  }, [dailyMeals, todayActivityLogs, todayMealState, careTemplates, manualAlerts, mealLogs, templates, todayKey]);

  const alerts = useMemo(() => {
    void alertMinuteKey;
    if (petRemembered) return [];
    return resolveAlerts(templates, todayMealState, todayActivityLogs, manualAlerts, reminderRules, careTemplates);
  }, [templates, todayMealState, todayActivityLogs, manualAlerts, reminderRules, careTemplates, alertMinuteKey, petRemembered]);
  const alertCards = alerts.filter((alert) => alert.kind !== "reminder");
  const todayAlertCards = alertCards.filter((alert) => alert.kind !== "review");
  const reminderCards = alerts.filter((alert) => alert.kind === "reminder" && !alert.id.startsWith("meal-"));

  const poopRecords = useMemo(() => {
    const windowStart = new Date();
    windowStart.setHours(0, 0, 0, 0);
    windowStart.setDate(windowStart.getDate() - (poopRecordsWindowDays - 1));
    const startDayKey = new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(windowStart);
    const endDayKey = currentTodayKey();

    return activityLogs
      .filter((activity) => {
        if (!isActualPoopRecord(activity)) return false;
        const activityDayKey = new Intl.DateTimeFormat("en-CA", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date(activity.happenedAt));
        return activityDayKey >= startDayKey && activityDayKey <= endDayKey;
      })
      .sort((a, b) => b.happenedAt.localeCompare(a.happenedAt));
  }, [activityLogs, poopRecordsWindowDays]);

  const latestTodayUpdate = useMemo(() => {
    void alertMinuteKey;
    return dynamicTimeline.reduce<(typeof dynamicTimeline)[number] | null>(
      (latest, item) => item.sortMs > (latest?.sortMs ?? 0) ? item : latest,
      null
    );
  }, [alertMinuteKey, dynamicTimeline]);
  const lastUpdatedLabel = useMemo(() => formatLastUpdated(latestTodayUpdate?.sortMs ?? null), [latestTodayUpdate]);
  const lastUpdatedByLabel = useMemo(() => {
    if (!latestTodayUpdate) return "";

    const activityActor =
      "activity" in latestTodayUpdate
        ? latestTodayUpdate.activity.auditInfo?.lastEditedBy || latestTodayUpdate.activity.auditInfo?.loggedBy || ""
        : "";
    return compactNameLabel(activityActor || userDisplayName(user));
  }, [latestTodayUpdate, user]);

  const markMealFed = async (mealId: number) => {
    const timestamp = formatCurrentTime();
    const activeTodayKey = todayKey || currentTodayKey();

    const nextMealState: DailyMealState[] = dailyMealState.map((meal) =>
      meal.mealId === mealId
        ? {
            ...meal,
            actualTime: timestamp,
            status: "done",
            skippedCareItemIds: [],
            dayKey: activeTodayKey,
          }
        : meal
    );

    setDailyMealState(nextMealState);

    const meal = dailyMeals.find((entry) => entry.id === mealId);
    const updatedMeal = meal ? { ...meal, actualTime: timestamp, status: "done" as const } : null;

    if (updatedMeal) {
      const skippedCareItemIds = nextMealState.find((entry) => entry.mealId === mealId)?.skippedCareItemIds ?? [];
      const mealLog = buildMealLog(
        updatedMeal,
        nextMealState.find((entry) => entry.mealId === mealId)?.fedNotes ?? null,
        activeTodayKey,
        skippedCareItemIds,
        loggedCareItemsForMeal(careTemplates, updatedMeal, dailyMeals, activeTodayKey, skippedCareItemIds)
      );
      setMealLogs((current) => [mealLog, ...current.filter((entry) => entry.id !== mealLog.id && entry.id !== missedMealLogId(activeTodayKey, mealId))]);

      if (supabaseReady) {
        try {
          await saveCompletedMealToSupabase(mealLog, nextMealState, missedMealLogId(activeTodayKey, mealId));
        } catch {
          // local fallback already captured
        }
      }
    }

    setMealActionState("saving");
  };

  const resolveManualAlert = async (alertId: string) => {
    const nowIso = new Date().toISOString();
    const nextAlerts = manualAlerts.map((alert) => {
      if (alert.id !== alertId) return alert;
      const repeats = ["ongoing", "every-other-day", "certain-days"].includes(alert.scope ?? "today");
      return {
        ...alert,
        resolved: repeats ? false : true,
        resolvedAt: nowIso,
      };
    });

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

  const markMealSkipped = async (mealId: number) => {
    const activeTodayKey = todayKey || currentTodayKey();
    const template = templates.find((entry) => entry.id === mealId);
    if (!template) return;

    const meal = dailyMeals.find((dailyMeal) => dailyMeal.id === mealId);
    const skippedCareItemIds = meal ? mealCareItemsWithDoseBadges(careTemplates, meal, dailyMeals, activeTodayKey).map((item) => `${item.kind}-${item.id}`) : [];
    const mealLog = buildSkippedMealLog(template, activeTodayKey, skippedCareItemIds, meal ? loggedCareItemsForMeal(careTemplates, meal, dailyMeals, activeTodayKey, skippedCareItemIds) : []);

    const nextMealState = dailyMealState.map((meal) =>
      meal.mealId === mealId
        ? {
            ...meal,
            actualTime: template.plannedTime,
            status: "done" as const,
            fedNotes: "Skipped",
            skippedCareItemIds,
            dayKey: activeTodayKey,
          }
        : meal
    );

    setDailyMealState(nextMealState);
    setMealLogs((current) => [mealLog, ...current.filter((entry) => entry.id !== mealLog.id && entry.id !== missedMealLogId(activeTodayKey, mealId))]);
    setMealActionState("saving");

    if (supabaseReady) {
      try {
        await saveCompletedMealToSupabase(mealLog, nextMealState, missedMealLogId(activeTodayKey, mealId));
      } catch {
        // local fallback already captured
      }
    }
  };

  const toTimeInputValue = (isoString: string) =>
    new Intl.DateTimeFormat("en-CA", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(isoString));

  const mergeTodayWithTime = (timeValue: string) => {
    const [hours, minutes] = timeValue.split(":").map(Number);
    const now = new Date();
    now.setHours(hours, minutes, 0, 0);
    return now.toISOString();
  };

  const resetActivityEditor = () => {
    setDetailActivityType(null);
    setEditingActivityId(null);
    setDetailValue("");
    setNotesValue("");
    setExtraNotesValue("");
    setAttachmentFiles([]);
    setRecordTags([]);
    setHappenedAtValue(
      new Intl.DateTimeFormat("en-CA", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date())
    );
  };

  const saveActivity = async (activity: ActivityLog, mode: "create" | "update") => {
    setActivityLogs((current) => {
      const nextLogs = [activity, ...current.filter((entry) => entry.id !== activity.id)].sort(compareActivitiesReverseChronological);
      window.localStorage.setItem(ACTIVITY_LOGS_STORAGE_KEY, JSON.stringify(nextLogs));
      persistLocalState(templates, dailyMealState, nextLogs, undefined, todayKey || currentTodayKey(), manualAlerts, mealLogs);
      return nextLogs;
    });
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

  const updateCustomCareStatus = (occurrence: CustomCareOccurrence, status: "given" | "skipped" | "missed", note = "") => {
    setCustomCareStatus((current) => {
      const next = { ...current, [occurrence.key]: note ? { status, note } : status };
      window.localStorage.setItem(CUSTOM_CARE_STATUS_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const removeMissedCustomCareActivity = async (occurrence: CustomCareOccurrence) => {
    const missedActivityId = `${occurrence.key}-missed`;
    setActivityLogs((current) => {
      const nextLogs = current.filter((activity) => activity.id !== missedActivityId);
      window.localStorage.setItem(ACTIVITY_LOGS_STORAGE_KEY, JSON.stringify(nextLogs));
      persistLocalState(templates, dailyMealState, nextLogs, undefined, todayKey || currentTodayKey(), manualAlerts, mealLogs);
      return nextLogs;
    });

    if (supabaseReady) {
      try {
        await deleteActivityLogInSupabase(missedActivityId);
      } catch {
        // local fallback already captured
      }
    }
  };

  const markCustomCareGiven = async (occurrence: CustomCareOccurrence) => {
    const activity = customCareActivityLog(occurrence, "given", "", new Date());

    updateCustomCareStatus(occurrence, "given");
    await removeMissedCustomCareActivity(occurrence);
    await saveActivity(activity, "create");
    await removeMissedCustomCareActivity(occurrence);
  };

  const openCustomCareSkipNote = (occurrence: CustomCareOccurrence) => {
    setCustomCareSkipKey(occurrence.key);
  };


  const updateCustomCareSkipNote = (occurrence: CustomCareOccurrence, note: string) => {
    setCustomCareSkipNotes((current) => ({ ...current, [occurrence.key]: note }));
  };

  const cancelCustomCareSkip = (occurrence: CustomCareOccurrence) => {
    setCustomCareSkipKey((current) => (current === occurrence.key ? null : current));
  };

  const markCustomCareSkipped = async (occurrence: CustomCareOccurrence) => {
    const skipNote = customCareSkipNotes[occurrence.key]?.trim() ?? "";
    const activity = customCareActivityLog(occurrence, "skipped", skipNote, new Date());

    updateCustomCareStatus(occurrence, "skipped", skipNote);
    await removeMissedCustomCareActivity(occurrence);
    setCustomCareSkipKey(null);
    setCustomCareSkipNotes((current) => {
      const next = { ...current };
      delete next[occurrence.key];
      return next;
    });
    await saveActivity(activity, "create");
    await removeMissedCustomCareActivity(occurrence);
  };

  const quickLogActivity = async (activityType: ActivityType) => {
    if (["potty", "activity", "outdoor", "food", "treat", "care", "wellness", "medication", "sick", "other"].includes(activityType)) {
      setDetailActivityType(activityType);
      setEditingActivityId(null);
      setDetailValue("");
      setNotesValue("");
      setExtraNotesValue("");
      setAttachmentFiles([]);
      setRecordTags([]);
      setHappenedAtValue(
        new Intl.DateTimeFormat("en-CA", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(new Date())
      );
      return;
    }

    const activity: ActivityLog = {
      id: `${activityType}-${Date.now()}`,
      profileSlug: HEWSTER_PROFILE_SLUG,
      activityType,
      happenedAt: new Date().toISOString(),
      detail: null,
      notes: null,
      createdAt: new Date().toISOString(),
    };

    await saveActivity(activity, "create");
    setDetailActivityType(activity.activityType);
    setEditingActivityId(activity.id);
    setDetailValue("");
    setNotesValue("");
    setExtraNotesValue("");
    setHappenedAtValue(toTimeInputValue(activity.happenedAt));
  };

  const saveDetailedActivity = async () => {
    if (!detailActivityType || activitySaveInFlightRef.current) return;
    activitySaveInFlightRef.current = true;
    setActivityState("saving");

    try {
      const recordTagNote = "";
      const trimmedDetail = detailValue.trim();
      const resolvedActivityType = resolveActivityTypeForSave(detailActivityType, trimmedDetail);
      const happenedAt = mergeTodayWithTime(happenedAtValue);
      const attachmentDocumentTypes = attachmentDocumentTypesForActivity(resolvedActivityType);
      const attachmentNames = activityAttachmentFileNamesForSave(
        { id: editingActivityId ?? "", profileSlug: HEWSTER_PROFILE_SLUG, activityType: resolvedActivityType, happenedAt, detail: null, notes: null },
        attachmentFiles,
        attachmentDocumentTypes
      );
      const attachmentNote = attachmentNames.length ? `Attachments: ${attachmentNames.join(", ")}` : "";
      const resolvedNotes =
        detailActivityType === "treat" || detailActivityType === "food"
          ? [notesValue.trim(), extraNotesValue.trim() ? `Notes: ${extraNotesValue.trim()}` : ""].filter(Boolean).join(" ") || null
          : [notesValue.trim(), recordTagNote, attachmentNote].filter(Boolean).join("\n") || null;
      const activity: ActivityLog = {
        id: editingActivityId ?? `${resolvedActivityType}-${Date.now()}`,
        profileSlug: HEWSTER_PROFILE_SLUG,
        activityType: resolvedActivityType,
        happenedAt,
        detail: resolvedActivityType === "pee" ? "Pee" : detailActivityType === "potty" ? trimmedDetail || null : trimmedDetail || null,
        notes: resolvedNotes,
        createdAt: editingActivityId ? activityLogs.find((entry) => entry.id === editingActivityId)?.createdAt : new Date().toISOString(),
      };

      await saveActivity(activity, editingActivityId ? "update" : "create");
      if (attachmentFiles.length) {
        const savedAttachments = await saveActivityAttachmentsToSupabase(activity, attachmentFiles, attachmentDocumentTypes);

        if (savedAttachments.length) {
          setActivityLogs((current) => {
            const nextLogs = current.map((entry) =>
              entry.id === activity.id ? { ...entry, attachments: savedAttachments } : entry
            );
            window.localStorage.setItem(ACTIVITY_LOGS_STORAGE_KEY, JSON.stringify(nextLogs));
            persistLocalState(templates, dailyMealState, nextLogs, undefined, todayKey || currentTodayKey(), manualAlerts, mealLogs);
            return nextLogs;
          });
        }
      }
      resetActivityEditor();
    } finally {
      activitySaveInFlightRef.current = false;
    }
  };

  const deleteActivity = async () => {
    if (!editingActivityId) return;

    const confirmed = window.confirm("Delete this event? This cannot be undone.");
    if (!confirmed) return;

    const deletingId = editingActivityId;
    setActivityLogs((current) => current.filter((activity) => activity.id !== deletingId));
    setActivityState("saving");

    try {
      if (supabaseReady) {
        await deleteActivityLogInSupabase(deletingId);
      }

      setActivityState("saved");
      window.setTimeout(() => setActivityState("idle"), 1800);
      resetActivityEditor();
    } catch {
      setActivityState("error");
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
        <header className="relative mb-6 min-h-[72px]">
          <div className="flex min-h-[4.5rem] items-center pr-24">
            <div>
              <PetNotebookTitle href="/hewie" className="block text-sm font-bold leading-[18px] text-[var(--hewie-active-text,#6d28d9)]" />
              <div className="mt-1 flex flex-col">
                <h1 className="text-[1.26rem] font-bold leading-[1.2] text-[#252a26]">Today, {headerDateTime}</h1>
                <p className="text-xs font-normal leading-4 text-[#252a26]">
                  {lastUpdatedLabel}
                  {lastUpdatedByLabel ? <span> - {lastUpdatedByLabel}</span> : null}
                </p>
              </div>
            </div>
          </div>
          <div className="absolute right-0 top-0">
            <PetAvatarMenu shape="tile" />
          </div>
        </header>

        {notebookDataUnavailable ? (
          <section className="mb-3 rounded-3xl bg-amber-50 px-4 py-3 text-amber-900 shadow-sm ring-1 ring-amber-200">
            <div className="flex items-start gap-3">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-5">Notebook data is reconnecting</p>
                <p className="mt-0.5 text-xs leading-4 text-amber-900/70">
                  Your saved meal plan did not load yet, so the default plan is hidden.
                </p>
              </div>
              <Button
                type="button"
                className="h-8 shrink-0 rounded-full bg-amber-900 px-3 text-xs font-semibold text-amber-50 hover:bg-amber-800"
                onClick={() => window.location.reload()}
              >
                Retry
              </Button>
            </div>
          </section>
        ) : null}

        {todayAlertCards.length ? (
          <section className="mb-3 space-y-2">
            {todayAlertCards.slice(0, 3).map((alert) => {
              const detailKey = `today-alert-${alert.id}`;
              const detailsExpanded = Boolean(expandedAlertDetails[detailKey]);
              const expandedDetail = alert.expandedDetail?.trim();
              const hasExpandedDetail = Boolean(expandedDetail && expandedDetail !== alert.detail.trim());

              return (
                <div
                  key={alert.id}
                  className="rounded-2xl bg-gradient-to-r from-[#fff0f1] to-[#fcebed] px-3.5 py-2 text-[#d91f56] shadow-[0_8px_18px_rgba(255,27,90,0.10)] ring-1 ring-[#e6c8ce]/80"
                >
                  <div className="flex min-h-8 items-center justify-between gap-3">
                    <div className="flex min-w-0 flex-1 items-start gap-2 text-left">
                      <TriangleAlert className="size-4 shrink-0 self-center text-[#8f1739]" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold leading-4 text-[#8f1739]">{alert.title}</p>
                        <p className="truncate text-xs leading-4 text-[#b71f48]/65">{alert.detail}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
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
                        <button
                          type="button"
                          onKeyDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation();
                            void resolveManualAlert(alert.id);
                          }}
                          className="inline-flex h-7 shrink-0 items-center justify-center rounded-full bg-[var(--hewie-accent,#64748b)] px-3 text-[11px] font-semibold text-[var(--hewie-accent-text,#ffffff)] shadow-sm shadow-slate-400/20 ring-1 ring-white/30 transition hover:opacity-90 active:translate-y-px"
                        >
                          Done
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {hasExpandedDetail ? (
                    <InlineDetails expanded={detailsExpanded} className="bg-white/55 text-[#8f1739] ring-1 ring-[#e6c8ce]/70">
                      {expandedDetail}
                    </InlineDetails>
                  ) : null}
                </div>
              );
            })}
          </section>
        ) : null}

        {overdueActionCards.length ? (
          <section className="mb-3 space-y-2">
            {overdueActionCards.slice(0, 4).map((card) => {
              const title = card.type === "meal" ? `${card.meal.name} due ${card.meal.plannedTime}` : `${card.occurrence.item.name} due ${card.occurrence.timeLabel}`;
              const expandedDetail = card.type === "meal"
                ? mealExpandedDetailText(careTemplates, card.meal, dailyMeals, todayKey || currentTodayKey())
                : customCareExpandedDetailText(card.occurrence);
              const hasExpandedDetail = Boolean(expandedDetail.trim());
              const careKind = card.type === "custom-care" ? card.occurrence.item.kind : null;
              const detailKey = `overdue-${card.sortKey}`;
              const detailsExpanded = Boolean(expandedAlertDetails[detailKey]);

              return (
                <div
                  key={`overdue-${card.sortKey}`}
                  className="rounded-2xl bg-gradient-to-r from-white/85 to-[var(--hewie-active-bg,#f1f5f9)]/80 px-3 py-2 text-[var(--hewie-active-text,#334155)] shadow-[0_8px_18px_rgba(15,23,42,0.06)] ring-1 ring-white/75"
                >
                  <div className="flex min-h-8 items-center gap-2">
                    {card.type === "meal" ? (
                      <Bell className="size-4 shrink-0 text-[var(--hewie-active-text,#334155)]" />
                    ) : careKind === "supplement" ? (
                      <Tablets className="size-4 shrink-0 text-[#1f3d5c]" />
                    ) : (
                      <MedicationPillIcon className="size-4 shrink-0 text-sky-600" />
                    )}
                    <div className="min-w-0 flex-1 text-left">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="truncate text-sm font-semibold leading-4 text-[var(--hewie-active-text,#334155)]">{title}</p>
                        {card.type === "custom-care" && card.occurrence.isLastDose ? <span className="rounded-full bg-amber-100/80 px-2 py-0.5 text-[10px] font-semibold text-amber-800 ring-1 ring-amber-200/70">Last Dose</span> : null}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1" onKeyDown={(event) => event.stopPropagation()}>
                      {hasExpandedDetail ? (
                        <ExpandDetailsButton
                          expanded={detailsExpanded}
                          className="text-[var(--hewie-active-text,#334155)]/70 hover:text-[var(--hewie-active-text,#334155)]"
                          onClick={(event) => {
                            event.stopPropagation();
                            setExpandedAlertDetails((current) => ({ ...current, [detailKey]: !current[detailKey] }));
                          }}
                        />
                      ) : null}
                      <Button
                        type="button"
                        variant="outline"
                        className="h-7 rounded-full border-0 bg-white/65 px-2.5 text-[11px] font-semibold text-[var(--hewie-active-text,#334155)]/70 ring-1 ring-[var(--hewie-ring,#cbd5e1)]/70 hover:bg-white/85"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (card.type === "meal") {
                            void markMealSkipped(card.meal.id);
                          } else {
                            void markCustomCareSkipped(card.occurrence);
                          }
                        }}
                      >
                        Skip
                      </Button>
                      <Button
                        type="button"
                        className="h-7 rounded-full bg-[var(--hewie-accent,#64748b)] px-2.5 text-[11px] font-semibold text-[var(--hewie-accent-text,#ffffff)] hover:opacity-90"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (card.type === "meal") {
                            void markMealFed(card.meal.id);
                          } else {
                            void markCustomCareGiven(card.occurrence);
                          }
                        }}
                      >
                        Done
                      </Button>
                    </div>
                  </div>
                  {hasExpandedDetail ? (
                    <InlineDetails expanded={detailsExpanded} className="bg-white/55 text-[var(--hewie-active-text,#334155)]/75 ring-1 ring-[var(--hewie-ring,#cbd5e1)]/65">
                      {expandedDetail}
                    </InlineDetails>
                  ) : null}
                </div>
              );
            })}
          </section>
        ) : null}

        {reminderCards.length ? (
          <section className="mb-3 space-y-2">
            {reminderCards.slice(0, 3).map((reminder) => {
              const reminderMealId = reminder.id.startsWith("meal-") ? Number(reminder.id.replace("meal-", "")) : null;
              const hasMealActions = reminderMealId !== null && Number.isFinite(reminderMealId);
              const detailKey = `reminder-${reminder.id}`;
              const detailsExpanded = Boolean(expandedAlertDetails[detailKey]);
              const expandedDetail = reminder.expandedDetail?.trim();
              const hasExpandedDetail = Boolean(expandedDetail && expandedDetail !== reminder.detail.trim());

              return (
                <div
                  key={reminder.id}
                  className="rounded-2xl bg-gradient-to-r from-white/85 to-[var(--hewie-active-bg,#f1f5f9)]/80 px-3.5 py-3 text-[var(--hewie-active-text,#334155)] shadow-[0_8px_18px_rgba(15,23,42,0.06)] ring-1 ring-white/75"
                >
                  <div className="flex min-h-10 items-start gap-3">
                    <Bell className="mt-0.5 size-4 shrink-0 text-[var(--hewie-active-text,#334155)]" />
                    <div className="min-w-0 flex-1 text-left">
                      <p className="text-sm font-semibold leading-4 text-[var(--hewie-active-text,#334155)]">{reminder.title}</p>
                      <p className="mt-0.5 truncate text-xs leading-4 text-[var(--hewie-active-text,#334155)]/60">{reminder.detail}</p>
                    </div>
                    {hasExpandedDetail ? (
                      <ExpandDetailsButton
                        expanded={detailsExpanded}
                        className="text-[var(--hewie-active-text,#334155)]/70 hover:text-[var(--hewie-active-text,#334155)]"
                        onClick={(event) => {
                          event.stopPropagation();
                          setExpandedAlertDetails((current) => ({ ...current, [detailKey]: !current[detailKey] }));
                        }}
                      />
                    ) : null}
                  </div>
                  {hasExpandedDetail ? (
                    <InlineDetails expanded={detailsExpanded} className="ml-7 bg-white/55 text-[var(--hewie-active-text,#334155)]/75 ring-1 ring-[var(--hewie-ring,#cbd5e1)]/65">
                      {expandedDetail}
                    </InlineDetails>
                  ) : null}
                  {hasMealActions ? (
                    <div className="mt-2 grid grid-cols-2 gap-2 pl-7" onKeyDown={(event) => event.stopPropagation()}>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-8 rounded-full border-0 bg-white/65 px-3 text-xs font-semibold text-[var(--hewie-active-text,#334155)]/70 ring-1 ring-[var(--hewie-ring,#cbd5e1)]/70 hover:bg-white/85"
                        onClick={(event) => {
                          event.stopPropagation();
                          markMealSkipped(reminderMealId as number);
                        }}
                      >
                        Skip
                      </Button>
                      <Button
                        type="button"
                        className="h-8 rounded-full bg-[var(--hewie-accent,#64748b)] px-3 text-xs font-semibold text-[var(--hewie-accent-text,#ffffff)] hover:opacity-90"
                        onClick={(event) => {
                          event.stopPropagation();
                          markMealFed(reminderMealId as number);
                        }}
                      >
                        Mark Fed
                      </Button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </section>
        ) : null}

        {upcomingScheduleCards.length ? (
          <section data-guide="today-upcoming" className="mb-4 space-y-2">
            <section className="rounded-3xl bg-[var(--hewie-active-bg,#f1f5f9)] p-2 text-[var(--hewie-active-text,#334155)] shadow-sm ring-1 ring-[var(--hewie-ring,#cbd5e1)]">
              <div className="grid grid-cols-2 gap-2">
                {upcomingScheduleCards.map((card) => {
                  if (card.type === "meal") {
                    const plannedTimeLabel = scheduleTimeLabel(card.sortAt, card.meal.plannedTime, todayKey || currentTodayKey());
                    const mealDayKey = dayKeyFromDate(card.sortAt);
                    const cardMealCareItems = mealCareItemsWithDoseBadges(careTemplates, card.meal, templates, mealDayKey);
                    const mealNoteText = card.meal.notes?.trim().slice(0, TEXT_LIMITS.note) ?? "";
                    const mealNoteButtonClassName = "bg-[var(--hewie-active-text,#334155)]/12 text-[var(--hewie-active-text,#334155)] ring-[var(--hewie-ring,#cbd5e1)]/80 hover:bg-[var(--hewie-active-text,#334155)]/18";
                    const mealNoteModalTone = {
                      panel: "bg-[var(--hewie-active-bg,#f1f5f9)] text-[var(--hewie-active-text,#334155)] ring-[var(--hewie-ring,#cbd5e1)]",
                      closeButton: "bg-white/55 text-current/58 ring-[var(--hewie-ring,#cbd5e1)] transition hover:bg-white/80 hover:text-current/75",
                      noteBox: "border border-[var(--hewie-ring,#cbd5e1)] bg-white text-current/75",
                    };
                    const mealTextInsetClassName = mealNoteText ? "pr-7" : "";
                    const mealFoodText = card.meal.food.trim();
                    const mealDetailSections = (primary: "food" | "notes" | "care", primaryCareItem?: CareItemTemplate) => {
                      const foodSection = mealFoodText ? { id: "food", label: "Food / Ingredients", text: mealFoodText } : null;
                      const notesSection = mealNoteText ? { id: "notes", label: "Notes", text: mealNoteText } : null;
                      const careSections = cardMealCareItems
                        .filter((item) => item.kind === "supplement")
                        .map((item) => ({
                          id: `${item.kind}-${item.id}`,
                          label: item.kind === "supplement" ? "Supplement" : "Medication",
                          text: [
                            item.name,
                            item.dose ? `Dose: ${item.dose}` : null,
                            item.notes?.trim() ? `Notes: ${item.notes.trim().slice(0, TEXT_LIMITS.note)}` : null,
                          ].filter(Boolean).join("\n"),
                        }));
                      const selectedCareSection = primaryCareItem
                        ? careSections.find((section) => section.id === `${primaryCareItem.kind}-${primaryCareItem.id}`) ?? null
                        : null;
                      const otherCareSections = selectedCareSection
                        ? careSections.filter((section) => section.id !== selectedCareSection.id)
                        : careSections;

                      if (primary === "care") {
                        return [selectedCareSection, foodSection, notesSection, ...otherCareSections].filter(Boolean) as { id: string; label: string; text: string }[];
                      }

                      return primary === "food"
                        ? [foodSection, ...careSections, notesSection].filter(Boolean) as { id: string; label: string; text: string }[]
                        : [notesSection, foodSection, ...careSections].filter(Boolean) as { id: string; label: string; text: string }[];
                    };
                    const mealPriorityClassName = priorityScheduleTime === card.sortAt.getTime() && upcomingScheduleCards.length > 1
                      ? "hewie-priority-border"
                      : "";

                    return (
                      <div key={card.sortKey} className={`${mealPriorityClassName} relative flex aspect-square min-w-0 overflow-hidden flex-col justify-between rounded-2xl bg-white/32 p-2.5 text-[var(--hewie-active-text,#334155)] shadow-sm ring-1 ring-white/55`}>
                        <div className="min-h-0 min-w-0 overflow-hidden">
                          <p className={`${mealTextInsetClassName} text-[10px] font-bold uppercase leading-3 tracking-wide text-current/55`}>Next Meal</p>
                          <div className={`mt-0.5 flex min-w-0 flex-wrap items-center gap-1 ${mealTextInsetClassName}`}>
                            <OpenableClippedText
                              className="text-sm font-semibold leading-4 text-current/95"
                              onOpen={() => setUpcomingNoteModal({
                                title: card.meal.name,
                                subtitle: plannedTimeLabel,
                                text: "",
                                sections: mealDetailSections("food"),
                                tone: mealNoteModalTone,
                              })}
                            >
                              {card.meal.name}
                            </OpenableClippedText>
                            {card.meal.status === "late" ? <span className="rounded-full bg-white/75 px-1.5 py-0.5 text-[10px] font-medium leading-4 text-current/75 ring-1 ring-current/15">Late</span> : null}
                          </div>
                          <p className={`${mealTextInsetClassName} text-[13px] font-semibold leading-4 text-current/70`}>{plannedTimeLabel}</p>
                          <OpenableClippedText
                            className="mt-0.5 w-full text-[12px] leading-4 text-current/72"
                            lines={2}
                            onOpen={() => setUpcomingNoteModal({
                              title: card.meal.name,
                              subtitle: plannedTimeLabel,
                              label: "Food / Ingredients",
                              text: mealFoodText,
                              sections: mealDetailSections("food"),
                              tone: mealNoteModalTone,
                            })}
                          >
                            {mealFoodText}
                          </OpenableClippedText>
                          {mealNoteText ? (
                            <button
                              type="button"
                              aria-label="Show notes"
                              className={`absolute right-2.5 top-2.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full ring-1 transition ${mealNoteButtonClassName}`}
                              onClick={() => setUpcomingNoteModal({
                                title: card.meal.name,
                                subtitle: plannedTimeLabel,
                                label: "Notes",
                                text: mealNoteText,
                                sections: mealDetailSections("notes"),
                                tone: mealNoteModalTone,
                              })}
                            >
                              <StickyNote className="size-3.5" />
                            </button>
                          ) : null}
                          {cardMealCareItems.length ? (
                            <CompactMealCareSummary
                              items={cardMealCareItems}
                              onOpenDetail={(item) => setUpcomingNoteModal({
                                title: card.meal.name,
                                subtitle: plannedTimeLabel,
                                label: item.kind === "supplement" ? "Supplement" : "Medication",
                                text: item.name,
                                sections: mealDetailSections("care", item),
                                tone: mealNoteModalTone,
                              })}
                              onOpenNote={(item) => setUpcomingNoteModal({
                                title: card.meal.name,
                                subtitle: plannedTimeLabel,
                                label: "Notes",
                                text: item.notes.trim().slice(0, TEXT_LIMITS.note),
                                sections: [
                                  { id: "selected-note", label: "Notes", text: item.notes.trim().slice(0, TEXT_LIMITS.note) },
                                  ...mealDetailSections("care", item),
                                ],
                                tone: mealNoteModalTone,
                              })}
                            />
                          ) : null}
                        </div>
                        <Button className="mt-1.5 h-7 w-full rounded-full bg-[var(--hewie-accent,#64748b)] px-2 text-xs font-semibold text-[var(--hewie-accent-text,#ffffff)] hover:opacity-90" onClick={() => markMealFed(card.meal.id)}>
                          Done
                        </Button>
                      </div>
                    );
                  }

                  const occurrence = card.occurrence;
                  const occurrenceTimeLabel = scheduleTimeLabel(occurrence.scheduledAt, occurrence.timeLabel, todayKey || currentTodayKey());
                  const timingLabel = customCareTimingLabel(occurrence.item);
                  const isSupplement = occurrence.item.kind === "supplement";
                  const tileClassName = isSupplement
                    ? "bg-[#eaf0f8] text-[#1f3d5c] ring-[#b8c9dd]"
                    : "bg-sky-50 text-sky-700 ring-sky-200";
                  const priorityClassName = priorityScheduleTime === card.sortAt.getTime() && upcomingScheduleCards.length > 1
                    ? `hewie-priority-border ${isSupplement ? "hewie-priority-border-supplement" : "hewie-priority-border-medication"}`
                    : "";
                  const iconClassName = isSupplement
                    ? "bg-white/55 text-[#1f3d5c] ring-[#b8c9dd]/70"
                    : "bg-sky-100 text-sky-600 ring-transparent";
                  const timingBadgeClassName = isSupplement ? "bg-white/55 text-[#1f3d5c]/60" : "bg-white/55 text-current/58";
                  const skipButtonClassName = isSupplement
                    ? "bg-white/45 text-[#1f3d5c]/55 ring-[#b8c9dd]/45 hover:bg-white/70 hover:text-[#1f3d5c]/75"
                    : "bg-white/55 text-current/58 ring-white/70 hover:bg-white/80 hover:text-current/75";
                  const doneButtonClassName = isSupplement
                    ? "bg-white/65 text-[#1f3d5c] ring-[#b8c9dd]/70 hover:bg-white/85"
                    : "bg-[var(--hewie-accent,#64748b)] text-[var(--hewie-accent-text,#ffffff)] ring-white/40 hover:opacity-90";
                  const noteButtonClassName = isSupplement
                    ? "bg-[#d8e4f1] text-[#1f3d5c] ring-[#8ca8c3]/70 hover:bg-[#cfdeee]"
                    : "bg-sky-100 text-sky-700 ring-sky-300/80 hover:bg-sky-200/70";
                  const noteModalTone = isSupplement
                    ? {
                        panel: "bg-[#eaf0f8] text-[#1f3d5c] ring-[#b8c9dd]",
                        closeButton: "bg-white/55 text-current/58 ring-[#b8c9dd]/80 transition hover:bg-white/80 hover:text-current/75",
                        noteBox: "border border-[#b8c9dd] bg-white text-current/75",
                      }
                    : {
                        panel: "bg-sky-50 text-sky-700 ring-sky-200",
                        closeButton: "bg-white/55 text-current/58 ring-sky-200 transition hover:bg-white/80 hover:text-current/75",
                        noteBox: "border border-sky-200 bg-white text-current/75",
                      };
                  const noteText = occurrence.item.notes?.trim() ?? "";

                  return (
                    <div key={card.sortKey} className={`${priorityClassName} relative flex aspect-square min-w-0 overflow-hidden flex-col justify-between rounded-2xl p-2.5 shadow-sm ring-1 ${tileClassName}`}>
                      <div className="min-w-0">
                        <div className="pr-9">
                          <p className="text-[10px] font-bold uppercase leading-3 tracking-wide text-current/55">{isSupplement ? "Next Supplement" : "Next Medication"}</p>
                        </div>
                        <span className={`absolute right-2.5 top-2.5 flex size-8 shrink-0 items-center justify-center rounded-full ring-1 ${iconClassName}`}>
                          {isSupplement ? <Tablets className="size-4" /> : <MedicationPillIcon className="size-5" />}
                        </span>
                        <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1 pr-9">
                          <OpenableClippedText
                            className="text-sm font-semibold leading-4 text-current/95"
                            onOpen={() => setUpcomingNoteModal({
                              title: occurrence.item.name,
                              subtitle: occurrenceTimeLabel,
                              label: isSupplement ? "Supplement" : "Medication",
                              text: occurrence.item.name,
                              sections: [
                                { label: isSupplement ? "Supplement" : "Medication", text: occurrence.item.name },
                                { label: "Details", text: customCareGiveText(occurrence.item) },
                                noteText ? { label: "Notes", text: noteText } : null,
                              ].filter(Boolean) as { label: string; text: string }[],
                              tone: noteModalTone,
                            })}
                          >
                            {occurrence.item.name}
                          </OpenableClippedText>
                        </div>
                        <p className="text-[13px] font-semibold leading-4 text-current/70">{occurrenceTimeLabel}</p>
                        <OpenableClippedText
                          className="mt-0.5 w-full text-[12px] leading-4 text-current/68"
                          onOpen={() => setUpcomingNoteModal({
                            title: occurrence.item.name,
                            subtitle: occurrenceTimeLabel,
                            label: "Details",
                            text: `${occurrence.item.name}\n${customCareGiveText(occurrence.item)}`,
                            sections: [
                              { label: isSupplement ? "Supplement" : "Medication", text: occurrence.item.name },
                              { label: "Details", text: customCareGiveText(occurrence.item) },
                              noteText ? { label: "Notes", text: noteText } : null,
                            ].filter(Boolean) as { label: string; text: string }[],
                            tone: noteModalTone,
                          })}
                        >
                          {customCareGiveText(occurrence.item)}
                        </OpenableClippedText>
                        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1 pr-7">
                          {occurrence.isLastDose ? <span className="inline-flex shrink-0 rounded-full bg-amber-100/80 px-1.5 py-0 text-[10px] font-semibold leading-4 text-amber-800 ring-1 ring-amber-200/70">Last Dose</span> : null}
                          {timingLabel ? <span className={`inline-flex shrink-0 rounded-full px-1.5 py-0 text-[10px] font-normal leading-4 ${timingBadgeClassName}`}>{timingLabel}</span> : null}
                        </div>
                        {occurrence.frequencyText ? (
                          <OpenableClippedText
                            className="mt-0.5 w-full text-[11px] font-normal leading-4 text-current/45"
                            onOpen={() => setUpcomingNoteModal({
                              title: occurrence.item.name,
                              subtitle: occurrenceTimeLabel,
                              label: "Schedule",
                              text: occurrence.frequencyText,
                              tone: noteModalTone,
                            })}
                          >
                            {occurrence.frequencyText}
                          </OpenableClippedText>
                        ) : null}
                      </div>
                      {noteText ? (
                        <button
                          type="button"
                          aria-label="Show notes"
                          className={`absolute right-2.5 top-11 inline-flex size-5 shrink-0 items-center justify-center rounded-full ring-1 transition ${noteButtonClassName}`}
                          onClick={() => setUpcomingNoteModal({
                            title: occurrence.item.name,
                            subtitle: occurrenceTimeLabel,
                            label: "Notes",
                            text: noteText,
                            sections: [
                              { label: isSupplement ? "Supplement" : "Medication", text: occurrence.item.name },
                              { label: "Details", text: customCareGiveText(occurrence.item) },
                              { label: "Notes", text: noteText },
                            ],
                            tone: noteModalTone,
                          })}
                        >
                          <StickyNote className="size-3.5" />
                        </button>
                      ) : null}
                      {customCareSkipKey === occurrence.key ? (
                        <div className="mt-1.5 space-y-1">
                          <p className="px-1 text-[10px] font-semibold text-current/55">Reason for skipping</p>
                          <textarea
                            value={customCareSkipNotes[occurrence.key] ?? ""}
                            onChange={(event) => updateCustomCareSkipNote(occurrence, clampText(event.target.value, TEXT_LIMITS.note))}
                            maxLength={TEXT_LIMITS.note}
                            placeholder="Optional reason for skipping"
                            rows={1}
                            className="h-8 w-full resize-none rounded-xl border border-current/15 bg-white/70 px-2 py-1 text-xs text-inherit outline-none placeholder:text-current/40 focus:ring-2 focus:ring-current/15"
                          />
                          <div className="grid grid-cols-2 gap-1">
                            <Button variant="outline" className="h-7 rounded-full border-current/20 bg-transparent px-2 text-xs font-semibold text-inherit hover:bg-white/40" onClick={() => cancelCustomCareSkip(occurrence)}>
                              Cancel
                            </Button>
                            <Button className="h-7 rounded-full bg-white/80 px-2 text-xs font-semibold text-inherit ring-1 ring-current/20 hover:bg-white" onClick={() => markCustomCareSkipped(occurrence)}>
                              Confirm
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-1.5 grid grid-cols-2 gap-1">
                          <Button variant="outline" className={`h-7 rounded-full border-0 px-2 text-xs font-medium shadow-sm ring-1 ${skipButtonClassName}`} onClick={() => openCustomCareSkipNote(occurrence)}>
                            Skip
                          </Button>
                          <Button className={`h-7 rounded-full px-2 text-xs font-semibold shadow-sm ring-1 ${doneButtonClassName}`} onClick={() => markCustomCareGiven(occurrence)}>
                            Done
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
                {hiddenUpcomingScheduleCards.length ? (
                  <button
                    type="button"
                    aria-expanded={upcomingOverflowExpanded}
                    className="flex aspect-square min-w-0 flex-col items-center justify-center rounded-2xl bg-white/28 p-2.5 text-center text-current shadow-sm ring-1 ring-white/55 transition hover:bg-white/40"
                    onClick={() => setUpcomingOverflowExpanded((current) => !current)}
                  >
                    <span className="text-2xl font-bold leading-7 text-current/86">+{hiddenUpcomingScheduleCards.length}</span>
                    <span className="mt-0.5 text-[11px] font-semibold leading-4 text-current/60">more coming up</span>
                    <span className="mt-2 rounded-full bg-white/45 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-current/52 ring-1 ring-white/50">
                      {upcomingOverflowExpanded ? "Hide" : "View"}
                    </span>
                  </button>
                ) : null}
              </div>
              {hiddenUpcomingScheduleCards.length ? (
                <div className="mt-2">
                  {upcomingOverflowExpanded ? (
                    <div className="mt-2 space-y-1 rounded-2xl bg-white/28 p-2 ring-1 ring-white/45">
                      {hiddenUpcomingScheduleCards.map((card) => {
                        const timeLabel = scheduleTimeLabel(
                          card.sortAt,
                          card.type === "meal" ? card.meal.plannedTime : card.occurrence.timeLabel,
                          todayKey || currentTodayKey()
                        );

                        return (
                          <div key={card.sortKey} className="flex min-w-0 items-center gap-2 rounded-xl bg-white/35 px-2 py-1 text-xs text-current/72">
                            <span className="shrink-0 font-semibold text-current/58">{timeLabel}</span>
                            <span className="shrink-0 rounded-full bg-white/45 px-1.5 py-0.5 text-[10px] font-bold uppercase leading-3 text-current/50">
                              {upcomingScheduleCardKindLabel(card)}
                            </span>
                            <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-semibold text-current/82">
                              {upcomingScheduleCardTitle(card)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>

          </section>
        ) : null}

        {upcomingNoteModal ? (
          <div className="fixed inset-0 z-50 flex items-end bg-black/35 p-3 backdrop-blur-[2px] sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-labelledby="upcoming-note-title">
            <button
              type="button"
              aria-label="Close notes"
              className="absolute inset-0 cursor-default"
              onClick={() => setUpcomingNoteModal(null)}
            />
            <div className={`relative w-full max-w-md rounded-3xl p-4 shadow-2xl ring-1 ${upcomingNoteModal.tone.panel}`}>
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p id="upcoming-note-title" className="whitespace-normal break-words text-base font-semibold leading-5">{upcomingNoteModal.title}</p>
                  <p className="mt-0.5 text-sm text-current/58">{upcomingNoteModal.subtitle}</p>
                </div>
                <button
                  type="button"
                  aria-label="Close notes"
                  className={`flex size-8 shrink-0 items-center justify-center rounded-full text-lg leading-none ring-1 ${upcomingNoteModal.tone.closeButton}`}
                  onClick={() => setUpcomingNoteModal(null)}
                >
                  ×
                </button>
              </div>
              {upcomingNoteModal.label ? (
                <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-current/58">
                  {upcomingNoteModal.label === "Notes" && !upcomingNoteModal.sections ? <StickyNote className="size-3.5" /> : null}
                  <span>{upcomingNoteModal.label}</span>
                </div>
              ) : null}
              {upcomingNoteModal.sections?.length ? (
                <div className="max-h-[45vh] space-y-3 overflow-y-auto">
                  {upcomingNoteModal.sections.map((section, index) => (
                    <section key={section.id ?? `${section.label}-${index}`} className={`rounded-2xl p-3 ${upcomingNoteModal.tone.noteBox}`}>
                      <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-current/48">{section.label}</p>
                      <p className="whitespace-pre-wrap break-words text-sm leading-6">{section.text}</p>
                    </section>
                  ))}
                </div>
              ) : upcomingNoteModal.text ? (
                <div className={`max-h-[45vh] overflow-y-auto whitespace-pre-wrap break-words rounded-2xl p-3 text-sm leading-6 ${upcomingNoteModal.tone.noteBox}`}>
                  {upcomingNoteModal.text}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        <div data-guide="today-quick-log">
          <QuickLogCard activityState={activityState} onQuickLog={quickLogActivity} title={null} iconOnly>
            {detailActivityType ? (
              <ActivityDetailForm
                activityType={detailActivityType}
                detail={detailValue}
                notes={notesValue}
                extraNotes={extraNotesValue}
                happenedAt={happenedAtValue}
                embedded
                saveLabel="Save"
                onDetailChange={setDetailValue}
                onNotesChange={setNotesValue}
                onExtraNotesChange={setExtraNotesValue}
                attachmentFiles={attachmentFiles}
                onAttachmentsChange={setAttachmentFiles}
                recordTags={recordTags}
                onRecordTagsChange={setRecordTags}
                onHappenedAtChange={setHappenedAtValue}
                onSave={saveDetailedActivity}
                onCancel={resetActivityEditor}
                onDelete={editingActivityId && canDeleteEntries ? deleteActivity : undefined}
                saving={activityState === "saving"}
                savedCareItems={careTemplates.filter((item) => item.asNeeded && (item.kind === detailActivityType || (detailActivityType === "sick" && item.kind === "medication") || (detailActivityType === "wellness" && item.kind === "supplement")))}
              />
            ) : null}
          </QuickLogCard>
        </div>

        <ActivityFeed
          activityLogs={todayActivityLogs}
          timelineItems={dynamicTimeline}
          title="Today&apos;s Timeline"
          notebookOwnerId={notebookOwnerId}
          careTemplates={careTemplates}
        />

        <section data-guide="today-poop-records" className="mb-4 rounded-3xl bg-[#fff5d8] p-5 text-[#765313] shadow-sm ring-1 ring-[#ead28a]/80">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[#6f4c0f]">Poop Records</h2>
              <p className="text-sm text-[#765313]/65">Last {poopRecordsWindowDays} days of stool records.</p>
            </div>
            <button
              type="button"
              onClick={() => setPoopRecordsWindowDays((current) => current === 3 ? 7 : 3)}
              className="shrink-0 rounded-full bg-white/65 px-3 py-1.5 text-xs font-semibold text-[#6f4c0f]/75 ring-1 ring-[#ead28a]/80 transition hover:bg-white"
            >
              {poopRecordsWindowDays === 3 ? "Last 7 Days" : "Last 3 Days"}
            </button>
          </div>
          <div className="space-y-3">
            {poopRecords.length ? (
              poopRecords.map((record) => (
                <article key={record.id} className="relative rounded-2xl bg-[#ead7a8] p-4 shadow-sm ring-1 ring-[#ead28a]/55">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-3">
                        <span className="flex size-9 items-center justify-center rounded-full bg-white/60 text-[#8a6200] ring-1 ring-[#f0d27a]/60">
                          <span className="text-lg leading-none">{"\u{1F6BD}"}</span>
                        </span>
                        <p className="font-medium text-[#6f4c0f]">Potty</p>
                      </div>
                      <PottyDetailBadges detail={record.detail} notes={record.notes} />
                    </div>
                    <div className="text-right">
                      <p className="whitespace-nowrap text-sm font-semibold text-[#6f4c0f]">
                        {new Intl.DateTimeFormat("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        }).format(new Date(record.happenedAt))}
                      </p>
                      <p className="mt-1 whitespace-nowrap text-xs text-[#765313]/55">{formatActivityTime(record.happenedAt)}</p>
                      <PoopRecordImageLinks activity={record} className="mt-2" />
                    </div>
                  </div>
                </article>
              ))
            ) : (
              <p className="text-sm text-[#765313]/65">No poop records logged yet.</p>
            )}
          </div>
        </section>

        <BottomNav alertsCount={alertCards.length} />
      </div>
    </main>
  );
}
