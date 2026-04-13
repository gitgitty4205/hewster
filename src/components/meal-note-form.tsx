"use client";

import { Button } from "@/components/ui/button";

type Props = {
  mealName: string;
  note: string;
  onNoteChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
};

export function MealNoteForm({ mealName, note, onNoteChange, onSave, onCancel }: Props) {
  return (
    <section className="mb-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Add Meal Note</h2>
        <p className="text-sm text-zinc-500">Add a note for {mealName}.</p>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-zinc-700">Note</span>
        <textarea
          value={note}
          onChange={(event) => onNoteChange(event.target.value)}
          rows={3}
          placeholder="Anything worth remembering about this feeding"
          className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-rose-300 focus:ring-4 focus:ring-rose-100"
        />
      </label>

      <div className="mt-4 flex gap-2">
        <Button type="button" onClick={onSave} className="rounded-full">Save note</Button>
        <Button type="button" variant="outline" onClick={onCancel} className="rounded-full">Cancel</Button>
      </div>
    </section>
  );
}
