"use client";

import { Candy, Droplets, Ellipsis, Trees } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ActivityType } from "@/lib/hewster-data";

type Props = {
  activityState: "idle" | "saved" | "saving" | "error";
  onQuickLog: (activityType: ActivityType) => void;
  includeOther?: boolean;
};

const quickActions = [
  {
    label: "Pee",
    type: "pee" as const,
    icon: Droplets,
    iconText: null,
    accent: "bg-amber-50 text-amber-700 ring-amber-200",
    iconAccent: "bg-amber-100 text-amber-600",
  },
  {
    label: "Poop",
    type: "poop" as const,
    icon: null,
    iconText: "💩",
    accent: "bg-orange-50 text-orange-700 ring-orange-200",
    iconAccent: "bg-orange-100 text-orange-600",
  },
  {
    label: "Hike",
    type: "hike" as const,
    icon: Trees,
    iconText: null,
    accent: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    iconAccent: "bg-emerald-100 text-emerald-600",
  },
  {
    label: "Treat",
    type: "treat" as const,
    icon: Candy,
    iconText: null,
    accent: "bg-pink-50 text-pink-700 ring-pink-200",
    iconAccent: "bg-pink-100 text-pink-600",
  },
  {
    label: "Other",
    type: "other" as const,
    icon: Ellipsis,
    iconText: null,
    accent: "bg-zinc-100 text-zinc-700 ring-zinc-200",
    iconAccent: "bg-zinc-200 text-zinc-600",
  },
];

export function QuickLogCard({ activityState, onQuickLog, includeOther = true }: Props) {
  return (
    <section className="mb-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Quick Log</h2>
        </div>
        <div className="text-right text-xs text-zinc-500">
          <div className="flex items-center justify-end gap-1.5 text-emerald-600">
            {activityState === "saving"
              ? "Saving activity..."
              : activityState === "saved"
                ? "Activity logged"
                : activityState === "error"
                  ? "Saved in browser only"
                  : ""}
          </div>
        </div>
      </div>

      <div className={`grid gap-3 ${includeOther ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2"}`}>
        {quickActions.filter((action) => includeOther || action.type !== "other").map((action) => {
          const Icon = action.icon;
          return (
            <Button
              key={action.type}
              variant="outline"
              className={`h-16 w-full rounded-2xl justify-start gap-3 border-0 text-left ring-1 ${action.accent}`}
              onClick={() => onQuickLog(action.type)}
            >
              <span className={`flex size-9 items-center justify-center rounded-full ${action.iconAccent}`}>
                {Icon ? <Icon className="size-4.5" /> : <span className="text-lg leading-none">{action.iconText}</span>}
              </span>
              <span>{action.label}</span>
            </Button>
          );
        })}
      </div>
    </section>
  );
}
