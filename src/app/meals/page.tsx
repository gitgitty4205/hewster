"use client";

import { Plus, RotateCcw, Save } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { BottomNav } from "@/components/bottom-nav";
import { Button } from "@/components/ui/button";
import {
  loadAppState,
  persistLocalState,
  saveTemplatesToSupabase,
} from "@/lib/hewster-data";
import {
  type MealTemplate,
  initialTemplates,
} from "@/lib/meal-templates";
import { isSupabaseConfigured } from "@/lib/supabase";

export default function MealsPage() {
  const [templates, setTemplates] = useState<MealTemplate[]>(initialTemplates);
  const [editingMealId, setEditingMealId] = useState<number | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saved" | "saving" | "error">("idle");
  const [storageMode, setStorageMode] = useState<"browser" | "supabase">("browser");
  const [hydrated, setHydrated] = useState(false);
  const initialLoadComplete = useRef(false);
  const supabaseReady = isSupabaseConfigured();

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      try {
        const state = await loadAppState();
        if (cancelled) return;

        setTemplates(state.templates);
        setStorageMode(state.source === "supabase" ? "supabase" : "browser");
      } catch {
        if (cancelled) return;
        setStorageMode("browser");
      } finally {
        if (!cancelled) {
          initialLoadComplete.current = true;
          setHydrated(true);
        }
      }
    }

    hydrate();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated || !initialLoadComplete.current) return;

    persistLocalState(templates, undefined, undefined);
  }, [templates, hydrated]);

  useEffect(() => {
    if (!hydrated || !initialLoadComplete.current) return;

    let cancelled = false;

    async function persistTemplates() {
      setSaveState("saving");

      try {
        if (supabaseReady) {
          await saveTemplatesToSupabase(templates);
          if (!cancelled) {
            setStorageMode("supabase");
          }
        }

        if (!cancelled) {
          setSaveState("saved");
        }
      } catch {
        if (!cancelled) {
          setSaveState("error");
          setStorageMode("browser");
        }
      }
    }

    persistTemplates();

    const timeout = window.setTimeout(() => {
      if (!cancelled) {
        setSaveState("idle");
      }
    }, 1800);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [templates, hydrated, supabaseReady]);

  const updateTemplate = (id: number, field: keyof MealTemplate, value: string) => {
    setTemplates((current) => current.map((meal) => (meal.id === id ? { ...meal, [field]: value } : meal)));
  };

  const addMealTemplate = () => {
    const newMealId = Date.now();

    setTemplates((current) => [
      ...current,
      {
        id: newMealId,
        name: `Meal ${current.length + 1}`,
        plannedTime: "12:00 PM",
        food: "Add meal details",
        notes: "Optional instructions for the caregiver.",
        reminderOffset: "15 min after planned time",
      },
    ]);
  };

  const resetTemplates = () => {
    setTemplates(initialTemplates);
    setEditingMealId(null);
    setSaveState("idle");
  };

  return (
    <main className="min-h-screen bg-[#979ca7] text-zinc-900">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-24 pt-6">
        <header className="mb-6">
          <p className="text-sm font-medium text-violet-500">Hewster</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Meals</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Edit the meal plan defaults that roll into each day.
          </p>
        </header>

        <section className="mb-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Meal Plan Defaults</h2>
              <p className="text-sm text-zinc-500">Your saved data stays the same, this is just the new home for it.</p>
            </div>
            <div className="text-right text-xs text-zinc-500">
              <div className="flex items-center justify-end gap-1.5 text-emerald-600">
                <Save className="size-3.5" />
                {saveState === "saving"
                  ? "Saving..."
                  : saveState === "saved"
                    ? storageMode === "supabase"
                      ? "Saved to Supabase"
                      : "Saved in browser"
                    : saveState === "error"
                      ? "Supabase save failed"
                      : hydrated
                        ? "Ready"
                        : "Loading"}
              </div>
              <p className="mt-1">
                {storageMode === "supabase"
                  ? "Shared database is active"
                  : supabaseReady
                    ? "Using browser fallback until Supabase succeeds"
                    : "Persists in this browser for now"}
              </p>
            </div>
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            <Button variant="outline" className="rounded-full" onClick={addMealTemplate}>
              <Plus className="size-4" />
              Add Meal
            </Button>
            <Button variant="outline" className="rounded-full" onClick={resetTemplates}>
              <RotateCcw className="size-4" />
              Reset Defaults
            </Button>
          </div>

          <div className="space-y-4">
            {templates.map((meal) => {
              const isEditing = editingMealId === meal.id;

              return (
                <article key={meal.id} className="rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-medium text-zinc-900">{meal.name}</h3>
                      <p className="text-sm text-zinc-500">Template used for future daily checklists.</p>
                    </div>
                    <Button
                      variant={isEditing ? "default" : "outline"}
                      className="rounded-full"
                      onClick={() => setEditingMealId(isEditing ? null : meal.id)}
                    >
                      {isEditing ? "Done" : "Edit"}
                    </Button>
                  </div>

                  <div className="space-y-3">
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-zinc-700">Meal name</span>
                      <input
                        value={meal.name}
                        disabled={!isEditing}
                        onChange={(event) => updateTemplate(meal.id, "name", event.target.value)}
                        className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-rose-300 focus:ring-4 focus:ring-rose-100 disabled:bg-zinc-100 disabled:text-zinc-500"
                      />
                    </label>

                    <div className="grid grid-cols-2 gap-3">
                      <label className="block text-sm">
                        <span className="mb-1 block font-medium text-zinc-700">Planned time</span>
                        <input
                          value={meal.plannedTime}
                          disabled={!isEditing}
                          onChange={(event) => updateTemplate(meal.id, "plannedTime", event.target.value)}
                          className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-rose-300 focus:ring-4 focus:ring-rose-100 disabled:bg-zinc-100 disabled:text-zinc-500"
                        />
                      </label>
                      <label className="block text-sm">
                        <span className="mb-1 block font-medium text-zinc-700">Reminder rule</span>
                        <input
                          value={meal.reminderOffset}
                          disabled={!isEditing}
                          onChange={(event) => updateTemplate(meal.id, "reminderOffset", event.target.value)}
                          className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-rose-300 focus:ring-4 focus:ring-rose-100 disabled:bg-zinc-100 disabled:text-zinc-500"
                        />
                      </label>
                    </div>

                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-zinc-700">Food / ingredients</span>
                      <input
                        value={meal.food}
                        disabled={!isEditing}
                        onChange={(event) => updateTemplate(meal.id, "food", event.target.value)}
                        className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-rose-300 focus:ring-4 focus:ring-rose-100 disabled:bg-zinc-100 disabled:text-zinc-500"
                      />
                    </label>

                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-zinc-700">Notes</span>
                      <textarea
                        value={meal.notes}
                        disabled={!isEditing}
                        onChange={(event) => updateTemplate(meal.id, "notes", event.target.value)}
                        rows={3}
                        className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-rose-300 focus:ring-4 focus:ring-rose-100 disabled:bg-zinc-100 disabled:text-zinc-500"
                      />
                    </label>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <BottomNav />
      </div>
    </main>
  );
}
