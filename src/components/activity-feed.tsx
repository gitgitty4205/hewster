import { Check, Droplets, Ellipsis, Tablets, TriangleAlert } from "lucide-react";

import { MedicationPillIcon } from "@/components/medication-pill-icon";
import { PottyDetailBadges, pottyDetailForBadge } from "@/components/potty-detail-badges";
import type { ActivityLog } from "@/lib/hewster-data";
import { compareActivitiesChronological, formatActivityLabel, formatActivityTime, groupActivitiesByDay, renderTreatDetailParts, splitTreatDetailText } from "@/lib/activity";

type TimelineItem = {
  time: string;
  label: string;
  detail: string;
  activity?: ActivityLog;
  activityType?: ActivityLog["activityType"] | "meal" | "manual";
};

type Props = {
  activityLogs: ActivityLog[];
  timelineItems?: TimelineItem[];
  title?: string;
  subtitle?: string;
  grouped?: boolean;
  onSelectActivity?: (activity: ActivityLog) => void;
  renderInlineEditor?: (activity: ActivityLog) => React.ReactNode;
};

function TreatDetail({ activity }: { activity: ActivityLog }) {
  const { summary, notes } = renderTreatDetailParts(activity);

  return (
    <div className="mt-2 space-y-1 text-sm">
      {summary ? <p className="text-zinc-600">{summary}</p> : null}
      {notes ? <p className="text-zinc-500">Notes: {notes}</p> : null}
    </div>
  );
}

function splitActivityNotes(notes: string | null) {
  const lines = notes?.split("\n").map((line) => line.trim()).filter(Boolean) ?? [];
  const attachmentLine = lines.find((line) => line.startsWith("Attachments: ")) ?? null;

  return {
    lines,
    notesText: lines.filter((line) => line !== attachmentLine).join("\n"),
    attachmentLine,
  };
}

function CareActivityDetail({ activity }: { activity: ActivityLog }) {
  const { lines, attachmentLine } = splitActivityNotes(activity.notes);
  const detail = activity.detail ?? "";
  const skipped = /\bSkipped\b/i.test(detail) || lines.some((line) => line.startsWith("Skip Note: "));
  const missed = /\bMissed\b/i.test(detail) || lines.includes("Missed");
  const skipReason = lines.find((line) => line.startsWith("Skip Note: "))?.replace("Skip Note: ", "").trim() ?? null;
  const careLines = lines.filter((line) => line !== attachmentLine && !line.startsWith("Skip Note: ") && line !== "Missed");
  const isLastDose = careLines.includes("Last Dose");
  const timingLine = careLines.find((line) => line === "With Food" || line === "Empty Stomach") ?? null;
  const giveLine = careLines.find((line) => line.startsWith("Give ")) ?? null;
  const doseText = giveLine?.replace(/^Give\s+/i, "").replace(/\s*\([^)]*\)\s*$/, "").trim() ?? "";
  const name = detail
    .replace(/\s*(?:[•·-]\s*)?(?:Skipped|Missed)\b/i, "")
    .replace(doseText ? new RegExp(`\\s*[•·]\\s*${doseText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i") : /$^/, "")
    .trim();
  const giveDetail = giveLine ?? null;
  const specialNotes = careLines.filter((line) => line.startsWith("Notes: ")).map((line) => line.replace("Notes: ", ""));

  return (
    <div className="mt-2 space-y-1.5 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {name ? <p className="font-semibold text-zinc-800">{name}</p> : null}
        {skipped || missed ? <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-200/80">{missed ? "Missed" : skipReason ? `Skipped — ${skipReason}` : "Skipped"}</span> : null}
      </div>
      {giveDetail ? (
        <div className="flex flex-wrap items-center gap-2 text-zinc-600">
          <p>{giveDetail}</p>
          {timingLine ? (
            <span className={`rounded-full px-2.5 py-1 text-xs font-normal ${activity.activityType === "supplement" ? "bg-white/55 text-[#1f3d5c]/60" : "bg-sky-100/80 text-sky-700/60"}`}>
              {timingLine}
            </span>
          ) : null}
          {isLastDose ? <span className="rounded-full bg-amber-100/80 px-2.5 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200/70">Last Dose</span> : null}
        </div>
      ) : null}
      {specialNotes.length ? <p className="text-zinc-500"><span className="font-medium text-zinc-600">Notes:</span> {specialNotes.join(" · ")}</p> : null}
      {attachmentLine ? <p className="text-zinc-500">{attachmentLine}</p> : null}
    </div>
  );
}

function ActivityDetailAndNotes({ activity }: { activity: ActivityLog }) {
  const { notesText, attachmentLine } = splitActivityNotes(activity.notes);

  if (["medication", "supplement"].includes(activity.activityType)) {
    return <CareActivityDetail activity={activity} />;
  }

  return (
    <div className="mt-2 space-y-1 text-sm text-zinc-600">
      {activity.detail ? <p>{activity.detail}</p> : null}
      {notesText ? <p>Notes: {notesText}</p> : null}
      {attachmentLine ? <p className="text-zinc-500">{attachmentLine}</p> : null}
    </div>
  );
}

function displayActivityLabel(activity: ActivityLog) {
  return ["pee", "poop", "potty"].includes(activity.activityType) ? "Potty" : formatActivityLabel(activity.activityType);
}

function getActivityStyle(activityType: ActivityLog["activityType"]) {
  switch (activityType) {
    case "potty":
      return {
        icon: null,
        iconText: "\u{1F6BD}",
        card: "bg-[#ead7a8] ring-[#f0d27a]",
        iconWrap: "bg-[rgba(255,255,255,0.55)] text-[#8a6200] ring-1 ring-[rgba(240,210,122,0.6)]",
        dot: "bg-[#d7a900]",
      };
    case "pee":
      return {
        icon: Droplets,
        iconText: null,
        card: "bg-[#ead7a8] ring-amber-200",
        iconWrap: "bg-amber-100 text-amber-600",
        dot: "bg-amber-400",
      };
    case "poop":
      return {
        icon: null,
        iconText: "\u{1F4A9}",
        card: "bg-[#ead7a8] ring-orange-200",
        iconWrap: "bg-orange-100 text-orange-600",
        dot: "bg-orange-800",
      };
    case "activity":
    case "outdoor":
      return {
        icon: null,
        iconText: "\u{1F333}",
        card: "bg-emerald-50/80 ring-emerald-200",
        iconWrap: "bg-emerald-100 text-emerald-600",
        dot: "bg-emerald-400",
      };
    case "care":
      return {
        icon: null,
        iconText: "\u{1F3E0}",
        card: "bg-purple-50/80 ring-purple-200",
        iconWrap: "bg-purple-200 text-purple-800",
        dot: "bg-purple-400",
      };
    case "wellness":
      return {
        icon: null,
        iconText: "\u{1F33F}",
        card: "bg-rose-50/80 ring-rose-200",
        iconWrap: "bg-rose-100 text-rose-600",
        dot: "bg-rose-400",
      };
    case "hike":
      return {
        icon: null,
        iconText: "\u{1F333}",
        card: "bg-emerald-50/80 ring-emerald-200",
        iconWrap: "bg-emerald-100 text-emerald-600",
        dot: "bg-emerald-400",
      };
    case "treat":
      return {
        icon: null,
        iconText: "\u{1F9B4}",
        card: "bg-orange-50/80 ring-orange-200",
        iconWrap: "bg-orange-400 text-white",
        dot: "bg-orange-400",
      };
    case "food":
      return {
        icon: null,
        iconText: "\u{1F969}",
        card: "bg-[#ead8c5]/80 ring-[#caa57f]",
        iconWrap: "bg-[#8a5a35]/75 text-white",
        dot: "bg-amber-900",
      };
    case "supplement":
      return {
        icon: Tablets,
        iconText: null,
        card: "bg-[#eaf0f8]/80 ring-[#b8c9dd]",
        iconWrap: "bg-[#eaf0f8] text-[#1f3d5c] ring-1 ring-[#b8c9dd]",
        dot: "bg-[#eaf0f8] ring-1 ring-[#b8c9dd]",
      };
    case "medication":
      return {
        icon: MedicationPillIcon,
        iconText: null,
        card: "bg-sky-50/80 ring-sky-200",
        iconWrap: "bg-sky-100 text-sky-600",
        dot: "bg-sky-100",
      };
    case "sick":
      return {
        icon: null,
        iconText: "\u{1FA7A}",
        card: "bg-sky-50/80 ring-sky-200",
        iconWrap: "bg-sky-100 text-sky-600",
        dot: "bg-sky-400",
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
    case "potty":
    case "pee":
    case "poop":
      return {
        dot: "bg-[#d7a900]",
        icon: null,
      };
    case "activity":
    case "outdoor":
      return {
        dot: "bg-emerald-400",
        icon: null,
      };
    case "care":
      return {
        dot: "bg-purple-400",
        icon: null,
      };
    case "wellness":
      return {
        dot: "bg-rose-100 ring-1 ring-rose-200",
        icon: <span className="text-[0.7rem] leading-none">🌿</span>,
      };
    case "hike":
      return {
        dot: "bg-emerald-400",
        icon: null,
      };
    case "treat":
      return {
        dot: "bg-orange-400",
        icon: null,
      };
    case "food":
      return {
        dot: "bg-amber-900",
        icon: null,
      };
    case "supplement":
      return {
        dot: "bg-[#eaf0f8] ring-1 ring-[#b8c9dd]",
        icon: <Tablets className="size-3 text-[#1f3d5c]" />,
      };
    case "medication":
      return {
        dot: "bg-sky-100 ring-1 ring-sky-100",
        icon: <MedicationPillIcon className="size-4 text-sky-600" />,
      };
    case "sick":
      return {
        dot: "bg-sky-400",
        icon: null,
      };
    case "other":
      return {
        dot: "bg-zinc-400",
        icon: null,
      };
    case "meal":
      return {
        dot: "bg-[#8a5a35]/80 ring-1 ring-[#8a5a35]/20",
        icon: <Check className="size-3.5 text-white" strokeWidth={3} />,
      };
    case "manual":
      return {
        dot: "bg-[#fff0f1] ring-1 ring-[#e6c8ce]/80",
        icon: <TriangleAlert className="size-3.5 text-[#8f1739]" strokeWidth={2.25} />,
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
  title = "Event Feed",
  subtitle = "",
  grouped = false,
  onSelectActivity,
  renderInlineEditor,
}: Props) {
  if (grouped) {
    const groupedLogs = groupActivitiesByDay(activityLogs);
    const dayEntries = Object.entries(groupedLogs).sort((a, b) => a[0].localeCompare(b[0]));

    if (timelineItems) {
      return (
        <section className="mb-4 rounded-3xl bg-[var(--hewie-active-bg,#f1f5f9)] p-5 shadow-sm ring-1 ring-[var(--hewie-ring,#cbd5e1)]">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-[var(--hewie-active-text,#334155)]">{title}</h2>
            {subtitle ? <p className="text-sm text-[var(--hewie-active-text,#334155)]/65">{subtitle}</p> : null}
          </div>
          <div className="space-y-3">
            {timelineItems.length === 0 ? (
              <p className="text-sm text-[var(--hewie-active-text,#334155)]/65">No Events Logged Yet.</p>
            ) : (
              timelineItems.map((item, index) => {
                if (item.activity) {
                  const activity = item.activity;
                  const displayType = activity.detail === "Hike" ? "hike" : (["pee", "poop"].includes(activity.activityType) ? "potty" : activity.activityType);
                  const style = getActivityStyle(displayType);
                  const Icon = style.icon;
                  const inlineEditor = renderInlineEditor ? renderInlineEditor(activity) : null;

                  return (
                    <div key={activity.id} className={`rounded-2xl p-4 ring-1 ${style.card}`}>
                      <button className="block w-full text-left" onClick={() => onSelectActivity?.(activity)}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <span className={`flex size-9 items-center justify-center rounded-full ${style.iconWrap}`}>
                              {Icon ? <Icon className="size-4.5" /> : <span className="text-lg leading-none">{style.iconText}</span>}
                            </span>
                            <p className="font-medium text-zinc-900">{displayActivityLabel(activity)}</p>
                          </div>
                          <p className="text-sm text-zinc-500">{formatActivityTime(activity.happenedAt)}</p>
                        </div>
                        {["pee", "poop", "potty"].includes(activity.activityType) && pottyDetailForBadge(activity) ? (
                          <PottyDetailBadges detail={pottyDetailForBadge(activity)} notes={activity.notes} />
                        ) : activity.activityType === "treat" ? (
                          <TreatDetail activity={activity} />
                        ) : (
                          <ActivityDetailAndNotes activity={activity} />
                        )}
                      </button>
                      {inlineEditor ? <div className="mt-3">{inlineEditor}</div> : null}
                    </div>
                  );
                }

                const missed = item.label.toLowerCase().includes("missed");
                const skipped = item.label.toLowerCase().includes("skipped");
                return (
                  <div key={`${item.activityType ?? "item"}-${item.time}-${item.label}-${item.detail}-${index}`} className="rounded-2xl bg-[#f4eadf]/90 p-4 ring-1 ring-[#d8b895]">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#8a5a35]/75 text-white">
                          <Check className="size-4.5" strokeWidth={3} />
                        </span>
                        <p className="font-medium text-zinc-900">{item.label}</p>
                        {missed ? <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-200/80">Missed</span> : null}
                        {skipped ? <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-200/80">Skipped</span> : null}
                      </div>
                      <p className="text-sm text-zinc-500">{item.time}</p>
                    </div>
                    {item.detail.includes(" • Notes: ") ? (
                      <>
                        <p className="mt-2 text-sm text-zinc-600">{item.detail.split(" • Notes: ")[0]}</p>
                        <p className="mt-1 text-sm font-bold text-zinc-700">Notes: {item.detail.split(" • Notes: ")[1]}</p>
                      </>
                    ) : (
                      <p className="mt-2 text-sm text-zinc-600">{item.detail}</p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>
      );
    }

    return (
      <section className="mb-4 rounded-3xl bg-[var(--hewie-active-bg,#f1f5f9)] p-5 shadow-sm ring-1 ring-[var(--hewie-ring,#cbd5e1)]">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-[var(--hewie-active-text,#334155)]">{title}</h2>
          {subtitle ? <p className="text-sm text-[var(--hewie-active-text,#334155)]/65">{subtitle}</p> : null}
        </div>
        <div className="space-y-5">
          {dayEntries.length === 0 ? (
            <p className="text-sm text-[var(--hewie-active-text,#334155)]/65">No Events Logged Yet.</p>
          ) : (
            dayEntries.map(([day, logs]) => (
              <div key={day} className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--hewie-active-text,#334155)]/55">{day}</p>
                {[...logs].sort(compareActivitiesChronological).map((activity) => {
                  const displayType = activity.detail === "Hike" ? "hike" : (["pee", "poop"].includes(activity.activityType) ? "potty" : activity.activityType);
                  const style = getActivityStyle(displayType);
                  const Icon = style.icon;

                  const inlineEditor = renderInlineEditor ? renderInlineEditor(activity) : null;

                  return (
                    <div key={activity.id} className={`rounded-2xl p-4 ring-1 ${style.card}`}>
                      <button
                        className="block w-full text-left"
                        onClick={() => onSelectActivity?.(activity)}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <span className={`flex size-9 items-center justify-center rounded-full ${style.iconWrap}`}>
                              {Icon ? <Icon className="size-4.5" /> : <span className="text-lg leading-none">{style.iconText}</span>}
                            </span>
                            <p className="font-medium text-zinc-900">{displayActivityLabel(activity)}</p>
                          </div>
                          <p className="text-sm text-zinc-500">{formatActivityTime(activity.happenedAt)}</p>
                        </div>
                        {["pee", "poop", "potty"].includes(activity.activityType) && pottyDetailForBadge(activity) ? (
                          <PottyDetailBadges detail={pottyDetailForBadge(activity)} notes={activity.notes} />
                        ) : activity.activityType === "treat" ? (
                          <TreatDetail activity={activity} />
                        ) : (
                          <ActivityDetailAndNotes activity={activity} />
                        )}
                      </button>
                      {inlineEditor ? <div className="mt-3">{inlineEditor}</div> : null}
                    </div>
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
    <section className="mb-4 rounded-3xl bg-white/90 p-5 shadow-sm ring-1 ring-zinc-200/80">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-zinc-800">{title}</h2>
        {subtitle ? <p className="text-sm text-zinc-500">{subtitle}</p> : null}
      </div>
      <div className="space-y-2">
        {timelineItems?.length ? (
          timelineItems.map((item, index) => {
            const style = getTimelineStyle(item.activityType);
            const treatParts = item.activityType === "treat" ? splitTreatDetailText(item.detail) : null;
            const careActivity = item.activity && ["medication", "supplement"].includes(item.activityType ?? "") ? item.activity : null;
            const inlineEditor = item.activity && renderInlineEditor ? renderInlineEditor(item.activity) : null;
            const missed = item.label.toLowerCase().includes("missed");
            const skipped = item.label.toLowerCase().includes("skipped");
            const content = (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <p className="min-w-0 text-sm font-semibold text-zinc-900">{item.label}</p>
                    {missed ? <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-200/80">Missed</span> : null}
                    {skipped ? <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-200/80">Skipped</span> : null}
                  </div>
                  <span className="shrink-0 rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-semibold text-zinc-500 ring-1 ring-zinc-200/80">
                    {item.time}
                  </span>
                </div>
                {careActivity ? (
                  <CareActivityDetail activity={careActivity} />
                ) : treatParts ? (
                  <>
                    {treatParts.summary ? <p className="mt-1 text-sm text-zinc-500">{treatParts.summary}</p> : null}
                    {treatParts.notes ? <p className="mt-1 text-sm text-zinc-500">Notes: {treatParts.notes}</p> : null}
                  </>
                ) : item.detail.includes(" • Notes: ") ? (
                  <>
                    <p className="mt-1 text-sm text-zinc-500">{item.detail.split(" • Notes: ")[0]}</p>
                    <p className="mt-1 text-sm font-bold text-zinc-700">• Notes: {item.detail.split(" • Notes: ")[1]}</p>
                  </>
                ) : (
                  <p className="mt-1 text-sm leading-5 text-zinc-600">{item.detail}</p>
                )}
              </>
            );

            return (
              <div key={`${item.activityType ?? "item"}-${item.time}-${item.label}-${item.detail}-${index}`} className="rounded-2xl bg-zinc-50/75 p-2.5 ring-1 ring-zinc-200/70">
                <div className="grid grid-cols-[1.35rem_1fr] gap-2.5">
                  <div className="flex w-5 justify-center">
                    <div className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full shadow-sm ring-2 ring-white ${style.dot}`}>
                      {style.icon}
                    </div>
                  </div>
                  <div className="min-w-0">
                    {item.activity && onSelectActivity ? (
                      <button type="button" className="block w-full text-left" onClick={() => onSelectActivity(item.activity as ActivityLog)}>
                        {content}
                      </button>
                    ) : content}
                    {inlineEditor ? <div className="mt-3">{inlineEditor}</div> : null}
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <p className="text-sm text-zinc-500">No Events Logged Yet.</p>
        )}
      </div>
    </section>
  );
}
