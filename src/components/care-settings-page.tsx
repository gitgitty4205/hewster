"use client";

import { CircleHelp, Plus, Save, Trash2 } from "lucide-react";
import type { ComponentType } from "react";
import { PetAvatarMenu } from "@/components/pet-avatar-menu";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { BottomNav } from "@/components/bottom-nav";
import { Button } from "@/components/ui/button";
import { deleteCareItemActivityLogsFromSupabase, loadAppState, removeCareItemReferencesLocally } from "@/lib/hewster-data";
import type { MealTemplate } from "@/lib/meal-templates";
import { PetNotebookTitle } from "@/components/pet-notebook-title";
import {
  type CareItemKind,
  type CareItemTemplate,
  initialCareTemplatesForKind,
  loadCareTemplates,
  loadCareTemplatesFromSupabase,
  saveCareTemplates,
  saveCareTemplatesToSupabase,
} from "@/lib/care-settings";
import { isSupabaseConfigured } from "@/lib/supabase";
import { TEXT_LIMITS, clampText } from "@/lib/text-limits";

const HEWSTER_BRIDGE_SOURCE = "https://lindy.b-average.com";
const MAX_SUPPLEMENTS_PER_MEAL_PLAN_TILE = 4;

type BridgeCarePayload = {
  supplementSettings?: CareItemTemplate[];
  medicationSettings?: CareItemTemplate[];
};

type Props = {
  kind: CareItemKind;
  title: string;
  description: string;
  emptyLabel: string;
  icon: ComponentType<{ className?: string }>;
  accentClassName: string;
  iconClassName: string;
};

function currentDateTimeInputValue() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function defaultTemplate(kind: CareItemKind, count: number): CareItemTemplate {
  return {
    id: Date.now(),
    kind,
    name: kind === "supplement" ? `Supplement ${count + 1}` : `Medication ${count + 1}`,
    dose: "",
    scheduleKind: kind === "medication" ? "custom" : "meal",
    mealIds: [],
    customTiming: "with-food",
    medicationType: "oral",
    customScheduleMode: "one",
    startDateTime: kind === "medication" ? currentDateTimeInputValue() : "",
    customScheduleCreatedAt: "",
    repeatEveryHours: "",
    repeatForDays: "",
    mealPlanDoseCount: "",
    scheduleSteps: [{ id: Date.now() + 1, everyHours: "", forDays: "" }],
    ongoing: false,
    asNeeded: false,
    notes: "",
    active: true,
  };
}

function summarizeSchedule(item: CareItemTemplate, meals: MealTemplate[]) {
  if (item.scheduleKind === "custom") {
    const timing = item.customTiming === "empty-stomach" ? "Empty stomach" : "With food";
    const validSteps = item.scheduleSteps.filter((step) => step.everyHours && (step.forDays || item.ongoing || item.asNeeded));
    const schedule = validSteps.length > 1
      ? `${validSteps.length} schedules${item.ongoing ? " • Ongoing" : item.asNeeded ? " • As needed" : ""}`
      : validSteps[0]
        ? [`Every ${validSteps[0].everyHours} hours`, item.ongoing ? "Ongoing" : item.asNeeded ? "As needed" : `${validSteps[0].forDays} days`].join(" • ")
        : item.ongoing
          ? ""
        : "Schedule needed";
    return [schedule, timing].filter(Boolean).join(" • ");
  }

  const mealNames = meals.filter((meal) => item.mealIds.includes(meal.id)).map((meal) => meal.name);
  const mealSummary = mealNames.length ? mealNames.join(" • ") : "No meal selected";
  return mealSummary;
}

function normalizeMedicationSchedule(item: CareItemTemplate) {
  if (item.kind === "medication" && item.scheduleKind === "meal") {
    return {
        ...item,
        scheduleKind: "custom" as const,
        mealIds: [],
        customTiming: "with-food" as const,
        startDateTime: item.startDateTime || currentDateTimeInputValue(),
        customScheduleCreatedAt: item.customScheduleCreatedAt || item.startDateTime || new Date().toISOString(),
      };
  }

  if (item.kind === "supplement" && item.scheduleKind === "meal") {
    return {
      ...item,
      startDateTime: "",
      customScheduleCreatedAt: "",
      repeatEveryHours: "",
      repeatForDays: "",
      mealPlanDoseCount: "",
      scheduleSteps: [{ id: item.scheduleSteps[0]?.id ?? Date.now(), everyHours: "", forDays: "" }],
      ongoing: false,
      asNeeded: false,
    };
  }

  return item;
}

export function CareSettingsPage({
  kind,
  title,
  description,
  emptyLabel,
  icon: Icon,
  accentClassName,
  iconClassName,
}: Props) {
  const { loading: authLoading } = useAuth();
  const [items, setItems] = useState<CareItemTemplate[]>(() => initialCareTemplatesForKind(kind));
  const [meals, setMeals] = useState<MealTemplate[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draftItems, setDraftItems] = useState<Record<number, CareItemTemplate>>({});
  const [saveState, setSaveState] = useState<"idle" | "saved" | "saving">("idle");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (window.location.hostname !== "www.petnotebook.com" && window.location.hostname !== "petnotebook.com") return;

    const iframe = document.createElement("iframe");
    iframe.src = `${HEWSTER_BRIDGE_SOURCE}/hewie?hewsterBridge=1`;
    iframe.title = "PetNoteBook care settings bridge";
    iframe.style.display = "none";

    const handleBridgeResponse = (event: MessageEvent) => {
      if (event.origin !== HEWSTER_BRIDGE_SOURCE || event.data?.type !== "hewster:local-state") return;

      const payload = event.data.payload as BridgeCarePayload;
      const incomingItems = kind === "supplement" ? payload.supplementSettings : payload.medicationSettings;
      if (!Array.isArray(incomingItems) || !incomingItems.length) return;

      const existingItems = loadCareTemplates(kind);
      const incomingHasRealSupplement = incomingItems.some((item) => item.kind === "supplement" && item.name.trim().toLowerCase() !== "daily supplements");
      const existingOnlyPlaceholder = existingItems.every((item) => item.kind !== "supplement" || item.name.trim().toLowerCase() === "daily supplements");
      const merged = new Map<number, CareItemTemplate>();
      existingItems.forEach((item) => merged.set(item.id, item));
      incomingItems.forEach((item) => merged.set(item.id, item));
      const nextItems = incomingHasRealSupplement && existingOnlyPlaceholder ? incomingItems : [...merged.values()];

      if (nextItems.length < existingItems.length) return;

      saveCareTemplates(kind, nextItems);
      setItems(nextItems);
      void saveCareTemplatesToSupabase(kind, nextItems).catch(() => undefined);
    };

    iframe.addEventListener("load", () => {
      iframe.contentWindow?.postMessage({ type: "hewster:export-local-state" }, HEWSTER_BRIDGE_SOURCE);
    });
    window.addEventListener("message", handleBridgeResponse);
    document.body.appendChild(iframe);

    return () => {
      window.removeEventListener("message", handleBridgeResponse);
      iframe.remove();
    };
  }, [kind]);

  useEffect(() => {
    if (isSupabaseConfigured() && authLoading) return;

    let cancelled = false;

    async function hydrate() {
      const state = await loadAppState();
      if (cancelled) return;
      setMeals(state.templates);
      const currentItems = await loadCareTemplatesFromSupabase(kind);
      if (cancelled) return;
      setItems(currentItems);
      setDraftItems({});
      setEditingId(null);
      setHydrated(true);
    }

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, [authLoading, kind]);

  const isHydrating = !hydrated || (isSupabaseConfigured() && authLoading);
  const activeCount = useMemo(() => items.filter((item) => item.active).length, [items]);

  const commitItems = (nextItems: CareItemTemplate[]) => {
    const normalizedItems = nextItems.map(normalizeMedicationSchedule);
    const deletedItems = items.filter(
      (currentItem) => !normalizedItems.some((nextItem) => nextItem.kind === currentItem.kind && nextItem.id === currentItem.id)
    );
    setItems(normalizedItems);
    saveCareTemplates(kind, normalizedItems);
    removeCareItemReferencesLocally(kind, deletedItems);
    setSaveState("saving");
    saveCareTemplatesToSupabase(kind, normalizedItems)
      .then(() => deleteCareItemActivityLogsFromSupabase(kind, deletedItems))
      .then(() => setSaveState("saved"))
      .catch(() => setSaveState("saved"));
    window.setTimeout(() => setSaveState("idle"), 1600);
  };

  const updateItem = (id: number, next: Partial<CareItemTemplate>) => {
    if (editingId === id) {
      setDraftItems((current) => {
        const baseItem = current[id] ?? items.find((item) => item.id === id);
        return baseItem ? { ...current, [id]: { ...baseItem, ...next } } : current;
      });
      return;
    }

    commitItems(items.map((item) => (item.id === id ? { ...item, ...next } : item)));
  };

  const startEditing = (item: CareItemTemplate) => {
    setDraftItems({
      [item.id]: {
        ...item,
        mealIds: [...item.mealIds],
        scheduleSteps: item.scheduleSteps.map((step) => ({ ...step })),
      },
    });
    setEditingId(item.id);
  };

  const cancelEditing = (id: number) => {
    setDraftItems((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setEditingId(null);
  };

  const saveEditing = (id: number) => {
    const draft = draftItems[id];
    if (!draft) {
      setEditingId(null);
      return;
    }

    const nextItems = items.map((item) => (item.id === id ? draft : item));
    commitItems(nextItems);
    cancelEditing(id);
  };

  const mealSupplementCount = (mealId: number, candidate?: CareItemTemplate) => {
    return items.reduce((count, savedItem) => {
      const item = candidate && savedItem.id === candidate.id ? candidate : draftItems[savedItem.id] ?? savedItem;
      if (item.kind !== "supplement" || item.scheduleKind !== "meal" || !item.active) return count;
      return item.mealIds.includes(mealId) ? count + 1 : count;
    }, 0);
  };

  const toggleMeal = (item: CareItemTemplate, mealId: number) => {
    if (
      item.kind === "supplement" &&
      item.scheduleKind === "meal" &&
      item.active &&
      !item.mealIds.includes(mealId) &&
      mealSupplementCount(mealId, { ...item, mealIds: [...item.mealIds, mealId] }) > MAX_SUPPLEMENTS_PER_MEAL_PLAN_TILE
    ) {
      return;
    }

    const mealIds = item.mealIds.includes(mealId)
      ? item.mealIds.filter((id) => id !== mealId)
      : [...item.mealIds, mealId];
    updateItem(item.id, { mealIds });
  };

  const addScheduleStep = (item: CareItemTemplate) => {
    updateItem(item.id, {
      scheduleSteps: [...item.scheduleSteps, { id: Date.now(), everyHours: "", forDays: "" }],
    });
  };

  const updateScheduleStep = (item: CareItemTemplate, stepId: number, next: Partial<CareItemTemplate["scheduleSteps"][number]>) => {
    updateItem(item.id, {
      scheduleSteps: item.scheduleSteps.map((step) => (step.id === stepId ? { ...step, ...next } : step)),
    });
  };

  const deleteScheduleStep = (item: CareItemTemplate, stepId: number) => {
    updateItem(item.id, {
      scheduleSteps: item.scheduleSteps.filter((step) => step.id !== stepId),
    });
  };

  const addItem = () => {
    const item = defaultTemplate(kind, items.length);
    commitItems([...items, item]);
    setEditingId(item.id);
  };

  const deleteItem = (id: number) => {
    const item = items.find((candidate) => candidate.id === id);
    const itemName = item?.name.trim() || `this saved ${kind}`;
    const confirmed = window.confirm(`Delete ${itemName}? This will remove it from saved ${kind} settings.`);
    if (!confirmed) return;

    commitItems(items.filter((item) => item.id !== id));
    setDraftItems((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setEditingId((current) => (current === id ? null : current));
  };

  return (
    <main className="min-h-screen bg-[var(--hewie-bg,#979ca7)] text-zinc-900">
      <div className="content-fade-in mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-24 pt-6">
        <header className="mb-6">
          <div className="flex min-h-[4.5rem] items-center justify-between gap-3">
            <div>
              <PetNotebookTitle href="/hewie" className="text-sm font-bold text-[var(--hewie-active-text,#6d28d9)]" />
              <h1 className="mt-1 text-xl font-bold tracking-tight text-[#3b2832]">{title}</h1>
            </div>
            <PetAvatarMenu shape="tile" />
          </div>
        </header>

        <section className="mb-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className={`flex size-12 shrink-0 items-center justify-center rounded-full ring-1 ${iconClassName}`}>
                <Icon className={kind === "supplement" ? "size-7" : "size-6"} />
              </span>
              <div>
                <h2 className="text-lg font-semibold">{kind === "supplement" ? "Saved Supplements" : "Saved Medications"}</h2>
                <p className="mt-1 text-sm leading-5 text-zinc-500">{description}</p>
                {kind === "supplement" ? (
                  <p className="text-sm text-zinc-500">
                    {isHydrating ? "Loading saved items..." : `${items.length} Saved • ${activeCount} Active`}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="text-right text-xs text-zinc-500">
              <div className="flex items-center justify-end gap-1.5 text-emerald-600">
                <Save className="size-3.5" />
                {isHydrating ? "Loading..." : saveState === "saving" ? "Saving..." : saveState === "saved" ? "Saved" : "Ready"}
              </div>
            </div>
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            <Button variant="outline" className="rounded-full" onClick={addItem} disabled={isHydrating}>
              <Plus className="size-4" />
              Add {kind === "supplement" ? "Supplement" : "Medication"}
            </Button>
          </div>

          <div className="space-y-4">
            {isHydrating ? (
              <div className={`rounded-2xl p-4 text-sm ring-1 ${accentClassName}`}>Loading saved {kind === "supplement" ? "supplements" : "medications"}...</div>
            ) : items.length === 0 ? (
              <div className={`rounded-2xl p-4 text-sm ring-1 ${accentClassName}`}>{emptyLabel}</div>
            ) : null}

            {items.map((savedItem) => {
              const isEditing = editingId === savedItem.id;
              const item = isEditing ? draftItems[savedItem.id] ?? savedItem : savedItem;

              return (
                <article key={item.id} className="rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-medium text-zinc-900">{item.name || "Untitled"}</h3>
                      <p className="mt-1 break-words text-sm text-zinc-500 [overflow-wrap:anywhere]">{item.dose || "No Dose"} • {summarizeSchedule(item, meals)}</p>
                    </div>
                    {isEditing ? null : (
                      <Button variant="outline" className="rounded-full" onClick={() => startEditing(item)}>
                        Edit
                      </Button>
                    )}
                  </div>

                  <div className="space-y-3">
                    <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
                      <input
                        type="checkbox"
                        checked={item.active}
                        disabled={!isEditing}
                        onChange={(event) => updateItem(item.id, { active: event.target.checked })}
                        className="size-4 rounded border-zinc-300"
                      />
                      Active
                    </label>

                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-zinc-700">Name</span>
                      <input
                        value={item.name}
                        disabled={!isEditing}
                        onChange={(event) => updateItem(item.id, { name: clampText(event.target.value, TEXT_LIMITS.shortName) })}
                        maxLength={TEXT_LIMITS.shortName}
                        className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--hewie-ring,#cbd5e1)] focus:ring-4 focus:ring-zinc-100 disabled:bg-zinc-100 disabled:text-zinc-500"
                      />
                    </label>

                    <div className={`grid gap-2 text-sm ${item.scheduleKind === "custom" ? "grid-cols-[6.25rem_minmax(0,1fr)]" : "grid-cols-1"}`}>
                      <label className="block min-w-0">
                        <span className="mb-1 block font-medium text-zinc-700">Schedule Type</span>
                        <select
                          value={kind === "medication" ? "custom" : item.scheduleKind}
                          disabled={!isEditing || kind === "medication"}
                          onChange={(event) => {
                            const scheduleKind = event.target.value as CareItemTemplate["scheduleKind"];
                            const isMealPlanSupplement = kind === "supplement" && scheduleKind === "meal";
                            const nextItem = {
                              ...item,
                              scheduleKind,
                              customTiming: scheduleKind === "meal" ? "with-food" : item.customTiming,
                              startDateTime: isMealPlanSupplement ? "" : kind === "medication" && !item.startDateTime ? currentDateTimeInputValue() : item.startDateTime,
                              customScheduleCreatedAt: isMealPlanSupplement ? "" : scheduleKind === "custom" && !item.customScheduleCreatedAt ? new Date().toISOString() : item.customScheduleCreatedAt,
                              repeatEveryHours: isMealPlanSupplement ? "" : item.repeatEveryHours,
                              repeatForDays: isMealPlanSupplement ? "" : item.repeatForDays,
                              mealPlanDoseCount: isMealPlanSupplement ? "" : item.mealPlanDoseCount,
                              scheduleSteps: isMealPlanSupplement ? [{ id: item.scheduleSteps[0]?.id ?? Date.now(), everyHours: "", forDays: "" }] : item.scheduleSteps,
                              ongoing: isMealPlanSupplement ? false : item.ongoing,
                              asNeeded: isMealPlanSupplement ? false : item.asNeeded,
                            };
                            updateItem(item.id, {
                              scheduleKind,
                              customTiming: nextItem.customTiming,
                              startDateTime: nextItem.startDateTime,
                              customScheduleCreatedAt: nextItem.customScheduleCreatedAt,
                              repeatEveryHours: nextItem.repeatEveryHours,
                              repeatForDays: nextItem.repeatForDays,
                              mealPlanDoseCount: nextItem.mealPlanDoseCount,
                              scheduleSteps: nextItem.scheduleSteps,
                              ongoing: nextItem.ongoing,
                              asNeeded: nextItem.asNeeded,
                            });
                          }}
                          className="w-full rounded-2xl border border-zinc-200 bg-white px-2 py-2.5 text-sm outline-none transition focus:border-[var(--hewie-ring,#cbd5e1)] focus:ring-4 focus:ring-zinc-100 disabled:bg-zinc-100 disabled:text-zinc-500"
                        >
                          {kind === "supplement" ? <option value="meal">Meal Plan</option> : null}
                          <option value="custom">Custom</option>
                        </select>
                      </label>

                      {item.scheduleKind === "custom" ? (
                        <label className="block min-w-0">
                          <span className="mb-1 block font-medium text-zinc-700">Start Date & Time</span>
                          <input
                            type="datetime-local"
                            value={item.startDateTime}
                            disabled={!isEditing}
                            onChange={(event) => updateItem(item.id, { startDateTime: event.target.value })}
                            className="w-full min-w-0 rounded-2xl border border-zinc-200 bg-white px-1.5 py-2.5 text-[13px] outline-none transition focus:border-[var(--hewie-ring,#cbd5e1)] focus:ring-4 focus:ring-zinc-100 disabled:bg-zinc-100 disabled:text-zinc-500"
                          />
                        </label>
                      ) : null}

                    </div>

                    {item.scheduleKind === "meal" ? (
                      <div className="text-sm">
                        <div className="mb-2 flex items-center gap-0 font-medium text-zinc-700">
                          <span>Give with meals</span>
                          {kind === "supplement" ? (
                            <button
                              type="button"
                              aria-label="Meal Plan supplements are ongoing with the selected meals until you turn Active off. Up to 4 supplements can show with each meal."
                              className="group relative ml-0.5 inline-flex size-5 items-center justify-center rounded-full bg-[var(--hewie-active-bg,#f1f5f9)] text-[var(--hewie-active-text,#334155)] transition hover:bg-[var(--hewie-ring,#cbd5e1)] hover:text-[var(--hewie-active-text,#334155)] focus:outline-none focus:ring-2 focus:ring-[var(--hewie-ring,#cbd5e1)]"
                            >
                              <CircleHelp className="h-3.5 w-3.5" strokeWidth={2.4} />
                              <span className="pointer-events-none absolute left-1/2 top-6 z-20 hidden w-64 -translate-x-1/2 rounded-2xl bg-zinc-900 px-3 py-2 text-left text-xs font-medium leading-5 text-white shadow-lg group-hover:block group-focus:block">
                                Meal Plan supplements are ongoing with the selected meals until you turn Active off. Up to 4 supplements can show with each meal.
                              </span>
                            </button>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {meals.map((meal) => {
                            const mealSelected = item.mealIds.includes(meal.id);
                            const mealAtSupplementLimit = kind === "supplement" &&
                              item.scheduleKind === "meal" &&
                              item.active &&
                              !mealSelected &&
                              mealSupplementCount(meal.id, item) >= MAX_SUPPLEMENTS_PER_MEAL_PLAN_TILE;

                            return (
                              <button
                                key={meal.id}
                                type="button"
                                disabled={!isEditing || mealAtSupplementLimit}
                                onClick={() => toggleMeal(item, meal.id)}
                                className={`rounded-full px-3 py-2 text-xs font-semibold ring-1 transition disabled:cursor-not-allowed ${
                                  mealSelected
                                    ? "bg-[var(--hewie-active-bg,#f1f5f9)] text-[var(--hewie-active-text,#334155)] ring-[var(--hewie-ring,#cbd5e1)]"
                                    : mealAtSupplementLimit
                                      ? "bg-zinc-100 text-zinc-400 ring-zinc-200"
                                      : "bg-white text-zinc-600 ring-zinc-200"
                                }`}
                              >
                                {meal.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-zinc-700">Dose / Amount</span>
                      <input
                        value={item.dose}
                        disabled={!isEditing}
                        onChange={(event) => updateItem(item.id, { dose: clampText(event.target.value, TEXT_LIMITS.dose) })}
                        maxLength={TEXT_LIMITS.dose}
                        placeholder="Example: 1 capsule, 5 mg"
                        className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--hewie-ring,#cbd5e1)] focus:ring-4 focus:ring-zinc-100 disabled:bg-zinc-100 disabled:text-zinc-500"
                      />
                    </label>

                    {item.scheduleKind === "custom" ? (
                      <div className="space-y-2 rounded-2xl bg-white p-3 text-sm ring-1 ring-zinc-200">
                        <div className="space-y-1.5">
                          {item.scheduleSteps.map((step, index) => {
                            const hasAnotherSchedule = index < item.scheduleSteps.length - 1;
                            const durationLocked = item.ongoing || item.asNeeded;

                            return (
                              <div key={step.id} className="flex flex-wrap items-center gap-1 text-sm font-medium text-zinc-700">
                                <span>Every</span>
                                <input
                                  aria-label={`Schedule ${index + 1} every how many hours`}
                                  value={step.everyHours}
                                  disabled={!isEditing}
                                  inputMode="numeric"
                                  maxLength={2}
                                  onChange={(event) => updateScheduleStep(item, step.id, { everyHours: event.target.value })}
                                  placeholder="—"
                                  className="w-10 rounded-lg border border-zinc-200 bg-white px-1.5 py-1.5 text-center text-sm outline-none transition focus:border-[var(--hewie-ring,#cbd5e1)] focus:ring-4 focus:ring-zinc-100 disabled:bg-zinc-100 disabled:text-zinc-500"
                                />
                                <span>hours for</span>
                                <input
                                  aria-label={`Schedule ${index + 1} for how many days`}
                                  value={durationLocked ? "" : step.forDays}
                                  disabled={!isEditing || durationLocked}
                                  inputMode="numeric"
                                  maxLength={2}
                                  onChange={(event) => updateScheduleStep(item, step.id, { forDays: event.target.value })}
                                  placeholder="—"
                                  className="w-10 rounded-lg border border-zinc-200 bg-white px-1.5 py-1.5 text-center text-sm outline-none transition focus:border-[var(--hewie-ring,#cbd5e1)] focus:ring-4 focus:ring-zinc-100 disabled:bg-zinc-100 disabled:text-zinc-400"
                                />
                                <span>days{hasAnotherSchedule ? "," : ""}</span>
                                {item.scheduleSteps.length > 1 ? (
                                  <Button
                                    variant="outline"
                                    className="size-8 rounded-full p-0 text-rose-600"
                                    disabled={!isEditing}
                                    onClick={() => deleteScheduleStep(item, step.id)}
                                    aria-label="Delete schedule row"
                                  >
                                    <Trash2 className="size-3.5" />
                                  </Button>
                                ) : null}
                                {index === item.scheduleSteps.length - 1 ? (
                                  <Button variant="outline" className="size-8 rounded-full p-0" disabled={!isEditing} onClick={() => addScheduleStep(item)} aria-label="Add another schedule row">
                                    <Plus className="size-4" />
                                  </Button>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>

                        <div className="flex flex-wrap gap-2 border-t border-zinc-100 pt-2 text-xs font-medium text-zinc-600">
                          <label className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 ring-1 ${item.ongoing ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-white text-zinc-600 ring-zinc-200"}`}>
                            <input
                              type="checkbox"
                              checked={item.ongoing}
                              disabled={!isEditing}
                              onChange={(event) => updateItem(item.id, {
                                ongoing: event.target.checked,
                                asNeeded: event.target.checked ? false : item.asNeeded,
                                scheduleSteps: item.scheduleSteps.map((scheduleStep) => ({ ...scheduleStep, forDays: event.target.checked ? "" : scheduleStep.forDays })),
                              })}
                              className="size-3.5 rounded border-zinc-300"
                            />
                            Ongoing
                          </label>
                          <label className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 ring-1 ${item.asNeeded ? "bg-sky-50 text-sky-700 ring-sky-200" : "bg-white text-zinc-600 ring-zinc-200"}`}>
                            <input
                              type="checkbox"
                              checked={item.asNeeded}
                              disabled={!isEditing}
                              onChange={(event) => updateItem(item.id, {
                                asNeeded: event.target.checked,
                                ongoing: event.target.checked ? false : item.ongoing,
                                scheduleSteps: item.scheduleSteps.map((scheduleStep) => ({ ...scheduleStep, forDays: event.target.checked ? "" : scheduleStep.forDays })),
                              })}
                              className="size-3.5 rounded border-zinc-300"
                            />
                            As needed
                          </label>
                        </div>
                      </div>
                    ) : null}

                    {kind === "medication" ? (
                      <div className={`grid gap-3 text-sm ${item.medicationType === "oral" ? "grid-cols-2" : "grid-cols-1"}`}>
                        <label className="block">
                          <span className="mb-1 block font-medium text-zinc-700">Medication Type</span>
                          <select
                            value={item.medicationType}
                            disabled={!isEditing}
                            onChange={(event) => updateItem(item.id, {
                              medicationType: event.target.value as CareItemTemplate["medicationType"],
                            })}
                            className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--hewie-ring,#cbd5e1)] focus:ring-4 focus:ring-zinc-100 disabled:bg-zinc-100 disabled:text-zinc-500"
                          >
                            <option value="oral">Oral</option>
                            <option value="topical">Topical</option>
                            <option value="injection">Injection</option>
                            <option value="other">Other</option>
                          </select>
                        </label>

                        {item.medicationType === "oral" ? (
                          <label className="block">
                            <span className="mb-1 block font-medium text-zinc-700">Give With</span>
                            <select
                              value={item.customTiming}
                              disabled={!isEditing}
                              onChange={(event) => updateItem(item.id, { customTiming: event.target.value as CareItemTemplate["customTiming"] })}
                              className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--hewie-ring,#cbd5e1)] focus:ring-4 focus:ring-zinc-100 disabled:bg-zinc-100 disabled:text-zinc-500"
                            >
                              <option value="with-food">With Food</option>
                              <option value="empty-stomach">Empty Stomach</option>
                            </select>
                          </label>
                        ) : null}
                      </div>
                    ) : item.scheduleKind === "custom" ? (
                      <label className="block text-sm">
                        <span className="mb-1 block font-medium text-zinc-700">Give With</span>
                        <select
                          value={item.customTiming}
                          disabled={!isEditing}
                          onChange={(event) => updateItem(item.id, { customTiming: event.target.value as CareItemTemplate["customTiming"] })}
                          className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--hewie-ring,#cbd5e1)] focus:ring-4 focus:ring-zinc-100 disabled:bg-zinc-100 disabled:text-zinc-500"
                        >
                          <option value="with-food">With Food</option>
                          <option value="empty-stomach">Empty Stomach</option>
                        </select>
                      </label>
                    ) : null}

                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-zinc-700">Notes / Special Instructions</span>
                      <textarea
                        value={item.notes}
                        disabled={!isEditing}
                        onChange={(event) => updateItem(item.id, { notes: clampText(event.target.value, TEXT_LIMITS.note) })}
                        maxLength={TEXT_LIMITS.note}
                        rows={2}
                        className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--hewie-ring,#cbd5e1)] focus:ring-4 focus:ring-zinc-100 disabled:bg-zinc-100 disabled:text-zinc-500"
                      />
                    </label>

                    {isEditing ? (
                      <div className="grid grid-cols-[1fr_1fr_auto] gap-2 pt-1">
                        <Button
                          className="rounded-full bg-[var(--hewie-accent,#64748b)] px-3 text-[var(--hewie-accent-text,#ffffff)] hover:opacity-90"
                          onClick={() => saveEditing(item.id)}
                        >
                          Save
                        </Button>
                        <Button variant="outline" className="rounded-full px-3" onClick={() => cancelEditing(item.id)}>
                          Cancel
                        </Button>
                        <Button
                          variant="outline"
                          className="rounded-full border-rose-200 px-3 text-rose-600 hover:bg-rose-50"
                          onClick={() => deleteItem(item.id)}
                        >
                          <Trash2 className="size-4" />
                          Delete
                        </Button>
                      </div>
                    ) : null}
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
