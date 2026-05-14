import { compareActivitiesReverseChronological } from "@/lib/activity";
import type { MealStatus, MealTemplate } from "@/lib/meal-templates";
import { initialTemplates, isMealTemplateArray, STORAGE_KEY } from "@/lib/meal-templates";
import { getSupabaseBrowserClient, HEWSTER_PROFILE_SLUG, isSupabaseConfigured } from "@/lib/supabase";

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
  dailyMealState: DailyMealState[];
  activityLogs: ActivityLog[];
  weightLogs: WeightLog[];
  mealLogs: MealLog[];
  manualAlerts: ManualAlert[];
  todayKey: string;
  source: "supabase" | "local" | "seed";
};

export const DAILY_MEAL_STORAGE_KEY = "hewster.dailyMeals";
export const ACTIVITY_LOGS_STORAGE_KEY = "hewster.activityLogs";
export const WEIGHT_LOGS_STORAGE_KEY = "hewster.weightLogs";
export const DELETED_WEIGHT_LOG_IDS_STORAGE_KEY = "hewster.deletedWeightLogIds";
export const MEAL_LOGS_STORAGE_KEY = "hewster.mealLogs";
export const MANUAL_ALERTS_STORAGE_KEY = "hewster.manualAlerts";
export const TODAY_KEY_STORAGE_KEY = "hewster.todayKey";

type MealTemplateRow = {
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
  profile_slug: string;
  meal_id: number;
  day_key?: string;
  actual_time: string | null;
  status: MealStatus;
  fed_notes?: string | null;
};

type ActivityLogRow = {
  id: string;
  profile_slug: string;
  activity_type: ActivityType;
  happened_at: string;
  detail: string | null;
  notes: string | null;
  created_at?: string;
};

type WeightLogRow = {
  id: string;
  profile_slug: string;
  log_date: string;
  weight: string;
  note?: string | null;
  created_at?: string;
};

type MealLogRow = {
  id: string;
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
  profile_slug: string;
  title: string;
  message: string;
  resolved: boolean;
  created_at?: string;
  resolved_at?: string | null;
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
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set<string>();
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
    activityLogs: [],
    weightLogs: [],
    mealLogs: [],
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
    const storedActivityLogs = window.localStorage.getItem(ACTIVITY_LOGS_STORAGE_KEY);
    const storedWeightLogs = window.localStorage.getItem(WEIGHT_LOGS_STORAGE_KEY);
    const storedMealLogs = window.localStorage.getItem(MEAL_LOGS_STORAGE_KEY);
    const storedManualAlerts = window.localStorage.getItem(MANUAL_ALERTS_STORAGE_KEY);
    const storedTodayKey = window.localStorage.getItem(TODAY_KEY_STORAGE_KEY);

    const templates = storedTemplates ? JSON.parse(storedTemplates) : null;
    const dailyMeals = storedDailyMeals ? JSON.parse(storedDailyMeals) : null;
    const activityLogs = storedActivityLogs ? JSON.parse(storedActivityLogs) : null;
    const weightLogs = storedWeightLogs ? JSON.parse(storedWeightLogs) : null;
    const mealLogs = storedMealLogs ? JSON.parse(storedMealLogs) : null;
    const manualAlerts = storedManualAlerts ? JSON.parse(storedManualAlerts) : null;
    const todayKey = storedTodayKey ?? currentTodayKey();
    const resolvedTemplates = isMealTemplateArray(templates) ? templates : seed.templates;
    const resolvedDailyMeals = isDailyMealStateArray(dailyMeals)
      ? dailyMeals
          .map((meal) => ({
            mealId: meal.mealId,
            actualTime: meal.actualTime,
            status: meal.status,
            fedNotes: "fedNotes" in meal ? (meal as DailyMealState).fedNotes : null,
            skippedCareItemIds: Array.isArray((meal as DailyMealState).skippedCareItemIds) ? (meal as DailyMealState).skippedCareItemIds : [],
            dayKey: "dayKey" in meal ? (meal as DailyMealState).dayKey ?? todayKey : todayKey,
          }))
          .filter((meal) => (meal.dayKey ?? todayKey) === todayKey)
      : buildFreshDailyMealState(resolvedTemplates);
    const isStaleDay = todayKey !== currentTodayKey();

    return {
      templates: resolvedTemplates,
      dailyMealState: isStaleDay ? buildFreshDailyMealState(resolvedTemplates) : resolvedDailyMeals,
      activityLogs: isActivityLogArray(activityLogs) ? activityLogs : seed.activityLogs,
      weightLogs: isWeightLogArray(weightLogs) ? weightLogs : seed.weightLogs,
      mealLogs: isMealLogArray(mealLogs) ? mealLogs : seed.mealLogs,
      manualAlerts: isManualAlertArray(manualAlerts) ? manualAlerts : seed.manualAlerts,
      todayKey: currentTodayKey(),
      source:
        storedTemplates || storedDailyMeals || storedActivityLogs || storedWeightLogs || storedMealLogs || storedManualAlerts || storedTodayKey
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

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  window.localStorage.setItem(DAILY_MEAL_STORAGE_KEY, JSON.stringify(dailyMealState ?? existingState.dailyMealState));
  window.localStorage.setItem(ACTIVITY_LOGS_STORAGE_KEY, JSON.stringify(activityLogs ?? existingState.activityLogs));
  window.localStorage.setItem(WEIGHT_LOGS_STORAGE_KEY, JSON.stringify(weightLogs ?? existingState.weightLogs));
  window.localStorage.setItem(MANUAL_ALERTS_STORAGE_KEY, JSON.stringify(manualAlerts ?? existingState.manualAlerts));
  window.localStorage.setItem(MEAL_LOGS_STORAGE_KEY, JSON.stringify(mealLogs ?? existingState.mealLogs));
  window.localStorage.setItem(TODAY_KEY_STORAGE_KEY, todayKey);
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

function mapTemplateToRow(template: MealTemplate, index: number): MealTemplateRow {
  return {
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

function mapDailyMealStateToRow(state: DailyMealState): DailyMealRow {
  return {
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

function mapActivityLogToRow(activity: ActivityLog): ActivityLogRow {
  return {
    id: activity.id,
    profile_slug: HEWSTER_PROFILE_SLUG,
    activity_type: activity.activityType,
    happened_at: activity.happenedAt,
    detail: activity.detail,
    notes: activity.notes,
  };
}

function mapWeightLogRowToWeight(row: WeightLogRow): WeightLog {
  return {
    id: row.id,
    profileSlug: row.profile_slug,
    date: row.log_date,
    weight: row.weight,
    note: row.note ?? null,
    createdAt: row.created_at,
  };
}

function mapWeightLogToRow(weight: WeightLog): WeightLogRow {
  return {
    id: weight.id,
    profile_slug: HEWSTER_PROFILE_SLUG,
    log_date: weight.date,
    weight: weight.weight,
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

function mapMealLogToRow(mealLog: MealLog): MealLogRow {
  return {
    id: mealLog.id,
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

function mapManualAlertRowToAlert(row: ManualAlertRow): ManualAlert {
  return {
    id: row.id,
    profileSlug: row.profile_slug,
    title: row.title,
    message: row.message,
    scope: "today",
    createdDayKey: row.created_at ? currentTodayKey() : undefined,
    resolved: row.resolved,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at ?? null,
  };
}

function mapManualAlertToRow(alert: ManualAlert): ManualAlertRow {
  return {
    id: alert.id,
    profile_slug: HEWSTER_PROFILE_SLUG,
    title: alert.title,
    message: alert.message,
    resolved: alert.resolved,
    resolved_at: alert.resolvedAt ?? null,
  };
}

export async function loadAppState(): Promise<HewsterAppState> {
  const localState = loadLocalState();

  if (!isSupabaseConfigured()) {
    return localState;
  }

  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return localState;
  }

  const templatesPromise = supabase
    .from("meal_templates")
    .select("profile_slug, meal_id, name, planned_time, food, notes, reminder_offset, sort_order")
    .eq("profile_slug", HEWSTER_PROFILE_SLUG)
    .order("sort_order", { ascending: true });

  const dailyMealsWithFedNotesPromise = supabase
    .from("daily_meals")
    .select("profile_slug, meal_id, day_key, actual_time, status, fed_notes")
    .eq("profile_slug", HEWSTER_PROFILE_SLUG)
    .eq("day_key", localState.todayKey);

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
      .select("profile_slug, meal_id, day_key, actual_time, status")
      .eq("profile_slug", HEWSTER_PROFILE_SLUG)
      .eq("day_key", localState.todayKey);
  }

  if (templatesResult.error || dailyMealsResult.error) {
    console.error("Failed to load core Supabase state", {
      templatesError: templatesResult.error,
      dailyMealsError: dailyMealsResult.error,
    });
    return localState;
  }

  const [activityLogsResult, weightLogsResult, mealLogsResult, manualAlertsResult] = await Promise.all([
    supabase
      .from("activity_logs")
      .select("id, profile_slug, activity_type, happened_at, detail, notes, created_at")
      .eq("profile_slug", HEWSTER_PROFILE_SLUG)
      .order("happened_at", { ascending: false }),
    supabase
      .from("weight_logs")
      .select("id, profile_slug, log_date, weight, note, created_at")
      .eq("profile_slug", HEWSTER_PROFILE_SLUG)
      .order("log_date", { ascending: false }),
    supabase
      .from("meal_logs")
      .select("id, profile_slug, day_key, meal_id, meal_name, food, default_notes, fed_notes, actual_time, created_at")
      .eq("profile_slug", HEWSTER_PROFILE_SLUG)
      .order("created_at", { ascending: false }),
    supabase
      .from("manual_alerts")
      .select("id, profile_slug, title, message, resolved, created_at, resolved_at")
      .eq("profile_slug", HEWSTER_PROFILE_SLUG)
      .order("created_at", { ascending: false }),
  ]);

  if (activityLogsResult.error) {
    console.warn("Activity logs unavailable, falling back locally", activityLogsResult.error);
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

  const templates = templatesResult.data?.length
    ? (templatesResult.data as MealTemplateRow[]).map(mapTemplateRowToTemplate)
    : localState.templates;

  const dailyMealState = dailyMealsResult.data?.length
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
    : buildFreshDailyMealState(templates).map((meal) => ({
        ...meal,
        dayKey: localState.todayKey,
      }));

  const remoteActivityLogs = !activityLogsResult.error && activityLogsResult.data?.length
    ? (activityLogsResult.data as ActivityLogRow[]).map(mapActivityLogRowToActivity)
    : [];

  const activityLogs = [...remoteActivityLogs, ...localState.activityLogs]
    .sort(compareActivitiesReverseChronological)
    .filter((entry, index, all) => index === all.findIndex((candidate) => candidate.id === entry.id));

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
          .eq("profile_slug", HEWSTER_PROFILE_SLUG)
      )
    ).catch(() => undefined);
  }

  const remoteWeightLogIds = new Set(remoteWeightLogs.map((entry) => entry.id));
  const localOnlyWeightLogs = localState.weightLogs.filter((entry) => !remoteWeightLogIds.has(entry.id) && !deletedWeightLogIds.has(entry.id));

  if (localOnlyWeightLogs.length && !weightLogsResult.error) {
    const { error } = await supabase
      .from("weight_logs")
      .upsert(localOnlyWeightLogs.map(mapWeightLogToRow), { onConflict: "id" });

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
      return {
        ...entry,
        scope: localMatch?.scope ?? (["today", "tomorrow", "date", "ongoing", "every-other-day", "certain-days"].includes(entry.scope ?? "") ? entry.scope : "today"),
        weekdays: localMatch?.weekdays ?? entry.weekdays,
        time: localMatch?.time ?? entry.time,
        createdDayKey: localMatch?.createdDayKey ?? entry.createdDayKey,
      };
    })
    .filter((entry, index, all) => index === all.findIndex((candidate) => candidate.id === entry.id));

  return {
    templates,
    dailyMealState,
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
  };
}

export async function saveTemplatesToSupabase(templates: MealTemplate[]) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return;
  }

  const rows = templates.map(mapTemplateToRow);

  const { error } = await supabase.from("meal_templates").upsert(rows, {
    onConflict: "profile_slug,meal_id",
  });

  if (error) {
    throw error;
  }
}

export async function saveDailyMealsToSupabase(dailyMealState: DailyMealState[]) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return;
  }

  const rows = dailyMealState.map(mapDailyMealStateToRow);

  const { error } = await supabase.from("daily_meals").upsert(rows, {
    onConflict: "profile_slug,day_key,meal_id",
  });

  if (error && error.message.includes("fed_notes")) {
    const fallbackRows = dailyMealState.map((state) => ({
      profile_slug: HEWSTER_PROFILE_SLUG,
      meal_id: state.mealId,
      actual_time: state.actualTime,
      status: state.status,
    }));

    const fallbackResult = await supabase.from("daily_meals").upsert(fallbackRows, {
      onConflict: "profile_slug,meal_id",
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
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return;
  }

  const { error } = await supabase.from("activity_logs").insert(mapActivityLogToRow(activity));

  if (error) {
    throw error;
  }
}

export async function updateActivityLogInSupabase(activity: ActivityLog) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return;
  }

  const { error } = await supabase
    .from("activity_logs")
    .update({
      happened_at: activity.happenedAt,
      detail: activity.detail,
      notes: activity.notes,
    })
    .eq("id", activity.id)
    .eq("profile_slug", HEWSTER_PROFILE_SLUG);

  if (error) {
    throw error;
  }
}

export async function deleteActivityLogInSupabase(activityId: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return;
  }

  const { error } = await supabase
    .from("activity_logs")
    .delete()
    .eq("id", activityId)
    .eq("profile_slug", HEWSTER_PROFILE_SLUG);

  if (error) {
    throw error;
  }
}

export async function saveWeightLogToSupabase(weight: WeightLog) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return;
  }

  const { error } = await supabase.from("weight_logs").upsert(mapWeightLogToRow(weight), {
    onConflict: "id",
  });

  if (error) {
    throw error;
  }
}

export async function updateWeightLogInSupabase(weight: WeightLog) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return;
  }

  const { error } = await supabase
    .from("weight_logs")
    .update(mapWeightLogToRow(weight))
    .eq("id", weight.id)
    .eq("profile_slug", HEWSTER_PROFILE_SLUG);

  if (error) {
    throw error;
  }
}

export async function deleteWeightLogInSupabase(weightLogId: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return;
  }

  const { error } = await supabase
    .from("weight_logs")
    .delete()
    .eq("id", weightLogId)
    .eq("profile_slug", HEWSTER_PROFILE_SLUG);

  if (error) {
    throw error;
  }
}

export async function saveMealLogToSupabase(mealLog: MealLog) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return;
  }

  const { error } = await supabase.from("meal_logs").upsert(mapMealLogToRow(mealLog), {
    onConflict: "id",
  });

  if (error) {
    throw error;
  }
}

export async function deleteMealLogInSupabase(mealLogId: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return;
  }

  const { error } = await supabase
    .from("meal_logs")
    .delete()
    .eq("id", mealLogId)
    .eq("profile_slug", HEWSTER_PROFILE_SLUG);

  if (error) {
    throw error;
  }
}

export async function saveManualAlertToSupabase(alert: ManualAlert) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return;
  }

  const { error } = await supabase.from("manual_alerts").insert(mapManualAlertToRow(alert));

  if (error) {
    throw error;
  }
}

export async function updateManualAlertInSupabase(alert: ManualAlert) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return;
  }

  const { error } = await supabase
    .from("manual_alerts")
    .update({
      title: alert.title,
      message: alert.message,
      resolved: alert.resolved,
      resolved_at: alert.resolvedAt ?? null,
    })
    .eq("id", alert.id)
    .eq("profile_slug", HEWSTER_PROFILE_SLUG);

  if (error) {
    throw error;
  }
}

export async function deleteManualAlertInSupabase(alertId: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return;
  }

  const { error } = await supabase
    .from("manual_alerts")
    .delete()
    .eq("id", alertId)
    .eq("profile_slug", HEWSTER_PROFILE_SLUG);

  if (error) {
    throw error;
  }
}
