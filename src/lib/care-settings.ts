import type { MealTemplate } from "@/lib/meal-templates";
import { resolveActiveNotebookAccess } from "@/lib/notebook-access";
import { getSupabaseBrowserClient, getSupabaseCurrentSession, HEWSTER_PROFILE_SLUG } from "@/lib/supabase";

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
  mealPlanDoseCount: string;
  scheduleSteps: CareScheduleStep[];
  ongoing: boolean;
  asNeeded: boolean;
  notes: string;
  active: boolean;
};

export const SUPPLEMENT_SETTINGS_STORAGE_KEY = "hewster.supplementSettings";
export const MEDICATION_SETTINGS_STORAGE_KEY = "hewster.medicationSettings";
const CARE_SETTINGS_BACKUP_LIMIT = 10;
const LEGACY_DEFAULT_SUPPLEMENT_NOTE = "Add with dinner unless directed otherwise.";
const CARE_TEMPLATE_CACHE_TTL_MS = 30_000;
const careTemplateCache = new Map<CareItemKind, { items: CareItemTemplate[]; cachedAt: number }>();
const careTemplateLoadPromises = new Map<CareItemKind, Promise<CareItemTemplate[]>>();

function cacheCareTemplates(kind: CareItemKind, items: CareItemTemplate[]) {
  careTemplateCache.set(kind, { items, cachedAt: Date.now() });
  return items;
}

function cachedCareTemplates(kind: CareItemKind) {
  const cached = careTemplateCache.get(kind);
  if (!cached) return null;
  if (Date.now() - cached.cachedAt > CARE_TEMPLATE_CACHE_TTL_MS) return null;
  return markCompletedCareItemsInactive(cached.items);
}

async function getSignedInSupabase() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;

  const session = await getSupabaseCurrentSession(supabase);
  const user = session?.user ?? null;
  if (!user) return null;

  const access = await resolveActiveNotebookAccess(supabase, user);
  return { supabase, userId: access.notebookOwnerId, signedInUserId: user.id, accessRole: access.role };
}

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
    mealPlanDoseCount: "",
    scheduleSteps: [{ id: 1, everyHours: "", forDays: "" }],
    ongoing: false,
    asNeeded: false,
    notes: "",
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

  const startDateTime = typeof candidate.startDateTime === "string"
    ? candidate.startDateTime
    : typeof candidate.scheduleStartDayKey === "string" && typeof candidate.customTime === "string" && candidate.customTime
      ? `${candidate.scheduleStartDayKey}T${candidate.customTime}`
      : typeof candidate.customSchedule === "string" && candidate.customSchedule.includes("T")
        ? candidate.customSchedule
        : "";
  const scheduleKind = kind === "medication" && candidate.scheduleKind === "meal" ? "custom" : candidate.scheduleKind;

  const isSupplementMealPlan = kind === "supplement" && scheduleKind === "meal";
  const notes = candidate.notes === LEGACY_DEFAULT_SUPPLEMENT_NOTE && candidate.name.trim().toLowerCase() !== "daily supplements"
    ? ""
    : candidate.notes;

  return {
    id: candidate.id,
    kind,
    name: candidate.name,
    dose: candidate.dose,
    scheduleKind,
    mealIds: scheduleKind === "meal" ? candidate.mealIds.filter((mealId): mealId is number => typeof mealId === "number") : [],
    customTiming: candidate.customTiming === "empty-stomach" ? "empty-stomach" : "with-food",
    medicationType: candidate.medicationType === "topical" || candidate.medicationType === "injection" || candidate.medicationType === "other" ? candidate.medicationType : "oral",
    customScheduleMode: candidate.customScheduleMode === "multiple" ? "multiple" : "one",
    startDateTime: isSupplementMealPlan ? "" : startDateTime,
    customScheduleCreatedAt: typeof candidate.customScheduleCreatedAt === "string"
      ? candidate.customScheduleCreatedAt
      : kind === "medication" && scheduleKind === "custom" && startDateTime
        ? startDateTime
        : "",
    repeatEveryHours: typeof candidate.repeatEveryHours === "string" ? candidate.repeatEveryHours : "",
    repeatForDays: isSupplementMealPlan ? "" : typeof candidate.repeatForDays === "string" ? candidate.repeatForDays : "",
    mealPlanDoseCount: isSupplementMealPlan ? "" : typeof candidate.mealPlanDoseCount === "string" ? candidate.mealPlanDoseCount : "",
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
    ongoing: isSupplementMealPlan ? false : candidate.ongoing === true,
    asNeeded: candidate.asNeeded === true,
    notes,
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

function dayKeyFromDate(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function dateFromDayKey(dayKey: string) {
  const [year, month, day] = dayKey.split("-").map(Number);
  if (!year || !month || !day) return new Date();
  return new Date(year, month - 1, day);
}

function parseClockMinutes(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ").toUpperCase();
  const twentyFourHourParts = normalized.match(/^(\d{1,2}):(\d{2})$/);
  if (twentyFourHourParts) {
    const hours = Number(twentyFourHourParts[1]);
    const minutes = Number(twentyFourHourParts[2]);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) return hours * 60 + minutes;
    return Number.MAX_SAFE_INTEGER;
  }

  const parts = normalized.match(/^(\d{1,2})(?::(\d{2}))?\s?(AM|PM)$/i);
  if (!parts) return Number.MAX_SAFE_INTEGER;

  let hours = Number(parts[1]);
  const minutes = Number(parts[2] ?? "0");
  const meridiem = parts[3].toUpperCase();

  if (meridiem === "PM" && hours !== 12) hours += 12;
  if (meridiem === "AM" && hours === 12) hours = 0;

  return hours * 60 + minutes;
}

function mealSlotAt(dayKey: string, meal: Pick<MealTemplate, "plannedTime">) {
  const date = dateFromDayKey(dayKey);
  const minutes = parseClockMinutes(meal.plannedTime);
  if (minutes === Number.MAX_SAFE_INTEGER) return date;
  date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return date;
}

function mealPlanCourseDays(item: CareItemTemplate) {
  const forDays = Number.parseInt(item.repeatForDays, 10);
  return Number.isFinite(forDays) && forDays > 0 ? forDays : null;
}

export function calculatedMealPlanDoseCount(item: CareItemTemplate) {
  if (item.scheduleKind !== "meal" || item.ongoing || item.asNeeded) return null;
  const forDays = mealPlanCourseDays(item);
  if (!forDays || !item.mealIds.length) return null;
  return forDays * item.mealIds.length;
}

function mealPlanDoseLimit(item: CareItemTemplate) {
  const explicitDoseCount = Number.parseInt(item.mealPlanDoseCount, 10);
  if (Number.isFinite(explicitDoseCount) && explicitDoseCount > 0) return explicitDoseCount;
  return calculatedMealPlanDoseCount(item);
}

export function mealPlanTotalDoseCount(item: CareItemTemplate) {
  if (item.scheduleKind !== "meal" || item.ongoing || item.asNeeded) return null;
  return mealPlanDoseLimit(item);
}

function selectedMealsForItem(item: CareItemTemplate, meals: MealTemplate[]) {
  return meals
    .filter((meal) => item.mealIds.includes(meal.id))
    .sort((a, b) => parseClockMinutes(a.plannedTime) - parseClockMinutes(b.plannedTime) || a.id - b.id);
}

function addDays(dayKey: string, days: number) {
  const date = dateFromDayKey(dayKey);
  date.setDate(date.getDate() + days);
  return dayKeyFromDate(date);
}

function sameMinute(first: Date, second: Date) {
  return Math.abs(first.getTime() - second.getTime()) < 60 * 1000;
}

export function mealPlanDoseNumberForMeal(item: CareItemTemplate, meal: MealTemplate, meals: MealTemplate[], dayKey: string) {
  if (item.kind === "supplement" && item.scheduleKind === "meal" && !item.asNeeded && item.mealIds.includes(meal.id)) return 1;
  if (item.scheduleKind !== "meal" || item.ongoing || item.asNeeded || !item.mealIds.includes(meal.id)) return null;

  const startAt = dateFromDateTimeLocal(item.startDateTime);
  if (!startAt) return null;

  const targetAt = mealSlotAt(dayKey, meal);
  if (targetAt.getTime() < startAt.getTime()) return null;

  const selectedMeals = selectedMealsForItem(item, meals);
  if (!selectedMeals.length) return null;

  const startDayKey = dayKeyFromDate(startAt);
  const startMatchesSelectedMeal = selectedMeals.some((selectedMeal) => sameMinute(mealSlotAt(startDayKey, selectedMeal), startAt));
  let doseNumber = startMatchesSelectedMeal ? 0 : 1;
  let cursorDayKey = dayKeyFromDate(startAt);
  let safety = 0;

  while (cursorDayKey <= dayKey && safety < 3700) {
    for (const selectedMeal of selectedMeals) {
      const slotAt = mealSlotAt(cursorDayKey, selectedMeal);
      if (slotAt.getTime() < startAt.getTime()) continue;
      doseNumber += 1;
      if (cursorDayKey === dayKey && selectedMeal.id === meal.id) return doseNumber;
    }

    cursorDayKey = addDays(cursorDayKey, 1);
    safety += 1;
  }

  return null;
}

export function careItemOccursWithMeal(item: CareItemTemplate, meal: MealTemplate, meals: MealTemplate[], dayKey: string) {
  if (item.kind === "medication" || !item.active || item.asNeeded || item.scheduleKind !== "meal" || !item.mealIds.includes(meal.id)) return false;
  if (item.kind === "supplement") return true;

  const doseLimit = mealPlanDoseLimit(item);
  if (!doseLimit) return isCareItemCurrentlyActive(item, mealSlotAt(dayKey, meal));
  if (!dateFromDateTimeLocal(item.startDateTime)) return isCareItemCurrentlyActive(item, mealSlotAt(dayKey, meal));

  const doseNumber = mealPlanDoseNumberForMeal(item, meal, meals, dayKey);
  return Boolean(doseNumber && doseNumber <= doseLimit);
}

export function careItemHistoricallyOccurredWithMeal(item: CareItemTemplate, meal: MealTemplate, meals: MealTemplate[], dayKey: string) {
  if (item.kind === "medication") return false;
  if (item.kind === "supplement" && item.active && item.scheduleKind === "meal" && !item.asNeeded && item.mealIds.includes(meal.id)) return true;
  if (item.active) return careItemOccursWithMeal(item, meal, meals, dayKey);
  if (item.asNeeded || item.scheduleKind !== "meal" || !item.mealIds.includes(meal.id)) return false;
  if (!dateFromDateTimeLocal(item.startDateTime)) return false;

  const doseLimit = mealPlanDoseLimit(item);
  if (!doseLimit) return hasCareItemStarted(item, mealSlotAt(dayKey, meal)) && !isCareItemScheduleComplete(item, mealSlotAt(dayKey, meal));

  const doseNumber = mealPlanDoseNumberForMeal(item, meal, meals, dayKey);
  return Boolean(doseNumber && doseNumber <= doseLimit);
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
  if (item.scheduleKind !== "custom" || item.ongoing || item.asNeeded) return null;

  const startAt = dateFromDateTimeLocal(item.startDateTime);
  if (!startAt) return null;

  const offsets = validCustomScheduleSteps(item).flatMap((step) => {
    const doseCount = Math.ceil((step.forDays * 24) / step.everyHours);
    return Array.from({ length: doseCount }, (_, index) => index * step.everyHours);
  });

  if (!offsets.length) return null;

  return new Date(startAt.getTime() + Math.max(...offsets) * 60 * 60 * 1000);
}

export function finalMealPlanCareAt(item: CareItemTemplate) {
  if (item.scheduleKind !== "meal" || item.ongoing || item.asNeeded) return null;

  const startAt = dateFromDateTimeLocal(item.startDateTime);
  if (!startAt) return null;

  const forDays = Number.parseInt(item.repeatForDays, 10);
  if (!Number.isFinite(forDays) || forDays <= 0) return null;

  return new Date(startAt.getTime() + forDays * 24 * 60 * 60 * 1000);
}

function hasCareItemStarted(item: CareItemTemplate, now = new Date()) {
  if (item.scheduleKind !== "meal") return true;

  const startAt = dateFromDateTimeLocal(item.startDateTime);
  return !startAt || startAt.getTime() <= now.getTime();
}

export function isCareItemScheduleComplete(item: CareItemTemplate, now = new Date()) {
  const finalDoseAt = item.scheduleKind === "meal" ? finalMealPlanCareAt(item) : finalCustomCareDoseAt(item);
  return Boolean(finalDoseAt && finalDoseAt.getTime() < now.getTime());
}

export function isCareItemCurrentlyActive(item: CareItemTemplate, now = new Date()) {
  return item.active && hasCareItemStarted(item, now) && !isCareItemScheduleComplete(item, now);
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
    return markCompletedCareItemsInactive(repairCareTemplateIdCollisions(kind, templates));
  } catch {
    return initialCareTemplatesForKind(kind);
  }
}

function backupKeyForCareKind(kind: CareItemKind) {
  return `${storageKeyForCareKind(kind)}.backups`;
}

function loadCareTemplateBackupItems(kind: CareItemKind) {
  if (typeof window === "undefined") return [];

  try {
    const backups = JSON.parse(window.localStorage.getItem(backupKeyForCareKind(kind)) ?? "[]") as Array<{ savedAt?: string; items?: unknown }>;
    if (!Array.isArray(backups)) return [];

    return backups
      .flatMap((backup) => {
        if (!isCareItemTemplateArray(backup.items, kind)) return [];
        return backup.items.map((item) => normalizeCareItemTemplate(item, kind)).filter((item): item is CareItemTemplate => Boolean(item));
      });
  } catch {
    return [];
  }
}

function careTemplateFingerprint(item: CareItemTemplate) {
  return [
    item.kind,
    item.name.trim().toLowerCase(),
    item.dose.trim().toLowerCase(),
    item.scheduleKind,
    item.mealIds.join(","),
    item.startDateTime,
    item.ongoing ? "ongoing" : "",
    item.asNeeded ? "as-needed" : "",
  ].join("|");
}

function careTemplateHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function collisionSafeCareTemplateId(item: CareItemTemplate, usedIds: Set<number>) {
  let nextId = 8_000_000_000_000 + careTemplateHash(`${item.kind}|${item.id}|${careTemplateFingerprint(item)}`);
  while (usedIds.has(nextId)) nextId += 1;
  return nextId;
}

function repairCareTemplateIdCollisions(kind: CareItemKind, templates: CareItemTemplate[]) {
  const merged = new Map<string, CareItemTemplate>();
  const usedIds = new Set<number>();
  const collisionIds = new Map<string, number>();

  templates.forEach((item) => {
    if (item.kind !== kind) return;

    const key = `${item.kind}-${item.id}`;
    const fingerprint = careTemplateFingerprint(item);
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, item);
      usedIds.add(item.id);
      return;
    }

    if (careTemplateFingerprint(existing) === fingerprint) {
      merged.set(key, item);
      return;
    }

    const collisionKey = `${key}-${fingerprint}`;
    const collisionId = collisionIds.get(collisionKey) ?? collisionSafeCareTemplateId(item, usedIds);
    collisionIds.set(collisionKey, collisionId);
    usedIds.add(collisionId);
    merged.set(`${item.kind}-${collisionId}`, { ...item, id: collisionId });
  });

  return [...merged.values()];
}

export function mergeCareTemplateSources(kind: CareItemKind, ...sources: CareItemTemplate[][]) {
  const merged = new Map<string, CareItemTemplate>();

  repairCareTemplateIdCollisions(kind, sources.flat()).forEach((item) => {
    if (item.kind !== kind) return;
    merged.set(`${item.kind}-${item.id}`, item);
  });

  return markCompletedCareItemsInactive([...merged.values()]);
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
  const repairedTemplates = repairCareTemplateIdCollisions(kind, templates);

  if (typeof window !== "undefined") {
    const currentTemplates = loadCareTemplates(kind);
    backupCareTemplates(kind, currentTemplates.length ? currentTemplates : repairedTemplates);
  }

  window.localStorage.setItem(storageKeyForCareKind(kind), JSON.stringify(repairedTemplates));
  cacheCareTemplates(kind, repairedTemplates);
  window.dispatchEvent(new CustomEvent("hewster:care-settings-updated", { detail: { kind } }));
}

function isOwnerScopedCareSettingsError(error: { message?: string; code?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.code === "42703" || error?.code === "42P10" || message.includes("owner_id") || message.includes("on conflict");
}

type CareTemplateSettingsRow = {
  items?: unknown;
  owner_id?: string | null;
  updated_at?: string | null;
};

function templatesFromCareSettingsRow(row: CareTemplateSettingsRow | null | undefined, kind: CareItemKind) {
  if (!isCareItemTemplateArray(row?.items, kind)) return [];
  return row.items.map((item) => normalizeCareItemTemplate(item, kind)).filter((item): item is CareItemTemplate => Boolean(item));
}

function hasValidCareSettingsItems(row: CareTemplateSettingsRow | null | undefined, kind: CareItemKind) {
  return isCareItemTemplateArray(row?.items, kind);
}

async function loadLegacyCareTemplateRowsFromSupabase(supabase: ReturnType<typeof getSupabaseBrowserClient>, kind: CareItemKind) {
  if (!supabase) return { data: [] as CareTemplateSettingsRow[], error: null };

  return supabase
    .from("care_item_templates")
    .select("items, updated_at")
    .eq("profile_slug", HEWSTER_PROFILE_SLUG)
    .eq("kind", kind)
    .order("updated_at", { ascending: false })
    .limit(5);
}

async function loadCareTemplatesFromSupabaseUncached(kind: CareItemKind) {
  const localTemplates = loadCareTemplates(kind);
  const backupTemplates = loadCareTemplateBackupItems(kind);
  const signedInSupabase = await getSignedInSupabase();
  const localFallbackTemplates = mergeCareTemplateSources(kind, backupTemplates, localTemplates);
  if (!signedInSupabase) return cacheCareTemplates(kind, localFallbackTemplates);

  const { supabase, userId, signedInUserId } = signedInSupabase;
  const ownerIds = [...new Set([userId, signedInUserId].filter(Boolean))];
  const { data, error } = await supabase
    .from("care_item_templates")
    .select("owner_id, items, updated_at")
    .in("owner_id", ownerIds)
    .eq("profile_slug", HEWSTER_PROFILE_SLUG)
    .eq("kind", kind)
    .order("updated_at", { ascending: false })
    .limit(5);

  if (error) {
    if (!isOwnerScopedCareSettingsError(error)) return cacheCareTemplates(kind, localFallbackTemplates);

    const legacyResult = await loadLegacyCareTemplateRowsFromSupabase(supabase, kind);
    const legacyRows = !legacyResult.error && Array.isArray(legacyResult.data) ? legacyResult.data as CareTemplateSettingsRow[] : [];
    const legacyRow = legacyRows.find((row) => hasValidCareSettingsItems(row, kind));
    if (!legacyRow) return cacheCareTemplates(kind, localFallbackTemplates);

    const templates = mergeCareTemplateSources(kind, backupTemplates, localTemplates, templatesFromCareSettingsRow(legacyRow, kind));
    saveCareTemplates(kind, templates);
    await saveCareTemplatesToSupabase(kind, templates).catch(() => undefined);
    return cacheCareTemplates(kind, templates);
  }

  const ownerRows = Array.isArray(data) ? data as CareTemplateSettingsRow[] : [];
  const ownerRow = ownerRows.find((row) => hasValidCareSettingsItems(row, kind));

  if (ownerRow) {
    const templates = mergeCareTemplateSources(kind, backupTemplates, localTemplates, templatesFromCareSettingsRow(ownerRow, kind));
    saveCareTemplates(kind, templates);
    await saveCareTemplatesToSupabase(kind, templates).catch(() => undefined);
    return cacheCareTemplates(kind, templates);
  }

  const legacyResult = await loadLegacyCareTemplateRowsFromSupabase(supabase, kind);
  const legacyRows = !legacyResult.error && Array.isArray(legacyResult.data) ? legacyResult.data as CareTemplateSettingsRow[] : [];
  const legacyRow = legacyRows.find((row) => hasValidCareSettingsItems(row, kind));

  if (legacyRow) {
    const templates = mergeCareTemplateSources(kind, backupTemplates, localTemplates, templatesFromCareSettingsRow(legacyRow, kind));
    await saveCareTemplatesToSupabase(kind, templates).catch(() => undefined);
    saveCareTemplates(kind, templates);
    return cacheCareTemplates(kind, templates);
  }

  const templates = localFallbackTemplates;
  if (templates.length) await saveCareTemplatesToSupabase(kind, templates).catch(() => undefined);
  if (templates.length) saveCareTemplates(kind, templates);
  return cacheCareTemplates(kind, templates);
}

export async function loadCareTemplatesFromSupabase(kind: CareItemKind) {
  const cached = cachedCareTemplates(kind);
  if (cached) return cached;

  const pending = careTemplateLoadPromises.get(kind);
  if (pending) return pending;

  const promise = loadCareTemplatesFromSupabaseUncached(kind).finally(() => {
    careTemplateLoadPromises.delete(kind);
  });
  careTemplateLoadPromises.set(kind, promise);
  return promise;
}

export async function saveCareTemplatesToSupabase(kind: CareItemKind, templates: CareItemTemplate[]) {
  const signedInSupabase = await getSignedInSupabase();
  if (!signedInSupabase) return;

  const { supabase, userId } = signedInSupabase;
  cacheCareTemplates(kind, templates);
  const { error } = await supabase.from("care_item_templates").upsert(
    {
      owner_id: userId,
      profile_slug: HEWSTER_PROFILE_SLUG,
      kind,
      items: templates,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "owner_id,profile_slug,kind" }
  );

  if (!error) return;
  if (!isOwnerScopedCareSettingsError(error)) throw error;

  const legacyResult = await supabase.from("care_item_templates").upsert(
    {
      profile_slug: HEWSTER_PROFILE_SLUG,
      kind,
      items: templates,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "profile_slug,kind" }
  );

  if (legacyResult.error) throw legacyResult.error;
}

export function resetCareTemplates(kind: CareItemKind) {
  const templates = initialCareTemplatesForKind(kind);
  saveCareTemplates(kind, templates);
  return templates;
}

export function careItemsForMeal(items: CareItemTemplate[], mealId: MealTemplate["id"], meals?: MealTemplate[], dayKey = dayKeyFromDate(new Date())) {
  const meal = meals?.find((template) => template.id === mealId);
  return items.filter((item) => {
    if (item.kind === "medication" || item.asNeeded || item.scheduleKind !== "meal" || !item.mealIds.includes(mealId)) return false;
    if (!meal || !meals?.length) return isCareItemCurrentlyActive(item);
    return careItemOccursWithMeal(item, meal, meals, dayKey);
  });
}

export function customScheduledCareItems(items: CareItemTemplate[]) {
  return items.filter((item) => isCareItemCurrentlyActive(item) && item.scheduleKind === "custom");
}
