"use client";

import { Ellipsis } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ActivityType } from "@/lib/hewster-data";

type Props = {
  activityState: "idle" | "saved" | "saving" | "error";
  onQuickLog: (activityType: ActivityType) => void;
  includeOther?: boolean;
  visibleTypes?: ActivityType[];
  title?: string | null;
  iconOnly?: boolean;
  accentBackground?: boolean;
  children?: React.ReactNode;
};

const quickActions = [
  {
    label: "Potty",
    type: "potty" as const,
    icon: null,
    iconText: "\u{1F6BD}",
    accent: "bg-[#fff7dc] text-[#8a6200]",
    iconAccent: "bg-white/60 text-[#8a6200]",
    iconTextClass: "scale-95",
  },
  {
    label: "Activity",
    type: "activity" as const,
    icon: null,
    iconText: "\u{1F333}",
    accent: "bg-emerald-50 text-emerald-700",
    iconAccent: "bg-emerald-100 text-emerald-600",
    iconTextClass: "scale-105",
  },
  {
    label: "Food",
    type: "food" as const,
    icon: null,
    iconText: "\u{1F969}",
    accent: "bg-[#f4eadf]/90 text-[#6b3f22]",
    iconAccent: "bg-[#9a6940]/70 text-white",
    iconTextClass: "scale-95"
  },
  {
    label: "Treat",
    type: "treat" as const,
    icon: null,
    iconText: "\u{1F9B4}",
    accent: "bg-orange-50 text-orange-600",
    iconAccent: "bg-orange-300 text-white",
    iconTextClass: "scale-90"
  },
  {
    label: "Wellness",
    type: "wellness" as const,
    icon: null,
    iconText: "\u{1FA7A}",
    accent: "bg-sky-50 text-sky-700",
    iconAccent: "bg-sky-100 text-sky-600",
    iconTextClass: "scale-95",
  },
  {
    label: "Medication",
    type: "medication" as const,
    icon: null,
    iconText: "\u{1F48A}",
    accent: "bg-sky-50 text-sky-700",
    iconAccent: "bg-sky-100 text-sky-600",
    iconTextClass: "scale-95",
  },
  {
    label: "Supplement",
    type: "supplement" as const,
    icon: null,
    iconText: "\u{1F33F}",
    accent: "bg-[#eaf0f8] text-[#1f3d5c]",
    iconAccent: "bg-white/65 text-[#1f3d5c]",
    iconTextClass: "scale-95",
  },
  {
    label: "Sick",
    type: "sick" as const,
    icon: null,
    iconText: "\u{1F912}",
    accent: "bg-rose-50 text-rose-700",
    iconAccent: "bg-rose-100 text-rose-600",
    iconTextClass: "scale-95",
  },
  {
    label: "Care",
    type: "care" as const,
    icon: null,
    iconText: "\u{1F3E0}",
    accent: "bg-purple-50 text-purple-700",
    iconAccent: "bg-purple-200 text-purple-800",
    iconTextClass: "scale-95",
  },
  {
    label: "Other",
    type: "other" as const,
    icon: Ellipsis,
    iconText: null,
    accent: "bg-zinc-100 text-zinc-700",
    iconAccent: "bg-zinc-200 text-zinc-600",
  },
];

export function QuickLogCard({ activityState, onQuickLog, includeOther = true, visibleTypes, title = "Log Event", iconOnly = false, accentBackground = false, children }: Props) {
  const visibleActions = quickActions.filter((action) => {
    if (visibleTypes) return visibleTypes.includes(action.type);
    return includeOther || action.type !== "other";
  });
  const useAccentBackground = iconOnly || accentBackground;

  return (
    <section className={`mb-4 rounded-3xl p-5 shadow-sm ring-1 ${useAccentBackground ? "bg-[var(--hewie-accent,#64748b)] ring-[var(--hewie-accent,#64748b)]/35" : "bg-white ring-zinc-200"}`}>
      {title || activityState !== "idle" ? (
        <div className="mb-4 flex items-center justify-between">
          <div>{title ? <h2 className={`text-lg font-semibold ${useAccentBackground ? "text-[var(--hewie-accent-text,#ffffff)]" : ""}`}>{title}</h2> : null}</div>
          <div className={`text-right text-xs ${useAccentBackground ? "text-[var(--hewie-accent-text,#ffffff)]/75" : "text-zinc-500"}`}>
            <div className={`flex items-center justify-end gap-1.5 ${useAccentBackground ? "text-[var(--hewie-accent-text,#ffffff)]" : "text-emerald-600"}`}>
              {activityState === "saving"
                ? "Saving Event..."
                : activityState === "saved"
                  ? "Event Logged"
                  : activityState === "error"
                    ? "Saved In Browser Only"
                    : ""}
            </div>
          </div>
        </div>
      ) : null}

      <div className={iconOnly ? "-mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" : `grid gap-3 ${visibleActions.length > 2 ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2"}`}>
        {visibleActions.map((action) => {
          const Icon = action.icon;
          return (
            <Button
              key={action.type}
              variant="outline"
              className={`${iconOnly ? "h-14 w-14 shrink-0 justify-center px-0 shadow-sm hover:shadow-md active:scale-[0.99]" : "h-16 w-full justify-start gap-3 text-left shadow-sm"} rounded-2xl border-0 transition hover:scale-[1.01] ${action.accent}`}
              onClick={() => onQuickLog(action.type)}
              aria-label={action.label}
            >
              <span className={`flex shrink-0 items-center justify-center rounded-full ${iconOnly ? "size-10" : "size-9"} ${action.iconAccent}`}>
                {Icon ? <Icon className={iconOnly ? "size-5.5" : "size-4.5"} /> : <span className={`inline-block ${iconOnly ? "text-[1.35rem]" : "text-lg"} ${"iconTextClass" in action ? action.iconTextClass : ""} leading-none`}>{action.iconText}</span>}
              </span>
              {iconOnly ? null : <span className="text-base font-semibold">{action.label}</span>}
            </Button>
          );
        })}
      </div>

      {children ? (
        <div className={useAccentBackground ? "mt-3 rounded-2xl bg-white p-4 text-zinc-900 ring-1 ring-white/70" : "mt-3 pt-1"}>
          {children}
        </div>
      ) : null}
    </section>
  );
}
