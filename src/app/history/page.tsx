"use client";



import { Check, ChevronLeft, ChevronRight, Droplets, Ellipsis, SlidersHorizontal, Tablets, TriangleAlert } from "lucide-react";

import { PetAvatarMenu } from "@/components/pet-avatar-menu";
import { MedicationPillIcon } from "@/components/medication-pill-icon";

import Link from "next/link";

import { useEffect, useMemo, useState } from "react";



import { BottomNav } from "@/components/bottom-nav";

import { Button } from "@/components/ui/button";

import {

  type ActivityLog,

  type ManualAlert,

  type MealLog,

  type WeightLog,

  loadAppState,

} from "@/lib/hewster-data";

import { compareActivitiesChronological, formatActivityLabel, formatActivityTime, renderActivityDetail, splitTreatDetailText } from "@/lib/activity";
import { loadCareTemplatesFromSupabase, type CareItemKind, type CareItemTemplate } from "@/lib/care-settings";

import type { MealTemplate } from "@/lib/meal-templates";



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

  }>;

  activities: ActivityLog[];

  weights: WeightLog[];

  timelineItems: Array<{

    key: string;

    time: string;

    label: string;

    detail: string;

    activity?: ActivityLog;

    activityType: ActivityLog["activityType"] | "meal" | "manual";

    sortMinutes: number;

    sortKey: string;

  }>;

};



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

function careItemKey(item: CareItemTemplate) {
  return `${item.kind}-${item.id}`;
}

function careItemsForMeal(careTemplates: CareItemTemplate[], mealId: number) {
  return careTemplates.filter((item) => item.active && item.scheduleKind === "meal" && item.mealIds.includes(mealId));
}

function CareItemHistoryLine({ item }: { item: CareItemTemplate & { skipped: boolean } }) {
  const iconClassName = item.skipped
    ? "bg-rose-50 text-rose-600 ring-rose-200"
    : item.kind === "supplement"
      ? "bg-[#eaf0f8] text-[#1f3d5c] ring-[#b8c9dd]"
      : "bg-sky-100 text-sky-600 ring-sky-200";

  return (
    <div className={`flex items-start gap-2 text-sm leading-5 ${item.skipped ? "rounded-2xl bg-rose-50/70 px-2 py-1.5 text-rose-700 ring-1 ring-rose-200/70" : "text-[#6b3f22]/70"}`}>
      <span className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ring-1 ${iconClassName}`}>
        {item.kind === "supplement" ? <Tablets className="size-3" /> : <MedicationPillIcon className="size-3.5" />}
      </span>
      <p className="min-w-0 flex-1">
        <span className={`font-semibold ${item.skipped ? "text-rose-800" : "text-[#4f2f1b]"}`}>{careKindLabel(item.kind)}:</span>{" "}
        <span className={`font-medium ${item.skipped ? "text-rose-800" : "text-[#4f2f1b]"}`}>{item.name}</span>
        {item.dose ? ` — ${item.dose}` : ""}
        {item.notes ? ` (${item.notes})` : ""}
        {item.skipped ? <span className="ml-1 font-bold text-rose-700">• Skipped</span> : null}
      </p>
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



function PottyDetailBadges({ detail, notes }: { detail: string | null; notes: string | null }) {

  const { event, bristol, bristolType, bristolDescription } = parsePottyDetail(detail);

  const showPee = event === "Pee" || event === "Pee & Poop";

  const showPoop = event === "Poop" || event === "Pee & Poop" || Boolean(bristol);

  const showNoPoop = event === "No Poop";

  const showGenericPotty = Boolean(detail) && !showPee && !showPoop && !showNoPoop;



  return (

    <div className="mt-2 space-y-1.5">

      <div className="flex flex-wrap items-center gap-2">

        {showPee ? (

          <span className={pottyBadgeClasses("Pee")}>

            <PeeSplash />

            Pee

          </span>

        ) : null}

        {showPoop ? (

          <span className="inline-flex items-center gap-2">

            <span className={pottyBadgeClasses(bristol ?? "Poop")}>

              <span className="mr-1">{"\u{1F4A9}"}</span>

              {bristolType ?? "Poop"}

            </span>

            {bristolDescription ? <span className="text-xs font-medium leading-5 text-zinc-600">{bristolDescription}</span> : null}

          </span>

        ) : null}

        {showNoPoop ? <span className={pottyBadgeClasses("No Poop")}>No Poop</span> : null}

        {showGenericPotty ? <span className={pottyBadgeClasses("Pee")}>Potty Break</span> : null}

      </div>

      {notes ? <p className="text-sm text-zinc-600">{notes}</p> : null}

    </div>

  );

}



function displayActivityLabel(activity: ActivityLog) {

  return ["pee", "poop", "potty"].includes(activity.activityType) ? "Potty" : formatActivityLabel(activity.activityType);

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



function CareActivityDetail({ activity }: { activity: ActivityLog }) {

  const { lines, attachmentLine } = splitActivityNotes(activity.notes);

  const detail = activity.detail ?? "";

  const skipped = /\bSkipped\b/i.test(detail) || lines.some((line) => line.startsWith("Skip Note: "));

  const missed = /\bMissed\b/i.test(detail) || lines.includes("Missed");

  const skipReason = lines.find((line) => line.startsWith("Skip Note: "))?.replace("Skip Note: ", "").trim() ?? null;

  const careLines = lines.filter((line) => line !== attachmentLine && !line.startsWith("Skip Note: ") && line !== "Missed");

  const isLastDose = careLines.includes("Last Dose");

  const timingLine = careLines.find((line) => line === "With Food" || line === "Empty Stomach") ?? null;

  const giveLine = careLines.find((line) => line.startsWith("Give ")) ?? null;

  const doseText = giveLine?.replace(/^Give\s+/i, "").replace(/\s*\([^)]*\)\s*$/, "").trim() ?? "";

  const name = detail

    .replace(/\s*(?:[•·-]\s*)?(?:Skipped|Missed)\b/i, "")

    .replace(doseText ? new RegExp(`\\s*[•·]\\s*${doseText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i") : /$^/, "")

    .trim();

  const giveDetail = giveLine ?? null;

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

      {specialNotes.length ? <p className="text-zinc-500"><span className="font-medium text-zinc-600">Notes:</span> {specialNotes.join(" · ")}</p> : null}

      {attachmentLine ? <p className="text-zinc-500">{attachmentLine}</p> : null}

    </div>

  );

}



function ActivityDetailAndNotes({ activity }: { activity: ActivityLog }) {

  const { notesText, attachmentLine } = splitActivityNotes(activity.notes);



  if (["medication", "supplement"].includes(activity.activityType)) {

    return <CareActivityDetail activity={activity} />;

  }



  return (

    <div className="mt-2 space-y-1 text-sm text-zinc-600">

      {activity.detail ? <p>{activity.detail}</p> : null}

      {notesText ? <p>Notes: {notesText}</p> : null}

      {attachmentLine ? <p className="text-zinc-500">{attachmentLine}</p> : null}

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

        icon: null,

        iconText: "\u{1F48A}",

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
        <Tablets className="size-3" />
      </span>
    );
  }

  if (activityType === "medication") {
    return (
      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-600 ring-1 ring-sky-100">
        <MedicationPillIcon className="size-4" />
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

type HistoryFilter = "all" | "allFood" | "potty" | "activity" | "medical" | "wellness" | "care" | "other" | "uploads" | "medicalRecords" | "vetProcedures";

const medicalWellnessDetails = ["Vet Visit", "Wellness Exam", "Sick Consult", "Vaccine", "Injection", "Medication", "Flea & Tick", "Deworming", "Procedure", "Other Medical"];

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

function hasUploadRecord(activity: ActivityLog) {

  const notes = activity.notes ?? "";

  return notes.includes("Attachments:") || notes.includes("Record Tags: Photo");

}

function hasMedicalRecordTag(activity: ActivityLog) {

  return (activity.notes ?? "").includes("Record Tags: Medical Record");

}

function isVetVisitOrProcedure(activity: ActivityLog) {

  if (activity.activityType !== "wellness" && activity.activityType !== "sick") return false;

  const detail = activity.detail ?? "";

  return ["Vet Visit", "Wellness Exam", "Sick Consult", "Procedure"].some((value) => detail.includes(value));

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

  if (activeFilter === "medical") return ["sick", "medication"].includes(activity.activityType) || (activity.activityType === "wellness" && isMedicalWellnessDetail(activity.detail));

  if (activeFilter === "wellness") return activity.activityType === "supplement" || (activity.activityType === "wellness" && !isMedicalWellnessDetail(activity.detail));

  if (activeFilter === "care") return activity.activityType === "care";

  if (activeFilter === "other") return activity.activityType === "other";

  if (activeFilter === "allFood") return ["food", "treat"].includes(activity.activityType);

  if (activeFilter === "uploads") return hasUploadRecord(activity);

  if (activeFilter === "medicalRecords") return hasMedicalRecordTag(activity);

  if (activeFilter === "vetProcedures") return isVetVisitOrProcedure(activity);

  return false;

}

function timelineItemMatchesHistoryFilter(item: HistoryDay["timelineItems"][number], activeFilter: HistoryFilter) {

  if (activeFilter === "all") return true;

  if (activeFilter === "allFood") return item.activityType === "meal" || ["food", "treat"].includes(item.activityType);

  if (activeFilter === "potty") return ["pee", "poop", "potty"].includes(item.activityType);

  if (activeFilter === "activity") return item.activityType === "activity";

  if (activeFilter === "medical") return ["sick", "medication"].includes(item.activityType) || (item.activityType === "wellness" && isMedicalWellnessDetail(item.detail));

  if (activeFilter === "wellness") return item.activityType === "supplement" || (item.activityType === "wellness" && !isMedicalWellnessDetail(item.detail));

  if (activeFilter === "care") return item.activityType === "care";

  if (activeFilter === "other") return item.activityType === "other";

  return false;

}

export default function HistoryPage() {

  const [templates, setTemplates] = useState<MealTemplate[]>([]);

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

        setTemplates(state.templates);

        setMealLogs(state.mealLogs ?? []);

        const [supplements, medications] = await Promise.all([
          loadCareTemplatesFromSupabase("supplement"),
          loadCareTemplatesFromSupabase("medication"),
        ]);

        setCareTemplates([...supplements, ...medications]);

        setActivityLogs(state.activityLogs);

        setManualAlerts(state.manualAlerts ?? []);

        setWeightLogs(state.weightLogs ?? []);

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



  const historyDays = useMemo<HistoryDay[]>(() => {

    const templatesById = new Map(templates.map((template) => [template.id, template]));

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



    mealLogs.forEach((meal) => {

      const day = meal.dayKey ?? inferMealHistoryDate(meal.actualTime);

      const key = `${day}-${meal.mealId}`;

      const existing = latestMealsByDayAndMealId.get(key);



      if (!existing || (meal.createdAt ?? "") >= (existing.createdAt ?? "")) {

        latestMealsByDayAndMealId.set(key, meal);

      }

    });



    latestMealsByDayAndMealId.forEach((meal) => {

      const template = templatesById.get(meal.mealId);

      const day = meal.dayKey ?? inferMealHistoryDate(meal.actualTime);

      const targetDay = ensureDay(day);

      const skippedCareItemIds = meal.skippedCareItemIds ?? [];

      const mealCareItems = careItemsForMeal(careTemplates, meal.mealId).map((item) => ({

        ...item,

        skipped: skippedCareItemIds.includes(careItemKey(item)),

      }));



      targetDay.meals.push({

        id: meal.mealId,

        name: meal.mealName || template?.name || "Meal",

        food: meal.food,

        notes: meal.defaultNotes,

        fedNotes: meal.fedNotes,

        careItems: mealCareItems,

        actualTime: meal.actualTime,

      });



      const missedMeal = isMissedMealRecord(meal);
      const skippedMeal = isSkippedMealRecord(meal);

      targetDay.timelineItems.push({

        key: meal.id,

        time: meal.actualTime,

        label: missedMeal ? "Missed Meal" : skippedMeal ? "Skipped Meal" : "Fed",

        detail: missedMeal || skippedMeal

          ? `${meal.mealName}: ${meal.food}`

          : meal.fedNotes

          ? `${meal.mealName}: ${meal.food} • Notes: ${meal.fedNotes}`

          : `${meal.mealName}: ${meal.food}`,

        activityType: "meal",

        sortMinutes: parseClockMinutes(meal.actualTime),

        sortKey: `meal-${meal.id}`,

      });



      mealCareItems.forEach((item) => {

        targetDay.timelineItems.push({

          key: `${meal.id}-${item.kind}-${item.id}${item.skipped ? "-skipped" : ""}`,

          time: meal.actualTime,

          label: item.skipped ? `Skipped ${careKindLabel(item.kind)}` : careKindLabel(item.kind),

          detail: `${item.name}${item.skipped ? " • Skipped" : item.dose ? ` • ${item.dose}` : ""}${!item.skipped && item.notes ? ` • ${item.notes}` : ""}`,

          activityType: item.kind,

          sortMinutes: parseClockMinutes(meal.actualTime),

          sortKey: `meal-${meal.id}-${item.kind}-${item.id}${item.skipped ? "-skipped" : ""}`,

        });

      });

    });



    const hiddenMissedCareActivityIds = hiddenDuplicateMissedCareActivityIds(activityLogs);

    activityLogs.forEach((activity) => {

      if (hiddenMissedCareActivityIds.has(activity.id)) return;

      const day = historyDayKeyFromDate(new Date(activity.happenedAt));

      const targetDay = ensureDay(day);



      targetDay.activities.push(activity);

      targetDay.timelineItems.push({

        key: activity.id,

        time: formatActivityTime(activity.happenedAt),

        label: formatActivityLabel(activity.activityType),

        detail: renderActivityDetail(activity),

        activity,

        activityType: activity.activityType,

        sortMinutes: new Date(activity.happenedAt).getHours() * 60 + new Date(activity.happenedAt).getMinutes(),

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

          detail: `${alert.title}: ${alert.message}`,

          activityType: "manual",

          sortMinutes: createdAt.getHours() * 60 + createdAt.getMinutes(),

          sortKey: `${alert.id}-created`,

        });

      }



      if (resolvedAt) {

        const resolvedDay = historyDayKeyFromDate(resolvedAt);

        ensureDay(resolvedDay).timelineItems.push({

          key: `${alert.id}-resolved`,

          time: formatActivityTime(alert.resolvedAt as string),

          label: "Alert Resolved",

          detail: `${alert.title}: ${alert.message}`,

          activityType: "manual",

          sortMinutes: resolvedAt.getHours() * 60 + resolvedAt.getMinutes(),

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

        meals: [...day.meals].sort((a, b) => parseClockMinutes(a.actualTime) - parseClockMinutes(b.actualTime)),

        activities: [...day.activities].sort(compareActivitiesChronological),

        weights: [...day.weights].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)),

        timelineItems: [...day.timelineItems].sort((a, b) => a.sortMinutes - b.sortMinutes || a.sortKey.localeCompare(b.sortKey)),

      }));

  }, [activityLogs, careTemplates, manualAlerts, mealLogs, templates, weightLogs]);

  const filteredHistoryDays = useMemo(() => {

    return historyDays

      .filter((day) => (!startDate || day.day >= startDate) && (!endDate || day.day <= endDate))

      .map((day) => {

        if (activeFilter === "all") return day;

        const meals = activeFilter === "allFood" ? day.meals : [];

        const activities = day.activities.filter((activity) => activityMatchesHistoryFilter(activity, activeFilter));

        const weights: WeightLog[] = [];

        const timelineItems = day.timelineItems.filter((item) => timelineItemMatchesHistoryFilter(item, activeFilter));

        return { ...day, meals, activities, weights, timelineItems };

      })

      .filter((day) => day.meals.length || day.activities.length || day.weights.length || day.timelineItems.length);

  }, [activeFilter, endDate, historyDays, startDate]);

  useEffect(() => {

    if (!filteredHistoryDays.length) {

      setSelectedDay(null);

      return;

    }

    if (!selectedDay || !filteredHistoryDays.some((day) => day.day === selectedDay)) {

      setSelectedDay(filteredHistoryDays[0].day);

      const [year, month] = filteredHistoryDays[0].day.split("-").map(Number);

      setCalendarMonth(new Date(year, month - 1, 1));

    }

  }, [filteredHistoryDays, selectedDay]);

  const historyDaysByKey = useMemo(() => {

    return new Map(filteredHistoryDays.map((day) => [day.day, day]));

  }, [filteredHistoryDays]);

  const selectedHistoryDay = selectedDay ? historyDaysByKey.get(selectedDay) ?? null : null;

  const selectedDayAlerts = selectedHistoryDay?.timelineItems.filter((item) => item.activityType === "manual") ?? [];

  const selectedDayActivities = selectedHistoryDay?.activities ?? [];

  const eventFilterOptions: Array<{ id: HistoryFilter; label: string }> = [

    { id: "all", label: "All" },

    { id: "potty", label: "Potty" },

    { id: "allFood", label: "Food (All)" },

    { id: "activity", label: "Activity" },

    { id: "medical", label: "Health" },

    { id: "wellness", label: "Wellness" },

    { id: "care", label: "Care" },

    { id: "other", label: "Other" },

  ];

  const recordFilterOptions: Array<{ id: HistoryFilter; label: string }> = [

    { id: "uploads", label: "Photos / Documents" },

    { id: "vetProcedures", label: "Vet Visits / Procedures" },

    { id: "medicalRecords", label: "Medical Records" },

  ];

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

  };

  const clearFilters = () => {

    setActiveFilter("all");

    setDraftFilter("all");

    setStartDate("");

    setEndDate("");

    setDraftStartDate("");

    setDraftEndDate("");

    setShowFilters(false);

    const latestDay = historyDays[0]?.day;

    if (latestDay) {

      setSelectedDay(latestDay);

      const [year, month] = latestDay.split("-").map(Number);

      setCalendarMonth(new Date(year, month - 1, 1));

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

      const hasMedicalRecord = day?.activities.some((activity) => ["sick", "medication"].includes(activity.activityType) || (activity.activityType === "wellness" && isMedicalWellnessDetail(activity.detail))) ?? false;

      const hasWellnessRecord = day?.activities.some((activity) => activity.activityType === "supplement" || (activity.activityType === "wellness" && !isMedicalWellnessDetail(activity.detail))) ?? false;

      const hasOtherRecord = day?.activities.some((activity) => activity.activityType === "other") ?? false;

      const dotClasses = day

        ? [

          hasMedicalRecord ? "bg-sky-500" : null,

          hasWellnessRecord ? "bg-rose-500" : null,

          hasOtherRecord ? "bg-[#8f8f98]" : null,

        ].filter(Boolean) as string[]

        : [];

      return {

        key,

        date,

        inMonth: date.getMonth() === month,

        hasData: Boolean(day),

        dotClasses,

      };

    });

  }, [calendarMonth, historyDaysByKey]);

  const isFilteredView = activeFilter !== "all" || Boolean(startDate) || Boolean(endDate);

  const showEventFeed = selectedHistoryDay && activeFilter === "all";

  const showMeals = selectedHistoryDay && (activeFilter === "all" || activeFilter === "allFood");

  const showActivities = selectedHistoryDay && ["all", "allFood", "potty", "activity", "medical", "wellness", "care", "other", "uploads", "medicalRecords", "vetProcedures"].includes(activeFilter);

  const showWeights = selectedHistoryDay && activeFilter === "all";

  const showAlerts = selectedHistoryDay && activeFilter === "all";



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

          <div className="flex items-start justify-between gap-3">

            <div>

              <Link href="/hewie" className="text-sm font-bold text-[var(--hewie-active-text,#6d28d9)]">

                Hewster&apos;s Notebook

              </Link>

              <h1 className="mt-1 text-xl font-bold tracking-tight text-zinc-700">History</h1>

            </div>

            <PetAvatarMenu className="mt-0.5 size-20 rounded-full object-cover object-center ring-1 ring-zinc-500/60 shadow-sm" />

          </div>

          <p className="mt-1 text-sm leading-5 text-zinc-600">

            Daily History Of Meals, Activities, Notes, And Weight Entries.

          </p>

        </header>



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

            <div className="space-y-4 border-b border-[var(--hewie-ring,#cbd5e1)]/70 bg-[var(--hewie-active-bg,#f1f5f9)] p-5">

              <div className="space-y-3">

                <div>

                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">Events</p>

                  <div className="flex gap-2 overflow-x-auto pb-1">

                    {eventFilterOptions.map((option) => (

                      <button

                        key={option.id}

                        type="button"

                        onClick={() => setDraftFilter(option.id)}

                        className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ring-1 transition ${

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

                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">Records</p>

                  <div className="flex gap-2 overflow-x-auto pb-1">

                    {recordFilterOptions.map((option) => (

                      <button

                        key={option.id}

                        type="button"

                        onClick={() => setDraftFilter(option.id)}

                        className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ring-1 transition ${

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

              </div>



              <div className="space-y-3 rounded-2xl bg-white/55 p-3 ring-1 ring-[var(--hewie-ring,#cbd5e1)]/70">

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

                    Filter

                  </Button>

                  <Button type="button" className="rounded-full bg-[var(--hewie-accent,#64748b)] text-[var(--hewie-accent-text,#ffffff)] disabled:opacity-60" disabled>

                    Send Copy

                  </Button>

                </div>

                <p className="text-xs text-zinc-500">PDF copy will be available once account email is set up.</p>

              </div>

            </div>

          ) : null}



          {isFilteredView ? (

            <div className="border-b border-[var(--hewie-ring,#cbd5e1)]/70 bg-white/45 px-5 py-3">

              <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/70 px-3 py-2 ring-1 ring-[var(--hewie-ring,#cbd5e1)]/70">

                <p className="text-xs font-semibold text-[var(--hewie-active-text,#334155)]/70">Filtered results</p>

                <Button type="button" variant="outline" className="h-8 rounded-full px-3 text-xs font-bold" onClick={clearFilters}>

                  Clear Filters

                </Button>

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

                  disabled={!cell.hasData}

                  onClick={() => setSelectedDay(cell.key)}

                  className={`relative flex h-12 flex-col items-center justify-center rounded-2xl text-sm font-semibold transition ${

                    !cell.inMonth

                      ? "text-[var(--hewie-active-text,#334155)]/15"

                      : selected

                        ? "bg-[var(--hewie-accent,#64748b)] text-[var(--hewie-accent-text,#ffffff)] ring-1 ring-white/60"

                        : cell.hasData

                          ? "bg-white/70 text-[var(--hewie-active-text,#334155)] ring-1 ring-[var(--hewie-ring,#cbd5e1)] hover:bg-white/85"

                          : "bg-white/25 text-[var(--hewie-active-text,#334155)]/45 ring-1 ring-[var(--hewie-ring,#cbd5e1)]/35"

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

              <h2 className="text-lg font-semibold">{isFilteredView ? "Filtered Results" : selectedHistoryDay ? formatDayLabel(selectedHistoryDay.day) : "Select A Day"}</h2>

              <p className="text-sm text-zinc-500">

                {isFilteredView

                  ? `${filteredHistoryDays.length} matching day${filteredHistoryDays.length === 1 ? "" : "s"}`

                  : selectedHistoryDay

                    ? [

                        `${selectedHistoryDay.meals.length} meals`,

                        `${selectedHistoryDay.activities.length} events`,

                        selectedHistoryDay.weights.length ? `${selectedHistoryDay.weights.length} weights` : null,

                      ].filter(Boolean).join(" • ")

                    : "Days with records have dots on the calendar."}

              </p>

            </div>

          </div>



          {isFilteredView ? (

            filteredHistoryDays.length ? (

              <div className="space-y-4">

                {filteredHistoryDays.map((day) => (

                  <div key={`filtered-${day.day}`} className="space-y-2">

                    <h3 className="text-sm font-semibold text-zinc-700">{formatDayLabel(day.day)}</h3>

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

                          <p className="text-sm text-zinc-500">{meal.actualTime}</p>

                        </div>

                        <p className="mt-2 text-sm text-zinc-600">{meal.food}</p>

                        {meal.fedNotes && !missedMeal && !skippedMeal ? <p className="mt-1 text-sm font-bold text-zinc-700">Notes: {meal.fedNotes}</p> : null}

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

                          {["pee", "poop", "potty"].includes(activity.activityType) && pottyDetailForBadge(activity) ? (

                            <PottyDetailBadges detail={pottyDetailForBadge(activity)} notes={activity.notes} />

                          ) : activity.activityType === "treat" ? (

                            <div className="mt-2 space-y-1 text-sm text-zinc-600">

                              {splitTreatDetailText(renderActivityDetail(activity)).summary ? <p>{splitTreatDetailText(renderActivityDetail(activity)).summary}</p> : null}

                              {splitTreatDetailText(renderActivityDetail(activity)).notes ? <p>Notes: {splitTreatDetailText(renderActivityDetail(activity)).notes}</p> : null}

                            </div>

                          ) : (

                            <ActivityDetailAndNotes activity={activity} />

                          )}

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

                  <div className="space-y-3 rounded-2xl bg-zinc-50/80 p-4 ring-1 ring-zinc-200">

                    {selectedHistoryDay.timelineItems.map((item) => {

                      const treatParts = item.activityType === "treat" ? splitTreatDetailText(item.detail) : null;

                      const careActivity = item.activity && ["medication", "supplement"].includes(item.activityType) ? item.activity : null;

                      const missed = item.label.toLowerCase().includes("missed");

                      const skipped = item.label.toLowerCase().includes("skipped");

                      return (

                        <div key={item.key} className="grid grid-cols-[1.25rem_1fr] gap-3">

                          <div className="flex w-5 justify-center">
                            <EventFeedMarker activityType={item.activityType} />
                          </div>

                          <div className="min-w-0">

                            <div className="flex flex-wrap items-center gap-2">

                              <p className="text-sm font-medium text-zinc-900">

                                {item.label} <span className="font-normal text-zinc-500">At {item.time}</span>

                              </p>

                              {missed ? <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-200/80">Missed</span> : null}

                              {skipped ? <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-200/80">Skipped</span> : null}

                            </div>

                            {careActivity ? (

                              <CareActivityDetail activity={careActivity} />

                            ) : treatParts ? (

                              <>

                                {treatParts.summary ? <p className="mt-1 text-sm text-zinc-500">{treatParts.summary}</p> : null}

                                {treatParts.notes ? <p className="mt-1 text-sm text-zinc-500">Notes: {treatParts.notes}</p> : null}

                              </>

                            ) : item.detail.includes(" • Notes: ") ? (

                              <>

                                <p className="mt-1 text-sm text-zinc-500">{item.detail.split(" • Notes: ")[0]}</p>

                                <p className="mt-1 text-sm font-bold text-zinc-700">• Notes: {item.detail.split(" • Notes: ")[1]}</p>

                              </>

                            ) : item.detail ? (

                              <p className="mt-1 text-sm text-zinc-500">{item.detail}</p>

                            ) : null}

                          </div>

                        </div>

                      );

                    })}

                  </div>

                </div>

              ) : null}



              {showMeals && selectedHistoryDay.meals.length ? (

                <div>

                  <h3 className="mb-2 text-sm font-semibold text-[#6b3f22]">Meals</h3>

                  <div className="space-y-2">

                    {selectedHistoryDay.meals.map((meal) => {

                      const missedMeal = isMissedMealRecord(meal);
                      const skippedMeal = isSkippedMealRecord(meal);

                      return (

                      <article key={`${selectedHistoryDay.day}-meal-${meal.id}-${meal.actualTime}`} className="rounded-2xl bg-[#f4eadf]/90 p-4 ring-1 ring-[#d8b895]">

                        <div className="flex items-center justify-between gap-3">

                          <div className="flex min-w-0 items-center gap-2">

                            <p className="font-medium text-zinc-900">{meal.name}</p>

                            {missedMeal ? <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-200/80">Missed</span> : null}
                            {skippedMeal ? <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-200/80">Skipped</span> : null}

                          </div>

                          <p className="text-sm text-zinc-500">{meal.actualTime}</p>

                        </div>

                        <p className="mt-2 text-sm text-zinc-600">{meal.food}</p>

                        {meal.notes ? <p className="mt-1 text-sm text-zinc-500">Default Notes: {meal.notes}</p> : null}

                        {meal.fedNotes && !missedMeal && !skippedMeal ? <p className="mt-1 text-sm font-bold text-zinc-700">Notes: {meal.fedNotes}</p> : null}

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

                  <h3 className="mb-2 text-sm font-semibold text-zinc-700">Events</h3>

                  <div className="space-y-2">

                    {selectedDayActivities.map((activity) => {

                      const displayType = activity.detail === "Hike" ? "hike" : (["pee", "poop"].includes(activity.activityType) ? "potty" : activity.activityType);

                      const style = getActivityStyle(displayType);

                      const Icon = style.icon;

                      return (

                        <article key={activity.id} className={`rounded-2xl p-4 ring-1 ${style.card}`}>

                          <div className="flex items-center justify-between gap-3">

                            <div className="flex items-center gap-3">

                              <span className={`flex size-9 items-center justify-center rounded-full ${style.iconWrap}`}>

                                {Icon ? <Icon className="size-4.5" /> : <span className="text-lg leading-none">{style.iconText}</span>}

                              </span>

                              <p className="font-medium text-zinc-900">{displayActivityLabel(activity)}</p>

                            </div>

                            <p className="text-sm text-zinc-500">{formatActivityTime(activity.happenedAt)}</p>

                          </div>

                          {["pee", "poop", "potty"].includes(activity.activityType) && pottyDetailForBadge(activity) ? (

                            <PottyDetailBadges detail={pottyDetailForBadge(activity)} notes={activity.notes} />

                          ) : activity.activityType === "treat" ? (

                            <div className="mt-2 space-y-1 text-sm text-zinc-600">

                              {splitTreatDetailText(renderActivityDetail(activity)).summary ? <p>{splitTreatDetailText(renderActivityDetail(activity)).summary}</p> : null}

                              {splitTreatDetailText(renderActivityDetail(activity)).notes ? <p>Notes: {splitTreatDetailText(renderActivityDetail(activity)).notes}</p> : null}

                            </div>

                          ) : (

                            <ActivityDetailAndNotes activity={activity} />

                          )}

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

                        {weight.note ? <p className="mt-1 text-sm text-zinc-500">{weight.note}</p> : null}

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

                          <p className={`mt-1 whitespace-pre-wrap text-sm ${resolved ? "text-[#b71f48]/55" : "text-[#b71f48]/72"}`}>{item.detail}</p>

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

          ) : (

            <p className="rounded-2xl bg-zinc-50 p-4 text-sm text-zinc-500 ring-1 ring-zinc-200">No saved history yet.</p>

          )}

        </section>



        <BottomNav />

      </div>

    </main>

  );

}

