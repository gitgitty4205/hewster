"use client";

import { Button } from "@/components/ui/button";
import type { CareItemTemplate } from "@/lib/care-settings";
import { TEXT_LIMITS, clampText } from "@/lib/text-limits";

type Props = {
  mealName: string;
  actualTime: string;
  onActualTimeChange: (value: string) => void;
  fedNote: string;
  onFedNoteChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onUndo?: () => void;
  saveLabel?: string;
  careItems?: CareItemTemplate[];
  skippedCareItemIds?: string[];
  onToggleCareItem?: (careItemId: string) => void;
};

function careItemId(item: CareItemTemplate) {
  return `${item.kind}-${item.id}`;
}

function toTimeInputValue(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ").toUpperCase();
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

export function MealTimeForm({ mealName, actualTime, onActualTimeChange, fedNote, onFedNoteChange, onSave, onCancel, onUndo, saveLabel = "Save", careItems = [], skippedCareItemIds = [], onToggleCareItem }: Props) {
  return (
    <section className="mb-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Edit {mealName}</h2>
        <p className="text-sm text-zinc-500">Update the logged time, notes, and what was given with {mealName}.</p>
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
            const checked = !skippedCareItemIds.includes(id);

            return (
              <label key={id} className="flex items-start gap-2 text-sm text-zinc-600">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggleCareItem?.(id)}
                  className="mt-1 size-4 accent-[var(--hewie-accent,#64748b)]"
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
          value={fedNote}
          onChange={(event) => onFedNoteChange(clampText(event.target.value, TEXT_LIMITS.note))}
          maxLength={TEXT_LIMITS.note}
          rows={3}
          placeholder={`Notes for ${mealName}`}
          className="w-full resize-none rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-rose-300 focus:ring-4 focus:ring-rose-100"
        />
      </label>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" onClick={onSave} className="rounded-full bg-[var(--hewie-accent,#64748b)] text-[var(--hewie-accent-text,#ffffff)] hover:opacity-90">{saveLabel}</Button>
        <Button type="button" variant="outline" onClick={onCancel} className="rounded-full">Cancel</Button>
        {onUndo ? (
          <Button type="button" variant="outline" onClick={onUndo} className="rounded-full text-rose-600">
            Mark as Not Logged
          </Button>
        ) : null}
      </div>
    </section>
  );
}
