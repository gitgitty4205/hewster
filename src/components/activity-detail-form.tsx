"use client";



import { useEffect, useState } from "react";
import { Camera, Images } from "lucide-react";

import { Button } from "@/components/ui/button";

import type { ActivityType } from "@/lib/hewster-data";

import type { CareItemTemplate } from "@/lib/care-settings";

import { formatActivityLabel } from "@/lib/activity";
import { TEXT_LIMITS, clampText } from "@/lib/text-limits";

import {
  PET_THEME_UPDATED_EVENT,
  appThemes,
  applyPetTheme,
  loadUserTheme,
  type ThemeId,
} from "@/lib/pet-profile";

const MAX_ATTACHMENT_FILES = 5;
const MAX_EVENT_TITLE_LENGTH = TEXT_LIMITS.shortName;



type Props = {

  activityType: ActivityType;

  detail: string;

  notes: string;

  extraNotes?: string;

  happenedAt: string;

  isEditing?: boolean;

  embedded?: boolean;

  saveLabel?: string;

  onDetailChange: (value: string) => void;

  onNotesChange: (value: string) => void;

  onExtraNotesChange?: (value: string) => void;

  attachmentFiles?: File[];

  attachmentNames?: string[];

  onAttachmentsChange?: (files: File[]) => void;

  onAttachmentNameRemove?: (index: number) => void;

  maxAttachmentFiles?: number;

  attachmentLimitMessage?: string;

  recordTags?: string[];

  onRecordTagsChange?: (tags: string[]) => void;

  onHappenedAtChange: (value: string) => void;

  onSave: () => void;

  onCancel: () => void;

  onDelete?: () => void;

  saving: boolean;

  savedCareItems?: CareItemTemplate[];

};



const presets: Record<ActivityType, string[]> = {

  potty: ["Pee", "Poop", "Pee & Poop", "No Poop"],

  pee: [],

  poop: [

    "No Poop",

    "Type 1: Very Firm, Small Pieces",

    "Type 2: Firm, Uneven Log",

    "Type 3: Formed Log, Light Cracks",

    "Type 4: Smooth, Well-Formed",

    "Type 5: Soft, Formed Pieces",

    "Type 6: Very Soft, Loose Pieces",

    "Type 7: Fully Liquid",

  ],

  activity: ["Walk", "Play", "Training", "Run", "Hike", "Swim", "Other"],

  outdoor: ["Walk", "Play", "Training", "Run", "Hike", "Swim", "Other"],

  care: ["Daycare", "Boarding"],

  wellness: ["Supplements", "Dental Care", "Bath / Grooming", "Nail Trim", "Ear Cleaning", "Eye Care"],

  hike: ["Short Hiking", "Long Hike"],

  treat: ["Regular Treat", "New Treat", "Training Treats", "Dental Chew / Chew", "Other"],

  food: [],

  supplement: ["Supplement Name", "Given", "Skipped", "Missed", "Dose Change", "Reminder", "Refill Date"],

  medication: ["Given", "Skipped", "Missed"],

  sick: [],

  other: [],

};



const groupedPresets: Partial<Record<ActivityType, Array<{ label: string; options: string[] }>>> = {

  potty: [

    {

      label: "Event",

      options: ["Pee", "Poop", "Pee & Poop", "No Poop"],

    },

    {

      label: "Bristol Stool Scale",

      options: [

        "Type 1: Very Firm, Small Pieces",

        "Type 2: Firm, Uneven Log",

        "Type 3: Formed Log, Light Cracks",

        "Type 4: Smooth, Well-Formed",

        "Type 5: Soft, Formed Pieces",

        "Type 6: Very Soft, Loose Pieces",

        "Type 7: Fully Liquid",

      ],

    },

  ],

  activity: [

    {

      label: "Activity",

      options: ["Walk", "Play", "Training", "Run", "Hike", "Swim", "Other"],

    },

  ],

  outdoor: [

    {

      label: "Activity",

      options: ["Walk", "Play", "Training", "Run", "Hike", "Swim", "Other"],

    },

  ],

  care: [

    {

      label: "Care Type",

      options: ["Daycare", "Drop-In Visit", "Pet Sitting", "Boarding", "Other"],

    },

  ],

  wellness: [

    {

      label: "Wellness Type",

      options: ["Supplements", "Dental Care", "Bath / Grooming", "Nail Trim", "Ear Cleaning", "Eye Care", "Other"],

    },

  ],

  medication: [

    {

      label: "Status",

      options: ["Given", "Skipped", "Missed"],

    },

  ],

  other: [],

};



const notesPlaceholders: Record<ActivityType, string> = {

  potty: "Optional Potty Notes, Location, Quality, Or Anything Unusual",

  pee: "Optional Note",

  poop: "Optional Poop Notes, Location, Quality, Or Anything Unusual",

  activity: "Location, duration, behavior, or anything notable",

  outdoor: "Location, duration, behavior, or anything notable",

  care: "Pickup, drop-off, or care notes",

  wellness: "Optional Notes Or Anything Notable",

  hike: "Route, Weather, Duration, Behavior, Or Anything Notable",

  treat: "Treat Name/Details - Beef Liver, Licky Mat, Bully Stick, Kong, Amount, Or Reason",

  food: "Food Details, Amount, Appetite, Or Anything Unusual",

  supplement: "Supplement Name, Dose, Frequency, Given/Missed, Reminder Timing, And Refill Date If Needed",

  medication: "Medication Name, Dose, Schedule, Skip Reason, Or Vet Instructions",

  sick: "Symptoms, Vet Notes, Medication, Prevention, Follow-Up, Records, Or Invoice Details",

  other: "Add any details or context you want to remember",

};



function bristolScaleClasses(value: string, selected: boolean) {

  const normalized = value.trim().toLowerCase();
  const bristolType = normalized.match(/^type\s+([1-7])\b/)?.[1];



  switch (normalized) {

    case "pee":

      return selected ? "bg-[#f3dda0] text-[#4f3a00] ring-[#d8b95b] shadow-sm" : "bg-[#fff7dc]/70 text-[#6f5200] ring-[#f0d27a]/50 hover:bg-[#fff7dc]";

    case "poop":

      return selected ? "bg-orange-200 text-orange-950 ring-[#c17a2b] shadow-sm" : "bg-orange-50/60 text-orange-800 ring-orange-200/50 hover:bg-orange-50";

    case "pee & poop":

      return selected ? "bg-gradient-to-r from-[#f0d27a] to-orange-200 text-orange-950 ring-[#caa34d] shadow-sm" : "bg-orange-50/60 text-orange-800 ring-orange-200/50 hover:bg-orange-50";

    case "no poop":

      return selected ? "bg-zinc-200 text-zinc-900 ring-zinc-600 shadow-sm" : "bg-zinc-50/70 text-zinc-700 ring-zinc-300/70 hover:bg-zinc-50";
  }



  switch (bristolType) {

    case "1":

    case "2":

      return selected ? "bg-stone-300 text-stone-950 ring-stone-500 shadow-sm" : "bg-stone-50 text-stone-800 ring-stone-200/60 hover:bg-stone-100";

    case "3":

      return selected ? "bg-orange-200 text-orange-950 ring-[#c17a2b] shadow-sm" : "bg-orange-50/60 text-orange-800 ring-orange-200/50 hover:bg-orange-50";

    case "4":

      return selected ? "bg-amber-200 text-amber-950 ring-[#c99a2e] shadow-sm" : "bg-amber-50/60 text-amber-800 ring-amber-200/50 hover:bg-amber-50";

    case "5":

      return selected ? "bg-orange-200 text-orange-950 ring-[#c17a2b] shadow-sm" : "bg-orange-50/60 text-orange-800 ring-orange-200/50 hover:bg-orange-50";

    case "6":

      return selected ? "bg-rose-200 text-rose-950 ring-[#c86b7d] shadow-sm" : "bg-rose-50/60 text-rose-800 ring-rose-200/50 hover:bg-rose-50";

    case "7":

      return selected ? "bg-rose-300 text-rose-950 ring-[#c86b7d] shadow-sm" : "bg-rose-50/70 text-rose-800 ring-rose-200/60 hover:bg-rose-50";

    default:

      return selected ? "bg-zinc-100 text-zinc-800 ring-zinc-300 shadow-sm" : "bg-white text-zinc-600 ring-zinc-200 hover:bg-zinc-50";

  }

}



function activityPresetClasses(activityType: ActivityType, selected: boolean) {

  if (!selected) return "bg-white text-zinc-600 ring-zinc-200 hover:bg-zinc-50";



  switch (activityType) {

    case "activity":

    case "outdoor":

    case "hike":

      return "bg-emerald-50 text-emerald-700 ring-emerald-200";

    case "care":

      return "bg-purple-50 text-purple-700 ring-purple-200";

    case "wellness":

      return "bg-rose-50 text-[#a44f68] ring-[#e0b4bf]";

    case "medication":

      return "bg-sky-50 text-sky-700 ring-sky-200";

    case "supplement":

      return "bg-[#eaf0f8] text-[#1f3d5c] ring-[#b8c9dd]";

    case "treat":

      return "bg-orange-50 text-orange-700 ring-orange-200";

    case "food":

      return "bg-[#ead8c5] text-[#6b3f22] ring-[#caa57f]";

    case "sick":

      return "bg-sky-50 text-sky-700 ring-sky-200";

    case "other":

      return "bg-zinc-100 text-zinc-700 ring-zinc-200";

    default:

      return "bg-white text-zinc-600 ring-zinc-200 hover:bg-zinc-50";

  }

}



function presetButtonClasses(activityType: ActivityType, preset: string, selected: boolean) {

  const classes = activityType === "potty" || activityType === "poop"

    ? bristolScaleClasses(preset, selected)

    : activityPresetClasses(activityType, selected);
  const sizeClasses = activityType === "potty" || activityType === "poop"
    ? "px-3 py-2 text-xs leading-snug"
    : "px-3 py-2 text-sm";



  return `rounded-full ${sizeClasses} font-medium transition ${selected ? "ring-2" : "ring-1"} ${classes}`;

}



const pottyEvents = ["Pee", "Poop", "Pee & Poop", "No Poop"];

const procedureDetails = ["Dental Procedure", "Spay / Neuter", "Other"];

const dentalProcedureDetails = ["No Extraction", "Extraction"];

const spayNeuterDetails = ["Spay", "Neuter"];

const sickSymptomOptions = ["Digestive", "Respiratory", "Skin", "Ear", "Eye", "Urinary", "Mobility / Pain", "Neurological", "Behavior", "Other Symptoms"];

const otherVetMedicalDetail = "Other Health";
const legacyOtherVetMedicalDetail = "Other Vet / Medical";
const legacyOtherMedicalDetail = "Other Medical";
const sickMedicalOptions = ["Vet Visit", "Medication", "Injection", otherVetMedicalDetail];

type SickLogMode = "symptom" | "medical" | "";

function sickLogModeFromDetail(detail: string): SickLogMode {
  if (!detail) return "";
  if (sickSymptomOptions.includes(detail)) return "symptom";
  if (sickMedicalOptions.some((option) => detail === option || detail.startsWith(`${option}: `))) return "medical";
  if (["Wellness Exam", "Sick Consult", "Vaccine", "Injection", "Flea & Tick", "Deworming", "Lab / Test", "Procedure", otherVetMedicalDetail, legacyOtherVetMedicalDetail, legacyOtherMedicalDetail].some((option) => detail.includes(option))) return "medical";
  return "symptom";
}



function PeeSplash() {

  return <span className="text-base leading-none">{"\u{1F4A6}"}</span>;

}



function PottyEventIcon({ event }: { event: string }) {

  if (event === "Pee") {

    return <PeeSplash />;

  }



  if (event === "Poop") {

    return <span className="text-base leading-none">{"\u{1F4A9}"}</span>;

  }



  if (event === "Pee & Poop") {

    return (

      <span className="flex items-center gap-1">

        <PeeSplash />

        <span className="text-base leading-none">{"\u{1F4A9}"}</span>

      </span>

    );

  }



  if (event === "No Poop") {

    return <span className="text-base leading-none">{"\u{1F6AB}"}</span>;

  }



  return null;

}



function presetButtonContent(activityType: ActivityType, groupLabel: string, preset: string) {

  if (activityType === "potty" && groupLabel === "Event") {

    return (

      <span className="flex items-center justify-center gap-2">

        <PottyEventIcon event={preset} />

        <span>{preset}</span>

      </span>

    );

  }



  return preset;

}



function isBristolScaleValue(value: string) {

  return value.trim().toLowerCase().startsWith("type ");

}



function pottyEventFromDetail(value: string) {

  return (

    pottyEvents.find((event) => value === event) ??

    [...pottyEvents]

      .sort((a, b) => b.length - a.length)

      .find((event) => value.startsWith(`${event} `)) ??

    ""

  );

}



function bristolScaleFromDetail(value: string) {

  return value.match(/Type \d: [^•]+/)?.[0]?.trim() ?? "";

}



function isPresetSelected(activityType: ActivityType, preset: string, detail: string) {

  if ((activityType === "wellness" || activityType === "sick") && preset === "Procedure") {

    return detail === preset || detail.startsWith(`${preset}: `);

  }

  if (activityType === "sick" && preset === otherVetMedicalDetail) {

    return isOtherMedicalDetail(detail);

  }



  if (activityType !== "potty") return detail === preset;

  if (pottyEvents.includes(preset)) return pottyEventFromDetail(detail) === preset;

  if (isBristolScaleValue(preset)) {

    return pottyEventFromDetail(detail) !== "No Poop" && bristolScaleFromDetail(detail) === preset;

  }

  return detail === preset;

}



function nextDetailValue(activityType: ActivityType, preset: string, detail: string) {

  void detail;

  if (activityType === "sick" && preset === otherVetMedicalDetail) return otherVetMedicalDetail;

  if (activityType === "wellness") return preset;

  if (activityType === "sick") return preset;

  if (activityType !== "potty") return preset;



  const currentEvent = pottyEventFromDetail(detail);

  const currentBristol = bristolScaleFromDetail(detail);



  if (pottyEvents.includes(preset)) {

    return currentBristol && ["Poop", "Pee & Poop"].includes(preset) ? `${preset} • ${currentBristol}` : preset;

  }



  if (isBristolScaleValue(preset)) {

    const event = currentEvent && !["Pee", "No Poop"].includes(currentEvent) ? currentEvent : "Poop";

    return `${event} • ${preset}`;

  }



  return preset;

}



function isDentalProcedureDetail(detail: string) {

  return detail === "Procedure: Dental Procedure" || detail.startsWith("Procedure: Dental Procedure - ");

}



function nextDentalProcedureDetailValue(preset: string) {

  return `Procedure: Dental Procedure - ${preset}`;

}



function dentalExtractionCount(detail: string) {

  return detail.match(/Extraction \((\d+) teeth?\)/)?.[1] ?? "";

}



function dentalExtractionDetailValue(count: string) {

  const trimmedCount = count.trim();

  return trimmedCount ? `Procedure: Dental Procedure - Extraction (${trimmedCount} ${trimmedCount === "1" ? "tooth" : "teeth"})` : "Procedure: Dental Procedure - Extraction";

}



function isSpayNeuterDetail(detail: string) {

  return detail === "Procedure: Spay / Neuter" || detail.startsWith("Procedure: Spay / Neuter - ");

}



function nextSpayNeuterDetailValue(preset: string) {

  return `Procedure: Spay / Neuter - ${preset}`;

}



function isProcedureDetail(detail: string) {

  return detail === "Procedure" || detail.startsWith("Procedure: ");

}



function nextProcedureDetailValue(preset: string) {

  return `Procedure: ${preset}`;

}



function sickSymptomFromDetail(detail: string) {

  return detail.split(": ")[1] ?? "";

}



function isOtherMedicalDetail(detail: string) {

  return detail === otherVetMedicalDetail || detail.startsWith(`${otherVetMedicalDetail}: `) || detail === legacyOtherVetMedicalDetail || detail.startsWith(`${legacyOtherVetMedicalDetail}: `) || detail === legacyOtherMedicalDetail || detail.startsWith(`${legacyOtherMedicalDetail}: `);

}



function displayDetailValue(detail: string) {

  if (isOtherMedicalDetail(detail)) return detail.replace(/^(?:Other Health|Other Vet \/ Medical|Other Vet\/Medical|Other Medical):?\s*/, "");

  return detail;

}

function savedCareItemLabel(item: CareItemTemplate) {

  return `${item.name.trim() || formatActivityLabel(item.kind)}${item.dose ? ` • ${item.dose}` : ""}`;

}

function savedCareItemNotes(item: CareItemTemplate) {

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
    frequency ? `Every ${frequency} Hours • As Needed` : "As Needed",
    item.customTiming === "empty-stomach" ? "Empty Stomach" : "With Food",
    medicationType,
    item.notes ? `Notes: ${item.notes.trim()}` : "",
  ].filter(Boolean).join("\n");

}



export function ActivityDetailForm({

  activityType,

  detail,

  notes,

  extraNotes = "",

  happenedAt,

  isEditing = false,

  embedded = false,

  saveLabel = "Save Details",

  onDetailChange,

  onNotesChange,

  onExtraNotesChange,

  attachmentFiles = [],

  attachmentNames = [],

  onAttachmentsChange,

  onAttachmentNameRemove,

  maxAttachmentFiles = MAX_ATTACHMENT_FILES,

  attachmentLimitMessage,

  onHappenedAtChange,

  onSave,

  onCancel,

  onDelete,

  saving,

  savedCareItems = [],

}: Props) {

  const [themeId, setThemeId] = useState<ThemeId>(() => loadUserTheme());
  const theme = appThemes[themeId];
  const inferredSickLogMode = activityType === "sick" ? sickLogModeFromDetail(detail) : "";
  const [selectedSickLogMode, setSelectedSickLogMode] = useState<SickLogMode>("");
  const sickLogMode = activityType === "sick" ? selectedSickLogMode || inferredSickLogMode : "";



  useEffect(() => {

    const refreshTheme = () => setThemeId(loadUserTheme());
    refreshTheme();
    window.addEventListener(PET_THEME_UPDATED_EVENT, refreshTheme);
    window.addEventListener("storage", refreshTheme);
    return () => {
      window.removeEventListener(PET_THEME_UPDATED_EVENT, refreshTheme);
      window.removeEventListener("storage", refreshTheme);
    };
  }, []);

  useEffect(() => {
    applyPetTheme(themeId);
  }, [themeId]);



  const showTreatDetailField = activityType === "treat" || activityType === "food";

  const showExtraNotesField = (activityType === "treat" || activityType === "food") && onExtraNotesChange;

  const hasSickDetail = activityType !== "sick" || Boolean(detail.trim());
  const showCoreFields = activityType !== "sick" || hasSickDetail;
  const poopPhotoDetail = activityType === "poop" || (activityType === "potty" && /\bpoop\b/i.test(detail) && !/\bno poop\b/i.test(detail));
  const showAttachmentField = Boolean(
    onAttachmentsChange &&
      ((activityType === "sick" && detail === "Vet Visit") ||
        poopPhotoDetail ||
        (isEditing && (attachmentNames.length > 0 || attachmentFiles.length > 0)))
  );

  const isPottyLog = ["potty", "pee", "poop"].includes(activityType);

  const attachmentLabel = poopPhotoDetail ? "Attach Image" : "Add Attachments";

  const attachmentAccept = poopPhotoDetail ? "image/*" : "image/*,.pdf,application/pdf";

  const attachmentHelp = poopPhotoDetail ? "Optional photos for color, texture, or anything unusual." : "Medical notes, certificates, lab reports, invoices, and photos.";

  const showDetailField = activityType === "other" || (activityType === "sick" && (detail === "Other" || sickSymptomFromDetail(detail) === "Other" || isOtherMedicalDetail(detail)));

  const presetGroups = activityType === "sick" ? undefined : groupedPresets[activityType];

  const hasNotesContent = Boolean(notes.trim() || extraNotes.trim());

  const requiresPresetDetail = activityType === "potty" || activityType === "poop";

  const requiresTitleDetail = activityType === "other" || activityType === "sick";

  const visibleSavedCareItems = savedCareItems.filter((item) => {

    if (activityType === item.kind) return true;

    if (activityType === "wellness" && item.kind === "supplement") {

      return detail.toLowerCase().includes("supplement");

    }

    if (activityType !== "sick" || item.kind !== "medication") return false;

    const normalizedDetail = detail.toLowerCase();

    return normalizedDetail === "medication" || normalizedDetail.includes("medication");

  });

  const saveDisabled =

    saving ||

    (requiresPresetDetail && !detail) ||

    (requiresTitleDetail && !detail.trim()) ||

    (!requiresPresetDetail && !requiresTitleDetail && activityType !== "pee" && !detail && !hasNotesContent);

  const displayedAttachments = [
    ...attachmentNames.map((name, index) => ({ name, kind: "existing" as const, index })),
    ...attachmentFiles.map((file, index) => ({ name: file.name, kind: "new" as const, index })),
  ];

  const addAttachmentFiles = (files: File[]) => {

    if (!onAttachmentsChange) return;

    const nextFiles = [...attachmentFiles];
    files
      .filter((file) => !poopPhotoDetail || file.type.startsWith("image/"))
      .slice(0, Math.max(0, maxAttachmentFiles - attachmentNames.length - nextFiles.length))
      .forEach((file) => {
      const alreadyAttached = nextFiles.some((attached) =>
        attached.name === file.name && attached.size === file.size && attached.lastModified === file.lastModified
      );
      if (!alreadyAttached) nextFiles.push(file);
    });

    onAttachmentsChange(nextFiles);

  };

  useEffect(() => {
    if (showAttachmentField || !attachmentFiles.length || !onAttachmentsChange) return;
    onAttachmentsChange([]);
  }, [attachmentFiles.length, onAttachmentsChange, showAttachmentField]);

  const removeAttachmentFile = (index: number) => {

    if (!onAttachmentsChange) return;

    onAttachmentsChange(attachmentFiles.filter((_, fileIndex) => fileIndex !== index));

  };

  const attachmentLimitReached = attachmentNames.length + attachmentFiles.length >= maxAttachmentFiles;
  const attachmentLimitLabel = attachmentLimitMessage ?? "Attachment limit reached.";



  return (

    <section className={embedded ? "mt-3 rounded-[1.5rem] border border-zinc-200 bg-white/85 p-4 shadow-sm" : "rounded-[1.5rem] border border-zinc-200 bg-white/80 p-4"}>

      <div className="mb-4">

        <h2 className="text-lg font-semibold">
          {isEditing ? "Edit" : "Log"} {activityType === "other" ? "Other" : formatActivityLabel(activityType)}
        </h2>

      </div>



      {visibleSavedCareItems.length ? (

        <div className={`mb-4 rounded-2xl p-3 ring-1 ${visibleSavedCareItems.some((item) => item.kind === "supplement") ? "bg-rose-50/60 ring-[#e0b4bf]" : "bg-sky-50/60 ring-sky-100"}`}>

          <p className={`mb-2 text-xs font-semibold uppercase tracking-[0.16em] ${visibleSavedCareItems.some((item) => item.kind === "supplement") ? "text-[#a44f68]" : "text-sky-500"}`}>{visibleSavedCareItems.some((item) => item.kind === "supplement") ? "Saved Supplement" : "Saved Medication"}</p>

          <div className="flex flex-wrap gap-2">

            {visibleSavedCareItems.map((item) => {

              const label = savedCareItemLabel(item);

              const isSupplementShortcut = item.kind === "supplement";

              return (

                <button

                  key={`${item.kind}-${item.id}`}

                  type="button"

                  className={`rounded-full bg-white px-3 py-2 text-sm font-medium ring-1 transition ${isSupplementShortcut ? "text-[#a44f68] ring-[#e0b4bf] hover:bg-rose-50" : "text-sky-700 ring-sky-200 hover:bg-sky-50"}`}

                  onClick={() => {

                    onDetailChange(activityType === "sick" ? "Medication" : activityType === "wellness" && item.kind === "supplement" ? "Supplements" : label);

                    onNotesChange(savedCareItemNotes(item));

                  }}

                >

                  {label}

                </button>

              );

            })}

          </div>

        </div>

      ) : null}

      {activityType === "sick" ? (

        <div className="mb-4 space-y-3 rounded-2xl bg-zinc-50/70 p-3 ring-1 ring-zinc-200">

          <div>

            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">Health Category</p>

            <div className="grid grid-cols-2 gap-2">

              {[
                { label: "Symptoms", value: "symptom" as const },
                { label: "Vet / Medical", value: "medical" as const },
              ].map((mode) => (

                <button
                  key={mode.value}
                  type="button"
                  className={`rounded-2xl px-3 py-3 text-sm font-semibold ring-1 transition ${sickLogMode === mode.value ? "bg-sky-50 text-sky-700 ring-2 ring-sky-200" : "bg-white text-zinc-600 ring-zinc-200 hover:bg-zinc-50"}`}
                  onClick={() => {
                    if (sickLogMode !== mode.value) onDetailChange("");
                    setSelectedSickLogMode(mode.value);
                  }}
                >
                  {mode.label}
                </button>

              ))}

            </div>

          </div>

          {sickLogMode === "symptom" ? (

            <div>

              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">Symptom Type</p>

              <div className="flex flex-wrap gap-2">

                {sickSymptomOptions.map((preset) => (

                  <button
                    key={preset}
                    type="button"
                    className={presetButtonClasses(activityType, preset, isPresetSelected(activityType, preset, detail))}
                    onClick={() => onDetailChange(nextDetailValue(activityType, preset, detail))}
                  >
                    {preset}
                  </button>

                ))}

              </div>

            </div>

          ) : null}

          {sickLogMode === "medical" ? (

            <div>

              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">Vet / Medical</p>

              <div className="flex flex-wrap gap-2">

                {sickMedicalOptions.map((preset) => (

                  <button
                    key={preset}
                    type="button"
                    className={presetButtonClasses(activityType, preset, isPresetSelected(activityType, preset, detail))}
                    onClick={() => onDetailChange(nextDetailValue(activityType, preset, detail))}
                  >
                    {preset}
                  </button>

                ))}

              </div>

              {isProcedureDetail(detail) ? (

                <div className="mt-3 rounded-2xl bg-sky-50/70 p-3 ring-1 ring-sky-100">

                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-sky-500">Procedure Details</p>

                  <div className="flex flex-wrap gap-2">

                    {procedureDetails.map((preset) => {
                      const procedureDetail = nextProcedureDetailValue(preset);

                      return (
                        <button
                          key={preset}
                          type="button"
                          className={presetButtonClasses(activityType, preset, detail === procedureDetail || detail.startsWith(`${procedureDetail} - `))}
                          onClick={() => onDetailChange(procedureDetail)}
                        >
                          {preset}
                        </button>
                      );
                    })}

                  </div>

                </div>

              ) : null}

              {isDentalProcedureDetail(detail) ? (

                <div className="mt-3 rounded-2xl bg-sky-50/70 p-3 ring-1 ring-sky-100">

                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-sky-500">Dental Procedure Details</p>

                  <div className="flex flex-wrap gap-2">

                    {dentalProcedureDetails.map((preset) => {
                      const dentalDetail = nextDentalProcedureDetailValue(preset);
                      const selected = preset === "Extraction" ? detail.startsWith(dentalDetail) : detail === dentalDetail;

                      return (
                        <button
                          key={preset}
                          type="button"
                          className={presetButtonClasses(activityType, preset, selected)}
                          onClick={() => onDetailChange(dentalDetail)}
                        >
                          {preset}
                        </button>
                      );
                    })}

                  </div>

                  {detail.startsWith("Dental Procedure: Extraction") ? (

                    <label className="mt-3 block text-sm">

                      <span className="mb-1 block font-medium text-zinc-700">Number Of Extractions</span>

                      <input
                        type="number"
                        min="1"
                        inputMode="numeric"
                        value={dentalExtractionCount(detail)}
                        onChange={(event) => onDetailChange(dentalExtractionDetailValue(event.target.value))}
                        placeholder="e.g. 2"
                        className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-rose-300 focus:ring-4 focus:ring-rose-100"
                      />

                    </label>

                  ) : null}

                </div>

              ) : null}

              {isSpayNeuterDetail(detail) ? (

                <div className="mt-3 rounded-2xl bg-sky-50/70 p-3 ring-1 ring-sky-100">

                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-sky-500">Spay / Neuter Details</p>

                  <div className="flex flex-wrap gap-2">

                    {spayNeuterDetails.map((preset) => {
                      const spayNeuterDetail = nextSpayNeuterDetailValue(preset);

                      return (
                        <button
                          key={preset}
                          type="button"
                          className={presetButtonClasses(activityType, preset, detail === spayNeuterDetail)}
                          onClick={() => onDetailChange(spayNeuterDetail)}
                        >
                          {preset}
                        </button>
                      );
                    })}

                  </div>

                </div>

              ) : null}

            </div>

          ) : null}

        </div>

      ) : null}

      {presetGroups ? (

        <div className="mb-4 space-y-3">

          {presetGroups.map((group) => {

            const bristolDisabled = activityType === "potty" && group.label === "Bristol Stool Scale" && pottyEventFromDetail(detail) === "No Poop";



            return (

              <div key={group.label}>

                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">{group.label}</p>

                <div className="flex flex-wrap gap-2">

                  {group.options.map((preset) => (

                    <button

                      key={preset}

                      disabled={bristolDisabled}

                      className={`${presetButtonClasses(activityType, preset, isPresetSelected(activityType, preset, detail))} ${bristolDisabled ? "cursor-not-allowed opacity-40" : ""}`}

                      onClick={() => {

                        if (!bristolDisabled) onDetailChange(nextDetailValue(activityType, preset, detail));

                      }}

                    >

                      {presetButtonContent(activityType, group.label, preset)}

                    </button>

                  ))}

                </div>

                {activityType === "sick" && group.label === "Medical / Vet" && isProcedureDetail(detail) ? (

                  <div className="mt-3 rounded-2xl bg-sky-50/70 p-3 ring-1 ring-sky-100">

                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-sky-500">Procedure Details</p>

                    <div className="flex flex-wrap gap-2">

                      {procedureDetails.map((preset) => {

                        const procedureDetail = nextProcedureDetailValue(preset);



                        return (

                          <button

                            key={preset}

                            className={presetButtonClasses(activityType, preset, detail === procedureDetail || detail.startsWith(`${procedureDetail} - `))}

                            onClick={() => onDetailChange(procedureDetail)}

                          >

                            {preset}

                          </button>

                        );

                      })}

                    </div>

                  </div>

                ) : null}

                {activityType === "sick" && group.label === "Medical / Vet" && isDentalProcedureDetail(detail) ? (

                  <div className="mt-3 rounded-2xl bg-sky-50/70 p-3 ring-1 ring-sky-100">

                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-sky-500">Dental Procedure Details</p>

                    <div className="flex flex-wrap gap-2">

                      {dentalProcedureDetails.map((preset) => {

                        const dentalDetail = nextDentalProcedureDetailValue(preset);

                        const selected = preset === "Extraction" ? detail.startsWith(dentalDetail) : detail === dentalDetail;



                        return (

                          <button

                            key={preset}

                            className={presetButtonClasses(activityType, preset, selected)}

                            onClick={() => onDetailChange(dentalDetail)}

                          >

                            {preset}

                          </button>

                        );

                      })}

                    </div>

                    {detail.startsWith("Dental Procedure: Extraction") ? (

                      <label className="mt-3 block text-sm">

                        <span className="mb-1 block font-medium text-zinc-700">Number Of Extractions</span>

                        <input

                          type="number"

                          min="1"

                          inputMode="numeric"

                          value={dentalExtractionCount(detail)}

                          onChange={(event) => onDetailChange(dentalExtractionDetailValue(event.target.value))}

                          placeholder="e.g. 2"

                          className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-rose-300 focus:ring-4 focus:ring-rose-100"

                        />

                      </label>

                    ) : null}

                  </div>

                ) : null}

                {activityType === "sick" && group.label === "Medical / Vet" && isSpayNeuterDetail(detail) ? (

                  <div className="mt-3 rounded-2xl bg-sky-50/70 p-3 ring-1 ring-sky-100">

                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-sky-500">Spay / Neuter Details</p>

                    <div className="flex flex-wrap gap-2">

                      {spayNeuterDetails.map((preset) => {

                        const spayNeuterDetail = nextSpayNeuterDetailValue(preset);



                        return (

                          <button

                            key={preset}

                            className={presetButtonClasses(activityType, preset, detail === spayNeuterDetail)}

                            onClick={() => onDetailChange(spayNeuterDetail)}

                          >

                            {preset}

                          </button>

                        );

                      })}

                    </div>

                  </div>

                ) : null}

              </div>

            );

          })}

        </div>

      ) : presets[activityType].length ? (

        <div className="mb-4 flex flex-wrap gap-2">

          {presets[activityType].map((preset) => (

            <button

              key={preset}

              className={presetButtonClasses(activityType, preset, isPresetSelected(activityType, preset, detail))}

              onClick={() => onDetailChange(nextDetailValue(activityType, preset, detail))}

            >

              {preset}

            </button>

          ))}

        </div>

      ) : null}



      {showCoreFields ? <label className="mb-3 block text-sm">

        <span className="mb-1 block font-medium text-zinc-700">Time</span>

        <input

          type="time"

          value={happenedAt}

          onChange={(event) => onHappenedAtChange(event.target.value)}

          className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-rose-300 focus:ring-4 focus:ring-rose-100"

        />

      </label> : null}



      {showCoreFields && showTreatDetailField ? (

        <label className="mb-3 block text-sm">

          <span className="mb-1 block font-medium text-zinc-700">{activityType === "food" ? "What was fed?" : "Treat Name/Details"}</span>

          <input

            value={notes}

            onChange={(event) => onNotesChange(clampText(event.target.value, TEXT_LIMITS.mediumText))}
            maxLength={TEXT_LIMITS.mediumText}

            placeholder={activityType === "food" ? "What was fed?" : "Beef Liver, Licky Mat, Amount"}

            className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-rose-300 focus:ring-4 focus:ring-rose-100"

          />

        </label>

      ) : null}



      {showCoreFields && showExtraNotesField ? (

        <label className="mb-3 block text-sm">

          <span className="mb-1 block font-medium text-zinc-700">Notes</span>

          <textarea

            value={extraNotes}

            onChange={(event) => onExtraNotesChange(clampText(event.target.value, TEXT_LIMITS.note))}

            maxLength={TEXT_LIMITS.note}

            rows={2}

            placeholder={activityType === "food" ? "Appetite, reaction, or anything unusual" : "Why given, reaction, amount, or anything unusual"}

            className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-rose-300 focus:ring-4 focus:ring-rose-100"

          />

        </label>

      ) : null}



      {showCoreFields && showDetailField ? (

        <label className="mb-3 block text-sm">

          <span className="mb-1 block font-medium text-zinc-700">{activityType === "other" ? "Event" : "Title"}</span>

          <input

            value={detail === "Other" ? "" : displayDetailValue(detail)}

            onChange={(event) => {
              const nextValue = clampText(event.target.value, MAX_EVENT_TITLE_LENGTH);
              onDetailChange(isOtherMedicalDetail(detail) ? nextValue ? `${otherVetMedicalDetail}: ${nextValue}` : otherVetMedicalDetail : nextValue);
            }}

            placeholder={activityType === "other" ? "Event name" : "Add a title"}
            maxLength={MAX_EVENT_TITLE_LENGTH}

            className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-rose-300 focus:ring-4 focus:ring-rose-100"

          />

        </label>

      ) : null}



      {showCoreFields && !showExtraNotesField ? <label className="block text-sm">

        <span className="mb-1 block font-medium text-zinc-700">Notes</span>

        <textarea

          value={showTreatDetailField ? "" : notes}

          onChange={(event) => onNotesChange(clampText(event.target.value, TEXT_LIMITS.note))}

          maxLength={TEXT_LIMITS.note}

          rows={activityType === "medication" || activityType === "supplement" ? 1 : activityType === "wellness" || isPottyLog ? 2 : 3}

          placeholder={activityType === "sick" && detail === "Vet Visit" ? "Clinic, vet name, reason for visit, or a short note. Attach documents below." : notesPlaceholders[activityType]}

          className={`w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-rose-300 focus:ring-4 focus:ring-rose-100 ${activityType === "wellness" ? "resize-none overflow-hidden" : ""}`}

        />

      </label> : null}



      {showAttachmentField ? (

        <div className="mt-3 block text-sm">

          <span className="mb-1 block font-medium text-zinc-700">{attachmentLabel}</span>

          {poopPhotoDetail ? (
            <div className={`grid grid-cols-2 gap-2 rounded-2xl border border-dashed border-[#f0d27a]/70 bg-[#fff7dc]/70 px-3 py-3 ${attachmentLimitReached ? "opacity-55" : ""}`}>
              <label aria-label="Take Picture" title="Take Picture" className={`flex min-h-11 items-center justify-center rounded-full bg-white/60 px-3 py-2 text-[#8a6200] ${attachmentLimitReached ? "cursor-not-allowed" : "cursor-pointer"}`}>
                <Camera className="size-5" aria-hidden="true" />
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  disabled={attachmentLimitReached}
                  onChange={(event) => {
                    addAttachmentFiles(Array.from(event.target.files ?? []));
                    event.currentTarget.value = "";
                  }}
                  className="sr-only"
                />
              </label>
              <label aria-label="Add Photos" title="Add Photos" className={`flex min-h-11 items-center justify-center rounded-full bg-white/60 px-3 py-2 text-[#8a6200] ${attachmentLimitReached ? "cursor-not-allowed" : "cursor-pointer"}`}>
                <Images className="size-5" aria-hidden="true" />
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  disabled={attachmentLimitReached}
                  onChange={(event) => {
                    addAttachmentFiles(Array.from(event.target.files ?? []));
                    event.currentTarget.value = "";
                  }}
                  className="sr-only"
                />
              </label>
            </div>
          ) : (
            <label className={`flex w-full rounded-2xl border border-dashed border-sky-200 bg-sky-50/50 px-3 py-3 text-sm ${attachmentLimitReached ? "cursor-not-allowed opacity-55" : "cursor-pointer"}`}>
              <span className="rounded-full bg-sky-100 px-3 py-1.5 text-sm font-semibold text-sky-700">
                Add Files
              </span>
              <input
                type="file"
                multiple
                accept={attachmentAccept}
                disabled={attachmentLimitReached}
                onChange={(event) => {
                  addAttachmentFiles(Array.from(event.target.files ?? []));
                  event.currentTarget.value = "";
                }}
                className="sr-only"
              />
            </label>
          )}

          {!poopPhotoDetail ? <p className="mt-1 text-xs text-zinc-500">{attachmentHelp} Up to {maxAttachmentFiles} {maxAttachmentFiles === 1 ? "file" : "files"}.</p> : null}

          {attachmentLimitReached ? <p className="mt-1 text-xs font-medium text-amber-700">{attachmentLimitLabel}</p> : null}

          {displayedAttachments.length ? (

            <ul className="mt-2 space-y-1 text-xs text-zinc-600">

              {displayedAttachments.map((attachment) => (
                <li key={`${attachment.kind}-${attachment.name}-${attachment.index}`} className={`flex items-center justify-between gap-2 rounded-xl bg-white/70 px-2.5 py-1.5 ring-1 ${poopPhotoDetail ? "ring-[#f0d27a]/50" : "ring-sky-100"}`}>
                  <span className="min-w-0 truncate">{attachment.name}</span>
                  {attachment.kind === "new" || onAttachmentNameRemove ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (attachment.kind === "new") {
                          removeAttachmentFile(attachment.index);
                          return;
                        }

                        onAttachmentNameRemove?.(attachment.index);
                      }}
                      className="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
                    >
                      Remove
                    </button>
                  ) : null}
                </li>
              ))}

            </ul>

          ) : null}

        </div>

      ) : null}



      <div className="mt-4 flex flex-wrap gap-2">

        <Button
          onClick={onSave}
          disabled={saveDisabled}
          className="rounded-full !text-white hover:opacity-90 disabled:!opacity-100 disabled:brightness-90 disabled:cursor-not-allowed"
          style={{ backgroundColor: theme.activeText }}
        >

          {saving ? "Saving..." : isEditing ? "Save" : saveLabel}

        </Button>

        <Button variant="outline" onClick={onCancel} className="rounded-full">Cancel</Button>

        {onDelete ? (

          <Button variant="outline" onClick={onDelete} className="rounded-full text-rose-600">

            Delete

          </Button>

        ) : null}

      </div>

    </section>

  );

}

