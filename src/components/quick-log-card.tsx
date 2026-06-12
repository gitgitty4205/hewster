"use client";

import { Ellipsis } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ActivityType } from "@/lib/hewster-data";

type Props = {
  activityState: "idle" | "saved" | "saving" | "error";
  onQuickLog: (activityType: ActivityType) => void;
  includeOther?: boolean;
  visibleTypes?: ActivityType[];
  title?: React.ReactNode;
  iconOnly?: boolean;
  accentBackground?: boolean;
  onHeaderClick?: () => void;
  headerClickLabel?: string;
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
    iconTextClass: "text-xl scale-110",
  },
  {
    label: "Activity",
    type: "activity" as const,
    icon: null,
    iconText: "\u{1F333}",
    accent: "bg-emerald-50 text-emerald-700",
    iconAccent: "bg-emerald-100 text-emerald-600",
    iconTextClass: "text-xl scale-115",
  },
  {
    label: "Food",
    type: "food" as const,
    icon: null,
    iconText: "\u{1F969}",
    accent: "bg-[#f4eadf]/90 text-[#6b3f22]",
    iconAccent: "bg-[#9a6940]/70 text-white",
    iconTextClass: "text-xl scale-110"
  },
  {
    label: "Treat",
    type: "treat" as const,
    icon: null,
    iconText: "\u{1F9B4}",
    accent: "bg-orange-50 text-orange-600",
    iconAccent: "bg-orange-300 text-white",
    iconTextClass: "text-xl scale-105"
  },
  {
    label: "Health",
    type: "sick" as const,
    icon: null,
    iconText: "\u{1FA7A}",
    accent: "bg-sky-50 text-sky-700",
    iconAccent: "bg-sky-100 text-sky-600",
    iconTextClass: "text-xl scale-110",
  },
  {
    label: "Wellness",
    type: "wellness" as const,
    icon: null,
    iconText: "\u{1F33F}",
    accent: "bg-rose-50 text-[#a44f68]",
    iconAccent: "bg-rose-100 text-[#b7657a]",
    iconTextClass: "scale-95",
  },
  {
    label: "Care",
    type: "care" as const,
    icon: null,
    iconText: "\u{1F3E0}",
    accent: "bg-purple-50 text-purple-700",
    iconAccent: "bg-purple-200 text-purple-800",
    iconTextClass: "text-xl scale-110",
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

const quickTileDepth =
  "shadow-[0_10px_18px_rgba(39,54,45,0.18),0_2px_4px_rgba(255,255,255,0.75)_inset,0_-3px_7px_rgba(39,54,45,0.08)_inset] ring-1 ring-white/70 hover:shadow-[0_13px_24px_rgba(39,54,45,0.22),0_2px_5px_rgba(255,255,255,0.82)_inset,0_-3px_8px_rgba(39,54,45,0.1)_inset]";

const quickIconDepth =
  "shadow-[0_6px_10px_rgba(39,54,45,0.16),0_1px_3px_rgba(255,255,255,0.9)_inset,0_-2px_5px_rgba(39,54,45,0.1)_inset] ring-1 ring-white/80 drop-shadow-[0_2px_2px_rgba(39,54,45,0.18)]";

export function QuickLogCard({ activityState, onQuickLog, includeOther = true, visibleTypes, title = "Log", iconOnly = false, accentBackground = false, onHeaderClick, headerClickLabel, children }: Props) {
  const visibleActions = quickActions.filter((action) => {
    if (visibleTypes) return visibleTypes.includes(action.type);
    return includeOther || action.type !== "other";
  });
  const useAccentBackground = iconOnly || accentBackground;

  return (
    <section className={`mb-4 rounded-3xl p-5 shadow-sm ring-1 ${useAccentBackground ? "bg-[var(--hewie-accent,#64748b)] ring-[var(--hewie-accent,#64748b)]/35" : "bg-white ring-zinc-200"}`}>
      {title || activityState !== "idle" ? (
        onHeaderClick ? (
          <button
            type="button"
            onClick={onHeaderClick}
            className={`mb-4 flex w-full items-center rounded-2xl transition active:translate-y-px ${useAccentBackground ? "justify-center text-center text-[var(--hewie-accent-text,#ffffff)] hover:bg-white/5" : "justify-between hover:bg-zinc-50"}`}
            aria-label={headerClickLabel}
          >
            <div>{title ? <h2 className="text-lg font-semibold">{title}</h2> : null}</div>
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
          </button>
        ) : (
          <div className={`mb-4 flex items-center ${useAccentBackground ? "justify-center text-center" : "justify-between"}`}>
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
        )
      ) : null}

      <div className={iconOnly ? "-mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" : "grid grid-cols-2 gap-3"}>
        {visibleActions.map((action) => {
          const Icon = action.icon;
          return (
            <Button
              key={action.type}
              variant="outline"
              className={`${iconOnly ? "h-14 w-14 shrink-0 justify-center px-0 active:scale-[0.98]" : "h-16 w-full justify-start gap-3 text-left"} ${quickTileDepth} rounded-2xl border-0 transition hover:-translate-y-0.5 hover:scale-[1.01] ${action.accent}`}
              onClick={() => onQuickLog(action.type)}
              aria-label={action.label}
            >
              <span className={`flex shrink-0 items-center justify-center rounded-full ${iconOnly ? "size-10" : "size-9"} ${quickIconDepth} ${action.iconAccent}`}>
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
