"use client";

import { FileText, Paperclip, SlidersHorizontal } from "lucide-react";
import { ActivityDetailForm } from "@/components/activity-detail-form";
import { PetAvatarMenu } from "@/components/pet-avatar-menu";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { BottomNav } from "@/components/bottom-nav";
import { ExpandableNoteText } from "@/components/expandable-note-text";
import { compareActivitiesReverseChronological, formatActivityTime, formatActivityLabel } from "@/lib/activity";
import {
  ACTIVITY_LOGS_STORAGE_KEY,
  activityAttachmentFileNamesForSave,
  deleteActivityAttachmentsFromSupabase,
  deleteActivityLogInSupabase,
  type ActivityLog,
  type ActivityAttachment,
  type ActivityType,
  loadAppState,
  loadNotebookEntryPermissions,
  saveActivityAttachmentsToSupabase,
  updateActivityLogInSupabase,
} from "@/lib/hewster-data";
import { MedicationPillIcon } from "@/components/medication-pill-icon";
import { PetNotebookTitle } from "@/components/pet-notebook-title";
import { HEWSTER_PROFILE_SLUG, getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import {
  FREE_MEDICAL_ATTACHMENT_LIMIT,
  FREE_POTTY_IMAGE_LIMIT,
  activityAttachmentCounts,
  loadStoredSubscriptionPlan,
  type SubscriptionPlanId,
} from "@/lib/subscription-plan";

const filters = ["All", "Symptoms", "Vet Visit", "Medication", "Injection", "Other Health", "Attachments"];
const dateFilters = ["All Time", "Date Range"] as const;
type DateFilter = (typeof dateFilters)[number];
type MedicationStatus = "given" | "skipped" | "missed";
type MedicationCourseRecord = {
  kind: "medication-course";
  id: string;
  title: string;
  dose: string | null;
  frequency: string | null;
  timing: string | null;
  route: string | null;
  notes: string | null;
  startedAt: string;
  latestAt: string;
  activities: ActivityLog[];
  counts: Record<MedicationStatus, number>;
};
type MedicalRecordItem = { kind: "activity"; activity: ActivityLog } | MedicationCourseRecord;

const vetVisitKeywords = ["Vet Visit", "Wellness Exam", "Sick Consult"];
const medicationKeywords = ["Medication"];
const injectionKeywords = ["Injection", "Vaccine", "Vaccine / Injection"];
const otherVetMedicalKeywords = ["Other Health", "Other Vet / Medical", "Other Vet/Medical", "Other Medical"];
const medicalSickKeywords = ["Vet Visit", "Medication", "Injection", "Vaccine", "Lab / Test", "Procedure", "Flea & Tick", "Deworming", "Other Health", "Other Vet / Medical", "Other Vet/Medical", "Other Medical"];
const medicalWellnessKeywords = ["Vet Visit", "Wellness Exam", "Sick Consult", "Vaccine", "Injection", "Vaccine / Injection", "Medication", "Flea & Tick", "Deworming", "Lab / Test", "Procedure", "Other Health", "Other Vet / Medical", "Other Vet/Medical", "Other Medical"];
const pottyActivityTypes = new Set(["pee", "poop", "potty"]);
const generatedMedicationNoteValues = new Set(["With Food", "Empty Stomach", "Oral", "Topical", "Injection", "Other", "Last Dose", "Missed", "Skipped"]);

function displayMedicalDetail(detail: string | null) {
  return detail?.replace(/^Other Vet\/Medical\b/, "Other Health").replace(/^Other Vet \/ Medical\b/, "Other Health").replace(/^Other Medical\b/, "Other Health") ?? null;
}

function medicalRecordHeading(activity: ActivityLog) {
  const detail = displayMedicalDetail(activity.detail);

  if (!detail) {
    return {
      title: activity.activityType === "sick" ? "Symptoms" : formatActivityLabel(activity.activityType),
      subtitle: null,
    };
  }

  if (detail === "Other Health" || detail.startsWith("Other Health: ")) {
    return {
      title: "Other Health",
      subtitle: detail.replace(/^Other Health:?\s*/, "") || null,
    };
  }

  return { title: detail, subtitle: null };
}

function isVetVisitDetail(detail: string | null) {
  const normalized = detail ?? "";
  return vetVisitKeywords.some((value) => normalized.includes(value));
}

function hasDetailKeyword(activity: ActivityLog, keywords: string[]) {
  const detail = activity.detail ?? "";
  return keywords.some((value) => detail.includes(value));
}

function isSymptomRecord(activity: ActivityLog) {
  const detail = activity.detail ?? "";
  return activity.activityType === "sick" && !medicalSickKeywords.some((value) => detail.includes(value));
}

function isMedicalSickRecord(activity: ActivityLog) {
  const detail = activity.detail ?? "";
  return activity.activityType === "sick" && medicalSickKeywords.some((value) => detail.includes(value));
}

function isMedicalWellnessRecord(activity: ActivityLog) {
  return activity.activityType === "wellness" && hasDetailKeyword(activity, medicalWellnessKeywords);
}

function isMedicationRecord(activity: ActivityLog) {
  return activity.activityType === "medication" || hasDetailKeyword(activity, medicationKeywords);
}

function isInjectionRecord(activity: ActivityLog) {
  return hasDetailKeyword(activity, injectionKeywords);
}

function isOtherVetMedicalRecord(activity: ActivityLog) {
  return hasDetailKeyword(activity, otherVetMedicalKeywords);
}

function dayKeyFromDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function medicalRecordDateTime(value: string) {
  return {
    date: dayKeyFromDate(value),
    time: formatActivityTime(value),
  };
}

function noteLines(notes: string | null) {
  return notes?.split("\n").map((line) => line.trim()).filter(Boolean) ?? [];
}

function attachmentLine(activity: ActivityLog) {
  if (pottyActivityTypes.has(activity.activityType)) return null;

  if (activity.attachments?.length) {
    return `Attachments: ${activity.attachments.map((attachment) => attachment.fileName).join(", ")}`;
  }

  return noteLines(activity.notes).find((line) => line.startsWith("Attachments: ")) ?? null;
}

function isMedicalRecord(activity: ActivityLog) {
  if (activity.activityType === "supplement") return false;

  return (
    isSymptomRecord(activity) ||
    isMedicalSickRecord(activity) ||
    isMedicalWellnessRecord(activity) ||
    isMedicationRecord(activity) ||
    isVetVisitDetail(activity.detail) ||
    Boolean(attachmentLine(activity))
  );
}

function medicalRecordIcon(activity: ActivityLog): ReactNode {
  const detail = activity.detail ?? "";

  if (activity.activityType === "medication") return <MedicationPillIcon className="size-5" />;

  if (activity.activityType === "sick" || isVetVisitDetail(detail) || detail.includes("Injection")) {
    return <span className="text-lg leading-none">{"\u{1FA7A}"}</span>;
  }

  if (detail.includes("Medication")) return <MedicationPillIcon className="size-5" />;
  if (activity.activityType === "wellness") return <span className="text-xl leading-none">{"\u{1F33F}"}</span>;

  return <FileText className="size-5" />;
}

function regularNotes(activity: ActivityLog) {
  return noteLines(activity.notes)
    .filter((line) => !line.startsWith("Record Tags: ") && !line.startsWith("Attachments: "))
    .join("\n");
}

function scheduledMedicationCourseId(activity: ActivityLog) {
  const match = activity.activityType === "medication" ? activity.id.match(/^medication-(\d+)-schedule-/) : null;
  return match ? `medication-course-${match[1]}` : null;
}

function medicationStatus(activity: ActivityLog): MedicationStatus {
  const detail = activity.detail ?? "";
  const lines = noteLines(activity.notes);

  if (/\bMissed\b/i.test(detail) || lines.includes("Missed")) return "missed";
  if (/\bSkipped\b/i.test(detail) || lines.some((line) => line.startsWith("Skip Note: "))) return "skipped";
  return "given";
}

function medicationName(activity: ActivityLog) {
  return (activity.detail ?? "Medication")
    .replace(/\s*(?:[•·-]\s*)?(?:Given|Skipped|Missed)\b/i, "")
    .split("•")[0]
    .trim() || "Medication";
}

function medicationDose(activity: ActivityLog) {
  const giveLine = noteLines(activity.notes).find((line) => line.startsWith("Give "));
  if (giveLine) return giveLine.replace(/^Give\s+/i, "").replace(/\s*\([^)]*\)\s*$/, "").trim();

  const detailDose = (activity.detail ?? "").split("•")[1]?.replace(/\b(?:Skipped|Missed)\b/i, "").trim();
  return detailDose || null;
}

function medicationTiming(activity: ActivityLog) {
  return noteLines(activity.notes).find((line) => line === "With Food" || line === "Empty Stomach") ?? null;
}

function medicationFrequency(activity: ActivityLog) {
  return noteLines(activity.notes).find((line) => line.startsWith("Every "))?.replace(/\s*•\s*/g, ", ") ?? null;
}

function medicationRoute(activity: ActivityLog) {
  return noteLines(activity.notes).find((line) => line === "Oral" || line === "Topical" || line === "Injection" || line === "Other") ?? null;
}

function medicationNotes(activity: ActivityLog) {
  return noteLines(activity.notes)
    .filter((line) => line.startsWith("Notes: "))
    .map((line) => line.replace(/^Notes:\s*/i, "").trim())
    .filter(Boolean);
}

function medicationCourseNotes(activities: ActivityLog[]) {
  const notes = activities.flatMap(medicationNotes);
  return [...new Set(notes)].join("\n") || null;
}

function medicationDoseAddedNotes(activity: ActivityLog, courseNotes: string | null) {
  const courseNoteValues = new Set(noteLines(courseNotes));

  return noteLines(activity.notes)
    .map((line) => {
      if (line.startsWith("Skip Note: ")) return line.replace(/^Skip Note:\s*/i, "").trim();
      if (line.startsWith("Notes: ")) return line.replace(/^Notes:\s*/i, "").trim();
      return line;
    })
    .filter((line) => {
      if (!line) return false;
      if (courseNoteValues.has(line)) return false;
      if (line.startsWith("Give ")) return false;
      if (line.startsWith("Every ") || line.endsWith("Schedules")) return false;
      if (generatedMedicationNoteValues.has(line)) return false;
      if (line.startsWith("Record Tags: ") || line.startsWith("Attachments: ")) return false;
      return true;
    })
    .join("\n") || null;
}

function medicationCourseDateRange(course: MedicationCourseRecord) {
  const start = medicalRecordDateTime(course.startedAt).date;
  const end = medicalRecordDateTime(course.latestAt).date;
  return start === end ? start : `${start} - ${end}`;
}

function medicationCourseSummary(course: MedicationCourseRecord) {
  return `${course.counts.given} given, ${course.counts.skipped} skipped, ${course.counts.missed} missed`;
}

function medicationCourseDosage(course: MedicationCourseRecord) {
  const dose = course.dose ?? "As directed";
  const route = course.route ? ` (${course.route})` : "";
  return `${dose}${route}`;
}

function buildMedicalRecordItems(activities: ActivityLog[], sortOrder: "newest" | "oldest"): MedicalRecordItem[] {
  const courses = new Map<string, ActivityLog[]>();
  const items: MedicalRecordItem[] = [];

  activities.forEach((activity) => {
    const courseId = scheduledMedicationCourseId(activity);

    if (!courseId) {
      items.push({ kind: "activity", activity });
      return;
    }

    courses.set(courseId, [...(courses.get(courseId) ?? []), activity]);
  });

  courses.forEach((courseActivities, id) => {
    const sortedActivities = [...courseActivities].sort(compareActivitiesReverseChronological);
    const oldestActivity = sortedActivities[sortedActivities.length - 1];
    const latestActivity = sortedActivities[0];
    const counts: Record<MedicationStatus, number> = { given: 0, skipped: 0, missed: 0 };

    sortedActivities.forEach((activity) => {
      counts[medicationStatus(activity)] += 1;
    });

    items.push({
      kind: "medication-course",
      id,
      title: medicationName(latestActivity),
      dose: sortedActivities.map(medicationDose).find(Boolean) ?? null,
      frequency: sortedActivities.map(medicationFrequency).find(Boolean) ?? null,
      timing: sortedActivities.map(medicationTiming).find(Boolean) ?? null,
      route: sortedActivities.map(medicationRoute).find(Boolean) ?? null,
      notes: medicationCourseNotes(sortedActivities),
      startedAt: oldestActivity.happenedAt,
      latestAt: latestActivity.happenedAt,
      activities: sortedActivities,
      counts,
    });
  });

  return items.sort((a, b) => {
    const aTime = new Date(a.kind === "activity" ? a.activity.happenedAt : a.startedAt).getTime();
    const bTime = new Date(b.kind === "activity" ? b.activity.happenedAt : b.startedAt).getTime();
    const newestFirst = bTime - aTime;
    return sortOrder === "newest" ? newestFirst : -newestFirst;
  });
}

function matchesFilter(activity: ActivityLog, filter: string) {
  if (filter === "All") return true;

  switch (filter) {
    case "Symptoms":
      return isSymptomRecord(activity);
    case "Vet Visit":
      return isVetVisitDetail(activity.detail);
    case "Medication":
      return isMedicationRecord(activity);
    case "Injection":
      return isInjectionRecord(activity);
    case "Other Health":
      return isOtherVetMedicalRecord(activity);
    case "Attachments":
      return Boolean(attachmentLine(activity));
    default:
      return true;
  }
}

function monthInputValue(date: Date) {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}`;
}

function matchesDateFilter(activity: ActivityLog, dateFilter: DateFilter, selectedMonth: string) {
  if (dateFilter === "All Time") return true;

  const activityDate = new Date(activity.happenedAt);
  const [year, month] = selectedMonth.split("-").map(Number);
  return activityDate.getFullYear() === year && activityDate.getMonth() === month - 1;
}

async function openMedicalAttachment(filePath: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;

  const { data, error } = await supabase.storage
    .from("pet-attachments")
    .createSignedUrl(filePath, 60 * 10);

  if (error || !data?.signedUrl) {
    console.warn("Could not open medical attachment", error);
    return;
  }

  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}

function fallbackAttachmentNames(activity: ActivityLog) {
  const line = noteLines(activity.notes).find((value) => value.startsWith("Attachments: "));
  return line
    ?.replace("Attachments: ", "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean) ?? [];
}

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

function dayInputValue(isoString: string) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(isoString));
}

function mergeDayWithTime(dayKey: string, timeValue: string) {
  const [hours, minutes] = timeValue.split(":").map(Number);
  const date = new Date(`${dayKey}T00:00:00`);
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
}

function editorActivityType(activity: ActivityLog): ActivityType {
  return ["pee", "poop", "potty"].includes(activity.activityType) ? "potty" : activity.activityType;
}

function resolveActivityTypeForSave(activityType: ActivityType, detail: string): ActivityType {
  if (activityType !== "potty") return activityType;
  if (detail === "Pee") return "pee";
  if (detail === "No Poop") return "potty";
  if (detail === "Poop" || detail === "Pee & Poop" || detail.includes("• Type ") || detail.startsWith("Type ")) return "poop";
  return "potty";
}

function attachmentDocumentTypesForActivity(activityType: ActivityType) {
  return activityType === "poop" || activityType === "potty" ? ["Potty Image"] : ["Medical Attachment"];
}

function existingAttachmentNote(activity: ActivityLog) {
  if (activity.attachments?.length) return "";
  return noteLines(activity.notes).find((line) => line.startsWith("Attachments: ")) ?? "";
}

function MedicalAttachmentPills({ attachments }: { attachments: ActivityAttachment[] }) {
  if (!attachments.length) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {attachments.map((attachment) => (
        <button
          key={attachment.id}
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void openMedicalAttachment(attachment.filePath);
          }}
          className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-1.5 text-xs font-semibold text-sky-700 ring-1 ring-sky-200"
        >
          <Paperclip className="size-3.5 shrink-0" />
          <span className="min-w-0 truncate">{attachment.fileName}</span>
        </button>
      ))}
    </div>
  );
}

function MedicalAttachmentFallback({ names }: { names: string[] }) {
  if (!names.length) return null;

  return (
    <div className="mt-2">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">Attachments</p>
      <div className="mt-1 flex flex-wrap gap-2">
        {names.map((name) => (
          <span key={name} className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-zinc-50 px-2.5 py-1.5 text-xs font-semibold text-zinc-500 ring-1 ring-zinc-200">
            <Paperclip className="size-3.5 shrink-0" />
            <span className="min-w-0 truncate">{name}</span>
          </span>
        ))}
      </div>
      <p className="mt-1 text-xs text-zinc-400">Saved as filename only.</p>
    </div>
  );
}

export default function MedicalRecordsPage() {
  const [hydrated, setHydrated] = useState(false);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [activeFilter, setActiveFilter] = useState("All");
  const [dateFilter, setDateFilter] = useState<DateFilter>("All Time");
  const [selectedMonth, setSelectedMonth] = useState(() => monthInputValue(new Date()));
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [activityState, setActivityState] = useState<"idle" | "saved" | "saving" | "error">("idle");
  const [canEditEntries, setCanEditEntries] = useState(true);
  const [canDeleteEntries, setCanDeleteEntries] = useState(true);
  const [expandedMedicationCourses, setExpandedMedicationCourses] = useState<string[]>([]);
  const [editingActivityId, setEditingActivityId] = useState<string | null>(null);
  const [detailActivityType, setDetailActivityType] = useState<ActivityType | null>(null);
  const [detailValue, setDetailValue] = useState("");
  const [notesValue, setNotesValue] = useState("");
  const [extraNotesValue, setExtraNotesValue] = useState("");
  const [happenedAtValue, setHappenedAtValue] = useState(() => nowForTimeInput());
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [removedAttachmentIds, setRemovedAttachmentIds] = useState<string[]>([]);
  const [subscriptionPlan, setSubscriptionPlan] = useState<SubscriptionPlanId>("free");
  const supabaseReady = isSupabaseConfigured();

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
    if (detailActivityType === "potty" || detailActivityType === "poop") {
      return Math.max(0, FREE_POTTY_IMAGE_LIMIT - freeAttachmentCounts.pottyImages);
    }
    return Math.max(0, FREE_MEDICAL_ATTACHMENT_LIMIT - freeAttachmentCounts.medicalAttachments);
  }, [detailActivityType, freeAttachmentCounts.medicalAttachments, freeAttachmentCounts.pottyImages, subscriptionPlan]);

  const detailAttachmentLimitMessage =
    subscriptionPlan === "plus"
      ? undefined
      : detailActivityType === "potty" || detailActivityType === "poop"
        ? "Potty images are a PetNotebook Plus feature after your first free image. Upgrade for $9.99/month to unlock more."
        : "Attachments are a PetNotebook Plus feature after your first free file. Upgrade for $9.99/month to unlock more.";

  useEffect(() => {
    let mounted = true;

    loadAppState().then((state) => {
      if (!mounted) return;
      setActivityLogs(state.activityLogs);
      setHydrated(true);
    });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    void loadNotebookEntryPermissions().then((permissions) => {
      if (!mounted) return;
      setCanEditEntries(permissions.canEditEntries);
      setCanDeleteEntries(permissions.canDeleteEntries);
    });

    return () => {
      mounted = false;
    };
  }, []);

  const resetEditor = () => {
    setEditingActivityId(null);
    setDetailActivityType(null);
    setDetailValue("");
    setNotesValue("");
    setExtraNotesValue("");
    setHappenedAtValue(nowForTimeInput());
    setAttachmentFiles([]);
    setRemovedAttachmentIds([]);
  };

  const openEditorForActivity = (activity: ActivityLog) => {
    if (!canEditEntries) return;

    const nextActivityType = editorActivityType(activity);
    setEditingActivityId(activity.id);
    setDetailActivityType(nextActivityType);
    setDetailValue(activity.detail ?? "");
    setNotesValue(regularNotes(activity));
    setExtraNotesValue("");
    setHappenedAtValue(toTimeInputValue(activity.happenedAt));
    setAttachmentFiles([]);
    setRemovedAttachmentIds([]);
  };

  const saveActivity = async (activity: ActivityLog) => {
    const nextLogs = [activity, ...activityLogs.filter((entry) => entry.id !== activity.id)].sort(compareActivitiesReverseChronological);
    window.localStorage.setItem(ACTIVITY_LOGS_STORAGE_KEY, JSON.stringify(nextLogs));
    setActivityLogs(nextLogs);
    setActivityState("saving");

    try {
      if (supabaseReady) {
        await updateActivityLogInSupabase(activity);
      }

      setActivityState("saved");
      window.setTimeout(() => setActivityState("idle"), 1800);
    } catch {
      setActivityState("error");
    }
  };

  const saveDetailedActivity = async () => {
    if (!editingActivityId || !detailActivityType) return;

    const existingActivity = activityLogs.find((entry) => entry.id === editingActivityId);
    if (!existingActivity) return;

    const trimmedDetail = detailValue.trim();
    const resolvedActivityType = resolveActivityTypeForSave(detailActivityType, trimmedDetail);
    const happenedAt = mergeDayWithTime(dayInputValue(existingActivity.happenedAt), happenedAtValue);
    const attachmentDocumentTypes = attachmentDocumentTypesForActivity(resolvedActivityType);
    const retainedAttachments = (existingActivity.attachments ?? []).filter((attachment) => !removedAttachmentIds.includes(attachment.id));
    const removedAttachments = (existingActivity.attachments ?? []).filter((attachment) => removedAttachmentIds.includes(attachment.id));
    const newAttachmentNames = activityAttachmentFileNamesForSave(
      { id: editingActivityId, profileSlug: HEWSTER_PROFILE_SLUG, activityType: resolvedActivityType, happenedAt, detail: null, notes: null },
      attachmentFiles,
      attachmentDocumentTypes
    );
    const attachmentNames = [...retainedAttachments.map((attachment) => attachment.fileName), ...newAttachmentNames];
    const attachmentNote = attachmentNames.length ? `Attachments: ${attachmentNames.join(", ")}` : existingAttachmentNote(existingActivity);
    const resolvedNotes = [notesValue.trim(), attachmentNote].filter(Boolean).join("\n") || null;

    const activity: ActivityLog = {
      ...existingActivity,
      profileSlug: existingActivity.profileSlug ?? HEWSTER_PROFILE_SLUG,
      activityType: resolvedActivityType,
      happenedAt,
      detail: resolvedActivityType === "pee" ? "Pee" : detailActivityType === "potty" ? trimmedDetail || null : trimmedDetail || null,
      notes: resolvedNotes,
    };

    await saveActivity(activity);

    if (removedAttachments.length && supabaseReady) {
      await deleteActivityAttachmentsFromSupabase(activity.id, removedAttachments);
    }

    let nextAttachments = retainedAttachments;

    if (attachmentFiles.length) {
      const savedAttachments = await saveActivityAttachmentsToSupabase(activity, attachmentFiles, attachmentDocumentTypes, { replaceExisting: false });

      if (savedAttachments.length) {
        nextAttachments = [...retainedAttachments, ...savedAttachments];
      }
    }

    setActivityLogs((current) => {
      const nextLogs = current.map((entry) =>
        entry.id === activity.id ? { ...entry, attachments: nextAttachments } : entry
      );
      window.localStorage.setItem(ACTIVITY_LOGS_STORAGE_KEY, JSON.stringify(nextLogs));
      return nextLogs;
    });

    resetEditor();
  };

  const deleteActivity = async () => {
    if (!editingActivityId) return;

    const confirmed = window.confirm("Delete this health record? This cannot be undone.");
    if (!confirmed) return;

    const deletingId = editingActivityId;
    setActivityLogs((current) => {
      const nextLogs = current.filter((activity) => activity.id !== deletingId);
      window.localStorage.setItem(ACTIVITY_LOGS_STORAGE_KEY, JSON.stringify(nextLogs));
      return nextLogs;
    });
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

  const medicalRecords = useMemo(
    () => activityLogs
      .filter(isMedicalRecord)
      .filter((activity) => matchesFilter(activity, activeFilter))
      .filter((activity) => matchesDateFilter(activity, dateFilter, selectedMonth))
      .sort((a, b) => {
        const newestFirst = new Date(b.happenedAt).getTime() - new Date(a.happenedAt).getTime();
        return sortOrder === "newest" ? newestFirst : -newestFirst;
      }),
    [activityLogs, activeFilter, dateFilter, selectedMonth, sortOrder]
  );
  const medicalRecordItems = useMemo(
    () => buildMedicalRecordItems(medicalRecords, sortOrder),
    [medicalRecords, sortOrder]
  );
  const toggleMedicationCourse = (courseId: string) => {
    setExpandedMedicationCourses((current) =>
      current.includes(courseId) ? current.filter((id) => id !== courseId) : [...current, courseId]
    );
  };

  return (
    <main className="min-h-screen bg-[var(--hewie-bg,#979ca7)] text-zinc-900">
      <div className="content-fade-in mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-24 pt-6">
        <header className="mb-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <PetNotebookTitle href="/hewie" className="text-sm font-bold text-[var(--hewie-active-text,#6d28d9)]" />
              <h1 className="mt-1 text-xl font-bold tracking-tight text-[#3b2832]">Health Records</h1>
            </div>
            <PetAvatarMenu shape="tile" />
          </div>
        </header>

        <div className="mb-4">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setShowFilters((current) => !current)}
              aria-label={showFilters ? "Hide filters" : "Open filters"}
              className="inline-flex size-9 items-center justify-center rounded-full bg-[var(--hewie-accent,#78608f)] p-0 text-[var(--hewie-accent-text,#ffffff)] shadow-[0_8px_18px_rgba(15,23,42,0.14)] ring-1 ring-[var(--hewie-accent,#78608f)]/20 transition hover:opacity-90"
            >
              <SlidersHorizontal className="size-4" />
            </button>
          </div>

          {showFilters ? (
            <section className="mt-3 rounded-2xl bg-white/90 p-4 shadow-sm ring-1 ring-zinc-200">
              <div className="space-y-4">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">Record Type</p>
                  <div className="flex flex-wrap gap-2">
                    {filters.map((filter) => (
                      <button
                        key={filter}
                        type="button"
                        onClick={() => setActiveFilter(filter)}
                        className={`rounded-full px-3 py-2 text-sm font-semibold ring-1 ${
                          activeFilter === filter
                            ? "bg-[var(--hewie-active-bg,#f1f5f9)] text-[var(--hewie-active-text,#334155)] ring-[var(--hewie-ring,#cbd5e1)]"
                            : "bg-white text-zinc-600 ring-zinc-200"
                        }`}
                      >
                        {filter}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">Sort</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { label: "Newest First", value: "newest" as const },
                      { label: "Oldest First", value: "oldest" as const },
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setSortOrder(option.value)}
                        className={`rounded-full px-3 py-2 text-sm font-semibold ring-1 ${
                          sortOrder === option.value
                            ? "bg-[var(--hewie-active-bg,#f1f5f9)] text-[var(--hewie-active-text,#334155)] ring-[var(--hewie-ring,#cbd5e1)]"
                            : "bg-white text-zinc-600 ring-zinc-200"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <div className="mt-3">
                    <label htmlFor="medical-date-range" className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">
                      Date Range
                    </label>
                    <select
                      id="medical-date-range"
                      value={dateFilter}
                      onChange={(event) => setDateFilter(event.target.value as DateFilter)}
                      className="w-full rounded-2xl bg-white px-3 py-2 text-sm font-semibold text-zinc-700 ring-1 ring-zinc-200"
                    >
                      {dateFilters.map((filter) => (
                        <option key={filter} value={filter}>
                          {filter}
                        </option>
                      ))}
                    </select>
                    {dateFilter === "Date Range" ? (
                      <input
                        type="month"
                        value={selectedMonth}
                        onChange={(event) => setSelectedMonth(event.target.value)}
                        className="mt-3 w-full rounded-2xl bg-white px-3 py-2 text-sm font-semibold text-zinc-700 ring-1 ring-zinc-200"
                      />
                    ) : null}
                  </div>
                </div>
              </div>
            </section>
          ) : null}
        </div>

        <div className="space-y-3">
          {!hydrated ? (
            <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
              <p className="text-sm text-zinc-500">Loading records...</p>
            </section>
          ) : medicalRecordItems.length ? (
            medicalRecordItems.map((item) => {
              if (item.kind === "medication-course") {
                const expanded = expandedMedicationCourses.includes(item.id);
                const startedDateTime = medicalRecordDateTime(item.startedAt);
                const courseDateRange = medicationCourseDateRange(item);
                const courseDosage = medicationCourseDosage(item);

                return (
                  <article key={item.id} className="rounded-2xl bg-sky-50/80 p-4 ring-1 ring-sky-200">
                    <div className="flex items-start gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-600">
                        <MedicationPillIcon className="size-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-semibold text-zinc-900">{item.title}</p>
                          </div>
                          <time dateTime={item.startedAt} className="shrink-0 text-right leading-5">
                            <span className="block text-sm font-semibold text-zinc-600">{startedDateTime.date}</span>
                            <span className="block text-xs font-medium text-zinc-400">{startedDateTime.time}</span>
                          </time>
                        </div>
                        <div className="mt-1 space-y-0.5 text-sm leading-5 text-zinc-600">
                          <p className="font-semibold text-zinc-700">Medication course:</p>
                          <p>{courseDateRange}</p>
                        </div>
                        <div className="mt-2 space-y-1 text-sm leading-5">
                          <p className="text-zinc-600">
                            <span className="font-semibold text-zinc-700">Dosage:</span> {courseDosage}
                          </p>
                          {item.frequency ? <p className="text-zinc-600">{item.frequency}</p> : null}
                          {item.timing ? (
                            <p className="text-zinc-600">{item.timing}</p>
                          ) : null}
                          {item.notes ? (
                            <ExpandableNoteText className="text-zinc-600">
                              <span className="font-semibold text-zinc-700">Notes:</span> {item.notes}
                            </ExpandableNoteText>
                          ) : null}
                          <p className="font-semibold text-sky-700">{medicationCourseSummary(item)}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleMedicationCourse(item.id)}
                          className="mt-3 rounded-full bg-white px-3 py-1.5 text-xs font-normal text-sky-700 ring-1 ring-sky-200 transition hover:bg-sky-50"
                        >
                          {expanded ? "Hide doses" : `Show ${item.activities.length} doses`}
                        </button>
                        {expanded ? (
                          <div className="mt-3 space-y-2 border-t border-sky-100 pt-3">
                            {item.activities.map((activity) => {
                              const status = medicationStatus(activity);
                              const doseDateTime = medicalRecordDateTime(activity.happenedAt);
                              const notes = medicationDoseAddedNotes(activity, item.notes);

                              return (
                                <div key={activity.id} className="rounded-2xl bg-white/70 p-3 ring-1 ring-sky-100">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="text-sm font-semibold text-zinc-800">{status === "given" ? "Given" : status === "skipped" ? "Skipped" : "Missed"}</p>
                                      {notes ? <ExpandableNoteText className="mt-1 text-sm text-zinc-500">Notes: {notes}</ExpandableNoteText> : null}
                                    </div>
                                    <time dateTime={activity.happenedAt} className="shrink-0 text-right leading-5">
                                      <span className="block text-sm font-semibold text-zinc-600">{doseDateTime.date}</span>
                                      <span className="block text-xs font-medium text-zinc-400">{doseDateTime.time}</span>
                                    </time>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              }

              const activity = item.activity;
              const notes = regularNotes(activity);
              const attachments = activity.attachments ?? [];
              const fallbackAttachments = attachments.length ? [] : fallbackAttachmentNames(activity);
              const recordIcon = medicalRecordIcon(activity);
              const recordDateTime = medicalRecordDateTime(activity.happenedAt);
              const heading = medicalRecordHeading(activity);

              return (
                <div key={activity.id} className="space-y-2">
                  <article
                    role={canEditEntries && editingActivityId !== activity.id ? "button" : undefined}
                    tabIndex={canEditEntries && editingActivityId !== activity.id ? 0 : undefined}
                    onClick={canEditEntries && editingActivityId !== activity.id ? () => openEditorForActivity(activity) : undefined}
                    onKeyDown={(event) => {
                      if (!canEditEntries || editingActivityId === activity.id || (event.key !== "Enter" && event.key !== " ")) return;
                      event.preventDefault();
                      openEditorForActivity(activity);
                    }}
                    className={`rounded-2xl bg-sky-50/80 p-4 ring-1 transition ${
                      editingActivityId === activity.id
                        ? "ring-sky-400"
                        : "ring-sky-200"
                    } ${canEditEntries && editingActivityId !== activity.id ? "cursor-pointer hover:bg-sky-50" : ""}`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-600">
                        {recordIcon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-semibold text-zinc-900">{heading.title}</p>
                            {heading.subtitle ? <p className="mt-1 text-sm font-normal text-zinc-700">{heading.subtitle}</p> : null}
                          </div>
                          <time dateTime={activity.happenedAt} className="shrink-0 text-right leading-5">
                            <span className="block text-sm font-semibold text-zinc-600">{recordDateTime.date}</span>
                            <span className="block text-xs font-medium text-zinc-400">{recordDateTime.time}</span>
                          </time>
                        </div>
                        {notes ? <ExpandableNoteText className="mt-1 text-sm text-zinc-600" stopPropagation={false}>Notes: {notes}</ExpandableNoteText> : null}
                        {attachments.length ? (
                          <div className="mt-2">
                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">Attachments</p>
                            <MedicalAttachmentPills attachments={attachments} />
                          </div>
                        ) : (
                          <MedicalAttachmentFallback names={fallbackAttachments} />
                        )}
                      </div>
                    </div>
                    {editingActivityId === activity.id && detailActivityType ? (
                      <ActivityDetailForm
                        activityType={detailActivityType}
                        detail={detailValue}
                        notes={notesValue}
                        extraNotes={extraNotesValue}
                        happenedAt={happenedAtValue}
                        isEditing
                        embedded
                        saveLabel="Save"
                        onDetailChange={setDetailValue}
                        onNotesChange={setNotesValue}
                        onExtraNotesChange={setExtraNotesValue}
                        attachmentFiles={attachmentFiles}
                        attachmentNames={
                          attachments.length
                            ? attachments
                                .filter((attachment) => !removedAttachmentIds.includes(attachment.id))
                                .map((attachment) => attachment.fileName)
                            : fallbackAttachments
                        }
                        onAttachmentNameRemove={
                          attachments.length
                            ? (index) => {
                                const attachment = attachments.filter((item) => !removedAttachmentIds.includes(item.id))[index];
                                if (!attachment) return;
                                setRemovedAttachmentIds((current) => [...current, attachment.id]);
                              }
                            : undefined
                        }
                        onAttachmentsChange={setAttachmentFiles}
                        maxAttachmentFiles={detailAttachmentLimit}
                        attachmentLimitMessage={detailAttachmentLimitMessage}
                        onHappenedAtChange={setHappenedAtValue}
                        onSave={saveDetailedActivity}
                        onCancel={resetEditor}
                        onDelete={canDeleteEntries ? deleteActivity : undefined}
                        saving={activityState === "saving"}
                      />
                    ) : null}
                  </article>
                </div>
              );
            })
          ) : (
            <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
              <p className="text-sm text-zinc-500">No records for this filter yet.</p>
            </section>
          )}
        </div>

        {!editingActivityId ? <BottomNav /> : null}
      </div>
    </main>
  );
}
