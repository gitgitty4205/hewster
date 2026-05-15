import type { MealTemplate } from "@/lib/meal-templates";
import { getSupabaseBrowserClient, HEWSTER_PROFILE_SLUG } from "@/lib/supabase";

export type CareScheduleKind = "meal" | "custom";
export type CareItemKind = "supplement" | "medication";
export type CareCustomTiming = "with-food" | "empty-stomach";
export type CareCustomScheduleMode = "one" | "multiple";
export type MedicationType = "oral" | "topical" | "injection" | "other";

export type CareScheduleStep = {
  id: number;
  everyHours: string;
  forDays: string;
};

export type CareItemTemplate = {
  id: number;
  kind: CareItemKind;
  name: string;
  dose: string;
  scheduleKind: CareScheduleKind;
  mealIds: number[];
  customTiming: CareCustomTiming;
  medicationType: MedicationType;
  customScheduleMode: CareCustomScheduleMode;
  startDateTime: string;
  customScheduleCreatedAt: string;
  repeatEveryHours: string;
  repeatForDays: string;
  scheduleSteps: CareScheduleStep[];
  notes: string;
  active: boolean;
};

export const SUPPLEMENT_SETTINGS_STORAGE_KEY = "hewster.supplementSettings";
export const MEDICATION_SETTINGS_STORAGE_KEY = "hewster.medicationSettings";
const CARE_SETTINGS_BACKUP_LIMIT = 10;

export const initialSupplementTemplates: CareItemTemplate[] = [
  {
    id: 1,
    kind: "supplement",
    name: "Daily Supplements",
    dose: "As directed",
    scheduleKind: "meal",
    mealIds: [3],
    customTiming: "with-food",
    medicationType: "oral",
    customScheduleMode: "one",
    startDateTime: "",
    customScheduleCreatedAt: "",
    repeatEveryHours: "",
    repeatForDays: "",
    scheduleSteps: [{ id: 1, everyHours: "", forDays: "" }],
    notes: "Add with dinner unless directed otherwise.",
    active: true,
  },
];

export const initialMedicationTemplates: CareItemTemplate[] = [];

function normalizeCareItemTemplate(item: unknown, kind: CareItemKind): CareItemTemplate | null {
  if (typeof item !== "object" || item === null) return null;

  const candidate = item as Partial<CareItemTemplate> & { customSchedule?: unknown; customTime?: unknown; scheduleStartDayKey?: unknown };
  if (candidate.kind !== kind) return null;
  if (typeof candidate.id !== "number") return null;
  if (typeof candidate.name !== "string") return null;
  if (typeof candidate.dose !== "string") return null;
  if (candidate.scheduleKind !== "meal" && candidate.scheduleKind !== "custom") return null;
  if (!Array.isArray(candidate.mealIds)) return null;
  if (typeof candidate.notes !== "string") return null;
  if (typeof candidate.active !== "boolean") return null;

  return {
    id: candidate.id,
    kind,
    name: candidate.name,
    dose: candidate.dose,
    scheduleKind: candidate.scheduleKind,
    mealIds: candidate.mealIds.filter((mealId): mealId is number => typeof mealId === "number"),
    customTiming: candidate.customTiming === "empty-stomach" ? "empty-stomach" : "with-food",
    medicationType: candidate.medicationType === "topical" || candidate.medicationType === "injection" || candidate.medicationType === "other" ? candidate.medicationType : "oral",
    customScheduleMode: candidate.customScheduleMode === "multiple" ? "multiple" : "one",
    startDateTime: typeof candidate.startDateTime === "string"
      ? candidate.startDateTime
      : typeof candidate.scheduleStartDayKey === "string" && typeof candidate.customTime === "string" && candidate.customTime
        ? `${candidate.scheduleStartDayKey}T${candidate.customTime}`
        : typeof candidate.customSchedule === "string" && candidate.customSchedule.includes("T")
          ? candidate.customSchedule
          : "",
    customScheduleCreatedAt: typeof candidate.customScheduleCreatedAt === "string" ? candidate.customScheduleCreatedAt : "",
    repeatEveryHours: typeof candidate.repeatEveryHours === "string" ? candidate.repeatEveryHours : "",
    repeatForDays: typeof candidate.repeatForDays === "string" ? candidate.repeatForDays : "",
    scheduleSteps: Array.isArray(candidate.scheduleSteps)
      ? candidate.scheduleSteps
          .filter((step) => typeof step === "object" && step !== null)
          .map((step, index) => {
            const scheduleStep = step as Partial<CareScheduleStep>;
            return {
              id: typeof scheduleStep.id === "number" ? scheduleStep.id : index + 1,
              everyHours: typeof scheduleStep.everyHours === "string" ? scheduleStep.everyHours : "",
              forDays: typeof scheduleStep.forDays === "string" ? scheduleStep.forDays : "",
            };
          })
      : [{ id: 1, everyHours: typeof candidate.repeatEveryHours === "string" ? candidate.repeatEveryHours : "", forDays: typeof candidate.repeatForDays === "string" ? candidate.repeatForDays : "" }],
    notes: candidate.notes,
    active: candidate.active,
  };
}

function isCareItemTemplateArray(value: unknown, kind: CareItemKind): value is CareItemTemplate[] {
  return Array.isArray(value) && value.every((item) => normalizeCareItemTemplate(item, kind));
}

function dateFromDateTimeLocal(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function validCustomScheduleSteps(item: CareItemTemplate) {
  const steps = item.scheduleSteps.length ? item.scheduleSteps : [{ id: 1, everyHours: item.repeatEveryHours, forDays: item.repeatForDays }];

  return steps
    .map((step) => ({
      everyHours: Number.parseInt(step.everyHours, 10),
      forDays: Number.parseInt(step.forDays, 10),
    }))
    .filter((step) => Number.isFinite(step.everyHours) && step.everyHours > 0 && Number.isFinite(step.forDays) && step.forDays > 0);
}

export function finalCustomCareDoseAt(item: CareItemTemplate) {
  if (item.scheduleKind !== "custom") return null;

  const startAt = dateFromDateTimeLocal(item.startDateTime);
  if (!startAt) return null;

  const offsets = validCustomScheduleSteps(item).flatMap((step) => {
    const doseCount = Math.ceil((step.forDays * 24) / step.everyHours);
    return Array.from({ length: doseCount }, (_, index) => index * step.everyHours);
  });

  if (!offsets.length) return null;

  return new Date(startAt.getTime() + Math.max(...offsets) * 60 * 60 * 1000);
}

export function isCareItemScheduleComplete(item: CareItemTemplate, now = new Date()) {
  const finalDoseAt = finalCustomCareDoseAt(item);
  return Boolean(finalDoseAt && finalDoseAt.getTime() < now.getTime());
}

export function isCareItemCurrentlyActive(item: CareItemTemplate, now = new Date()) {
  return item.active && !isCareItemScheduleComplete(item, now);
}

export function markCompletedCareItemsInactive(templates: CareItemTemplate[], now = new Date()) {
  return templates.map((item) => (item.active && isCareItemScheduleComplete(item, now) ? { ...item, active: false } : item));
}

export function storageKeyForCareKind(kind: CareItemKind) {
  return kind === "supplement" ? SUPPLEMENT_SETTINGS_STORAGE_KEY : MEDICATION_SETTINGS_STORAGE_KEY;
}

export function initialCareTemplatesForKind(kind: CareItemKind) {
  return kind === "supplement" ? initialSupplementTemplates : initialMedicationTemplates;
}

export function loadCareTemplates(kind: CareItemKind): CareItemTemplate[] {
  if (typeof window === "undefined") return initialCareTemplatesForKind(kind);

  try {
    const stored = window.localStorage.getItem(storageKeyForCareKind(kind));
    const parsed = stored ? JSON.parse(stored) : null;
    if (!isCareItemTemplateArray(parsed, kind)) return initialCareTemplatesForKind(kind);
    const templates = parsed.map((item) => normalizeCareItemTemplate(item, kind)).filter((item): item is CareItemTemplate => Boolean(item));
    return markCompletedCareItemsInactive(templates);
  } catch {
    return initialCareTemplatesForKind(kind);
  }
}

function backupKeyForCareKind(kind: CareItemKind) {
  return `${storageKeyForCareKind(kind)}.backups`;
}

function backupCareTemplates(kind: CareItemKind, templates: CareItemTemplate[]) {
  if (!templates.length) return;

  try {
    const backupKey = backupKeyForCareKind(kind);
    const currentBackups = JSON.parse(window.localStorage.getItem(backupKey) ?? "[]") as Array<{ savedAt: string; items: CareItemTemplate[] }>;
    const backupSignature = JSON.stringify(templates.map((item) => ({ id: item.id, name: item.name, dose: item.dose, mealIds: item.mealIds })));
    const filteredBackups = Array.isArray(currentBackups)
      ? currentBackups.filter((backup) => JSON.stringify(backup.items?.map((item) => ({ id: item.id, name: item.name, dose: item.dose, mealIds: item.mealIds })) ?? []) !== backupSignature)
      : [];

    window.localStorage.setItem(
      backupKey,
      JSON.stringify([{ savedAt: new Date().toISOString(), items: templates }, ...filteredBackups].slice(0, CARE_SETTINGS_BACKUP_LIMIT))
    );
  } catch {
    // Best-effort local safety net only.
  }
}

export function saveCareTemplates(kind: CareItemKind, templates: CareItemTemplate[]) {
  if (typeof window !== "undefined") {
    const currentTemplates = loadCareTemplates(kind);
    backupCareTemplates(kind, currentTemplates.length ? currentTemplates : templates);
  }

  window.localStorage.setItem(storageKeyForCareKind(kind), JSON.stringify(templates));
  window.dispatchEvent(new CustomEvent("hewster:care-settings-updated", { detail: { kind } }));
}

function mergeCareTemplates(remoteTemplates: CareItemTemplate[], localTemplates: CareItemTemplate[]) {
  const merged = new Map<number, CareItemTemplate>();

  localTemplates.forEach((item) => merged.set(item.id, item));
  remoteTemplates.forEach((item) => merged.set(item.id, item));

  return [...merged.values()];
}

export async function loadCareTemplatesFromSupabase(kind: CareItemKind) {
  const localTemplates = loadCareTemplates(kind);
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return localTemplates;

  const { data, error } = await supabase
    .from("care_item_templates")
    .select("items")
    .eq("profile_slug", HEWSTER_PROFILE_SLUG)
    .eq("kind", kind)
    .maybeSingle();

  if (error) return localTemplates;

  if (!data) {
    if (localTemplates.length) {
      await saveCareTemplatesToSupabase(kind, localTemplates).catch(() => undefined);
    }
    return localTemplates;
  }

  const items = (data as { items?: unknown }).items;
  if (!isCareItemTemplateArray(items, kind)) return localTemplates;

  const remoteTemplates = items.map((item) => normalizeCareItemTemplate(item, kind)).filter((item): item is CareItemTemplate => Boolean(item));
  const mergedTemplates = mergeCareTemplates(remoteTemplates, localTemplates);
  const templates = markCompletedCareItemsInactive(mergedTemplates);
  const templatesChanged = JSON.stringify(templates) !== JSON.stringify(remoteTemplates);

  if (templates.length !== remoteTemplates.length || templatesChanged) {
    await saveCareTemplatesToSupabase(kind, templates).catch(() => undefined);
  }

  saveCareTemplates(kind, templates);
  return templates;
}

export async function saveCareTemplatesToSupabase(kind: CareItemKind, templates: CareItemTemplate[]) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;

  const { error } = await supabase.from("care_item_templates").upsert(
    {
      profile_slug: HEWSTER_PROFILE_SLUG,
      kind,
      items: templates,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "profile_slug,kind" }
  );

  if (error) throw error;
}

export function resetCareTemplates(kind: CareItemKind) {
  const templates = initialCareTemplatesForKind(kind);
  saveCareTemplates(kind, templates);
  return templates;
}

export function careItemsForMeal(items: CareItemTemplate[], mealId: MealTemplate["id"]) {
  return items.filter((item) => isCareItemCurrentlyActive(item) && item.scheduleKind === "meal" && item.mealIds.includes(mealId));
}

export function customScheduledCareItems(items: CareItemTemplate[]) {
  return items.filter((item) => isCareItemCurrentlyActive(item) && item.scheduleKind === "custom");
}
