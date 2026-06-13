"use client";

import { Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { BottomNav } from "@/components/bottom-nav";
import { CenteredLoadingIcon } from "@/components/centered-loading-icon";
import { PetNotebookTitle } from "@/components/pet-notebook-title";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth-provider";
import {
  loadAppState,
  persistLocalState,
  saveTemplatesToSupabase,
} from "@/lib/hewster-data";
import {
  MEAL_FOOD_MAX_LENGTH,
  MEAL_NAME_MAX_LENGTH,
  MEAL_NOTE_MAX_LENGTH,
  clampMealFoodText,
  clampMealNameText,
  clampMealNoteText,
  type MealTemplate,
  isInitialMealTemplatePlan,
  normalizeMealTemplate,
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
  const [mealPendingDelete, setMealPendingDelete] = useState<MealTemplate | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saved" | "saving" | "error">("idle");
  const [storageMode, setStorageMode] = useState<"browser" | "supabase">("browser");
  const [mealDataUnavailable, setMealDataUnavailable] = useState(false);
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

        const hasOnlyDefaultLocalFallback = supabaseReady && (state.source === "seed" || (state.source === "local" && isInitialMealTemplatePlan(state.templates)));
        if (hasOnlyDefaultLocalFallback) {
          setTemplates([]);
          setMealDataUnavailable(true);
          setStorageMode("browser");
          return;
        }

        setMealDataUnavailable(false);
        setTemplates(sortMealTemplatesByTime(state.templates.map(normalizeMealTemplate)));
        setStorageMode(state.source === "supabase" ? "supabase" : "browser");
      } catch {
        if (cancelled) return;
        setMealDataUnavailable(true);
        setTemplates([]);
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
    if (mealDataUnavailable) return;

    persistLocalState(templates, undefined, undefined);
    window.dispatchEvent(new CustomEvent("hewster:meal-templates-updated"));
  }, [templates, hydrated, mealDataUnavailable]);

  useEffect(() => {
    if (!hydrated || !initialLoadComplete.current) return;
    if (mealDataUnavailable) return;

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
  }, [templates, hydrated, supabaseReady, mealDataUnavailable]);

  const visibleTemplates = editingDraft?.isNew
    ? [editingDraft.meal, ...templates.filter((meal) => meal.id !== editingDraft.meal.id)]
    : templates;
  const activeCount = templates.filter((meal) => meal.active !== false).length;

  const beginEditingMeal = (meal: MealTemplate) => {
    setEditingDraft({ meal: { ...meal }, isNew: false });
  };

  const updateDraft = (field: keyof MealTemplate, value: string) => {
    setEditingDraft((current) => {
      if (!current) return current;
      const nextValue = field === "name" ? clampMealNameText(value) : field === "food" ? clampMealFoodText(value) : value;
      const clampedValue = field === "notes" ? clampMealNoteText(nextValue) : nextValue;
      return {
        ...current,
        meal: { ...current.meal, [field]: clampedValue },
      };
    });
  };

  const updateDraftActive = (active: boolean) => {
    setEditingDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        meal: { ...current.meal, active },
      };
    });
  };

  const saveEditingMeal = () => {
    if (!editingDraft) return;
    const mealToSave = {
      ...editingDraft.meal,
      name: clampMealNameText(editingDraft.meal.name),
      food: clampMealFoodText(editingDraft.meal.food),
      notes: clampMealNoteText(editingDraft.meal.notes),
      active: editingDraft.meal.active !== false,
    };

    setTemplates((current) => {
      const mealExists = current.some((meal) => meal.id === mealToSave.id);
      const nextTemplates = mealExists
        ? current.map((meal) => (meal.id === mealToSave.id ? mealToSave : meal))
        : [...current, mealToSave];

      return sortMealTemplatesByTime(nextTemplates);
    });
    setEditingDraft(null);
  };

  const cancelEditingMeal = () => {
    setEditingDraft(null);
    setMealPendingDelete(null);
  };

  const deleteEditingMeal = () => {
    if (!editingDraft) return;

    if (!editingDraft.isNew) {
      setMealPendingDelete(editingDraft.meal);
      return;
    }

    setTemplates((current) => current.filter((meal) => meal.id !== editingDraft.meal.id));
    setEditingDraft(null);
  };

  const confirmDeleteMeal = () => {
    if (!mealPendingDelete) return;

    setTemplates((current) => current.filter((meal) => meal.id !== mealPendingDelete.id));
    setEditingDraft(null);
    setMealPendingDelete(null);
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
        active: true,
      },
    });
  };

  if (!hydrated) {
    return (
      <main className="min-h-screen bg-[var(--hewie-bg,#979ca7)] text-zinc-900">
        <CenteredLoadingIcon className="min-h-screen" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--hewie-bg,#979ca7)] text-zinc-900">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-24 pt-6">
        <header className="mb-6">
          <p className="text-sm font-medium text-[var(--hewie-active-text,#6d28d9)]"><PetNotebookTitle /></p>
          <h1 className="mt-1 text-xl font-bold tracking-tight text-[#3b2832]">Meal Plan Settings</h1>
        </header>

        <section className="mb-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[#8a5a35]/75 text-xl text-white ring-1 ring-[#caa57f]">
                <span className="inline-block scale-110 text-[1.9rem] leading-none">🥩</span>
              </span>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold">Saved Meal Plan</h2>
                <p className="text-sm text-zinc-500">Create meal schedules, reminders, and daily logs.</p>
                <p className="text-sm text-zinc-500">{`${templates.length} Saved • ${activeCount} Active`}</p>
              </div>
            </div>
            <div className="text-xs text-zinc-500 sm:text-right">
              <div className="flex items-center gap-1.5 text-emerald-600 sm:justify-end">
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
              <p className="mt-1 max-w-52">
                {storageMode === "supabase"
                  ? "Shared Database Is Active"
                  : supabaseReady
                    ? "Using Browser Fallback Until Supabase Succeeds"
                    : "Persists In This Browser For Now"}
              </p>
            </div>
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            <Button variant="outline" className="rounded-full" disabled={Boolean(editingDraft) || mealDataUnavailable} onClick={addMealTemplate}>
              <Plus className="size-4" />
              Add Meal
            </Button>
          </div>

          {mealDataUnavailable ? (
            <div className="mb-4 rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-800 ring-1 ring-amber-200">
              Saved meal plan could not be loaded. Default sample meals are hidden so they do not replace the real plan.
            </div>
          ) : null}

          <div className="space-y-4">
            {visibleTemplates.map((meal) => {
              const isEditing = editingDraft?.meal.id === meal.id;
              const displayedMeal = isEditing ? editingDraft.meal : meal;
              const mealBlurb = displayedMeal.food.trim()
                ? `Daily at ${displayedMeal.plannedTime} • ${displayedMeal.food.trim()}`
                : `Daily at ${displayedMeal.plannedTime}`;

              return (
                <article key={meal.id} className="rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="break-words font-medium text-zinc-900 [overflow-wrap:anywhere]">{displayedMeal.name || "New Meal"}</h3>
                      <p className="break-words text-sm text-zinc-500 [overflow-wrap:anywhere]">{mealBlurb}</p>
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
                    <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
                      <input
                        type="checkbox"
                        checked={displayedMeal.active !== false}
                        disabled={!isEditing}
                        onChange={(event) => updateDraftActive(event.target.checked)}
                        className="size-4 rounded border-zinc-300"
                      />
                      Active
                    </label>

                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-zinc-700">Meal Name</span>
                      <input
                        value={displayedMeal.name}
                        disabled={!isEditing}
                        maxLength={MEAL_NAME_MAX_LENGTH}
                        onChange={(event) => updateDraft("name", event.target.value)}
                        className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-rose-300 focus:ring-4 focus:ring-rose-100 disabled:bg-zinc-100 disabled:text-zinc-500"
                      />
                      {isEditing ? (
                        <span className="mt-1 block text-xs text-zinc-400">
                          {displayedMeal.name.length}/{MEAL_NAME_MAX_LENGTH} characters
                        </span>
                      ) : null}
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
                        maxLength={MEAL_FOOD_MAX_LENGTH}
                        placeholder="e.g. food name and amount"
                        onChange={(event) => updateDraft("food", event.target.value)}
                        className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-rose-300 focus:ring-4 focus:ring-rose-100 disabled:bg-zinc-100 disabled:text-zinc-500"
                      />
                      {isEditing ? (
                        <span className="mt-1 block text-xs text-zinc-400">
                          {displayedMeal.food.length}/{MEAL_FOOD_MAX_LENGTH} characters
                        </span>
                      ) : null}
                    </label>

                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-zinc-700">Notes</span>
                      <textarea
                        value={displayedMeal.notes}
                        disabled={!isEditing}
                        maxLength={MEAL_NOTE_MAX_LENGTH}
                        placeholder="Optional feeding notes"
                        onChange={(event) => updateDraft("notes", event.target.value)}
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

        {mealPendingDelete ? (
          <div className="fixed inset-0 z-[80] flex items-end bg-zinc-950/35 p-3 backdrop-blur-sm sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-labelledby="delete-meal-title">
            <button type="button" aria-label="Cancel delete meal" className="absolute inset-0 cursor-default" onClick={() => setMealPendingDelete(null)} />
            <div className="relative w-full max-w-md rounded-3xl bg-white p-4 text-zinc-900 shadow-2xl ring-1 ring-zinc-200">
              <div className="mb-4">
                <h2 id="delete-meal-title" className="text-base font-semibold">Delete meal?</h2>
                <p className="mt-1 text-sm leading-6 text-zinc-500">
                  Delete {mealPendingDelete.name || "this meal"} from the saved meal plan?
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" className="rounded-full" onClick={() => setMealPendingDelete(null)}>
                  Cancel
                </Button>
                <Button type="button" className="rounded-full bg-rose-600 text-white hover:bg-rose-700" onClick={confirmDeleteMeal}>
                  Delete
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        <BottomNav />
      </div>
    </main>
  );
}
