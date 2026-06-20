import type { ActivityLog, ActivityType } from "@/lib/hewster-data";

import type { CareItemTemplate } from "@/lib/care-settings";

const supplementNameNotePrefix = "Supplement: ";

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

export function isManualMedicationActivity(activity: ActivityLog) {
  return activity.activityType === "sick" && (activity.detail === "Medication" || activity.detail?.startsWith("Medication: "));
}

export function isManualSupplementActivity(activity: ActivityLog) {
  return activity.activityType === "wellness" && activity.detail === "Supplements";
}

const healthMedicalDetailKeywords = ["Vet Visit", "Medication", "Injection", "Vaccine", "Lab / Test", "Procedure", "Flea & Tick", "Deworming", "Other Health", "Other Vet / Medical", "Other Vet/Medical", "Other Medical"];

export function formatHealthSymptomTimelineDetail(detail: string | null) {
  const value = detail?.trim() ?? "";
  if (!value) return "";
  if (healthMedicalDetailKeywords.some((keyword) => value.includes(keyword))) return value;
  return `Symptom: ${value}`;
}

export function eventCardActivityType(activity: ActivityLog): ActivityType {
  if (isManualMedicationActivity(activity)) return "medication";
  if (isManualSupplementActivity(activity)) return "supplement";
  return activity.activityType;
}

export function eventCardActivityLabel(activity: ActivityLog) {
  if (["pee", "poop", "potty"].includes(activity.activityType)) return "Potty";
  if (isManualSupplementActivity(activity)) return "Supplements";
  return formatActivityLabel(eventCardActivityType(activity));
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

  if (activity.activityType === "food") {
    const foodParts = manualFoodDetailParts(activity.detail, notes);
    if (foodParts.detail && foodParts.notes) return `${foodParts.detail} • Notes: ${foodParts.notes}`;
    return foodParts.detail || (foodParts.notes ? `Notes: ${foodParts.notes}` : "");
  }

  if (activity.activityType === "wellness" && activity.detail === "Supplements" && notes) {
    const noteLines = notes.split("\n");
    const supplementName = noteLines
      .find((line) => line.trim().startsWith(supplementNameNotePrefix))
      ?.trim()
      .replace(supplementNameNotePrefix, "")
      .trim();
    const visibleNotes = noteLines
      .filter((line) => !line.trim().startsWith(supplementNameNotePrefix))
      .join("\n")
      .trim();

    if (supplementName && visibleNotes) return `Supplements: ${supplementName}\n${visibleNotes}`;
    if (supplementName) return `Supplements: ${supplementName}`;
    if (visibleNotes) return `Unnamed Supplement • Notes: ${visibleNotes.replace(/^Notes:\s*/i, "").trim()}`;
  }

  if (activity.activityType === "treat" && activity.detail && notes) {
    return `${activity.detail} • Notes: ${notes}`;
  }

  if (
    (
      activity.activityType === "other" ||
      activity.activityType === "potty" ||
      activity.activityType === "activity" ||
      activity.activityType === "outdoor" ||
      activity.activityType === "care" ||
      activity.activityType === "wellness" ||
      activity.activityType === "supplement" ||
      activity.activityType === "medication" ||
      activity.activityType === "sick"
    ) &&
    activity.detail &&
    notes
  ) {
    return `${activity.detail} • Notes: ${notes}`;
  }

  if (activity.detail && notes) {
    return `${activity.detail} • Notes: ${notes}`;
  }

  return activity.detail ?? notes ?? "";
}

export function manualFoodDetailParts(detail: string | null, notes: string | null) {
  const detailText = detail?.trim() ?? "";
  const notesText = notes?.trim() ?? "";
  const detailIsPlaceholder = detailText.toLowerCase() === "food";

  if (!detailIsPlaceholder) {
    return {
      detail: detailText,
      notes: notesText.replace(/^Notes:\s*/i, "").trim(),
    };
  }

  if (!notesText) {
    return {
      detail: "",
      notes: "",
    };
  }

  const [foodText, extraNotes] = notesText.split(/\s*(?:•\s*)?Notes:\s+/, 2);
  const normalizedFoodText = foodText.replace(/^Notes:\s*/i, "").trim();

  return {
    detail: normalizedFoodText,
    notes: extraNotes?.trim() ?? "",
  };
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

function hideDefaultOralRoute(line: string | null) {
  return line?.replace(/\s*\(Oral\)\s*$/i, "").trim() || null;
}

export function normalizeCareFrequencyLine(line: string) {
  return /^Every\s+\d+\s+Hours(?:\s+(?:•|,)?\s*)As Needed$/i.test(line)
    ? line.replace(/\bHours\b/i, "hours").replace(/\s*(?:•|,)?\s*As Needed$/i, ", As Needed")
    : line;
}

function medicationTemplateLabel(item: CareItemTemplate) {
  return `${item.name.trim() || "Unnamed Medication"}${item.dose ? ` • ${item.dose}` : ""}`;
}

export function careItemShortcutLabel(item: CareItemTemplate) {
  const fallbackName = item.kind === "supplement" ? "Unnamed Supplement" : "Unnamed Medication";
  return `${item.name.trim() || fallbackName}${item.dose ? ` — ${item.dose}` : ""}`;
}

export function savedCareItemLogNotes(item: CareItemTemplate) {
  const careType = item.kind === "supplement" && item.scheduleKind === "meal"
    ? null
    : item.medicationType === "topical"
      ? "Topical"
      : item.medicationType === "injection"
        ? "Injection"
        : item.medicationType === "other"
          ? "Other"
          : null;
  const frequency = item.scheduleSteps.find((step) => step.everyHours)?.everyHours;

  return [
    `Give ${item.dose || "as directed"}${careType ? ` (${careType})` : ""}`,
    frequency ? `Every ${frequency} hours, As Needed` : "As Needed",
    item.customTiming === "empty-stomach" ? "Empty Stomach" : "With Food",
    item.notes ? `Plan Notes: ${item.notes.trim()}` : "",
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

export function savedWellnessSupplementShortcutNotes(notes: string, careTemplates: CareItemTemplate[]) {
  const supplementText = splitActivityNoteLines(notes)
    .find((line) => line.startsWith(supplementNameNotePrefix))
    ?.replace(supplementNameNotePrefix, "")
    .trim();
  if (!supplementText) return "";

  const match = careTemplates.find((item) => {
    if (item.kind !== "supplement") return false;
    return careItemShortcutLabel(item).toLowerCase() === supplementText.toLowerCase();
  });

  return match ? savedCareItemLogNotes(match).replace(/^Plan Notes: /gm, "Notes: ") : "";
}

function medicationDetailFromTemplate(notes: string | null, careTemplates: CareItemTemplate[]) {
  const lines = splitActivityNoteLines(notes).filter((line) => !isMetadataLine(line));
  const giveLine = lines.find((line) => line.startsWith("Give ")) ?? "";
  const noteLines = lines
    .filter((line) => line.startsWith("Notes: ") || line.startsWith("Plan Notes: "))
    .map((line) => line.replace(/^(?:Plan\s+)?Notes:\s*/i, "").trim());
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
  const displayName = name || medicationText || detail.replace(/^Medication:\s*/i, "").trim();

  return `Medication: ${displayName && displayName.toLowerCase() !== "medication" ? displayName : "Unnamed Medication"}`;
}

export function renderHealthTimelineActivityDetail(activity: ActivityLog, careTemplates: CareItemTemplate[] = []) {
  if (activity.activityType !== "sick") return renderActivityDetail(activity);

  const detail = activity.detail === "Medication" ? medicationDetailFromTemplate(activity.notes, careTemplates) ?? activity.detail : activity.detail ?? "";
  const noteLines = splitActivityNoteLines(activity.notes).map(normalizeCareFrequencyLine).filter((line) => !isMetadataLine(line));
  const isMedicationDetail = detail === "Medication" || detail.startsWith("Medication: ");

  if (!isMedicationDetail) {
    const notesText = noteLines.join("\n");
    const displayDetail = formatHealthSymptomTimelineDetail(detail);
    return notesText && displayDetail ? `${displayDetail} • Notes: ${notesText}` : displayDetail || notesText;
  }

  const giveLine = hideDefaultOralRoute(noteLines.find((line) => line.startsWith("Give ")) ?? null);
  const giveLineHasRoute = Boolean(giveLine && /\([^)]*\)/.test(giveLine));
  const displayLines = [
    medicationNameLine(detail),
    giveLine,
    ...noteLines.filter((line) => {
      if (line.startsWith("Give ")) return false;
      if (line === "As Needed" || /^Every\s+\d+\s+Hours\b/i.test(line)) return true;
      if (isMedicationTimingLine(line)) return true;
      if (isMedicationRouteLine(line)) return line !== "Oral" && !giveLineHasRoute;
      if (line.startsWith("Notes: ") || line.startsWith("Plan Notes: ")) return true;
      return false;
    }),
  ].filter(Boolean);

  return displayLines.join("\n");
}

export function splitTreatDetailText(value: string) {
  const [summary, notes] = value.split(/\s*(?:•\s*)?Notes:\s+/, 2);

  return {
    summary: summary.replace(/\s*•\s*$/, "").trim(),
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
