import { compareActivitiesReverseChronological } from "@/lib/activity";
import type { CareItemKind, CareItemTemplate } from "@/lib/care-settings";
import type { MealStatus, MealTemplate } from "@/lib/meal-templates";
import { initialTemplates, isInitialMealTemplatePlan, isMealTemplateArray, sortMealTemplatesByTime, STORAGE_KEY } from "@/lib/meal-templates";
import {
  canDeleteNotebookEntries,
  canEditNotebookEntries,
  resolveActiveNotebookAccess,
  type NotebookMember,
  type NotebookAccessRole,
} from "@/lib/notebook-access";
import { getSupabaseBrowserClient, getSupabaseCurrentSession, HEWSTER_PROFILE_SLUG, isSupabaseConfigured } from "@/lib/supabase";

export type DailyMealState = {
  mealId: number;
  actualTime: string | null;
  status: MealStatus;
  fedNotes: string | null;
  skippedCareItemIds?: string[];
  dayKey?: string;
};

export type ActivityType =
  | "potty"
  | "pee"
  | "poop"
  | "activity"
  | "outdoor"
  | "care"
  | "wellness"
  | "hike"
  | "treat"
  | "food"
  | "supplement"
  | "medication"
  | "sick"
  | "other";

export type ActivityLog = {
  id: string;
  profileSlug: string;
  activityType: ActivityType;
  happenedAt: string;
  detail: string | null;
  notes: string | null;
  attachments?: ActivityAttachment[];
  auditInfo?: NotebookEntryAuditInfo;
  createdAt?: string;
};

export type NotebookEntryAuditInfo = {
  loggedBy: string | null;
  loggedAt: string | null;
  lastEditedBy: string | null;
  lastEditedAt: string | null;
};

export type ActivityAttachment = {
  id: string;
  activityId: string;
  profileSlug: string;
  fileName: string;
  filePath: string;
  contentType: string | null;
  sizeBytes: number | null;
  documentTypes: string[];
  createdAt?: string;
};

export type WeightLog = {
  id: string;
  profileSlug: string;
  date: string;
  weight: string;
  note?: string | null;
  createdAt?: string;
};

export type MealLog = {
  id: string;
  profileSlug: string;
  dayKey: string;
  mealId: number;
  mealName: string;
  food: string;
  defaultNotes: string;
  fedNotes: string | null;
  skippedCareItemIds?: string[];
  actualTime: string;
  createdAt?: string;
};

export type ManualAlert = {
  id: string;
  profileSlug: string;
  title: string;
  message: string;
  scope?: "today" | "tomorrow" | "date" | "ongoing" | "every-other-day" | "certain-days";
  weekdays?: number[];
  time?: string;
  createdDayKey?: string;
  resolved: boolean;
  createdAt?: string;
  resolvedAt?: string | null;
};

export type HewsterAppState = {
  templates: MealTemplate[];
  historicalMealTemplates?: MealTemplate[];
  mealTemplateAuditSnapshots?: MealTemplateAuditSnapshot[];
  dailyMealState: DailyMealState[];
  activityLogs: ActivityLog[];
  weightLogs: WeightLog[];
  mealLogs: MealLog[];
  dailyMealHistory?: DailyMealState[];
  manualAlerts: ManualAlert[];
  todayKey: string;
  source: "supabase" | "local" | "seed";
};

export type MealTemplateAuditSnapshot = {
  action: "INSERT" | "UPDATE" | "DELETE";
  occurredAt: string;
  oldTemplate: MealTemplate | null;
  newTemplate: MealTemplate | null;
};

export const DAILY_MEAL_STORAGE_KEY = "hewster.dailyMeals";
export const DAILY_MEAL_HISTORY_STORAGE_KEY = "hewster.dailyMealHistory";
export const ACTIVITY_LOGS_STORAGE_KEY = "hewster.activityLogs";
export const WEIGHT_LOGS_STORAGE_KEY = "hewster.weightLogs";
export const DELETED_WEIGHT_LOG_IDS_STORAGE_KEY = "hewster.deletedWeightLogIds";
export const MEAL_LOGS_STORAGE_KEY = "hewster.mealLogs";
export const MANUAL_ALERTS_STORAGE_KEY = "hewster.manualAlerts";
export const TODAY_KEY_STORAGE_KEY = "hewster.todayKey";

const RETIRED_WEIGHT_LOG_IDS = new Set(["weight-1778383254313", "weight-1778383263011"]);
const APP_STATE_CACHE_TTL_MS = 30_000;
let appStateCache: { state: HewsterAppState; cachedAt: number } | null = null;
let appStateLoadPromise: Promise<HewsterAppState> | null = null;

function cacheAppState(state: HewsterAppState) {
  appStateCache = { state, cachedAt: Date.now() };
  return state;
}

function cachedAppState() {
  if (!appStateCache) return null;
  if (appStateCache.state.todayKey !== currentTodayKey()) return null;
  if (Date.now() - appStateCache.cachedAt > APP_STATE_CACHE_TTL_MS) return null;
  return appStateCache.state;
}

function isMissedMealLog(mealLog: Pick<MealLog, "id" | "fedNotes">) {
  return mealLog.fedNotes === "Missed" || mealLog.id.endsWith("-missed");
}

function cacheMealLog(mealLog: MealLog) {
  if (!appStateCache) return;

  cacheAppState({
    ...appStateCache.state,
    mealLogs: [
      mealLog,
      ...appStateCache.state.mealLogs.filter(
        (entry) => entry.id !== mealLog.id && !(entry.dayKey === mealLog.dayKey && entry.mealId === mealLog.mealId)
      ),
    ],
  });
}

function cacheDailyMealState(dailyMealState: DailyMealState[]) {
  if (!appStateCache) return;

  cacheAppState({
    ...appStateCache.state,
    dailyMealState,
    dailyMealHistory: mergeDailyMealHistory(appStateCache.state.dailyMealHistory ?? [], dailyMealState, appStateCache.state.todayKey),
  });
}

function cacheCompletedMeal(mealLog: MealLog, dailyMealState: DailyMealState[]) {
  if (!appStateCache) return;

  cacheAppState({
    ...appStateCache.state,
    dailyMealState,
    dailyMealHistory: mergeDailyMealHistory(appStateCache.state.dailyMealHistory ?? [], dailyMealState, appStateCache.state.todayKey),
    mealLogs: [
      mealLog,
      ...appStateCache.state.mealLogs.filter(
        (entry) => entry.id !== mealLog.id && !(entry.dayKey === mealLog.dayKey && entry.mealId === mealLog.mealId)
      ),
    ],
  });
}

function removeCachedMealLog(mealLogId: string) {
  if (!appStateCache) return;

  cacheAppState({
    ...appStateCache.state,
    mealLogs: appStateCache.state.mealLogs.filter((entry) => entry.id !== mealLogId),
  });
}

function cacheActivityLog(activity: ActivityLog) {
  if (!appStateCache) return;

  cacheAppState({
    ...appStateCache.state,
    activityLogs: [
      activity,
      ...appStateCache.state.activityLogs.filter((entry) => entry.id !== activity.id),
    ].sort(compareActivitiesReverseChronological),
  });
}

function cacheActivityAttachments(activityId: string, attachments: ActivityAttachment[]) {
  if (!appStateCache) return;

  cacheAppState({
    ...appStateCache.state,
    activityLogs: appStateCache.state.activityLogs.map((activity) =>
      activity.id === activityId ? { ...activity, attachments } : activity
    ),
  });
}

function removeCachedActivityLog(activityId: string) {
  if (!appStateCache) return;

  cacheAppState({
    ...appStateCache.state,
    activityLogs: appStateCache.state.activityLogs.filter((entry) => entry.id !== activityId),
  });
}

function dailyMealStateWithResolvedMealLogs(
  dailyMealState: DailyMealState[],
  mealLogs: MealLog[],
  todayKey: string
) {
  const resolvedLogsByMealId = new Map<number, MealLog>();

  mealLogs.forEach((mealLog) => {
    if (mealLog.dayKey !== todayKey || isMissedMealLog(mealLog)) return;
    if (!resolvedLogsByMealId.has(mealLog.mealId)) {
      resolvedLogsByMealId.set(mealLog.mealId, mealLog);
    }
  });

  if (!resolvedLogsByMealId.size) return dailyMealState;

  const resolvedMealState = dailyMealState.map((mealState) => {
    const resolvedLog = resolvedLogsByMealId.get(mealState.mealId);
    if (!resolvedLog) return mealState;

    resolvedLogsByMealId.delete(mealState.mealId);

    return {
      ...mealState,
      actualTime: resolvedLog.actualTime,
      status: "done" as MealStatus,
      fedNotes: resolvedLog.fedNotes,
      skippedCareItemIds: resolvedLog.skippedCareItemIds ?? mealState.skippedCareItemIds ?? [],
      dayKey: resolvedLog.dayKey,
    };
  });

  return [
    ...resolvedMealState,
    ...Array.from(resolvedLogsByMealId.values()).map((mealLog) => ({
      mealId: mealLog.mealId,
      actualTime: mealLog.actualTime,
      status: "done" as MealStatus,
      fedNotes: mealLog.fedNotes,
      skippedCareItemIds: mealLog.skippedCareItemIds ?? [],
      dayKey: mealLog.dayKey,
    })),
  ];
}

function normalizeDailyMealHistory(dailyMeals: unknown, fallbackDayKey: string) {
  if (!isDailyMealStateArray(dailyMeals)) return [];

  return dailyMeals.map((meal) => ({
    mealId: meal.mealId,
    actualTime: meal.actualTime,
    status: meal.status,
    fedNotes: "fedNotes" in meal ? (meal as DailyMealState).fedNotes : null,
    skippedCareItemIds: Array.isArray((meal as DailyMealState).skippedCareItemIds) ? (meal as DailyMealState).skippedCareItemIds : [],
    dayKey: "dayKey" in meal ? (meal as DailyMealState).dayKey ?? fallbackDayKey : fallbackDayKey,
  }));
}

function mergeDailyMealHistory(
  existingHistory: DailyMealState[],
  dailyMealState: DailyMealState[],
  fallbackDayKey: string
) {
  const historyByKey = new Map<string, DailyMealState>();

  [...existingHistory, ...dailyMealState].forEach((meal) => {
    const dayKey = meal.dayKey ?? fallbackDayKey;
    historyByKey.set(`${dayKey}-${meal.mealId}`, { ...meal, dayKey });
  });

  return [...historyByKey.values()];
}

export function persistDailyMealStateLocally(dailyMealState: DailyMealState[], fallbackDayKey: string = currentTodayKey()) {
  if (typeof window === "undefined") return;

  let existingHistory: DailyMealState[] = [];
  try {
    const storedHistory = window.localStorage.getItem(DAILY_MEAL_HISTORY_STORAGE_KEY);
    existingHistory = normalizeDailyMealHistory(storedHistory ? JSON.parse(storedHistory) : null, fallbackDayKey);
  } catch {
    existingHistory = [];
  }
  const nextHistory = mergeDailyMealHistory(existingHistory, dailyMealState, fallbackDayKey);

  window.localStorage.setItem(DAILY_MEAL_STORAGE_KEY, JSON.stringify(dailyMealState));
  window.localStorage.setItem(DAILY_MEAL_HISTORY_STORAGE_KEY, JSON.stringify(nextHistory));
}

async function getSignedInSupabase() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;

  const session = await getSupabaseCurrentSession(supabase);
  const user = session?.user ?? null;
  if (!user) return null;

  const access = await resolveActiveNotebookAccess(supabase, user);
  return { supabase, userId: access.notebookOwnerId, accessRole: access.role, members: access.members };
}

function requireEntryEditAccess(accessRole: NotebookAccessRole) {
  if (!canEditNotebookEntries(accessRole)) {
    throw new Error("Only owners and co-owners can edit saved notebook entries.");
  }
}

function requireEntryDeleteAccess(accessRole: NotebookAccessRole) {
  if (!canDeleteNotebookEntries(accessRole)) {
    throw new Error("Only the notebook owner can delete saved notebook entries.");
  }
}

export async function loadNotebookEntryPermissions() {
  const signedInSupabase = await getSignedInSupabase();
  if (!signedInSupabase) return { canEditEntries: true, canDeleteEntries: true };

  return {
    canEditEntries: canEditNotebookEntries(signedInSupabase.accessRole),
    canDeleteEntries: canDeleteNotebookEntries(signedInSupabase.accessRole),
  };
}

type MealTemplateRow = {
  owner_id: string;
  profile_slug: string;
  meal_id: number;
  name: string;
  planned_time: string;
  food: string;
  notes: string;
  reminder_offset: string;
  sort_order: number;
};

type DailyMealRow = {
  owner_id: string;
  profile_slug: string;
  meal_id: number;
  day_key?: string;
  actual_time: string | null;
  status: MealStatus;
  fed_notes?: string | null;
};

type ActivityLogRow = {
  id: string;
  owner_id: string;
  profile_slug: string;
  activity_type: ActivityType;
  happened_at: string;
  detail: string | null;
  notes: string | null;
  created_at?: string;
};

type ActivityAttachmentRow = {
  id: string;
  owner_id: string;
  profile_slug: string;
  activity_log_id: string;
  file_name: string;
  file_path: string;
  content_type: string | null;
  size_bytes: number | null;
  document_types: string[] | null;
  created_at?: string;
};

type WeightLogRow = {
  id: string;
  owner_id: string;
  profile_slug: string;
  log_date: string;
  weight: string;
  note?: string | null;
  created_at?: string;
};

type MealLogRow = {
  id: string;
  owner_id: string;
  profile_slug: string;
  day_key: string;
  meal_id: number;
  meal_name: string;
  food: string;
  default_notes: string;
  fed_notes: string | null;
  actual_time: string;
  created_at?: string;
};

type ManualAlertRow = {
  id: string;
  owner_id: string;
  profile_slug: string;
  title: string;
  message: string;
  scope?: ManualAlert["scope"] | null;
  weekdays?: number[] | null;
  time?: string | null;
  created_day_key?: string | null;
  resolved: boolean;
  created_at?: string;
  resolved_at?: string | null;
};

type AppAuditLogRow = {
  table_name: string;
  action: "INSERT" | "UPDATE" | "DELETE";
  occurred_at: string;
  actor_user_id?: string | null;
  row_pk?: Record<string, unknown> | null;
  old_row: Record<string, unknown> | null;
  new_row: Record<string, unknown> | null;
};

type HistoricalMealTemplateRow = Record<string, unknown> & {
  meal_id: number;
  name: string;
  planned_time: string;
  food: string;
  notes: string;
};

function isDailyMealStateArray(value: unknown): value is DailyMealState[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        "mealId" in item &&
        "actualTime" in item &&
        "status" in item
    )
  );
}

function isActivityLogArray(value: unknown): value is ActivityLog[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        "id" in item &&
        "activityType" in item &&
        "happenedAt" in item
    )
  );
}

function isWeightLogArray(value: unknown): value is WeightLog[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        "id" in item &&
        "date" in item &&
        "weight" in item
    )
  );
}

function readDeletedWeightLogIds() {
  if (typeof window === "undefined") return new Set<string>();

  try {
    const stored = window.localStorage.getItem(DELETED_WEIGHT_LOG_IDS_STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : null;
    return new Set([...RETIRED_WEIGHT_LOG_IDS, ...(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [])]);
  } catch {
    return new Set(RETIRED_WEIGHT_LOG_IDS);
  }
}

export function markWeightLogDeleted(weightLogId: string) {
  const deletedIds = readDeletedWeightLogIds();
  deletedIds.add(weightLogId);
  window.localStorage.setItem(DELETED_WEIGHT_LOG_IDS_STORAGE_KEY, JSON.stringify([...deletedIds]));
}

export function unmarkWeightLogDeleted(weightLogId: string) {
  const deletedIds = readDeletedWeightLogIds();
  if (!deletedIds.delete(weightLogId)) return;
  window.localStorage.setItem(DELETED_WEIGHT_LOG_IDS_STORAGE_KEY, JSON.stringify([...deletedIds]));
}

function isMealLogArray(value: unknown): value is MealLog[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        "id" in item &&
        "dayKey" in item &&
        "mealId" in item &&
        "actualTime" in item
    )
  );
}

function isManualAlertArray(value: unknown): value is ManualAlert[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        "id" in item &&
        "title" in item &&
        "message" in item &&
        "resolved" in item
    )
  );
}

export function currentTodayKey() {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function buildFreshDailyMealState(templates: MealTemplate[]) {
  return templates.map((template) => ({
    mealId: template.id,
    actualTime: null,
    status: "upcoming" as const,
    fedNotes: null,
    skippedCareItemIds: [],
    dayKey: currentTodayKey(),
  }));
}

function buildSeedState(): HewsterAppState {
  return {
    templates: initialTemplates,
    dailyMealState: buildFreshDailyMealState(initialTemplates),
    historicalMealTemplates: initialTemplates,
    mealTemplateAuditSnapshots: [],
    activityLogs: [],
    weightLogs: [],
    mealLogs: [],
    dailyMealHistory: [],
    manualAlerts: [],
    todayKey: currentTodayKey(),
    source: "seed",
  };
}

export function loadLocalState(): HewsterAppState {
  const seed = buildSeedState();

  try {
    const storedTemplates = window.localStorage.getItem(STORAGE_KEY);
    const storedDailyMeals = window.localStorage.getItem(DAILY_MEAL_STORAGE_KEY);
    const storedDailyMealHistory = window.localStorage.getItem(DAILY_MEAL_HISTORY_STORAGE_KEY);
    const storedActivityLogs = window.localStorage.getItem(ACTIVITY_LOGS_STORAGE_KEY);
    const storedWeightLogs = window.localStorage.getItem(WEIGHT_LOGS_STORAGE_KEY);
    const storedMealLogs = window.localStorage.getItem(MEAL_LOGS_STORAGE_KEY);
    const storedManualAlerts = window.localStorage.getItem(MANUAL_ALERTS_STORAGE_KEY);
    const storedTodayKey = window.localStorage.getItem(TODAY_KEY_STORAGE_KEY);

    const templates = storedTemplates ? JSON.parse(storedTemplates) : null;
    const dailyMeals = storedDailyMeals ? JSON.parse(storedDailyMeals) : null;
    const dailyMealHistory = storedDailyMealHistory ? JSON.parse(storedDailyMealHistory) : null;
    const activityLogs = storedActivityLogs ? JSON.parse(storedActivityLogs) : null;
    const weightLogs = storedWeightLogs ? JSON.parse(storedWeightLogs) : null;
    const mealLogs = storedMealLogs ? JSON.parse(storedMealLogs) : null;
    const manualAlerts = storedManualAlerts ? JSON.parse(storedManualAlerts) : null;
    const todayKey = storedTodayKey ?? currentTodayKey();
    const resolvedTemplates = sortMealTemplatesByTime(isMealTemplateArray(templates) ? templates : seed.templates);
    const localDailyMealHistory = mergeDailyMealHistory(
      normalizeDailyMealHistory(dailyMealHistory, todayKey),
      normalizeDailyMealHistory(dailyMeals, todayKey),
      todayKey
    );
    const resolvedDailyMeals = localDailyMealHistory.length
      ? localDailyMealHistory.filter((meal) => (meal.dayKey ?? todayKey) === todayKey)
      : buildFreshDailyMealState(resolvedTemplates);
    const isStaleDay = todayKey !== currentTodayKey();

    return {
      templates: resolvedTemplates,
      historicalMealTemplates: resolvedTemplates,
      mealTemplateAuditSnapshots: [],
      dailyMealState: isStaleDay ? buildFreshDailyMealState(resolvedTemplates) : resolvedDailyMeals,
      dailyMealHistory: localDailyMealHistory,
      activityLogs: isActivityLogArray(activityLogs) ? activityLogs : seed.activityLogs,
      weightLogs: isWeightLogArray(weightLogs) ? weightLogs : seed.weightLogs,
      mealLogs: isMealLogArray(mealLogs) ? mealLogs : seed.mealLogs,
      manualAlerts: isManualAlertArray(manualAlerts) ? manualAlerts : seed.manualAlerts,
      todayKey: currentTodayKey(),
      source:
        storedTemplates || storedDailyMeals || storedActivityLogs || storedWeightLogs || storedMealLogs || storedManualAlerts || storedTodayKey
          || storedDailyMealHistory
          ? "local"
          : "seed",
    };
  } catch {
    return seed;
  }
}

export function persistLocalState(
  templates: MealTemplate[] = initialTemplates,
  dailyMealState?: DailyMealState[],
  activityLogs?: ActivityLog[],
  weightLogs?: WeightLog[],
  todayKey: string = currentTodayKey(),
  manualAlerts?: ManualAlert[],
  mealLogs?: MealLog[]
) {
  const existingState = loadLocalState();
  const resolvedDailyMealState = dailyMealState ?? existingState.dailyMealState;
  const resolvedActivityLogs = activityLogs ?? existingState.activityLogs;
  const resolvedWeightLogs = weightLogs ?? existingState.weightLogs;
  const resolvedManualAlerts = manualAlerts ?? existingState.manualAlerts;
  const resolvedMealLogs = mealLogs ?? existingState.mealLogs;
  const resolvedDailyMealHistory = mergeDailyMealHistory(
    existingState.dailyMealHistory ?? [],
    resolvedDailyMealState,
    todayKey
  );

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  persistDailyMealStateLocally(resolvedDailyMealState, todayKey);
  window.localStorage.setItem(ACTIVITY_LOGS_STORAGE_KEY, JSON.stringify(resolvedActivityLogs));
  window.localStorage.setItem(WEIGHT_LOGS_STORAGE_KEY, JSON.stringify(resolvedWeightLogs));
  window.localStorage.setItem(MANUAL_ALERTS_STORAGE_KEY, JSON.stringify(resolvedManualAlerts));
  window.localStorage.setItem(MEAL_LOGS_STORAGE_KEY, JSON.stringify(resolvedMealLogs));
  window.localStorage.setItem(TODAY_KEY_STORAGE_KEY, todayKey);

  cacheAppState({
    templates,
    historicalMealTemplates: existingState.historicalMealTemplates ?? templates,
    mealTemplateAuditSnapshots: existingState.mealTemplateAuditSnapshots ?? [],
    dailyMealState: resolvedDailyMealState,
    activityLogs: resolvedActivityLogs,
    weightLogs: resolvedWeightLogs,
    mealLogs: resolvedMealLogs,
    dailyMealHistory: resolvedDailyMealHistory,
    manualAlerts: resolvedManualAlerts,
    todayKey,
    source: appStateCache?.state.source ?? existingState.source,
  });
}

function careItemStorageKey(item: Pick<CareItemTemplate, "kind" | "id">) {
  return `${item.kind}-${item.id}`;
}

function normalizeCareActivityName(value: string | null) {
  return (value ?? "")
    .replace(/\s*(?:[•·-]\s*)?(?:Given|Skipped|Missed)\b/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function activityMatchesCareItem(activity: ActivityLog, item: CareItemTemplate) {
  if (activity.activityType !== item.kind) return false;
  if (activity.id.startsWith(`${careItemStorageKey(item)}-`)) return true;

  const detailName = normalizeCareActivityName(activity.detail);
  const itemName = item.name.trim().toLowerCase();
  if (!detailName || !itemName) return false;

  return detailName === itemName ||
    detailName.startsWith(`${itemName} `) ||
    detailName.startsWith(`${itemName} •`) ||
    detailName.startsWith(`${itemName} -`);
}

function pruneDeletedCareItemIdsFromMeals<T extends { skippedCareItemIds?: string[] }>(
  meals: T[],
  deletedCareItemIds: Set<string>
) {
  return meals.map((meal) => {
    if (!meal.skippedCareItemIds?.length) return meal;

    const skippedCareItemIds = meal.skippedCareItemIds.filter((id) => !deletedCareItemIds.has(id));
    return skippedCareItemIds.length === meal.skippedCareItemIds.length ? meal : { ...meal, skippedCareItemIds };
  });
}

export function removeCareItemReferencesLocally(kind: CareItemKind, deletedItems: CareItemTemplate[]) {
  if (typeof window === "undefined" || !deletedItems.length) return;

  const deletedCareItems = deletedItems.filter((item) => item.kind === kind);
  if (!deletedCareItems.length) return;

  const deletedCareItemIds = new Set(deletedCareItems.map(careItemStorageKey));
  const state = loadLocalState();
  const nextActivityLogs = state.activityLogs.filter(
    (activity) => !deletedCareItems.some((item) => activityMatchesCareItem(activity, item))
  );
  const nextDailyMealState = pruneDeletedCareItemIdsFromMeals(state.dailyMealState, deletedCareItemIds);
  const nextMealLogs = pruneDeletedCareItemIdsFromMeals(state.mealLogs, deletedCareItemIds);
  const nextDailyMealHistory = pruneDeletedCareItemIdsFromMeals(state.dailyMealHistory ?? [], deletedCareItemIds);

  persistLocalState(
    state.templates,
    nextDailyMealState,
    nextActivityLogs,
    state.weightLogs,
    state.todayKey,
    state.manualAlerts,
    nextMealLogs
  );
  window.localStorage.setItem(DAILY_MEAL_HISTORY_STORAGE_KEY, JSON.stringify(nextDailyMealHistory));
  if (appStateCache) {
    cacheAppState({ ...appStateCache.state, dailyMealHistory: nextDailyMealHistory });
  }

  try {
    const parsedStatus = JSON.parse(window.localStorage.getItem("hewster.customCareStatus") ?? "{}");
    if (parsedStatus && typeof parsedStatus === "object") {
      Object.keys(parsedStatus).forEach((key) => {
        if ([...deletedCareItemIds].some((id) => key.startsWith(`${id}-`))) delete parsedStatus[key];
      });
      window.localStorage.setItem("hewster.customCareStatus", JSON.stringify(parsedStatus));
    }
  } catch {
    // Best-effort cleanup only.
  }
}

function mapTemplateRowToTemplate(row: MealTemplateRow): MealTemplate {
  return {
    id: row.meal_id,
    name: row.name,
    plannedTime: row.planned_time,
    food: row.food,
    notes: row.notes,
  };
}

function isHistoricalMealTemplateRow(row: Record<string, unknown> | null): row is HistoricalMealTemplateRow {
  return (
    !!row &&
    typeof row.meal_id === "number" &&
    typeof row.name === "string" &&
    typeof row.planned_time === "string" &&
    typeof row.food === "string" &&
    typeof row.notes === "string"
  );
}

function mapHistoricalTemplateRowToTemplate(row: HistoricalMealTemplateRow): MealTemplate {
  return {
    id: row.meal_id,
    name: row.name,
    plannedTime: row.planned_time,
    food: row.food,
    notes: row.notes,
  };
}

function mapMealTemplateAuditSnapshots(auditRows: AppAuditLogRow[] = []): MealTemplateAuditSnapshot[] {
  return auditRows
    .filter((auditRow) => auditRow.table_name === "meal_templates")
    .map((auditRow) => ({
      action: auditRow.action,
      occurredAt: auditRow.occurred_at,
      oldTemplate: isHistoricalMealTemplateRow(auditRow.old_row) ? mapHistoricalTemplateRowToTemplate(auditRow.old_row) : null,
      newTemplate: isHistoricalMealTemplateRow(auditRow.new_row) ? mapHistoricalTemplateRowToTemplate(auditRow.new_row) : null,
    }));
}

export function mealTemplatesForHistoryDay(
  currentTemplates: MealTemplate[],
  auditSnapshots: MealTemplateAuditSnapshot[] = [],
  dayKey: string
) {
  const targetEnd = new Date(`${dayKey}T23:59:59.999`).toISOString();
  const templatesById = new Map(currentTemplates.map((template) => [template.id, template]));

  auditSnapshots
    .filter((snapshot) => snapshot.occurredAt > targetEnd)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .forEach((snapshot) => {
      const newId = snapshot.newTemplate?.id;
      const oldTemplate = snapshot.oldTemplate;

      if (snapshot.action === "INSERT" && newId) {
        templatesById.delete(newId);
        return;
      }

      if ((snapshot.action === "UPDATE" || snapshot.action === "DELETE") && oldTemplate) {
        templatesById.set(oldTemplate.id, oldTemplate);
      }
    });

  return sortMealTemplatesByTime([...templatesById.values()]);
}

function mergeHistoricalMealTemplates(currentTemplates: MealTemplate[], auditRows: AppAuditLogRow[] = []) {
  const templatesById = new Map(currentTemplates.map((template) => [template.id, template]));

  auditRows.forEach((auditRow) => {
    if (auditRow.table_name !== "meal_templates") return;

    [auditRow.new_row, auditRow.old_row].forEach((row) => {
      if (!isHistoricalMealTemplateRow(row)) return;
      if (templatesById.has(row.meal_id)) return;

      templatesById.set(row.meal_id, mapHistoricalTemplateRowToTemplate(row));
    });
  });

  return sortMealTemplatesByTime([...templatesById.values()]);
}

function displayNameFromEmail(email: string) {
  const localPart = email.split("@")[0] ?? email;
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || email;
}

function memberDisplayNames(members: NotebookMember[]) {
  const names = new Map<string, string>();

  members.forEach((member) => {
    if (member.memberUserId) {
      names.set(member.memberUserId, displayNameFromEmail(member.memberEmail));
    }
    if (member.role === "owner") {
      names.set(member.notebookOwnerId, displayNameFromEmail(member.memberEmail));
    }
  });

  return names;
}

function actorDisplayName(actorUserId: string | null | undefined, memberNames: Map<string, string>) {
  if (!actorUserId) return null;
  return memberNames.get(actorUserId) ?? "Shared account";
}

function auditRowActivityId(row: AppAuditLogRow) {
  const rowPkId = row.row_pk?.id;
  if (typeof rowPkId === "string") return rowPkId;

  const newRowId = row.new_row?.id;
  if (typeof newRowId === "string") return newRowId;

  const oldRowId = row.old_row?.id;
  return typeof oldRowId === "string" ? oldRowId : null;
}

function activityAuditInfoById(auditRows: AppAuditLogRow[], members: NotebookMember[]) {
  const memberNames = memberDisplayNames(members);
  const byActivityId = new Map<string, NotebookEntryAuditInfo>();

  auditRows
    .filter((row) => row.table_name === "activity_logs" && row.action !== "DELETE")
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
    .forEach((row) => {
      const activityId = auditRowActivityId(row);
      if (!activityId) return;

      const existing = byActivityId.get(activityId) ?? {
        loggedBy: null,
        loggedAt: null,
        lastEditedBy: null,
        lastEditedAt: null,
      };
      const actorName = actorDisplayName(row.actor_user_id, memberNames);

      if (row.action === "INSERT" && !existing.loggedAt) {
        existing.loggedBy = actorName;
        existing.loggedAt = row.occurred_at;
      }

      if (row.action === "UPDATE") {
        existing.lastEditedBy = actorName;
        existing.lastEditedAt = row.occurred_at;
      }

      byActivityId.set(activityId, existing);
    });

  return byActivityId;
}

function mapTemplateToRow(template: MealTemplate, index: number, ownerId: string): MealTemplateRow {
  return {
    owner_id: ownerId,
    profile_slug: HEWSTER_PROFILE_SLUG,
    meal_id: template.id,
    name: template.name,
    planned_time: template.plannedTime,
    food: template.food,
    notes: template.notes,
    reminder_offset: "",
    sort_order: index,
  };
}

function mapDailyMealStateToRow(state: DailyMealState, ownerId: string): DailyMealRow {
  return {
    owner_id: ownerId,
    profile_slug: HEWSTER_PROFILE_SLUG,
    meal_id: state.mealId,
    day_key: state.dayKey ?? currentTodayKey(),
    actual_time: state.actualTime,
    status: state.status,
    fed_notes: state.fedNotes,
  };
}

function mapActivityLogRowToActivity(row: ActivityLogRow): ActivityLog {
  return {
    id: row.id,
    profileSlug: row.profile_slug,
    activityType: row.activity_type,
    happenedAt: row.happened_at,
    detail: row.detail,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

function mapActivityAttachmentRowToAttachment(row: ActivityAttachmentRow): ActivityAttachment {
  return {
    id: row.id,
    activityId: row.activity_log_id,
    profileSlug: row.profile_slug,
    fileName: row.file_name,
    filePath: row.file_path,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    documentTypes: row.document_types ?? [],
    createdAt: row.created_at,
  };
}

function mapActivityLogToRow(activity: ActivityLog, ownerId: string): ActivityLogRow {
  return {
    id: activity.id,
    owner_id: ownerId,
    profile_slug: HEWSTER_PROFILE_SLUG,
    activity_type: activity.activityType,
    happened_at: activity.happenedAt,
    detail: activity.detail,
    notes: activity.notes,
  };
}

function normalizeWeightText(weight: string) {
  return weight.trim().replace(/\s*(kg|lb)\s*$/i, " $1").replace(/\s+/g, " ");
}

function mapWeightLogRowToWeight(row: WeightLogRow): WeightLog {
  return {
    id: row.id,
    profileSlug: row.profile_slug,
    date: row.log_date,
    weight: normalizeWeightText(row.weight),
    note: row.note ?? null,
    createdAt: row.created_at,
  };
}

function mapWeightLogToRow(weight: WeightLog, ownerId: string): WeightLogRow {
  return {
    id: weight.id,
    owner_id: ownerId,
    profile_slug: HEWSTER_PROFILE_SLUG,
    log_date: weight.date,
    weight: normalizeWeightText(weight.weight),
    note: weight.note ?? null,
  };
}

function mapMealLogRowToMealLog(row: MealLogRow): MealLog {
  return {
    id: row.id,
    profileSlug: row.profile_slug,
    dayKey: row.day_key,
    mealId: row.meal_id,
    mealName: row.meal_name,
    food: row.food,
    defaultNotes: row.default_notes,
    fedNotes: row.fed_notes,
    skippedCareItemIds: [],
    actualTime: row.actual_time,
    createdAt: row.created_at,
  };
}

function mapMealLogToRow(mealLog: MealLog, ownerId: string): MealLogRow {
  return {
    id: mealLog.id,
    owner_id: ownerId,
    profile_slug: HEWSTER_PROFILE_SLUG,
    day_key: mealLog.dayKey,
    meal_id: mealLog.mealId,
    meal_name: mealLog.mealName,
    food: mealLog.food,
    default_notes: mealLog.defaultNotes,
    fed_notes: mealLog.fedNotes,
    actual_time: mealLog.actualTime,
  };
}

function normalizeManualAlertScope(scope: ManualAlertRow["scope"]): ManualAlert["scope"] {
  return ["today", "tomorrow", "date", "ongoing", "every-other-day", "certain-days"].includes(scope ?? "") ? scope as ManualAlert["scope"] : "today";
}

function mapManualAlertRowToAlert(row: ManualAlertRow): ManualAlert {
  return {
    id: row.id,
    profileSlug: row.profile_slug,
    title: row.title,
    message: row.message,
    scope: normalizeManualAlertScope(row.scope),
    weekdays: row.weekdays ?? undefined,
    time: row.time ?? undefined,
    createdDayKey: row.created_day_key ?? (row.created_at ? currentTodayKey() : undefined),
    resolved: row.resolved,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at ?? null,
  };
}

function mapManualAlertToRow(alert: ManualAlert, ownerId: string): ManualAlertRow {
  return {
    id: alert.id,
    owner_id: ownerId,
    profile_slug: HEWSTER_PROFILE_SLUG,
    title: alert.title,
    message: alert.message,
    scope: alert.scope ?? "today",
    weekdays: alert.weekdays ?? null,
    time: alert.time ?? null,
    created_day_key: alert.createdDayKey ?? null,
    resolved: alert.resolved,
    resolved_at: alert.resolvedAt ?? null,
  };
}

function manualAlertRepeats(alert: Pick<ManualAlert, "scope">) {
  return ["ongoing", "every-other-day", "certain-days"].includes(alert.scope ?? "today");
}

async function loadAppStateUncached(): Promise<HewsterAppState> {
  const localState = loadLocalState();

  if (!isSupabaseConfigured()) {
    return cacheAppState(localState);
  }

  const signedInSupabase = await getSignedInSupabase();
  if (!signedInSupabase) {
    return cacheAppState(localState);
  }

  const { supabase, userId, members } = signedInSupabase;

  const templatesPromise = supabase
    .from("meal_templates")
    .select("owner_id, profile_slug, meal_id, name, planned_time, food, notes, reminder_offset, sort_order")
    .eq("owner_id", userId)
    .eq("profile_slug", HEWSTER_PROFILE_SLUG)
    .order("sort_order", { ascending: true });

  const dailyMealsWithFedNotesPromise = supabase
    .from("daily_meals")
    .select("owner_id, profile_slug, meal_id, day_key, actual_time, status, fed_notes")
    .eq("owner_id", userId)
    .eq("profile_slug", HEWSTER_PROFILE_SLUG);

  const [templatesResult, dailyMealsWithFedNotesResult] = await Promise.all([
    templatesPromise,
    dailyMealsWithFedNotesPromise,
  ]);

  let dailyMealsResult: {
    data: Array<{
      profile_slug: string;
      meal_id: number;
      day_key: string;
      actual_time: string | null;
      status: string;
      fed_notes?: string | null;
    }> | null;
    error: { message: string } | null;
  } = dailyMealsWithFedNotesResult;

  if (dailyMealsWithFedNotesResult.error && dailyMealsWithFedNotesResult.error.message.includes("fed_notes")) {
    dailyMealsResult = await supabase
      .from("daily_meals")
      .select("owner_id, profile_slug, meal_id, day_key, actual_time, status")
      .eq("owner_id", userId)
      .eq("profile_slug", HEWSTER_PROFILE_SLUG);
  }

  if (templatesResult.error || dailyMealsResult.error) {
    console.error("Failed to load core Supabase state", {
      templatesError: templatesResult.error,
      dailyMealsError: dailyMealsResult.error,
    });
    return cacheAppState(localState);
  }

  const [activityLogsResult, activityAttachmentsResult, weightLogsResult, mealLogsResult, manualAlertsResult, auditLogsResult] = await Promise.all([
    supabase
      .from("activity_logs")
      .select("id, owner_id, profile_slug, activity_type, happened_at, detail, notes, created_at")
      .eq("owner_id", userId)
      .eq("profile_slug", HEWSTER_PROFILE_SLUG)
      .order("happened_at", { ascending: false }),
    supabase
      .from("activity_attachments")
      .select("id, owner_id, profile_slug, activity_log_id, file_name, file_path, content_type, size_bytes, document_types, created_at")
      .eq("owner_id", userId)
      .eq("profile_slug", HEWSTER_PROFILE_SLUG)
      .order("created_at", { ascending: true }),
    supabase
      .from("weight_logs")
      .select("id, owner_id, profile_slug, log_date, weight, note, created_at")
      .eq("owner_id", userId)
      .eq("profile_slug", HEWSTER_PROFILE_SLUG)
      .order("log_date", { ascending: false }),
    supabase
      .from("meal_logs")
      .select("id, owner_id, profile_slug, day_key, meal_id, meal_name, food, default_notes, fed_notes, actual_time, created_at")
      .eq("owner_id", userId)
      .eq("profile_slug", HEWSTER_PROFILE_SLUG)
      .order("created_at", { ascending: false }),
    supabase
      .from("manual_alerts")
      .select("id, owner_id, profile_slug, title, message, scope, weekdays, time, created_day_key, resolved, created_at, resolved_at")
      .eq("owner_id", userId)
      .eq("profile_slug", HEWSTER_PROFILE_SLUG)
      .order("created_at", { ascending: false }),
    supabase
      .from("app_audit_log")
      .select("table_name, action, occurred_at, actor_user_id, row_pk, old_row, new_row")
      .eq("owner_id", userId)
      .eq("profile_slug", HEWSTER_PROFILE_SLUG)
      .in("table_name", ["meal_templates", "activity_logs"])
      .order("occurred_at", { ascending: false })
      .limit(500),
  ]);

  if (activityLogsResult.error) {
    console.warn("Activity logs unavailable, falling back locally", activityLogsResult.error);
  }

  if (activityAttachmentsResult.error) {
    console.warn("Activity attachments unavailable; using filename notes only", activityAttachmentsResult.error);
  }

  if (weightLogsResult.error) {
    console.warn("Weight logs unavailable, falling back locally", weightLogsResult.error);
  }

  if (mealLogsResult.error) {
    console.warn("Meal logs unavailable, falling back locally", mealLogsResult.error);
  }

  if (manualAlertsResult.error) {
    console.warn("Manual alerts unavailable, falling back locally", manualAlertsResult.error);
  }

  if (auditLogsResult.error) {
    console.warn("Audit log unavailable, history will use current meal templates only", auditLogsResult.error);
  }

  const localTemplatesAreUserPlan = localState.source === "local" && !isInitialMealTemplatePlan(localState.templates);
  const templates = sortMealTemplatesByTime(
    templatesResult.data?.length
      ? (templatesResult.data as MealTemplateRow[]).map(mapTemplateRowToTemplate)
      : localTemplatesAreUserPlan
        ? localState.templates
        : []
  );
  const historicalMealTemplates = mergeHistoricalMealTemplates(
    templates,
    !auditLogsResult.error && auditLogsResult.data?.length ? (auditLogsResult.data as AppAuditLogRow[]) : []
  );
  const auditRows = !auditLogsResult.error && auditLogsResult.data?.length ? (auditLogsResult.data as AppAuditLogRow[]) : [];
  const mealTemplateAuditSnapshots = mapMealTemplateAuditSnapshots(auditRows);
  const activityAuditInfo = activityAuditInfoById(auditRows, members);

  const remoteDailyMealHistory = dailyMealsResult.data?.length
    ? (dailyMealsResult.data as DailyMealRow[]).map((row) => {
        const localMeal = localState.dailyMealState.find((meal) => meal.mealId === row.meal_id && (meal.dayKey ?? localState.todayKey) === (row.day_key ?? localState.todayKey));
        return {
          mealId: row.meal_id,
          actualTime: row.actual_time,
          status: row.status,
          fedNotes: row.fed_notes ?? null,
          skippedCareItemIds: localMeal?.skippedCareItemIds ?? [],
          dayKey: row.day_key ?? localState.todayKey,
        };
      })
    : [];

  const todayDailyMeals = remoteDailyMealHistory.filter((meal) => (meal.dayKey ?? localState.todayKey) === localState.todayKey);
  const dailyMealState = todayDailyMeals.length
    ? todayDailyMeals
    : buildFreshDailyMealState(templates).map((meal) => ({
        ...meal,
        dayKey: localState.todayKey,
      }));

  const remoteActivityLogs = !activityLogsResult.error && activityLogsResult.data?.length
    ? (activityLogsResult.data as ActivityLogRow[]).map(mapActivityLogRowToActivity)
    : [];

  const attachmentsByActivityId = new Map<string, ActivityAttachment[]>();
  if (!activityAttachmentsResult.error && activityAttachmentsResult.data?.length) {
    (activityAttachmentsResult.data as ActivityAttachmentRow[])
      .map(mapActivityAttachmentRowToAttachment)
      .forEach((attachment) => {
        const current = attachmentsByActivityId.get(attachment.activityId) ?? [];
        attachmentsByActivityId.set(attachment.activityId, [...current, attachment]);
      });
  }

  const remoteActivityLogsWithAttachments = remoteActivityLogs.map((activity) => ({
    ...activity,
    attachments: attachmentsByActivityId.get(activity.id) ?? [],
    auditInfo: activityAuditInfo.get(activity.id),
  }));

  const activityLogsById = new Map(localState.activityLogs.map((entry) => [entry.id, entry]));
  remoteActivityLogsWithAttachments.forEach((entry) => activityLogsById.set(entry.id, entry));

  const activityLogs = [...activityLogsById.values()].sort(compareActivitiesReverseChronological);

  const remoteWeightLogs = !weightLogsResult.error && weightLogsResult.data?.length
    ? (weightLogsResult.data as WeightLogRow[]).map(mapWeightLogRowToWeight)
    : [];

  const remoteMealLogs = !mealLogsResult.error && mealLogsResult.data?.length
    ? (mealLogsResult.data as MealLogRow[]).map(mapMealLogRowToMealLog)
    : [];

  const remoteManualAlerts = !manualAlertsResult.error && manualAlertsResult.data?.length
    ? (manualAlertsResult.data as ManualAlertRow[]).map(mapManualAlertRowToAlert)
    : [];

  const deletedWeightLogIds = readDeletedWeightLogIds();

  if (deletedWeightLogIds.size && !weightLogsResult.error) {
    await Promise.all(
      [...deletedWeightLogIds].map((weightLogId) =>
        supabase
          .from("weight_logs")
          .delete()
          .eq("id", weightLogId)
          .eq("owner_id", userId)
          .eq("profile_slug", HEWSTER_PROFILE_SLUG)
      )
    ).catch(() => undefined);
  }

  const remoteWeightLogIds = new Set(remoteWeightLogs.map((entry) => entry.id));
  const localOnlyWeightLogs = localState.weightLogs.filter((entry) => !remoteWeightLogIds.has(entry.id) && !deletedWeightLogIds.has(entry.id));

  if (localOnlyWeightLogs.length && !weightLogsResult.error) {
    const { error } = await supabase
      .from("weight_logs")
      .upsert(localOnlyWeightLogs.map((entry) => mapWeightLogToRow(entry, userId)), { onConflict: "id" });

    if (error) {
      console.warn("Failed to backfill local weight logs to Supabase", error);
    }
  }

  const weightLogs = [...remoteWeightLogs, ...localState.weightLogs]
    .filter((entry) => !deletedWeightLogIds.has(entry.id))
    .filter((entry, index, all) => index === all.findIndex((candidate) => candidate.id === entry.id));

  const mealLogs = [...remoteMealLogs, ...localState.mealLogs]
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
    .map((entry) => {
      const localMatch = localState.mealLogs.find(
        (candidate) => candidate.dayKey === entry.dayKey && candidate.mealId === entry.mealId
      );

      return {
        ...entry,
        skippedCareItemIds: entry.skippedCareItemIds?.length ? entry.skippedCareItemIds : localMatch?.skippedCareItemIds ?? [],
      };
    })
    .filter((entry, index, all) => {
      const sameIdIndex = all.findIndex((candidate) => candidate.id === entry.id);
      const sameMealDayIndex = all.findIndex(
        (candidate) => candidate.dayKey === entry.dayKey && candidate.mealId === entry.mealId
      );

      return index === sameIdIndex && index === sameMealDayIndex;
    });

  const manualAlerts = [...remoteManualAlerts, ...localState.manualAlerts]
    .map((entry) => {
      const localMatch = localState.manualAlerts.find((candidate) => candidate.id === entry.id);
      const scope = localMatch?.scope ?? normalizeManualAlertScope(entry.scope);
      const repeats = manualAlertRepeats({ scope });

      return {
        ...entry,
        scope,
        weekdays: localMatch?.weekdays ?? entry.weekdays,
        time: localMatch?.time ?? entry.time,
        createdDayKey: localMatch?.createdDayKey ?? entry.createdDayKey,
        resolved: repeats && localMatch ? localMatch.resolved : entry.resolved,
        resolvedAt: repeats && localMatch ? localMatch.resolvedAt ?? entry.resolvedAt : entry.resolvedAt,
      };
    })
    .filter((entry, index, all) => index === all.findIndex((candidate) => candidate.id === entry.id));

  const resolvedDailyMealState = dailyMealStateWithResolvedMealLogs(dailyMealState, mealLogs, localState.todayKey);
  const dailyMealHistoryByKey = new Map<string, DailyMealState>();

  [...remoteDailyMealHistory, ...(localState.dailyMealHistory ?? []), ...localState.dailyMealState, ...resolvedDailyMealState].forEach((meal) => {
    const dayKey = meal.dayKey ?? localState.todayKey;
    dailyMealHistoryByKey.set(`${dayKey}-${meal.mealId}`, { ...meal, dayKey });
  });

  return cacheAppState({
    templates,
    historicalMealTemplates,
    mealTemplateAuditSnapshots,
    dailyMealState: resolvedDailyMealState,
    dailyMealHistory: [...dailyMealHistoryByKey.values()],
    activityLogs,
    weightLogs,
    mealLogs,
    manualAlerts,
    todayKey: localState.todayKey,
    source:
      templatesResult.data?.length ||
      dailyMealsResult.data?.length ||
      (!activityLogsResult.error && activityLogsResult.data?.length) ||
      (!weightLogsResult.error && weightLogsResult.data?.length) ||
      (!mealLogsResult.error && mealLogsResult.data?.length) ||
      (!manualAlertsResult.error && manualAlertsResult.data?.length)
        ? "supabase"
        : localState.source,
  });
}

export async function loadAppState(): Promise<HewsterAppState> {
  const cached = cachedAppState();
  if (cached) return cached;

  if (appStateLoadPromise) return appStateLoadPromise;

  appStateLoadPromise = loadAppStateUncached().finally(() => {
    appStateLoadPromise = null;
  });

  return appStateLoadPromise;
}

export async function loadFreshAppState(): Promise<HewsterAppState> {
  appStateCache = null;
  appStateLoadPromise = null;
  return loadAppState();
}

export async function saveTemplatesToSupabase(templates: MealTemplate[]) {
  const signedInSupabase = await getSignedInSupabase();
  if (!signedInSupabase) return;

  const { supabase, userId } = signedInSupabase;
  const sortedTemplates = sortMealTemplatesByTime(templates);
  const rows = sortedTemplates.map((template, index) => mapTemplateToRow(template, index, userId));
  if (appStateCache) {
    cacheAppState({ ...appStateCache.state, templates: sortedTemplates });
  }

  const deleteQuery = supabase
    .from("meal_templates")
    .delete()
    .eq("owner_id", userId)
    .eq("profile_slug", HEWSTER_PROFILE_SLUG);

  const deleted = sortedTemplates.length
    ? await deleteQuery.not("meal_id", "in", `(${sortedTemplates.map((template) => template.id).join(",")})`)
    : await deleteQuery;

  if (deleted.error) {
    throw deleted.error;
  }

  if (!rows.length) return;

  const { error } = await supabase.from("meal_templates").upsert(rows, {
    onConflict: "owner_id,profile_slug,meal_id",
  });

  if (error) {
    throw error;
  }
}

export async function saveDailyMealsToSupabase(dailyMealState: DailyMealState[]) {
  const signedInSupabase = await getSignedInSupabase();
  if (!signedInSupabase) return;

  const { supabase, userId } = signedInSupabase;
  const rows = dailyMealState.map((state) => mapDailyMealStateToRow(state, userId));
  cacheDailyMealState(dailyMealState);

  const { error } = await supabase.from("daily_meals").upsert(rows, {
    onConflict: "owner_id,profile_slug,day_key,meal_id",
  });

  if (error && error.message.includes("fed_notes")) {
    const fallbackRows = dailyMealState.map((state) => ({
      owner_id: userId,
      profile_slug: HEWSTER_PROFILE_SLUG,
      meal_id: state.mealId,
      actual_time: state.actualTime,
      status: state.status,
    }));

    const fallbackResult = await supabase.from("daily_meals").upsert(fallbackRows, {
      onConflict: "owner_id,profile_slug,meal_id",
    });

    if (fallbackResult.error) {
      throw fallbackResult.error;
    }

    return;
  }

  if (error) {
    throw error;
  }
}

export async function saveActivityLogToSupabase(activity: ActivityLog) {
  cacheActivityLog(activity);

  const signedInSupabase = await getSignedInSupabase();
  if (!signedInSupabase) return;

  const { supabase, userId } = signedInSupabase;
  const { error } = await supabase.from("activity_logs").upsert(mapActivityLogToRow(activity, userId), {
    onConflict: "id",
  });

  if (error) {
    throw error;
  }
}

export async function updateActivityLogInSupabase(activity: ActivityLog) {
  const signedInSupabase = await getSignedInSupabase();
  if (!signedInSupabase) {
    cacheActivityLog(activity);
    return;
  }

  const { supabase, userId, accessRole } = signedInSupabase;
  requireEntryEditAccess(accessRole);
  cacheActivityLog(activity);
  const { error } = await supabase
    .from("activity_logs")
    .update({
      happened_at: activity.happenedAt,
      detail: activity.detail,
      notes: activity.notes,
    })
    .eq("id", activity.id)
    .eq("owner_id", userId)
    .eq("profile_slug", HEWSTER_PROFILE_SLUG);

  if (error) {
    throw error;
  }
}

export async function saveActivityAttachmentsToSupabase(activity: ActivityLog, files: File[], documentTypes: string[]) {
  const signedInSupabase = await getSignedInSupabase();
  if (!signedInSupabase || !files.length) return [];

  const { supabase, userId } = signedInSupabase;
  const savedAttachments: ActivityAttachment[] = [];

  const clearExisting = await supabase
    .from("activity_attachments")
    .delete()
    .eq("activity_log_id", activity.id)
    .eq("owner_id", userId)
    .eq("profile_slug", HEWSTER_PROFILE_SLUG);

  if (clearExisting.error) {
    if (isAttachmentStorageSetupError(clearExisting.error)) {
      console.warn("Attachment storage is not set up yet; saved filename notes only.", clearExisting.error);
      return [];
    }

    throw clearExisting.error;
  }

  for (const file of files) {
    const attachmentId = crypto.randomUUID();
    const filePath = activityAttachmentStoragePath(userId, activity.id, attachmentId, file.name);
    const uploadResult = await supabase.storage
      .from("pet-attachments")
      .upload(filePath, file, {
        cacheControl: "3600",
        contentType: file.type || undefined,
        upsert: false,
      });

    if (uploadResult.error) {
      if (isAttachmentStorageSetupError(uploadResult.error)) {
        console.warn("Attachment storage bucket is not set up yet; saved filename notes only.", uploadResult.error);
        return savedAttachments;
      }

      throw uploadResult.error;
    }

    const row: ActivityAttachmentRow = {
      id: attachmentId,
      owner_id: userId,
      profile_slug: HEWSTER_PROFILE_SLUG,
      activity_log_id: activity.id,
      file_name: file.name,
      file_path: filePath,
      content_type: file.type || null,
      size_bytes: file.size,
      document_types: documentTypes,
    };

    const insertResult = await supabase.from("activity_attachments").insert(row);

    if (insertResult.error) {
      await supabase.storage.from("pet-attachments").remove([filePath]).catch(() => undefined);
      if (isAttachmentStorageSetupError(insertResult.error)) {
        console.warn("Attachment metadata table is not set up yet; saved filename notes only.", insertResult.error);
        return savedAttachments;
      }

      throw insertResult.error;
    }

    savedAttachments.push(mapActivityAttachmentRowToAttachment(row));
  }

  cacheActivityAttachments(activity.id, savedAttachments);
  return savedAttachments;
}

export async function deleteActivityLogInSupabase(activityId: string) {
  const signedInSupabase = await getSignedInSupabase();
  if (!signedInSupabase) {
    removeCachedActivityLog(activityId);
    return;
  }

  const { supabase, userId, accessRole } = signedInSupabase;
  requireEntryDeleteAccess(accessRole);
  removeCachedActivityLog(activityId);
  const { error } = await supabase
    .from("activity_logs")
    .delete()
    .eq("id", activityId)
    .eq("owner_id", userId)
    .eq("profile_slug", HEWSTER_PROFILE_SLUG);

  if (error) {
    throw error;
  }
}

function safeStorageFileName(fileName: string) {
  const cleaned = fileName
    .trim()
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 120);

  return cleaned || "attachment";
}

function activityAttachmentStoragePath(ownerId: string, activityId: string, attachmentId: string, fileName: string) {
  return `${ownerId}/${HEWSTER_PROFILE_SLUG}/${activityId}/${attachmentId}-${safeStorageFileName(fileName)}`;
}

function isAttachmentStorageSetupError(error: { message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  return (
    message.includes("activity_attachments") ||
    message.includes("pet-attachments") ||
    message.includes("bucket") ||
    message.includes("relation") ||
    message.includes("does not exist")
  );
}

export async function deleteCareItemActivityLogsFromSupabase(kind: CareItemKind, deletedItems: CareItemTemplate[]) {
  const deletedCareItems = deletedItems.filter((item) => item.kind === kind);
  if (!deletedCareItems.length) return;

  const signedInSupabase = await getSignedInSupabase();
  if (!signedInSupabase) return;

  const { supabase, userId } = signedInSupabase;
  const { data, error } = await supabase
    .from("activity_logs")
    .select("id, owner_id, profile_slug, activity_type, happened_at, detail, notes, created_at")
    .eq("owner_id", userId)
    .eq("profile_slug", HEWSTER_PROFILE_SLUG)
    .eq("activity_type", kind);

  if (error) throw error;

  const activityIds = ((data ?? []) as ActivityLogRow[])
    .map(mapActivityLogRowToActivity)
    .filter((activity) => deletedCareItems.some((item) => activityMatchesCareItem(activity, item)))
    .map((activity) => activity.id);

  if (!activityIds.length) return;

  activityIds.forEach(removeCachedActivityLog);

  const deleteResult = await supabase
    .from("activity_logs")
    .delete()
    .eq("owner_id", userId)
    .eq("profile_slug", HEWSTER_PROFILE_SLUG)
    .in("id", activityIds);

  if (deleteResult.error) {
    throw deleteResult.error;
  }
}

export async function saveWeightLogToSupabase(weight: WeightLog) {
  const signedInSupabase = await getSignedInSupabase();
  if (!signedInSupabase) return;

  const { supabase, userId } = signedInSupabase;
  const { error } = await supabase.from("weight_logs").upsert(mapWeightLogToRow(weight, userId), {
    onConflict: "id",
  });

  if (error) {
    throw error;
  }
}

export async function updateWeightLogInSupabase(weight: WeightLog) {
  const signedInSupabase = await getSignedInSupabase();
  if (!signedInSupabase) return;

  const { supabase, userId, accessRole } = signedInSupabase;
  requireEntryEditAccess(accessRole);
  const { error } = await supabase
    .from("weight_logs")
    .update(mapWeightLogToRow(weight, userId))
    .eq("id", weight.id)
    .eq("owner_id", userId)
    .eq("profile_slug", HEWSTER_PROFILE_SLUG);

  if (error) {
    throw error;
  }
}

export async function deleteWeightLogInSupabase(weightLogId: string) {
  const signedInSupabase = await getSignedInSupabase();
  if (!signedInSupabase) return;

  const { supabase, userId, accessRole } = signedInSupabase;
  requireEntryDeleteAccess(accessRole);
  const { error } = await supabase
    .from("weight_logs")
    .delete()
    .eq("id", weightLogId)
    .eq("owner_id", userId)
    .eq("profile_slug", HEWSTER_PROFILE_SLUG);

  if (error) {
    throw error;
  }
}

export async function saveMealLogToSupabase(mealLog: MealLog) {
  cacheMealLog(mealLog);

  const signedInSupabase = await getSignedInSupabase();
  if (!signedInSupabase) return;

  const { supabase, userId } = signedInSupabase;
  const { error } = await supabase.from("meal_logs").upsert(mapMealLogToRow(mealLog, userId), {
    onConflict: "id",
  });

  if (error) {
    throw error;
  }
}

export async function saveCompletedMealToSupabase(mealLog: MealLog, dailyMealState: DailyMealState[], staleMealLogId?: string) {
  cacheCompletedMeal(mealLog, dailyMealState);

  const signedInSupabase = await getSignedInSupabase();
  if (!signedInSupabase) return;

  const { supabase, userId } = signedInSupabase;
  const dailyMeal = dailyMealState.find(
    (state) => state.mealId === mealLog.mealId && (state.dayKey ?? currentTodayKey()) === mealLog.dayKey
  ) ?? {
    mealId: mealLog.mealId,
    actualTime: mealLog.actualTime,
    status: "done" as MealStatus,
    fedNotes: mealLog.fedNotes,
    skippedCareItemIds: mealLog.skippedCareItemIds ?? [],
    dayKey: mealLog.dayKey,
  };

  const dailyMealRow = mapDailyMealStateToRow(dailyMeal, userId);
  const { error: dailyMealError } = await supabase.from("daily_meals").upsert(dailyMealRow, {
    onConflict: "owner_id,profile_slug,day_key,meal_id",
  });

  if (dailyMealError) {
    throw dailyMealError;
  }

  const { error: mealLogError } = await supabase.from("meal_logs").upsert(mapMealLogToRow(mealLog, userId), {
    onConflict: "id",
  });

  if (mealLogError) {
    throw mealLogError;
  }

  if (staleMealLogId) {
    removeCachedMealLog(staleMealLogId);
    const { error: deleteError } = await supabase
      .from("meal_logs")
      .delete()
      .eq("id", staleMealLogId)
      .eq("owner_id", userId)
      .eq("profile_slug", HEWSTER_PROFILE_SLUG);

    if (deleteError) {
      throw deleteError;
    }
  }

  const [{ data: savedDailyMeal, error: verifyDailyError }, { data: savedMealLog, error: verifyLogError }] = await Promise.all([
    supabase
      .from("daily_meals")
      .select("actual_time,status")
      .eq("owner_id", userId)
      .eq("profile_slug", HEWSTER_PROFILE_SLUG)
      .eq("day_key", mealLog.dayKey)
      .eq("meal_id", mealLog.mealId)
      .maybeSingle(),
    supabase
      .from("meal_logs")
      .select("id")
      .eq("id", mealLog.id)
      .eq("owner_id", userId)
      .eq("profile_slug", HEWSTER_PROFILE_SLUG)
      .maybeSingle(),
  ]);

  if (verifyDailyError) throw verifyDailyError;
  if (verifyLogError) throw verifyLogError;

  if (!savedDailyMeal?.actual_time || savedDailyMeal.status !== "done" || !savedMealLog?.id) {
    throw new Error("Meal save verification failed");
  }
}

export async function deleteMealLogInSupabase(mealLogId: string) {
  const signedInSupabase = await getSignedInSupabase();
  if (!signedInSupabase) {
    removeCachedMealLog(mealLogId);
    return;
  }

  const { supabase, userId, accessRole } = signedInSupabase;
  requireEntryDeleteAccess(accessRole);
  removeCachedMealLog(mealLogId);
  const { error } = await supabase
    .from("meal_logs")
    .delete()
    .eq("id", mealLogId)
    .eq("owner_id", userId)
    .eq("profile_slug", HEWSTER_PROFILE_SLUG);

  if (error) {
    throw error;
  }
}

export async function saveManualAlertToSupabase(alert: ManualAlert) {
  const signedInSupabase = await getSignedInSupabase();
  if (!signedInSupabase) return;

  const { supabase, userId } = signedInSupabase;
  const { error } = await supabase.from("manual_alerts").insert(mapManualAlertToRow(alert, userId));

  if (error) {
    throw error;
  }
}

export async function updateManualAlertInSupabase(alert: ManualAlert) {
  const signedInSupabase = await getSignedInSupabase();
  if (!signedInSupabase) return;

  const { supabase, userId } = signedInSupabase;
  const { error } = await supabase
    .from("manual_alerts")
    .update({
      title: alert.title,
      message: alert.message,
      scope: alert.scope ?? "today",
      weekdays: alert.weekdays ?? null,
      time: alert.time ?? null,
      created_day_key: alert.createdDayKey ?? null,
      resolved: alert.resolved,
      resolved_at: alert.resolvedAt ?? null,
    })
    .eq("id", alert.id)
    .eq("owner_id", userId)
    .eq("profile_slug", HEWSTER_PROFILE_SLUG);

  if (error) {
    throw error;
  }
}

export async function deleteManualAlertInSupabase(alertId: string) {
  const signedInSupabase = await getSignedInSupabase();
  if (!signedInSupabase) return;

  const { supabase, userId } = signedInSupabase;
  const { error } = await supabase
    .from("manual_alerts")
    .delete()
    .eq("id", alertId)
    .eq("owner_id", userId)
    .eq("profile_slug", HEWSTER_PROFILE_SLUG);

  if (error) {
    throw error;
  }
}
