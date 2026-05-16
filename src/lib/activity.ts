import type { ActivityLog, ActivityType } from "@/lib/hewster-data";

export function formatActivityLabel(activityType: ActivityType) {
  switch (activityType) {
    case "potty":
      return "Potty";
    case "pee":
      return "Pee";
    case "poop":
      return "Poop";
    case "activity":
    case "outdoor":
      return "Activity";
    case "care":
      return "Care";
    case "wellness":
      return "Wellness";
    case "hike":
      return "Hiking";
    case "treat":
      return "Treat";
    case "food":
      return "Food";
    case "supplement":
      return "Supplement";
    case "medication":
      return "Medication";
    case "sick":
      return "Health";
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
  const notes = activity.notes?.replace(/\s*(?:•|�\?�|•)\s*Notes:\s*/g, " Notes: ") ?? null;

  if (activity.activityType === "treat" && activity.detail && notes) {
    return `${activity.detail}: ${notes}`;
  }

  if (
    (
      activity.activityType === "other" ||
      activity.activityType === "potty" ||
      activity.activityType === "activity" ||
      activity.activityType === "outdoor" ||
      activity.activityType === "care" ||
      activity.activityType === "wellness" ||
      activity.activityType === "food" ||
      activity.activityType === "supplement" ||
      activity.activityType === "medication" ||
      activity.activityType === "sick"
    ) &&
    activity.detail &&
    notes
  ) {
    return `${activity.detail}: ${notes}`;
  }

  if (activity.detail && notes) {
    return `${activity.detail}, ${notes}`;
  }

  return activity.detail ?? notes ?? "";
}

export function splitTreatDetailText(value: string) {
  const [summary, notes] = value.split(/\s+Notes:\s+/, 2);

  return {
    summary: summary.trim(),
    notes: notes?.trim() || null,
  };
}

export function renderTreatDetailParts(activity: ActivityLog) {
  const detail = renderActivityDetail(activity);
  return splitTreatDetailText(detail);
}

function activityTieBreaker(activity: ActivityLog) {
  return activity.createdAt ?? activity.id;
}

export function compareActivitiesChronological(a: ActivityLog, b: ActivityLog) {
  return a.happenedAt.localeCompare(b.happenedAt) || activityTieBreaker(a).localeCompare(activityTieBreaker(b));
}

export function compareActivitiesReverseChronological(a: ActivityLog, b: ActivityLog) {
  return b.happenedAt.localeCompare(a.happenedAt) || activityTieBreaker(b).localeCompare(activityTieBreaker(a));
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
