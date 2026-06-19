"use client";

import { Button } from "@/components/ui/button";
import type { CareItemTemplate } from "@/lib/care-settings";
import { TEXT_LIMITS, clampText } from "@/lib/text-limits";

type Props = {
  mealName: string;
  actualTime: string;
  onActualTimeChange: (value: string) => void;
  mealStatus: "Fed" | "Skipped";
  onMealStatusChange: (value: "Fed" | "Skipped") => void;
  fedNote: string;
  onFedNoteChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onUndo?: () => void;
  undoLabel?: string;
  saveLabel?: string;
  careItems?: CareItemTemplate[];
  skippedCareItemIds?: string[];
  onToggleCareItem?: (careItemId: string) => void;
  onSkippedCareItemIdsChange?: (careItemIds: string[]) => void;
};

function careItemId(item: CareItemTemplate) {
  return `${item.kind}-${item.id}`;
}

function toTimeInputValue(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ").toUpperCase();
  const twentyFourHourParts = normalized.match(/^(\d{1,2}):(\d{2})$/);
  if (twentyFourHourParts) {
    const hours = Number(twentyFourHourParts[1]);
    const minutes = Number(twentyFourHourParts[2]);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    }
  }

  const parts = normalized.match(/^(\d{1,2})(?::(\d{2}))?\s?(AM|PM)$/i);
  if (!parts) return "";

  let hours = Number(parts[1]);
  const minutes = Number(parts[2] ?? "0");
  const meridiem = parts[3].toUpperCase();

  if (meridiem === "PM" && hours !== 12) hours += 12;
  if (meridiem === "AM" && hours === 12) hours = 0;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function fromTimeInputValue(value: string) {
  const [rawHours, rawMinutes] = value.split(":").map(Number);
  if (!Number.isFinite(rawHours) || !Number.isFinite(rawMinutes)) return "";

  const suffix = rawHours >= 12 ? "PM" : "AM";
  const hours = rawHours % 12 === 0 ? 12 : rawHours % 12;
  return `${hours}:${String(rawMinutes).padStart(2, "0")} ${suffix}`;
}

export function MealTimeForm({ mealName, actualTime, onActualTimeChange, mealStatus, onMealStatusChange, fedNote, onFedNoteChange, onSave, onCancel, onUndo, undoLabel = "Undo Log", saveLabel = "Save", careItems = [], skippedCareItemIds = [], onToggleCareItem, onSkippedCareItemIdsChange }: Props) {
  const statusOptions = ["Fed", "Skipped"] as const;
  const visibleFedNote = fedNote.trim() ? fedNote : "";
  const setMealStatus = (status: "Fed" | "Skipped") => {
    onMealStatusChange(status);
    onSkippedCareItemIdsChange?.(status === "Skipped" ? careItems.map(careItemId) : []);
  };

  return (
    <section className="mb-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-zinc-900">Edit {mealName}</h2>
      </div>

      <div className="mb-4">
        <p className="mb-1 text-sm font-medium text-zinc-700">Status</p>
        <div className="flex flex-wrap gap-2">
          {statusOptions.map((status) => {
            const selected = mealStatus === status;
            return (
              <button
                key={status}
                type="button"
                onClick={() => setMealStatus(status)}
                className={`rounded-full px-4 py-2 text-sm font-semibold shadow-sm transition ${
                  selected
                    ? "bg-[var(--hewie-accent)] text-[var(--hewie-accent-text)] ring-2 ring-[var(--hewie-accent)]"
                    : "bg-white text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-50"
                }`}
              >
                {status}
              </button>
            );
          })}
        </div>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-zinc-700">Actual Time</span>
        <input
          type="time"
          value={toTimeInputValue(actualTime)}
          onChange={(event) => onActualTimeChange(fromTimeInputValue(event.target.value))}
          className="hewie-input-bubble hewie-time-input"
        />
      </label>

      {careItems.length ? (
        <div className="mt-4 space-y-2 rounded-2xl bg-white/70 p-3 ring-1 ring-zinc-200">
          <p className="text-sm font-semibold text-zinc-700">Given With Meal</p>
          {careItems.map((item) => {
            const id = careItemId(item);
            const checked = mealStatus !== "Skipped" && !skippedCareItemIds.includes(id);

            return (
              <label key={id} className={`flex items-start gap-2 text-sm ${mealStatus === "Skipped" ? "text-zinc-400" : "text-zinc-600"}`}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={mealStatus === "Skipped"}
                  onChange={() => onToggleCareItem?.(id)}
                  className="mt-1 size-4 accent-[var(--hewie-accent)]"
                />
                <span>
                  <span className="font-semibold text-zinc-800">{item.name}</span>
                  {item.dose ? <span> — {item.dose}</span> : null}
                </span>
              </label>
            );
          })}
        </div>
      ) : null}

      <label className="mt-4 block text-sm">
        <span className="mb-1 block font-medium text-zinc-700">Notes</span>
        <textarea
          value={visibleFedNote}
          onChange={(event) => onFedNoteChange(clampText(event.target.value, TEXT_LIMITS.note))}
          maxLength={TEXT_LIMITS.note}
          rows={2}
          placeholder="Optional meal instructions"
          className="w-full resize-none rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition placeholder:text-zinc-400 focus:border-rose-300 focus:ring-4 focus:ring-rose-100"
        />
      </label>

      <div className={`mt-4 flex gap-2 ${onUndo ? "flex-nowrap justify-center" : "flex-wrap"}`}>
        <Button type="button" onClick={onSave} className="rounded-full bg-[var(--hewie-accent)] px-3 py-2 text-sm font-semibold text-[var(--hewie-accent-text)] shadow-sm hover:opacity-90">
          {saveLabel}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} className="rounded-full border-zinc-200 bg-white px-3 py-2 text-sm font-semibold !text-zinc-700 shadow-sm hover:bg-zinc-50">
          Cancel
        </Button>
        {onUndo ? (
          <Button type="button" variant="outline" onClick={onUndo} className="rounded-full border-rose-100 bg-white px-3 py-2 text-sm font-semibold !text-rose-600 shadow-sm hover:bg-rose-50">
            {undoLabel}
          </Button>
        ) : null}
      </div>
    </section>
  );
}
