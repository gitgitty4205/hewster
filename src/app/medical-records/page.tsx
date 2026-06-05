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

const filters = ["All", "Symptoms", "Vet Visits", "Medication", "Vaccine / Injection", "Lab / Test", "Procedures", "Prevention", "Other Vet / Medical", "Attachments"];
const dateFilters = ["All Time", "Date Range"] as const;
type DateFilter = (typeof dateFilters)[number];

const vetVisitKeywords = ["Vet Visit", "Wellness Exam", "Sick Consult"];
const medicationKeywords = ["Medication"];
const vaccineInjectionKeywords = ["Vaccine", "Injection", "Vaccine / Injection"];
const labTestKeywords = ["Lab / Test", "Lab", "Test"];
const procedureKeywords = ["Procedure"];
const preventionKeywords = ["Flea & Tick", "Deworming", "Prevention"];
const otherVetMedicalKeywords = ["Other Vet / Medical", "Other Vet/Medical", "Other Medical"];
const medicalSickKeywords = ["Vet Visit", "Medication", "Injection", "Vaccine", "Lab / Test", "Procedure", "Flea & Tick", "Deworming", "Other Vet / Medical", "Other Vet/Medical", "Other Medical"];
const medicalWellnessKeywords = ["Vet Visit", "Wellness Exam", "Sick Consult", "Vaccine", "Injection", "Vaccine / Injection", "Medication", "Flea & Tick", "Deworming", "Lab / Test", "Procedure", "Other Vet / Medical", "Other Vet/Medical", "Other Medical"];
const pottyActivityTypes = new Set(["pee", "poop", "potty"]);

function displayMedicalDetail(detail: string | null) {
  return detail?.replace(/^Other Vet\/Medical\b/, "Other Vet / Medical").replace(/^Other Medical\b/, "Other Vet / Medical") ?? null;
}

function medicalRecordHeading(activity: ActivityLog) {
  const detail = displayMedicalDetail(activity.detail);

  if (!detail) {
    return {
      title: activity.activityType === "sick" ? "Symptoms" : formatActivityLabel(activity.activityType),
      subtitle: null,
    };
  }

  if (detail === "Other Vet / Medical" || detail.startsWith("Other Vet / Medical: ")) {
    return {
      title: "Other Vet / Medical",
      subtitle: detail.replace(/^Other Vet \/ Medical:?\s*/, "") || null,
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

function isVaccineInjectionRecord(activity: ActivityLog) {
  return hasDetailKeyword(activity, vaccineInjectionKeywords);
}

function isLabTestRecord(activity: ActivityLog) {
  return hasDetailKeyword(activity, labTestKeywords);
}

function isProcedureRecord(activity: ActivityLog) {
  return hasDetailKeyword(activity, procedureKeywords);
}

function isPreventionRecord(activity: ActivityLog) {
  return hasDetailKeyword(activity, preventionKeywords);
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

function matchesFilter(activity: ActivityLog, filter: string) {
  if (filter === "All") return true;

  switch (filter) {
    case "Symptoms":
      return isSymptomRecord(activity);
    case "Vet Visits":
      return isVetVisitDetail(activity.detail);
    case "Medication":
      return isMedicationRecord(activity);
    case "Vaccine / Injection":
      return isVaccineInjectionRecord(activity);
    case "Lab / Test":
      return isLabTestRecord(activity);
    case "Procedures":
      return isProcedureRecord(activity);
    case "Prevention":
      return isPreventionRecord(activity);
    case "Other Vet / Medical":
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
  const [editingActivityId, setEditingActivityId] = useState<string | null>(null);
  const [detailActivityType, setDetailActivityType] = useState<ActivityType | null>(null);
  const [detailValue, setDetailValue] = useState("");
  const [notesValue, setNotesValue] = useState("");
  const [extraNotesValue, setExtraNotesValue] = useState("");
  const [happenedAtValue, setHappenedAtValue] = useState(() => nowForTimeInput());
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const supabaseReady = isSupabaseConfigured();

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
    const attachmentNames = activityAttachmentFileNamesForSave(
      { id: editingActivityId, profileSlug: HEWSTER_PROFILE_SLUG, activityType: resolvedActivityType, happenedAt, detail: null, notes: null },
      attachmentFiles,
      attachmentDocumentTypes
    );
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
              className="inline-flex items-center gap-2 rounded-full bg-[var(--hewie-accent,#78608f)] px-4 py-2 text-sm font-bold text-[var(--hewie-accent-text,#ffffff)] shadow-[0_8px_18px_rgba(15,23,42,0.14)] ring-1 ring-[var(--hewie-accent,#78608f)]/20 transition hover:opacity-90"
            >
              <SlidersHorizontal className="size-4" />
              Filter
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
          ) : medicalRecords.length ? (
            medicalRecords.map((activity) => {
              const notes = regularNotes(activity);
              const attachments = activity.attachments ?? [];
              const fallbackAttachments = attachments.length ? [] : fallbackAttachmentNames(activity);
              const recordIcon = medicalRecordIcon(activity);
              const recordDateTime = medicalRecordDateTime(activity.happenedAt);
              const heading = medicalRecordHeading(activity);

              return (
                <div key={activity.id} className="space-y-2">
                  <article
                    role={canEditEntries ? "button" : undefined}
                    tabIndex={canEditEntries ? 0 : undefined}
                    onClick={() => openEditorForActivity(activity)}
                    onKeyDown={(event) => {
                      if (!canEditEntries || (event.key !== "Enter" && event.key !== " ")) return;
                      event.preventDefault();
                      openEditorForActivity(activity);
                    }}
                    className={`rounded-2xl bg-sky-50/80 p-4 ring-1 transition ${
                      editingActivityId === activity.id
                        ? "ring-sky-400"
                        : "ring-sky-200"
                    } ${canEditEntries ? "cursor-pointer hover:bg-sky-50" : ""}`}
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
                          <time dateTime={activity.happenedAt} className="shrink-0 text-right leading-4">
                            <span className="block text-xs font-semibold text-zinc-600">{recordDateTime.date}</span>
                            <span className="block text-[11px] font-medium text-zinc-400">{recordDateTime.time}</span>
                          </time>
                        </div>
                        {notes ? <ExpandableNoteText className="mt-1 text-sm text-zinc-600">Notes: {notes}</ExpandableNoteText> : null}
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
                  </article>
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
                      attachmentNames={attachmentFiles.length ? attachmentFiles.map((file) => file.name) : activity.attachments?.map((attachment) => attachment.fileName) ?? fallbackAttachments}
                      onAttachmentsChange={setAttachmentFiles}
                      onHappenedAtChange={setHappenedAtValue}
                      onSave={saveDetailedActivity}
                      onCancel={resetEditor}
                      onDelete={canDeleteEntries ? deleteActivity : undefined}
                      saving={activityState === "saving"}
                    />
                  ) : null}
                </div>
              );
            })
          ) : (
            <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
              <p className="text-sm text-zinc-500">No records for this filter yet.</p>
            </section>
          )}
        </div>

        <BottomNav />
      </div>
    </main>
  );
}
