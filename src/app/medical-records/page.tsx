"use client";

import { FileText, Paperclip, SlidersHorizontal } from "lucide-react";
import { PetAvatarMenu } from "@/components/pet-avatar-menu";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { BottomNav } from "@/components/bottom-nav";
import { ExpandableNoteText } from "@/components/expandable-note-text";
import { compareActivitiesReverseChronological, formatActivityTime, formatActivityLabel, normalizeCareFrequencyLine, renderHealthTimelineActivityDetail } from "@/lib/activity";
import { loadCareTemplates, loadCurrentCareTemplatesFromSupabase, type CareItemTemplate } from "@/lib/care-settings";
import {
  type ActivityLog,
  type ActivityAttachment,
  loadAppState,
} from "@/lib/hewster-data";
import { MedicationPillIcon } from "@/components/medication-pill-icon";
import { PetNotebookTitle } from "@/components/pet-notebook-title";
import { getSupabaseBrowserClient } from "@/lib/supabase";

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
  if (isHealthMedicationActivity(activity)) {
    return {
      title: "Medication",
      subtitle: null,
    };
  }

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

function isHealthMedicationActivity(activity: ActivityLog) {
  return activity.activityType === "sick" && (activity.detail === "Medication" || activity.detail?.startsWith("Medication: "));
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

function scheduledMedicationDoseIndex(activity: ActivityLog) {
  if (activity.activityType !== "medication") return null;
  const baseId = activity.id.replace(/-(?:skipped|missed)$/, "");
  const match = baseId.match(/^medication-\d+-schedule-(?:daily|(\d+)-dose-(\d+))-/);
  if (!match) return null;
  return match[2] ? Number.parseInt(match[2], 10) : null;
}

function medicationActivityHasLastDoseMarker(activity: ActivityLog) {
  return noteLines(activity.notes).includes("Last Dose");
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
  const frequencyLine = noteLines(activity.notes).find((line) => line.startsWith("Every "));
  return frequencyLine ? normalizeCareFrequencyLine(frequencyLine) : null;
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

function splitMedicationCourseActivities(courseActivities: ActivityLog[]) {
  const chronologicalActivities = [...courseActivities].sort((a, b) => {
    const timeSort = new Date(a.happenedAt).getTime() - new Date(b.happenedAt).getTime();
    return timeSort || a.id.localeCompare(b.id);
  });
  const courses: ActivityLog[][] = [];

  chronologicalActivities.forEach((activity) => {
    const doseIndex = scheduledMedicationDoseIndex(activity);
    const currentCourse = courses[courses.length - 1];
    const previousActivity = currentCourse?.[currentCourse.length - 1] ?? null;
    const previousDoseIndex = previousActivity ? scheduledMedicationDoseIndex(previousActivity) : null;
    const previousTime = previousActivity ? new Date(previousActivity.happenedAt).getTime() : null;
    const activityTime = new Date(activity.happenedAt).getTime();
    const hoursSincePrevious =
      previousTime !== null && Number.isFinite(previousTime) && Number.isFinite(activityTime)
        ? (activityTime - previousTime) / (60 * 60 * 1000)
        : 0;
    const duplicateDoseMinute =
      previousTime !== null &&
      Number.isFinite(previousTime) &&
      Number.isFinite(activityTime) &&
      Math.abs(activityTime - previousTime) < 60 * 1000;
    const doseSequenceRestarted =
      currentCourse &&
      doseIndex !== null &&
      previousDoseIndex !== null &&
      (doseIndex < previousDoseIndex || (doseIndex === previousDoseIndex && !duplicateDoseMinute));
    const newCompletedCourseStarted =
      doseSequenceRestarted &&
      previousActivity &&
      (medicationActivityHasLastDoseMarker(previousActivity) || (doseIndex === 1 && hoursSincePrevious >= 24));

    if (!currentCourse || newCompletedCourseStarted) {
      courses.push([activity]);
      return;
    }

    currentCourse.push(activity);
  });

  return courses;
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
    splitMedicationCourseActivities(courseActivities).forEach((courseActivityGroup, courseIndex) => {
      const sortedActivities = [...courseActivityGroup].sort(compareActivitiesReverseChronological);
      const oldestActivity = sortedActivities[sortedActivities.length - 1];
      const latestActivity = sortedActivities[0];
      const counts: Record<MedicationStatus, number> = { given: 0, skipped: 0, missed: 0 };

      sortedActivities.forEach((activity) => {
        counts[medicationStatus(activity)] += 1;
      });

      items.push({
        kind: "medication-course",
        id: courseIndex === 0 ? id : `${id}-${courseIndex + 1}`,
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

function isMedicationTimingLine(line: string) {
  return line === "With Food" || line === "Empty Stomach";
}

function healthMedicationRecordParts(activity: ActivityLog, careTemplates: CareItemTemplate[]) {
  const detail = renderHealthTimelineActivityDetail(activity, careTemplates);
  const detailLines = detail.split("\n").map((line) => normalizeCareFrequencyLine(line.trim())).filter(Boolean);
  const medicationLine = detailLines.find((line) => line.startsWith("Medication: ")) ?? null;
  const giveLine = detailLines.find((line) => line.startsWith("Give ")) ?? null;

  return {
    title: medicationLine?.replace(/^Medication:\s*/i, "").trim() || "Medication",
    dosage: giveLine?.replace(/^Give\s+/i, "").trim() ?? null,
    frequency: detailLines.find((line) => line === "As Needed" || /^Every\s+\d+\s+hours\b/i.test(line)) ?? null,
    timing: detailLines.find(isMedicationTimingLine) ?? null,
    notes: detailLines
      .filter((line) => line.startsWith("Notes: "))
      .map((line) => line.replace(/^Notes:\s*/i, "").trim())
      .filter(Boolean)
      .join("\n") || null,
  };
}

function HealthMedicationRecordDetail({ activity, careTemplates, showTitle = true }: { activity: ActivityLog; careTemplates: CareItemTemplate[]; showTitle?: boolean }) {
  const detail = healthMedicationRecordParts(activity, careTemplates);

  if (!(showTitle && detail.title) && !detail.dosage && !detail.frequency && !detail.timing && !detail.notes) return null;

  return (
    <div className="mt-1 space-y-1 text-sm leading-5">
      {showTitle && detail.title ? <p className="font-semibold text-zinc-700">{detail.title}</p> : null}
      {detail.dosage ? (
        <p className="text-zinc-600">
          <span className="font-semibold text-zinc-700">Dosage:</span> {detail.dosage}
        </p>
      ) : null}
      {detail.frequency ? <p className="text-zinc-600">{detail.frequency}</p> : null}
      {detail.timing ? <p className="text-zinc-600">{detail.timing}</p> : null}
      {detail.notes ? (
        <ExpandableNoteText className="text-zinc-600" stopPropagation={false}>
          <span className="font-semibold text-zinc-700">Notes:</span> {detail.notes}
        </ExpandableNoteText>
      ) : null}
    </div>
  );
}

export default function MedicalRecordsPage() {
  const [hydrated, setHydrated] = useState(false);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [careTemplates, setCareTemplates] = useState<CareItemTemplate[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [activeFilter, setActiveFilter] = useState("All");
  const [draftFilter, setDraftFilter] = useState("All");
  const [dateFilter, setDateFilter] = useState<DateFilter>("All Time");
  const [draftDateFilter, setDraftDateFilter] = useState<DateFilter>("All Time");
  const [selectedMonth, setSelectedMonth] = useState(() => monthInputValue(new Date()));
  const [draftSelectedMonth, setDraftSelectedMonth] = useState(() => monthInputValue(new Date()));
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [draftSortOrder, setDraftSortOrder] = useState<"newest" | "oldest">("newest");
  const [expandedMedicationCourses, setExpandedMedicationCourses] = useState<string[]>([]);

  useEffect(() => {
    let mounted = true;

    loadAppState().then(async (state) => {
      const [supplements, medications] = await Promise.all([
        loadCurrentCareTemplatesFromSupabase("supplement").catch(() => loadCareTemplates("supplement")),
        loadCurrentCareTemplatesFromSupabase("medication").catch(() => loadCareTemplates("medication")),
      ]);

      if (!mounted) return;
      setCareTemplates([...supplements, ...medications]);
      setActivityLogs(state.activityLogs);
      setHydrated(true);
    });

    return () => {
      mounted = false;
    };
  }, []);

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
  const toggleFilters = () => {
    if (showFilters) {
      setShowFilters(false);
      return;
    }

    setDraftFilter(activeFilter);
    setDraftDateFilter(dateFilter);
    setDraftSelectedMonth(selectedMonth);
    setDraftSortOrder(sortOrder);
    setShowFilters(true);
  };

  const applyFilters = () => {
    setActiveFilter(draftFilter);
    setDateFilter(draftDateFilter);
    setSelectedMonth(draftSelectedMonth);
    setSortOrder(draftSortOrder);
    setShowFilters(false);
  };

  const clearFilters = () => {
    const currentMonth = monthInputValue(new Date());

    setActiveFilter("All");
    setDraftFilter("All");
    setDateFilter("All Time");
    setDraftDateFilter("All Time");
    setSelectedMonth(currentMonth);
    setDraftSelectedMonth(currentMonth);
    setSortOrder("newest");
    setDraftSortOrder("newest");
    setShowFilters(false);
  };

  const toggleMedicationCourse = (courseId: string) => {
    setExpandedMedicationCourses((current) =>
      current.includes(courseId) ? current.filter((id) => id !== courseId) : [...current, courseId]
    );
  };

  return (
    <main className="min-h-screen bg-[var(--hewie-bg)] text-zinc-900">
      <div className="content-fade-in mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-24 pt-6">
        <header className="mb-6">
          <div className="flex min-h-[4.5rem] items-center justify-between gap-3">
            <div>
              <PetNotebookTitle href="/notebook" className="text-sm font-bold text-[var(--hewie-active-text)]" />
              <h1 className="mt-1 text-xl font-bold tracking-tight text-[#3b2832]">Health Records</h1>
            </div>
            <PetAvatarMenu shape="tile" />
          </div>
        </header>

        <div className="mb-4">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={toggleFilters}
              aria-label={showFilters ? "Hide filters" : "Open filters"}
              className="inline-flex size-9 items-center justify-center rounded-full bg-[var(--hewie-accent)] p-0 text-[var(--hewie-accent-text)] shadow-[0_8px_18px_rgba(15,23,42,0.14)] ring-1 ring-[var(--hewie-accent)]/20 transition hover:opacity-90"
            >
              <SlidersHorizontal className="size-4" />
            </button>
          </div>

          {showFilters ? (
            <section className="mt-3 rounded-2xl bg-white/90 p-4 shadow-sm ring-1 ring-zinc-200">
              <div className="space-y-4">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">Record Type</p>
                  <div className="flex flex-wrap gap-2">
                    {filters.map((filter) => (
                      <button
                        key={filter}
                        type="button"
                        onClick={() => setDraftFilter(filter)}
                        className={`min-h-9 rounded-full px-3.5 py-2 text-xs font-bold leading-none ring-1 transition ${
                          draftFilter === filter
                            ? "bg-[var(--hewie-accent)] text-[var(--hewie-accent-text)] ring-white/45"
                            : "bg-white/65 text-[var(--hewie-active-text)]/75 ring-[var(--hewie-ring)]/70"
                        }`}
                      >
                        {filter}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">Sort</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { label: "Newest First", value: "newest" as const },
                      { label: "Oldest First", value: "oldest" as const },
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setDraftSortOrder(option.value)}
                        className={`min-h-9 rounded-full px-3.5 py-2 text-xs font-bold leading-none ring-1 transition ${
                          draftSortOrder === option.value
                            ? "bg-[var(--hewie-accent)] text-[var(--hewie-accent-text)] ring-white/45"
                            : "bg-white/65 text-[var(--hewie-active-text)]/75 ring-[var(--hewie-ring)]/70"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <div className="mt-3">
                    <label htmlFor="medical-date-range" className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
                      Date Range
                    </label>
                    <select
                      id="medical-date-range"
                      value={draftDateFilter}
                      onChange={(event) => setDraftDateFilter(event.target.value as DateFilter)}
                      className="w-full rounded-2xl bg-white px-3 py-2 text-sm font-semibold text-zinc-700 ring-1 ring-zinc-200"
                    >
                      {dateFilters.map((filter) => (
                        <option key={filter} value={filter}>
                          {filter}
                        </option>
                      ))}
                    </select>
                    {draftDateFilter === "Date Range" ? (
                      <input
                        type="month"
                        value={draftSelectedMonth}
                        onChange={(event) => setDraftSelectedMonth(event.target.value)}
                        className="mt-3 w-full rounded-2xl bg-white px-3 py-2 text-sm font-semibold text-zinc-700 ring-1 ring-zinc-200"
                      />
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={applyFilters}
                        className="rounded-full bg-[var(--hewie-accent)] px-4 py-2 text-sm font-bold text-[var(--hewie-accent-text)] transition hover:opacity-90"
                      >
                        Apply Filters
                      </button>
                      <button
                        type="button"
                        onClick={clearFilters}
                        className="rounded-full bg-white px-4 py-2 text-sm font-bold text-zinc-600 ring-1 ring-zinc-200 transition hover:bg-zinc-50"
                      >
                        Clear Filters
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          ) : null}
        </div>

        <div data-guide="medical-records" className="space-y-3">
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
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-600 ring-1 ring-sky-200">
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
              const healthMedicationActivity = isHealthMedicationActivity(activity);

              return (
                <div key={activity.id} className="space-y-2">
                  <article className="rounded-2xl bg-sky-50/80 p-4 ring-1 ring-sky-200">
                    <div className="flex items-start gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-600 ring-1 ring-sky-200">
                        {recordIcon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-semibold text-zinc-900">{heading.title}</p>
                          </div>
                          <time dateTime={activity.happenedAt} className="shrink-0 text-right leading-5">
                            <span className="block text-sm font-semibold text-zinc-600">{recordDateTime.date}</span>
                            <span className="block text-xs font-medium text-zinc-400">{recordDateTime.time}</span>
                          </time>
                        </div>
                        {healthMedicationActivity ? (
                          <HealthMedicationRecordDetail activity={activity} careTemplates={careTemplates} />
                        ) : heading.subtitle || notes ? (
                          <div className="mt-1 space-y-1 text-sm leading-5">
                            {heading.subtitle ? <p className="font-normal text-zinc-700">{heading.subtitle}</p> : null}
                            {notes ? <ExpandableNoteText className="text-zinc-600" stopPropagation={false}>Notes: {notes}</ExpandableNoteText> : null}
                          </div>
                        ) : null}
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
