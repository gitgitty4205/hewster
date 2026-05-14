"use client";

import { PetAvatarMenu } from "@/components/pet-avatar-menu";
import {
  Bell,
  Tablets,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { ActivityDetailForm } from "@/components/activity-detail-form";
import { ActivityFeed } from "@/components/activity-feed";
import { PottyDetailBadges } from "@/components/potty-detail-badges";
import { BottomNav } from "@/components/bottom-nav";
import { MedicationPillIcon } from "@/components/medication-pill-icon";
import { QuickLogCard } from "@/components/quick-log-card";
import { Button } from "@/components/ui/button";
import {
  ACTIVITY_LOGS_STORAGE_KEY,
  currentTodayKey,
  deleteActivityLogInSupabase,
  deleteMealLogInSupabase,
  type ActivityLog,
  type ActivityType,
  type DailyMealState,
  type ManualAlert,
  type MealLog,
  type WeightLog,
  MEAL_LOGS_STORAGE_KEY,
  WEIGHT_LOGS_STORAGE_KEY,
  loadAppState,
  persistLocalState,
  saveActivityLogToSupabase,
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
  initialTemplates,
} from "@/lib/meal-templates";
import { compareActivitiesReverseChronological, formatActivityLabel, formatActivityTime, renderActivityDetail } from "@/lib/activity";
import { loadReminderAlertRules, resolveAlerts, type ReminderAlertRule } from "@/lib/alerts";
import { HEWSTER_PROFILE_SLUG, isSupabaseConfigured } from "@/lib/supabase";
import {
  careItemsForMeal,
  customScheduledCareItems,
  loadCareTemplates,
  loadCareTemplatesFromSupabase,
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

function formatTodayHeaderDateTime() {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date());
}

function currentAlertMinuteKey() {
  const now = new Date();
  return `${currentTodayKey()}-${now.getHours()}:${now.getMinutes()}`;
}

function resolveActivityTypeForSave(activityType: ActivityType, detail: string): ActivityType {
  if (activityType !== "potty") return activityType;

  if (detail === "Pee") return "pee";
  if (detail === "No Poop") return "potty";
  if (detail === "Poop" || detail === "Pee & Poop" || detail.includes("• Type ") || detail.startsWith("Type ")) return "poop";
  return "potty";
}

function isActualPoopRecord(activity: ActivityLog) {
  const detail = activity.detail?.trim() ?? "";
  if (activity.activityType !== "poop") return false;
  if (detail === "No Poop" || detail === "Pee") return false;
  return detail === "Poop" || detail === "Pee & Poop" || detail.includes("• Type ") || detail.startsWith("Type ");
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

  if (steps[0]) return `Every ${steps[0].everyHours} Hours For ${steps[0].forDays} Days`;
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

function CareItemLine({ item, skipped = false, tone = "meal" }: { item: CareItemTemplate; skipped?: boolean; tone?: "accent" | "meal" }) {
  const iconClassName = skipped
    ? item.kind === "supplement"
      ? "bg-[#eaf0f8] text-[#1f3d5c] ring-[#b8c9dd]"
      : "bg-sky-50 text-sky-600 ring-sky-200"
    : item.kind === "supplement"
      ? "bg-[#eaf0f8] text-[#1f3d5c] ring-[#b8c9dd]"
      : "bg-sky-50 text-sky-600 ring-sky-200";
  const lineClassName = skipped
    ? "rounded-2xl bg-rose-50/70 px-2 py-1.5 text-rose-700 ring-1 ring-rose-200/70"
    : tone === "accent"
      ? "text-[var(--hewie-active-text,#334155)]/75"
      : "text-[#6b3f22]/70";
  const textClassName = skipped ? "text-rose-800" : tone === "accent" ? "text-[var(--hewie-active-text,#334155)]" : "text-[#4f2f1b]";

  return (
    <div className={`flex items-start gap-2 text-sm leading-5 ${lineClassName}`}>
      <span className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ring-1 ${iconClassName}`}>
        {item.kind === "supplement" ? <Tablets className="size-3" /> : <MedicationPillIcon className="size-3.5" />}
      </span>
      <p className="min-w-0 flex-1">
        <span className={`font-semibold ${textClassName}`}>{careKindLabel(item.kind)}:</span>{" "}
        <span className={`font-medium ${textClassName}`}>{item.name}</span>
        {medicationTypeLabel(item) ? ` • ${medicationTypeLabel(item)}` : ""}
        {item.dose ? ` — ${item.dose}` : ""}
        {item.notes ? ` (${item.notes})` : ""}
        {skipped ? <span className="ml-2 inline-flex rounded-full bg-white/70 px-2 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-200/80">Not Given</span> : null}
      </p>
    </div>
  );
}

function CustomCareCard({
  occurrence,
  isSkipOpen,
  skipNote,
  onGiven,
  onSkip,
  onSkipNoteChange,
  onConfirmSkip,
  onCancelSkip,
}: {
  occurrence: CustomCareOccurrence;
  isSkipOpen: boolean;
  skipNote: string;
  onGiven: (occurrence: CustomCareOccurrence) => void;
  onSkip: (occurrence: CustomCareOccurrence) => void;
  onSkipNoteChange: (occurrence: CustomCareOccurrence, note: string) => void;
  onConfirmSkip: (occurrence: CustomCareOccurrence) => void;
  onCancelSkip: (occurrence: CustomCareOccurrence) => void;
}) {
  const { item } = occurrence;
  const isSupplement = item.kind === "supplement";
  const timingLabel = customCareTimingLabel(item);
  const cardClassName = isSupplement
    ? "bg-[#eaf0f8] text-[#1f3d5c] ring-[#b8c9dd]"
    : "bg-sky-50 text-sky-700 ring-sky-200";
  const iconClassName = isSupplement
    ? "bg-white/55 text-[#1f3d5c] ring-[#b8c9dd]/70"
    : "bg-sky-100 text-sky-600 ring-transparent";
  const timingBadgeClassName = isSupplement
    ? "bg-white/55 text-[#1f3d5c]/60"
    : "bg-sky-100/80 text-sky-700/60";
  const doneButtonClassName = isSupplement
    ? "bg-white/65 text-[#1f3d5c] ring-[#b8c9dd]/70 hover:bg-white/85"
    : "bg-sky-100 text-sky-700 ring-sky-200/80 hover:bg-sky-100/80";
  const skipButtonClassName = isSupplement
    ? "bg-white/45 text-[#1f3d5c]/55 ring-[#b8c9dd]/45 hover:bg-white/70 hover:text-[#1f3d5c]/75"
    : "bg-white/55 text-sky-700/55 ring-sky-200/55 hover:bg-white/80 hover:text-sky-700/75";

  return (
    <article className={`relative rounded-3xl p-3 shadow-sm ring-1 ${cardClassName}`}>
      <div className="flex items-start gap-2.5">
        <span className={`flex size-9 shrink-0 items-center justify-center rounded-full ring-1 ${iconClassName}`}>
          {isSupplement ? <Tablets className="size-5" /> : <MedicationPillIcon className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-current/62">{careKindLabel(item.kind)}</p>
          <div className="mt-0.5">
            <h3 className="text-base font-semibold text-current/95">{item.name} at {occurrence.timeLabel}</h3>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <p className="text-sm font-normal leading-5 text-current/68">{customCareGiveText(item)}</p>
              {timingLabel ? <span className={`rounded-full px-2.5 py-1 text-xs font-normal ${timingBadgeClassName}`}>{timingLabel}</span> : null}
            </div>
          </div>
          {isSkipOpen ? <p className="mt-0.5 text-sm text-current/45">{occurrence.frequencyText}</p> : null}
          {item.notes ? <p className="mt-1 text-sm text-current/58">Notes: {item.notes}</p> : null}
          {!isSkipOpen ? <p className="mt-0.5 text-sm text-current/45">{occurrence.frequencyText}</p> : null}
          {isSkipOpen ? (
            <div className="mt-3 rounded-2xl bg-white/60 p-3 ring-1 ring-current/15">
              <p className="text-sm font-semibold text-current/85">Skip {careKindLabel(item.kind)}</p>
              <textarea
                value={skipNote}
                onChange={(event) => onSkipNoteChange(occurrence, event.target.value)}
                placeholder="Notes / Reasons"
                rows={2}
                className="mt-1 w-full rounded-2xl border border-current/15 bg-white/80 px-3 py-2 text-sm text-inherit outline-none placeholder:text-current/40 focus:ring-2 focus:ring-current/15"
              />
              <div className="mt-2 flex gap-2">
                <Button variant="outline" className="h-8 rounded-full border-current/20 bg-transparent px-3 text-xs font-semibold text-inherit hover:bg-white/40" onClick={() => onCancelSkip(occurrence)}>
                  Cancel
                </Button>
                <Button className="h-8 rounded-full bg-white/80 px-3 text-xs font-semibold text-inherit ring-1 ring-current/20 hover:bg-white" onClick={() => onConfirmSkip(occurrence)}>
                  Confirm Skip
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      {!isSkipOpen ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="outline" className={`h-9 rounded-full border-0 px-3 text-xs font-medium shadow-sm ring-1 ${skipButtonClassName}`} onClick={() => onSkip(occurrence)}>
            Skip
          </Button>
          <Button className={`h-9 rounded-full px-3.5 text-xs font-semibold shadow-sm ring-1 ${doneButtonClassName}`} onClick={() => onGiven(occurrence)}>
            Done
          </Button>
        </div>
      ) : null}
    </article>
  );
}


function buildMealLog(meal: DailyMeal, fedNotes: string | null, dayKey: string, skippedCareItemIds: string[] = []): MealLog {
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
    actualTime: meal.actualTime ?? "",
  };
}

function missedMealLogId(dayKey: string, mealId: number) {
  return `${dayKey}-${mealId}-missed`;
}

function buildMissedMealLog(template: MealTemplate, dayKey: string, skippedCareItemIds: string[] = []): MealLog {
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
    actualTime: template.plannedTime,
    createdAt: new Date().toISOString(),
  };
}

function buildSkippedMealLog(template: MealTemplate, dayKey: string, skippedCareItemIds: string[] = []): MealLog {
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

function dayKeyFromDate(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

type CustomCareOccurrence = {
  key: string;
  item: CareItemTemplate;
  scheduledAt: Date;
  timeLabel: string;
  frequencyText: string;
};

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
    .filter((step) => Number.isFinite(step.everyHours) && step.everyHours > 0 && Number.isFinite(step.forDays) && step.forDays > 0);
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

function customCareOccurrencesForDay(items: CareItemTemplate[], targetDayKey: string): CustomCareOccurrence[] {
  return customScheduledCareItems(items).flatMap((item) => {
    const startAt = dateFromDateTimeLocal(item.startDateTime);
    if (!startAt) return [];
    const scheduleCreatedAt = dateFromDateTimeLocal(item.customScheduleCreatedAt) ?? new Date(Date.now() - 3 * 60 * 60 * 1000);
    const offsets = customCareDoseOffsets(item);
    const effectiveOffsets = offsets.length ? offsets : [{ offsetHours: 0, stepIndex: 0, doseIndex: 0, frequencyText: customCareFrequencyText(item) }];

    return effectiveOffsets.flatMap((offset) => {
      const scheduledAt = new Date(startAt.getTime() + offset.offsetHours * 60 * 60 * 1000);
      if (dayKeyFromDate(scheduledAt) !== targetDayKey || scheduledAt.getTime() < scheduleCreatedAt.getTime()) return [];

      return [
        {
          key: `${item.kind}-${item.id}-schedule-${offset.stepIndex + 1}-dose-${offset.doseIndex + 1}-${scheduledAt.toISOString()}`,
          item,
          scheduledAt,
          timeLabel: formatActivityTime(scheduledAt.toISOString()),
          frequencyText: offset.frequencyText,
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

function customCareActivityLog(occurrence: CustomCareOccurrence, status: "given" | "skipped" | "missed", note = ""): ActivityLog {
  const { item } = occurrence;
  const statusDetail = status === "given" ? "" : status === "skipped" ? " • Skipped" : " • Missed";
  const statusNote = status === "given" ? "" : status === "skipped" ? (note ? `Skip Note: ${note}` : "") : "Missed";

  return {
    id: status === "given" ? occurrence.key : `${occurrence.key}-${status}`,
    profileSlug: HEWSTER_PROFILE_SLUG,
    activityType: item.kind,
    happenedAt: occurrence.scheduledAt.toISOString(),
    detail: `${item.name}${item.dose && status === "given" ? ` • ${item.dose}` : ""}${statusDetail}`,
    notes: [customCareGiveText(item), occurrence.frequencyText, customCareTimingLabel(item), item.kind === "medication" ? medicationTypeLabel(item) : null, statusNote, item.notes ? `Notes: ${item.notes}` : ""].filter(Boolean).join("\n") || null,
    createdAt: new Date().toISOString(),
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
      saveCareTemplates(kind, items);
      await saveCareTemplatesToSupabase(kind, items);
    })
  ).catch(() => undefined);
}

export default function HomeApp() {
  const [templates, setTemplates] = useState<MealTemplate[]>(initialTemplates);
  const [dailyMealState, setDailyMealState] = useState<DailyMealState[]>(
    initialTemplates.map((template) => ({
      mealId: template.id,
      actualTime: null,
      status: "upcoming" as const,
      fedNotes: null,
      dayKey: currentTodayKey(),
    }))
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
  const initialLoadComplete = useRef(false);
  const previousTodayKeyRef = useRef<string | null>(null);
  const missedRolloverRef = useRef<string | null>(null);
  const supabaseReady = isSupabaseConfigured();

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
    iframe.title = "Hewster local data bridge";
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
    let cancelled = false;
    const fallbackTimer = window.setTimeout(() => {
      if (!cancelled) {
        initialLoadComplete.current = true;
        setHeaderDateTime(formatTodayHeaderDateTime());
        setAlertMinuteKey(currentAlertMinuteKey());
        setTodayKey((current) => current || currentTodayKey());
        setHydrated(true);
      }
    }, 2200);

    async function hydrate() {
      try {
        previousTodayKeyRef.current = window.localStorage.getItem(TODAY_KEY_STORAGE_KEY);
        const state = await loadAppState();
        if (cancelled) return;

        setTemplates(state.templates);
        setDailyMealState(
          state.templates.map((template) => {
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
        const [supplements, medications] = await Promise.all([
          loadCareTemplatesFromSupabase("supplement"),
          loadCareTemplatesFromSupabase("medication"),
        ]);
        setSupplementTemplates(supplements);
        setMedicationTemplates(medications);
        setCustomCareStatus(loadCustomCareStatus());
        setReminderRules(loadReminderAlertRules());
        setTodayKey(state.todayKey);
        setHeaderDateTime(formatTodayHeaderDateTime());
        setAlertMinuteKey(currentAlertMinuteKey());
      } catch {
        if (cancelled) return;
        setHeaderDateTime(formatTodayHeaderDateTime());
        setAlertMinuteKey(currentAlertMinuteKey());
        setTodayKey((current) => current || currentTodayKey());
        setSupplementTemplates(loadCareTemplates("supplement"));
        setMedicationTemplates(loadCareTemplates("medication"));
        setReminderRules(loadReminderAlertRules());
      } finally {
        if (!cancelled) {
          window.clearTimeout(fallbackTimer);
          initialLoadComplete.current = true;
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
    if (!hydrated || !initialLoadComplete.current) return;

    persistLocalState(templates, dailyMealState, activityLogs, undefined, todayKey, manualAlerts, mealLogs);
  }, [templates, dailyMealState, activityLogs, hydrated, todayKey, manualAlerts, mealLogs]);

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

    let cancelled = false;

    async function persistTemplates() {
      try {
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
  }, [templates, hydrated, supabaseReady]);

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
    setDailyMealState((current) => {
      const existingById = new Map(current.map((entry) => [entry.mealId, entry]));
      return templates.map((template) => {
        const existing = existingById.get(template.id);
        return (
          existing ?? {
            mealId: template.id,
            actualTime: null,
            status: "upcoming" as const,
            fedNotes: null,
            skippedCareItemIds: [],
            dayKey: todayKey || currentTodayKey(),
          }
        );
      });
    });
  }, [templates, todayKey]);

  useEffect(() => {
    const resetForNewDay = () => {
      setHeaderDateTime(formatTodayHeaderDateTime());
      setAlertMinuteKey(currentAlertMinuteKey());
      const nextTodayKey = currentTodayKey();

      if (todayKey && nextTodayKey !== todayKey) {
        const missedMealLogs = templates.flatMap((template) => {
          const mealState = dailyMealState.find((entry) => entry.mealId === template.id && (entry.dayKey ?? todayKey) === todayKey);
          if (mealState?.status === "done") return [];
          return [buildMissedMealLog(template, todayKey, mealState?.skippedCareItemIds ?? [])];
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
          templates.map((template) => ({
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
  }, [dailyMealState, supabaseReady, templates, todayKey]);

  const todayMealState = useMemo(() => {
    const activeTodayKey = todayKey || currentTodayKey();
    return dailyMealState.filter((entry) => (entry.dayKey ?? activeTodayKey) === activeTodayKey);
  }, [dailyMealState, todayKey]);

  const dailyMeals = useMemo<DailyMeal[]>(() => {
    const stateByMealId = new Map(todayMealState.map((entry) => [entry.mealId, entry]));

    return templates.map((template) => {
      const existing = stateByMealId.get(template.id);
      return {
        ...template,
        actualTime: existing?.actualTime ?? null,
        status: existing?.status ?? "upcoming",
      };
    });
  }, [templates, todayMealState]);

  const missedMealIds = useMemo(() => {
    const activeTodayKey = todayKey || currentTodayKey();
    return new Set(
      mealLogs
        .filter((mealLog) => mealLog.dayKey === activeTodayKey && isMissedMealLog(mealLog))
        .map((mealLog) => mealLog.mealId)
    );
  }, [mealLogs, todayKey]);
  const allMealsDone = dailyMeals.length > 0 && dailyMeals.every((meal) => meal.status === "done" || missedMealIds.has(meal.id));
  const nextMeal = dailyMeals.find((meal) => meal.status !== "done" && !missedMealIds.has(meal.id)) ?? dailyMeals[0];
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
    if (!hydrated || !todayKey) return;

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
  }, [activityLogs, careTemplates, customCareStatus, hydrated, supabaseReady, todayKey]);

  const upcomingScheduleCards = useMemo(() => {
    void alertMinuteKey;

    type ScheduleCard =
      | { type: "meal"; sortMinutes: number; sortAt: Date; sortKey: string; meal: DailyMeal }
      | { type: "custom-care"; sortMinutes: number; sortAt: Date; sortKey: string; occurrence: CustomCareOccurrence };

    const cards: ScheduleCard[] = [];
    const mealCards = (allMealsDone ? (nextMeal && !missedMealIds.has(nextMeal.id) ? [nextMeal] : []) : dailyMeals.filter((meal) => meal.status !== "done" && !missedMealIds.has(meal.id)))
      .map((meal) => {
        const sortAt = mealScheduledAtForSort(meal, allMealsDone);
        return {
          type: "meal" as const,
          sortMinutes: sortAt.getHours() * 60 + sortAt.getMinutes(),
          sortAt,
          sortKey: `meal-${meal.id}`,
          meal,
        };
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

    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const sortedCards = cards
      .filter((card) => card.sortAt.getTime() > oneHourAgo)
      .sort((a, b) => a.sortAt.getTime() - b.sortAt.getTime() || a.sortKey.localeCompare(b.sortKey));
    if (!sortedCards.length) return sortedCards;

    const now = new Date();
    const hourMs = 60 * 60 * 1000;
    const previewEnd = now.getTime() + 4 * hourMs;

    const mainPreviewCards = sortedCards.filter((card) => card.sortAt.getTime() <= previewEnd);
    if (!mainPreviewCards.length) {
      const nextCardTime = sortedCards[0].sortAt.getTime();
      return sortedCards.filter((card) => card.sortAt.getTime() === nextCardTime);
    }

    const latestMainPreviewTime = Math.max(...mainPreviewCards.map((card) => card.sortAt.getTime()));
    const extraCarePreviewEnd = latestMainPreviewTime + 2 * hourMs;
    const hasMealBetween = (startTime: number, endTime: number) =>
      sortedCards.some((card) => card.type === "meal" && card.sortAt.getTime() > startTime && card.sortAt.getTime() <= endTime);
    const extraCareCards = sortedCards.filter((card) => {
      const cardTime = card.sortAt.getTime();
      return (
        card.type === "custom-care" &&
        cardTime > latestMainPreviewTime &&
        cardTime <= extraCarePreviewEnd &&
        !hasMealBetween(latestMainPreviewTime, cardTime)
      );
    });

    return [...mainPreviewCards, ...extraCareCards].sort((a, b) => a.sortAt.getTime() - b.sortAt.getTime() || a.sortKey.localeCompare(b.sortKey));
  }, [alertMinuteKey, allMealsDone, customCareOccurrences, dailyMeals, missedMealIds, nextMeal]);
  const groupedUpcomingScheduleCards = upcomingScheduleCards;
  const priorityScheduleTime = groupedUpcomingScheduleCards[0]?.sortAt.getTime() ?? null;
  const overdueActionCards = useMemo(() => {
    void alertMinuteKey;

    type OverdueActionCard =
      | { type: "meal"; sortAt: Date; sortKey: string; meal: DailyMeal }
      | { type: "custom-care"; sortAt: Date; sortKey: string; occurrence: CustomCareOccurrence };

    const activeTodayKey = todayKey || currentTodayKey();
    const cutoff = Date.now() - 60 * 60 * 1000;
    const mealCards = dailyMeals.flatMap<OverdueActionCard>((meal) => {
      const scheduledAt = mealScheduledAtForSort(meal, false);
      const hasResolvedLog = mealLogs.some((mealLog) => mealLog.dayKey === activeTodayKey && mealLog.mealId === meal.id && !isMissedMealLog(mealLog));

      if (meal.status === "done" || hasResolvedLog || scheduledAt.getTime() > cutoff) return [];
      return [{ type: "meal", sortAt: scheduledAt, sortKey: `meal-${meal.id}`, meal }];
    });
    const careCards = customCareOccurrences.flatMap<OverdueActionCard>((occurrence) => {
      if (dayKeyFromDate(occurrence.scheduledAt) !== activeTodayKey || occurrence.scheduledAt.getTime() > cutoff) return [];
      return [{ type: "custom-care", sortAt: occurrence.scheduledAt, sortKey: occurrence.key, occurrence }];
    });

    return [...mealCards, ...careCards].sort((a, b) => a.sortAt.getTime() - b.sortAt.getTime() || a.sortKey.localeCompare(b.sortKey));
  }, [alertMinuteKey, customCareOccurrences, dailyMeals, mealLogs, todayKey]);
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
    const mealTimeline = dailyMeals
      .filter((meal) => meal.actualTime)
      .flatMap((meal) => {
        const actualTime = meal.actualTime as string;
        const sortMinutes = parseClockMinutes(actualTime);
        const fedNotes = todayMealState.find((entry) => entry.mealId === meal.id)?.fedNotes?.trim();
        const skippedMeal = fedNotes === "Skipped";
        const mealItem = {
          time: actualTime,
          label: skippedMeal ? "Skipped Meal" : "Fed",
          detail: fedNotes && !skippedMeal ? `${meal.name}: ${meal.food} • Notes: ${fedNotes}` : `${meal.name}: ${meal.food}`,
          activityType: "meal" as const,
          sortMinutes,
          sortKey: `meal-${meal.id}`,
        };
        const skippedCareItemIds = todayMealState.find((entry) => entry.mealId === meal.id)?.skippedCareItemIds ?? [];
        const careItems = careItemsForMeal(careTemplates, meal.id).filter((item) => !skippedCareItemIds.includes(`${item.kind}-${item.id}`)).map((item) => ({
          time: actualTime,
          label: careKindLabel(item.kind),
          detail: `${item.name}${item.dose ? ` • ${item.dose}` : ""}${item.notes ? ` • ${item.notes}` : ""}`,
          activityType: item.kind,
          sortMinutes,
          sortKey: `meal-${meal.id}-${item.kind}-${item.id}`,
        }));

        return [mealItem, ...careItems];
      });

    const missedMealTimeline = mealLogs
      .filter((mealLog) => mealLog.dayKey === (todayKey || currentTodayKey()) && isMissedMealLog(mealLog))
      .map((mealLog) => {
        const sortMinutes = parseClockMinutes(mealLog.actualTime);
        return {
          time: mealLog.actualTime,
          label: "Missed Meal",
          detail: `${mealLog.mealName}: ${mealLog.food}`,
          activityType: "meal" as const,
          sortMinutes,
          sortKey: mealLog.id,
        };
      });

    const activityTimeline = todayActivityLogs.map((activity) => {
      const happenedAt = new Date(activity.happenedAt);
      return {
        time: formatActivityTime(activity.happenedAt),
        label: formatActivityLabel(activity.activityType),
        detail: renderActivityDetail(activity),
        activity,
        activityType: activity.activityType,
        sortMinutes: happenedAt.getHours() * 60 + happenedAt.getMinutes(),
        sortKey: activity.createdAt ?? activity.id,
      };
    });

    const manualAlertTimeline = manualAlerts
      .flatMap((alert) => {
        const events: Array<{ time: string; label: string; detail: string; activityType: "manual"; sortMinutes: number; sortKey: string }> = [];
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
            detail: `${alert.title}: ${alert.message}`,
            activityType: "manual",
            sortMinutes: createdAt.getHours() * 60 + createdAt.getMinutes(),
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
            detail: `${alert.title}: ${alert.message}`,
            activityType: "manual",
            sortMinutes: resolvedAt.getHours() * 60 + resolvedAt.getMinutes(),
            sortKey: `${alert.id}-resolved`,
          });
        }

        return events;
      });

    return [...mealTimeline, ...missedMealTimeline, ...activityTimeline, ...manualAlertTimeline].sort(
      (a, b) => a.sortMinutes - b.sortMinutes || a.sortKey.localeCompare(b.sortKey)
    );
  }, [dailyMeals, todayActivityLogs, todayMealState, careTemplates, manualAlerts, mealLogs, todayKey]);

  const alerts = useMemo(() => {
    void alertMinuteKey;
    return resolveAlerts(templates, todayMealState, todayActivityLogs, manualAlerts, reminderRules, careTemplates);
  }, [templates, todayMealState, todayActivityLogs, manualAlerts, reminderRules, careTemplates, alertMinuteKey]);
  const alertCards = alerts.filter((alert) => alert.kind !== "reminder");
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
      const mealLog = buildMealLog(
        updatedMeal,
        nextMealState.find((entry) => entry.mealId === mealId)?.fedNotes ?? null,
        activeTodayKey,
        nextMealState.find((entry) => entry.mealId === mealId)?.skippedCareItemIds ?? []
      );
      setMealLogs((current) => [mealLog, ...current.filter((entry) => entry.id !== mealLog.id && entry.id !== missedMealLogId(activeTodayKey, mealId))]);

      if (supabaseReady) {
        try {
          await saveMealLogToSupabase(mealLog);
          await deleteMealLogInSupabase(missedMealLogId(activeTodayKey, mealId));
        } catch {
          // local fallback already captured
        }
      }
    }

    setMealActionState("saving");
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

  const markMealSkipped = async (mealId: number) => {
    const activeTodayKey = todayKey || currentTodayKey();
    const template = templates.find((entry) => entry.id === mealId);
    if (!template) return;

    const skippedCareItemIds = careItemsForMeal(careTemplates, mealId).map((item) => `${item.kind}-${item.id}`);
    const mealLog = buildSkippedMealLog(template, activeTodayKey, skippedCareItemIds);

    setDailyMealState((current) =>
      current.map((meal) =>
        meal.mealId === mealId
          ? {
              ...meal,
              actualTime: template.plannedTime,
              status: "done",
              fedNotes: "Skipped",
              skippedCareItemIds,
              dayKey: activeTodayKey,
            }
          : meal
      )
    );

    setMealLogs((current) => [mealLog, ...current.filter((entry) => entry.id !== mealLog.id && entry.id !== missedMealLogId(activeTodayKey, mealId))]);
    setMealActionState("saving");

    if (supabaseReady) {
      try {
        await saveMealLogToSupabase(mealLog);
        await deleteMealLogInSupabase(missedMealLogId(activeTodayKey, mealId));
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
    const nextLogs = [activity, ...activityLogs.filter((entry) => entry.id !== activity.id)].sort(compareActivitiesReverseChronological);
    window.localStorage.setItem(ACTIVITY_LOGS_STORAGE_KEY, JSON.stringify(nextLogs));
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
    const activity = customCareActivityLog(occurrence, "given");

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
    const activity = customCareActivityLog(occurrence, "skipped", skipNote);

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
    if (!detailActivityType) return;

    const attachmentNote = attachmentFiles.length ? `Attachments: ${attachmentFiles.map((file) => file.name).join(", ")}` : "";
    const recordTagNote = recordTags.length ? `Record Tags: ${recordTags.join(", ")}` : "";
    const resolvedNotes =
      detailActivityType === "treat" || detailActivityType === "food"
        ? [notesValue.trim(), extraNotesValue.trim() ? `Notes: ${extraNotesValue.trim()}` : ""].filter(Boolean).join(" ") || null
        : [notesValue.trim(), recordTagNote, attachmentNote].filter(Boolean).join("\n") || null;
    const trimmedDetail = detailValue.trim();
    const resolvedActivityType = resolveActivityTypeForSave(detailActivityType, trimmedDetail);
    const activity: ActivityLog = {
      id: editingActivityId ?? `${resolvedActivityType}-${Date.now()}`,
      profileSlug: HEWSTER_PROFILE_SLUG,
      activityType: resolvedActivityType,
      happenedAt: mergeTodayWithTime(happenedAtValue),
      detail: resolvedActivityType === "pee" ? "Pee" : detailActivityType === "potty" ? trimmedDetail || null : trimmedDetail || null,
      notes: resolvedNotes,
      createdAt: editingActivityId ? activityLogs.find((entry) => entry.id === editingActivityId)?.createdAt : new Date().toISOString(),
    };

    await saveActivity(activity, editingActivityId ? "update" : "create");
    resetActivityEditor();
  };

  const deleteActivity = async () => {
    if (!editingActivityId) return;

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
        <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-24 pt-6">
          <header className="relative mb-6">
            <div className="pr-24">
              <div>
                <Link href="/hewie" className="text-sm font-bold text-[var(--hewie-active-text,#6d28d9)]">
                  Hewster&apos;s Notebook
                </Link>
                <div className="skeleton-pulse mt-1 h-8 w-56 rounded-xl bg-white/40" />
                <div className="skeleton-pulse mt-1 h-4 w-52 rounded-xl bg-white/30" />
              </div>
            </div>
            <PetAvatarMenu className="absolute right-0 top-0 size-20 rounded-full object-cover object-center ring-1 ring-zinc-500/60 shadow-sm" />
          </header>

          <div className="space-y-4">
            <div className="skeleton-pulse h-64 rounded-3xl bg-white/60 shadow-sm ring-1 ring-white/50" />
            <div className="skeleton-pulse h-52 rounded-3xl bg-white/60 shadow-sm ring-1 ring-white/50" />
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
        <header className="relative mb-6">
          <div className="pr-24">
            <div>
              <Link href="/hewie" className="text-sm font-bold text-[var(--hewie-active-text,#6d28d9)]">
                Hewster&apos;s Notebook
              </Link>
              <div className="mt-1 flex flex-col gap-1">
                <p className="text-xl font-bold tracking-tight text-zinc-700">{headerDateTime}</p>
              </div>
            </div>
          </div>
          <PetAvatarMenu className="absolute right-0 top-0 size-20 rounded-full object-cover object-center ring-1 ring-zinc-500/60 shadow-sm" />
          <p className="mt-1 pr-24 text-xs leading-4 text-zinc-600">
            Shared Meal Tracking And Potty Logs For Hewster.
          </p>
        </header>

        {alertCards.length ? (
          <section className="mb-3 space-y-2">
            {alertCards.slice(0, 3).map((alert) => (
              <div key={alert.id} className="flex min-h-12 items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-[#fff0f1] to-[#fcebed] px-3.5 py-2 text-[#d91f56] shadow-[0_8px_18px_rgba(255,27,90,0.10)] ring-1 ring-[#e6c8ce]/80">
                <div className="flex min-w-0 items-start gap-2">
                  <TriangleAlert className="size-4 shrink-0 self-center text-[#8f1739]" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold leading-4 text-[#8f1739]">{alert.title}</p>
                    <p className="line-clamp-1 text-xs leading-4 text-[#b71f48]/65">{alert.detail}</p>
                  </div>
                </div>
                {alert.kind === "manual" ? (
                  <button
                    type="button"
                    onClick={() => resolveManualAlert(alert.id)}
                    className="inline-flex h-7 shrink-0 items-center justify-center rounded-full bg-[var(--hewie-accent,#64748b)] px-3 text-[11px] font-semibold text-[var(--hewie-accent-text,#ffffff)] shadow-sm shadow-slate-400/20 ring-1 ring-white/30 transition hover:opacity-90 active:translate-y-px"
                  >
                    Done
                  </button>
                ) : null}
              </div>
            ))}
          </section>
        ) : null}

        {overdueActionCards.length ? (
          <section className="mb-3 space-y-2">
            {overdueActionCards.slice(0, 4).map((card) => {
              const title = card.type === "meal" ? `${card.meal.name} due ${card.meal.plannedTime}` : `${card.occurrence.item.name} due ${card.occurrence.timeLabel}`;
              const detail = "";
              const careKind = card.type === "custom-care" ? card.occurrence.item.kind : null;

              return (
                <div key={`overdue-${card.sortKey}`} className="flex min-h-12 items-center gap-2 rounded-2xl bg-gradient-to-r from-white/85 to-[var(--hewie-active-bg,#f1f5f9)]/80 px-3 py-2 text-[var(--hewie-active-text,#334155)] shadow-[0_8px_18px_rgba(15,23,42,0.06)] ring-1 ring-white/75">
                  {card.type === "meal" ? (
                    <Bell className="size-4 shrink-0 text-[var(--hewie-active-text,#334155)]" />
                  ) : careKind === "supplement" ? (
                    <Tablets className="size-4 shrink-0 text-[#1f3d5c]" />
                  ) : (
                    <MedicationPillIcon className="size-4 shrink-0 text-sky-600" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold leading-4 text-[var(--hewie-active-text,#334155)]">{title}</p>
                    {detail ? <p className="truncate text-xs leading-4 text-[var(--hewie-active-text,#334155)]/60">{detail}</p> : null}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-7 rounded-full border-0 bg-white/65 px-2.5 text-[11px] font-semibold text-[var(--hewie-active-text,#334155)]/70 ring-1 ring-[var(--hewie-ring,#cbd5e1)]/70 hover:bg-white/85"
                      onClick={() => card.type === "meal" ? markMealSkipped(card.meal.id) : markCustomCareSkipped(card.occurrence)}
                    >
                      Skip
                    </Button>
                    <Button
                      type="button"
                      className="h-7 rounded-full bg-[var(--hewie-accent,#64748b)] px-2.5 text-[11px] font-semibold text-[var(--hewie-accent-text,#ffffff)] hover:opacity-90"
                      onClick={() => card.type === "meal" ? markMealFed(card.meal.id) : markCustomCareGiven(card.occurrence)}
                    >
                      Done
                    </Button>
                  </div>
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

              return (
                <div key={reminder.id} className="rounded-2xl bg-gradient-to-r from-white/85 to-[var(--hewie-active-bg,#f1f5f9)]/80 px-3.5 py-3 text-[var(--hewie-active-text,#334155)] shadow-[0_8px_18px_rgba(15,23,42,0.06)] ring-1 ring-white/75">
                  <div className="flex min-h-10 items-start gap-3">
                    <Bell className="mt-0.5 size-4 shrink-0 text-[var(--hewie-active-text,#334155)]" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold leading-4 text-[var(--hewie-active-text,#334155)]">{reminder.title}</p>
                      <p className="mt-0.5 text-xs leading-4 text-[var(--hewie-active-text,#334155)]/60">{reminder.detail}</p>
                    </div>
                  </div>
                  {hasMealActions ? (
                    <div className="mt-2 grid grid-cols-2 gap-2 pl-7">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-8 rounded-full border-0 bg-white/65 px-3 text-xs font-semibold text-[var(--hewie-active-text,#334155)]/70 ring-1 ring-[var(--hewie-ring,#cbd5e1)]/70 hover:bg-white/85"
                        onClick={() => markMealSkipped(reminderMealId as number)}
                      >
                        Skip
                      </Button>
                      <Button
                        type="button"
                        className="h-8 rounded-full bg-[var(--hewie-accent,#64748b)] px-3 text-xs font-semibold text-[var(--hewie-accent-text,#ffffff)] hover:opacity-90"
                        onClick={() => markMealFed(reminderMealId as number)}
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

        {groupedUpcomingScheduleCards.length ? (
          <section className="mb-4 space-y-2">
            <section className={`rounded-3xl bg-[var(--hewie-active-bg,#f1f5f9)] ${groupedUpcomingScheduleCards.length === 1 ? "p-5" : "p-3"} text-[var(--hewie-active-text,#334155)] shadow-sm ring-1 ring-[var(--hewie-ring,#cbd5e1)]`}>
              <div className={groupedUpcomingScheduleCards.length > 1 ? "grid grid-cols-2 gap-2" : ""}>
                {groupedUpcomingScheduleCards.map((card, index) => {
                  const spanFullRow = groupedUpcomingScheduleCards.length > 1 && groupedUpcomingScheduleCards.length % 2 === 1 && index === groupedUpcomingScheduleCards.length - 1;
                  const cardMealCareItems = card.type === "meal" ? careItemsForMeal(careTemplates, card.meal.id) : [];

                  return card.type === "meal" ? (
                    <div key={card.sortKey} className={`${spanFullRow ? "col-span-2" : ""} ${priorityScheduleTime === card.sortAt.getTime() && groupedUpcomingScheduleCards.length > 1 ? "hewie-priority-border" : ""} ${groupedUpcomingScheduleCards.length === 1 ? "p-0" : "rounded-2xl bg-white/28 p-3"}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className={groupedUpcomingScheduleCards.length === 1 ? "text-sm text-[var(--hewie-active-text,#334155)]/70" : "text-xs font-bold uppercase tracking-wide text-[var(--hewie-active-text,#334155)]/55"}>Next Meal</p>
                          <h2 className={groupedUpcomingScheduleCards.length === 1 ? "mt-1 text-2xl font-semibold leading-8" : "mt-1 text-xl font-semibold leading-6"}>
                            {groupedUpcomingScheduleCards.length === 1 ? `${card.meal.name} at ${card.meal.plannedTime}` : card.meal.name}
                          </h2>
                          {groupedUpcomingScheduleCards.length > 1 ? <p className="mt-0.5 text-sm font-semibold text-[var(--hewie-active-text,#334155)]/70">{card.meal.plannedTime}</p> : null}
                        </div>
                        {card.meal.status === "late" ? (
                          <div className="rounded-full bg-white/80 px-2 py-1 text-[11px] font-medium text-[var(--hewie-active-text,#334155)] ring-1 ring-[var(--hewie-ring,#cbd5e1)]">
                            Late
                          </div>
                        ) : null}
                      </div>
                      <div className={`${groupedUpcomingScheduleCards.length === 1 ? "mt-3 space-y-2 text-sm leading-6" : "mt-3 space-y-1 text-sm leading-5"} text-[var(--hewie-active-text,#334155)]/80`}>
                        <p>{groupedUpcomingScheduleCards.length === 1 ? <span className="font-medium text-[var(--hewie-active-text,#334155)]">Food: </span> : null}{card.meal.food}</p>
                        {card.meal.notes ? <p className="text-[var(--hewie-active-text,#334155)]/58">{groupedUpcomingScheduleCards.length === 1 ? <span className="font-medium text-[var(--hewie-active-text,#334155)]">Notes: </span> : null}{card.meal.notes}</p> : null}
                      </div>
                      {cardMealCareItems.length ? (
                        <div className="mt-3 space-y-1.5 border-t border-[var(--hewie-ring,#cbd5e1)]/70 pt-3">
                          {cardMealCareItems.map((item) => <CareItemLine key={`${item.kind}-${item.id}`} item={item} tone="accent" />)}
                        </div>
                      ) : null}
                      <div className="mt-3 text-sm">
                        <Button
                          className={`${groupedUpcomingScheduleCards.length === 1 ? "h-12" : "h-10"} w-full rounded-2xl bg-[var(--hewie-accent,#64748b)] text-[var(--hewie-accent-text,#ffffff)] hover:opacity-90`}
                          onClick={() => markMealFed(card.meal.id)}
                        >
                          {groupedUpcomingScheduleCards.length === 1 ? "Mark Fed Now" : "Mark Fed"}
                        </Button>
                      </div>
                    </div>
                  ) : spanFullRow || groupedUpcomingScheduleCards.length === 1 ? (
                    <div key={card.sortKey} className={spanFullRow ? "col-span-2" : ""}>
                      <CustomCareCard
                        occurrence={card.occurrence}
                        isSkipOpen={customCareSkipKey === card.occurrence.key}
                        skipNote={customCareSkipNotes[card.occurrence.key] ?? ""}
                        onGiven={markCustomCareGiven}
                        onSkip={openCustomCareSkipNote}
                        onSkipNoteChange={updateCustomCareSkipNote}
                        onConfirmSkip={markCustomCareSkipped}
                        onCancelSkip={cancelCustomCareSkip}
                      />
                    </div>
                  ) : (
                    <div key={card.sortKey} className={`${priorityScheduleTime === card.sortAt.getTime() && groupedUpcomingScheduleCards.length > 1 ? `hewie-priority-border ${card.occurrence.item.kind === "supplement" ? "hewie-priority-border-supplement" : "hewie-priority-border-medication"}` : ""} rounded-2xl p-3 ring-1 ${card.occurrence.item.kind === "supplement" ? "bg-[#eaf0f8] text-[#1f3d5c] ring-[#b8c9dd]" : "bg-sky-50 text-sky-700 ring-sky-200"}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-bold uppercase tracking-wide text-current/55">{careKindLabel(card.occurrence.item.kind)}</p>
                          <h3 className="mt-1 line-clamp-2 text-xl font-semibold leading-6 text-current/95">
                            {card.occurrence.item.name}
                          </h3>
                          <p className="mt-0.5 text-sm font-semibold text-current/70">{card.occurrence.timeLabel}</p>
                        </div>
                        <span className={`flex size-9 shrink-0 items-center justify-center rounded-full ring-1 ${card.occurrence.item.kind === "supplement" ? "bg-white/55 text-[#1f3d5c] ring-[#b8c9dd]/70" : "bg-sky-100 text-sky-600 ring-transparent"}`}>
                          {card.occurrence.item.kind === "supplement" ? <Tablets className="size-5" /> : <MedicationPillIcon className="size-5" />}
                        </span>
                      </div>
                      <p className="mt-3 line-clamp-2 text-sm leading-5 text-current/70">{customCareGiveText(card.occurrence.item)}</p>
                      {customCareTimingLabel(card.occurrence.item) ? (
                        <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-normal ${card.occurrence.item.kind === "supplement" ? "bg-white/55 text-[#1f3d5c]/60" : "bg-sky-100/80 text-sky-700/60"}`}>
                          {customCareTimingLabel(card.occurrence.item)}
                        </span>
                      ) : null}
                      <p className="mt-1 text-xs font-normal text-current/45">{card.occurrence.frequencyText}</p>
                      {customCareSkipKey === card.occurrence.key ? (
                        <div className="mt-3 rounded-2xl bg-white/60 p-2.5 ring-1 ring-current/15">
                          <textarea
                            value={customCareSkipNotes[card.occurrence.key] ?? ""}
                            onChange={(event) => updateCustomCareSkipNote(card.occurrence, event.target.value)}
                            placeholder="Notes / Reasons"
                            rows={2}
                            className="w-full rounded-xl border border-current/15 bg-white/80 px-3 py-2 text-sm text-inherit outline-none placeholder:text-current/40 focus:ring-2 focus:ring-current/15"
                          />
                          <div className="mt-2 grid grid-cols-2 gap-1.5">
                            <Button variant="outline" className="h-8 rounded-full border-current/20 bg-transparent px-2 text-xs font-semibold text-inherit hover:bg-white/40" onClick={() => cancelCustomCareSkip(card.occurrence)}>
                              Cancel
                            </Button>
                            <Button className="h-8 rounded-full bg-white/80 px-2 text-xs font-semibold text-inherit ring-1 ring-current/20 hover:bg-white" onClick={() => markCustomCareSkipped(card.occurrence)}>
                              Confirm
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 grid grid-cols-2 gap-1.5">
                          <Button variant="outline" className={`h-9 rounded-full border-0 px-2 text-xs font-medium shadow-sm ring-1 ${card.occurrence.item.kind === "supplement" ? "bg-white/45 text-[#1f3d5c]/55 ring-[#b8c9dd]/45 hover:bg-white/70 hover:text-[#1f3d5c]/75" : "bg-white/55 text-sky-700/55 ring-sky-200/55 hover:bg-white/80 hover:text-sky-700/75"}`} onClick={() => openCustomCareSkipNote(card.occurrence)}>
                            Skip
                          </Button>
                          <Button className={`h-9 rounded-full px-2 text-xs font-semibold shadow-sm ring-1 ${card.occurrence.item.kind === "supplement" ? "bg-white/65 text-[#1f3d5c] ring-[#b8c9dd]/70 hover:bg-white/85" : "bg-sky-100 text-sky-700 ring-sky-200/80 hover:bg-sky-100/80"}`} onClick={() => markCustomCareGiven(card.occurrence)}>
                            Done
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

          </section>
        ) : null}
        <QuickLogCard activityState={activityState} onQuickLog={quickLogActivity} title={null} iconOnly>
          {detailActivityType ? (
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
              attachmentNames={attachmentFiles.map((file) => file.name)}
              onAttachmentsChange={setAttachmentFiles}
              recordTags={recordTags}
              onRecordTagsChange={setRecordTags}
              onHappenedAtChange={setHappenedAtValue}
              onSave={saveDetailedActivity}
              onCancel={resetActivityEditor}
              onDelete={editingActivityId ? deleteActivity : undefined}
              saving={activityState === "saving"}
            />
          ) : null}
        </QuickLogCard>

        <ActivityFeed activityLogs={todayActivityLogs} timelineItems={dynamicTimeline} title="Today&apos;s Timeline" />

        <section className="mb-4 rounded-3xl bg-[#fff5d8] p-5 text-[#765313] shadow-sm ring-1 ring-[#ead28a]/80">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[#6f4c0f]">Poop Records</h2>
              <p className="text-sm text-[#765313]/65">Last {poopRecordsWindowDays} Days For Quick Food Correlations.</p>
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
                <article key={record.id} className="rounded-2xl bg-[#ead7a8] p-4 shadow-sm ring-1 ring-[#ead28a]/55">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="flex size-9 items-center justify-center rounded-full bg-white/60 text-[#8a6200] ring-1 ring-[#f0d27a]/60">
                        <span className="text-lg leading-none">{"\u{1F6BD}"}</span>
                      </span>
                      <p className="font-medium text-[#6f4c0f]">Potty</p>
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
                    </div>
                  </div>
                  <PottyDetailBadges detail={record.detail} notes={record.notes} />
                </article>
              ))
            ) : (
              <p className="text-sm text-[#765313]/65">No Poop Records Logged Yet.</p>
            )}
          </div>
        </section>

        <BottomNav alertsCount={alertCards.length} />
      </div>
    </main>
  );
}
