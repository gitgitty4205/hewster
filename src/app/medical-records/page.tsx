"use client";

import { FileHeart } from "lucide-react";
import { PetAvatarMenu } from "@/components/pet-avatar-menu";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { BottomNav } from "@/components/bottom-nav";
import { formatActivityTime, formatActivityLabel } from "@/lib/activity";
import { type ActivityLog, loadAppState } from "@/lib/hewster-data";

const filters = ["All", "Vet Visits", "Health Logs", "Vaccines", "Invoices", "Insurance", "Photos"];

const medicalDetailKeywords = ["Vet Visit", "Wellness Exam", "Sick Consult", "Vaccine", "Injection", "Medication", "Flea & Tick", "Deworming", "Procedure", "Other Medical"];
const vetVisitKeywords = ["Vet Visit", "Wellness Exam", "Sick Consult", "Procedure"];

function isMedicalDetail(detail: string | null) {
  const normalized = detail ?? "";
  return medicalDetailKeywords.some((value) => normalized.includes(value));
}

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

function noteLines(notes: string | null) {
  return notes?.split("\n").map((line) => line.trim()).filter(Boolean) ?? [];
}

function recordTags(activity: ActivityLog) {
  const explicitTags = noteLines(activity.notes)
    .find((line) => line.startsWith("Record Tags: "))
    ?.replace("Record Tags: ", "")
    .split(", ")
    .filter(Boolean) ?? [];

  const inferred = new Set(explicitTags);
  const detail = activity.detail ?? "";

  if (activity.activityType === "wellness" && isMedicalDetail(detail)) inferred.add("Vet Visit");
  if (activity.activityType === "sick") inferred.add("Health Log");
  if (detail.includes("Vaccine")) inferred.add("Vaccines");
  if (detail.includes("Procedure")) inferred.add("Procedure");
  if (noteLines(activity.notes).some((line) => line.startsWith("Attachments: "))) inferred.add("Attachment");

  return [...inferred];
}

function attachmentLine(activity: ActivityLog) {
  return noteLines(activity.notes).find((line) => line.startsWith("Attachments: ")) ?? null;
}

function regularNotes(activity: ActivityLog) {
  return noteLines(activity.notes)
    .filter((line) => !line.startsWith("Record Tags: ") && !line.startsWith("Attachments: "))
    .join("\n");
}

function matchesFilter(activity: ActivityLog, filter: string) {
  if (filter === "All") return true;
  const tags = recordTags(activity);

  switch (filter) {
    case "Vet Visits":
      return isVetVisitDetail(activity.detail);
    case "Health Logs":
      return activity.activityType === "sick";
    case "Vaccines":
      return tags.includes("Vaccines") || tags.includes("Vaccine Certificate") || (activity.detail ?? "").includes("Vaccine");
    case "Invoices":
      return tags.includes("Invoice");
    case "Insurance":
      return tags.includes("Insurance");
    case "Photos":
      return tags.includes("Photo") || Boolean(attachmentLine(activity));
    default:
      return true;
  }
}

export default function MedicalRecordsPage() {
  const [hydrated, setHydrated] = useState(false);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [activeFilter, setActiveFilter] = useState("All");

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
      .filter((activity) => activity.activityType === "sick" || (activity.activityType === "wellness" && isMedicalDetail(activity.detail)))
      .filter((activity) => matchesFilter(activity, activeFilter)),
    [activityLogs, activeFilter]
  );

  return (
    <main className="min-h-screen bg-[var(--hewie-bg,#979ca7)] text-zinc-900">
      <div className="content-fade-in mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-24 pt-6">
        <header className="mb-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Link href="/hewie" className="text-sm font-bold text-[var(--hewie-active-text,#6d28d9)]">
                Hewster&apos;s Notebook
              </Link>
              <h1 className="mt-1 text-xl font-bold tracking-tight text-zinc-700">Medical Records</h1>
            </div>
            <PetAvatarMenu className="mt-0.5 size-20 rounded-full object-cover object-center ring-1 ring-zinc-500/60 shadow-sm" />
          </div>
        </header>

        <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
          {filters.map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setActiveFilter(filter)}
              className={`shrink-0 rounded-full px-3 py-2 text-sm font-semibold ring-1 ${
                activeFilter === filter
                  ? "bg-[var(--hewie-active-bg,#f1f5f9)] text-[var(--hewie-active-text,#334155)] ring-[var(--hewie-ring,#cbd5e1)]"
                  : "bg-white/80 text-zinc-600 ring-zinc-200"
              }`}
            >
              {filter}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {!hydrated ? (
            <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
              <p className="text-sm text-zinc-500">Loading records...</p>
            </section>
          ) : medicalRecords.length ? (
            medicalRecords.map((activity) => {
              const tags = recordTags(activity);
              const notes = regularNotes(activity);
              const attachments = attachmentLine(activity);

              return (
                <article key={activity.id} className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
                  <div className="flex items-start gap-3">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 ring-1 ring-sky-100">
                      <FileHeart className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-zinc-900">{formatActivityLabel(activity.activityType)}</p>
                          <p className="text-xs text-zinc-500">{dayKeyFromDate(activity.happenedAt)} at {formatActivityTime(activity.happenedAt)}</p>
                        </div>
                      </div>
                      {activity.detail ? <p className="mt-2 text-sm text-zinc-700">{activity.detail}</p> : null}
                      {notes ? <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-600">Notes: {notes}</p> : null}
                      {attachments ? <p className="mt-1 text-sm text-zinc-500">{attachments}</p> : null}
                      {tags.length ? (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {tags.map((tag) => (
                            <span key={tag} className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 ring-1 ring-sky-100">
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : null}
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
