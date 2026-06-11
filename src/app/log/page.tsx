"use client";



import { Check, ChevronDown, Clock3, Tablets } from "lucide-react";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";



import { ActivityDetailForm } from "@/components/activity-detail-form";

import { ActivityFeed } from "@/components/activity-feed";

import { BottomNav } from "@/components/bottom-nav";
import { CenteredLoadingIcon } from "@/components/centered-loading-icon";
import { ExpandableNoteText } from "@/components/expandable-note-text";
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

  loadAppState,
  loadNotebookEntryPermissions,
  mealTemplatesForHistoryDay,
  persistDailyMealStateLocally,
  activityAttachmentFileNamesForSave,

  saveCompletedMealToSupabase,

  saveActivityLogToSupabase,
  saveActivityAttachmentsToSupabase,

  saveDailyMealsToSupabase,

  updateActivityLogInSupabase,

} from "@/lib/hewster-data";

import { compareActivitiesReverseChronological, formatActivityLabel, formatActivityTime, renderActivityDetail } from "@/lib/activity";

import { initialTemplates, isMealTemplateActiveForDay, type MealStatus, type MealTemplate } from "@/lib/meal-templates";

import { careItemsForMeal, loadCareTemplates, loadCareTemplatesFromSupabase, mealPlanDoseNumberForMeal, mealPlanTotalDoseCount, type CareItemKind, type CareItemTemplate } from "@/lib/care-settings";

import { HEWSTER_PROFILE_SLUG, isSupabaseConfigured } from "@/lib/supabase";
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

function LogPencilIcon() {
  return (
    <svg
      className="size-6"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <path d="M5.2 18.8 6.4 14 15.8 4.6a2 2 0 0 1 2.8 0l.8.8a2 2 0 0 1 0 2.8L10 17.6l-4.8 1.2Z" />
      <path d="m14.3 6.1 3.6 3.6" />
      <path d="m6.4 14 3.6 3.6" />
    </svg>
  );
}

function LogTitleBadge() {
  return (
    <span className="mx-auto inline-flex w-fit items-center justify-center gap-2 rounded-full border border-[var(--hewie-accent-text,#ffffff)]/28 bg-[color-mix(in_srgb,var(--hewie-accent,#64748b)_78%,black)] px-4 py-1.5 text-[var(--hewie-accent-text,#ffffff)] shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_10px_20px_rgba(15,23,42,0.14)] backdrop-blur-[1px]">
      <LogPencilIcon />
      <span>Log</span>
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



function editableCareNoteText(notes: string | null) {

  const lines = notes?.split("\n").map((line) => line.trim()).filter(Boolean) ?? [];

  const skipNote = lines.find((line) => line.startsWith("Skip Note: "))?.replace("Skip Note: ", "").trim();

  if (skipNote) return skipNote;



  const explicitNotes = lines.filter((line) => line.startsWith("Notes: ")).map((line) => line.replace("Notes: ", "").trim());

  if (explicitNotes.length) return explicitNotes.join("\n");



  return lines

    .filter((line) => {

      if (line.startsWith("Give ")) return false;

      if (line.startsWith("Every ") || line.endsWith("Schedules")) return false;

      if (generatedCareNoteValues.has(line)) return false;

      if (line.startsWith("Attachments: ") || line.startsWith("Record Tags: ")) return false;

      return true;

    })

    .join("\n");

}



function careNotesForSave(originalNotes: string | null, status: string, editableNotes: string, recordTagNote: string, attachmentNote: string) {

  const preserved = originalNotes?.split("\n").map((line) => line.trim()).filter((line) => {

    if (!line) return false;

    if (line.startsWith("Skip Note: ") || line.startsWith("Notes: ")) return false;

    if (line.startsWith("Attachments: ") || line.startsWith("Record Tags: ")) return false;

    return true;

  }) ?? [];

  const trimmedNotes = editableNotes.trim();

  const userNote = trimmedNotes ? (status === "Skipped" ? `Skip Note: ${trimmedNotes}` : `Notes: ${trimmedNotes}`) : "";

  return [preserved.join("\n"), userNote, recordTagNote, attachmentNote].filter(Boolean).join("\n") || null;

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
    profileSlug: HEWSTER_PROFILE_SLUG,
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

function customCareDisplayDate(activity: ActivityLog) {
  return new Date(activity.happenedAt);
}

function mealPlanCareTimingLabel(item: CareItemTemplate) {
  if (item.kind !== "medication" || item.medicationType !== "oral") return null;
  return "With Food";
}

function mealPlanCareDetailText(item: CareItemTemplate) {
  const dose = item.dose ? ` — ${item.dose}` : "";
  const route = medicationTypeLabel(item);
  const routeText = route ? ` (${route})` : "";
  return `${dose}${routeText}`;
}

function CareItemLine({ item, skipped = false }: { item: CareItemTemplate & { isLastDose?: boolean }; skipped?: boolean }) {
  const iconClassName = item.kind === "supplement"
    ? "bg-[#eaf0f8] text-[#1f3d5c] ring-[#b8c9dd]"
    : "bg-sky-50 text-sky-600 ring-sky-200";
  const lineClassName = skipped
    ? "rounded-2xl bg-rose-50/70 px-2 py-1.5 text-rose-700 ring-1 ring-rose-200/70"
    : "text-[#6b3f22]/70";
  const textClassName = skipped ? "text-rose-800" : "text-[#4f2f1b]";
  const timingLabel = mealPlanCareTimingLabel(item);
  const timingBadgeClassName = item.kind === "supplement"
    ? "bg-white/55 text-[#1f3d5c]/60"
    : "bg-sky-100/80 text-sky-700/60";

  return (
    <div className={`flex items-start gap-2 text-sm leading-5 ${lineClassName}`}>
      <span className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ring-1 ${iconClassName}`}>
        {item.kind === "supplement" ? <Tablets className="size-3" /> : <MedicationPillIcon className="size-3.5" />}
      </span>
      <div className="min-w-0 flex-1">
        <p>
          <span className={`font-semibold ${textClassName}`}>{careKindLabel(item.kind)}:</span>{" "}
          <span className={`font-semibold ${textClassName}`}>{item.name}</span>
          <span className={`font-normal ${textClassName}`}>{mealPlanCareDetailText(item)}</span>
          {timingLabel ? <span className={`ml-2 inline-flex rounded-full px-2 py-0.5 text-xs font-normal ${timingBadgeClassName}`}>{timingLabel}</span> : null}
          {item.isLastDose ? <span className="ml-2 inline-flex rounded-full bg-amber-100/80 px-2 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-200/70">Last Dose</span> : null}
          {skipped ? <span className="ml-2 inline-flex rounded-full bg-white/70 px-2 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-200/80">Skipped</span> : null}
        </p>
        {!skipped && item.notes ? <ExpandableNoteText className="mt-0.5 text-[#6b3f22]/62">Notes: {item.notes}</ExpandableNoteText> : null}
      </div>
    </div>
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
  careTemplates,
  editingMealTimeId,
  editingMealTimeValue,
  editingMealNoteValue,
  editingSkippedCareItemIds,
  onOpenMealEditor,
  onActualTimeChange,
  onFedNoteChange,
  onToggleCareItem,
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
  careTemplates: CareItemTemplate[];
  editingMealTimeId: number | null;
  editingMealTimeValue: string;
  editingMealNoteValue: string;
  editingSkippedCareItemIds: string[];
  onOpenMealEditor: (mealId: number, actualTime: string | null) => void;
  onActualTimeChange: (value: string) => void;
  onFedNoteChange: (value: string) => void;
  onToggleCareItem: (careItemId: string) => void;
  onSaveMeal: () => void;
  onCancelMealEdit: () => void;
  onUndoMeal: (mealId: number) => void;
  canUndoMeal: boolean;
}) {
  const dayMealLogs = mealLogs.filter((mealLog) => mealLog.dayKey === dayKey);
  const dayMealState = dailyMealState.filter((meal) => (meal.dayKey ?? currentTodayKey()) === dayKey);

  return (
    <section className="mb-4 rounded-3xl bg-[#f4eadf]/90 p-5 text-[#6b3f22] shadow-sm ring-1 ring-[#d8b895]/65">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-[#5f3a22]">Today&apos;s Meal Plan</h2>
        <p className="text-sm text-[#6b3f22]/62">{isToday ? "Today's meals, checked off as they're logged." : "Meals for this day, checked off as they're logged."}</p>
      </div>

      <div className="space-y-3">
        {templates.map((meal) => {
          const mealState = dayMealState.find((entry) => entry.mealId === meal.id);
          const mealLog = dayMealLogs.find((entry) => entry.mealId === meal.id && !isMissedMealLog(entry)) ?? dayMealLogs.find((entry) => entry.mealId === meal.id);
          const status = mealLogStatus(mealLog, mealState?.status ?? "upcoming");
          const actualTime = mealLog?.actualTime ?? mealState?.actualTime ?? null;
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
              key={meal.id}
              className="cursor-pointer rounded-2xl bg-white/72 p-4 shadow-sm ring-1 ring-[#d8b895]/55 transition hover:bg-white/82 active:scale-[0.995]"
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
                    actualTime={editingMealTimeValue}
                    onActualTimeChange={onActualTimeChange}
                    fedNote={editingMealNoteValue}
                    onFedNoteChange={onFedNoteChange}
                    onSave={onSaveMeal}
                    saveLabel={actualTime ? "Save" : "Mark Fed"}
                    onCancel={onCancelMealEdit}
                    onUndo={actualTime && canUndoMeal ? () => onUndoMeal(meal.id) : undefined}
                    careItems={mealCareItems}
                    skippedCareItemIds={editingSkippedCareItemIds}
                    onToggleCareItem={onToggleCareItem}
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



export default function LogPage() {
  const [logDayKey, setLogDayKey] = useState(currentTodayKey);
  const isTodayLog = logDayKey === currentTodayKey();

  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);

  const [mealLogs, setMealLogs] = useState<MealLog[]>([]);

  const [templates, setTemplates] = useState<MealTemplate[]>(initialTemplates);
  const [mealTemplateAuditSnapshots, setMealTemplateAuditSnapshots] = useState<MealTemplateAuditSnapshot[]>([]);

  const [dailyMealState, setDailyMealState] = useState<DailyMealState[]>([]);

  const [editingMealTimeId, setEditingMealTimeId] = useState<number | null>(null);

  const [editingMealTimeValue, setEditingMealTimeValue] = useState("");

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
  const [notebookOwnerId, setNotebookOwnerId] = useState<string | null>(null);
  const [subscriptionPlan, setSubscriptionPlan] = useState<SubscriptionPlanId>("free");

  const supabaseReady = isSupabaseConfigured();
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
    subscriptionPlan !== "plus" && (
      detailActivityType === "potty" || detailActivityType === "poop"
        ? freeAttachmentCounts.pottyImageUses >= FREE_POTTY_IMAGE_USE_LIMIT
        : freeAttachmentCounts.medicalAttachmentUses >= FREE_MEDICAL_ATTACHMENT_USE_LIMIT
    );

  const detailAttachmentPickerBlockedMessage =
    detailActivityType === "potty" || detailActivityType === "poop"
      ? "Your first poop image is free. Upgrade to Plus to add more images."
      : "Your first attachment is free. Upgrade to Plus to add more files.";

  useEffect(() => {
    const requestedDay = new URLSearchParams(window.location.search).get("date");
    if (requestedDay && isValidDayKey(requestedDay) && requestedDay <= currentTodayKey()) {
      setLogDayKey(requestedDay);
    }
  }, []);



  useEffect(() => {
    let cancelled = false;
    const refreshPermissions = () => {
      void loadNotebookEntryPermissions().then((permissions) => {
        if (!cancelled) {
          setCanEditEntries(permissions.canEditEntries);
          setCanDeleteEntries(permissions.canDeleteEntries);
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

        setDailyMealState(state.dailyMealState ?? []);
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

    window.localStorage.setItem(ACTIVITY_LOGS_STORAGE_KEY, JSON.stringify(activityLogs));

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

  const persistMealState = (nextMealState: DailyMealState[], nextMealLogs: MealLog[]) => {
    persistDailyMealStateLocally(nextMealState);
    window.localStorage.setItem(MEAL_LOGS_STORAGE_KEY, JSON.stringify(nextMealLogs));
  };

  const persistHistoricalMealState = (nextMealState: DailyMealState[], nextMealLogs: MealLog[]) => {
    persistDailyMealStateLocally(nextMealState, logDayKey);
    window.localStorage.setItem(MEAL_LOGS_STORAGE_KEY, JSON.stringify(nextMealLogs));
  };

  const openMealTimeEditor = useCallback((mealId: number, actualTime: string | null) => {
    const mealState = dailyMealState.find((entry) => entry.mealId === mealId && (entry.dayKey ?? currentTodayKey()) === logDayKey);
    const mealLog = mealLogs.find((entry) => entry.dayKey === logDayKey && entry.mealId === mealId && !isMissedMealLog(entry)) ?? mealLogs.find((entry) => entry.dayKey === logDayKey && entry.mealId === mealId);
    setEditingMealTimeId(mealId);
    setEditingMealTimeValue(actualTime ?? mealLog?.actualTime ?? mealState?.actualTime ?? nowForTimeInput());
    setEditingMealNoteValue(mealLog?.fedNotes ?? mealState?.fedNotes ?? "");
    setEditingSkippedCareItemIds(mealLog?.skippedCareItemIds ?? mealState?.skippedCareItemIds ?? []);
  }, [dailyMealState, logDayKey, mealLogs]);

  const cancelMealTimeEditor = () => {
    setEditingMealTimeId(null);
    setEditingMealTimeValue("");
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

    const actualTime = editingMealTimeValue.trim();
    const mealLogId = `${logDayKey}-${editingMealTimeId}`;
    const updatedMealState = {
      mealId: editingMealTimeId,
      actualTime: actualTime || null,
      status: actualTime ? ("done" as const) : ("upcoming" as const),
      fedNotes: editingMealNoteValue.trim() || null,
      skippedCareItemIds: editingSkippedCareItemIds,
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
        editingMealNoteValue.trim() || null,
        logDayKey,
        editingSkippedCareItemIds,
        loggedCareItemsForMeal(careTemplates, template, templatesForLogDay, logDayKey, editingSkippedCareItemIds)
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

  const undoMealFed = async (mealId: number) => {
    const confirmed = window.confirm("Undo this fed meal entry?");
    if (!confirmed) return;

    const mealLogId = `${logDayKey}-${mealId}`;
    const nextMealState = dailyMealState.map((meal) =>
      meal.mealId === mealId && (meal.dayKey ?? currentTodayKey()) === logDayKey
        ? {
            ...meal,
            actualTime: null,
            status: "upcoming" as const,
            fedNotes: null,
            skippedCareItemIds: [],
            dayKey: logDayKey,
          }
        : meal
    );
    const nextMealLogs = mealLogs.filter((entry) => entry.id !== mealLogId);

    if (isTodayLog) {
      setDailyMealState(nextMealState);
      persistMealState(nextMealState, nextMealLogs);
    } else {
      window.localStorage.setItem(MEAL_LOGS_STORAGE_KEY, JSON.stringify(nextMealLogs));
    }
    setMealLogs(nextMealLogs);
    cancelMealTimeEditor();

    if (supabaseReady) {
      try {
        await deleteMealLogInSupabase(mealLogId);
        if (isTodayLog) {
          await saveDailyMealsToSupabase(nextMealState);
        }
      } catch {
        // local fallback already captured
      }
    }
  };

  const selectedDayEventItems = useMemo(() => {

    const activityItems = selectedDayActivityLogs.map((activity) => {

      const happenedAt = customCareDisplayDate(activity);

      return {

        time: formatActivityTime(happenedAt.toISOString()),

        label: formatActivityLabel(activity.activityType),

        detail: renderActivityDetail(activity),

        activity,

        activityType: activity.activityType,

        sortMinutes: happenedAt.getHours() * 60 + happenedAt.getMinutes(),

        sortKey: activity.createdAt ?? activity.id,

      };

    });

    return activityItems.sort((a, b) => a.sortMinutes - b.sortMinutes || a.sortKey.localeCompare(b.sortKey));

  }, [selectedDayActivityLogs]);



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



  const openEditorForActivity = (activity: ActivityLog) => {

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

      setNotesValue(editableCareNoteText(activity.notes));

      setExtraNotesValue("");

    } else {

      setNotesValue(activity.notes ?? "");

      setExtraNotesValue("");

    }

    setHappenedAtValue(toTimeInputValue(activity.happenedAt));
    setAttachmentFiles([]);

  };

  useEffect(() => {
    if (!hydrated || autoOpenedHistoryEditor) return;

    const searchParams = new URLSearchParams(window.location.search);
    const requestedDay = searchParams.get("date");
    if (requestedDay && isValidDayKey(requestedDay) && requestedDay !== logDayKey) return;

    const editActivityId = searchParams.get("editActivity");
    if (editActivityId) {
      const activity = activityLogs.find((entry) => entry.id === editActivityId);
      if (!activity) return;
      openEditorForActivity(activity);
      setAutoOpenedHistoryEditor(true);
      return;
    }

    const editMealId = Number(searchParams.get("editMeal"));
    if (Number.isFinite(editMealId) && editMealId > 0) {
      const mealLog = mealLogs.find((entry) => entry.dayKey === logDayKey && entry.mealId === editMealId && !isMissedMealLog(entry)) ?? mealLogs.find((entry) => entry.dayKey === logDayKey && entry.mealId === editMealId);
      openMealTimeEditor(editMealId, mealLog?.actualTime ?? null);
      setAutoOpenedHistoryEditor(true);
    }
  }, [activityLogs, autoOpenedHistoryEditor, hydrated, logDayKey, mealLogs, openMealTimeEditor]);



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

      profileSlug: HEWSTER_PROFILE_SLUG,

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

    const trimmedDetail = detailValue.trim();

    const resolvedActivityType = resolveActivityTypeForSave(detailActivityType, trimmedDetail);

    const happenedAt = mergeDayWithTime(logDayKey, happenedAtValue);

    const attachmentDocumentTypes = attachmentDocumentTypesForActivity(resolvedActivityType);

    const attachmentNames = activityAttachmentFileNamesForSave(
      { id: editingActivityId ?? "", profileSlug: HEWSTER_PROFILE_SLUG, activityType: resolvedActivityType, happenedAt, detail: null, notes: null },
      attachmentFiles,
      attachmentDocumentTypes
    );

    const attachmentNote = attachmentNames.length ? `Attachments: ${attachmentNames.join(", ")}` : "";

    const resolvedNotes =

      detailActivityType === "treat"

        ? [notesValue.trim(), extraNotesValue.trim() ? `Notes: ${extraNotesValue.trim()}` : ""].filter(Boolean).join(" ") || null

        : isCareActivityType(detailActivityType)

          ? careNotesForSave(existingActivity?.notes ?? null, detailValue.trim(), notesValue, recordTagNote, attachmentNote)

          : [notesValue.trim(), recordTagNote, attachmentNote].filter(Boolean).join("\n") || null;

    const activity: ActivityLog = {

      id: editingActivityId ?? `${resolvedActivityType}-${Date.now()}`,

      profileSlug: HEWSTER_PROFILE_SLUG,

      activityType: resolvedActivityType,

      happenedAt,

      detail: resolvedActivityType === "pee" ? "Pee" : detailActivityType === "potty" ? trimmedDetail || null : isCareActivityType(detailActivityType) ? careDetailForSave(existingActivity?.detail ?? null, trimmedDetail || "Given") : trimmedDetail || null,

      notes: resolvedNotes,

      createdAt: editingActivityId ? existingActivity?.createdAt : new Date().toISOString(),

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

      resetEditor();

    } catch {

      setActivityState("error");

    }

  };

  const activityFeed = (
    <ActivityFeed
      activityLogs={selectedDayActivityLogs}
      timelineItems={selectedDayEventItems}
      grouped
      title={isTodayLog ? "Today's Events" : `${formatLogDayLabel(logDayKey)} Events`}
      subtitle={`Review and edit ${isTodayLog ? "today's" : "this day's"} events and meal plan.`}
      onSelectActivity={canEditEntries ? openEditorForActivity : undefined}
      careTemplates={careTemplates}
      renderInlineEditor={(activity) =>
        activity.id === editingActivityId || (!editingActivityId && detailActivityType === activity.activityType && activity.happenedAt === selectedDayActivityLogs[0]?.happenedAt)
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
                attachmentNames={attachmentFiles.length ? attachmentFiles.map((file) => file.name) : activity.attachments?.map((attachment) => attachment.fileName) ?? []}
                onAttachmentsChange={setAttachmentFiles}
                maxAttachmentFiles={detailAttachmentLimit}
                attachmentPickerBlocked={detailAttachmentPickerBlocked}
                attachmentPickerBlockedMessage={detailAttachmentPickerBlockedMessage}
                recordTags={recordTags}
                onRecordTagsChange={setRecordTags}
                onHappenedAtChange={setHappenedAtValue}
                onSave={saveDetailedActivity}
                onCancel={resetEditor}
                onDelete={editingActivityId && canDeleteEntries ? deleteActivity : undefined}
                saveLabel="Save"
                saving={activityState === "saving"}
                savedCareItems={careTemplates.filter((item) => item.asNeeded && (item.kind === detailActivityType || (detailActivityType === "sick" && item.kind === "medication") || (detailActivityType === "wellness" && item.kind === "supplement")))}
              />
            )
          : null
      }
      notebookOwnerId={notebookOwnerId}
    />
  );



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

        <header className="mb-5 px-1 pb-2">

          <div className="flex min-h-[4.5rem] items-center justify-between gap-3">

            <div className="min-w-0 flex-1">

              <PetNotebookTitle href="/hewie" className="text-sm font-bold text-[var(--hewie-active-text,#6d28d9)]" />
              <h1 className="mt-1 text-xl font-bold tracking-tight text-[#3b2832]">Manage Events</h1>

            </div>

            <PetAvatarMenu shape="tile" />

          </div>

        </header>


        {!isTodayLog ? activityFeed : null}

        {logEventOpen ? (
          <div className="log-event-open-panel relative mb-7 [&>section]:mb-0">
            <QuickLogCard
              activityState={activityState}
              onQuickLog={quickLogActivity}
              title={<LogTitleBadge />}
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

                attachmentNames={attachmentFiles.length ? attachmentFiles.map((file) => file.name) : []}

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
              className="absolute inset-x-0 -bottom-4 z-10 mx-auto flex h-7 w-20 items-center justify-center rounded-b-2xl rounded-t-none bg-[var(--hewie-accent,#64748b)] text-[var(--hewie-accent-text,#ffffff)]/70 shadow-[0_8px_12px_-8px_rgba(15,23,42,0.35)] transition duration-200 ease-out hover:translate-y-0.5 hover:text-[var(--hewie-accent-text,#ffffff)]/90 active:translate-y-1 active:scale-95"
              aria-label="Collapse Log"
            >
              <ChevronDown className="log-event-handle-sheen size-7 opacity-80" strokeWidth={3} aria-hidden="true" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={openLogEvent}
            className="group relative mb-7 flex w-full cursor-pointer items-center justify-center overflow-visible rounded-t-3xl rounded-b-[1.35rem] bg-[var(--hewie-accent,#64748b)] px-5 pb-6 pt-4 text-center text-[var(--hewie-accent-text,#ffffff)] shadow-sm ring-1 ring-[var(--hewie-accent,#64748b)]/35 transition duration-200 ease-out hover:opacity-95 active:translate-y-0.5 active:scale-[0.985]"
          >
            <h2 className="flex w-full items-center justify-center text-lg font-semibold"><LogTitleBadge /></h2>
            <div className="pointer-events-none absolute inset-x-0 -bottom-4 flex justify-center">
              <div className="flex h-7 w-20 items-center justify-center rounded-b-2xl rounded-t-none bg-[var(--hewie-accent,#64748b)] text-[var(--hewie-accent-text,#ffffff)]/70 shadow-[0_8px_12px_-8px_rgba(15,23,42,0.35)] transition duration-200 ease-out group-hover:translate-y-0.5 group-hover:text-[var(--hewie-accent-text,#ffffff)]/90 group-active:translate-y-1">
                <ChevronDown className="log-event-handle-sheen size-7 opacity-80" strokeWidth={3} aria-hidden="true" />
              </div>
            </div>
          </button>
        )}



        {isTodayLog ? activityFeed : null}



        <TodayMealPlanCard
          dayKey={logDayKey}
          isToday={isTodayLog}
          templates={activeTemplates}
          dailyMealState={dailyMealState}
          mealLogs={mealLogs}
          careTemplates={careTemplates}
          editingMealTimeId={editingMealTimeId}
          editingMealTimeValue={editingMealTimeValue}
          editingMealNoteValue={editingMealNoteValue}
          editingSkippedCareItemIds={editingSkippedCareItemIds}
          onOpenMealEditor={canEditEntries ? openMealTimeEditor : () => undefined}
          onActualTimeChange={setEditingMealTimeValue}
          onFedNoteChange={setEditingMealNoteValue}
          onToggleCareItem={toggleEditingCareItem}
          onSaveMeal={saveMealTime}
          onCancelMealEdit={cancelMealTimeEditor}
          onUndoMeal={undoMealFed}
          canUndoMeal={canDeleteEntries}
        />



        <BottomNav />

      </div>

    </main>

  );

}

