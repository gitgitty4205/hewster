"use client";

import { Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { BottomNav } from "@/components/bottom-nav";
import { PetNotebookTitle } from "@/components/pet-notebook-title";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth-provider";
import {
  loadAppState,
  persistLocalState,
  saveTemplatesToSupabase,
} from "@/lib/hewster-data";
import {
  type MealTemplate,
  initialTemplates,
  parseMealTemplateTimeToMinutes,
  sortMealTemplatesByTime,
} from "@/lib/meal-templates";
import { isSupabaseConfigured } from "@/lib/supabase";

type MealDraft = {
  meal: MealTemplate;
  isNew: boolean;
};

function mealTimeToInputValue(value: string) {
  const minutes = parseMealTemplateTimeToMinutes(value);
  if (!Number.isFinite(minutes)) return "";

  const hours = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function inputValueToMealTime(value: string) {
  const [hoursValue, minutesValue] = value.split(":");
  const hours = Number(hoursValue);
  const minutes = Number(minutesValue);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return value;

  const meridiem = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${String(minutes).padStart(2, "0")} ${meridiem}`;
}

export default function MealsPage() {
  const { loading: authLoading } = useAuth();
  const [templates, setTemplates] = useState<MealTemplate[]>([]);
  const [editingDraft, setEditingDraft] = useState<MealDraft | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saved" | "saving" | "error">("idle");
  const [storageMode, setStorageMode] = useState<"browser" | "supabase">("browser");
  const [hydrated, setHydrated] = useState(false);
  const initialLoadComplete = useRef(false);
  const supabaseReady = isSupabaseConfigured();

  useEffect(() => {
    if (supabaseReady && authLoading) return;

    let cancelled = false;

    async function hydrate() {
      try {
        const state = await loadAppState();
        if (cancelled) return;

        setTemplates(sortMealTemplatesByTime(state.templates));
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
  }, [authLoading, supabaseReady]);

  useEffect(() => {
    if (!hydrated || !initialLoadComplete.current) return;

    persistLocalState(templates, undefined, undefined);
    window.dispatchEvent(new CustomEvent("hewster:meal-templates-updated"));
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

  const visibleTemplates = editingDraft?.isNew
    ? sortMealTemplatesByTime([...templates, editingDraft.meal])
    : templates;

  const beginEditingMeal = (meal: MealTemplate) => {
    setEditingDraft({ meal: { ...meal }, isNew: false });
  };

  const updateDraft = (field: keyof MealTemplate, value: string) => {
    setEditingDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        meal: { ...current.meal, [field]: value },
      };
    });
  };

  const saveEditingMeal = () => {
    if (!editingDraft) return;

    setTemplates((current) => {
      const mealExists = current.some((meal) => meal.id === editingDraft.meal.id);
      const nextTemplates = mealExists
        ? current.map((meal) => (meal.id === editingDraft.meal.id ? editingDraft.meal : meal))
        : [...current, editingDraft.meal];

      return sortMealTemplatesByTime(nextTemplates);
    });
    setEditingDraft(null);
  };

  const cancelEditingMeal = () => {
    setEditingDraft(null);
  };

  const deleteEditingMeal = () => {
    if (!editingDraft) return;

    if (!editingDraft.isNew) {
      const confirmed = window.confirm(`Delete ${editingDraft.meal.name || "this meal"} from the saved meal plan?`);
      if (!confirmed) return;
    }

    setTemplates((current) => current.filter((meal) => meal.id !== editingDraft.meal.id));
    setEditingDraft(null);
  };

  const addMealTemplate = () => {
    const newMealId = Date.now();

    setEditingDraft({
      isNew: true,
      meal: {
        id: newMealId,
        name: `Meal ${templates.length + 1}`,
        plannedTime: "12:00 PM",
        food: "",
        notes: "",
      },
    });
  };

  const resetTemplates = () => {
    setTemplates(sortMealTemplatesByTime(initialTemplates));
    setEditingDraft(null);
    setSaveState("idle");
  };

  if (!hydrated) {
    return (
      <main className="min-h-screen bg-[var(--hewie-bg,#979ca7)] text-zinc-900">
        <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-24 pt-6">
          <header className="mb-6">
            <p className="text-sm font-medium text-[var(--hewie-active-text,#6d28d9)]"><PetNotebookTitle /></p>
            <div className="skeleton-pulse mt-1 h-7 w-24 rounded-xl bg-white/45" />
            <div className="skeleton-pulse mt-2 h-4 w-64 rounded-xl bg-white/35" />
          </header>

          <section className="mb-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="skeleton-pulse h-6 w-36 rounded-xl bg-zinc-100" />
                <div className="skeleton-pulse mt-2 h-4 w-56 rounded-xl bg-zinc-100" />
              </div>
              <div className="skeleton-pulse h-5 w-20 rounded-xl bg-zinc-100" />
            </div>
            <div className="mb-4 flex gap-2">
              <div className="skeleton-pulse h-10 w-28 rounded-full bg-zinc-100" />
              <div className="skeleton-pulse h-10 w-36 rounded-full bg-zinc-100" />
            </div>
            <div className="space-y-4">
              <div className="skeleton-pulse h-48 rounded-2xl bg-zinc-100" />
              <div className="skeleton-pulse h-48 rounded-2xl bg-zinc-100" />
              <div className="skeleton-pulse h-48 rounded-2xl bg-zinc-100" />
            </div>
          </section>

          <BottomNav />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--hewie-bg,#979ca7)] text-zinc-900">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-24 pt-6">
        <header className="mb-6">
          <p className="text-sm font-medium text-[var(--hewie-active-text,#6d28d9)]"><PetNotebookTitle /></p>
          <h1 className="mt-1 text-xl font-bold tracking-tight text-zinc-700">Meals</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Edit The Saved Meal Plan That Rolls Into Each Day.
          </p>
        </header>

        <section className="mb-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Saved Meal Plan</h2>
              <p className="text-sm text-zinc-500">Your Saved Data Stays The Same, This Is Just The New Home For It.</p>
            </div>
            <div className="text-right text-xs text-zinc-500">
              <div className="flex items-center justify-end gap-1.5 text-emerald-600">
                <Save className="size-3.5" />
                {saveState === "saving"
                  ? "Saving..."
                  : saveState === "saved"
                    ? storageMode === "supabase"
                      ? "Saved to Supabase"
                      : "Saved In Browser"
                    : saveState === "error"
                      ? "Supabase Save Failed"
                      : hydrated
                        ? "Ready"
                        : "Loading"}
              </div>
              <p className="mt-1">
                {storageMode === "supabase"
                  ? "Shared Database Is Active"
                  : supabaseReady
                    ? "Using Browser Fallback Until Supabase Succeeds"
                    : "Persists In This Browser For Now"}
              </p>
            </div>
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            <Button variant="outline" className="rounded-full" disabled={Boolean(editingDraft)} onClick={addMealTemplate}>
              <Plus className="size-4" />
              Add Meal
            </Button>
            <Button variant="outline" className="rounded-full" disabled={Boolean(editingDraft)} onClick={resetTemplates}>
              <RotateCcw className="size-4" />
              Reset Meal Plan
            </Button>
          </div>

          <div className="space-y-4">
            {visibleTemplates.map((meal) => {
              const isEditing = editingDraft?.meal.id === meal.id;
              const displayedMeal = isEditing ? editingDraft.meal : meal;

              return (
                <article key={meal.id} className="rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-medium text-zinc-900">{displayedMeal.name || "New Meal"}</h3>
                      <p className="text-sm text-zinc-500">Template Used For Future Daily Checklists.</p>
                    </div>
                    {isEditing ? null : (
                      <Button
                        variant="outline"
                        className="rounded-full"
                        disabled={Boolean(editingDraft)}
                        onClick={() => beginEditingMeal(meal)}
                      >
                        Edit
                      </Button>
                    )}
                  </div>

                  <div className="space-y-3">
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-zinc-700">Meal Name</span>
                      <input
                        value={displayedMeal.name}
                        disabled={!isEditing}
                        onChange={(event) => updateDraft("name", event.target.value)}
                        className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-rose-300 focus:ring-4 focus:ring-rose-100 disabled:bg-zinc-100 disabled:text-zinc-500"
                      />
                    </label>

                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-zinc-700">Planned Time</span>
                      <input
                        type="time"
                        value={mealTimeToInputValue(displayedMeal.plannedTime)}
                        disabled={!isEditing}
                        onChange={(event) => updateDraft("plannedTime", inputValueToMealTime(event.target.value))}
                        className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-rose-300 focus:ring-4 focus:ring-rose-100 disabled:bg-zinc-100 disabled:text-zinc-500"
                      />
                    </label>

                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-zinc-700">Food / Ingredients</span>
                      <input
                        value={displayedMeal.food}
                        disabled={!isEditing}
                        onChange={(event) => updateDraft("food", event.target.value)}
                        className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-rose-300 focus:ring-4 focus:ring-rose-100 disabled:bg-zinc-100 disabled:text-zinc-500"
                      />
                    </label>

                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-zinc-700">Notes</span>
                      <textarea
                        value={displayedMeal.notes}
                        disabled={!isEditing}
                        maxLength={100}
                        onChange={(event) => updateDraft("notes", event.target.value.slice(0, 100))}
                        rows={2}
                        className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-rose-300 focus:ring-4 focus:ring-rose-100 disabled:bg-zinc-100 disabled:text-zinc-500"
                      />
                    </label>
                  </div>

                  {isEditing ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button type="button" className="rounded-full bg-[var(--hewie-accent,#64748b)] text-[var(--hewie-accent-text,#ffffff)] hover:opacity-90" onClick={saveEditingMeal}>
                        Save
                      </Button>
                      <Button type="button" variant="outline" className="rounded-full" onClick={cancelEditingMeal}>
                        Cancel
                      </Button>
                      {editingDraft?.isNew ? null : (
                        <Button type="button" variant="outline" className="rounded-full text-rose-600" onClick={deleteEditingMeal}>
                          <Trash2 className="size-4" />
                          Delete
                        </Button>
                      )}
                    </div>
                  ) : null}
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
