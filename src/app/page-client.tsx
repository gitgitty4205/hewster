"use client";

import Image from "next/image";
import {
  Clock3,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { ActivityDetailForm } from "@/components/activity-detail-form";
import { ActivityFeed } from "@/components/activity-feed";
import { BottomNav } from "@/components/bottom-nav";
import { MealNoteForm } from "@/components/meal-note-form";
import { MealTimeForm } from "@/components/meal-time-form";
import { QuickLogCard } from "@/components/quick-log-card";
import { Button } from "@/components/ui/button";
import {
  currentTodayKey,
  deleteActivityLogInSupabase,
  deleteMealLogInSupabase,
  type ActivityLog,
  type ActivityType,
  type DailyMealState,
  type ManualAlert,
  type MealLog,
  loadAppState,
  persistLocalState,
  saveActivityLogToSupabase,
  saveDailyMealsToSupabase,
  saveMealLogToSupabase,
  saveTemplatesToSupabase,
  updateActivityLogInSupabase,
} from "@/lib/hewster-data";
import {
  type DailyMeal,
  type MealStatus,
  type MealTemplate,
  initialTemplates,
} from "@/lib/meal-templates";
import { formatActivityLabel, formatActivityTime, renderActivityDetail } from "@/lib/activity";
import { resolveAlerts } from "@/lib/alerts";
import { HEWSTER_PROFILE_SLUG, isSupabaseConfigured } from "@/lib/supabase";

function statusClasses(status: MealStatus) {
  switch (status) {
    case "done":
      return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
    case "late":
      return "bg-rose-50 text-rose-700 ring-1 ring-rose-200";
    default:
      return "bg-amber-50 text-amber-700 ring-1 ring-amber-200";
  }
}

function formatCurrentTime() {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date());
}

function formatTodayHeaderDateTime() {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date());
}

function buildMealLog(meal: DailyMeal, fedNotes: string | null, dayKey: string): MealLog {
  return {
    id: `${dayKey}-${meal.id}`,
    profileSlug: HEWSTER_PROFILE_SLUG,
    dayKey,
    mealId: meal.id,
    mealName: meal.name,
    food: meal.food,
    defaultNotes: meal.notes,
    fedNotes,
    actualTime: meal.actualTime ?? "",
  };
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

function formatPoopBadgeLabel(detail: string) {
  return detail
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("-");
}

function poopBadgeClasses(detail: string | null) {
  const normalized = detail?.trim().toLowerCase() ?? "";

  switch (normalized) {
    case "no poop":
      return "bg-white text-zinc-600 ring-1 ring-zinc-300";
    case "constipated":
      return "bg-zinc-700 text-white";
    case "normal":
      return "bg-amber-700 text-white";
    case "normal-hard":
    case "normal-soft":
      return "bg-orange-800 text-white";
    case "soft":
      return "bg-orange-500 text-white";
    case "1 time diarrhea":
    case "repeated severe diarrhea":
    case "severe diarrhea":
      return "bg-rose-500 text-white";
    default:
      return "bg-orange-800 text-white";
  }
}

export default function HomeApp() {
  const [templates, setTemplates] = useState<MealTemplate[]>(initialTemplates);
  const [dailyMealState, setDailyMealState] = useState<DailyMealState[]>(
    initialTemplates.map((template) => ({
      mealId: template.id,
      actualTime: null,
      status: "upcoming" as const,
      fedNotes: null,
      dayKey: currentTodayKey(),
    }))
  );
  const [detailActivityType, setDetailActivityType] = useState<ActivityType | null>(null);
  const [editingActivityId, setEditingActivityId] = useState<string | null>(null);
  const [pendingQuickLogId, setPendingQuickLogId] = useState<string | null>(null);
  const [detailValue, setDetailValue] = useState("");
  const [notesValue, setNotesValue] = useState("");
  const [happenedAtValue, setHappenedAtValue] = useState(() =>
    new Intl.DateTimeFormat("en-CA", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date())
  );
  const [editingMealTimeId, setEditingMealTimeId] = useState<number | null>(null);
  const [editingMealTimeValue, setEditingMealTimeValue] = useState("");
  const [editingMealNoteId, setEditingMealNoteId] = useState<number | null>(null);
  const [editingMealNoteValue, setEditingMealNoteValue] = useState("");
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [manualAlerts, setManualAlerts] = useState<ManualAlert[]>([]);
  const [mealLogs, setMealLogs] = useState<MealLog[]>([]);
  const [mealActionState, setMealActionState] = useState<"idle" | "saved" | "saving" | "error">("idle");
  const [activityState, setActivityState] = useState<"idle" | "saved" | "saving" | "error">("idle");
  const [hydrated, setHydrated] = useState(false);
  const [headerDateTime, setHeaderDateTime] = useState("");
  const [todayKey, setTodayKey] = useState("");
  const initialLoadComplete = useRef(false);
  const supabaseReady = isSupabaseConfigured();

  useEffect(() => {
    let cancelled = false;
    const fallbackTimer = window.setTimeout(() => {
      if (!cancelled) {
        initialLoadComplete.current = true;
        setHeaderDateTime(formatTodayHeaderDateTime());
        setTodayKey((current) => current || currentTodayKey());
        setHydrated(true);
      }
    }, 2200);

    async function hydrate() {
      try {
        const state = await loadAppState();
        if (cancelled) return;

        setTemplates(state.templates);
        setDailyMealState(
          state.templates.map((template) => {
            const existing = state.dailyMealState.find((entry) => entry.mealId === template.id);
            return (
              existing ?? {
                mealId: template.id,
                actualTime: null,
                status: "upcoming" as const,
                fedNotes: null,
                dayKey: state.todayKey,
              }
            );
          })
        );
        setActivityLogs(state.activityLogs);
        setManualAlerts(state.manualAlerts ?? []);
        setMealLogs(state.mealLogs ?? []);
        setTodayKey(state.todayKey);
        setHeaderDateTime(formatTodayHeaderDateTime());
      } catch {
        if (cancelled) return;
        setHeaderDateTime(formatTodayHeaderDateTime());
        setTodayKey((current) => current || currentTodayKey());
      } finally {
        if (!cancelled) {
          window.clearTimeout(fallbackTimer);
          initialLoadComplete.current = true;
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

  useEffect(() => {
    if (!hydrated || !initialLoadComplete.current) return;

    persistLocalState(templates, dailyMealState, activityLogs, undefined, todayKey, manualAlerts, mealLogs);
  }, [templates, dailyMealState, activityLogs, hydrated, todayKey, manualAlerts, mealLogs]);

  useEffect(() => {
    if (!hydrated || !initialLoadComplete.current) return;

    let cancelled = false;

    async function persistTemplates() {
      try {
        if (supabaseReady) {
          await saveTemplatesToSupabase(templates);
        }
      } catch {
        if (cancelled) return;
      }
    }

    persistTemplates();

    return () => {
      cancelled = true;
    };
  }, [templates, hydrated, supabaseReady]);

  useEffect(() => {
    if (!hydrated || mealActionState === "idle") return;

    let cancelled = false;
    let timeout: number | null = null;

    async function persistDailyMeals() {
      if (mealActionState === "saved") {
        timeout = window.setTimeout(() => {
          if (!cancelled) {
            setMealActionState("idle");
          }
        }, 1800);
        return;
      }

      setMealActionState("saving");

      try {
        if (supabaseReady) {
          await saveDailyMealsToSupabase(dailyMealState);
        }

        if (!cancelled) {
          setMealActionState("saved");
        }
      } catch {
        if (!cancelled) {
          setMealActionState("error");
        }
      }
    }

    void persistDailyMeals();

    return () => {
      cancelled = true;
      if (timeout !== null) {
        window.clearTimeout(timeout);
      }
    };
  }, [dailyMealState, hydrated, mealActionState, supabaseReady]);

  useEffect(() => {
    setDailyMealState((current) => {
      const existingById = new Map(current.map((entry) => [entry.mealId, entry]));
      return templates.map((template) => {
        const existing = existingById.get(template.id);
        return (
          existing ?? {
            mealId: template.id,
            actualTime: null,
            status: "upcoming" as const,
            fedNotes: null,
            dayKey: todayKey || currentTodayKey(),
          }
        );
      });
    });
  }, [templates, todayKey]);

  useEffect(() => {
    const resetForNewDay = () => {
      setHeaderDateTime(formatTodayHeaderDateTime());
      const nextTodayKey = currentTodayKey();

      if (todayKey && nextTodayKey !== todayKey) {
        setTodayKey(nextTodayKey);
        setDailyMealState(
          templates.map((template) => ({
            mealId: template.id,
            actualTime: null,
            status: "upcoming" as const,
            fedNotes: null,
            dayKey: nextTodayKey,
          }))
        );
        setMealActionState("idle");
      }
    };

    resetForNewDay();

    const interval = window.setInterval(resetForNewDay, 60000);
    window.addEventListener("focus", resetForNewDay);
    document.addEventListener("visibilitychange", resetForNewDay);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", resetForNewDay);
      document.removeEventListener("visibilitychange", resetForNewDay);
    };
  }, [templates, todayKey]);

  const todayMealState = useMemo(() => {
    const activeTodayKey = todayKey || currentTodayKey();
    return dailyMealState.filter((entry) => (entry.dayKey ?? activeTodayKey) === activeTodayKey);
  }, [dailyMealState, todayKey]);

  const dailyMeals = useMemo<DailyMeal[]>(() => {
    const stateByMealId = new Map(todayMealState.map((entry) => [entry.mealId, entry]));

    return templates.map((template) => {
      const existing = stateByMealId.get(template.id);
      return {
        ...template,
        actualTime: existing?.actualTime ?? null,
        status: existing?.status ?? "upcoming",
      };
    });
  }, [templates, todayMealState]);

  const nextMeal = dailyMeals.find((meal) => meal.status !== "done") ?? dailyMeals[0];

  const todayActivityLogs = useMemo(() => {
    const today = todayKey || currentTodayKey();
    return activityLogs.filter((activity) => {
      const activityDayKey = new Intl.DateTimeFormat("en-CA", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(activity.happenedAt));

      return activityDayKey === today;
    });
  }, [activityLogs, todayKey]);

  const dynamicTimeline = useMemo(() => {
    const mealTimeline = dailyMeals
      .filter((meal) => meal.actualTime)
      .map((meal) => {
        const fedNotes = todayMealState.find((entry) => entry.mealId === meal.id)?.fedNotes?.trim();
        return {
          time: meal.actualTime as string,
          label: "Fed",
          detail: fedNotes ? `${meal.name}: ${meal.food} • Fed Notes: ${fedNotes}` : `${meal.name}: ${meal.food}`,
          activityType: "meal" as const,
          sortMinutes: parseClockMinutes(meal.actualTime as string),
        };
      });

    const activityTimeline = todayActivityLogs.map((activity) => {
      const happenedAt = new Date(activity.happenedAt);
      return {
        time: formatActivityTime(activity.happenedAt),
        label: formatActivityLabel(activity.activityType),
        detail: renderActivityDetail(activity),
        activityType: activity.activityType,
        sortMinutes: happenedAt.getHours() * 60 + happenedAt.getMinutes(),
      };
    });

    const manualAlertTimeline = manualAlerts
      .flatMap((alert) => {
        const events: Array<{ time: string; label: string; detail: string; activityType: "manual"; sortMinutes: number }> = [];
        const createdAt = alert.createdAt ? new Date(alert.createdAt) : null;
        const resolvedAt = alert.resolvedAt ? new Date(alert.resolvedAt) : null;
        const activeToday = todayKey || currentTodayKey();

        if (
          createdAt &&
          new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(createdAt) === activeToday
        ) {
          events.push({
            time: formatActivityTime(alert.createdAt as string),
            label: "Alert Created",
            detail: `${alert.title}: ${alert.message}`,
            activityType: "manual",
            sortMinutes: createdAt.getHours() * 60 + createdAt.getMinutes(),
          });
        }

        if (
          resolvedAt &&
          new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(resolvedAt) === activeToday
        ) {
          events.push({
            time: formatActivityTime(alert.resolvedAt as string),
            label: "Alert Resolved",
            detail: `${alert.title}: ${alert.message}`,
            activityType: "manual",
            sortMinutes: resolvedAt.getHours() * 60 + resolvedAt.getMinutes(),
          });
        }

        return events;
      });

    return [...mealTimeline, ...activityTimeline, ...manualAlertTimeline].sort((a, b) => a.sortMinutes - b.sortMinutes);
  }, [dailyMeals, todayActivityLogs, todayMealState, manualAlerts, todayKey]);

  const alerts = useMemo(
    () => resolveAlerts(templates, todayMealState, todayActivityLogs, manualAlerts),
    [templates, todayMealState, todayActivityLogs, manualAlerts]
  );

  const poopRecords = useMemo(() => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setHours(0, 0, 0, 0);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

    return activityLogs
      .filter((activity) => activity.activityType === "poop" && new Date(activity.happenedAt) >= sevenDaysAgo)
      .sort((a, b) => b.happenedAt.localeCompare(a.happenedAt));
  }, [activityLogs]);

  const markMealFed = async (mealId: number) => {
    const timestamp = formatCurrentTime();
    const activeTodayKey = todayKey || currentTodayKey();

    const nextMealState: DailyMealState[] = dailyMealState.map((meal) =>
      meal.mealId === mealId
        ? {
            ...meal,
            actualTime: timestamp,
            status: "done",
            dayKey: activeTodayKey,
          }
        : meal
    );

    setDailyMealState(nextMealState);

    const meal = dailyMeals.find((entry) => entry.id === mealId);
    const updatedMeal = meal ? { ...meal, actualTime: timestamp, status: "done" as const } : null;

    if (updatedMeal) {
      const mealLog = buildMealLog(
        updatedMeal,
        nextMealState.find((entry) => entry.mealId === mealId)?.fedNotes ?? null,
        activeTodayKey
      );
      setMealLogs((current) => [mealLog, ...current.filter((entry) => entry.id !== mealLog.id)]);

      if (supabaseReady) {
        try {
          await saveMealLogToSupabase(mealLog);
        } catch {
          // local fallback already captured
        }
      }
    }

    setMealActionState("saving");
  };

  const openMealTimeEditor = (mealId: number, actualTime: string | null) => {
    setEditingMealTimeId(mealId);
    setEditingMealTimeValue(actualTime ?? "");
  };

  const undoMealFed = async (mealId: number) => {
    const confirmed = window.confirm("Undo this fed meal entry?");
    if (!confirmed) return;

    const activeTodayKey = todayKey || currentTodayKey();
    const mealLogId = `${activeTodayKey}-${mealId}`;

    setDailyMealState((current) =>
      current.map((meal) =>
        meal.mealId === mealId
          ? {
              ...meal,
              actualTime: null,
              status: "upcoming",
              fedNotes: null,
              dayKey: activeTodayKey,
            }
          : meal
      )
    );

    setMealLogs((current) => current.filter((entry) => entry.id !== mealLogId));
    setMealActionState("saving");

    if (supabaseReady) {
      try {
        await deleteMealLogInSupabase(mealLogId);
      } catch {
        // local fallback already captured
      }
    }
  };

  const saveMealTime = async () => {
    if (editingMealTimeId === null) return;

    const activeTodayKey = todayKey || currentTodayKey();
    const nextMealState = dailyMealState.map((meal) =>
      meal.mealId === editingMealTimeId
        ? {
            ...meal,
            actualTime: editingMealTimeValue.trim() || null,
            status: editingMealTimeValue.trim() ? "done" : meal.status,
            dayKey: activeTodayKey,
          }
        : meal
    );

    setDailyMealState(nextMealState);

    const meal = dailyMeals.find((entry) => entry.id === editingMealTimeId);
    const updatedMeal = meal
      ? {
          ...meal,
          actualTime: editingMealTimeValue.trim() || null,
          status: editingMealTimeValue.trim() ? ("done" as const) : meal.status,
        }
      : null;

    const mealLogId = `${activeTodayKey}-${editingMealTimeId}`;

    if (updatedMeal?.actualTime) {
      const mealLog = {
        ...buildMealLog(
          updatedMeal,
          nextMealState.find((entry) => entry.mealId === editingMealTimeId)?.fedNotes ?? null,
          activeTodayKey
        ),
        id: mealLogId,
      };
      setMealLogs((current) => [mealLog, ...current.filter((entry) => entry.id !== mealLogId)]);

      if (supabaseReady) {
        try {
          await saveMealLogToSupabase(mealLog);
        } catch {
          // local fallback already captured
        }
      }
    }

    setMealActionState("saving");
    setEditingMealTimeId(null);
    setEditingMealTimeValue("");
  };

  const openMealNoteEditor = (mealId: number) => {
    const mealState = todayMealState.find((entry) => entry.mealId === mealId);
    setEditingMealNoteId(mealId);
    setEditingMealNoteValue(mealState?.fedNotes ?? "");
  };

  const saveMealNote = async () => {
    if (editingMealNoteId === null) return;

    const activeTodayKey = todayKey || currentTodayKey();
    const nextMealState = dailyMealState.map((meal) =>
      meal.mealId === editingMealNoteId
        ? {
            ...meal,
            fedNotes: editingMealNoteValue.trim() || null,
            dayKey: activeTodayKey,
          }
        : meal
    );

    setDailyMealState(nextMealState);

    const meal = dailyMeals.find((entry) => entry.id === editingMealNoteId);
    if (meal?.actualTime) {
      const mealLog = buildMealLog(
        {
          ...meal,
          actualTime: meal.actualTime,
        },
        editingMealNoteValue.trim() || null,
        activeTodayKey
      );
      setMealLogs((current) => [mealLog, ...current.filter((entry) => entry.id !== mealLog.id)]);

      if (supabaseReady) {
        try {
          await saveMealLogToSupabase(mealLog);
        } catch {
          // local fallback already captured
        }
      }
    }

    setMealActionState("saving");
    setEditingMealNoteId(null);
    setEditingMealNoteValue("");
  };

  const toTimeInputValue = (isoString: string) =>
    new Intl.DateTimeFormat("en-CA", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(isoString));

  const mergeTodayWithTime = (timeValue: string) => {
    const [hours, minutes] = timeValue.split(":").map(Number);
    const now = new Date();
    now.setHours(hours, minutes, 0, 0);
    return now.toISOString();
  };

  const resetActivityEditor = () => {
    setDetailActivityType(null);
    setEditingActivityId(null);
    setPendingQuickLogId(null);
    setDetailValue("");
    setNotesValue("");
    setHappenedAtValue(
      new Intl.DateTimeFormat("en-CA", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date())
    );
  };

  const saveActivity = async (activity: ActivityLog, mode: "create" | "update") => {
    setActivityLogs((current) => {
      const withoutExisting = current.filter((entry) => entry.id !== activity.id);
      return [activity, ...withoutExisting].sort((a, b) => b.happenedAt.localeCompare(a.happenedAt));
    });
    setActivityState("saving");

    try {
      if (supabaseReady) {
        if (mode === "update") {
          await updateActivityLogInSupabase(activity);
        } else {
          await saveActivityLogToSupabase(activity);
        }
      }

      setActivityState("saved");
      window.setTimeout(() => setActivityState("idle"), 1800);
    } catch {
      setActivityState("error");
    }
  };

  const quickLogActivity = async (activityType: ActivityType) => {
    if (activityType === "other") {
      setDetailActivityType("other");
      setEditingActivityId(null);
      setDetailValue("");
      setNotesValue("");
      setHappenedAtValue(
        new Intl.DateTimeFormat("en-CA", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(new Date())
      );
      return;
    }

    const activity: ActivityLog = {
      id: `${activityType}-${Date.now()}`,
      profileSlug: HEWSTER_PROFILE_SLUG,
      activityType,
      happenedAt: new Date().toISOString(),
      detail: null,
      notes: null,
    };

    await saveActivity(activity, "create");
    setPendingQuickLogId(activity.id);
    setDetailActivityType(activity.activityType);
    setEditingActivityId(activity.id);
    setDetailValue("");
    setNotesValue("");
    setHappenedAtValue(toTimeInputValue(activity.happenedAt));
  };

  const saveDetailedActivity = async () => {
    if (!detailActivityType) return;

    const resolvedNotes = detailActivityType === "treat" && detailValue === "Other" ? notesValue.trim() : notesValue.trim() || null;
    const activity: ActivityLog = {
      id: editingActivityId ?? `${detailActivityType}-${Date.now()}`,
      profileSlug: HEWSTER_PROFILE_SLUG,
      activityType: detailActivityType,
      happenedAt: mergeTodayWithTime(happenedAtValue),
      detail: detailValue.trim() || null,
      notes: resolvedNotes,
    };

    await saveActivity(activity, editingActivityId ? "update" : "create");
    resetActivityEditor();
  };

  const deleteActivity = async () => {
    if (!editingActivityId) return;

    const deletingId = editingActivityId;
    setActivityLogs((current) => current.filter((activity) => activity.id !== deletingId));
    setActivityState("saving");

    try {
      if (supabaseReady) {
        await deleteActivityLogInSupabase(deletingId);
      }

      setActivityState("saved");
      window.setTimeout(() => setActivityState("idle"), 1800);
      resetActivityEditor();
    } catch {
      setActivityState("error");
    }
  };

  if (!hydrated) {
    return (
      <main className="min-h-screen bg-[#979ca7] text-zinc-900">
        <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-24 pt-6">
          <header className="mb-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Link href="/hewie" className="text-sm font-medium text-violet-500">
                  Hewster&apos;s Notebook
                </Link>
                <div className="skeleton-pulse mt-1 h-8 w-56 rounded-xl bg-white/40" />
                <div className="skeleton-pulse mt-1 h-4 w-52 rounded-xl bg-white/30" />
              </div>
              <Image
                src="/hewster-profile.jpg"
                alt="Hewster"
                width={48}
                height={48}
                className="mt-0.5 size-12 rounded-full object-cover object-center ring-1 ring-zinc-500/60 shadow-sm"
              />
            </div>
          </header>

          <div className="space-y-4">
            <div className="skeleton-pulse h-64 rounded-3xl bg-white/60 shadow-sm ring-1 ring-white/50" />
            <div className="skeleton-pulse h-52 rounded-3xl bg-white/60 shadow-sm ring-1 ring-white/50" />
            <div className="skeleton-pulse h-40 rounded-3xl bg-white/60 shadow-sm ring-1 ring-white/50" />
          </div>

          <BottomNav />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#979ca7] text-zinc-900">
      <div className="content-fade-in mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-24 pt-6">
        <header className="mb-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Link href="/hewie" className="text-sm font-medium text-violet-500">
                Hewster&apos;s Notebook
              </Link>
              <div className="mt-1 flex flex-col gap-1">
                <p className="text-xl font-bold tracking-tight text-zinc-700">{headerDateTime}</p>
              </div>
            </div>
            <Image
              src="/hewster-profile.jpg"
              alt="Hewster"
              width={48}
              height={48}
              className="mt-0.5 size-12 rounded-full object-cover object-center ring-1 ring-zinc-500/60 shadow-sm"
            />
          </div>
          <p className="mt-1 text-xs leading-4 text-zinc-600">
            Shared meal tracking and potty logs for Hewster.
          </p>
        </header>

        <section className="mb-4 rounded-3xl bg-sky-100 p-5 text-sky-950 shadow-sm ring-1 ring-sky-200">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-sky-500">Next Feeding</p>
              <h2 className="mt-1 text-2xl font-semibold">
                {nextMeal.name} at {nextMeal.plannedTime}
              </h2>
            </div>
            {nextMeal.status === "late" ? (
              <div className="rounded-full bg-white/80 px-3 py-1 text-sm font-medium text-sky-500 ring-1 ring-sky-200">
                Late Alert On
              </div>
            ) : null}
          </div>
          <div className="mt-3 space-y-2 text-sm leading-6 text-sky-800">
            <p>
              <span className="font-medium text-sky-950">Food:</span> {nextMeal.food}
            </p>
            {nextMeal.notes ? (
              <p>
                <span className="font-medium text-sky-950">Notes:</span> {nextMeal.notes}
              </p>
            ) : null}
          </div>
          <div className="mt-4 text-sm">
            <Button
              className="h-12 w-full rounded-2xl bg-sky-500 text-white hover:bg-sky-600"
              onClick={() => markMealFed(nextMeal.id)}
            >
              Mark fed now
            </Button>
          </div>
        </section>

        {alerts.length ? (
          <section className="mb-4 rounded-3xl bg-rose-50 p-5 shadow-sm ring-1 ring-rose-200">
            <div className="flex items-start gap-3">
              <TriangleAlert className="mt-0.5 size-5 text-rose-500" />
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">Alerts</h2>
                <div className="mt-2 space-y-2">
                  {alerts.slice(0, 3).map((alert) => (
                    <div key={alert.id}>
                      <p className="text-sm font-semibold text-zinc-900">{alert.title}</p>
                      <p className="text-sm text-zinc-600">{alert.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        <QuickLogCard activityState={activityState} onQuickLog={quickLogActivity} includeOther={false}>
          {pendingQuickLogId && detailActivityType ? (
            <ActivityDetailForm
              activityType={detailActivityType}
              detail={detailValue}
              notes={notesValue}
              happenedAt={happenedAtValue}
              embedded
              onDetailChange={setDetailValue}
              onNotesChange={setNotesValue}
              onHappenedAtChange={setHappenedAtValue}
              onSave={saveDetailedActivity}
              onCancel={resetActivityEditor}
              onDelete={editingActivityId ? deleteActivity : undefined}
              saving={activityState === "saving"}
            />
          ) : null}
        </QuickLogCard>

        <section className="mb-4 rounded-3xl bg-rose-50/80 p-5 shadow-sm ring-1 ring-rose-200">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Feed Plan</h2>
              <p className="text-sm text-zinc-500">Preview, check off, and adjust actual times.</p>
            </div>
            <div className="text-right text-xs text-zinc-500">
              <div className="flex items-center justify-end gap-1.5 text-emerald-600">
                {mealActionState === "saving"
                  ? "Saving feed log..."
                  : mealActionState === "saved"
                    ? "Feed timestamp saved"
                    : mealActionState === "error"
                      ? "Saved in browser only"
                      : ""}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {dailyMeals.map((meal) => (
              <article key={meal.id} className="rounded-2xl border border-rose-200 bg-white/80 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      <h3 className="min-w-0 font-medium text-zinc-900">{meal.name}</h3>
                      <span
                        className={`mt-0.5 shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium capitalize ${statusClasses(meal.status)}`}
                      >
                        {meal.status}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-zinc-600">{meal.food}</p>
                  </div>
                  <div className="flex gap-2">
                    {meal.status === "done" ? (
                      <Button
                        variant="secondary"
                        className="rounded-full text-xs"
                        onClick={() => openMealTimeEditor(meal.id, meal.actualTime)}
                      >
                        Edit
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        className="rounded-full text-xs"
                        onClick={() => markMealFed(meal.id)}
                      >
                        Mark fed
                      </Button>
                    )}
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-zinc-500">
                  <p className="flex items-center gap-1.5">
                    <Clock3 className="size-4" /> Planned: {meal.plannedTime}
                  </p>
                  <p>Actual: {meal.actualTime ?? "Not logged"}</p>
                </div>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <div>
                    {meal.notes ? <p className="text-sm text-zinc-500">{meal.notes}</p> : null}
                    {todayMealState.find((entry) => entry.mealId === meal.id)?.fedNotes ? (
                      <p className="mt-1 text-sm font-semibold leading-6 text-zinc-600">
                        Fed notes: {todayMealState.find((entry) => entry.mealId === meal.id)?.fedNotes}
                      </p>
                    ) : meal.id === editingMealNoteId && editingMealNoteValue.trim() ? (
                      <p className="mt-1 text-sm font-semibold leading-6 text-zinc-600">
                        Fed notes: {editingMealNoteValue.trim()}
                      </p>
                    ) : null}
                  </div>
                  <button
                    className="min-w-[96px] rounded-full bg-rose-100 px-3 py-2 text-center text-xs font-semibold text-rose-600 ring-1 ring-rose-200 transition hover:bg-rose-200"
                    onClick={() => openMealNoteEditor(meal.id)}
                  >
                    Fed notes
                  </button>
                </div>

                {editingMealTimeId === meal.id ? (
                  <div className="mt-3">
                    <MealTimeForm
                      mealName={meal.name}
                      actualTime={editingMealTimeValue}
                      onActualTimeChange={setEditingMealTimeValue}
                      onSave={saveMealTime}
                      onCancel={() => {
                        setEditingMealTimeId(null);
                        setEditingMealTimeValue("");
                      }}
                      onUndo={() => {
                        undoMealFed(meal.id);
                        setEditingMealTimeId(null);
                        setEditingMealTimeValue("");
                      }}
                    />
                  </div>
                ) : null}

                {editingMealNoteId === meal.id ? (
                  <div className="mt-3">
                    <MealNoteForm
                      mealName={meal.name}
                      note={editingMealNoteValue}
                      onNoteChange={setEditingMealNoteValue}
                      onSave={saveMealNote}
                      onCancel={() => {
                        setEditingMealNoteId(null);
                        setEditingMealNoteValue("");
                      }}
                    />
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </section>

        <ActivityFeed activityLogs={todayActivityLogs} timelineItems={dynamicTimeline} />

        <section className="mb-4 rounded-3xl bg-orange-100/70 p-5 shadow-sm ring-1 ring-orange-200">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Poop Records</h2>
              <p className="text-sm text-zinc-500">Spot food correlations quickly.</p>
            </div>
            <Button
              asChild
              variant="outline"
              className="rounded-full border-orange-200/70 bg-white/70 px-4 text-xs font-semibold text-zinc-700 shadow-sm hover:bg-white"
            >
              <Link href="/poop-history">View all</Link>
            </Button>
          </div>
          <div className="space-y-3">
            {poopRecords.length ? (
              poopRecords.map((record) => (
                <article key={record.id} className="rounded-2xl border border-orange-200 bg-orange-50/40 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-zinc-900">
                        {new Intl.DateTimeFormat("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        }).format(new Date(record.happenedAt))}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">{formatActivityTime(record.happenedAt)}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${poopBadgeClasses(record.detail)}`}>
                      {record.detail ? formatPoopBadgeLabel(record.detail) : "Logged"}
                    </span>
                  </div>
                  {record.notes ? <p className="mt-2 text-sm text-zinc-600">{record.notes}</p> : null}
                </article>
              ))
            ) : (
              <p className="text-sm text-zinc-500">No poop records logged yet.</p>
            )}
          </div>
        </section>

        <BottomNav alertsCount={alerts.length} />
      </div>
    </main>
  );
}
