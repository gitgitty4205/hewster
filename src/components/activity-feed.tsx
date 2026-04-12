import { BellPlus, Candy, Check, Droplets, Ellipsis, Trees } from "lucide-react";

import type { ActivityLog } from "@/lib/hewster-data";
import { formatActivityLabel, formatActivityTime, groupActivitiesByDay, renderActivityDetail } from "@/lib/activity";

type TimelineItem = {
  time: string;
  label: string;
  detail: string;
  activityType?: ActivityLog["activityType"] | "meal" | "manual";
};

type Props = {
  activityLogs: ActivityLog[];
  timelineItems?: TimelineItem[];
  title?: string;
  subtitle?: string;
  grouped?: boolean;
  onSelectActivity?: (activity: ActivityLog) => void;
};

function getActivityStyle(activityType: ActivityLog["activityType"]) {
  switch (activityType) {
    case "pee":
      return {
        icon: Droplets,
        iconText: null,
        card: "bg-amber-50/80 ring-amber-200",
        iconWrap: "bg-amber-100 text-amber-600",
        dot: "bg-amber-400",
      };
    case "poop":
      return {
        icon: null,
        iconText: "💩",
        card: "bg-orange-100/70 ring-orange-200",
        iconWrap: "bg-orange-100 text-orange-600",
        dot: "bg-orange-800",
      };
    case "hike":
      return {
        icon: Trees,
        iconText: null,
        card: "bg-emerald-50/80 ring-emerald-200",
        iconWrap: "bg-emerald-100 text-emerald-600",
        dot: "bg-emerald-400",
      };
    case "treat":
      return {
        icon: Candy,
        iconText: null,
        card: "bg-pink-50/80 ring-pink-200",
        iconWrap: "bg-pink-100 text-pink-600",
        dot: "bg-pink-400",
      };
    case "other":
      return {
        icon: Ellipsis,
        iconText: null,
        card: "bg-zinc-100/90 ring-zinc-200",
        iconWrap: "bg-zinc-200 text-zinc-600",
        dot: "bg-zinc-400",
      };
  }
}

function getTimelineStyle(activityType?: TimelineItem["activityType"]) {
  switch (activityType) {
    case "pee":
      return {
        dot: "bg-amber-400",
        icon: null,
      };
    case "poop":
      return {
        dot: "bg-amber-800",
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
        dot: "bg-rose-400",
        icon: null,
      };
  }
}

export function ActivityFeed({
  activityLogs,
  timelineItems,
  title = "Activity Feed",
  subtitle = "",
  grouped = false,
  onSelectActivity,
}: Props) {
  if (grouped) {
    const groupedLogs = groupActivitiesByDay(activityLogs);
    const dayEntries = Object.entries(groupedLogs).sort((a, b) => a[0].localeCompare(b[0]));

    return (
      <section className="mb-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          {subtitle ? <p className="text-sm text-zinc-500">{subtitle}</p> : null}
        </div>
        <div className="space-y-5">
          {dayEntries.length === 0 ? (
            <p className="text-sm text-zinc-500">No activity logged yet.</p>
          ) : (
            dayEntries.map(([day, logs]) => (
              <div key={day} className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">{day}</p>
                {[...logs].sort((a, b) => a.happenedAt.localeCompare(b.happenedAt)).map((activity) => {
                  const style = getActivityStyle(activity.activityType);
                  const Icon = style.icon;

                  return (
                    <button
                      key={activity.id}
                      className={`block w-full rounded-2xl p-4 text-left ring-1 ${style.card}`}
                      onClick={() => onSelectActivity?.(activity)}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className={`flex size-9 items-center justify-center rounded-full ${style.iconWrap}`}>
                            {Icon ? <Icon className="size-4.5" /> : <span className="text-lg leading-none">{style.iconText}</span>}
                          </span>
                          <p className="font-medium text-zinc-900">{formatActivityLabel(activity.activityType)}</p>
                        </div>
                        <p className="text-sm text-zinc-500">{formatActivityTime(activity.happenedAt)}</p>
                      </div>
                      <p className="mt-2 text-sm text-zinc-600">{renderActivityDetail(activity)}</p>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="mb-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        {subtitle ? <p className="text-sm text-zinc-500">{subtitle}</p> : null}
      </div>
      <div className="space-y-4">
        {timelineItems?.length ? (
          timelineItems.map((item) => {
            const style = getTimelineStyle(item.activityType);
            return (
              <div key={`${item.time}-${item.label}-${item.detail}`} className="flex gap-3">
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
          })
        ) : (
          <p className="text-sm text-zinc-500">No activity logged yet.</p>
        )}
      </div>
    </section>
  );
}
