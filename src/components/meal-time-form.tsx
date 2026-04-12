"use client";

import { Button } from "@/components/ui/button";

type Props = {
  mealName: string;
  actualTime: string;
  onActualTimeChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onUndo?: () => void;
};

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

export function MealTimeForm({ mealName, actualTime, onActualTimeChange, onSave, onCancel, onUndo }: Props) {
  return (
    <section className="mb-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Edit meal time</h2>
        <p className="text-sm text-zinc-500">Set the correct logged time for {mealName}.</p>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-zinc-700">Actual time</span>
        <input
          type="time"
          value={toTimeInputValue(actualTime)}
          onChange={(event) => onActualTimeChange(fromTimeInputValue(event.target.value))}
          className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-rose-300 focus:ring-4 focus:ring-rose-100"
        />
      </label>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={onSave} className="rounded-full">Save time</Button>
        <Button variant="outline" onClick={onCancel} className="rounded-full">Cancel</Button>
        {onUndo ? (
          <Button variant="outline" onClick={onUndo} className="rounded-full text-rose-600">
            Undo marked fed
          </Button>
        ) : null}
      </div>
    </section>
  );
}
