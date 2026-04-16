"use client";

import { Button } from "@/components/ui/button";
import type { ActivityType } from "@/lib/hewster-data";
import { formatActivityLabel } from "@/lib/activity";

type Props = {
  activityType: ActivityType;
  detail: string;
  notes: string;
  happenedAt: string;
  isEditing?: boolean;
  embedded?: boolean;
  onDetailChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onHappenedAtChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
  saving: boolean;
};

const presets: Record<ActivityType, string[]> = {
  pee: [],
  poop: [
    "No Poop",
    "Constipated",
    "Normal-Hard",
    "Normal",
    "Normal-Soft",
    "Soft",
    "1 Time Diarrhea",
    "Repeated Severe Diarrhea",
  ],
  hike: ["Short hiking", "Long hike"],
  treat: ["Small chomper", "Big chomper", "Other"],
  other: [],
};

const notesPlaceholders: Record<ActivityType, string> = {
  pee: "Optional note",
  poop: "Optional note about what may have caused it",
  hike: "Optional note about route, weather, or behavior",
  treat: "If you picked Other, type the treat here",
  other: "Describe what happened",
};

export function ActivityDetailForm({
  activityType,
  detail,
  notes,
  happenedAt,
  isEditing = false,
  embedded = false,
  onDetailChange,
  onNotesChange,
  onHappenedAtChange,
  onSave,
  onCancel,
  onDelete,
  saving,
}: Props) {
  const showOtherField = activityType === "treat" && detail === "Other";
  const showDetailField = activityType === "other";

  return (
    <section className={embedded ? "mt-3 border-t border-zinc-200 pt-4" : "rounded-[1.5rem] border border-zinc-200 bg-white/80 p-4"}>
      <div className="mb-4">
        <h2 className="text-lg font-semibold">
          {isEditing ? "Edit" : "Log"} {formatActivityLabel(activityType)}
        </h2>
        <p className="text-sm text-zinc-500">Mostly tap-based, with optional notes when helpful.</p>
      </div>

      {presets[activityType].length ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {presets[activityType].map((preset) => (
            <button
              key={preset}
              className={`rounded-full px-3 py-2 text-sm font-medium ring-1 transition ${
                detail === preset
                  ? "bg-rose-50 text-rose-600 ring-rose-200"
                  : "bg-white text-zinc-600 ring-zinc-200 hover:bg-zinc-50"
              }`}
              onClick={() => onDetailChange(preset)}
            >
              {preset}
            </button>
          ))}
        </div>
      ) : null}

      <label className="mb-3 block text-sm">
        <span className="mb-1 block font-medium text-zinc-700">Time</span>
        <input
          type="time"
          value={happenedAt}
          onChange={(event) => onHappenedAtChange(event.target.value)}
          className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-rose-300 focus:ring-4 focus:ring-rose-100"
        />
      </label>

      {showOtherField ? (
        <label className="mb-3 block text-sm">
          <span className="mb-1 block font-medium text-zinc-700">Treat detail</span>
          <input
            value={notes}
            onChange={(event) => onNotesChange(event.target.value)}
            placeholder="Enter the treat name"
            className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-rose-300 focus:ring-4 focus:ring-rose-100"
          />
        </label>
      ) : null}

      {showDetailField ? (
        <label className="mb-3 block text-sm">
          <span className="mb-1 block font-medium text-zinc-700">Title</span>
          <input
            value={detail}
            onChange={(event) => onDetailChange(event.target.value)}
            placeholder="What happened?"
            className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-rose-300 focus:ring-4 focus:ring-rose-100"
          />
        </label>
      ) : null}

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-zinc-700">Notes</span>
        <textarea
          value={showOtherField ? "" : notes}
          onChange={(event) => onNotesChange(event.target.value)}
          rows={3}
          placeholder={notesPlaceholders[activityType]}
          className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-rose-300 focus:ring-4 focus:ring-rose-100"
        />
      </label>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={onSave} disabled={saving || ((activityType !== "pee" && activityType !== "other") && !detail) || (activityType === "other" && !detail.trim())} className="rounded-full">
          {saving ? "Saving..." : isEditing ? "Save changes" : "Save details"}
        </Button>
        <Button variant="outline" onClick={onCancel} className="rounded-full">Cancel</Button>
        {onDelete ? (
          <Button variant="outline" onClick={onDelete} className="rounded-full text-rose-600">
            Delete
          </Button>
        ) : null}
      </div>
    </section>
  );
}
