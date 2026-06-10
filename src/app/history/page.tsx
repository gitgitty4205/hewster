"use client";



import { Check, ChevronLeft, ChevronRight, Droplets, Ellipsis, ImageIcon, Lock, LockOpen, Paperclip, SlidersHorizontal, Tablets, TriangleAlert } from "lucide-react";

import { PetAvatarMenu } from "@/components/pet-avatar-menu";
import { MedicationPillIcon } from "@/components/medication-pill-icon";
import { ExpandableNoteText } from "@/components/expandable-note-text";

import { useEffect, useMemo, useState } from "react";



import { BottomNav } from "@/components/bottom-nav";
import { useAuth } from "@/components/auth-provider";

import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {

  type ActivityLog,
  type ActivityAttachment,
  type DailyMealState,

  type ManualAlert,

  type MealLog,

  type WeightLog,

  currentTodayKey,
  loadActivityAuditInfoForReport,
  loadMealAuditInfoForReport,

  loadAppState,
  loadFreshAppState,

} from "@/lib/hewster-data";

import { compareActivitiesChronological, formatActivityLabel, formatActivityTime, renderActivityDetail, splitTreatDetailText } from "@/lib/activity";
import { careItemsForMeal, loadCareTemplates, loadCurrentCareTemplatesFromSupabase, mealPlanDoseNumberForMeal, mealPlanTotalDoseCount, type CareItemKind, type CareItemTemplate } from "@/lib/care-settings";

import type { MealTemplate } from "@/lib/meal-templates";
import { PetNotebookTitle } from "@/components/pet-notebook-title";
import { getSupabaseBrowserClient, getSupabaseCurrentSession, isSupabaseConfigured } from "@/lib/supabase";
import { canExportNotebook, resolveActiveNotebookAccess, type NotebookAccessRole } from "@/lib/notebook-access";
import { displayPetAge, loadPetProfile, type PetProfile } from "@/lib/pet-profile";
import { formatManualAlertTimelineDetail } from "@/lib/alerts";
import { FREE_HISTORY_MONTHS, loadStoredSubscriptionPlan, type SubscriptionPlanId } from "@/lib/subscription-plan";



type HistoryDay = {

  day: string;

  meals: Array<{

    id: number;

    name: string;

    food: string;

    notes: string;

    fedNotes: string | null;

    careItems: Array<CareItemTemplate & { skipped: boolean }>;

    actualTime: string;

    plannedTime: string;

    auditInfo?: MealLog["auditInfo"];

    createdAt?: string;

    sortOrder: number;

  }>;

  activities: ActivityLog[];

  weights: WeightLog[];

  timelineItems: Array<{

    key: string;

    time: string;

    label: string;

    detail: string;

    activity?: ActivityLog;
    auditInfo?: MealLog["auditInfo"] | ActivityLog["auditInfo"];

    activityType: ActivityLog["activityType"] | "meal" | "manual";

    mealGroupId?: string;

    sortMinutes: number;

    sortCreatedAt?: string;

    sortOrder: number;

    sortKey: string;

  }>;

};

type HistoryTimelineItem = HistoryDay["timelineItems"][number];

type HistoryTimelineEntry =
  | { type: "item"; item: HistoryTimelineItem }
  | { type: "group"; id: string; items: HistoryTimelineItem[] };



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



function formatDayLabel(dayKey: string) {

  return new Intl.DateTimeFormat("en-US", {

    weekday: "short",

    month: "short",

    day: "numeric",

    year: "numeric",

  }).format(new Date(`${dayKey}T00:00:00`));

}



function historyDayKeyFromDate(date: Date) {

  return new Intl.DateTimeFormat("en-CA", {

    year: "numeric",

    month: "2-digit",

    day: "2-digit",

  }).format(date);

}

function freeHistoryCutoffDayKey() {
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setMonth(cutoff.getMonth() - FREE_HISTORY_MONTHS);
  return historyDayKeyFromDate(cutoff);
}



function parseClockMinutes(value: string) {

  const normalized = value.trim().replace(/\s+/g, " ").toUpperCase();

  const parts = normalized.match(/^(\d{1,2})(?::(\d{2}))?\s?(AM|PM)$/i);

  if (!parts) return Number.MAX_SAFE_INTEGER;



  let hours = Number(parts[1]);

  const minutes = Number(parts[2] ?? "0");

  const meridiem = parts[3].toUpperCase();



  if (meridiem === "PM" && hours !== 12) hours += 12;

  if (meridiem === "AM" && hours === 12) hours = 0;



  return hours * 60 + minutes;

}



function inferMealHistoryDate(actualTime: string) {

  const totalMinutes = parseClockMinutes(actualTime);

  const now = new Date();



  if (!Number.isFinite(totalMinutes) || totalMinutes === Number.MAX_SAFE_INTEGER) {

    return historyDayKeyFromDate(now);

  }



  const candidate = new Date();

  candidate.setHours(Math.floor(totalMinutes / 60), totalMinutes % 60, 0, 0);



  return historyDayKeyFromDate(candidate);

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

function careTemplateGiveText(item: CareItemTemplate | null) {
  if (!item) return null;
  const route = medicationTypeLabel(item);
  return `Give ${item.dose || "as directed"}${route ? ` (${route})` : ""}`;
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

function mealPlanTimelineCareDetailText(item: CareItemTemplate & { skipped?: boolean }) {
  const route = medicationTypeLabel(item);
  const routeText = route ? ` (${route})` : "";
  if (!item.dose) return `${item.name}${routeText}`;
  return `${item.name}${item.skipped ? ` - ${item.dose}` : ` — ${item.dose}`}${routeText}`;
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

function formatProfileDate(value: string) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function formatProfileValue(value: string) {
  return value ? value : "Not listed";
}

function normalizeReportName(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function displayPetName(profile: PetProfile) {
  return normalizeReportName(profile.petName || [profile.petFirstName, profile.petLastName].filter(Boolean).join(" ")) || "Pet";
}

function compareMaybeCreatedAt(a?: string, b?: string) {
  return a && b ? a.localeCompare(b) : 0;
}

function formatReportDateTime(value: string | null | undefined) {
  if (!value) return "Not recorded";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function timelineClockMinutes(item: HistoryDay["timelineItems"][number]) {
  const displayMinutes = parseClockMinutes(item.time);
  return displayMinutes === Number.MAX_SAFE_INTEGER ? item.sortMinutes : displayMinutes;
}

function timelineTypeRank(item: HistoryDay["timelineItems"][number]) {
  if (item.activityType === "meal") return 0;
  if (item.mealGroupId) return 1;
  return 2;
}

function customCareDisplayDate(activity: ActivityLog) {
  return new Date(activity.happenedAt);
}

function normalizedCareName(value: string | null) {
  return (value ?? "")
    .replace(/\s*(?:[•·-]\s*)?(?:Given|Skipped|Missed)\b/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function matchingCareTemplate(activity: ActivityLog, careTemplates: CareItemTemplate[] = []) {
  if (!["medication", "supplement"].includes(activity.activityType)) return null;
  const detailName = normalizedCareName(activity.detail);

  return careTemplates.find((item) => {
    if (item.kind !== activity.activityType) return false;
    if (activity.id.includes(`${item.kind}-${item.id}-`)) return true;
    const itemName = item.name.trim().toLowerCase();
    if (!itemName || !detailName) return false;
    return detailName === itemName || detailName.startsWith(`${itemName} `) || detailName.startsWith(`${itemName} •`) || detailName.startsWith(`${itemName} -`) || detailName.includes(itemName);
  }) ?? null;
}

function isVisibleActivity(activity: ActivityLog, careTemplates: CareItemTemplate[]) {
  void activity;
  void careTemplates;
  return true;
}

function compareHistoryMeals(a: HistoryDay["meals"][number], b: HistoryDay["meals"][number]) {
  return (
    parseClockMinutes(a.plannedTime || a.actualTime) - parseClockMinutes(b.plannedTime || b.actualTime) ||
    compareMaybeCreatedAt(a.createdAt, b.createdAt) ||
    a.sortOrder - b.sortOrder ||
    a.id - b.id
  );
}

function MealHistoryTime({ meal }: { meal: HistoryDay["meals"][number] }) {
  return <p className="shrink-0 text-sm text-zinc-500">{meal.actualTime}</p>;
}

function MealHistoryPlannedTime({ meal }: { meal: HistoryDay["meals"][number] }) {
  const showPlannedTime = Boolean(meal.plannedTime);

  if (!showPlannedTime) {
    return null;
  }

  return <p className="mt-1 text-xs font-medium text-[#6b3f22]/60">Planned {meal.plannedTime}</p>;
}

function compareHistoryTimelineItems(a: HistoryDay["timelineItems"][number], b: HistoryDay["timelineItems"][number]) {
  return (
    timelineClockMinutes(a) - timelineClockMinutes(b) ||
    timelineTypeRank(a) - timelineTypeRank(b) ||
    a.sortOrder - b.sortOrder ||
    compareMaybeCreatedAt(a.sortCreatedAt, b.sortCreatedAt) ||
    a.sortKey.localeCompare(b.sortKey)
  );
}

function groupHistoryMealTimelineItems(items: HistoryTimelineItem[]): HistoryTimelineEntry[] {
  const entries: HistoryTimelineEntry[] = [];
  let activeGroup: { id: string; items: HistoryTimelineItem[] } | null = null;
  const flushGroup = () => {
    if (!activeGroup) return;
    entries.push(activeGroup.items.length > 1 ? { type: "group", id: activeGroup.id, items: activeGroup.items } : { type: "item", item: activeGroup.items[0] });
    activeGroup = null;
  };

  for (const item of items) {
    if (!item.mealGroupId) {
      flushGroup();
      entries.push({ type: "item", item });
      continue;
    }

    if (activeGroup && activeGroup.id !== item.mealGroupId) {
      flushGroup();
    }

    activeGroup ??= { id: item.mealGroupId, items: [] };
    activeGroup.items.push(item);
  }

  flushGroup();

  return entries;
}

function filterHistoryDays(historyDays: HistoryDay[], filter: HistoryFilter, startDate: string, endDate: string) {
  return historyDays
    .filter((day) => (!startDate || day.day >= startDate) && (!endDate || day.day <= endDate))
    .map((day) => {
      if (filter === "all") return day;

      const meals = filter === "allFood" ? day.meals : [];
      const activities = day.activities.filter((activity) => activityMatchesHistoryFilter(activity, filter));
      const weights: WeightLog[] = [];
      const timelineItems = day.timelineItems.filter((item) => timelineItemMatchesHistoryFilter(item, filter));

      return { ...day, meals, activities, weights, timelineItems };
    })
    .filter((day) => day.meals.length || day.activities.length || day.weights.length || day.timelineItems.length);
}

function reportActivityIds(days: HistoryDay[]) {
  return days.flatMap((day) => day.activities.map((activity) => activity.id));
}

function reportMealLogIds(days: HistoryDay[]) {
  return days.flatMap((day) => day.meals.map((meal) => `${day.day}-${meal.id}`));
}

type ReportImage = Pick<ActivityAttachment, "id" | "activityId" | "fileName" | "filePath" | "contentType">;

function isReportImageActivity(activity: ActivityLog) {
  return ["pee", "poop", "potty"].includes(activity.activityType) && Boolean(activity.attachments?.length);
}

function reportImagesForDays(days: HistoryDay[]) {
  const imagesById = new Map<string, ReportImage>();

  days.forEach((day) => {
    day.activities.forEach((activity) => {
      if (!isReportImageActivity(activity)) return;

      activity.attachments?.forEach((attachment) => {
        imagesById.set(attachment.id, {
          id: attachment.id,
          activityId: attachment.activityId,
          fileName: attachment.fileName,
          filePath: attachment.filePath,
          contentType: attachment.contentType,
        });
      });
    });
  });

  return [...imagesById.values()];
}

function withReportActivityAuditInfo(days: HistoryDay[], auditInfoById: Map<string, ActivityLog["auditInfo"]>) {
  if (!auditInfoById.size) return days;

  return days.map((day) => ({
    ...day,
    activities: day.activities.map((activity) =>
      auditInfoById.has(activity.id) ? { ...activity, auditInfo: auditInfoById.get(activity.id) } : activity
    ),
    timelineItems: day.timelineItems.map((item) => {
      if (!item.activity || !auditInfoById.has(item.activity.id)) return item;
      return {
        ...item,
        activity: {
          ...item.activity,
          auditInfo: auditInfoById.get(item.activity.id),
        },
      };
    }),
  }));
}

function CareItemHistoryLine({ item }: { item: CareItemTemplate & { skipped: boolean; isLastDose?: boolean } }) {
  const iconClassName = item.skipped
    ? "bg-rose-50 text-rose-600 ring-rose-200"
    : item.kind === "supplement"
      ? "bg-[#eaf0f8] text-[#1f3d5c] ring-[#b8c9dd]"
      : "bg-sky-100 text-sky-600 ring-sky-200";
  const textClassName = item.skipped ? "text-rose-800" : "text-[#4f2f1b]";
  const timingLabel = mealPlanCareTimingLabel(item);

  return (
    <div className={`flex items-start gap-2 text-sm leading-5 ${item.skipped ? "rounded-2xl bg-rose-50/70 px-2 py-1.5 text-rose-700 ring-1 ring-rose-200/70" : "text-[#6b3f22]/70"}`}>
      <span className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ring-1 ${iconClassName}`}>
        {item.kind === "supplement" ? <Tablets className="size-3.5" /> : <MedicationPillIcon className="size-3.5" />}
      </span>
      <div className="min-w-0 flex-1">
        <p>
          <span className={`font-semibold ${textClassName}`}>{careKindLabel(item.kind)}:</span>{" "}
          <span className={`font-semibold ${textClassName}`}>{item.name}</span>
          <span className={`font-normal ${textClassName}`}>{mealPlanCareDetailText(item)}</span>
          {timingLabel ? <span className="ml-2 inline-flex rounded-full bg-sky-100/80 px-2 py-0.5 text-xs font-normal text-sky-700/60">{timingLabel}</span> : null}
          {item.isLastDose ? <span className="ml-2 inline-flex rounded-full bg-amber-100/80 px-2 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-200/70">Last Dose</span> : null}
          {item.skipped ? <span className="ml-2 inline-flex rounded-full bg-white/70 px-2 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-200/80">Skipped</span> : null}
        </p>
        {!item.skipped && item.notes ? <ExpandableNoteText className="mt-0.5 text-[#6b3f22]/62">Notes: {item.notes}</ExpandableNoteText> : null}
      </div>
    </div>
  );
}

function timelineStatusFor(item: HistoryDay["timelineItems"][number]) {
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

function TimelineDetailText({ detail, status, className = "mt-1 text-sm text-zinc-500" }: { detail: string; status: "Skipped" | "Missed" | null; className?: string }) {
  const cleanDetail = displayMedicalDetail(cleanTimelineDetail(detail, status)) ?? "";

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {cleanDetail ? <span>{cleanDetail}</span> : null}
      <TimelineStatusBadge status={status} />
    </div>
  );
}

function poopBadgeClasses(detail: string | null) {

  const normalized = detail?.trim().toLowerCase() ?? "";



  switch (normalized) {

    case "no poop":

      return "bg-zinc-200 text-zinc-900 ring-1 ring-zinc-600";

    case "type 1: very firm, small pieces":

    case "type 2: firm, slightly uneven log":

      return "bg-stone-100/80 text-stone-800 ring-1 ring-stone-200/80";

    case "type 3: formed log with light cracks":

      return "bg-orange-200 text-orange-950 ring-1 ring-orange-400/80";

    case "type 4: smooth, well-formed log":

      return "bg-amber-200 text-amber-950 ring-1 ring-amber-400/80";

    case "type 5: soft, formed pieces":

      return "bg-orange-300 text-orange-950 ring-1 ring-orange-500/70";

    case "type 6: very soft, loose pieces":

      return "bg-rose-200 text-rose-950 ring-1 ring-rose-400/80";

    case "type 7: fully liquid":

      return "bg-rose-300 text-rose-950 ring-1 ring-rose-500/70";

    default:

      return "bg-orange-200 text-orange-950 ring-1 ring-orange-400/80";

  }

}



function isPeeDetail(detail: string | null) {

  const normalized = detail?.trim().toLowerCase() ?? "";

  return normalized === "pee";

}



function isPeeAndPoopDetail(detail: string | null) {

  const normalized = detail?.trim().toLowerCase() ?? "";

  return normalized === "pee & poop";

}



function pottyBadgeClasses(detail: string | null) {

  if (isPeeDetail(detail)) {

    return "inline-flex h-7 items-center rounded-full bg-[#fff7dc]/90 px-3 text-xs font-bold leading-none text-[#6f5200] ring-1 ring-[#f0d27a]/65";

  }



  if (isPeeAndPoopDetail(detail)) {

    return "inline-flex h-7 items-center rounded-full bg-gradient-to-r from-[#fff7dc]/90 to-orange-50/80 px-3 text-xs font-bold leading-none text-orange-900 ring-1 ring-orange-200/70";

  }



  return `inline-flex h-7 items-center rounded-full px-3 text-xs font-bold leading-none ${poopBadgeClasses(detail)}`;

}



function parsePottyDetail(detail: string | null) {

  const rawDetail = detail ?? "";

  const pottyEvents = ["Pee", "Poop", "Pee & Poop", "No Poop"];

  const event = pottyEvents.find((part) => rawDetail === part) ??

    [...pottyEvents].sort((a, b) => b.length - a.length).find((part) => rawDetail.startsWith(`${part} `)) ??

    null;

  const bristol = rawDetail.match(/Type \d: [^•]+/)?.[0]?.trim() ?? (rawDetail.startsWith("Type ") ? rawDetail : null);

  const [bristolType, bristolDescription] = bristol?.split(": ") ?? [];



  return { event, bristol, bristolType, bristolDescription };

}



function PeeSplash() {

  return <span className="mr-1 text-sm leading-none">{"\u{1F4A6}"}</span>;

}



function PottyDetailBadges({ detail, notes, inset = true }: { detail: string | null; notes: string | null; inset?: boolean }) {

  const { event, bristol, bristolType, bristolDescription } = parsePottyDetail(detail);

  const showPee = event === "Pee" || event === "Pee & Poop";

  const showPoop = event === "Poop" || event === "Pee & Poop" || Boolean(bristol);

  const showNoPoop = event === "No Poop";

  const showGenericPotty = Boolean(detail) && !showPee && !showPoop && !showNoPoop;



  return (

    <div className={`${inset ? "mt-2" : ""} space-y-1.5`}>

      <div className="flex flex-wrap items-center gap-2">

        {showPee ? (

          <span className={pottyBadgeClasses("Pee")}>

            <PeeSplash />

            Pee

          </span>

        ) : null}

        {showPoop ? (

          <span className="inline-flex min-w-0 flex-nowrap items-center gap-1.5">

            <span className={`${pottyBadgeClasses(bristol ?? "Poop")} shrink-0 whitespace-nowrap`}>

              <span className="mr-1">{"\u{1F4A9}"}</span>

              {bristolType ?? "Poop"}

            </span>

            {bristolDescription ? <span className="min-w-0 whitespace-nowrap text-xs font-medium leading-5 text-zinc-600">{bristolDescription}</span> : null}

          </span>

        ) : null}

        {showNoPoop ? <span className={pottyBadgeClasses("No Poop")}>No Poop</span> : null}

        {showGenericPotty ? <span className={pottyBadgeClasses("Pee")}>Potty Break</span> : null}

      </div>

      {notes ? <ExpandableNoteText className="text-sm text-zinc-600">{notes}</ExpandableNoteText> : null}

    </div>

  );

}



function displayActivityLabel(activity: ActivityLog) {

  return ["pee", "poop", "potty"].includes(activity.activityType) ? "Potty" : formatActivityLabel(activity.activityType);

}

function withReportMealAuditInfo(days: HistoryDay[], auditInfoById: Map<string, MealLog["auditInfo"]>) {
  if (!auditInfoById.size) return days;

  return days.map((day) => ({
    ...day,
    meals: day.meals.map((meal) => {
      const auditInfo = auditInfoById.get(`${day.day}-${meal.id}`);
      return auditInfo ? { ...meal, auditInfo } : meal;
    }),
  }));
}

function displayMedicalDetail(detail: string | null) {
  return detail?.replace(/^Other Vet\/Medical\b/, "Other Health").replace(/^Other Vet \/ Medical\b/, "Other Health").replace(/^Other Medical\b/, "Other Health") ?? null;
}



function splitActivityNotes(notes: string | null) {

  const lines = notes?.split("\n").map((line) => line.trim()).filter(Boolean) ?? [];

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

function PottyActivityNotes({ activity, className = "mt-2 text-sm text-zinc-500" }: { activity: ActivityLog; className?: string }) {

  const notes = visiblePottyNotes(activity.notes);

  if (!notes) return null;

  return <ExpandableNoteText className={className}>Notes: {notes}</ExpandableNoteText>;

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

      <PottyActivityNotes activity={activity} className="pt-1 text-sm text-zinc-500" />

      <ActivityAttachmentLinks activity={activity} className="flex flex-wrap justify-end gap-2" />

    </div>

  );

}

function renderTimelineActivityDetail(activity: ActivityLog) {

  if (["pee", "poop", "potty"].includes(activity.activityType)) {

    return renderActivityDetail({ ...activity, notes: null });

  }

  if (!activity.attachments?.length) return renderActivityDetail(activity);

  const { notesText } = splitActivityNotes(activity.notes);

  return renderActivityDetail({ ...activity, notes: notesText || null });

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

  if (!activity.attachments?.length) return null;
  const isPoopPhotoRecord = ["pee", "poop", "potty"].includes(activity.activityType);

  return (

    <div className={className ?? `mt-2 flex flex-wrap gap-2 ${isPoopPhotoRecord ? "justify-end" : ""}`}>

      {activity.attachments.map((attachment, index) => (

        <button
          key={attachment.id}
          type="button"
          aria-label={isPoopPhotoRecord ? `Open image${activity.attachments && activity.attachments.length > 1 ? ` ${index + 1}` : ""}` : `Open ${attachment.fileName}`}
          title={isPoopPhotoRecord ? `Open image${activity.attachments && activity.attachments.length > 1 ? ` ${index + 1}` : ""}` : attachment.fileName}
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



function CareActivityDetail({ activity, careTemplates = [] }: { activity: ActivityLog; careTemplates?: CareItemTemplate[] }) {

  const { lines, attachmentLine } = splitActivityNotes(activity.notes);

  const detail = activity.detail ?? "";

  const skipped = /\bSkipped\b/i.test(detail) || lines.some((line) => line.startsWith("Skip Note: "));

  const missed = /\bMissed\b/i.test(detail) || lines.includes("Missed");

  const skipReason = lines.find((line) => line.startsWith("Skip Note: "))?.replace("Skip Note: ", "").trim() ?? null;

  const careLines = lines.filter((line) => line !== attachmentLine && !line.startsWith("Skip Note: ") && line !== "Missed");

  const isLastDose = careLines.includes("Last Dose");

  const matchedTemplate = matchingCareTemplate(activity, careTemplates);

  const timingLine = careLines.find((line) => line === "With Food" || line === "Empty Stomach") ?? (matchedTemplate?.kind === "medication" ? mealPlanCareTimingLabel(matchedTemplate) : null);

  const giveLine = careLines.find((line) => line.startsWith("Give ")) ?? null;

  const doseText = giveLine?.replace(/^Give\s+/i, "").replace(/\s*\([^)]*\)\s*$/, "").trim() ?? matchedTemplate?.dose ?? "";

  const name = (matchedTemplate?.name || detail)

    .replace(/\s*(?:[•·-]\s*)?(?:Skipped|Missed)\b/i, "")

    .replace(doseText ? new RegExp(`\\s*[•·]\\s*${doseText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i") : /$^/, "")

    .trim();

  const giveDetail = giveLine ?? careTemplateGiveText(matchedTemplate);

  const specialNotes = careLines.filter((line) => line.startsWith("Notes: ")).map((line) => line.replace("Notes: ", ""));



  return (

    <div className="mt-2 space-y-1.5 text-sm">

      <div className="flex flex-wrap items-center gap-2">

        {name ? <p className="font-semibold text-zinc-800">{name}</p> : null}

        {skipped || missed ? <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-200/80">{missed ? "Missed" : skipReason ? `Skipped — ${skipReason}` : "Skipped"}</span> : null}

      </div>

      {giveDetail ? (

        <div className="flex flex-wrap items-center gap-2 text-zinc-600">

          <p className="min-w-0">{giveDetail}</p>

          <div className="inline-flex shrink-0 items-center gap-2">

            {timingLine ? (

              <span className={`rounded-full px-2.5 py-1 text-xs font-normal ${activity.activityType === "supplement" ? "bg-white/55 text-[#1f3d5c]/60" : "bg-sky-100/80 text-sky-700/60"}`}>

                {timingLine}

              </span>

            ) : null}

            {isLastDose ? <span className="rounded-full bg-amber-100/80 px-2.5 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200/70">Last Dose</span> : null}

          </div>

        </div>

      ) : null}

      {specialNotes.length ? <ExpandableNoteText className="text-zinc-500"><span className="font-medium text-zinc-600">Notes:</span> {specialNotes.join(" · ")}</ExpandableNoteText> : null}

      {activity.attachments?.length ? <ActivityAttachmentLinks activity={activity} /> : attachmentLine ? <ExpandableNoteText className="text-zinc-500">{attachmentLine}</ExpandableNoteText> : null}

    </div>

  );

}



function ActivityDetailAndNotes({ activity, careTemplates = [] }: { activity: ActivityLog; careTemplates?: CareItemTemplate[] }) {

  const { notesText, attachmentLine } = splitActivityNotes(activity.notes);



  if (["medication", "supplement"].includes(activity.activityType)) {

    return <CareActivityDetail activity={activity} careTemplates={careTemplates} />;

  }



  return (

    <div className="mt-2 space-y-1 text-sm text-zinc-600">

      {activity.detail ? <p>{displayMedicalDetail(activity.detail)}</p> : null}

      {notesText ? <ExpandableNoteText>Notes: {notesText}</ExpandableNoteText> : null}

      {activity.attachments?.length ? <ActivityAttachmentLinks activity={activity} /> : attachmentLine ? <ExpandableNoteText className="text-zinc-500">{attachmentLine}</ExpandableNoteText> : null}

    </div>

  );

}



function pottyDetailForBadge(activity: ActivityLog) {

  if (activity.activityType === "pee") return "Pee";

  if (activity.activityType === "poop") return activity.detail ?? "Poop";

  return activity.detail ?? "Potty Break";

}



function getActivityStyle(activityType: ActivityLog["activityType"]) {

  switch (activityType) {

    case "potty":

      return {

        icon: null,

        iconText: "\u{1F6BD}",

        card: "bg-[#ead7a8] ring-[#f0d27a]",

        iconWrap: "bg-[rgba(255,255,255,0.55)] text-[#8a6200] ring-1 ring-[rgba(240,210,122,0.6)]",

      };

    case "pee":

      return {

        icon: Droplets,

        iconText: null,

        card: "bg-[#ead7a8] ring-amber-200",

        iconWrap: "bg-amber-100 text-amber-600",

      };

    case "poop":

      return {

        icon: null,

        iconText: "\u{1F4A9}",

        card: "bg-[#ead7a8] ring-orange-200",

        iconWrap: "bg-orange-100 text-orange-600",

      };

    case "activity":

    case "outdoor":

      return {

        icon: null,

        iconText: "\u{1F333}",

        card: "bg-emerald-50/80 ring-emerald-200",

        iconWrap: "bg-emerald-100 text-emerald-600",

      };

    case "care":

      return {

        icon: null,

        iconText: "\u{1F3E0}",

        card: "bg-purple-50/80 ring-purple-200",

        iconWrap: "bg-purple-200 text-purple-800",

      };

    case "wellness":

      return {

        icon: null,

        iconText: "\u{1F33F}",

        card: "bg-rose-50/80 ring-rose-200",

        iconWrap: "bg-rose-100 text-rose-600",

      };

    case "hike":

      return {

        icon: null,

        iconText: "\u{1F333}",

        card: "bg-emerald-50/80 ring-emerald-200",

        iconWrap: "bg-emerald-100 text-emerald-600",

      };

    case "treat":

      return {

        icon: null,

        iconText: "\u{1F9B4}",

        card: "bg-orange-50/80 ring-orange-200",

        iconWrap: "bg-orange-400 text-white",

      };

    case "food":

      return {

        icon: null,

        iconText: "\u{1F969}",

        card: "bg-[#ead8c5]/80 ring-[#caa57f]",

        iconWrap: "bg-[#8a5a35]/75 text-white",

      };

    case "supplement":

      return {

        icon: Tablets,

        iconText: null,

        card: "bg-[#eaf0f8]/80 ring-[#b8c9dd]",

        iconWrap: "bg-[#eaf0f8] text-[#1f3d5c] ring-1 ring-[#b8c9dd]",

      };

    case "medication":

      return {

        icon: MedicationPillIcon,

        iconText: null,

        card: "bg-sky-50/80 ring-sky-200",

        iconWrap: "bg-sky-100 text-sky-600",

      };

    case "sick":

      return {

        icon: null,

        iconText: "\u{1FA7A}",

        card: "bg-sky-50/80 ring-sky-200",

        iconWrap: "bg-sky-100 text-sky-600",

      };

    case "other":

      return {

        icon: Ellipsis,

        iconText: null,

        card: "bg-zinc-100/90 ring-zinc-200",

        iconWrap: "bg-zinc-200 text-zinc-600",

      };

  }

}




function getEventFeedDot(activityType: ActivityLog["activityType"] | "meal" | "manual") {

  if (activityType === "meal") return "bg-[#9a6940]";

  if (activityType === "manual") return "bg-violet-500";

  if (["pee", "poop", "potty"].includes(activityType)) return "bg-[#d7a900]";

  if (["activity", "outdoor", "hike"].includes(activityType)) return "bg-emerald-500";

  if (activityType === "wellness") return "bg-rose-500";

  if (activityType === "supplement") return "bg-[#b8c9dd]";

  if (activityType === "care") return "bg-purple-500";

  if (["sick", "medication"].includes(activityType)) return "bg-sky-500";

  if (["food", "treat"].includes(activityType)) return "bg-orange-400";

  return "bg-zinc-500";

}

function EventFeedMarker({ activityType }: { activityType: ActivityLog["activityType"] | "meal" | "manual" }) {
  if (activityType === "supplement") {
    return (
      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[#eaf0f8] text-[#1f3d5c] ring-1 ring-[#b8c9dd]">
        <Tablets className="size-3.5" />
      </span>
    );
  }

  if (activityType === "medication") {
    return (
      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-600 ring-1 ring-sky-100">
        <MedicationPillIcon className="size-3.5" />
      </span>
    );
  }

  if (activityType === "meal") {
    return (
      <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-full bg-[#8a5a35]/80 ring-1 ring-[#8a5a35]/20">
        <Check className="size-3.5 text-white" strokeWidth={3} />
      </span>
    );
  }

  if (activityType === "manual") {
    return (
      <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-full bg-[#fff0f1] ring-1 ring-[#e6c8ce]/80">
        <TriangleAlert className="size-3.5 text-[#8f1739]" strokeWidth={2.25} />
      </span>
    );
  }

  return <span className={`mt-1 flex size-5 shrink-0 items-center justify-center rounded-full ${getEventFeedDot(activityType)}`} />;
}

type HistoryFilter = "all" | "allFood" | "treat" | "potty" | "activity" | "medical" | "wellness" | "care" | "other" | "medicalAttachments" | "poopRecords";

const eventFilterOptions: Array<{ id: HistoryFilter; label: string }> = [

  { id: "all", label: "All" },

  { id: "potty", label: "Potty" },

  { id: "allFood", label: "Food" },

  { id: "treat", label: "Treat" },

  { id: "activity", label: "Activity" },

  { id: "medical", label: "Health" },

  { id: "wellness", label: "Wellness" },

  { id: "care", label: "Care" },

  { id: "other", label: "Other" },

];

const recordFilterOptions: Array<{ id: HistoryFilter; label: string }> = [

  { id: "medicalAttachments", label: "Medical Attachments" },

  { id: "poopRecords", label: "Poop Records" },

];

const historyFilterLabels = new Map([...eventFilterOptions, ...recordFilterOptions].map((option) => [option.id, option.label]));

const medicalWellnessDetails = ["Vet Visit", "Wellness Exam", "Sick Consult", "Vaccine", "Injection", "Vaccine / Injection", "Medication", "Flea & Tick", "Deworming", "Lab / Test", "Procedure", "Other Health", "Other Vet / Medical", "Other Vet/Medical", "Other Medical"];

function isMedicalWellnessDetail(detail: string | null) {
  const normalized = detail ?? "";
  return medicalWellnessDetails.some((value) => normalized.includes(value));
}

function isMissedMealRecord(meal: { fedNotes: string | null }) {
  return meal.fedNotes === "Missed";
}

function isSkippedMealRecord(meal: { fedNotes: string | null }) {
  return meal.fedNotes === "Skipped";
}

function hasMedicalAttachmentRecord(activity: ActivityLog) {

  const notes = activity.notes ?? "";

  return Boolean(activity.attachments?.length) || notes.includes("Attachments:");

}

function isActualPoopRecord(activity: ActivityLog) {
  const detail = activity.detail?.trim() ?? "";
  if (detail === "Pee") return false;
  if (detail === "No Poop") return activity.activityType === "poop" || activity.activityType === "potty";
  if (activity.activityType !== "poop") return false;
  return detail === "Poop" || detail === "Pee & Poop" || detail.includes("• Type ") || detail.startsWith("Type ");
}

function hiddenDuplicateMissedCareActivityIds(activities: ActivityLog[]) {

  const givenCareActivityIds = new Set(

    activities

      .filter((activity) => ["medication", "supplement"].includes(activity.activityType) && !activity.id.endsWith("-missed"))

      .map((activity) => activity.id)

  );

  return new Set(

    activities

      .filter((activity) => ["medication", "supplement"].includes(activity.activityType) && activity.id.endsWith("-missed") && givenCareActivityIds.has(activity.id.replace(/-missed$/, "")))

      .map((activity) => activity.id)

  );

}

function activityMatchesHistoryFilter(activity: ActivityLog, activeFilter: HistoryFilter) {

  if (activeFilter === "all") return true;

  if (activeFilter === "potty") return ["pee", "poop", "potty"].includes(activity.activityType);

  if (activeFilter === "activity") return activity.activityType === "activity";

  if (activeFilter === "treat") return activity.activityType === "treat";

  if (activeFilter === "medical") return ["sick", "medication"].includes(activity.activityType) || (activity.activityType === "wellness" && isMedicalWellnessDetail(activity.detail));

  if (activeFilter === "wellness") return activity.activityType === "supplement" || (activity.activityType === "wellness" && !isMedicalWellnessDetail(activity.detail));

  if (activeFilter === "care") return activity.activityType === "care";

  if (activeFilter === "other") return activity.activityType === "other";

  if (activeFilter === "allFood") return activity.activityType === "food";

  if (activeFilter === "medicalAttachments") return hasMedicalAttachmentRecord(activity);

  if (activeFilter === "poopRecords") return isActualPoopRecord(activity);

  return false;

}

function timelineItemMatchesHistoryFilter(item: HistoryDay["timelineItems"][number], activeFilter: HistoryFilter) {

  if (activeFilter === "all") return true;

  if (activeFilter === "allFood") return item.activityType === "meal" || item.activityType === "food";

  if (activeFilter === "potty") return ["pee", "poop", "potty"].includes(item.activityType);

  if (activeFilter === "activity") return item.activityType === "activity";

  if (activeFilter === "treat") return item.activityType === "treat";

  if (activeFilter === "medical") return ["sick", "medication"].includes(item.activityType) || (item.activityType === "wellness" && isMedicalWellnessDetail(item.detail));

  if (activeFilter === "wellness") return item.activityType === "supplement" || (item.activityType === "wellness" && !isMedicalWellnessDetail(item.detail));

  if (activeFilter === "care") return item.activityType === "care";

  if (activeFilter === "other") return item.activityType === "other";

  if (activeFilter === "medicalAttachments") return item.activity ? hasMedicalAttachmentRecord(item.activity) : false;

  if (activeFilter === "poopRecords") return item.activity ? isActualPoopRecord(item.activity) : false;

  return false;

}

export default function HistoryPage() {

  const router = useRouter();

  const { loading: authLoading } = useAuth();

  const [templates, setTemplates] = useState<MealTemplate[]>([]);
  const [historicalMealTemplates, setHistoricalMealTemplates] = useState<MealTemplate[]>([]);

  const [dailyMealHistory, setDailyMealHistory] = useState<DailyMealState[]>([]);

  const [mealLogs, setMealLogs] = useState<MealLog[]>([]);

  const [careTemplates, setCareTemplates] = useState<CareItemTemplate[]>([]);

  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);

  const [manualAlerts, setManualAlerts] = useState<ManualAlert[]>([]);

  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([]);

  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const [activeFilter, setActiveFilter] = useState<HistoryFilter>("all");

  const [showFilters, setShowFilters] = useState(false);

  const [draftFilter, setDraftFilter] = useState<HistoryFilter>("all");

  const [startDate, setStartDate] = useState("");

  const [endDate, setEndDate] = useState("");

  const [draftStartDate, setDraftStartDate] = useState("");

  const [draftEndDate, setDraftEndDate] = useState("");

  const [calendarMonth, setCalendarMonth] = useState(() => {

    const now = new Date();

    return new Date(now.getFullYear(), now.getMonth(), 1);

  });

  const [hydrated, setHydrated] = useState(false);

  const [sendCopyStatus, setSendCopyStatus] = useState("");
  const [isSendingCopy, setIsSendingCopy] = useState(false);
  const [showHistoryCopyUpgradeDialog, setShowHistoryCopyUpgradeDialog] = useState(false);
  const [showHistoryAccessUpgradeDialog, setShowHistoryAccessUpgradeDialog] = useState(false);
  const [includeLogDetails, setIncludeLogDetails] = useState(false);
  const [historyEditUnlocked, setHistoryEditUnlocked] = useState(false);
  const [activeNotebookRole, setActiveNotebookRole] = useState<NotebookAccessRole | null>(null);
  const [activeNotebookOwnerId, setActiveNotebookOwnerId] = useState<string | null>(null);
  const [subscriptionPlan, setSubscriptionPlan] = useState<SubscriptionPlanId>("free");
  const [profile, setProfile] = useState<PetProfile>(() => loadPetProfile());
  const supabaseReady = isSupabaseConfigured();
  const canIncludeLogDetails = activeNotebookRole ? canExportNotebook(activeNotebookRole) : false;



  useEffect(() => {
    const refreshProfile = () => setProfile(loadPetProfile());
    refreshProfile();
    window.addEventListener("pet-profile-updated", refreshProfile);
    window.addEventListener("storage", refreshProfile);
    return () => {
      window.removeEventListener("pet-profile-updated", refreshProfile);
      window.removeEventListener("storage", refreshProfile);
    };
  }, []);

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



  useEffect(() => {
    if (supabaseReady && authLoading) return;

    let cancelled = false;



    async function hydrate(fresh = false) {

      try {

        const state = await (fresh ? loadFreshAppState() : loadAppState());

        if (cancelled) return;

        setTemplates(state.templates);
        setHistoricalMealTemplates(state.historicalMealTemplates?.length ? state.historicalMealTemplates : state.templates);

        setDailyMealHistory(state.dailyMealHistory?.length ? state.dailyMealHistory : state.dailyMealState);

        setMealLogs(state.mealLogs ?? []);

        const [supplements, medications] = await Promise.all([
          loadCurrentCareTemplatesFromSupabase("supplement").catch(() => loadCareTemplates("supplement")),
          loadCurrentCareTemplatesFromSupabase("medication").catch(() => loadCareTemplates("medication")),
        ]);

        setCareTemplates([...supplements, ...medications]);
        setActivityLogs(state.activityLogs);

        setManualAlerts(state.manualAlerts ?? []);

        setWeightLogs(state.weightLogs ?? []);

        const supabase = getSupabaseBrowserClient();
        const session = supabase ? await getSupabaseCurrentSession(supabase) : null;
        const access = supabase && session?.user ? await resolveActiveNotebookAccess(supabase, session.user) : null;
        setActiveNotebookRole(access?.role ?? null);
        setActiveNotebookOwnerId(state.notebookOwnerId ?? access?.notebookOwnerId ?? session?.user?.id ?? null);

      } finally {

        if (!cancelled) {

          setHydrated(true);

        }

      }

    }



    hydrate();

    const handleNotebookUpdated = () => {
      void hydrate(true);
    };

    window.addEventListener("petnotebook-active-notebook-updated", handleNotebookUpdated);



    return () => {

      cancelled = true;
      window.removeEventListener("petnotebook-active-notebook-updated", handleNotebookUpdated);

    };

  }, [authLoading, supabaseReady]);

  useEffect(() => {
    if (!canIncludeLogDetails && includeLogDetails) {
      setIncludeLogDetails(false);
    }
  }, [canIncludeLogDetails, includeLogDetails]);



  const historyDays = useMemo<HistoryDay[]>(() => {

    const templatesById = new Map(templates.map((template) => [template.id, template]));
    const historicalTemplatesById = new Map(historicalMealTemplates.map((template) => [template.id, template]));
    const mealSortOrderById = new Map(templates.map((template, index) => [template.id, index]));

    const days = new Map<string, HistoryDay>();



    const ensureDay = (day: string) => {

      if (!days.has(day)) {

        days.set(day, {

          day,

          meals: [],

          activities: [],

          weights: [],

          timelineItems: [],

        });

      }



      return days.get(day)!;

    };



    const latestMealsByDayAndMealId = new Map<string, MealLog>();



    const mealLogsWithDailyStateFallbacks = [...mealLogs];
    const mealLogKeys = new Set(mealLogs.map((meal) => `${meal.dayKey}-${meal.mealId}`));

    dailyMealHistory.forEach((mealState) => {
      if (mealState.status !== "done") return;
      const day = mealState.dayKey ?? historyDayKeyFromDate(new Date());
      if (mealLogKeys.has(`${day}-${mealState.mealId}`)) return;

      const template = templatesById.get(mealState.mealId) ?? historicalTemplatesById.get(mealState.mealId);
      if (!template) return;

      mealLogsWithDailyStateFallbacks.push({
        id: `${day}-${mealState.mealId}-daily-state`,
        profileSlug: "hewie",
        dayKey: day,
        mealId: mealState.mealId,
        mealName: template.name,
        food: template.food,
        defaultNotes: template.notes,
        fedNotes: mealState.fedNotes,
        skippedCareItemIds: mealState.skippedCareItemIds ?? [],
        actualTime: mealState.actualTime || template.plannedTime,
      });
      mealLogKeys.add(`${day}-${mealState.mealId}`);
    });

    mealLogsWithDailyStateFallbacks.forEach((meal) => {

      const day = meal.dayKey ?? inferMealHistoryDate(meal.actualTime);

      const key = `${day}-${meal.mealId}`;

      const existing = latestMealsByDayAndMealId.get(key);



      if (!existing || (meal.createdAt ?? "") >= (existing.createdAt ?? "")) {

        latestMealsByDayAndMealId.set(key, meal);

      }

    });



    latestMealsByDayAndMealId.forEach((meal) => {

      const template = templatesById.get(meal.mealId) ?? historicalTemplatesById.get(meal.mealId);
      const mealSortOrder = mealSortOrderById.get(meal.mealId) ?? parseClockMinutes(template?.plannedTime ?? meal.actualTime);

      const day = meal.dayKey ?? inferMealHistoryDate(meal.actualTime);

      const targetDay = ensureDay(day);

      const mealTemplate = template ?? {
        id: meal.mealId,
        name: meal.mealName || "Meal",
        plannedTime: meal.actualTime,
        food: meal.food,
        notes: meal.defaultNotes,
      };
      const missedMeal = isMissedMealRecord(meal);
      const skippedMeal = isSkippedMealRecord(meal);
      const displayTime = missedMeal || skippedMeal ? mealTemplate.plannedTime || meal.actualTime : meal.actualTime || mealTemplate.plannedTime;
      const skippedCareItemIds = meal.skippedCareItemIds ?? [];
      const mealTemplatesForDoseCount = templates.some((savedMeal) => savedMeal.id === mealTemplate.id) ? templates : [...templates, mealTemplate];
      const mealCareItems = meal.loggedCareItems?.length
        ? meal.loggedCareItems.map((item) => ({ ...item, skipped: Boolean(item.skipped) }))
        : mealCareItemsWithDoseBadges(careTemplates, mealTemplate, mealTemplatesForDoseCount, day).map((item) => ({
            ...item,
            skipped: skippedCareItemIds.includes(`${item.kind}-${item.id}`),
          }));



      targetDay.meals.push({

        id: meal.mealId,

        name: meal.mealName || template?.name || "Meal",

        food: meal.food,

        notes: meal.defaultNotes,

        fedNotes: meal.fedNotes,

        careItems: mealCareItems,

        actualTime: displayTime,

        plannedTime: mealTemplate.plannedTime,

        auditInfo: meal.auditInfo,

        createdAt: meal.createdAt,

        sortOrder: mealSortOrder,

      });



      targetDay.timelineItems.push({

        key: meal.id,

        time: displayTime,

        label: missedMeal ? "Missed Meal" : skippedMeal ? "Skipped Meal" : "Fed",

        detail: missedMeal || skippedMeal

          ? `${meal.mealName}: ${meal.food}`

          : meal.fedNotes

          ? `${meal.mealName}: ${meal.food} • Notes: ${meal.fedNotes}`

          : `${meal.mealName}: ${meal.food}`,

        activityType: "meal",
        auditInfo: meal.auditInfo,

        mealGroupId: `meal-${meal.id}`,

        sortMinutes: parseClockMinutes(displayTime),

        sortCreatedAt: meal.createdAt,

        sortOrder: mealSortOrder * 10,

        sortKey: `meal-${meal.id}`,

      });



      mealCareItems.forEach((item, index) => {

        targetDay.timelineItems.push({

          key: `${meal.id}-${item.kind}-${item.id}${item.skipped ? "-skipped" : ""}`,

          time: displayTime,

          label: item.skipped ? `Skipped ${careKindLabel(item.kind)}` : careKindLabel(item.kind),

          detail: `${mealPlanTimelineCareDetailText(item)}${!item.skipped && item.notes ? ` • Notes: ${item.notes}` : ""}`,

          activityType: item.kind,

          mealGroupId: `meal-${meal.id}`,

          sortMinutes: parseClockMinutes(displayTime),

          sortCreatedAt: meal.createdAt,

          sortOrder: mealSortOrder * 10 + index + 1,

          sortKey: `meal-${meal.id}-${item.kind}-${item.id}${item.skipped ? "-skipped" : ""}`,

        });

      });

    });



    const hiddenMissedCareActivityIds = hiddenDuplicateMissedCareActivityIds(activityLogs);

    activityLogs.forEach((activity) => {

      if (hiddenMissedCareActivityIds.has(activity.id)) return;
      if (!isVisibleActivity(activity, careTemplates)) return;

      const day = historyDayKeyFromDate(new Date(activity.happenedAt));

      const targetDay = ensureDay(day);



      targetDay.activities.push(activity);

      const activityDisplayDate = customCareDisplayDate(activity);

      targetDay.timelineItems.push({

        key: activity.id,

        time: formatActivityTime(activityDisplayDate.toISOString()),

        label: formatActivityLabel(activity.activityType),

        detail: renderTimelineActivityDetail(activity),

        activity,

        activityType: activity.activityType,

        sortMinutes: activityDisplayDate.getHours() * 60 + activityDisplayDate.getMinutes(),

        sortCreatedAt: activity.createdAt,

        sortOrder: 0,

        sortKey: activity.createdAt ?? activity.id,

      });

    });



    manualAlerts.forEach((alert) => {

      const createdAt = alert.createdAt ? new Date(alert.createdAt) : null;

      const resolvedAt = alert.resolvedAt ? new Date(alert.resolvedAt) : null;



      if (createdAt) {

        const createdDay = historyDayKeyFromDate(createdAt);

        ensureDay(createdDay).timelineItems.push({

          key: `${alert.id}-created`,

          time: formatActivityTime(alert.createdAt as string),

          label: "Alert Created",

          detail: formatManualAlertTimelineDetail(alert),

          activityType: "manual",

          sortMinutes: createdAt.getHours() * 60 + createdAt.getMinutes(),

          sortCreatedAt: alert.createdAt,

          sortOrder: 0,

          sortKey: `${alert.id}-created`,

        });

      }



      if (resolvedAt) {

        const resolvedDay = historyDayKeyFromDate(resolvedAt);

        ensureDay(resolvedDay).timelineItems.push({

          key: `${alert.id}-resolved`,

          time: formatActivityTime(alert.resolvedAt as string),

          label: "Alert Resolved",

          detail: formatManualAlertTimelineDetail(alert),

          activityType: "manual",

          sortMinutes: resolvedAt.getHours() * 60 + resolvedAt.getMinutes(),

          sortCreatedAt: alert.resolvedAt ?? undefined,

          sortOrder: 0,

          sortKey: `${alert.id}-resolved`,

        });

      }

    });



    weightLogs.forEach((weight) => {

      ensureDay(weight.date).weights.push(weight);

    });



    return [...days.values()]

      .sort((a, b) => b.day.localeCompare(a.day))

      .map((day) => ({

        ...day,

        meals: [...day.meals].sort(compareHistoryMeals),

        activities: [...day.activities].sort(compareActivitiesChronological),

        weights: [...day.weights].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)),

        timelineItems: [...day.timelineItems].sort(compareHistoryTimelineItems),

      }));

  }, [activityLogs, careTemplates, dailyMealHistory, historicalMealTemplates, manualAlerts, mealLogs, templates, weightLogs]);

  const freeHistoryCutoff = useMemo(() => freeHistoryCutoffDayKey(), []);
  const availableHistoryDays = useMemo(() => {
    if (subscriptionPlan === "plus") return historyDays;
    return historyDays.filter((day) => day.day >= freeHistoryCutoff);
  }, [freeHistoryCutoff, historyDays, subscriptionPlan]);
  const filteredHistoryDays = useMemo(() => {

    return filterHistoryDays(availableHistoryDays, activeFilter, startDate, endDate);

  }, [activeFilter, availableHistoryDays, endDate, startDate]);

  const hasActiveHistoryFilter = activeFilter !== "all" || Boolean(startDate) || Boolean(endDate);

  useEffect(() => {

    if (!filteredHistoryDays.length) {

      if (hasActiveHistoryFilter) {
        setSelectedDay(null);
      }

      return;

    }

    if (!selectedDay || (hasActiveHistoryFilter && !filteredHistoryDays.some((day) => day.day === selectedDay))) {

      setSelectedDay(filteredHistoryDays[0].day);

      const [year, month] = filteredHistoryDays[0].day.split("-").map(Number);

      setCalendarMonth(new Date(year, month - 1, 1));

    }

  }, [filteredHistoryDays, hasActiveHistoryFilter, selectedDay]);

  const historyDaysByKey = useMemo(() => {

    return new Map(filteredHistoryDays.map((day) => [day.day, day]));

  }, [filteredHistoryDays]);

  const selectedHistoryDay = selectedDay ? historyDaysByKey.get(selectedDay) ?? null : null;
  const selectedEmptyDay = selectedDay && !selectedHistoryDay ? selectedDay : null;

  const selectedDayAlerts = selectedHistoryDay?.timelineItems.filter((item) => item.activityType === "manual") ?? [];

  const selectedDayActivities = selectedHistoryDay?.activities ?? [];

  const selectedTimelineEntries = useMemo(() => {
    const items = selectedHistoryDay?.timelineItems ?? [];
    return activeFilter === "all" ? groupHistoryMealTimelineItems(items) : items.map((item) => ({ type: "item" as const, item }));
  }, [activeFilter, selectedHistoryDay]);

  const renderHistoryTimelineItem = (item: HistoryTimelineItem, key: string, groupedRow = false, showTime = true) => {
    const treatParts = item.activityType === "treat" ? splitTreatDetailText(item.detail) : null;
    const careActivity = item.activity && ["medication", "supplement"].includes(item.activityType) ? item.activity : null;
    const pottyNotesActivity = item.activity && ["pee", "poop", "potty"].includes(item.activity.activityType) && pottyDetailForBadge(item.activity) ? item.activity : null;
    const pottyAttachmentActivity = pottyNotesActivity?.attachments?.length ? pottyNotesActivity : null;
    const [detailSummary, detailNotes] = item.detail.split(" • Notes: ", 2);
    const status = timelineStatusFor(item);
    const showRightPhotoControls = Boolean(pottyAttachmentActivity);
    const auditInfo = item.activity?.auditInfo ?? item.auditInfo;
    const modifierUserId = auditInfo?.lastEditedByUserId ?? auditInfo?.loggedByUserId;
    const loggedBy = modifierUserId && activeNotebookOwnerId && modifierUserId !== activeNotebookOwnerId
      ? auditInfo?.lastEditedByUserId ? auditInfo.lastEditedBy : auditInfo?.loggedBy
      : null;
    const content = (
      <>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <p className="min-w-0 text-sm font-semibold text-zinc-900">{item.label}</p>
          </div>
          {showTime && !showRightPhotoControls ? (
            <div className="flex shrink-0 items-center gap-1.5">
              <InitialsBadge name={loggedBy} />
              <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-semibold text-zinc-500 ring-1 ring-zinc-200/80">
                {item.time}
              </span>
            </div>
          ) : null}
        </div>

        {careActivity ? (
          <CareActivityDetail activity={careActivity} careTemplates={careTemplates} />
        ) : treatParts ? (
          <>
            {treatParts.summary ? <p className="mt-1 text-sm text-zinc-500">{treatParts.summary}</p> : null}
            {treatParts.notes ? <ExpandableNoteText className="mt-1 text-sm text-zinc-500">Notes: {treatParts.notes}</ExpandableNoteText> : null}
          </>
        ) : item.detail.includes(" • Notes: ") ? (
          <>
            <TimelineDetailText detail={detailSummary} status={status} />
            {!pottyNotesActivity && detailNotes ? <ExpandableNoteText className="mt-1 text-sm text-zinc-500">Notes: {detailNotes}</ExpandableNoteText> : null}
          </>
        ) : item.detail ? (
          <TimelineDetailText detail={item.detail} status={status} />
        ) : null}
      </>
    );

    return (
      <div key={key} className={groupedRow ? "px-2.5 py-3" : "rounded-2xl bg-zinc-50/75 p-2.5 ring-1 ring-zinc-200/70"}>
        <div className={`grid gap-2.5 ${showRightPhotoControls ? "grid-cols-[1.35rem_minmax(0,1fr)_auto]" : "grid-cols-[1.35rem_1fr]"}`}>
          <div className="flex w-5 justify-center">
            <EventFeedMarker activityType={item.activityType} />
          </div>

          <div className="min-w-0">
            {content}
            {pottyNotesActivity ? (
              pottyAttachmentActivity ? <PottyActivityNotes activity={pottyNotesActivity} /> : <PottyActivityMeta activity={pottyNotesActivity} />
            ) : item.activity ? <ActivityAttachmentLinks activity={item.activity} /> : null}
          </div>
          {pottyAttachmentActivity ? (
            <div className="flex shrink-0 flex-col items-end gap-2">
              {showTime ? (
                <div className="flex items-center gap-1.5">
                  <InitialsBadge name={loggedBy} />
                  <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-semibold text-zinc-500 ring-1 ring-zinc-200/80">
                    {item.time}
                  </span>
                </div>
              ) : null}
              <ActivityAttachmentLinks activity={pottyAttachmentActivity} className="flex flex-wrap justify-end gap-2" />
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  const openFilters = () => {

    setDraftFilter(activeFilter);

    setDraftStartDate(startDate);

    setDraftEndDate(endDate);

    setShowFilters((current) => !current);

  };

  const applyFilters = () => {

    setActiveFilter(draftFilter);

    setStartDate(draftStartDate);

    setEndDate(draftEndDate);

    setShowFilters(false);

    setSendCopyStatus("");

  };

  const clearFilters = () => {

    setActiveFilter("all");

    setDraftFilter("all");

    setStartDate("");

    setEndDate("");

    setDraftStartDate("");

    setDraftEndDate("");

    setShowFilters(false);
    setSendCopyStatus("");

    const latestDay = availableHistoryDays[0]?.day;

    if (latestDay) {

      setSelectedDay(latestDay);

      const [year, month] = latestDay.split("-").map(Number);

      setCalendarMonth(new Date(year, month - 1, 1));

    }

  };

  const historyCopyDateRange = (start: string, end: string) => (
    start || end
      ? `${start || "Beginning"} to ${end || "Today"}`
      : "All dates"
  );

  const historyCopyGeneratedDate = () => (
    new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(new Date())
  );

  const buildHistoryCopyText = (copyDays: HistoryDay[], copyFilter: HistoryFilter, dateRange: string, reportProfile: PetProfile, ownerName: string, generatedDate: string, withLogDetails: boolean) => {

    const lines = [
      `${displayPetName(reportProfile)} History Report`,
      "",
      "Pet Information",
      `Name: ${displayPetName(reportProfile)}`,
      `Species: ${formatProfileValue(reportProfile.species)}`,
      `Breed: ${formatProfileValue(reportProfile.breed)}`,
      `Birthdate: ${formatProfileValue(formatProfileDate(reportProfile.birthday))}`,
      `Microchip #: ${formatProfileValue(reportProfile.microchipNumber)}`,
      `Age: ${formatProfileValue(displayPetAge(reportProfile))}`,
      `Gender: ${formatProfileValue(reportProfile.sex ? reportProfile.sex[0].toUpperCase() + reportProfile.sex.slice(1) : "")}`,
      `Spay/Neuter: ${formatProfileValue(reportProfile.spayNeuterStatus ? reportProfile.spayNeuterStatus[0].toUpperCase() + reportProfile.spayNeuterStatus.slice(1) : "")}`,
      `Owner: ${formatProfileValue(ownerName)}`,
      "",
      "Report Summary",
      `Filter: ${historyFilterLabels.get(copyFilter) ?? "All"}`,
      `Date Range: ${dateRange}`,
      `Matching Days: ${copyDays.length}`,
      `Report Generated: ${generatedDate}`,
      `Log Details: ${withLogDetails ? "Included" : "Not included"}`,
      "",
      "History",
      "",
    ];

    if (!copyDays.length) {
      lines.push("No records match this filter.");
      return lines.join("\n");
    }

    copyDays.forEach((day) => {
      lines.push(formatDayLabel(day.day));

      day.meals.forEach((meal) => {
        const statuses = [
          isMissedMealRecord(meal) ? "Missed" : null,
          isSkippedMealRecord(meal) ? "Skipped" : null,
        ].filter(Boolean).join(", ");
        const details = [
          meal.food,
          meal.fedNotes && !isMissedMealRecord(meal) && !isSkippedMealRecord(meal) ? `Notes: ${meal.fedNotes}` : null,
          statuses ? `Status: ${statuses}` : null,
        ].filter(Boolean).join(" | ");

        lines.push(`- ${meal.actualTime} Meal: ${meal.name}${details ? ` - ${details}` : ""}`);

        meal.careItems.forEach((item) => {
          lines.push(`  - ${careKindLabel(item.kind)}: ${item.name}${item.dose ? `, ${item.dose}` : ""}${item.skipped ? " (Skipped)" : ""}`);
        });

        if (withLogDetails) {
          const audit = meal.auditInfo;
          const auditParts = [
            `Logged by: ${audit?.loggedBy ?? "Not recorded"}`,
            `Logged time: ${formatReportDateTime(audit?.loggedAt ?? meal.createdAt)}`,
            audit?.lastEditedAt ? `Updated by: ${audit.lastEditedBy ?? "Not recorded"}` : null,
            audit?.lastEditedAt ? `Updated: ${formatReportDateTime(audit.lastEditedAt)}` : null,
          ].filter(Boolean);

          lines.push(`  - Log details: ${auditParts.join(" | ")}`);
        }
      });

      day.activities.forEach((activity) => {
        const detail = displayMedicalDetail(renderActivityDetail(activity));
        const notes = activity.notes ? ` | Notes: ${activity.notes.replace(/\n/g, " ")}` : "";
        lines.push(`- ${formatActivityTime(activity.happenedAt)} ${displayActivityLabel(activity)}${detail ? ` - ${detail}` : ""}${notes}`);
        if (isReportImageActivity(activity)) {
          lines.push(`__REPORT_IMAGES__:${activity.id}`);
        }

        if (withLogDetails) {
          const audit = activity.auditInfo;
          const auditParts = [
            `Logged by: ${audit?.loggedBy ?? "Not recorded"}`,
            `Logged time: ${formatReportDateTime(audit?.loggedAt ?? activity.createdAt ?? activity.happenedAt)}`,
            audit?.lastEditedAt ? `Last edited by: ${audit.lastEditedBy ?? "Not recorded"}` : null,
            audit?.lastEditedAt ? `Last edited time: ${formatReportDateTime(audit.lastEditedAt)}` : null,
          ].filter(Boolean);

          lines.push(`  - Log details: ${auditParts.join(" | ")}`);
        }
      });

      day.weights.forEach((weight) => {
        lines.push(`- Weight: ${weight.weight}${weight.note ? ` - ${weight.note}` : ""}`);
      });

      if (!day.meals.length && !day.activities.length && !day.weights.length) {
        day.timelineItems.forEach((item) => {
          lines.push(`- ${item.time} ${item.label}${item.detail ? ` - ${item.detail}` : ""}`);
        });
      }

      lines.push("");
    });

    return lines.join("\n").trim();

  };

  const handleSendCopy = async () => {

    if (subscriptionPlan !== "plus") {
      setSendCopyStatus("");
      setShowHistoryCopyUpgradeDialog(true);
      return;
    }

    const dateRange = historyCopyDateRange(startDate, endDate);
    const generatedDate = historyCopyGeneratedDate();

    setSendCopyStatus("");
    setIsSendingCopy(true);

    try {
      const supabase = getSupabaseBrowserClient();
      const session = supabase ? await getSupabaseCurrentSession(supabase) : null;
      const accessToken = session?.access_token;

      if (!accessToken) {
        setSendCopyStatus("Sign in again before sending the history report.");
        return;
      }

      const metadata = session.user.user_metadata ?? {};
      const metadataFirstName = typeof metadata.first_name === "string" ? metadata.first_name.trim() : "";
      const metadataLastName = typeof metadata.last_name === "string" ? metadata.last_name.trim() : "";
      const metadataFullName = typeof metadata.full_name === "string" ? metadata.full_name.trim() : "";
      const activeNotebookAccess = supabase ? await resolveActiveNotebookAccess(supabase, session.user) : null;
      const notebookOwnerId = activeNotebookAccess?.notebookOwnerId ?? session.user.id;
      const signedInOwnerName = normalizeReportName([metadataFirstName, metadataLastName].filter(Boolean).join(" ") || metadataFullName || session.user.email || "");
      const ownerName = notebookOwnerId === session.user.id ? signedInOwnerName : "";
      const includeLogDetailsInReport = includeLogDetails && Boolean(activeNotebookAccess?.role && canExportNotebook(activeNotebookAccess.role));
      const reportDays = includeLogDetailsInReport
        ? await Promise.all([
            loadActivityAuditInfoForReport(reportActivityIds(filteredHistoryDays)),
            loadMealAuditInfoForReport(reportMealLogIds(filteredHistoryDays)),
          ]).then(([activityAuditInfo, mealAuditInfo]) =>
            withReportMealAuditInfo(withReportActivityAuditInfo(filteredHistoryDays, activityAuditInfo), mealAuditInfo)
          )
        : filteredHistoryDays;
      const text = buildHistoryCopyText(reportDays, activeFilter, dateRange, profile, ownerName, generatedDate, includeLogDetailsInReport);
      const reportImages = reportImagesForDays(reportDays);

      const response = await fetch("/api/history-copy/email", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          filterLabel: historyFilterLabels.get(activeFilter) ?? "All",
          dateRange,
          generatedDate,
          matchingDays: filteredHistoryDays.length,
          profile: {
            petName: displayPetName(profile),
            petFirstName: profile.petFirstName,
            petLastName: profile.petLastName,
            species: profile.species,
            breed: profile.breed,
            birthday: profile.birthday,
            microchipNumber: profile.microchipNumber,
            age: displayPetAge(profile),
            sex: profile.sex,
            spayNeuterStatus: profile.spayNeuterStatus,
            ownerName,
            notebookOwnerId,
            themeId: profile.themeId,
          },
          reportImages,
        }),
      });
      const result = await response.json().catch(() => null) as { sent?: boolean; email?: string; error?: string } | null;

      if (!response.ok || !result?.sent) {
        setSendCopyStatus(result?.error || "Could not email the history report.");
        return;
      }

      setSendCopyStatus(`History report sent: ${result.email || "your account email"}.`);
    } catch {
      setSendCopyStatus("Could not email the history report.");
    } finally {
      setIsSendingCopy(false);
    }

  };

  const calendarCells = useMemo(() => {

    const year = calendarMonth.getFullYear();

    const month = calendarMonth.getMonth();

    const firstOfMonth = new Date(year, month, 1);

    const firstGridDate = new Date(year, month, 1 - firstOfMonth.getDay());

    return Array.from({ length: 42 }, (_, index) => {

      const date = new Date(firstGridDate);

      date.setDate(firstGridDate.getDate() + index);

      const key = historyDayKeyFromDate(date);

      const day = historyDaysByKey.get(key);
      const selectable = date.getMonth() === month && key <= currentTodayKey();

      const hasMedicalRecord = day?.activities.some((activity) => ["sick", "medication"].includes(activity.activityType) || (activity.activityType === "wellness" && isMedicalWellnessDetail(activity.detail))) ?? false;

      const dotClasses = day

        ? [

          hasMedicalRecord ? "bg-sky-500" : null,

        ].filter(Boolean) as string[]

        : [];

      return {

        key,

        date,

        inMonth: date.getMonth() === month,

        hasData: Boolean(day),

        selectable,

        dotClasses,

      };

    });

  }, [calendarMonth, historyDaysByKey]);

  const isFilteredView = hasActiveHistoryFilter;

  const showEventFeed = selectedHistoryDay && activeFilter === "all";

  const showMeals = selectedHistoryDay && (activeFilter === "all" || activeFilter === "allFood");

  const showActivities = selectedHistoryDay && ["all", "allFood", "treat", "potty", "activity", "medical", "wellness", "care", "other", "medicalAttachments", "poopRecords"].includes(activeFilter);

  const showWeights = selectedHistoryDay && activeFilter === "all";

  const showAlerts = selectedHistoryDay && activeFilter === "all";

  const historyEditModeButton = (label: string, colorClassName = "text-zinc-500 hover:text-zinc-700") => {
    const Icon = historyEditUnlocked ? LockOpen : Lock;
    const stateClassName = historyEditUnlocked
      ? "bg-[#f6d978] text-[#4f2f1b] shadow-sm shadow-[#4f2f1b]/20 ring-[#4f2f1b]/25 hover:bg-[#f1cc61]"
      : `bg-white/80 ring-zinc-200 ${colorClassName}`;

    return (
      <button
        type="button"
        onClick={() => setHistoryEditUnlocked((current) => !current)}
        className={`flex size-6 shrink-0 items-center justify-center rounded-full ring-1 transition ${stateClassName}`}
        aria-label={`${historyEditUnlocked ? "Lock" : "Unlock"} ${label} history editing`}
        title={historyEditUnlocked ? "Editing unlocked" : "Unlock editing"}
      >
        <Icon className="size-3" />
      </button>
    );
  };

  const openHistoryCopyUpgrade = () => {
    setShowHistoryCopyUpgradeDialog(false);
    router.push("/hewie/account-settings?upgrade=plus");
  };

  const openHistoryAccessUpgrade = () => {
    setShowHistoryAccessUpgradeDialog(false);
    router.push("/hewie/account-settings?upgrade=plus");
  };

  const selectHistoryDay = (dayKey: string) => {
    if (subscriptionPlan !== "plus" && dayKey < freeHistoryCutoff) {
      setShowHistoryAccessUpgradeDialog(true);
      return;
    }

    setSelectedDay(dayKey);
  };

  const openHistoryMealEditor = (dayKey: string, mealId: number) => {
    if (!historyEditUnlocked) return;
    router.push(`/hewie/log?date=${dayKey}&editMeal=${mealId}`);
  };

  const openHistoryActivityEditor = (dayKey: string, activityId: string) => {
    if (!historyEditUnlocked) return;
    router.push(`/hewie/log?date=${dayKey}&editActivity=${encodeURIComponent(activityId)}`);
  };

  const editableHistoryCardClassName = historyEditUnlocked ? "cursor-pointer transition hover:brightness-[0.98] active:scale-[0.99]" : "";



  if (!hydrated) {

    return (

      <main className="min-h-screen bg-[var(--hewie-bg,#979ca7)] text-zinc-900">

        <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-24 pt-6">

          <header className="mb-6">

            <div className="flex min-h-[4.5rem] items-center justify-between gap-3">

              <div>

                <PetNotebookTitle href="/hewie" className="text-sm font-bold text-[var(--hewie-active-text,#6d28d9)]" />

                <div className="skeleton-pulse mt-1 h-10 w-36 rounded-xl bg-white/40" />

              </div>

              <PetAvatarMenu shape="tile" />

            </div>

            <div className="skeleton-pulse mt-2 h-4 w-72 rounded-xl bg-white/30" />

          </header>



          <div className="space-y-4">

            <div className="skeleton-pulse h-40 rounded-3xl bg-white/60 shadow-sm ring-1 ring-white/50" />

            <div className="skeleton-pulse h-40 rounded-3xl bg-white/60 shadow-sm ring-1 ring-white/50" />

            <div className="skeleton-pulse h-40 rounded-3xl bg-white/60 shadow-sm ring-1 ring-white/50" />

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

          <div className="flex min-h-[4.5rem] items-center justify-between gap-3">

            <div>

              <PetNotebookTitle href="/hewie" className="text-sm font-bold text-[var(--hewie-active-text,#6d28d9)]" />

              <h1 className="mt-1 text-xl font-bold tracking-tight text-[#3b2832]">History</h1>

            </div>

            <PetAvatarMenu shape="tile" />

          </div>

        </header>


        {subscriptionPlan === "free" ? (
          <div className="mb-4 rounded-3xl bg-white/92 p-4 text-sm leading-5 text-zinc-600 shadow-sm ring-1 ring-zinc-200">
            <p className="font-semibold text-zinc-900">View the latest 3 months of history.</p>
            <p className="mt-1">
              Older records are available with PetNotebook Plus.
            </p>
          </div>
        ) : null}


        <section className="mb-4 overflow-hidden rounded-3xl bg-[var(--hewie-active-bg,#f1f5f9)] text-[var(--hewie-active-text,#334155)] shadow-sm ring-1 ring-[var(--hewie-ring,#cbd5e1)]">

          <div className="bg-[var(--hewie-accent,#64748b)] px-5 py-4 text-[var(--hewie-accent-text,#ffffff)]">

            <div className="flex items-center justify-between gap-3">

              <div>

                <h2 className="text-xl font-semibold">

                  {new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(calendarMonth)}

                </h2>


              </div>

              <div className="flex gap-2">

                <Button

                  type="button"

                  variant="outline"

                  className="size-9 rounded-full border-white/45 bg-white/15 p-0 text-[var(--hewie-accent-text,#ffffff)] hover:bg-white/25"

                  onClick={openFilters}

                  aria-label="Open filters"

                >

                  <SlidersHorizontal className="size-4" />

                </Button>

                <Button

                  variant="outline"

                  className="size-9 rounded-full border-white/45 bg-white/15 p-0 text-[var(--hewie-accent-text,#ffffff)] hover:bg-white/25"

                  onClick={() => setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}

                  aria-label="Previous month"

                >

                  <ChevronLeft className="size-4" />

                </Button>

                <Button

                  variant="outline"

                  className="size-9 rounded-full border-white/45 bg-white/15 p-0 text-[var(--hewie-accent-text,#ffffff)] hover:bg-white/25"

                  onClick={() => setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}

                  aria-label="Next month"

                >

                  <ChevronRight className="size-4" />

                </Button>

              </div>

            </div>

          </div>



          {showFilters ? (

            <div className="border-b border-[var(--hewie-ring,#cbd5e1)]/70 bg-[var(--hewie-active-bg,#f1f5f9)] p-5">

              <div className="space-y-4 rounded-2xl bg-white/60 p-4 ring-1 ring-[var(--hewie-ring,#cbd5e1)]/70">

                <div>

                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">Events</p>

                  <div className="flex flex-wrap gap-2">

                    {eventFilterOptions.map((option) => (

                      <button

                        key={option.id}

                        type="button"

                        onClick={() => setDraftFilter(option.id)}

                        className={`min-h-9 rounded-full px-3.5 py-2 text-xs font-bold leading-none ring-1 transition ${

                          draftFilter === option.id

                            ? "bg-[var(--hewie-accent,#64748b)] text-[var(--hewie-accent-text,#ffffff)] ring-white/45"

                            : "bg-white/65 text-[var(--hewie-active-text,#334155)]/75 ring-[var(--hewie-ring,#cbd5e1)]/70"

                        }`}

                      >

                        {option.label}

                      </button>

                    ))}

                  </div>

                </div>



                <div>

                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">Record Types</p>

                  <div className="grid grid-cols-2 gap-2 min-[390px]:grid-cols-3">

                    {recordFilterOptions.map((option) => (

                      <button

                        key={option.id}

                        type="button"

                        onClick={() => setDraftFilter(option.id)}

                        className={`min-h-9 rounded-full px-3 py-2 text-center text-xs font-bold leading-none ring-1 transition ${

                          draftFilter === option.id

                            ? "bg-[var(--hewie-accent,#64748b)] text-[var(--hewie-accent-text,#ffffff)] ring-white/45"

                            : "bg-white/65 text-[var(--hewie-active-text,#334155)]/75 ring-[var(--hewie-ring,#cbd5e1)]/70"

                        }`}

                      >

                        {option.label}

                      </button>

                    ))}

                  </div>

                </div>



                <div className="space-y-3 border-t border-[var(--hewie-ring,#cbd5e1)]/60 pt-3">

                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">Date Range</p>

                  <div className="grid grid-cols-2 gap-2">

                    <label className="text-xs font-semibold text-zinc-500">

                      From

                      <input

                        type="date"

                        value={draftStartDate}

                        onChange={(event) => setDraftStartDate(event.target.value)}

                        className="mt-1 w-full rounded-2xl border-0 bg-white px-3 py-2 text-sm font-medium text-zinc-800 ring-1 ring-zinc-200"

                      />

                    </label>

                    <label className="text-xs font-semibold text-zinc-500">

                      To

                      <input

                        type="date"

                        value={draftEndDate}

                        onChange={(event) => setDraftEndDate(event.target.value)}

                        className="mt-1 w-full rounded-2xl border-0 bg-white px-3 py-2 text-sm font-medium text-zinc-800 ring-1 ring-zinc-200"

                      />

                    </label>

                  </div>

                  <div className="flex flex-wrap gap-2">

                    <Button type="button" className="rounded-full bg-[var(--hewie-accent,#64748b)] !font-bold text-[var(--hewie-accent-text,#ffffff)] hover:opacity-90" onClick={applyFilters}>

                      Apply Filters

                    </Button>

                  </div>

                </div>

              </div>

            </div>

          ) : null}



          {isFilteredView ? (

            <div className="border-b border-[var(--hewie-ring,#cbd5e1)]/70 bg-white/45 px-5 py-3">

              <div className="space-y-3 rounded-2xl bg-white/70 px-3 py-3 ring-1 ring-[var(--hewie-ring,#cbd5e1)]/70">

                <div>

                  <p className="text-base font-extrabold text-[var(--hewie-active-text,#334155)]">
                    {historyFilterLabels.get(activeFilter) ?? "All"}
                  </p>

                  <p className="mt-0.5 text-sm font-semibold text-[var(--hewie-active-text,#334155)]/60">

                    {historyCopyDateRange(startDate, endDate)}

                  </p>

                  <p className="mt-1 text-xs font-medium text-zinc-500">

                    {filteredHistoryDays.length} matching day{filteredHistoryDays.length === 1 ? "" : "s"}

                  </p>

                  {sendCopyStatus ? (

                    <p className="mt-1 text-xs font-medium text-zinc-500">{sendCopyStatus}</p>

                  ) : null}

                </div>

                {canIncludeLogDetails ? (
                  <label className="flex items-start gap-2 rounded-2xl bg-white/80 px-3 py-2 text-xs font-semibold text-zinc-600 ring-1 ring-zinc-200/80">
                    <input
                      type="checkbox"
                      checked={includeLogDetails}
                      onChange={(event) => setIncludeLogDetails(event.target.checked)}
                      className="mt-0.5 size-4 rounded border-zinc-300 accent-[var(--hewie-accent,#64748b)]"
                    />
                    <span>
                      Include logging details
                    </span>
                  </label>
                ) : null}

                <div className="flex flex-wrap gap-2">

                  <Button type="button" className="h-8 rounded-full bg-[var(--hewie-accent,#64748b)] px-3 text-xs font-bold text-[var(--hewie-accent-text,#ffffff)] disabled:opacity-60" onClick={() => void handleSendCopy()} disabled={isSendingCopy}>

                    {isSendingCopy ? "Sending..." : "Email History Report"}

                  </Button>

                  <Button type="button" variant="outline" className="h-8 rounded-full px-3 text-xs font-bold" onClick={clearFilters}>

                    Clear Filters

                  </Button>

                </div>

              </div>

            </div>

          ) : null}



          <div className="p-5">

          <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--hewie-active-text,#334155)]/55">

            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((dayName) => <span key={dayName}>{dayName}</span>)}

          </div>

          <div className="grid grid-cols-7 gap-1.5">

            {calendarCells.map((cell) => {

              const selected = cell.key === selectedDay;

              return (

                <button

                  key={cell.key}

                  type="button"

                  disabled={!cell.selectable}

                  onClick={() => selectHistoryDay(cell.key)}

                  className={`relative flex aspect-square w-full flex-col items-center justify-center rounded-[0.85rem] text-sm font-semibold transition ${

                    !cell.inMonth

                      ? "text-[var(--hewie-active-text,#334155)]/15"

                      : selected

                        ? "bg-[var(--hewie-accent,#64748b)] text-[var(--hewie-accent-text,#ffffff)] ring-1 ring-white/60"

                        : cell.hasData

                          ? "bg-white/70 text-[var(--hewie-active-text,#334155)] ring-1 ring-[var(--hewie-ring,#cbd5e1)] hover:bg-white/85"

                          : cell.selectable
                            ? "bg-white/45 text-[var(--hewie-active-text,#334155)]/60 ring-1 ring-[var(--hewie-ring,#cbd5e1)]/45 hover:bg-white/65"
                            : "bg-white/25 text-[var(--hewie-active-text,#334155)]/30 ring-1 ring-[var(--hewie-ring,#cbd5e1)]/25"

                  }`}

                >

                  {cell.date.getDate()}

                  {cell.dotClasses.length ? (

                    <span className="mt-0.5 flex justify-center gap-0.5">

                      {cell.dotClasses.map((dotClass, dotIndex) => (

                        <span key={`${cell.key}-${dotClass}-${dotIndex}`} className={`h-1.5 w-1.5 rounded-full ${selected ? "ring-1 ring-white/70" : ""} ${dotClass}`} />

                      ))}

                    </span>

                  ) : null}

                </button>

              );

            })}

          </div>

          </div>

        </section>



        <section className="mb-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">

          <div className="mb-4 flex items-start justify-between gap-3">

            <div>

              <h2 className="text-lg font-semibold">{isFilteredView ? "Filtered Results" : selectedHistoryDay ? formatDayLabel(selectedHistoryDay.day) : selectedEmptyDay ? formatDayLabel(selectedEmptyDay) : "Select A Day"}</h2>

              {isFilteredView ? (

                <div className="mt-1 space-y-0.5">

                  <p className="text-sm font-semibold text-zinc-800">

                    {historyFilterLabels.get(activeFilter) ?? "All"}

                  </p>

                  <p className="text-sm text-zinc-500">

                    {historyCopyDateRange(startDate, endDate)}

                  </p>

                  <p className="text-sm text-zinc-500">

                    {filteredHistoryDays.length} matching day{filteredHistoryDays.length === 1 ? "" : "s"}

                  </p>

                </div>

              ) : (

                <p className="text-sm text-zinc-500">

                  {selectedHistoryDay

                    ? [

                        `${selectedHistoryDay.meals.length} meals`,

                        `${selectedHistoryDay.activities.length} events`,

                        selectedHistoryDay.weights.length ? `${selectedHistoryDay.weights.length} weights` : null,

                      ].filter(Boolean).join(" • ")

                    : selectedEmptyDay
                      ? "No records logged yet."
                      : "Days with records have dots on the calendar."}

                </p>

              )}

            </div>

          </div>



          {isFilteredView ? (

            filteredHistoryDays.length ? (

              <div className="space-y-4">

                {filteredHistoryDays.map((day) => (

                  <div key={`filtered-${day.day}`} className="space-y-2">

                    <h3 className="text-sm font-semibold text-zinc-700">{formatDayLabel(day.day)}</h3>

                    {day.timelineItems
                      .filter((item) => !item.activity && ["medication", "supplement"].includes(item.activityType))
                      .map((item) => renderHistoryTimelineItem(item, `filtered-timeline-${day.day}-${item.key}`))}

                    {day.meals.map((meal) => {

                      const missedMeal = isMissedMealRecord(meal);
                      const skippedMeal = isSkippedMealRecord(meal);

                      return (

                      <article key={`${day.day}-filtered-meal-${meal.id}-${meal.actualTime}`} className="rounded-2xl bg-[#f4eadf]/90 p-4 ring-1 ring-[#d8b895]">

                        <div className="flex items-center justify-between gap-3">

                          <div className="flex min-w-0 items-center gap-2">

                            <p className="font-medium text-zinc-900">{meal.name}</p>

                            {missedMeal ? <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-200/80">Missed</span> : null}
                            {skippedMeal ? <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-200/80">Skipped</span> : null}

                          </div>

                          <MealHistoryTime meal={meal} />

                        </div>

                        <p className="mt-2 text-sm text-zinc-600">{meal.food}</p>

                        <MealHistoryPlannedTime meal={meal} />

                        {meal.notes ? <ExpandableNoteText className="mt-1 text-sm text-zinc-500">Meal Plan Notes: {meal.notes}</ExpandableNoteText> : null}

                        {meal.fedNotes && !missedMeal && !skippedMeal ? <ExpandableNoteText className="mt-1 text-sm text-zinc-500">Notes: {meal.fedNotes}</ExpandableNoteText> : null}

                        {meal.careItems.length ? (

                          <div className="mt-3 space-y-1.5 border-t border-[#d8b895]/45 pt-3">

                            {meal.careItems.map((item) => <CareItemHistoryLine key={`${item.kind}-${item.id}`} item={item} />)}

                          </div>

                        ) : null}

                      </article>

                      );

                    })}

                    {day.activities.map((activity) => {

                      const displayType = activity.detail === "Hike" ? "hike" : (["pee", "poop"].includes(activity.activityType) ? "potty" : activity.activityType);

                      const style = getActivityStyle(displayType);

                      const Icon = style.icon;
                      const isPottyActivity = ["pee", "poop", "potty"].includes(activity.activityType) && pottyDetailForBadge(activity);
                      const pottyAttachmentActivity = ["pee", "poop", "potty"].includes(activity.activityType) && pottyDetailForBadge(activity) && activity.attachments?.length ? activity : null;

                      if (pottyAttachmentActivity) {

                        return (

                          <article key={`filtered-${activity.id}`} className={`rounded-2xl p-4 ring-1 ${style.card}`}>

                            <div className="flex items-start justify-between gap-3">

                              <div className="min-w-0 flex-1 text-left">

                                <div className="flex items-center gap-3">

                                  <span className={`flex size-9 items-center justify-center rounded-full ${style.iconWrap}`}>

                                    {Icon ? <Icon className="size-4.5" /> : <span className="text-lg leading-none">{style.iconText}</span>}

                                  </span>

                                  <p className="font-medium text-zinc-900">{displayActivityLabel(activity)}</p>

                                </div>

                                <PottyDetailBadges detail={pottyDetailForBadge(activity)} notes={null} />

                              </div>

                              <div className="shrink-0 text-right">

                                <p className="whitespace-nowrap text-sm text-zinc-500">{formatActivityTime(activity.happenedAt)}</p>

                                <ActivityAttachmentLinks activity={pottyAttachmentActivity} className="mt-2 flex flex-wrap justify-end gap-2" />

                              </div>

                            </div>

                            <PottyActivityNotes activity={activity} />

                          </article>

                        );

                      }

                      return (

                        <article key={`filtered-${activity.id}`} className={`rounded-2xl p-4 ring-1 ${style.card}`}>

                          <div className="flex items-center justify-between gap-3">

                            <div className="flex items-center gap-3">

                              <span className={`flex size-9 items-center justify-center rounded-full ${style.iconWrap}`}>

                                {Icon ? <Icon className="size-4.5" /> : <span className="text-lg leading-none">{style.iconText}</span>}

                              </span>

                              <p className="font-medium text-zinc-900">{displayActivityLabel(activity)}</p>

                            </div>

                            <p className="text-sm text-zinc-500">{formatActivityTime(activity.happenedAt)}</p>

                          </div>

                          {isPottyActivity ? (

                            <PottyDetailBadges detail={pottyDetailForBadge(activity)} notes={null} />

                          ) : activity.activityType === "treat" ? (

                            <div className="mt-2 space-y-1 text-sm text-zinc-600">

                              {splitTreatDetailText(renderActivityDetail(activity)).summary ? <p>{splitTreatDetailText(renderActivityDetail(activity)).summary}</p> : null}

                              {splitTreatDetailText(renderActivityDetail(activity)).notes ? <ExpandableNoteText>Notes: {splitTreatDetailText(renderActivityDetail(activity)).notes}</ExpandableNoteText> : null}

                            </div>

                          ) : (

                            <ActivityDetailAndNotes activity={activity} careTemplates={careTemplates} />

                          )}

                          {isPottyActivity ? <PottyActivityMeta activity={activity} /> : null}

                        </article>

                      );

                    })}

                  </div>

                ))}

              </div>

            ) : (

              <p className="rounded-2xl bg-zinc-50 p-4 text-sm text-zinc-500 ring-1 ring-zinc-200">No records match this filter.</p>

            )

          ) : selectedHistoryDay ? (

            <div className="space-y-4">

              {showEventFeed && selectedHistoryDay.timelineItems.length ? (

                <div>

                  <h3 className="mb-2 text-sm font-semibold text-zinc-700">Full Timeline</h3>

                  <div className="space-y-2">

                    {selectedTimelineEntries.map((entry) => {
                      if (entry.type === "item") {
                        const item = entry.item;
                        return renderHistoryTimelineItem(item, `${item.activityType ?? "item"}-${item.time}-${item.label}-${item.detail}`);
                      }

                      return (
                        <div key={entry.id} className="overflow-hidden rounded-2xl bg-zinc-50/75 ring-1 ring-zinc-200/70">
                          {entry.items.map((item, itemIndex) => (
                            <div key={item.key} className={itemIndex > 0 ? "border-t border-zinc-200/70" : ""}>
                              {renderHistoryTimelineItem(item, `${entry.id}-${itemIndex}`, true, itemIndex === 0)}
                            </div>
                          ))}
                        </div>
                      );
                    })}

                  </div>

                </div>

              ) : null}



              {showMeals && selectedHistoryDay.meals.length ? (

                <div>

                  <div className="mb-2 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-[#6b3f22]">Meals</h3>
                    {historyEditModeButton("meals", "text-[#6b3f22]/55 hover:text-[#6b3f22]")}
                  </div>

                  <div className="space-y-2">

                    {selectedHistoryDay.meals.map((meal) => {

                      const missedMeal = isMissedMealRecord(meal);
                      const skippedMeal = isSkippedMealRecord(meal);

                      return (

                      <article
                        key={`${selectedHistoryDay.day}-meal-${meal.id}-${meal.actualTime}`}
                        role={historyEditUnlocked ? "button" : undefined}
                        tabIndex={historyEditUnlocked ? 0 : undefined}
                        onClick={() => openHistoryMealEditor(selectedHistoryDay.day, meal.id)}
                        onKeyDown={(event) => {
                          if (!historyEditUnlocked || (event.key !== "Enter" && event.key !== " ")) return;
                          event.preventDefault();
                          openHistoryMealEditor(selectedHistoryDay.day, meal.id);
                        }}
                        className={`rounded-2xl bg-[#f4eadf]/90 p-4 ring-1 ring-[#d8b895] ${editableHistoryCardClassName}`}
                      >

                        <div className="flex items-center justify-between gap-3">

                          <div className="flex min-w-0 items-center gap-2">

                            <p className="font-medium text-zinc-900">{meal.name}</p>

                            {missedMeal ? <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-200/80">Missed</span> : null}
                            {skippedMeal ? <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-200/80">Skipped</span> : null}

                          </div>

                          <MealHistoryTime meal={meal} />

                        </div>

                        <p className="mt-2 text-sm text-zinc-600">{meal.food}</p>

                        <MealHistoryPlannedTime meal={meal} />

                        {meal.notes ? <ExpandableNoteText className="mt-1 text-sm text-zinc-500">Meal Plan Notes: {meal.notes}</ExpandableNoteText> : null}

                        {meal.fedNotes && !missedMeal && !skippedMeal ? <ExpandableNoteText className="mt-1 text-sm text-zinc-500">Notes: {meal.fedNotes}</ExpandableNoteText> : null}

                        {meal.careItems.length ? (

                          <div className="mt-3 space-y-1.5 border-t border-[#d8b895]/45 pt-3">

                            {meal.careItems.map((item) => <CareItemHistoryLine key={`${item.kind}-${item.id}`} item={item} />)}

                          </div>

                        ) : null}

                      </article>

                      );

                    })}

                  </div>

                </div>

              ) : null}



              {showActivities && selectedDayActivities.length ? (

                <div>

                  <div className="mb-2 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-zinc-700">Events</h3>
                    {historyEditModeButton("events")}
                  </div>

                  <div className="space-y-2">

                    {selectedDayActivities.map((activity) => {

                      const displayType = activity.detail === "Hike" ? "hike" : (["pee", "poop"].includes(activity.activityType) ? "potty" : activity.activityType);

                      const style = getActivityStyle(displayType);

                      const Icon = style.icon;
                      const isPottyActivity = ["pee", "poop", "potty"].includes(activity.activityType) && pottyDetailForBadge(activity);
                      const pottyAttachmentActivity = ["pee", "poop", "potty"].includes(activity.activityType) && pottyDetailForBadge(activity) && activity.attachments?.length ? activity : null;

                      if (pottyAttachmentActivity) {

                        return (

                          <article
                            key={activity.id}
                            role={historyEditUnlocked ? "button" : undefined}
                            tabIndex={historyEditUnlocked ? 0 : undefined}
                            onClick={() => openHistoryActivityEditor(selectedHistoryDay.day, activity.id)}
                            onKeyDown={(event) => {
                              if (!historyEditUnlocked || (event.key !== "Enter" && event.key !== " ")) return;
                              event.preventDefault();
                              openHistoryActivityEditor(selectedHistoryDay.day, activity.id);
                            }}
                            className={`rounded-2xl p-4 ring-1 ${style.card} ${editableHistoryCardClassName}`}
                          >

                            <div className="flex items-start justify-between gap-3">

                              <div className="min-w-0 flex-1 text-left">

                                <div className="flex items-center gap-3">

                                  <span className={`flex size-9 items-center justify-center rounded-full ${style.iconWrap}`}>

                                    {Icon ? <Icon className="size-4.5" /> : <span className="text-lg leading-none">{style.iconText}</span>}

                                  </span>

                                  <p className="font-medium text-zinc-900">{displayActivityLabel(activity)}</p>

                                </div>

                                <PottyDetailBadges detail={pottyDetailForBadge(activity)} notes={null} />

                              </div>

                              <div className="shrink-0 text-right">

                                <p className="whitespace-nowrap text-sm text-zinc-500">{formatActivityTime(activity.happenedAt)}</p>

                                <ActivityAttachmentLinks activity={pottyAttachmentActivity} className="mt-2 flex flex-wrap justify-end gap-2" />

                              </div>

                            </div>

                            <PottyActivityNotes activity={activity} />

                          </article>

                        );

                      }

                      return (

                        <article
                          key={activity.id}
                          role={historyEditUnlocked ? "button" : undefined}
                          tabIndex={historyEditUnlocked ? 0 : undefined}
                          onClick={() => openHistoryActivityEditor(selectedHistoryDay.day, activity.id)}
                          onKeyDown={(event) => {
                            if (!historyEditUnlocked || (event.key !== "Enter" && event.key !== " ")) return;
                            event.preventDefault();
                            openHistoryActivityEditor(selectedHistoryDay.day, activity.id);
                          }}
                          className={`rounded-2xl p-4 ring-1 ${style.card} ${editableHistoryCardClassName}`}
                        >

                          <div className="flex items-center justify-between gap-3">

                            <div className="flex items-center gap-3">

                              <span className={`flex size-9 items-center justify-center rounded-full ${style.iconWrap}`}>

                                {Icon ? <Icon className="size-4.5" /> : <span className="text-lg leading-none">{style.iconText}</span>}

                              </span>

                              <p className="font-medium text-zinc-900">{displayActivityLabel(activity)}</p>

                            </div>

                            <p className="text-sm text-zinc-500">{formatActivityTime(activity.happenedAt)}</p>

                          </div>

                          {isPottyActivity ? (

                            <PottyDetailBadges detail={pottyDetailForBadge(activity)} notes={null} />

                          ) : activity.activityType === "treat" ? (

                            <div className="mt-2 space-y-1 text-sm text-zinc-600">

                              {splitTreatDetailText(renderActivityDetail(activity)).summary ? <p>{splitTreatDetailText(renderActivityDetail(activity)).summary}</p> : null}

                              {splitTreatDetailText(renderActivityDetail(activity)).notes ? <ExpandableNoteText>Notes: {splitTreatDetailText(renderActivityDetail(activity)).notes}</ExpandableNoteText> : null}

                            </div>

                          ) : (

                            <ActivityDetailAndNotes activity={activity} careTemplates={careTemplates} />

                          )}

                          {isPottyActivity ? <PottyActivityMeta activity={activity} /> : null}

                        </article>

                      );

                    })}

                  </div>

                </div>

              ) : null}



              {showWeights && selectedHistoryDay.weights.length ? (

                <div>

                  <h3 className="mb-2 text-sm font-semibold text-zinc-700">Weight</h3>

                  <div className="space-y-2">

                    {selectedHistoryDay.weights.map((weight) => (

                      <article key={weight.id} className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">

                        <div className="flex items-center justify-between gap-3">

                          <p className="font-medium text-zinc-900">Weight Entry</p>

                          <p className="text-sm font-semibold text-zinc-800">{weight.weight}</p>

                        </div>

                        {weight.note ? <ExpandableNoteText className="mt-1 text-sm text-zinc-500">{weight.note}</ExpandableNoteText> : null}

                      </article>

                    ))}

                  </div>

                </div>

              ) : null}



              {showAlerts && selectedDayAlerts.length ? (

                <div>

                  <h3 className="mb-2 text-sm font-semibold text-[#8f1739]">Alerts</h3>

                  <div className="space-y-2">

                    {selectedDayAlerts.map((item) => {

                      const resolved = item.label.toLowerCase().includes("resolved");

                      return (

                        <article key={item.key} className={`rounded-2xl p-4 shadow-[0_8px_18px_rgba(255,27,90,0.08)] ring-1 ${resolved ? "bg-[#fff8f8] ring-[#ead4d8]" : "bg-gradient-to-r from-[#fff0f1] to-[#fcebed] ring-[#e6c8ce]/80"}`}>

                          <div className="flex items-center justify-between gap-3">

                            <p className={`font-medium ${resolved ? "text-[#8f1739]/75" : "text-[#8f1739]"}`}>{item.label}</p>

                            <p className={`text-sm ${resolved ? "text-[#b71f48]/45" : "text-[#b71f48]/60"}`}>{item.time}</p>

                          </div>

                          <ExpandableNoteText className={`mt-1 text-sm ${resolved ? "text-[#b71f48]/55" : "text-[#b71f48]/72"}`}>{item.detail}</ExpandableNoteText>

                        </article>

                      );

                    })}

                  </div>

                </div>

              ) : null}



              {((showEventFeed && selectedHistoryDay.timelineItems.length) || (showMeals && selectedHistoryDay.meals.length) || (showActivities && selectedDayActivities.length) || (showWeights && selectedHistoryDay.weights.length) || (showAlerts && selectedDayAlerts.length)) ? null : (

                <p className="rounded-2xl bg-zinc-50 p-4 text-sm text-zinc-500 ring-1 ring-zinc-200">No records match this filter for the selected day.</p>

              )}

            </div>

          ) : selectedEmptyDay ? (

            <div className="space-y-3">

              <p className="rounded-2xl bg-zinc-50 p-4 text-sm text-zinc-500 ring-1 ring-zinc-200">No records yet for this day.</p>

              <Button asChild className="h-9 rounded-full bg-[var(--hewie-accent,#64748b)] px-4 text-xs font-bold text-[var(--hewie-accent-text,#ffffff)] hover:opacity-90">
                <Link href={`/hewie/log?date=${selectedEmptyDay}`}>Log This Day</Link>
              </Button>

            </div>

          ) : (

            <p className="rounded-2xl bg-zinc-50 p-4 text-sm text-zinc-500 ring-1 ring-zinc-200">No saved history yet.</p>

          )}

        </section>


        {showHistoryCopyUpgradeDialog ? (
          <div className="fixed inset-0 z-[80] flex items-end bg-zinc-950/35 p-3 backdrop-blur-sm sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-labelledby="history-copy-upgrade-title">
            <button type="button" aria-label="Close upgrade" className="absolute inset-0 cursor-default" onClick={() => setShowHistoryCopyUpgradeDialog(false)} />
            <div className="relative w-full max-w-md rounded-3xl bg-white p-5 text-zinc-900 shadow-xl ring-1 ring-zinc-200">
              <div className="mb-4">
                <h3 id="history-copy-upgrade-title" className="flex items-center gap-1.5 whitespace-nowrap text-base font-semibold">
                  <span>Email History Reports</span>
                  <span className="inline-flex rounded-full border border-[var(--hewie-accent,#64748b)] bg-[var(--hewie-active-bg,#f1f5f9)] px-2.5 py-1 text-[13px] font-bold leading-none text-[var(--hewie-active-text,#334155)]">
                    Plus
                  </span>
                </h3>
                <p className="mt-1 text-sm font-semibold leading-5 text-[var(--hewie-active-text,#334155)]">
                  Create and email PDF reports from your pet&apos;s history.
                </p>
              </div>

              <div className="mb-4 space-y-2 rounded-2xl bg-zinc-50 p-3 ring-1 ring-zinc-200">
                {[
                  "Unlimited PDF reports",
                  "Lifetime health history",
                  "Notebook sharing",
                ].map((feature) => (
                  <div key={feature} className="flex items-start gap-2 text-xs font-medium leading-5 text-zinc-500">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                    <span>{feature}</span>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={openHistoryCopyUpgrade}
                  className="flex w-full items-center justify-between gap-2 rounded-xl px-0 text-left text-xs font-bold leading-5 text-[var(--hewie-active-text,#334155)]"
                >
                  <span className="flex items-start gap-2">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                    <span>View all Plus features</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setShowHistoryCopyUpgradeDialog(false)}
                  className="h-11 rounded-full border border-zinc-200 bg-white px-4 text-sm font-bold text-zinc-700"
                >
                  Not now
                </button>
                <button
                  type="button"
                  onClick={openHistoryCopyUpgrade}
                  className="h-11 rounded-full bg-[var(--hewie-active-text,#334155)] px-4 text-sm font-bold text-white"
                >
                  Upgrade to Plus
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {showHistoryAccessUpgradeDialog ? (
          <div className="fixed inset-0 z-[80] flex items-end bg-zinc-950/35 p-3 backdrop-blur-sm sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-labelledby="history-access-upgrade-title">
            <button type="button" aria-label="Close upgrade" className="absolute inset-0 cursor-default" onClick={() => setShowHistoryAccessUpgradeDialog(false)} />
            <div className="relative w-full max-w-md rounded-3xl bg-white p-5 text-zinc-900 shadow-xl ring-1 ring-zinc-200">
              <div className="mb-4">
                <h3 id="history-access-upgrade-title" className="flex items-center gap-1.5 whitespace-nowrap text-base font-semibold">
                  <span>Unlock full history with</span>
                  <span className="inline-flex rounded-full border border-[var(--hewie-accent,#64748b)] bg-[var(--hewie-active-bg,#f1f5f9)] px-2.5 py-1 text-[13px] font-bold leading-none text-[var(--hewie-active-text,#334155)]">
                    Plus
                  </span>
                </h3>
                <p className="mt-1 text-sm font-semibold leading-5 text-[var(--hewie-active-text,#334155)]">
                  Free includes the latest 3 months. Upgrade to Plus to view older history.
                </p>
              </div>

              <div className="mb-4 space-y-2 rounded-2xl bg-zinc-50 p-3 ring-1 ring-zinc-200">
                {[
                  "Lifetime health history",
                  "Unlimited PDF reports",
                  "Unlimited photos and files",
                ].map((feature) => (
                  <div key={feature} className="flex items-start gap-2 text-xs font-medium leading-5 text-zinc-500">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                    <span>{feature}</span>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={openHistoryAccessUpgrade}
                  className="flex w-full items-center justify-between gap-2 rounded-xl px-0 text-left text-xs font-bold leading-5 text-[var(--hewie-active-text,#334155)]"
                >
                  <span className="flex items-start gap-2">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                    <span>View all Plus features</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setShowHistoryAccessUpgradeDialog(false)}
                  className="h-11 rounded-full border border-zinc-200 bg-white px-4 text-sm font-bold text-zinc-700"
                >
                  Not now
                </button>
                <button
                  type="button"
                  onClick={openHistoryAccessUpgrade}
                  className="h-11 rounded-full bg-[var(--hewie-active-text,#334155)] px-4 text-sm font-bold text-white"
                >
                  Upgrade to Plus
                </button>
              </div>
            </div>
          </div>
        ) : null}



        <BottomNav />

      </div>

    </main>

  );

}

