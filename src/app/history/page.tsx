"use client";

import { BellPlus, Candy, Check, Droplets, Ellipsis, Trees } from "lucide-react";
import Image from "next/image";
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
import { formatActivityLabel, formatActivityTime, renderActivityDetail } from "@/lib/activity";
import type { MealTemplate } from "@/lib/meal-templates";

type HistoryDay = {
  day: string;
  meals: Array<{
    id: number;
    name: string;
    food: string;
    notes: string;
    fedNotes: string | null;
    actualTime: string;
  }>;
  activities: ActivityLog[];
  weights: WeightLog[];
  timelineItems: Array<{
    key: string;
    time: string;
    label: string;
    detail: string;
    activityType: ActivityLog["activityType"] | "meal" | "manual";
    sortMinutes: number;
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

function getActivityStyle(activityType: ActivityLog["activityType"]) {
  switch (activityType) {
    case "pee":
      return {
        icon: Droplets,
        iconText: null,
        card: "bg-amber-50/80 ring-amber-200",
        iconWrap: "bg-amber-100 text-amber-600",
      };
    case "poop":
      return {
        icon: null,
        iconText: "💩",
        card: "bg-orange-100/70 ring-orange-200",
        iconWrap: "bg-orange-100 text-orange-600",
      };
    case "hike":
      return {
        icon: Trees,
        iconText: null,
        card: "bg-emerald-50/80 ring-emerald-200",
        iconWrap: "bg-emerald-100 text-emerald-600",
      };
    case "treat":
      return {
        icon: Candy,
        iconText: null,
        card: "bg-pink-50/80 ring-pink-200",
        iconWrap: "bg-pink-100 text-pink-600",
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

function getTimelineStyle(activityType: ActivityLog["activityType"] | "meal" | "manual") {
  switch (activityType) {
    case "pee":
      return {
        dot: "bg-amber-400",
        icon: null,
      };
    case "poop":
      return {
        dot: "bg-orange-800",
        icon: null,
      };
    case "hike":
      return {
        dot: "bg-emerald-400",
        icon: null,
      };
    case "treat":
      return {
        dot: "bg-pink-400",
        icon: null,
      };
    case "other":
      return {
        dot: "bg-zinc-400",
        icon: null,
      };
    case "meal":
      return {
        dot: "bg-pink-100 ring-1 ring-pink-200",
        icon: <Check className="size-3.5 text-pink-500" strokeWidth={3} />,
      };
    case "manual":
      return {
        dot: "bg-violet-100 ring-1 ring-violet-200",
        icon: <BellPlus className="size-3.5 text-violet-600" strokeWidth={2.25} />,
      };
    default:
      return {
        dot: "bg-pink-100 ring-1 ring-pink-200",
        icon: <Check className="size-3.5 text-pink-500" strokeWidth={3} />,
      };
  }
}

export default function HistoryPage() {
  const [templates, setTemplates] = useState<MealTemplate[]>([]);
  const [mealLogs, setMealLogs] = useState<MealLog[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [manualAlerts, setManualAlerts] = useState<ManualAlert[]>([]);
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([]);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
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

      targetDay.meals.push({
        id: meal.mealId,
        name: meal.mealName || template?.name || "Meal",
        food: meal.food,
        notes: meal.defaultNotes,
        fedNotes: meal.fedNotes,
        actualTime: meal.actualTime,
      });

      targetDay.timelineItems.push({
        key: meal.id,
        time: meal.actualTime,
        label: "Fed",
        detail: meal.fedNotes
          ? `${meal.mealName}: ${meal.food} • Fed Notes: ${meal.fedNotes}`
          : `${meal.mealName}: ${meal.food}`,
        activityType: "meal",
        sortMinutes: parseClockMinutes(meal.actualTime),
      });
    });

    activityLogs.forEach((activity) => {
      const day = historyDayKeyFromDate(new Date(activity.happenedAt));
      const targetDay = ensureDay(day);

      targetDay.activities.push(activity);
      targetDay.timelineItems.push({
        key: activity.id,
        time: formatActivityTime(activity.happenedAt),
        label: formatActivityLabel(activity.activityType),
        detail: renderActivityDetail(activity),
        activityType: activity.activityType,
        sortMinutes: new Date(activity.happenedAt).getHours() * 60 + new Date(activity.happenedAt).getMinutes(),
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
        activities: [...day.activities].sort((a, b) => a.happenedAt.localeCompare(b.happenedAt)),
        weights: [...day.weights].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)),
        timelineItems: [...day.timelineItems].sort((a, b) => a.sortMinutes - b.sortMinutes),
      }));
  }, [activityLogs, manualAlerts, mealLogs, templates, weightLogs]);

  if (!hydrated) {
    return (
      <main className="min-h-screen bg-zinc-100 text-zinc-900">
        <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-24 pt-6">
          <header className="mb-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Link href="/hewie" className="text-sm font-bold text-violet-500">
                  Hewster&apos;s Notebook
                </Link>
                <div className="skeleton-pulse mt-1 h-10 w-36 rounded-xl bg-white/40" />
              </div>
              <Image
                src="/hewster-profile.jpg"
                alt="Hewster"
                width={48}
                height={48}
                className="mt-0.5 size-12 rounded-full object-cover object-center ring-1 ring-zinc-500/60 shadow-sm"
              />
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
    <main className="min-h-screen bg-zinc-100 text-zinc-900">
      <div className="content-fade-in mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-24 pt-6">
        <header className="mb-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Link href="/hewie" className="text-sm font-bold text-violet-500">
                Hewster&apos;s Notebook
              </Link>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight">History</h1>
            </div>
            <Image
              src="/hewster-profile.jpg"
              alt="Hewster"
              width={48}
              height={48}
              className="mt-0.5 size-12 rounded-full object-cover object-center ring-1 ring-zinc-500/60 shadow-sm"
            />
          </div>
          <p className="mt-1 text-sm leading-5 text-zinc-600">
            Daily history of meals, activities, notes, and weight entries.
          </p>
        </header>

        <div className="space-y-4">
          {historyDays.length ? (
            historyDays.map((day) => {
              const showFullFeed = expandedDay === day.day;

              return (
                <section key={day.day} className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <h2 className="text-lg font-semibold">{formatDayLabel(day.day)}</h2>
                    <Button
                      variant="outline"
                      className="rounded-full"
                      onClick={() => setExpandedDay(showFullFeed ? null : day.day)}
                    >
                      {showFullFeed ? "Hide Full Activity Feed" : "See Full Activity Feed"}
                    </Button>
                  </div>

                  <div className="space-y-4">
                    {day.meals.length ? (
                      <div>
                        <h3 className="mb-2 text-sm font-semibold text-rose-500">Meals</h3>
                        <div className="space-y-2">
                          {day.meals.map((meal) => (
                            <article
                              key={`${day.day}-meal-${meal.id}-${meal.actualTime}`}
                              className="rounded-2xl bg-rose-50/70 p-4 ring-1 ring-rose-200"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <p className="font-medium text-zinc-900">{meal.name}</p>
                                <p className="text-sm text-zinc-500">{meal.actualTime}</p>
                              </div>
                              <p className="mt-2 text-sm text-zinc-600">{meal.food}</p>
                              {meal.notes ? <p className="mt-1 text-sm text-zinc-500">Default Notes: {meal.notes}</p> : null}
                              {meal.fedNotes ? (
                                <p className="mt-1 text-sm font-bold text-zinc-700">Fed Notes: {meal.fedNotes}</p>
                              ) : null}
                            </article>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {showFullFeed ? (
                      <div>
                        <h3 className="mb-2 text-sm font-semibold text-zinc-700">Activity Feed</h3>
                        <div className="space-y-4">
                          {day.timelineItems.map((item) => {
                            const style = getTimelineStyle(item.activityType);
                            return (
                              <div key={item.key} className="flex gap-3">
                                <div className={`mt-1 shrink-0 flex size-5 items-center justify-center rounded-full ${style.dot}`}>
                                  {style.icon}
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-zinc-900">
                                    {item.label} <span className="font-normal text-zinc-500">at {item.time}</span>
                                  </p>
                                  {item.detail.includes(" • Fed Notes: ") ? (
                                    <>
                                      <p className="mt-1 text-sm text-zinc-500">{item.detail.split(" • Fed Notes: ")[0]}</p>
                                      <p className="mt-1 text-sm font-bold text-zinc-700">
                                        Fed Notes: {item.detail.split(" • Fed Notes: ")[1]}
                                      </p>
                                    </>
                                  ) : (
                                    <p className="mt-1 text-sm text-zinc-500">{item.detail}</p>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    {day.activities.length ? (
                      <div>
                        <h3 className="mb-2 text-sm font-semibold text-zinc-700">Activities</h3>
                        <div className="space-y-2">
                          {day.activities.map((activity) => {
                            const style = getActivityStyle(activity.activityType);
                            const Icon = style.icon;

                            return (
                              <article key={activity.id} className={`rounded-2xl p-4 ring-1 ${style.card}`}>
                                <div className="flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-3">
                                    <span className={`flex size-9 items-center justify-center rounded-full ${style.iconWrap}`}>
                                      {Icon ? <Icon className="size-4.5" /> : <span className="text-lg leading-none">{style.iconText}</span>}
                                    </span>
                                    <p className="font-medium text-zinc-900">{formatActivityLabel(activity.activityType)}</p>
                                  </div>
                                  <p className="text-sm text-zinc-500">{formatActivityTime(activity.happenedAt)}</p>
                                </div>
                                {activity.activityType === "poop" && activity.detail ? (
                                  <div className="mt-2 flex flex-wrap items-center gap-2">
                                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${poopBadgeClasses(activity.detail)}`}>
                                      {formatPoopBadgeLabel(activity.detail)}
                                    </span>
                                    {activity.notes ? <p className="text-sm text-zinc-600">{activity.notes}</p> : null}
                                  </div>
                                ) : (
                                  <p className="mt-2 text-sm text-zinc-600">{renderActivityDetail(activity)}</p>
                                )}
                              </article>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    {day.weights.length ? (
                      <div>
                        <h3 className="mb-2 text-sm font-semibold text-zinc-700">Weight</h3>
                        <div className="space-y-2">
                          {day.weights.map((weight) => (
                            <article key={weight.id} className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
                              <div className="flex items-center justify-between gap-3">
                                <p className="font-medium text-zinc-900">Weight Entry</p>
                                <p className="text-sm font-semibold text-zinc-800">{weight.weight}</p>
                              </div>
                            </article>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </section>
              );
            })
          ) : (
            <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
              <p className="text-sm text-zinc-500">No saved history yet.</p>
            </section>
          )}
        </div>

        <BottomNav />
      </div>
    </main>
  );
}
