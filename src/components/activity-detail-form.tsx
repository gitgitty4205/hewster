"use client";



import { useEffect, useMemo, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";

import type { ActivityType } from "@/lib/hewster-data";

import type { CareItemTemplate } from "@/lib/care-settings";

import { formatActivityLabel } from "@/lib/activity";

import {
  PET_PROFILE_STORAGE_KEY,
  appThemes,
  applyPetTheme,
  defaultPetProfile,
  normalizePetProfile,
} from "@/lib/pet-profile";



type Props = {

  activityType: ActivityType;

  detail: string;

  notes: string;

  extraNotes?: string;

  happenedAt: string;

  isEditing?: boolean;

  embedded?: boolean;

  onDetailChange: (value: string) => void;

  onNotesChange: (value: string) => void;

  onExtraNotesChange?: (value: string) => void;

  attachmentNames?: string[];

  onAttachmentsChange?: (files: File[]) => void;

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

    "Type 2: Firm, Slightly Uneven Log",

    "Type 3: Formed Log With Light Cracks",

    "Type 4: Smooth, Well-Formed Log",

    "Type 5: Soft, Formed Pieces",

    "Type 6: Very Soft, Loose Pieces",

    "Type 7: Fully Liquid",

  ],

  activity: ["Walk", "Play", "Training", "Run", "Hike", "Swim", "Other"],

  outdoor: ["Walk", "Play", "Training", "Run", "Hike", "Swim", "Other"],

  care: ["Daycare", "Boarding"],

  wellness: ["Supplements", "Dental Care", "Bath / Grooming", "Nail Trim", "Ear Cleaning", "Eye Care"],

  hike: ["Short Hiking", "Long Hike"],

  treat: ["Common Treat", "New Treat", "Training Treats", "Dental Chew / Chew", "Other"],

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

        "Type 2: Firm, Slightly Uneven Log",

        "Type 3: Formed Log With Light Cracks",

        "Type 4: Smooth, Well-Formed Log",

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

      label: "Care / Away From Home",

      options: ["Daycare", "Drop-In Visit", "Pet Sitting", "Boarding", "Other"],

    },

  ],

  wellness: [

    {

      label: "Wellness Care",

      options: ["Supplements", "Dental Care", "Bath / Grooming", "Nail Trim", "Ear Cleaning", "Eye Care", "Other"],

    },

  ],

  medication: [

    {

      label: "Status",

      options: ["Given", "Skipped", "Missed"],

    },

  ],

  sick: [

    {

      label: "Symptom Type",

      options: ["Digestive", "Respiratory", "Skin / Ear / Rear", "Urinary", "Mobility / Pain", "Neurological", "Behavior", "Other"],

    },

    {

      label: "Medical / Vet",

      options: ["Wellness Exam", "Sick Consult", "Vaccine", "Injection", "Medication", "Flea & Tick", "Deworming", "Procedure", "Other Medical"],

    },

  ],

  other: [],

};



const defaultPetProfileSnapshot = JSON.stringify(defaultPetProfile);

function getPetProfileSnapshot() {

  if (typeof window === "undefined") return defaultPetProfileSnapshot;

  return window.localStorage.getItem(PET_PROFILE_STORAGE_KEY) ?? defaultPetProfileSnapshot;

}

function subscribeToPetProfile(onStoreChange: () => void) {

  if (typeof window === "undefined") return () => {};

  window.addEventListener("storage", onStoreChange);

  window.addEventListener("focus", onStoreChange);

  return () => {

    window.removeEventListener("storage", onStoreChange);

    window.removeEventListener("focus", onStoreChange);

  };

}



const notesPlaceholders: Record<ActivityType, string> = {

  potty: "Optional Potty Notes, Location, Quality, Or Anything Unusual",

  pee: "Optional Note",

  poop: "Optional Poop Notes, Location, Quality, Or Anything Unusual",

  activity: "Location/Details - Park, Beach, Trail, Neighborhood, Backyard, Duration, Behavior, Or Anything Notable",

  outdoor: "Location/Details - Park, Beach, Trail, Neighborhood, Backyard, Duration, Behavior, Or Anything Notable",

  care: "Daycare/Boarding Details, Pickup/Dropoff Notes, Or Anything Notable",

  wellness: "Optional Notes Or Anything Notable",

  hike: "Route, Weather, Duration, Behavior, Or Anything Notable",

  treat: "Treat Name/Details - Beef Liver, Lucky Mat, Bully Stick, Kong, Dental Chew, Amount, Or Reason",

  food: "Food Details, Amount, Appetite, Or Anything Unusual",

  supplement: "Supplement Name, Dose, Frequency, Given/Missed, Reminder Timing, And Refill Date If Needed",

  medication: "Medication Name, Dose, Schedule, Skip Reason, Or Vet Instructions",

  sick: "Symptoms, Vet Notes, Medication, Prevention, Follow-Up, Records, Or Invoice Details",

  other: "Add any details or context you want to remember",

};



function bristolScaleClasses(value: string, selected: boolean) {

  const normalized = value.trim().toLowerCase();



  switch (normalized) {

    case "pee":

      return selected ? "bg-[#f3dda0] text-[#4f3a00] ring-[#d8b95b] shadow-sm" : "bg-[#fff7dc]/70 text-[#6f5200] ring-[#f0d27a]/50 hover:bg-[#fff7dc]";

    case "poop":

      return selected ? "bg-orange-200 text-orange-950 ring-[#c17a2b] shadow-sm" : "bg-orange-50/60 text-orange-800 ring-orange-200/50 hover:bg-orange-50";

    case "pee & poop":

      return selected ? "bg-gradient-to-r from-[#f0d27a] to-orange-200 text-orange-950 ring-[#caa34d] shadow-sm" : "bg-orange-50/60 text-orange-800 ring-orange-200/50 hover:bg-orange-50";

    case "no poop":

      return selected ? "bg-zinc-100 text-zinc-800 ring-zinc-300/80 shadow-sm" : "bg-zinc-50/70 text-zinc-700 ring-zinc-300/70 hover:bg-zinc-50";

    case "type 1: very firm, small pieces":

    case "type 2: firm, slightly uneven log":

      return selected ? "bg-stone-300 text-stone-950 ring-stone-500 shadow-sm" : "bg-stone-50 text-stone-800 ring-stone-200/60 hover:bg-stone-100";

    case "type 3: formed log with light cracks":

      return selected ? "bg-orange-200 text-orange-950 ring-[#c17a2b] shadow-sm" : "bg-orange-50/60 text-orange-800 ring-orange-200/50 hover:bg-orange-50";

    case "type 4: smooth, well-formed log":

      return selected ? "bg-amber-200 text-amber-950 ring-[#c99a2e] shadow-sm" : "bg-amber-50/60 text-amber-800 ring-amber-200/50 hover:bg-amber-50";

    case "type 5: soft, formed pieces":

      return selected ? "bg-orange-200 text-orange-950 ring-[#c17a2b] shadow-sm" : "bg-orange-50/60 text-orange-800 ring-orange-200/50 hover:bg-orange-50";

    case "type 6: very soft, loose pieces":

      return selected ? "bg-rose-200 text-rose-950 ring-[#c86b7d] shadow-sm" : "bg-rose-50/60 text-rose-800 ring-rose-200/50 hover:bg-rose-50";

    case "type 7: fully liquid":

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



  return `rounded-full px-3 py-2 text-sm font-medium transition ${selected ? "ring-2" : "ring-1"} ${classes}`;

}



const pottyEvents = ["Pee", "Poop", "Pee & Poop", "No Poop"];

const wellnessExamAddOns = ["Vaccine", "Injection", "Medication"];

const sickConsultAddOns = ["Injection", "Medication"];

const procedureDetails = ["Dental Procedure", "Spay / Neuter", "Other"];

const dentalProcedureDetails = ["No Extraction", "Extraction"];

const spayNeuterDetails = ["Spay", "Neuter"];

const sickSymptomOptions: Record<string, string[]> = {

  Digestive: ["Appetite Change", "Vomit", "Other"],

  Respiratory: ["Sneezing", "Coughing", "Other"],

  "Skin / Ear / Rear": ["Itching / Rash", "Ear Issue", "Scooting", "Other"],

  Urinary: ["Urinary Concern", "Frequent Urination / Excessive Drinking", "Other"],

  "Mobility / Pain": ["Stiffness", "Limping", "Pain", "Trouble Standing", "Other"],

  Neurological: ["Shaking / Trembling", "Collapse / Weakness", "Seizure", "Other"],

  Behavior: ["Restless / Pacing", "Low Energy", "Behavior Change", "Other"],

  Other: [],

};



const recordTagOptions = ["Medical Record", "Invoice", "Vaccine Certificate", "Insurance", "Photo"];



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



  if (activityType !== "potty") return detail === preset;

  if (pottyEvents.includes(preset)) return pottyEventFromDetail(detail) === preset;

  if (isBristolScaleValue(preset)) {

    return pottyEventFromDetail(detail) !== "No Poop" && bristolScaleFromDetail(detail) === preset;

  }

  return detail === preset;

}



function nextDetailValue(activityType: ActivityType, preset: string, detail: string) {

  void detail;

  if (activityType === "sick" && preset === "Other") return "Other";

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



function medicalVisitMain(detail: string) {

  return detail.split(" + ")[0];

}



function medicalVisitAddOnsFromDetail(detail: string) {

  const [, addOnsText] = detail.split(" + ", 2);

  return addOnsText ? addOnsText.split(", ").filter(Boolean) : [];

}



function medicalVisitAddOnsForDetail(detail: string) {

  return medicalVisitMain(detail) === "Wellness Exam" ? wellnessExamAddOns : sickConsultAddOns;

}



function isMedicalVisitWithAddOns(detail: string) {

  return ["Wellness Exam", "Sick Consult"].includes(medicalVisitMain(detail));

}



function nextMedicalVisitAddOnValue(detail: string, addOn: string) {

  const main = medicalVisitMain(detail);

  const currentAddOns = medicalVisitAddOnsFromDetail(detail);

  const nextAddOns = currentAddOns.includes(addOn)

    ? currentAddOns.filter((item) => item !== addOn)

    : [...currentAddOns, addOn];



  return nextAddOns.length ? `${main} + ${nextAddOns.join(", ")}` : main;

}



function isProcedureDetail(detail: string) {

  return detail === "Procedure" || detail.startsWith("Procedure: ");

}



function nextProcedureDetailValue(preset: string) {

  return `Procedure: ${preset}`;

}



function sickSymptomTypeFromDetail(detail: string) {

  const exactType = Object.keys(sickSymptomOptions).find((type) => detail === type || detail.startsWith(`${type}: `));

  if (exactType) return exactType;

  return "";

}



function sickSymptomFromDetail(detail: string) {

  return detail.split(": ")[1] ?? "";

}



function nextSickSymptomValue(type: string, symptom: string) {

  return `${type}: ${symptom}`;

}



function displayDetailValue(activityType: ActivityType, detail: string) {

  if (activityType === "sick") return sickSymptomFromDetail(detail) || detail;

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

  onDetailChange,

  onNotesChange,

  onExtraNotesChange,

  attachmentNames = [],

  onAttachmentsChange,

  recordTags = [],

  onRecordTagsChange,

  onHappenedAtChange,

  onSave,

  onCancel,

  onDelete,

  saving,

  savedCareItems = [],

}: Props) {

  const profileSnapshot = useSyncExternalStore(

    subscribeToPetProfile,

    getPetProfileSnapshot,

    () => defaultPetProfileSnapshot,

  );

  const profile = useMemo(() => {

    try {

      return normalizePetProfile(JSON.parse(profileSnapshot));

    } catch {

      return defaultPetProfile;

    }

  }, [profileSnapshot]);

  const theme = appThemes[profile.themeId];



  useEffect(() => {

    applyPetTheme(profile.themeId);

  }, [profile.themeId]);



  const showTreatDetailField = activityType === "treat" || activityType === "food";

  const showExtraNotesField = (activityType === "treat" || activityType === "food") && onExtraNotesChange;

  const showAttachmentField = activityType === "sick" && onAttachmentsChange;

  const isPottyLog = ["potty", "pee", "poop"].includes(activityType);

  const showRecordTags = activityType === "sick" && onRecordTagsChange;

  const attachmentLabel = "Upload Health Documents";

  const attachmentAccept = "image/*,.pdf,application/pdf";

  const attachmentHelp = "Photos, screenshots, PDFs, medical records, invoices, vaccine certificates, or insurance docs.";

  const showDetailField = activityType === "other" || (activityType === "sick" && sickSymptomFromDetail(detail) === "Other");

  const presetGroups = groupedPresets[activityType];

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



  const toggleRecordTag = (tag: string) => {

    if (!onRecordTagsChange) return;

    onRecordTagsChange(recordTags.includes(tag) ? recordTags.filter((item) => item !== tag) : [...recordTags, tag]);

  };



  return (

    <section className={embedded ? "mt-3 border-t border-zinc-200 pt-4" : "rounded-[1.5rem] border border-zinc-200 bg-white/80 p-4"}>

      <div className="mb-4">

        <h2 className="text-lg font-semibold">

          {isEditing ? "Edit" : "Log"} {formatActivityLabel(activityType)}

        </h2>

        <p className="text-sm text-zinc-500">Mostly Tap-Based, With Optional Notes When Helpful.</p>

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

                {activityType === "sick" && group.label === "Medical / Vet" && isMedicalVisitWithAddOns(detail) ? (

                  <div className="mt-3 rounded-2xl bg-sky-50/70 p-3 ring-1 ring-sky-100">

                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-sky-500">Also Done / Given</p>

                    <div className="flex flex-wrap gap-2">

                      {medicalVisitAddOnsForDetail(detail).map((preset) => (

                        <button

                          key={preset}

                          className={presetButtonClasses(activityType, preset, medicalVisitAddOnsFromDetail(detail).includes(preset))}

                          onClick={() => onDetailChange(nextMedicalVisitAddOnValue(detail, preset))}

                        >

                          {preset}

                        </button>

                      ))}

                    </div>

                  </div>

                ) : null}

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

                {activityType === "sick" && group.label === "Symptom Type" && sickSymptomTypeFromDetail(detail) && (sickSymptomOptions[sickSymptomTypeFromDetail(detail)] ?? []).length ? (

                  <div className="mt-3 rounded-2xl bg-rose-50/70 p-3 ring-1 ring-rose-100">

                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-rose-500">

                      {sickSymptomTypeFromDetail(detail)}

                    </p>

                    <div className="flex flex-wrap gap-2">

                      {(sickSymptomOptions[sickSymptomTypeFromDetail(detail)] ?? []).map((preset) => (

                        <button

                          key={preset}

                          className={presetButtonClasses(activityType, preset, sickSymptomFromDetail(detail) === preset)}

                          onClick={() => onDetailChange(nextSickSymptomValue(sickSymptomTypeFromDetail(detail), preset))}

                        >

                          {preset}

                        </button>

                      ))}

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



      <label className="mb-3 block text-sm">

        <span className="mb-1 block font-medium text-zinc-700">Time</span>

        <input

          type="time"

          value={happenedAt}

          onChange={(event) => onHappenedAtChange(event.target.value)}

          className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-rose-300 focus:ring-4 focus:ring-rose-100"

        />

      </label>



      {showTreatDetailField ? (

        <label className="mb-3 block text-sm">

          <span className="mb-1 block font-medium text-zinc-700">{activityType === "food" ? "Food Name/Details" : "Treat Name/Details"}</span>

          <input

            value={notes}

            onChange={(event) => onNotesChange(event.target.value)}

            placeholder={activityType === "food" ? "Kibble, Wet Food, Toppers, Amount, Appetite, Etc." : "Beef Liver, Lucky Mat, Dental Chew, Amount, Etc."}

            className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-rose-300 focus:ring-4 focus:ring-rose-100"

          />

        </label>

      ) : null}



      {showExtraNotesField ? (

        <label className="mb-3 block text-sm">

          <span className="mb-1 block font-medium text-zinc-700">Notes</span>

          <textarea

            value={extraNotes}

            onChange={(event) => onExtraNotesChange(event.target.value.slice(0, 180))}

            maxLength={180}

            rows={2}

            placeholder={activityType === "food" ? "Optional Notes - Appetite, Reaction, Amount, Or Anything Unusual" : "Optional Notes - Why Given, Reaction, Amount, Or Anything Unusual"}

            className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-rose-300 focus:ring-4 focus:ring-rose-100"

          />

        </label>

      ) : null}



      {showDetailField ? (

        <label className="mb-3 block text-sm">

          <span className="mb-1 block font-medium text-zinc-700">{activityType === "other" ? "Event" : "Title"}</span>

          <input

            value={detail === "Other" ? "" : displayDetailValue(activityType, detail)}

            onChange={(event) => onDetailChange(event.target.value)}

            placeholder={activityType === "other" ? "What would you like to log?" : "Add a title"}

            className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-rose-300 focus:ring-4 focus:ring-rose-100"

          />

        </label>

      ) : null}



      {!showExtraNotesField ? <label className="block text-sm">

        <span className="mb-1 block font-medium text-zinc-700">Notes</span>

        <textarea

          value={showTreatDetailField ? "" : notes}

          onChange={(event) => onNotesChange(event.target.value.slice(0, 180))}

          maxLength={180}

          rows={activityType === "medication" || activityType === "supplement" ? 1 : activityType === "wellness" || isPottyLog ? 2 : 3}

          placeholder={notesPlaceholders[activityType]}

          className={`w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-rose-300 focus:ring-4 focus:ring-rose-100 ${activityType === "wellness" ? "resize-none overflow-hidden" : ""}`}

        />

      </label> : null}



      {showAttachmentField ? (

        <label className="mt-3 block text-sm">

          <span className="mb-1 block font-medium text-zinc-700">{attachmentLabel}</span>

          <input

            type="file"

            multiple

            accept={attachmentAccept}

            onChange={(event) => onAttachmentsChange(Array.from(event.target.files ?? []))}

            className="block w-full rounded-2xl border border-dashed border-sky-200 bg-sky-50/50 px-3 py-3 text-sm text-zinc-600 file:mr-3 file:rounded-full file:border-0 file:bg-sky-100 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-sky-700"

          />

          <p className="mt-1 text-xs text-zinc-500">{attachmentHelp}</p>

          {attachmentNames.length ? (

            <ul className="mt-2 space-y-1 text-xs text-zinc-600">

              {attachmentNames.map((name) => <li key={name}>• {name}</li>)}

            </ul>

          ) : null}

        </label>

      ) : null}



      {showRecordTags ? (

        <div className="mt-3 text-sm">

          <p className="mb-2 font-medium text-zinc-700">This Record Includes</p>

          <div className="flex flex-wrap gap-2">

            {recordTagOptions.map((tag) => (

              <button

                key={tag}

                type="button"

                onClick={() => toggleRecordTag(tag)}

                className={`rounded-full px-3 py-2 text-sm font-medium ring-1 transition ${

                  recordTags.includes(tag)

                    ? "bg-sky-50 text-sky-700 ring-sky-200"

                    : "bg-white text-zinc-600 ring-zinc-200 hover:bg-zinc-50"

                }`}

              >

                {tag}

              </button>

            ))}

          </div>

        </div>

      ) : null}



      <div className="mt-4 flex flex-wrap gap-2">

        <Button
          onClick={onSave}
          disabled={saveDisabled}
          className="rounded-full !text-white hover:opacity-90 disabled:!opacity-100 disabled:brightness-90 disabled:cursor-not-allowed"
          style={{ backgroundColor: theme.activeText }}
        >

          {saving ? "Saving..." : isEditing ? "Save Changes" : "Save Details"}

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

