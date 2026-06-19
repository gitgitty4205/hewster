import { Droplets, Ellipsis, Image as ImageIcon, Paperclip, Tablets, TriangleAlert } from "lucide-react";
import { useState } from "react";

import { MedicationPillIcon } from "@/components/medication-pill-icon";
import { EmojiAsset } from "@/components/emoji-asset";
import { PottyDetailBadges, pottyDetailForBadge } from "@/components/potty-detail-badges";
import { ExpandableNoteText } from "@/components/expandable-note-text";
import type { ActivityLog } from "@/lib/hewster-data";
import type { CareItemTemplate } from "@/lib/care-settings";
import { compareActivitiesChronological, eventCardActivityLabel, eventCardActivityType, formatActivityTime, groupActivitiesByDay, isManualMedicationActivity, isManualSupplementActivity, normalizeCareFrequencyLine, renderTreatDetailParts, splitTreatDetailText } from "@/lib/activity";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type TimelineItem = {
  time: string;
  label: string;
  detail: string;
  status?: "Skipped" | "Missed" | null;
  activity?: ActivityLog;
  activityType?: ActivityLog["activityType"] | "meal" | "manual";
  mealGroupId?: string;
  careItem?: CareItemTemplate & { isLastDose?: boolean };
  mealLinkedCareItems?: Array<{
    detail: string;
    label: string;
    careItem: CareItemTemplate & { isLastDose?: boolean };
  }>;
};

type Props = {
  activityLogs: ActivityLog[];
  timelineItems?: TimelineItem[];
  title?: React.ReactNode;
  subtitle?: string;
  grouped?: boolean;
  notebookOwnerId?: string | null;
  onSelectActivity?: (activity: ActivityLog) => void;
  renderInlineEditor?: (activity: ActivityLog) => React.ReactNode;
  careTemplates?: CareItemTemplate[];
  emptyMessage?: React.ReactNode;
};

type TextModal = {
  title: string;
  subtitle?: string;
  label?: string;
  text: string;
};

const timelineTitleClassName = "min-w-0 text-sm font-semibold text-zinc-900";
const timelineDetailClassName = "mt-1 text-sm text-zinc-500";
const timelineSecondaryDetailClassName = "mt-1 text-sm text-zinc-500";
const timelineTimeBadgeClassName = "rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-semibold text-zinc-500 ring-1 ring-zinc-200/80";

function initialsFromName(name?: string | null) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
}

function InitialsBadge({ name }: { name?: string | null }) {
  const initials = initialsFromName(name);
  if (!initials) return null;

  return (
    <span className="inline-flex size-[22px] shrink-0 items-center justify-center rounded-full bg-[#f2eadf] text-[10px] font-normal leading-none text-[#8a5a35] ring-1 ring-[#d8c3ad]/70">
      {initials}
    </span>
  );
}

function OpenableText({
  children,
  className = "",
  modal,
  onOpen,
}: {
  children: React.ReactNode;
  className?: string;
  modal: TextModal;
  onOpen?: (modal: TextModal) => void;
}) {
  if (!onOpen) return <span className={className}>{children}</span>;

  return (
    <span
      role="button"
      tabIndex={0}
      className={`${className} cursor-pointer`}
      onClick={(event) => {
        event.stopPropagation();
        onOpen(modal);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        onOpen(modal);
      }}
    >
      {children}
    </span>
  );
}

function TreatDetail({ activity }: { activity: ActivityLog }) {
  const { summary, notes } = renderTreatDetailParts(activity);

  return (
    <div className="mt-2 space-y-1 text-sm">
      {summary ? <p className="text-zinc-600">{summary}</p> : null}
      {notes ? <ExpandableNoteText className="text-zinc-500">Notes: {notes}</ExpandableNoteText> : null}
    </div>
  );
}

function splitActivityNotes(notes: string | null) {
  const lines = notes?.split("\n").map((line) => normalizeCareFrequencyLine(line.trim())).filter(Boolean) ?? [];
  const attachmentLine = lines.find((line) => line.startsWith("Attachments: ")) ?? null;

  return {
    lines,
    notesText: lines.filter((line) => line !== attachmentLine).join("\n"),
    attachmentLine,
  };
}

function visiblePottyNotes(notes: string | null) {
  return notes
    ?.split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("Attachments: ") && !line.startsWith("Record Tags: "))
    .join("\n")
    .trim();
}

function PottyActivityNotes({ activity, className = "mt-2 text-sm font-normal leading-5 text-zinc-500" }: { activity: ActivityLog; className?: string }) {
  const notes = visiblePottyNotes(activity.notes);
  if (!notes) return null;

  return <ExpandableNoteText className={className}>Notes: {notes}</ExpandableNoteText>;
}

function careTemplateRouteLabel(item: CareItemTemplate | null) {
  if (!item) return null;
  if (item.kind === "supplement" && item.scheduleKind === "meal") return null;
  if (item.medicationType === "topical") return "Topical";
  if (item.medicationType === "injection") return "Injection";
  if (item.medicationType === "other") return "Other";
  return null;
}

function careTemplateTimingLabel(item: CareItemTemplate | null) {
  if (!item || item.medicationType !== "oral") return null;
  return item.customTiming === "empty-stomach" ? "Empty Stomach" : "With Food";
}

function careTemplateGiveText(item: CareItemTemplate | null) {
  if (!item) return null;
  const route = careTemplateRouteLabel(item);
  return `Give ${item.dose || "as directed"}${route ? ` (${route})` : ""}`;
}

function medicationTimingBadgeColorClassName(timingLine: string | null) {
  return timingLine === "Empty Stomach"
    ? "bg-sky-200/90 text-zinc-950"
    : "bg-pink-200/90 text-sky-600";
}

function careGiveLineWithRoute(giveLine: string | null, routeLine: string | null) {
  if (!giveLine) return null;
  const visibleGiveLine = giveLine.replace(/\s*\(Oral\)\s*$/i, "").trim();
  const visibleRouteLine = routeLine === "Oral" ? null : routeLine;
  if (!visibleRouteLine || /\([^)]*\)\s*$/.test(visibleGiveLine)) return visibleGiveLine;
  return `${visibleGiveLine} (${visibleRouteLine})`;
}

function manualMedicationName(activity: ActivityLog) {
  return activity.detail?.replace(/^Medication:\s*/i, "").trim() || "";
}

function manualSupplementParts(lines: string[]) {
  const supplementLine = lines
    .find((line) => line.trim().startsWith("Supplement: "))
    ?.trim()
    .replace(/^Supplement:\s*/i, "")
    .trim() ?? "";
  const [name, dose] = supplementLine
    .split(/\s+(?:—|•|-)\s+/, 2)
    .map((part) => part.trim());

  return {
    line: supplementLine ? `Supplement: ${supplementLine}` : "",
    name: name || supplementLine,
    dose: dose || "",
  };
}

function isCareStructureLine(line: string) {
  return line.startsWith("Give ") ||
    line.startsWith("Plan Notes: ") ||
    line.startsWith("Notes: ") ||
    line === "With Food" ||
    line === "Empty Stomach" ||
    line === "Oral" ||
    line === "Topical" ||
    line === "Injection" ||
    line === "Other" ||
    line === "Last Dose";
}

function careFrequencyText(line: string | null) {
  return line?.replace(/^Notes:\s*/i, "").replace(/\s*•\s*/g, " ").trim() || "";
}

function isCareFrequencyLine(line: string) {
  const value = line.replace(/^Notes:\s*/i, "").trim();
  return value === "As Needed" || /^Every\b/i.test(value) || /\bOngoing\b/i.test(value);
}

function normalizedCareName(value: string | null) {
  return (value ?? "")
    .replace(/\s*(?:[•·-]\s*)?(?:Given|Skipped|Missed)\b/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function matchingCareTemplate(activity: ActivityLog, careTemplates: CareItemTemplate[] = []) {
  const displayActivityType = eventCardActivityType(activity);
  if (!["medication", "supplement"].includes(displayActivityType)) return null;
  const { lines } = splitActivityNotes(activity.notes);
  const supplementParts = isManualSupplementActivity(activity) ? manualSupplementParts(lines) : { name: "" };
  const detailName = normalizedCareName(supplementParts.name || activity.detail);

  return careTemplates.find((item) => {
    if (item.kind !== displayActivityType) return false;
    if (activity.id.includes(`${item.kind}-${item.id}-`)) return true;
    const itemName = item.name.trim().toLowerCase();
    if (!itemName) return false;
    if (!detailName) return false;
    return detailName === itemName || detailName.startsWith(`${itemName} `) || detailName.startsWith(`${itemName} •`) || detailName.startsWith(`${itemName} -`) || detailName.includes(itemName);
  }) ?? null;
}

function careTemplateFrequencyText(item: CareItemTemplate | null) {
  if (!item?.asNeeded) return "";
  const frequency = item.scheduleSteps.find((step) => step.everyHours)?.everyHours;
  return frequency ? `Every ${frequency} hours, As Needed` : "As Needed";
}

function isVisibleActivity(activity: ActivityLog, careTemplates: CareItemTemplate[]) {
  void activity;
  void careTemplates;
  return true;
}

function CareTemplateTimelineDetail({ item, detail, skipped = false, onOpenText }: { item: CareItemTemplate & { isLastDose?: boolean }; detail: string; skipped?: boolean; onOpenText?: (modal: TextModal) => void }) {
  const timingLine = careTemplateTimingLabel(item);
  const giveText = careTemplateGiveText(item);
  const noteText = skipped ? "" : item.notes?.trim() ?? "";

  return (
    <div className="mt-1 space-y-1.5 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <OpenableText className="font-semibold text-zinc-800" modal={{ title: item.name, label: "Details", text: `${item.name}${giveText ? `\n${giveText}` : ""}` }} onOpen={onOpenText}>{item.name}</OpenableText>
        {item.isLastDose ? <span className="inline-flex rounded-full bg-amber-100/80 px-2.5 py-1 text-xs font-normal text-[#173b63]">Last Dose</span> : null}
        {skipped ? <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-200/80">Skipped</span> : null}
      </div>
      {giveText || timingLine ? (
        <div className="flex flex-wrap items-center gap-2 text-zinc-600">
          {giveText ? <OpenableText modal={{ title: item.name, label: "Details", text: `${item.name}\n${giveText}` }} onOpen={onOpenText}>{giveText}</OpenableText> : null}
          {timingLine ? (
            <span className={`rounded-full px-2.5 py-1 text-xs font-normal ${medicationTimingBadgeColorClassName(timingLine)}`}>
              {timingLine}
            </span>
          ) : null}
        </div>
      ) : null}
      {noteText ? <ExpandableNoteText className="text-zinc-500"><span className="font-medium text-zinc-600">Notes:</span> {noteText}</ExpandableNoteText> : detail && !detail.includes(item.name) ? <p className="text-zinc-500">{detail}</p> : null}
    </div>
  );
}

function CareActivityDetail({ activity, careTemplates = [], onOpenText }: { activity: ActivityLog; careTemplates?: CareItemTemplate[]; onOpenText?: (modal: TextModal) => void }) {
  const { lines, attachmentLine } = splitActivityNotes(activity.notes);
  const showAttachmentFallback = !activity.attachments?.length;
  const detail = activity.detail ?? "";
  const manualMedication = isManualMedicationActivity(activity);
  const manualSupplement = isManualSupplementActivity(activity);
  const supplementParts = manualSupplement ? manualSupplementParts(lines) : { line: "", name: "", dose: "" };
  const skipped = /\bSkipped\b/i.test(detail) || lines.some((line) => line.startsWith("Skip Note: "));
  const missed = /\bMissed\b/i.test(detail) || lines.includes("Missed");
  const skipReason = lines.find((line) => line.startsWith("Skip Note: "))?.replace("Skip Note: ", "").trim() ?? null;
  const careLines = lines.filter((line) => line !== attachmentLine && !line.startsWith("Skip Note: ") && line !== "Missed" && line !== supplementParts.line);
  const isLastDose = careLines.includes("Last Dose");
  const matchedTemplate = matchingCareTemplate(activity, careTemplates);
  const timingLine = careLines.find((line) => line === "With Food" || line === "Empty Stomach") ?? careTemplateTimingLabel(matchedTemplate);
  const routeLine = careLines.find((line) => line === "Oral" || line === "Topical" || line === "Injection" || line === "Other") ?? careTemplateRouteLabel(matchedTemplate);
  const giveLine = careGiveLineWithRoute(careLines.find((line) => line.startsWith("Give ")) ?? null, routeLine);
  const doseText = giveLine?.replace(/^Give\s+/i, "").replace(/\s*\([^)]*\)\s*$/, "").trim() ?? matchedTemplate?.dose ?? "";
  const visibleRouteLine = routeLine === "Oral" ? null : routeLine;
  const giveDetail = giveLine ?? (supplementParts.dose ? `Give ${supplementParts.dose}` : null) ?? (doseText || visibleRouteLine ? `Give ${doseText || "as directed"}${visibleRouteLine ? ` (${visibleRouteLine})` : ""}` : null);
  const frequencyText = careFrequencyText(careLines.find(isCareFrequencyLine) ?? null) || careTemplateFrequencyText(matchedTemplate);
  const name = (matchedTemplate?.name || supplementParts.name || (manualMedication ? manualMedicationName(activity) : "") || detail)
    .replace(/\s*(?:[•·-]\s*)?(?:Skipped|Missed)\b/i, "")
    .replace(doseText ? new RegExp(`\\s*(?:[•·-]|—)\\s*${doseText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i") : /$^/, "")
    .trim();
  const templatePlanNotes = matchedTemplate?.notes.trim() ?? "";
  const planNotes = [
    ...careLines.filter((line) => line.startsWith("Plan Notes: ")).map((line) => line.replace("Plan Notes: ", "")),
    ...careLines.filter((line) => line.startsWith("Notes: ") && line.replace("Notes: ", "").trim() === templatePlanNotes).map((line) => line.replace("Notes: ", "")),
  ];
  const normalizedPlanNotes = new Set(planNotes.map((line) => line.trim()));
  const visibleSkipReason = skipReason?.replace(/^(?:Plan\s+)?Notes:\s*/i, "").trim() ?? "";
  const skipReasonNote = visibleSkipReason && !normalizedPlanNotes.has(visibleSkipReason) ? visibleSkipReason : "";
  const templateNotes = matchedTemplate?.notes.trim() ?? "";
  const specialNotes = [
    skipReasonNote,
    ...careLines.filter((line) => line.startsWith("Notes: ") && !isCareFrequencyLine(line)).map((line) => line.replace("Notes: ", "")).filter((line) => !normalizedPlanNotes.has(line.trim())),
    ...careLines.filter((line) => !isCareStructureLine(line) && !isCareFrequencyLine(line)),
    (manualMedication || manualSupplement) && templateNotes && !normalizedPlanNotes.has(templateNotes) ? templateNotes : "",
  ].filter(Boolean);

  return (
    <div className="mt-1 space-y-1.5 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {name ? <OpenableText className="font-semibold text-zinc-800" modal={{ title: name, label: "Details", text: [name, giveDetail].filter(Boolean).join("\n") }} onOpen={onOpenText}>{name}</OpenableText> : null}
        {skipped || missed ? <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-200/80">{missed ? "Missed" : "Skipped"}</span> : null}
      </div>
      {giveDetail || timingLine || isLastDose ? (
        <div className="flex flex-wrap items-center gap-2 text-zinc-600">
          {giveDetail ? <OpenableText modal={{ title: name || displayActivityLabel(activity), label: "Details", text: [name, giveDetail].filter(Boolean).join("\n") }} onOpen={onOpenText}>{giveDetail}</OpenableText> : null}
          <div className="inline-flex shrink-0 items-center gap-2">
            {timingLine ? (
              <span className={`rounded-full px-2.5 py-1 text-xs font-normal ${medicationTimingBadgeColorClassName(timingLine)}`}>
                {timingLine}
              </span>
            ) : null}
            {isLastDose ? <span className="rounded-full bg-amber-100/80 px-2.5 py-1 text-xs font-normal text-[#173b63]">Last Dose</span> : null}
          </div>
        </div>
      ) : null}
      {frequencyText ? <p className="text-zinc-500">{frequencyText}</p> : null}
      {planNotes.length ? <ExpandableNoteText className="text-zinc-500">{planNotes.join(" · ")}</ExpandableNoteText> : null}
      {specialNotes.length ? <ExpandableNoteText className="text-zinc-500"><span className="font-medium text-zinc-600">Notes:</span> {specialNotes.join(" · ")}</ExpandableNoteText> : null}
      {showAttachmentFallback && attachmentLine ? <ExpandableNoteText className="text-zinc-500">{attachmentLine}</ExpandableNoteText> : null}
    </div>
  );
}

function ActivityDetailAndNotes({ activity, careTemplates = [], onOpenText }: { activity: ActivityLog; careTemplates?: CareItemTemplate[]; onOpenText?: (modal: TextModal) => void }) {
  const { notesText, attachmentLine } = splitActivityNotes(activity.notes);
  const showAttachmentFallback = !activity.attachments?.length;

  if (["medication", "supplement"].includes(activity.activityType) || isManualMedicationActivity(activity) || isManualSupplementActivity(activity)) {
    return <CareActivityDetail activity={activity} careTemplates={careTemplates} onOpenText={onOpenText} />;
  }

  return (
    <div className="mt-1 space-y-1 text-sm text-zinc-600">
      {activity.detail ? <OpenableText modal={{ title: displayActivityLabel(activity), label: "Details", text: activity.detail }} onOpen={onOpenText}>{activity.detail}</OpenableText> : null}
      {notesText ? <ExpandableNoteText>Notes: {notesText}</ExpandableNoteText> : null}
      {showAttachmentFallback && attachmentLine ? <ExpandableNoteText className="text-zinc-500">{attachmentLine}</ExpandableNoteText> : null}
    </div>
  );
}

async function openActivityAttachment(filePath: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;

  const { data, error } = await supabase.storage
    .from("pet-attachments")
    .createSignedUrl(filePath, 60 * 10);

  if (error || !data?.signedUrl) {
    console.warn("Could not open attachment", error);
    return;
  }

  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}

function ActivityAttachmentLinks({ activity, className }: { activity: ActivityLog; className?: string }) {
  const attachments = activity.attachments ?? [];
  if (!attachments.length) return null;
  const isPoopPhotoRecord = ["pee", "poop", "potty"].includes(activity.activityType);

  return (
    <div className={className ?? `mt-2 flex flex-wrap gap-2 ${isPoopPhotoRecord ? "justify-end" : ""}`}>
      {attachments.map((attachment, index) => (
        <button
          key={attachment.id}
          type="button"
          aria-label={isPoopPhotoRecord ? `Open image${attachments.length > 1 ? ` ${index + 1}` : ""}` : `Open ${attachment.fileName}`}
          title={isPoopPhotoRecord ? `Open image${attachments.length > 1 ? ` ${index + 1}` : ""}` : attachment.fileName}
          onClick={(event) => {
            event.stopPropagation();
            void openActivityAttachment(attachment.filePath);
          }}
          className={`inline-flex max-w-full items-center justify-center text-xs font-semibold ring-1 ${
            isPoopPhotoRecord
              ? "size-8 rounded-lg bg-[#4f2f1b]/95 text-[#f6d978] shadow-sm shadow-[#4f2f1b]/15 ring-1 ring-[#f6d978]/45 transition hover:bg-[#5b3720]"
              : "gap-1.5 rounded-full bg-white/75 px-2.5 py-1 text-sky-700 ring-sky-200"
          }`}
        >
          {isPoopPhotoRecord ? <ImageIcon className="size-3.5 shrink-0" /> : <Paperclip className="size-3.5 shrink-0" />}
          {isPoopPhotoRecord ? null : <span className="min-w-0 truncate">{attachment.fileName}</span>}
        </button>
      ))}
    </div>
  );
}

function PottyActivityMeta({ activity }: { activity: ActivityLog }) {
  const hasAttachments = Boolean(activity.attachments?.length);
  const hasNotes = Boolean(visiblePottyNotes(activity.notes));

  if (!hasAttachments) {
    return hasNotes ? <PottyActivityNotes activity={activity} /> : null;
  }

  if (!hasNotes) {
    return <ActivityAttachmentLinks activity={activity} />;
  }

  return (
    <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
      <PottyActivityNotes activity={activity} className="pt-1 text-sm font-normal leading-5 text-zinc-500" />
      <ActivityAttachmentLinks activity={activity} className="flex flex-wrap justify-end gap-2" />
    </div>
  );
}

function displayActivityLabel(activity: ActivityLog) {
  return eventCardActivityLabel(activity);
}

function customCareDisplayDate(activity: ActivityLog) {
  return new Date(activity.happenedAt);
}

function customCareDisplayTime(activity: ActivityLog) {
  return formatActivityTime(customCareDisplayDate(activity).toISOString());
}

function timelineStatusFor(item: TimelineItem) {
  if (item.status) return item.status;
  if (item.label.toLowerCase().includes("missed")) return "Missed";
  if (item.label.toLowerCase().includes("skipped")) return "Skipped";
  return null;
}

function cleanTimelineDetail(detail: string, status: "Skipped" | "Missed" | null) {
  if (!status) return detail;
  return detail.replace(new RegExp(`\\s*(?:[•·-]\\s*)?${status}\\b`, "i"), "").trim();
}

function TimelineStatusBadge({ status }: { status: "Skipped" | "Missed" | null }) {
  return status ? <span className="shrink-0 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-200/80">{status}</span> : null;
}

function isCareTimingLine(line: string) {
  return line === "With Food" || line === "Empty Stomach";
}

function careTimingBadgeClassName(timingLine: string, activityType?: TimelineItem["activityType"]) {
  void activityType;
  return `rounded-full px-2.5 py-1 text-xs font-normal ${medicationTimingBadgeColorClassName(timingLine)}`;
}

function displayTimelineLine(line: string) {
  return normalizeCareFrequencyLine(line);
}

function TimelineLineContent({ line }: { line: string }) {
  const displayLine = displayTimelineLine(line);
  if (displayLine.startsWith("Medication: ")) {
    return <span className="font-semibold text-zinc-800">{displayLine}</span>;
  }
  if (displayLine.startsWith("Notes: ")) {
    return (
      <>
        <span className="font-medium text-zinc-600">Notes:</span>
        {displayLine.slice("Notes:".length)}
      </>
    );
  }
  if (displayLine.startsWith("Plan Notes: ")) {
    return <>{displayLine.slice("Plan Notes:".length).trim()}</>;
  }
  return <>{displayLine}</>;
}

function TimelineDetailText({ detail, status, className = timelineDetailClassName, title = "Details", onOpenText, showStatusBadge = true }: { detail: string; status: "Skipped" | "Missed" | null; className?: string; title?: string; onOpenText?: (modal: TextModal) => void; showStatusBadge?: boolean }) {
  const cleanDetail = cleanTimelineDetail(detail, status);
  const detailLines = cleanDetail.split("\n").filter(Boolean);
  const timingLines = detailLines.filter(isCareTimingLine);
  const textLines = detailLines.filter((line) => !isCareTimingLine(line));

  return (
    <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${className}`}>
      {textLines.length ? (
        <OpenableText className="min-w-0" modal={{ title, label: "Details", text: cleanDetail }} onOpen={onOpenText}>
          {textLines.map((line, index) => (
            <span key={`${line}-${index}`} className="block leading-6">
              <TimelineLineContent line={line} />
              {line.startsWith("Give ") ? timingLines.map((timingLine) => (
                <span key={timingLine} className={`ml-2 inline-flex align-middle ${careTimingBadgeClassName(timingLine)}`}>
                  {timingLine}
                </span>
              )) : null}
            </span>
          ))}
        </OpenableText>
      ) : null}
      {showStatusBadge ? <TimelineStatusBadge status={status} /> : null}
    </div>
  );
}

function InlineTimelineDetailText({ detail, status, className = timelineDetailClassName, showStatusBadge = true }: { detail: string; status: "Skipped" | "Missed" | null; className?: string; showStatusBadge?: boolean }) {
  const cleanDetail = cleanTimelineDetail(detail, status);
  const detailLines = cleanDetail.split("\n").filter(Boolean);
  const timingLines = detailLines.filter(isCareTimingLine);
  const textLines = detailLines.filter((line) => !isCareTimingLine(line));

  return (
    <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${className}`}>
      {textLines.length ? (
        <ExpandableNoteText collapsedLines={2}>
          {textLines.map((line, index) => (
            <span key={`${line}-${index}`} className="block leading-6">
              <TimelineLineContent line={line} />
              {line.startsWith("Give ") ? timingLines.map((timingLine) => (
                <span key={timingLine} className={`ml-2 inline-flex align-middle ${careTimingBadgeClassName(timingLine)}`}>
                  {timingLine}
                </span>
              )) : null}
            </span>
          ))}
        </ExpandableNoteText>
      ) : null}
      {showStatusBadge ? <TimelineStatusBadge status={status} /> : null}
    </div>
  );
}

function MealLinkedCareRows({ items, onOpenText }: { items?: TimelineItem["mealLinkedCareItems"]; onOpenText?: (modal: TextModal) => void }) {
  if (!items?.length) return null;

  return (
    <div className="mt-2 space-y-2 border-t border-zinc-200/70 pt-2">
      {items.map((item) => {
        const status = timelineStatusFor({ time: "", label: item.label, detail: item.detail });
        const [summary, notes] = item.detail.split(" • Notes: ", 2);
        const markerStyle = getTimelineStyle(item.careItem.kind);
        return (
          <div key={`${item.careItem.kind}-${item.careItem.id}-${item.label}`} className="grid grid-cols-[1.35rem_1fr] gap-2.5">
            <div className="flex w-5 justify-center">
              <TimelineMarker style={markerStyle} />
            </div>
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <OpenableText className={timelineTitleClassName} modal={{ title: item.label, label: "Details", text: [item.label, summary].filter(Boolean).join("\n") }} onOpen={onOpenText}>{item.label}</OpenableText>
                <TimelineStatusBadge status={status} />
              </div>
              {onOpenText ? (
                <TimelineDetailText detail={summary} status={status} className={timelineSecondaryDetailClassName} title={item.label} onOpenText={onOpenText} showStatusBadge={false} />
              ) : (
                <InlineTimelineDetailText detail={summary} status={status} className={timelineSecondaryDetailClassName} showStatusBadge={false} />
              )}
              {notes ? <ExpandableNoteText className={timelineSecondaryDetailClassName}>Notes: {notes}</ExpandableNoteText> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function getActivityStyle(activityType: ActivityLog["activityType"]) {
  switch (activityType) {
    case "potty":
      return {
        icon: null,
        iconText: "\u{1F6BD}",
        card: "bg-[#ead7a8] ring-[#f0d27a]",
        iconWrap: "bg-[rgba(255,255,255,0.55)] text-[#8a6200] ring-1 ring-[rgba(240,210,122,0.6)]",
        dot: "bg-[#d7a900]",
      };
    case "pee":
      return {
        icon: Droplets,
        iconText: null,
        card: "bg-[#ead7a8] ring-amber-200",
        iconWrap: "bg-amber-100 text-amber-600",
        dot: "bg-amber-400",
      };
    case "poop":
      return {
        icon: null,
        iconText: "\u{1F4A9}",
        card: "bg-[#ead7a8] ring-orange-200",
        iconWrap: "bg-orange-100 text-orange-600",
        dot: "bg-orange-800",
      };
    case "activity":
    case "outdoor":
      return {
        icon: null,
        iconText: "\u{1F333}",
        card: "bg-emerald-50/80 ring-emerald-200",
        iconWrap: "bg-emerald-100 text-emerald-600",
        dot: "bg-emerald-400",
      };
    case "care":
      return {
        icon: null,
        iconText: "\u{1F3E0}",
        card: "bg-purple-50/80 ring-purple-200",
        iconWrap: "bg-purple-200 text-purple-800",
        dot: "bg-purple-400",
      };
    case "wellness":
      return {
        icon: null,
        iconText: "\u{1F33F}",
        card: "bg-rose-50/80 ring-rose-200",
        iconWrap: "bg-rose-100 text-rose-600",
        dot: "bg-rose-400",
      };
    case "hike":
      return {
        icon: null,
        iconText: "\u{1F333}",
        card: "bg-emerald-50/80 ring-emerald-200",
        iconWrap: "bg-emerald-100 text-emerald-600",
        dot: "bg-emerald-400",
      };
    case "treat":
      return {
        icon: null,
        iconText: "\u{1F9B4}",
        card: "bg-orange-50/80 ring-orange-200",
        iconWrap: "bg-orange-400 text-white",
        dot: "bg-orange-400",
      };
    case "food":
      return {
        icon: null,
        emojiAsset: "steak" as const,
        iconText: null,
        card: "bg-[#ead8c5]/80 ring-[#caa57f]",
        iconWrap: "bg-[#8a5a35]/75 text-white",
        dot: "bg-amber-900",
      };
    case "supplement":
      return {
        icon: Tablets,
        iconText: null,
        card: "bg-[#eaf0f8]/80 ring-[#b8c9dd]",
        iconWrap: "bg-[#eaf0f8] text-[#1f3d5c] ring-1 ring-[#b8c9dd]",
        dot: "bg-[#eaf0f8] ring-1 ring-[#b8c9dd]",
      };
    case "medication":
      return {
        icon: MedicationPillIcon,
        iconText: null,
        card: "bg-sky-50/80 ring-sky-200",
        iconWrap: "bg-sky-100 text-sky-600 ring-1 ring-sky-200",
        dot: "bg-sky-100",
      };
    case "sick":
      return {
        icon: null,
        emojiAsset: "health" as const,
        iconText: null,
        card: "bg-sky-50/80 ring-sky-200",
        iconWrap: "bg-sky-100 text-sky-600",
        dot: "bg-sky-400",
      };
    case "other":
      return {
        icon: Ellipsis,
        iconText: null,
        card: "bg-zinc-100/90 ring-zinc-200",
        iconWrap: "bg-zinc-200 text-zinc-600",
        dot: "bg-zinc-400",
      };
  }
}

export function getTimelineStyle(activityType?: TimelineItem["activityType"]) {
  switch (activityType) {
    case "potty":
    case "pee":
    case "poop":
      return {
        dot: "bg-[#fff7dc] ring-1 ring-[#f0d27a]/65",
        icon: <span className="text-[0.72rem] leading-none">🚽</span>,
      };
    case "activity":
    case "outdoor":
      return {
        dot: "bg-emerald-100 ring-1 ring-emerald-200",
        icon: <span className="text-[0.72rem] leading-none">🌳</span>,
      };
    case "care":
      return {
        dot: "bg-purple-100 ring-1 ring-purple-200",
        icon: <span className="text-[0.72rem] leading-none">🏠</span>,
      };
    case "wellness":
      return {
        dot: "bg-rose-100 ring-1 ring-rose-200",
        icon: <span className="text-[0.7rem] leading-none">🌿</span>,
      };
    case "hike":
      return {
        dot: "bg-emerald-100 ring-1 ring-emerald-200",
        icon: <span className="text-[0.72rem] leading-none">🌳</span>,
      };
    case "treat":
      return {
        dot: "bg-orange-100 ring-1 ring-orange-200",
        icon: <span className="text-[0.72rem] leading-none">🦴</span>,
      };
    case "food":
      return {
        dot: "bg-[#8a5a35]/75 ring-1 ring-[#8a5a35]/75",
        icon: <EmojiAsset name="steak" label="Food" className="size-4" />,
      };
    case "supplement":
      return {
        dot: "bg-[#eaf0f8] ring-1 ring-[#b8c9dd]",
        icon: <Tablets className="size-3.5 text-[#1f3d5c]" />,
      };
    case "medication":
      return {
        dot: "bg-sky-100 ring-1 ring-sky-200",
        icon: <MedicationPillIcon className="size-3.5 text-sky-600" />,
      };
    case "sick":
      return {
        dot: "bg-sky-100 ring-1 ring-sky-200",
        icon: <EmojiAsset name="health" label="Health" className="size-4" />,
      };
    case "other":
      return {
        dot: "bg-zinc-200 ring-1 ring-zinc-300",
        icon: <Ellipsis className="size-3.5 text-zinc-600" />,
      };
    case "meal":
      return {
        dot: "bg-[#8a5a35]/75 ring-1 ring-[#8a5a35]/75",
        icon: <EmojiAsset name="steak" label="Meal" className="size-4" />,
      };
    case "manual":
      return {
        dot: "bg-[#fff0f1] ring-1 ring-[#e6c8ce]/80",
        icon: <TriangleAlert className="size-3.5 text-[#8f1739]" strokeWidth={2.25} />,
      };
    default:
      return {
        dot: "bg-zinc-200 ring-1 ring-zinc-300",
        icon: <Ellipsis className="size-3.5 text-zinc-600" />,
      };
  }
}

function timelineMarkerActivityType(item: TimelineItem) {
  if (!item.activity) return item.activityType;
  if (item.activity.detail === "Hike") return "hike";
  if (["pee", "poop"].includes(item.activity.activityType)) return "potty";
  return eventCardActivityType(item.activity);
}

function timelineDisplayLabel(item: TimelineItem) {
  if (!item.activity) return item.label;
  return eventCardActivityLabel(item.activity);
}

function ActivityStyleIcon({ style }: { style: ReturnType<typeof getActivityStyle> }) {
  const Icon = style.icon;

  if (Icon) return <Icon className="size-4.5" />;
  if ("emojiAsset" in style && style.emojiAsset) return <EmojiAsset name={style.emojiAsset} label="Activity" className="size-5" />;

  return <span className="text-lg leading-none">{style.iconText}</span>;
}

export function TimelineMarker({ style }: { style: ReturnType<typeof getTimelineStyle> }) {
  return (
    <div className={`flex size-5 shrink-0 items-center justify-center rounded-full ${style.dot}`}>
      {style.icon}
    </div>
  );
}

export function ActivityFeed({
  activityLogs,
  timelineItems,
  title = "Event Feed",
  subtitle = "",
  grouped = false,
  notebookOwnerId,
  onSelectActivity,
  renderInlineEditor,
  careTemplates = [],
  emptyMessage = "No events logged yet.",
}: Props) {
  const [textModal, setTextModal] = useState<TextModal | null>(null);
  const visibleActivityLogs = activityLogs.filter((activity) => isVisibleActivity(activity, careTemplates));
  const visibleTimelineItems = timelineItems?.filter((item) => !item.activity || isVisibleActivity(item.activity, careTemplates));
  const timelineInitialsName = (activity?: ActivityLog) => {
    const auditInfo = activity?.auditInfo;
    const modifierUserId = auditInfo?.lastEditedByUserId ?? auditInfo?.loggedByUserId;
    if (!modifierUserId || !notebookOwnerId || modifierUserId === notebookOwnerId) return null;
    return auditInfo?.lastEditedByUserId ? auditInfo.lastEditedBy : auditInfo?.loggedBy ?? null;
  };

  if (grouped) {
    const groupedLogs = groupActivitiesByDay(visibleActivityLogs);
    const dayEntries = Object.entries(groupedLogs).sort((a, b) => a[0].localeCompare(b[0]));

    if (visibleTimelineItems) {
      return (
        <section className="mb-4 rounded-3xl bg-[var(--hewie-active-bg)] p-5 shadow-sm ring-1 ring-[var(--hewie-ring)]">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-[var(--hewie-active-text)]">{title}</h2>
            {subtitle ? <p className="text-sm text-[var(--hewie-active-text)]/65">{subtitle}</p> : null}
          </div>
          <div className="space-y-3">
            {visibleTimelineItems.length === 0 ? (
              <p className="text-sm text-[var(--hewie-active-text)]/65">{emptyMessage}</p>
            ) : (
              visibleTimelineItems.map((item, index) => {
                if (item.activity) {
                  const activity = item.activity;
                  const displayType = activity.detail === "Hike" ? "hike" : (["pee", "poop"].includes(activity.activityType) ? "potty" : eventCardActivityType(activity));
                  const style = getActivityStyle(displayType);
                  const inlineEditor = renderInlineEditor ? renderInlineEditor(activity) : null;
                  const isPottyActivity = ["pee", "poop", "potty"].includes(activity.activityType) && pottyDetailForBadge(activity);
                  const pottyAttachmentActivity = isPottyActivity && activity.attachments?.length ? activity : null;

                  if (pottyAttachmentActivity) {
                    return (
                      <div key={activity.id} className={`rounded-2xl p-4 ring-1 ${style.card}`}>
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                          <button className="min-w-0 flex-1 text-left" onClick={() => onSelectActivity?.(activity)}>
                            <div className="flex items-center gap-3">
                              <span className={`flex size-9 items-center justify-center rounded-full ${style.iconWrap}`}>
                                <ActivityStyleIcon style={style} />
                              </span>
                              <p className="font-medium text-zinc-900">{displayActivityLabel(activity)}</p>
                            </div>
                            <PottyDetailBadges detail={pottyDetailForBadge(activity)} />
                          </button>
                          <div className="shrink-0 text-right">
                            <p className={timelineTimeBadgeClassName}>{customCareDisplayTime(activity)}</p>
                            <ActivityAttachmentLinks activity={pottyAttachmentActivity} className="mt-2 flex flex-wrap justify-end gap-2" />
                          </div>
                        </div>
                        <PottyActivityNotes activity={activity} />
                        {inlineEditor ? <div className="mt-3">{inlineEditor}</div> : null}
                      </div>
                    );
                  }

                  return (
                    <div key={activity.id} className={`rounded-2xl p-4 ring-1 ${style.card}`}>
                      <button className="block w-full text-left" onClick={() => onSelectActivity?.(activity)}>
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <span className={`flex size-9 items-center justify-center rounded-full ${style.iconWrap}`}>
                              <ActivityStyleIcon style={style} />
                            </span>
                            <p className="min-w-0 font-medium text-zinc-900">{displayActivityLabel(activity)}</p>
                          </div>
                          <p className={timelineTimeBadgeClassName}>{customCareDisplayTime(activity)}</p>
                        </div>
                        {isPottyActivity ? (
                          <PottyDetailBadges detail={pottyDetailForBadge(activity)} />
                        ) : activity.activityType === "treat" ? (
                          <TreatDetail activity={activity} />
                        ) : (
                          <ActivityDetailAndNotes activity={activity} careTemplates={careTemplates} onOpenText={setTextModal} />
                        )}
                      </button>
                      {isPottyActivity ? (pottyAttachmentActivity ? <PottyActivityNotes activity={activity} /> : <PottyActivityMeta activity={activity} />) : <ActivityAttachmentLinks activity={activity} />}
                      {inlineEditor ? <div className="mt-3">{inlineEditor}</div> : null}
                    </div>
                  );
                }

                const status = timelineStatusFor(item);
                const style = getTimelineStyle(item.activityType);
                return (
                    <div key={`${item.activityType ?? "item"}-${item.time}-${item.label}-${item.detail}-${index}`} className="rounded-2xl bg-zinc-50/75 p-2.5 ring-1 ring-zinc-200/70">
                      <div className="grid grid-cols-[1.35rem_minmax(0,1fr)_auto] gap-x-2.5 gap-y-2">
                        <TimelineMarker style={style} />
                        <div className="flex min-w-0 flex-wrap items-center gap-2 self-center">
                          <p className="min-w-0 text-sm font-semibold text-zinc-900">{item.label}</p>
                          <TimelineStatusBadge status={status} />
                        </div>
                        <p className={`self-center justify-self-end ${timelineTimeBadgeClassName}`}>{item.time}</p>
                        <div className="col-span-2 col-start-2 min-w-0">
                          {item.detail.includes(" • Notes: ") ? (
                            <>
                              <InlineTimelineDetailText detail={item.detail.split(" • Notes: ")[0]} status={status} showStatusBadge={false} />
                              <ExpandableNoteText className="mt-1 text-sm text-zinc-500">Notes: {item.detail.split(" • Notes: ")[1]}</ExpandableNoteText>
                            </>
                          ) : (
                            <InlineTimelineDetailText detail={item.detail} status={status} showStatusBadge={false} />
                          )}
                        </div>
                      </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      );
    }

    return (
      <section className="mb-4 rounded-3xl bg-[var(--hewie-active-bg)] p-5 shadow-sm ring-1 ring-[var(--hewie-ring)]">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-[var(--hewie-active-text)]">{title}</h2>
          {subtitle ? <p className="text-sm text-[var(--hewie-active-text)]/65">{subtitle}</p> : null}
        </div>
        <div className="space-y-5">
          {dayEntries.length === 0 ? (
            <p className="text-sm text-[var(--hewie-active-text)]/65">{emptyMessage}</p>
          ) : (
            dayEntries.map(([day, logs]) => (
              <div key={day} className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--hewie-active-text)]/55">{day}</p>
                {[...logs].sort(compareActivitiesChronological).map((activity) => {
                  const displayType = activity.detail === "Hike" ? "hike" : (["pee", "poop"].includes(activity.activityType) ? "potty" : eventCardActivityType(activity));
                  const style = getActivityStyle(displayType);
                  const inlineEditor = renderInlineEditor ? renderInlineEditor(activity) : null;

                  return (
                    <div key={activity.id} className={`rounded-2xl p-4 ring-1 ${style.card}`}>
                      <button
                        className="block w-full text-left"
                        onClick={() => onSelectActivity?.(activity)}
                      >
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <span className={`flex size-9 items-center justify-center rounded-full ${style.iconWrap}`}>
                              <ActivityStyleIcon style={style} />
                            </span>
                            <p className="min-w-0 font-medium text-zinc-900">{displayActivityLabel(activity)}</p>
                          </div>
                          <p className={timelineTimeBadgeClassName}>{customCareDisplayTime(activity)}</p>
                        </div>
                        {["pee", "poop", "potty"].includes(activity.activityType) && pottyDetailForBadge(activity) ? (
                          <PottyDetailBadges detail={pottyDetailForBadge(activity)} />
                        ) : activity.activityType === "treat" ? (
                          <TreatDetail activity={activity} />
                        ) : (
                          <ActivityDetailAndNotes activity={activity} careTemplates={careTemplates} onOpenText={setTextModal} />
                        )}
                      </button>
                      {["pee", "poop", "potty"].includes(activity.activityType) && pottyDetailForBadge(activity) ? <PottyActivityMeta activity={activity} /> : <ActivityAttachmentLinks activity={activity} />}
                      {inlineEditor ? <div className="mt-3">{inlineEditor}</div> : null}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </section>
    );
  }

  const renderTimelineRow = (item: TimelineItem, key: string) => {
    const style = getTimelineStyle(timelineMarkerActivityType(item));
    const treatParts = item.activityType === "treat" ? splitTreatDetailText(item.detail) : null;
    const careActivity = item.activity && (["medication", "supplement"].includes(item.activityType ?? "") || isManualMedicationActivity(item.activity) || isManualSupplementActivity(item.activity)) ? item.activity : null;
    const inlineEditor = item.activity && renderInlineEditor ? renderInlineEditor(item.activity) : null;
    const pottyNotesActivity = item.activity && ["pee", "poop", "potty"].includes(item.activity.activityType) && pottyDetailForBadge(item.activity) ? item.activity : null;
    const pottyAttachmentActivity = pottyNotesActivity?.attachments?.length ? pottyNotesActivity : null;
    const [detailSummary, detailNotes] = item.detail.split(" • Notes: ", 2);
    const status = timelineStatusFor(item);
    const showRightPhotoControls = Boolean(pottyAttachmentActivity);
    const loggedBy = timelineInitialsName(item.activity);
    const content = (
      <>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <p className={timelineTitleClassName}>{timelineDisplayLabel(item)}</p>
            <TimelineStatusBadge status={status} />
          </div>
          {!showRightPhotoControls ? (
            <div className="flex shrink-0 items-center gap-1.5">
              <InitialsBadge name={loggedBy} />
              <span className={timelineTimeBadgeClassName}>
                {item.time}
              </span>
            </div>
          ) : null}
        </div>
        {item.careItem ? (
          <CareTemplateTimelineDetail item={item.careItem} detail={item.detail} skipped={status === "Skipped"} />
        ) : careActivity ? (
          <CareActivityDetail activity={careActivity} careTemplates={careTemplates} />
        ) : treatParts ? (
          <>
            {treatParts.summary ? <p className={timelineSecondaryDetailClassName}>{treatParts.summary}</p> : null}
            {treatParts.notes ? <ExpandableNoteText className={timelineSecondaryDetailClassName}>Notes: {treatParts.notes}</ExpandableNoteText> : null}
          </>
        ) : item.detail.includes(" • Notes: ") ? (
          <>
            <InlineTimelineDetailText detail={detailSummary} status={status} className={timelineSecondaryDetailClassName} showStatusBadge={false} />
            {!pottyNotesActivity && detailNotes ? <ExpandableNoteText className={timelineSecondaryDetailClassName}>Notes: {detailNotes}</ExpandableNoteText> : null}
          </>
        ) : (
          <InlineTimelineDetailText detail={item.detail} status={status} showStatusBadge={false} />
        )}
      </>
    );

    return (
      <div key={key} className="rounded-2xl bg-zinc-50/75 p-2.5 ring-1 ring-zinc-200/70">
        <div className={`grid gap-2.5 ${showRightPhotoControls ? "grid-cols-[1.35rem_minmax(0,1fr)_auto]" : "grid-cols-[1.35rem_1fr]"}`}>
          <div className="flex w-5 justify-center">
            <TimelineMarker style={style} />
          </div>
          <div className="min-w-0">
            {item.activity && onSelectActivity ? (
              <button type="button" className="block w-full text-left" onClick={() => onSelectActivity(item.activity as ActivityLog)}>
                {content}
              </button>
            ) : content}
            {pottyNotesActivity ? (
              pottyAttachmentActivity ? <PottyActivityNotes activity={pottyNotesActivity} /> : <PottyActivityMeta activity={pottyNotesActivity} />
            ) : item.activity ? <ActivityAttachmentLinks activity={item.activity} /> : null}
            {inlineEditor ? <div className="mt-3">{inlineEditor}</div> : null}
          </div>
          {pottyAttachmentActivity ? (
            <div className="flex shrink-0 flex-col items-end gap-2">
              <div className="flex items-center gap-1.5">
                <InitialsBadge name={loggedBy} />
                <span className={timelineTimeBadgeClassName}>
                  {item.time}
                </span>
              </div>
              <ActivityAttachmentLinks activity={pottyAttachmentActivity} className="flex flex-wrap justify-end gap-2" />
            </div>
          ) : null}
        </div>
        <MealLinkedCareRows items={item.mealLinkedCareItems} />
      </div>
    );
  };

  return (
    <>
    <section className="mb-4 rounded-3xl bg-white/90 p-5 shadow-sm ring-1 ring-zinc-200/80">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-zinc-800">{title}</h2>
        {subtitle ? <p className="text-sm text-zinc-500">{subtitle}</p> : null}
      </div>
      <div className="space-y-2">
        {visibleTimelineItems?.length ? (
          visibleTimelineItems.map((item, index) => renderTimelineRow(item, `${item.activityType ?? "item"}-${item.time}-${item.label}-${item.detail}-${index}`))
        ) : (
          <p className="text-sm text-zinc-500">{emptyMessage}</p>
        )}
      </div>
    </section>
    {textModal ? (
      <div className="fixed inset-0 z-50 flex items-end bg-black/35 p-3 backdrop-blur-[2px] sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-labelledby="timeline-text-title">
        <button type="button" aria-label="Close details" className="absolute inset-0 cursor-default" onClick={() => setTextModal(null)} />
        <div className="relative w-full max-w-md rounded-3xl bg-white p-4 text-zinc-800 shadow-2xl ring-1 ring-zinc-200">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p id="timeline-text-title" className="truncate text-base font-semibold">{textModal.title}</p>
              {textModal.subtitle ? <p className="mt-0.5 text-sm text-zinc-500">{textModal.subtitle}</p> : null}
            </div>
            <button type="button" aria-label="Close details" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-zinc-50 text-lg leading-none text-zinc-500 ring-1 ring-zinc-200" onClick={() => setTextModal(null)}>
              ×
            </button>
          </div>
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-zinc-500">{textModal.label ?? "Details"}</div>
          <div className="max-h-[45vh] overflow-y-auto whitespace-pre-wrap break-words rounded-2xl bg-zinc-50 p-3 text-sm leading-6 ring-1 ring-zinc-200">
            {textModal.text}
          </div>
        </div>
      </div>
    ) : null}
    </>
  );
}
