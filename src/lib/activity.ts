import type { ActivityLog, ActivityType } from "@/lib/hewster-data";

export function formatActivityLabel(activityType: ActivityType) {
  switch (activityType) {
    case "pee":
      return "Pee";
    case "poop":
      return "Poop";
    case "hike":
      return "Hiking";
    case "treat":
      return "Treat";
    case "other":
      return "Other";
    default:
      return "Activity";
  }
}

export function formatActivityTime(happenedAt: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(happenedAt));
}

export function renderActivityDetail(activity: ActivityLog) {
  if (activity.activityType === "treat" && activity.detail === "Other" && activity.notes) {
    return `Other treat: ${activity.notes}`;
  }

  if (activity.activityType === "other" && activity.detail && activity.notes) {
    return `${activity.detail}: ${activity.notes}`;
  }

  if (activity.detail && activity.notes) {
    return `${activity.detail}, ${activity.notes}`;
  }

  return activity.detail ?? activity.notes ?? "Quick log";
}

export function groupActivitiesByDay(activityLogs: ActivityLog[]) {
  return activityLogs.reduce<Record<string, ActivityLog[]>>((groups, activity) => {
    const dayKey = new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(activity.happenedAt));

    if (!groups[dayKey]) {
      groups[dayKey] = [];
    }

    groups[dayKey].push(activity);
    return groups;
  }, {});
}
