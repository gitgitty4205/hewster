"use client";

import { FileText, Paperclip, SlidersHorizontal } from "lucide-react";
import { PetAvatarMenu } from "@/components/pet-avatar-menu";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { BottomNav } from "@/components/bottom-nav";
import { ExpandableNoteText } from "@/components/expandable-note-text";
import { formatActivityTime, formatActivityLabel } from "@/lib/activity";
import { type ActivityLog, type ActivityAttachment, loadAppState } from "@/lib/hewster-data";
import { MedicationPillIcon } from "@/components/medication-pill-icon";
import { PetNotebookTitle } from "@/components/pet-notebook-title";
import { getSupabaseBrowserClient } from "@/lib/supabase";

const filters = ["All", "Vet Visits", "Attachments"];
const dateFilters = ["All Time", "Date Range"] as const;
type DateFilter = (typeof dateFilters)[number];

const vetVisitKeywords = ["Vet Visit", "Wellness Exam", "Sick Consult", "Procedure"];

function isVetVisitDetail(detail: string | null) {
  const normalized = detail ?? "";
  return vetVisitKeywords.some((value) => normalized.includes(value));
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
  if (activity.attachments?.length) {
    return `Attachments: ${activity.attachments.map((attachment) => attachment.fileName).join(", ")}`;
  }

  return noteLines(activity.notes).find((line) => line.startsWith("Attachments: ")) ?? null;
}

function medicalRecordTitle(activity: ActivityLog) {
  if (activity.detail) return activity.detail;
  if (activity.activityType === "sick") return "Symptoms";
  return formatActivityLabel(activity.activityType);
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
    case "Vet Visits":
      return isVetVisitDetail(activity.detail);
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
          onClick={() => {
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

  const medicalRecords = useMemo(
    () => activityLogs
      .filter((activity) => isVetVisitDetail(activity.detail) || Boolean(attachmentLine(activity)))
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
              <h1 className="mt-1 text-xl font-bold tracking-tight text-zinc-700">Health Records</h1>
              <p className="mt-1 max-w-[15rem] text-sm leading-5 text-zinc-500">Health notes, vet visits, and attachments, sorted by date.</p>
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

              return (
                <article key={activity.id} className="rounded-2xl bg-sky-50/80 p-4 ring-1 ring-sky-200">
                  <div className="flex items-start gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-600">
                      {recordIcon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-zinc-900">{medicalRecordTitle(activity)}</p>
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
