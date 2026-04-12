import type { ActivityLog, DailyMealState, ManualAlert } from "@/lib/hewster-data";
import type { MealTemplate } from "@/lib/meal-templates";

export type ResolvedAlert = {
  id: string;
  kind: "meal" | "potty" | "manual";
  title: string;
  detail: string;
  severity: "info" | "warning";
};

function parsePlannedTimeToMinutes(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ").toUpperCase();
  const parts = normalized.match(/^(\d{1,2})(?::(\d{2}))?\s?(AM|PM)$/i);
  if (!parts) return null;

  let hours = Number(parts[1]);
  const minutes = Number(parts[2] ?? "0");
  const meridiem = parts[3].toUpperCase();

  if (meridiem === "PM" && hours !== 12) hours += 12;
  if (meridiem === "AM" && hours === 12) hours = 0;

  return hours * 60 + minutes;
}

function nowMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

export function resolveAlerts(
  templates: MealTemplate[],
  dailyMealState: DailyMealState[],
  activityLogs: ActivityLog[],
  manualAlerts: ManualAlert[]
): ResolvedAlert[] {
  const alerts: ResolvedAlert[] = [];
  const stateByMealId = new Map(dailyMealState.map((entry) => [entry.mealId, entry]));
  const currentMinutes = nowMinutes();

  templates.forEach((meal) => {
    const state = stateByMealId.get(meal.id);
    const plannedMinutes = parsePlannedTimeToMinutes(meal.plannedTime);
    const isLogged = Boolean(state?.actualTime);

    if (!isLogged && plannedMinutes !== null && currentMinutes > plannedMinutes) {
      alerts.push({
        id: `meal-${meal.id}`,
        kind: "meal",
        title: `${meal.name} is overdue`,
        detail: `Planned for ${meal.plannedTime} and still not logged.`,
        severity: "warning",
      });
    }
  });

  const hasPottyBy3pm = activityLogs.some((activity) => {
    if (activity.activityType !== "pee" && activity.activityType !== "poop") return false;
    const happened = new Date(activity.happenedAt);
    return happened.getHours() < 15;
  });

  if (currentMinutes >= 15 * 60 && !hasPottyBy3pm) {
    alerts.push({
      id: "potty-check-3pm",
      kind: "potty",
      title: "No pee or poop logged by 3 PM",
      detail: "Please check whether Hewster has gone and log it if needed.",
      severity: "warning",
    });
  }

  manualAlerts
    .filter((alert) => !alert.resolved)
    .forEach((alert) => {
      alerts.push({
        id: alert.id,
        kind: "manual",
        title: alert.title,
        detail: alert.message,
        severity: "info",
      });
    });

  return alerts;
}
