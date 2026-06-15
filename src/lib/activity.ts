import type { ActivityLog, ActivityType } from "@/lib/hewster-data";

import type { CareItemTemplate } from "@/lib/care-settings";

export function formatActivityLabel(activityType: ActivityType) {
  switch (activityType) {
    case "potty":
      return "Potty";
    case "pee":
      return "Pee";
    case "poop":
      return "Poop";
    case "activity":
    case "outdoor":
      return "Activity";
    case "care":
      return "Care";
    case "wellness":
      return "Wellness";
    case "hike":
      return "Hiking";
    case "treat":
      return "Treat";
    case "food":
      return "Food";
    case "supplement":
      return "Supplement";
    case "medication":
      return "Medication";
    case "sick":
      return "Health";
    case "other":
      return "Other";
    default:
      return "Activity";
  }
}

export function formatActivityTime(happenedAt: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(happenedAt));
}

export function renderActivityDetail(activity: ActivityLog) {
  const notes = activity.notes
    ?.split("\n")
    .map(normalizeCareFrequencyLine)
    .join("\n")
    .replace(/\s*(?:•|�\?�|•)\s*Notes:\s*/g, " Notes: ") ?? null;

  if (activity.activityType === "treat" && activity.detail && notes) {
    return `${activity.detail}: ${notes}`;
  }

  if (
    (
      activity.activityType === "other" ||
      activity.activityType === "potty" ||
      activity.activityType === "activity" ||
      activity.activityType === "outdoor" ||
      activity.activityType === "care" ||
      activity.activityType === "wellness" ||
      activity.activityType === "food" ||
      activity.activityType === "supplement" ||
      activity.activityType === "medication" ||
      activity.activityType === "sick"
    ) &&
    activity.detail &&
    notes
  ) {
    return `${activity.detail}: ${notes}`;
  }

  if (activity.detail && notes) {
    return `${activity.detail}, ${notes}`;
  }

  return activity.detail ?? notes ?? "";
}

function splitActivityNoteLines(notes: string | null) {
  return notes?.split("\n").map((line) => line.trim()).filter(Boolean) ?? [];
}

function isMetadataLine(line: string) {
  return line.startsWith("Attachments: ") || line.startsWith("Record Tags: ");
}

function isMedicationRouteLine(line: string) {
  return line === "Oral" || line === "Topical" || line === "Injection" || line === "Other";
}

function isMedicationTimingLine(line: string) {
  return line === "With Food" || line === "Empty Stomach";
}

export function normalizeCareFrequencyLine(line: string) {
  return /^Every\s+\d+\s+Hours(?:\s+(?:•|,)?\s*)As Needed$/i.test(line)
    ? line.replace(/\bHours\b/i, "hours").replace(/\s*(?:•|,)?\s*As Needed$/i, ", As Needed")
    : line;
}

function medicationTemplateLabel(item: CareItemTemplate) {
  return `${item.name.trim() || "Medication"}${item.dose ? ` • ${item.dose}` : ""}`;
}

export function careItemShortcutLabel(item: CareItemTemplate) {
  return `${item.name.trim() || formatActivityLabel(item.kind)}${item.dose ? ` — ${item.dose}` : ""}`;
}

export function savedCareItemLogNotes(item: CareItemTemplate) {
  const medicationType = item.kind === "medication"
    ? item.medicationType === "topical"
      ? "Topical"
      : item.medicationType === "injection"
        ? "Injection"
        : item.medicationType === "other"
          ? "Other"
          : "Oral"
    : null;
  const frequency = item.scheduleSteps.find((step) => step.everyHours)?.everyHours;

  return [
    `Give ${item.dose || "as directed"}${medicationType ? ` (${medicationType})` : ""}`,
    frequency ? `Every ${frequency} hours, As Needed` : "As Needed",
    item.customTiming === "empty-stomach" ? "Empty Stomach" : "With Food",
    item.notes ? `Notes: ${item.notes.trim()}` : "",
  ].filter(Boolean).join("\n");
}

export function savedHealthMedicationShortcutNotes(detail: string, careTemplates: CareItemTemplate[]) {
  const medicationText = detail.replace(/^Medication:\s*/i, "").trim();
  if (!medicationText) return "";

  const match = careTemplates.find((item) => {
    if (item.kind !== "medication" || !item.asNeeded) return false;
    return careItemShortcutLabel(item).toLowerCase() === medicationText.toLowerCase();
  });

  return match ? savedCareItemLogNotes(match) : "";
}

function medicationDetailFromTemplate(notes: string | null, careTemplates: CareItemTemplate[]) {
  const lines = splitActivityNoteLines(notes).filter((line) => !isMetadataLine(line));
  const giveLine = lines.find((line) => line.startsWith("Give ")) ?? "";
  const noteLines = lines.filter((line) => line.startsWith("Notes: ")).map((line) => line.replace(/^Notes:\s*/i, "").trim());
  const timingLine = lines.find(isMedicationTimingLine) ?? "";
  const doseText = giveLine.replace(/^Give\s+/i, "").replace(/\s*\([^)]*\)\s*$/, "").trim();

  const match = careTemplates.find((item) => {
    if (item.kind !== "medication") return false;
    const doseMatches = !doseText || item.dose.trim().toLowerCase() === doseText.toLowerCase();
    const notesMatch = !noteLines.length || noteLines.some((note) => item.notes.trim().toLowerCase() === note.toLowerCase());
    const timingMatches =
      !timingLine ||
      (timingLine === "Empty Stomach" && item.customTiming === "empty-stomach") ||
      (timingLine === "With Food" && item.customTiming !== "empty-stomach");

    return doseMatches && notesMatch && timingMatches;
  });

  return match ? `Medication: ${medicationTemplateLabel(match)}` : null;
}

function medicationNameLine(detail: string) {
  const medicationText = detail.replace(/^Medication:\s*/i, "").trim();
  const [name] = medicationText.split(/\s+(?:•|—)\s+/).map((part) => part.trim()).filter(Boolean);

  return `Medication: ${name || medicationText || detail.replace(/^Medication:\s*/i, "").trim() || "Medication"}`;
}

export function renderHealthTimelineActivityDetail(activity: ActivityLog, careTemplates: CareItemTemplate[] = []) {
  if (activity.activityType !== "sick") return renderActivityDetail(activity);

  const detail = activity.detail === "Medication" ? medicationDetailFromTemplate(activity.notes, careTemplates) ?? activity.detail : activity.detail ?? "";
  const noteLines = splitActivityNoteLines(activity.notes).map(normalizeCareFrequencyLine).filter((line) => !isMetadataLine(line));
  const isMedicationDetail = detail === "Medication" || detail.startsWith("Medication: ");

  if (!isMedicationDetail) {
    const notesText = noteLines.join("\n");
    return notesText && detail ? `${detail} • Notes: ${notesText}` : detail || notesText;
  }

  const giveLine = noteLines.find((line) => line.startsWith("Give ")) ?? null;
  const giveLineHasRoute = Boolean(giveLine && /\([^)]*\)/.test(giveLine));
  const displayLines = [
    medicationNameLine(detail),
    giveLine,
    ...noteLines.filter((line) => {
      if (line.startsWith("Give ")) return false;
      if (line === "As Needed" || /^Every\s+\d+\s+Hours\b/i.test(line)) return true;
      if (isMedicationTimingLine(line)) return true;
      if (isMedicationRouteLine(line)) return !giveLineHasRoute;
      if (line.startsWith("Notes: ")) return true;
      return false;
    }),
  ].filter(Boolean);

  return displayLines.join("\n");
}

export function splitTreatDetailText(value: string) {
  const [summary, notes] = value.split(/\s+Notes:\s+/, 2);

  return {
    summary: summary.trim(),
    notes: notes?.trim() || null,
  };
}

export function renderTreatDetailParts(activity: ActivityLog) {
  const detail = renderActivityDetail(activity);
  return splitTreatDetailText(detail);
}

function activityTieBreaker(activity: ActivityLog) {
  return activity.createdAt ?? activity.id;
}

export function compareActivitiesChronological(a: ActivityLog, b: ActivityLog) {
  return a.happenedAt.localeCompare(b.happenedAt) || activityTieBreaker(a).localeCompare(activityTieBreaker(b));
}

export function compareActivitiesReverseChronological(a: ActivityLog, b: ActivityLog) {
  return b.happenedAt.localeCompare(a.happenedAt) || activityTieBreaker(b).localeCompare(activityTieBreaker(a));
}

export function groupActivitiesByDay(activityLogs: ActivityLog[]) {
  return activityLogs.reduce<Record<string, ActivityLog[]>>((groups, activity) => {
    const dayKey = new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(activity.happenedAt));

    if (!groups[dayKey]) {
      groups[dayKey] = [];
    }

    groups[dayKey].push(activity);
    return groups;
  }, {});
}
