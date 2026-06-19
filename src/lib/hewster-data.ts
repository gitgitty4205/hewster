import { compareActivitiesReverseChronological } from "@/lib/activity";
import type { User } from "@supabase/supabase-js";
import type { CareItemKind, CareItemTemplate } from "@/lib/care-settings";
import type { MealStatus, MealTemplate } from "@/lib/meal-templates";
import { clampMealFoodText, clampMealNameText, clampMealNoteText, initialTemplates, isInitialMealTemplatePlan, isMealTemplateArray, normalizeMealTemplate, sortMealTemplatesByTime, STORAGE_KEY } from "@/lib/meal-templates";
import {
  canAttemptLimitedNotebookEntryEdit,
  canDeleteNotebookEntries,
  canEditNotebookEntries,
  canUseNotebookAttachments,
  resolveActiveNotebookAccess,
  type NotebookMember,
  type NotebookAccessRole,
} from "@/lib/notebook-access";
import { getSupabaseBrowserClient, getSupabaseCurrentSession, getActiveProfileSlug, HEWSTER_PROFILE_SLUG, isSupabaseConfigured } from "@/lib/supabase";

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
  loggedByUserId: string | null;
  loggedBy: string | null;
  loggedAt: string | null;
  lastEditedByUserId: string | null;
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
  loggedCareItems?: Array<CareItemTemplate & { skipped?: boolean; isLastDose?: boolean }>;
  actualTime: string;
  auditInfo?: NotebookEntryAuditInfo;
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
  notebookOwnerId?: string | null;
  source: "supabase" | "local" | "seed";
};

export type MealTemplateAuditSnapshot = {
  id?: number;
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
const ACTIVITY_AUDIT_DETAILS_LIMIT = 99;
const MEAL_LOG_CARE_SNAPSHOT_MARKER = "<!--petnotebook-care-snapshot:";
const ACTIVITY_TYPES = new Set<ActivityType>([
  "potty",
  "pee",
  "poop",
  "activity",
  "outdoor",
  "care",
  "wellness",
  "hike",
  "treat",
  "food",
  "supplement",
  "medication",
  "sick",
  "other",
]);
let appStateCache: { state: HewsterAppState; cachedAt: number } | null = null;
let appStateLoadPromise: Promise<HewsterAppState> | null = null;

export function activeProfileStorageKey(storageKey: string) {
  return `${storageKey}.${getActiveProfileSlug()}`;
}

function getProfileScopedItem(storageKey: string) {
  const scopedValue = window.localStorage.getItem(activeProfileStorageKey(storageKey));
  if (scopedValue !== null) return scopedValue;
  if (getActiveProfileSlug() === HEWSTER_PROFILE_SLUG) return window.localStorage.getItem(storageKey);
  return null;
}

function setProfileScopedItem(storageKey: string, value: string) {
  window.localStorage.setItem(activeProfileStorageKey(storageKey), value);
  if (getActiveProfileSlug() === HEWSTER_PROFILE_SLUG) {
    window.localStorage.setItem(storageKey, value);
  }
}

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

  const existingActivity = appStateCache.state.activityLogs.find((entry) => entry.id === activity.id);

  cacheAppState({
    ...appStateCache.state,
    activityLogs: [
      { ...activity, attachments: activity.attachments ?? existingActivity?.attachments },
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
    const storedHistory = getProfileScopedItem(DAILY_MEAL_HISTORY_STORAGE_KEY);
    existingHistory = normalizeDailyMealHistory(storedHistory ? JSON.parse(storedHistory) : null, fallbackDayKey);
  } catch {
    existingHistory = [];
  }
  const nextHistory = mergeDailyMealHistory(existingHistory, dailyMealState, fallbackDayKey);

  setProfileScopedItem(DAILY_MEAL_STORAGE_KEY, JSON.stringify(dailyMealState));
  setProfileScopedItem(DAILY_MEAL_HISTORY_STORAGE_KEY, JSON.stringify(nextHistory));
}

async function getSignedInSupabase() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;

  const session = await getSupabaseCurrentSession(supabase);
  const user = session?.user ?? null;
  if (!user) return null;

  const access = await resolveActiveNotebookAccess(supabase, user, { forceRefresh: true });
  return { supabase, user, userId: access.notebookOwnerId, accessRole: access.role, members: access.members };
}

function requireEntryEditAccess(accessRole: NotebookAccessRole) {
  if (!canEditNotebookEntries(accessRole)) {
    throw new Error("Only owners and co-owners can edit saved notebook entries.");
  }
}

function isWithinCaretakerEditWindow(value: string | null | undefined) {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && Date.now() - time <= 24 * 60 * 60 * 1000;
}

function canEditNotebookEntryForActor(accessRole: NotebookAccessRole, actorUserId: string, entry?: { auditInfo?: NotebookEntryAuditInfo; createdAt?: string }) {
  if (canEditNotebookEntries(accessRole)) return true;
  if (accessRole !== "caretaker" && accessRole !== "pet-sitter") return false;
  const loggedByUserId = entry?.auditInfo?.loggedByUserId ?? null;
  const loggedAt = entry?.auditInfo?.loggedAt ?? entry?.createdAt ?? null;
  return loggedByUserId === actorUserId && isWithinCaretakerEditWindow(loggedAt);
}

function requireNotebookEntryEditAccess(accessRole: NotebookAccessRole, actorUserId: string, entry?: { auditInfo?: NotebookEntryAuditInfo; createdAt?: string }) {
  if (!canEditNotebookEntryForActor(accessRole, actorUserId, entry)) {
    throw new Error("Caretakers can only edit entries they logged themselves within 24 hours.");
  }
}

function requireEntryDeleteAccess(accessRole: NotebookAccessRole) {
  if (!canDeleteNotebookEntries(accessRole)) {
    throw new Error("Only the notebook owner can delete saved notebook entries.");
  }
}

export async function loadNotebookEntryPermissions() {
  const signedInSupabase = await getSignedInSupabase();
  if (!signedInSupabase) return { canEditEntries: true, canDeleteEntries: true, canUseAttachments: true };

  return {
    canEditEntries: canAttemptLimitedNotebookEntryEdit(signedInSupabase.accessRole),
    canDeleteEntries: canDeleteNotebookEntries(signedInSupabase.accessRole),
    canUseAttachments: canUseNotebookAttachments(signedInSupabase.accessRole),
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
  active?: boolean | null;
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
  id?: number;
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
    const stored = getProfileScopedItem(DELETED_WEIGHT_LOG_IDS_STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : null;
    return new Set([...RETIRED_WEIGHT_LOG_IDS, ...(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [])]);
  } catch {
    return new Set(RETIRED_WEIGHT_LOG_IDS);
  }
}

export function markWeightLogDeleted(weightLogId: string) {
  const deletedIds = readDeletedWeightLogIds();
  deletedIds.add(weightLogId);
  setProfileScopedItem(DELETED_WEIGHT_LOG_IDS_STORAGE_KEY, JSON.stringify([...deletedIds]));
}

export function unmarkWeightLogDeleted(weightLogId: string) {
  const deletedIds = readDeletedWeightLogIds();
  if (!deletedIds.delete(weightLogId)) return;
  setProfileScopedItem(DELETED_WEIGHT_LOG_IDS_STORAGE_KEY, JSON.stringify([...deletedIds]));
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
    const storedTemplates = getProfileScopedItem(STORAGE_KEY);
    const storedDailyMeals = getProfileScopedItem(DAILY_MEAL_STORAGE_KEY);
    const storedDailyMealHistory = getProfileScopedItem(DAILY_MEAL_HISTORY_STORAGE_KEY);
    const storedActivityLogs = getProfileScopedItem(ACTIVITY_LOGS_STORAGE_KEY);
    const storedWeightLogs = getProfileScopedItem(WEIGHT_LOGS_STORAGE_KEY);
    const storedMealLogs = getProfileScopedItem(MEAL_LOGS_STORAGE_KEY);
    const storedManualAlerts = getProfileScopedItem(MANUAL_ALERTS_STORAGE_KEY);
    const storedTodayKey = getProfileScopedItem(TODAY_KEY_STORAGE_KEY);

    const templates = storedTemplates ? JSON.parse(storedTemplates) : null;
    const dailyMeals = storedDailyMeals ? JSON.parse(storedDailyMeals) : null;
    const dailyMealHistory = storedDailyMealHistory ? JSON.parse(storedDailyMealHistory) : null;
    const activityLogs = storedActivityLogs ? JSON.parse(storedActivityLogs) : null;
    const weightLogs = storedWeightLogs ? JSON.parse(storedWeightLogs) : null;
    const mealLogs = storedMealLogs ? JSON.parse(storedMealLogs) : null;
    const manualAlerts = storedManualAlerts ? JSON.parse(storedManualAlerts) : null;
    const todayKey = storedTodayKey ?? currentTodayKey();
    const resolvedTemplates = sortMealTemplatesByTime((isMealTemplateArray(templates) ? templates : seed.templates).map((template) => ({
      ...normalizeMealTemplate(template),
      name: clampMealNameText(template.name),
      food: clampMealFoodText(template.food),
      notes: clampMealNoteText(template.notes),
    })));
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
  const resolvedTemplates = templates.map((template) => ({
    ...normalizeMealTemplate(template),
    name: clampMealNameText(template.name),
    food: clampMealFoodText(template.food),
    notes: clampMealNoteText(template.notes),
  }));
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

  setProfileScopedItem(STORAGE_KEY, JSON.stringify(resolvedTemplates));
  persistDailyMealStateLocally(resolvedDailyMealState, todayKey);
  setProfileScopedItem(ACTIVITY_LOGS_STORAGE_KEY, JSON.stringify(resolvedActivityLogs));
  setProfileScopedItem(WEIGHT_LOGS_STORAGE_KEY, JSON.stringify(resolvedWeightLogs));
  setProfileScopedItem(MANUAL_ALERTS_STORAGE_KEY, JSON.stringify(resolvedManualAlerts));
  setProfileScopedItem(MEAL_LOGS_STORAGE_KEY, JSON.stringify(resolvedMealLogs));
  setProfileScopedItem(TODAY_KEY_STORAGE_KEY, todayKey);

  cacheAppState({
    templates: resolvedTemplates,
    historicalMealTemplates: existingState.historicalMealTemplates ?? resolvedTemplates,
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

function encodeMealLogDefaultNotes(defaultNotes: string, loggedCareItems?: MealLog["loggedCareItems"]) {
  if (!loggedCareItems?.length) return defaultNotes;
  return `${defaultNotes}\n${MEAL_LOG_CARE_SNAPSHOT_MARKER}${encodeURIComponent(JSON.stringify(loggedCareItems))}-->`;
}

function decodeMealLogDefaultNotes(defaultNotes: string) {
  const markerIndex = defaultNotes.indexOf(MEAL_LOG_CARE_SNAPSHOT_MARKER);
  if (markerIndex === -1) return { defaultNotes, loggedCareItems: undefined as MealLog["loggedCareItems"] | undefined };

  const encoded = defaultNotes
    .slice(markerIndex + MEAL_LOG_CARE_SNAPSHOT_MARKER.length)
    .split("-->")[0];

  try {
    const parsed = JSON.parse(decodeURIComponent(encoded));
    return {
      defaultNotes: defaultNotes.slice(0, markerIndex).trimEnd(),
      loggedCareItems: Array.isArray(parsed) ? parsed as MealLog["loggedCareItems"] : undefined,
    };
  } catch {
    return { defaultNotes: defaultNotes.slice(0, markerIndex).trimEnd(), loggedCareItems: undefined as MealLog["loggedCareItems"] | undefined };
  }
}

export function removeCareItemReferencesLocally(kind: CareItemKind, deletedItems: CareItemTemplate[]) {
  if (typeof window === "undefined" || !deletedItems.length) return;

  const deletedCareItems = deletedItems.filter((item) => item.kind === kind);
  if (!deletedCareItems.length) return;

  const deletedCareItemIds = new Set(deletedCareItems.map(careItemStorageKey));

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
    name: clampMealNameText(row.name),
    plannedTime: row.planned_time,
    food: clampMealFoodText(row.food),
    notes: clampMealNoteText(row.notes),
    active: row.active !== false,
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
    name: clampMealNameText(row.name),
    plannedTime: row.planned_time,
    food: clampMealFoodText(row.food),
    notes: clampMealNoteText(row.notes),
    active: row.active !== false,
  };
}

function mapMealTemplateAuditSnapshots(auditRows: AppAuditLogRow[] = []): MealTemplateAuditSnapshot[] {
  return auditRows
    .filter((auditRow) => auditRow.table_name === "meal_templates")
    .map((auditRow) => ({
      id: auditRow.id,
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
    .sort((a, b) => {
      const timeOrder = b.occurredAt.localeCompare(a.occurredAt);
      if (timeOrder !== 0) return timeOrder;
      return (b.id ?? 0) - (a.id ?? 0);
    })
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

function userAccountDisplayName(user: User | null | undefined) {
  if (!user) return "";

  const metadata = user.user_metadata ?? {};
  const firstName = typeof metadata.first_name === "string" ? metadata.first_name.trim() : "";
  const lastName = typeof metadata.last_name === "string" ? metadata.last_name.trim() : "";
  const fullName = typeof metadata.full_name === "string" ? metadata.full_name.trim() : "";
  return [firstName, lastName].filter(Boolean).join(" ") || fullName || "";
}

function memberDisplayNames(members: NotebookMember[], currentUser?: User | null) {
  const names = new Map<string, string>();
  const currentUserName = userAccountDisplayName(currentUser);

  members.forEach((member) => {
    if (member.memberUserId) {
      names.set(
        member.memberUserId,
        member.memberUserId === currentUser?.id && currentUserName ? currentUserName : displayNameFromEmail(member.memberEmail),
      );
    }
    if (member.role === "owner") {
      names.set(
        member.notebookOwnerId,
        member.notebookOwnerId === currentUser?.id && currentUserName ? currentUserName : displayNameFromEmail(member.memberEmail),
      );
    }
  });

  return names;
}

function actorDisplayName(actorUserId: string | null | undefined, memberNames: Map<string, string>) {
  if (!actorUserId) return null;
  return memberNames.get(actorUserId) ?? "Shared account";
}

function auditRowEntryId(row: AppAuditLogRow) {
  const rowPkId = row.row_pk?.id;
  if (typeof rowPkId === "string") return rowPkId;

  const newRowId = row.new_row?.id;
  if (typeof newRowId === "string") return newRowId;

  const oldRowId = row.old_row?.id;
  return typeof oldRowId === "string" ? oldRowId : null;
}

function notebookEntryAuditInfoById(auditRows: AppAuditLogRow[], members: NotebookMember[], tableName: string, currentUser?: User | null) {
  const memberNames = memberDisplayNames(members, currentUser);
  const byEntryId = new Map<string, NotebookEntryAuditInfo>();

  auditRows
    .filter((row) => row.table_name === tableName && row.action !== "DELETE")
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
    .forEach((row) => {
      const entryId = auditRowEntryId(row);
      if (!entryId) return;

      const existing = byEntryId.get(entryId) ?? {
        loggedByUserId: null,
        loggedBy: null,
        loggedAt: null,
        lastEditedByUserId: null,
        lastEditedBy: null,
        lastEditedAt: null,
      };
      const actorName = actorDisplayName(row.actor_user_id, memberNames);

      if (row.action === "INSERT" && !existing.loggedAt) {
        existing.loggedByUserId = row.actor_user_id ?? null;
        existing.loggedBy = actorName;
        existing.loggedAt = row.occurred_at;
      }

      if (row.action === "UPDATE") {
        existing.lastEditedByUserId = row.actor_user_id ?? null;
        existing.lastEditedBy = actorName;
        existing.lastEditedAt = row.occurred_at;
      }

      byEntryId.set(entryId, existing);
    });

  return byEntryId;
}

function activityAuditInfoById(auditRows: AppAuditLogRow[], members: NotebookMember[], currentUser?: User | null) {
  return notebookEntryAuditInfoById(auditRows, members, "activity_logs", currentUser);
}

function mealAuditInfoById(auditRows: AppAuditLogRow[], members: NotebookMember[], currentUser?: User | null) {
  return notebookEntryAuditInfoById(auditRows, members, "meal_logs", currentUser);
}

function isGeneratedCareActivityId(id: string) {
  return /^(?:medication|supplement)-\d+-(?:schedule|meal)-/.test(id);
}

function isActivityLogAuditRow(row: Record<string, unknown> | null): row is ActivityLogRow {
  return (
    !!row &&
    typeof row.id === "string" &&
    typeof row.owner_id === "string" &&
    typeof row.profile_slug === "string" &&
    typeof row.activity_type === "string" &&
    ACTIVITY_TYPES.has(row.activity_type as ActivityType) &&
    typeof row.happened_at === "string" &&
    (typeof row.detail === "string" || row.detail === null) &&
    (typeof row.notes === "string" || row.notes === null)
  );
}

function deletedGeneratedCareActivitiesFromAudit(auditRows: AppAuditLogRow[]) {
  return auditRows
    .filter((row) => row.table_name === "activity_logs" && row.action === "DELETE")
    .flatMap((row) => {
      if (!isActivityLogAuditRow(row.old_row)) return [];
      if (row.old_row.activity_type !== "supplement" && row.old_row.activity_type !== "medication") return [];
      if (!isGeneratedCareActivityId(row.old_row.id)) return [];
      return [mapActivityLogRowToActivity(row.old_row)];
    });
}

export async function loadActivityAuditInfoForReport(activityIds: string[]) {
  const signedInSupabase = await getSignedInSupabase();
  const uniqueActivityIds = [...new Set(activityIds)].filter(Boolean);
  if (!signedInSupabase || !uniqueActivityIds.length) return new Map<string, NotebookEntryAuditInfo>();

  const { supabase, user, userId, members } = signedInSupabase;
  const { data, error } = await supabase.rpc("report_activity_audit_log", {
    report_owner_id: userId,
    report_profile_slug: getActiveProfileSlug(),
    report_activity_ids: uniqueActivityIds,
    report_row_limit: ACTIVITY_AUDIT_DETAILS_LIMIT,
  });

  if (error) {
    console.warn("Report activity audit log unavailable, entry log details will be limited", error);
    return new Map<string, NotebookEntryAuditInfo>();
  }

  return activityAuditInfoById((data ?? []) as AppAuditLogRow[], members, user);
}

export async function loadMealAuditInfoForReport(mealLogIds: string[]) {
  const signedInSupabase = await getSignedInSupabase();
  const uniqueMealLogIds = [...new Set(mealLogIds)].filter(Boolean);
  if (!signedInSupabase || !uniqueMealLogIds.length) return new Map<string, NotebookEntryAuditInfo>();

  const { supabase, user, userId, members } = signedInSupabase;
  const { data, error } = await supabase
    .from("app_audit_log")
    .select("id, table_name, action, occurred_at, actor_user_id, row_pk, old_row, new_row")
    .eq("owner_id", userId)
    .eq("profile_slug", getActiveProfileSlug())
    .eq("table_name", "meal_logs")
    .order("occurred_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(ACTIVITY_AUDIT_DETAILS_LIMIT);

  if (error) {
    console.warn("Meal log audit log unavailable, meal log details will be limited", error);
    return new Map<string, NotebookEntryAuditInfo>();
  }

  const mealLogIdSet = new Set(uniqueMealLogIds);
  const matchingRows = ((data ?? []) as AppAuditLogRow[]).filter((row) => {
    const entryId = auditRowEntryId(row);
    return entryId ? mealLogIdSet.has(entryId) : false;
  });

  return mealAuditInfoById(matchingRows, members, user);
}

function mapTemplateToRow(template: MealTemplate, index: number, ownerId: string): MealTemplateRow {
  return {
    owner_id: ownerId,
    profile_slug: getActiveProfileSlug(),
    meal_id: template.id,
    name: clampMealNameText(template.name),
    planned_time: template.plannedTime,
    food: clampMealFoodText(template.food),
    notes: clampMealNoteText(template.notes),
    active: template.active !== false,
    reminder_offset: "",
    sort_order: index,
  };
}

function mapDailyMealStateToRow(state: DailyMealState, ownerId: string): DailyMealRow {
  return {
    owner_id: ownerId,
    profile_slug: getActiveProfileSlug(),
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
    profile_slug: getActiveProfileSlug(),
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
    profile_slug: getActiveProfileSlug(),
    log_date: weight.date,
    weight: normalizeWeightText(weight.weight),
    note: weight.note ?? null,
  };
}

function mapMealLogRowToMealLog(row: MealLogRow): MealLog {
  const decodedDefaultNotes = decodeMealLogDefaultNotes(row.default_notes);
  return {
    id: row.id,
    profileSlug: row.profile_slug,
    dayKey: row.day_key,
    mealId: row.meal_id,
    mealName: row.meal_name,
    food: row.food,
    defaultNotes: decodedDefaultNotes.defaultNotes,
    fedNotes: row.fed_notes,
    skippedCareItemIds: [],
    loggedCareItems: decodedDefaultNotes.loggedCareItems,
    actualTime: row.actual_time,
    createdAt: row.created_at,
  };
}

function mapMealLogToRow(mealLog: MealLog, ownerId: string): MealLogRow {
  return {
    id: mealLog.id,
    owner_id: ownerId,
    profile_slug: getActiveProfileSlug(),
    day_key: mealLog.dayKey,
    meal_id: mealLog.mealId,
    meal_name: mealLog.mealName,
    food: mealLog.food,
    default_notes: encodeMealLogDefaultNotes(mealLog.defaultNotes, mealLog.loggedCareItems),
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
    profile_slug: getActiveProfileSlug(),
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

  const { supabase, user, userId, members } = signedInSupabase;

  const templatesPromise = supabase
    .from("meal_templates")
    .select("owner_id, profile_slug, meal_id, name, planned_time, food, notes, reminder_offset, sort_order")
    .eq("owner_id", userId)
    .eq("profile_slug", getActiveProfileSlug())
    .order("sort_order", { ascending: true });

  const dailyMealsWithFedNotesPromise = supabase
    .from("daily_meals")
    .select("owner_id, profile_slug, meal_id, day_key, actual_time, status, fed_notes")
    .eq("owner_id", userId)
    .eq("profile_slug", getActiveProfileSlug());

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
      .eq("profile_slug", getActiveProfileSlug());
  }

  if (templatesResult.error || dailyMealsResult.error) {
    console.error("Failed to load core Supabase state", {
      templatesError: templatesResult.error,
      dailyMealsError: dailyMealsResult.error,
    });
    return cacheAppState(localState);
  }

  const [
    activityLogsResult,
    activityAttachmentsResult,
    weightLogsResult,
    mealLogsResult,
    manualAlertsResult,
    mealTemplateAuditLogsResult,
    activityAuditLogsResult,
  ] = await Promise.all([
    supabase
      .from("activity_logs")
      .select("id, owner_id, profile_slug, activity_type, happened_at, detail, notes, created_at")
      .eq("owner_id", userId)
      .eq("profile_slug", getActiveProfileSlug())
      .order("happened_at", { ascending: false }),
    supabase
      .from("activity_attachments")
      .select("id, owner_id, profile_slug, activity_log_id, file_name, file_path, content_type, size_bytes, document_types, created_at")
      .eq("owner_id", userId)
      .eq("profile_slug", getActiveProfileSlug())
      .order("created_at", { ascending: true }),
    supabase
      .from("weight_logs")
      .select("id, owner_id, profile_slug, log_date, weight, note, created_at")
      .eq("owner_id", userId)
      .eq("profile_slug", getActiveProfileSlug())
      .order("log_date", { ascending: false }),
    supabase
      .from("meal_logs")
      .select("id, owner_id, profile_slug, day_key, meal_id, meal_name, food, default_notes, fed_notes, actual_time, created_at")
      .eq("owner_id", userId)
      .eq("profile_slug", getActiveProfileSlug())
      .order("created_at", { ascending: false }),
    supabase
      .from("manual_alerts")
      .select("id, owner_id, profile_slug, title, message, scope, weekdays, time, created_day_key, resolved, created_at, resolved_at")
      .eq("owner_id", userId)
      .eq("profile_slug", getActiveProfileSlug())
      .order("created_at", { ascending: false }),
    supabase
      .from("app_audit_log")
      .select("id, table_name, action, occurred_at, actor_user_id, row_pk, old_row, new_row")
      .eq("owner_id", userId)
      .eq("profile_slug", getActiveProfileSlug())
      .eq("table_name", "meal_templates")
      .order("occurred_at", { ascending: false })
      .order("id", { ascending: false }),
    supabase
      .from("app_audit_log")
      .select("id, table_name, action, occurred_at, actor_user_id, row_pk, old_row, new_row")
      .eq("owner_id", userId)
      .eq("profile_slug", getActiveProfileSlug())
      .eq("table_name", "activity_logs")
      .order("occurred_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(ACTIVITY_AUDIT_DETAILS_LIMIT),
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

  if (mealTemplateAuditLogsResult.error) {
    console.warn("Meal template audit log unavailable, history will use current meal templates only", mealTemplateAuditLogsResult.error);
  }

  if (activityAuditLogsResult.error) {
    console.warn("Activity audit log unavailable, entry log details will be limited", activityAuditLogsResult.error);
  }

  const localTemplatesAreUserPlan = localState.source === "local" && !isInitialMealTemplatePlan(localState.templates);
  const templates = sortMealTemplatesByTime(
    templatesResult.data?.length
      ? (templatesResult.data as MealTemplateRow[]).map(mapTemplateRowToTemplate)
      : localTemplatesAreUserPlan
        ? localState.templates
        : []
  );
  const mealTemplateAuditRows =
    !mealTemplateAuditLogsResult.error && mealTemplateAuditLogsResult.data?.length
      ? (mealTemplateAuditLogsResult.data as AppAuditLogRow[])
      : [];
  const activityAuditRows =
    !activityAuditLogsResult.error && activityAuditLogsResult.data?.length
      ? (activityAuditLogsResult.data as AppAuditLogRow[])
      : [];
  const historicalMealTemplates = mergeHistoricalMealTemplates(
    templates,
    mealTemplateAuditRows
  );
  const mealTemplateAuditSnapshots = mapMealTemplateAuditSnapshots(mealTemplateAuditRows);
  const activityAuditInfo = activityAuditInfoById(activityAuditRows, members, user);

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
  const restoredDeletedCareLogs = deletedGeneratedCareActivitiesFromAudit(activityAuditRows);

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
  restoredDeletedCareLogs.forEach((entry) => {
    if (!activityLogsById.has(entry.id)) activityLogsById.set(entry.id, entry);
  });
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
          .eq("profile_slug", getActiveProfileSlug())
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
        loggedCareItems: entry.loggedCareItems?.length ? entry.loggedCareItems : localMatch?.loggedCareItems,
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
    notebookOwnerId: userId,
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

export function invalidateAppStateCache() {
  appStateCache = null;
  appStateLoadPromise = null;
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
    .eq("profile_slug", getActiveProfileSlug());

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
      profile_slug: getActiveProfileSlug(),
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
  if (!signedInSupabase) {
    throw new Error("Sign in is required to save shared activity logs.");
  }

  const { supabase, userId } = signedInSupabase;
  const { data, error } = await supabase
    .from("activity_logs")
    .upsert(mapActivityLogToRow(activity, userId), {
      onConflict: "id",
    })
    .select("id, owner_id, profile_slug")
    .single();

  if (error) {
    throw error;
  }

  if (!data || data.owner_id !== userId || data.profile_slug !== getActiveProfileSlug()) {
    throw new Error("Activity save verification failed.");
  }
}

export async function updateActivityLogInSupabase(activity: ActivityLog) {
  const signedInSupabase = await getSignedInSupabase();
  if (!signedInSupabase) {
    cacheActivityLog(activity);
    return;
  }

  const { supabase, user, userId, accessRole } = signedInSupabase;
  requireNotebookEntryEditAccess(accessRole, user.id, activity);
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
    .eq("profile_slug", getActiveProfileSlug());

  if (error) {
    throw error;
  }
}

type SaveActivityAttachmentsOptions = {
  replaceExisting?: boolean;
};

export async function saveActivityAttachmentsToSupabase(activity: ActivityLog, files: File[], documentTypes: string[], options: SaveActivityAttachmentsOptions = {}) {
  const signedInSupabase = await getSignedInSupabase();
  if (!signedInSupabase || !files.length) return [];

  const { supabase, userId, accessRole } = signedInSupabase;
  if (!canUseNotebookAttachments(accessRole)) {
    throw new Error("Caretakers cannot add attachments.");
  }
  const savedAttachments: ActivityAttachment[] = [];
  const replaceExisting = options.replaceExisting ?? true;

  if (replaceExisting) {
    const clearExisting = await supabase
      .from("activity_attachments")
      .delete()
      .eq("activity_log_id", activity.id)
      .eq("owner_id", userId)
      .eq("profile_slug", getActiveProfileSlug());

    if (clearExisting.error) {
      if (isAttachmentStorageSetupError(clearExisting.error)) {
        console.warn("Attachment storage is not set up yet; saved filename notes only.", clearExisting.error);
        return [];
      }

      throw clearExisting.error;
    }
  }

  const savedFileNames = activityAttachmentFileNamesForSave(activity, files, documentTypes);

  for (const [index, file] of files.entries()) {
    const attachmentId = crypto.randomUUID();
    const fileName = savedFileNames[index] ?? file.name;
    const filePath = activityAttachmentStoragePath(userId, activity.id, attachmentId, fileName);
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
      profile_slug: getActiveProfileSlug(),
      activity_log_id: activity.id,
      file_name: fileName,
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

  if (replaceExisting) {
    cacheActivityAttachments(activity.id, savedAttachments);
  } else if (appStateCache) {
    const existingAttachments =
      appStateCache.state.activityLogs.find((entry) => entry.id === activity.id)?.attachments ?? [];
    cacheActivityAttachments(activity.id, [...existingAttachments, ...savedAttachments]);
  }
  return savedAttachments;
}

export async function deleteActivityAttachmentsFromSupabase(activityId: string, attachments: ActivityAttachment[]) {
  if (!attachments.length) return;

  const signedInSupabase = await getSignedInSupabase();
  const attachmentIds = attachments.map((attachment) => attachment.id);

  if (!signedInSupabase) {
    const existingAttachments =
      appStateCache?.state.activityLogs.find((entry) => entry.id === activityId)?.attachments ?? [];
    cacheActivityAttachments(activityId, existingAttachments.filter((attachment) => !attachmentIds.includes(attachment.id)));
    return;
  }

  const { supabase, userId, accessRole } = signedInSupabase;
  requireEntryEditAccess(accessRole);
  const filePaths = attachments.map((attachment) => attachment.filePath).filter(Boolean);

  const deleteResult = await supabase
    .from("activity_attachments")
    .delete()
    .in("id", attachmentIds)
    .eq("activity_log_id", activityId)
    .eq("owner_id", userId)
    .eq("profile_slug", getActiveProfileSlug());

  if (deleteResult.error) {
    if (isAttachmentStorageSetupError(deleteResult.error)) {
      console.warn("Attachment metadata table is not set up yet; removed attachments locally only.", deleteResult.error);
      const existingAttachments =
        appStateCache?.state.activityLogs.find((entry) => entry.id === activityId)?.attachments ?? [];
      cacheActivityAttachments(activityId, existingAttachments.filter((attachment) => !attachmentIds.includes(attachment.id)));
      return;
    }

    throw deleteResult.error;
  }

  if (filePaths.length) {
    await supabase.storage.from("pet-attachments").remove(filePaths).catch((error) => {
      console.warn("Could not remove attachment files from storage", error);
    });
  }

  const existingAttachments =
    appStateCache?.state.activityLogs.find((entry) => entry.id === activityId)?.attachments ?? [];
  cacheActivityAttachments(activityId, existingAttachments.filter((attachment) => !attachmentIds.includes(attachment.id)));
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
    .eq("profile_slug", getActiveProfileSlug());

  if (error) {
    throw error;
  }
}

export function activityAttachmentFileNamesForSave(activity: ActivityLog, files: File[], documentTypes: string[]) {
  const isPottyImage =
    documentTypes.includes("Potty Image") ||
    documentTypes.includes("Poop Photo") ||
    activity.activityType === "poop" ||
    activity.activityType === "potty";
  const isHealthAttachment = documentTypes.includes("Medical Attachment");

  if (!isPottyImage && !isHealthAttachment) return files.map((file) => file.name);

  const date = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(activity.happenedAt));

  return files.map((file, index) => {
    const extension = fileExtensionFromName(file.name) || extensionFromContentType(file.type) || "jpg";
    const suffix = files.length > 1 ? ` ${index + 1}` : "";
    if (isPottyImage) return `Potty Image ${date}${suffix}.${extension}`;
    if (file.type.startsWith("image/")) return `Health Image ${date}${suffix}.${extension}`;
    return file.name;
  });
}

function fileExtensionFromName(fileName: string) {
  const trimmed = fileName.trim();
  const extension = trimmed.split(".").pop()?.toLowerCase() ?? "";
  return extension && extension !== trimmed.toLowerCase() && /^[a-z0-9]{1,8}$/.test(extension) ? extension : "";
}

function extensionFromContentType(contentType: string) {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/gif") return "gif";
  if (contentType === "image/heic" || contentType === "image/heif") return "heic";
  return "";
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
  return `${ownerId}/${getActiveProfileSlug()}/${activityId}/${attachmentId}-${safeStorageFileName(fileName)}`;
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
  void kind;
  void deletedItems;
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

  const { supabase, user, userId, accessRole } = signedInSupabase;
  requireNotebookEntryEditAccess(accessRole, user.id, weight);
  const { error } = await supabase
    .from("weight_logs")
    .update(mapWeightLogToRow(weight, userId))
    .eq("id", weight.id)
    .eq("owner_id", userId)
    .eq("profile_slug", getActiveProfileSlug());

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
    .eq("profile_slug", getActiveProfileSlug());

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
      .eq("profile_slug", getActiveProfileSlug());

    if (deleteError) {
      throw deleteError;
    }
  }

  const [{ data: savedDailyMeal, error: verifyDailyError }, { data: savedMealLog, error: verifyLogError }] = await Promise.all([
    supabase
      .from("daily_meals")
      .select("actual_time,status")
      .eq("owner_id", userId)
      .eq("profile_slug", getActiveProfileSlug())
      .eq("day_key", mealLog.dayKey)
      .eq("meal_id", mealLog.mealId)
      .maybeSingle(),
    supabase
      .from("meal_logs")
      .select("id")
      .eq("id", mealLog.id)
      .eq("owner_id", userId)
      .eq("profile_slug", getActiveProfileSlug())
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
    .eq("profile_slug", getActiveProfileSlug());

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
    .eq("profile_slug", getActiveProfileSlug());

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
    .eq("profile_slug", getActiveProfileSlug());

  if (error) {
    throw error;
  }
}
