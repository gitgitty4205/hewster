"use client";

import { Button } from "@/components/ui/button";
import { TEXT_LIMITS, clampText } from "@/lib/text-limits";

type Props = {
  mealName: string;
  note: string;
  onNoteChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
};

export function MealNoteForm({ note, onNoteChange, onSave, onCancel }: Props) {
  return (
    <section className="rounded-3xl bg-white/72 p-4 shadow-sm ring-1 ring-[#d8b895]/55">
      <label className="block text-sm">
        <span className="mb-2 block font-semibold text-[#4f2f1b]">Add Notes</span>
        <textarea
          value={note}
          onChange={(event) => onNoteChange(clampText(event.target.value, TEXT_LIMITS.note))}
          maxLength={TEXT_LIMITS.note}
          rows={2}
          placeholder="Optional meal instructions"
          className="w-full rounded-2xl border-0 bg-white px-3 py-2.5 text-sm text-[#4f2f1b] shadow-sm outline-none ring-1 ring-[#d8b895]/60 transition placeholder:text-[#6b3f22]/40 focus:ring-4 focus:ring-[var(--hewie-ring)]/45"
        />
      </label>

      <div className="mt-3 flex gap-2">
        <Button type="button" onClick={onSave} className="rounded-full bg-[var(--hewie-accent)] text-[var(--hewie-accent-text)] hover:opacity-90">Save</Button>
        <Button type="button" variant="outline" onClick={onCancel} className="rounded-full border-0 bg-white/80 text-[#6b3f22] shadow-sm ring-1 ring-[#d8b895]/60 hover:bg-white">Cancel</Button>
      </div>
    </section>
  );
}
