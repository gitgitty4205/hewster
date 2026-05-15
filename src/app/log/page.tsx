"use client";



import { PetAvatarMenu } from "@/components/pet-avatar-menu";

import { Check, ChevronDown, ChevronUp, Clock3, Ellipsis, Tablets } from "lucide-react";

import Link from "next/link";

import { useEffect, useMemo, useState } from "react";



import { ActivityDetailForm } from "@/components/activity-detail-form";

import { ActivityFeed } from "@/components/activity-feed";

import { BottomNav } from "@/components/bottom-nav";

import { MealTimeForm } from "@/components/meal-time-form";

import { QuickLogCard } from "@/components/quick-log-card";

import { Button } from "@/components/ui/button";
import { MedicationPillIcon } from "@/components/medication-pill-icon";

import {

  ACTIVITY_LOGS_STORAGE_KEY,

  DAILY_MEAL_STORAGE_KEY,

  currentTodayKey,

  deleteActivityLogInSupabase,

  deleteMealLogInSupabase,

  type ActivityLog,

  type ActivityType,

  type DailyMealState,

  type MealLog,

  MEAL_LOGS_STORAGE_KEY,

  loadAppState,

  saveActivityLogToSupabase,

  saveMealLogToSupabase,

  updateActivityLogInSupabase,

} from "@/lib/hewster-data";

import { compareActivitiesReverseChronological, formatActivityLabel, formatActivityTime, renderActivityDetail } from "@/lib/activity";

import { initialTemplates, type MealStatus, type MealTemplate } from "@/lib/meal-templates";

import { careItemsForMeal, loadCareTemplates, loadCareTemplatesFromSupabase, type CareItemKind, type CareItemTemplate } from "@/lib/care-settings";

import { HEWSTER_PROFILE_SLUG, isSupabaseConfigured } from "@/lib/supabase";



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



function mergeTodayWithTime(timeValue: string) {

  const [hours, minutes] = timeValue.split(":").map(Number);

  const now = new Date();

  now.setHours(hours, minutes, 0, 0);

  return now.toISOString();

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

  const name = careNameFromDetail(originalDetail) || "Medication";

  return status === "Given" ? name : `${name} ${status}`;

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

function buildMealLog(meal: MealTemplate, actualTime: string, fedNotes: string | null, dayKey: string, skippedCareItemIds: string[] = []): MealLog {
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

function CareItemLine({ item, skipped = false }: { item: CareItemTemplate; skipped?: boolean }) {
  const iconClassName = item.kind === "supplement"
    ? "bg-[#eaf0f8] text-[#1f3d5c] ring-[#b8c9dd]"
    : "bg-sky-50 text-sky-600 ring-sky-200";
  const lineClassName = skipped
    ? "rounded-2xl bg-rose-50/70 px-2 py-1.5 text-rose-700 ring-1 ring-rose-200/70"
    : "text-[#6b3f22]/70";
  const textClassName = skipped ? "text-rose-800" : "text-[#4f2f1b]";

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

function TodayMealPlanCard({
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
}: {
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
}) {
  const today = currentTodayKey();
  const todayMealLogs = mealLogs.filter((mealLog) => mealLog.dayKey === today);

  return (
    <section className="mb-4 rounded-3xl bg-[#f4eadf]/90 p-5 text-[#6b3f22] shadow-sm ring-1 ring-[#d8b895]/65">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-[#5f3a22]">Meal Plan</h2>
        <p className="text-sm text-[#6b3f22]/62">Today&apos;s meals, checked off as they&apos;re logged.</p>
      </div>

      <div className="space-y-3">
        {templates.map((meal) => {
          const mealState = dailyMealState.find((entry) => entry.mealId === meal.id);
          const mealLog = todayMealLogs.find((entry) => entry.mealId === meal.id && !isMissedMealLog(entry)) ?? todayMealLogs.find((entry) => entry.mealId === meal.id);
          const status = mealLogStatus(mealLog, mealState?.status ?? "upcoming");
          const actualTime = mealLog?.actualTime ?? mealState?.actualTime ?? null;
          const fedNotes = mealLog?.fedNotes ?? mealState?.fedNotes ?? null;
          const skipped = mealLog ? isSkippedMealLog(mealLog) : fedNotes === "Skipped";
          const missed = mealLog ? isMissedMealLog(mealLog) : false;
          const checked = status === "done" && !skipped && !missed;
          const mealCareItems = careItemsForMeal(careTemplates, meal.id);
          const skippedCareItemIds = mealLog?.skippedCareItemIds ?? mealState?.skippedCareItemIds ?? [];

          return (
            <article key={meal.id} className="rounded-2xl bg-white/72 p-4 shadow-sm ring-1 ring-[#d8b895]/55">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="min-w-0 font-semibold leading-6 text-[#4f2f1b]">{meal.name}</h3>
                    {checked ? (
                      <span className="flex size-5 shrink-0 -translate-y-0.5 items-center justify-center rounded-full bg-[#8a5a35]/85 text-white" aria-label="Done" title="Done">
                        <Check className="size-3" strokeWidth={3} />
                      </span>
                    ) : skipped ? (
                      <span className="mt-0.5 shrink-0 whitespace-nowrap rounded-full bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-700 ring-1 ring-zinc-200/80">Skipped</span>
                    ) : missed ? (
                      <span className="mt-0.5 shrink-0 whitespace-nowrap rounded-full bg-rose-50/80 px-2.5 py-1 text-xs font-medium text-rose-700 ring-1 ring-rose-200/70">Missed</span>
                    ) : (
                      <span className={`mt-0.5 shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium capitalize ${statusClasses(status)}`}>{status}</span>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-[#6b3f22]/72">{meal.food}</p>
                </div>
                <Button
                  variant={checked ? "secondary" : "outline"}
                  className="size-7 rounded-full border-0 bg-white/75 p-0 text-[#6b3f22]/65 ring-1 ring-[#d8b895]/55 hover:bg-white hover:text-[#6b3f22]"
                  onClick={() => onOpenMealEditor(meal.id, actualTime)}
                  aria-label={`Edit ${meal.name}`}
                >
                  <Ellipsis className="size-3.5" />
                </Button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-[#6b3f22]/58">
                <p className="flex min-w-0 items-center gap-1.5">
                  <Clock3 className="size-4 shrink-0" /> <span>Planned:</span> <span className="whitespace-nowrap">{meal.plannedTime}</span>
                </p>
                <p>Actual: {actualTime ?? "Not Logged"}</p>
              </div>
              <div className="mt-3">
                {meal.notes ? <p className="text-sm text-[#6b3f22]/58">{meal.notes}</p> : null}
                {fedNotes && !skipped && !missed ? <p className="mt-1 text-sm font-semibold leading-6 text-[#6b3f22]/72">Notes: {fedNotes}</p> : null}
              </div>

              {mealCareItems.length ? (
                <div className="mt-3 space-y-1.5 border-t border-[#d8b895]/45 pt-3">
                  {mealCareItems.map((item) => <CareItemLine key={`${item.kind}-${item.id}`} item={item} skipped={skippedCareItemIds.includes(`${item.kind}-${item.id}`)} />)}
                </div>
              ) : null}

              {editingMealTimeId === meal.id ? (
                <div className="mt-3">
                  <MealTimeForm
                    mealName={meal.name}
                    actualTime={editingMealTimeValue}
                    onActualTimeChange={onActualTimeChange}
                    fedNote={editingMealNoteValue}
                    onFedNoteChange={onFedNoteChange}
                    onSave={onSaveMeal}
                    saveLabel={actualTime ? "Save Meal" : "Mark Fed"}
                    onCancel={onCancelMealEdit}
                    onUndo={actualTime ? () => onUndoMeal(meal.id) : undefined}
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

  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);

  const [mealLogs, setMealLogs] = useState<MealLog[]>([]);

  const [templates, setTemplates] = useState<MealTemplate[]>(initialTemplates);

  const [dailyMealState, setDailyMealState] = useState<DailyMealState[]>([]);

  const [editingMealTimeId, setEditingMealTimeId] = useState<number | null>(null);

  const [editingMealTimeValue, setEditingMealTimeValue] = useState("");

  const [editingMealNoteValue, setEditingMealNoteValue] = useState("");

  const [editingSkippedCareItemIds, setEditingSkippedCareItemIds] = useState<string[]>([]);

  const [supplementTemplates, setSupplementTemplates] = useState<CareItemTemplate[]>([]);

  const [medicationTemplates, setMedicationTemplates] = useState<CareItemTemplate[]>([]);

  const [activityState, setActivityState] = useState<"idle" | "saved" | "saving" | "error">("idle");

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

  const supabaseReady = isSupabaseConfigured();



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

        setDailyMealState(state.dailyMealState ?? []);

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



  const todayActivityLogs = useMemo(() => {

    const today = currentTodayKey();

    return activityLogs.filter((activity) => {

      const activityDayKey = new Intl.DateTimeFormat("en-CA", {

        year: "numeric",

        month: "2-digit",

        day: "2-digit",

      }).format(new Date(activity.happenedAt));



      return activityDayKey === today;

    });

  }, [activityLogs]);

  const careTemplates = useMemo(
    () => [...supplementTemplates, ...medicationTemplates],
    [supplementTemplates, medicationTemplates]
  );

  const persistMealState = (nextMealState: DailyMealState[], nextMealLogs: MealLog[]) => {
    window.localStorage.setItem(DAILY_MEAL_STORAGE_KEY, JSON.stringify(nextMealState));
    window.localStorage.setItem(MEAL_LOGS_STORAGE_KEY, JSON.stringify(nextMealLogs));
  };

  const openMealTimeEditor = (mealId: number, actualTime: string | null) => {
    const mealState = dailyMealState.find((entry) => entry.mealId === mealId);
    setEditingMealTimeId(mealId);
    setEditingMealTimeValue(actualTime ?? nowForTimeInput());
    setEditingMealNoteValue(mealState?.fedNotes ?? "");
    setEditingSkippedCareItemIds(mealState?.skippedCareItemIds ?? []);
  };

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

    const today = currentTodayKey();
    const template = templates.find((entry) => entry.id === editingMealTimeId);
    if (!template) return;

    const actualTime = editingMealTimeValue.trim();
    const mealLogId = `${today}-${editingMealTimeId}`;
    const nextMealState = dailyMealState.map((meal) =>
      meal.mealId === editingMealTimeId
        ? {
            ...meal,
            actualTime: actualTime || null,
            status: actualTime ? ("done" as const) : meal.status,
            fedNotes: editingMealNoteValue.trim() || null,
            skippedCareItemIds: editingSkippedCareItemIds,
            dayKey: today,
          }
        : meal
    );

    let nextMealLogs = mealLogs;
    if (actualTime) {
      const mealLog = buildMealLog(template, actualTime, editingMealNoteValue.trim() || null, today, editingSkippedCareItemIds);
      nextMealLogs = [mealLog, ...mealLogs.filter((entry) => entry.id !== mealLogId && entry.id !== missedMealLogId(today, editingMealTimeId))];
      if (supabaseReady) {
        try {
          await saveMealLogToSupabase(mealLog);
          await deleteMealLogInSupabase(missedMealLogId(today, editingMealTimeId));
        } catch {
          // local fallback already captured
        }
      }
    }

    setDailyMealState(nextMealState);
    setMealLogs(nextMealLogs);
    persistMealState(nextMealState, nextMealLogs);
    cancelMealTimeEditor();
  };

  const undoMealFed = async (mealId: number) => {
    const confirmed = window.confirm("Undo this fed meal entry?");
    if (!confirmed) return;

    const today = currentTodayKey();
    const mealLogId = `${today}-${mealId}`;
    const nextMealState = dailyMealState.map((meal) =>
      meal.mealId === mealId
        ? {
            ...meal,
            actualTime: null,
            status: "upcoming" as const,
            fedNotes: null,
            skippedCareItemIds: [],
            dayKey: today,
          }
        : meal
    );
    const nextMealLogs = mealLogs.filter((entry) => entry.id !== mealLogId);

    setDailyMealState(nextMealState);
    setMealLogs(nextMealLogs);
    persistMealState(nextMealState, nextMealLogs);
    cancelMealTimeEditor();

    if (supabaseReady) {
      try {
        await deleteMealLogInSupabase(mealLogId);
      } catch {
        // local fallback already captured
      }
    }
  };

  const todayEventItems = useMemo(() => {

    const activityItems = todayActivityLogs.map((activity) => {

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

    return activityItems.sort((a, b) => a.sortMinutes - b.sortMinutes || a.sortKey.localeCompare(b.sortKey));

  }, [todayActivityLogs]);



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

      happenedAt: new Date().toISOString(),

      detail: null,

      notes: null,

      createdAt: new Date().toISOString(),

    };



    setEditingActivityId(null);

    await saveActivity(activity, "create");

    openEditorForActivity(activity);

  };



  const saveDetailedActivity = async () => {

    if (!detailActivityType) return;



    const attachmentNote = attachmentFiles.length ? `Attachments: ${attachmentFiles.map((file) => file.name).join(", ")}` : "";

    const recordTagNote = recordTags.length ? `Record Tags: ${recordTags.join(", ")}` : "";

    const existingActivity = editingActivityId ? activityLogs.find((entry) => entry.id === editingActivityId) : null;

    const resolvedNotes =

      detailActivityType === "treat"

        ? [notesValue.trim(), extraNotesValue.trim() ? `Notes: ${extraNotesValue.trim()}` : ""].filter(Boolean).join(" ") || null

        : isCareActivityType(detailActivityType)

          ? careNotesForSave(existingActivity?.notes ?? null, detailValue.trim(), notesValue, recordTagNote, attachmentNote)

          : [notesValue.trim(), recordTagNote, attachmentNote].filter(Boolean).join("\n") || null;

    const trimmedDetail = detailValue.trim();

    const resolvedActivityType = resolveActivityTypeForSave(detailActivityType, trimmedDetail);

    const activity: ActivityLog = {

      id: editingActivityId ?? `${resolvedActivityType}-${Date.now()}`,

      profileSlug: HEWSTER_PROFILE_SLUG,

      activityType: resolvedActivityType,

      happenedAt: mergeTodayWithTime(happenedAtValue),

      detail: resolvedActivityType === "pee" ? "Pee" : detailActivityType === "potty" ? trimmedDetail || null : isCareActivityType(detailActivityType) ? careDetailForSave(existingActivity?.detail ?? null, trimmedDetail || "Given") : trimmedDetail || null,

      notes: resolvedNotes,

      createdAt: editingActivityId ? existingActivity?.createdAt : new Date().toISOString(),

    };



    await saveActivity(activity, editingActivityId ? "update" : "create");

    resetEditor();
    setLogEventOpen(false);

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

                <div className="skeleton-pulse mt-1 h-10 w-36 rounded-xl bg-white/40" />

              </div>

              <PetAvatarMenu className="mt-0.5 size-20 rounded-full object-cover object-center ring-1 ring-zinc-500/60 shadow-sm" />

            </div>

            <div className="skeleton-pulse mt-2 h-4 w-72 rounded-xl bg-white/30" />

          </header>



          <div className="space-y-4">

            <div className="skeleton-pulse h-48 rounded-3xl bg-white/60 shadow-sm ring-1 ring-white/50" />

            <div className="skeleton-pulse h-64 rounded-3xl bg-white/60 shadow-sm ring-1 ring-white/50" />

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

              <h1 className="mt-1 text-xl font-bold tracking-tight text-zinc-700">Noted</h1>

            </div>

            <PetAvatarMenu className="mt-0.5 size-20 rounded-full object-cover object-center ring-1 ring-zinc-500/60 shadow-sm" />

          </div>

          <p className="mt-2 text-sm leading-6 text-zinc-600">

            Track potty breaks, food, treats, wellness, care, activities, and anything else you want to remember.

          </p>

        </header>



        {logEventOpen ? (
          <div className="relative mb-7 [&>section]:mb-0">
            <QuickLogCard activityState={activityState} onQuickLog={quickLogActivity} title="Log Event" accentBackground>

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

                attachmentNames={attachmentFiles.map((file) => file.name)}

                onAttachmentsChange={setAttachmentFiles}

                recordTags={recordTags}

                onRecordTagsChange={setRecordTags}

                onHappenedAtChange={setHappenedAtValue}

                onSave={saveDetailedActivity}

                onCancel={collapseLogEvent}

                saving={activityState === "saving"}

              />

            ) : null}

            </QuickLogCard>
            <button
              type="button"
              onClick={collapseLogEvent}
              className="log-event-pull-tab absolute inset-x-0 -bottom-4 z-10 mx-auto flex h-7 w-20 items-center justify-center rounded-b-2xl rounded-t-none bg-[var(--hewie-accent,#64748b)] text-[var(--hewie-accent-text,#ffffff)]/70 shadow-[0_8px_12px_-8px_rgba(15,23,42,0.35)] transition hover:translate-y-0.5 hover:text-[var(--hewie-accent-text,#ffffff)]/90"
              aria-label="Collapse Log Event"
            >
              <span className="log-event-pull-chevrons" aria-hidden="true">
                <ChevronUp className="size-3.5" strokeWidth={2.5} />
                <ChevronUp className="size-3.5" strokeWidth={2.5} />
              </span>
            </button>
          </div>
        ) : (
          <section
            role="button"
            tabIndex={0}
            onClick={openLogEvent}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                openLogEvent();
              }
            }}
            className="group relative mb-7 cursor-pointer overflow-visible rounded-t-3xl rounded-b-[1.35rem] bg-[var(--hewie-accent,#64748b)] px-5 pb-6 pt-4 text-[var(--hewie-accent-text,#ffffff)] shadow-sm ring-1 ring-[var(--hewie-accent,#64748b)]/35 transition hover:opacity-95 active:translate-y-px"
          >
            <h2 className="text-lg font-semibold">Log Event</h2>
            <div className="pointer-events-none mt-3 h-5 overflow-hidden">
              <div className="grid grid-cols-2 gap-3 opacity-80">
                <div className="flex h-14 items-start gap-2.5 rounded-2xl bg-[#fff7dc] px-3 pt-2 text-[#8a6200] shadow-sm">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/60 text-base leading-none">🚽</span>
                  <span className="sr-only">Potty</span>
                </div>
                <div className="flex h-14 items-start gap-2.5 rounded-2xl bg-emerald-50 px-3 pt-2 text-emerald-700 shadow-sm">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-base leading-none">🌳</span>
                  <span className="sr-only">Activity</span>
                </div>
              </div>
            </div>
            <div className="pointer-events-none absolute inset-x-0 -bottom-4 flex justify-center">
              <div className="log-event-pull-tab flex h-7 w-20 items-center justify-center rounded-b-2xl rounded-t-none bg-[var(--hewie-accent,#64748b)] text-[var(--hewie-accent-text,#ffffff)]/70 shadow-[0_8px_12px_-8px_rgba(15,23,42,0.35)] transition group-hover:translate-y-0.5 group-hover:text-[var(--hewie-accent-text,#ffffff)]/90">
                <span className="log-event-pull-chevrons" aria-hidden="true">
                  <ChevronDown className="size-3.5" strokeWidth={2.5} />
                  <ChevronDown className="size-3.5" strokeWidth={2.5} />
                </span>
              </div>
            </div>
          </section>
        )}



        <ActivityFeed

          activityLogs={todayActivityLogs}

          timelineItems={todayEventItems}

          grouped

          title="Today&apos;s Events"

          subtitle="Review and edit today&apos;s logged events."

          onSelectActivity={openEditorForActivity}

          renderInlineEditor={(activity) =>

            activity.id === editingActivityId || (!editingActivityId && detailActivityType === activity.activityType && activity.happenedAt === todayActivityLogs[0]?.happenedAt)

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

                    attachmentNames={attachmentFiles.map((file) => file.name)}

                    onAttachmentsChange={setAttachmentFiles}

                    recordTags={recordTags}

                    onRecordTagsChange={setRecordTags}

                    onHappenedAtChange={setHappenedAtValue}

                    onSave={saveDetailedActivity}

                    onCancel={resetEditor}

                    onDelete={editingActivityId ? deleteActivity : undefined}

                    saving={activityState === "saving"}

                  />

                )

              : null

          }

        />



        <TodayMealPlanCard
          templates={templates}
          dailyMealState={dailyMealState}
          mealLogs={mealLogs}
          careTemplates={careTemplates}
          editingMealTimeId={editingMealTimeId}
          editingMealTimeValue={editingMealTimeValue}
          editingMealNoteValue={editingMealNoteValue}
          editingSkippedCareItemIds={editingSkippedCareItemIds}
          onOpenMealEditor={openMealTimeEditor}
          onActualTimeChange={setEditingMealTimeValue}
          onFedNoteChange={setEditingMealNoteValue}
          onToggleCareItem={toggleEditingCareItem}
          onSaveMeal={saveMealTime}
          onCancelMealEdit={cancelMealTimeEditor}
          onUndoMeal={undoMealFed}
        />



        <BottomNav />

      </div>

    </main>

  );

}

