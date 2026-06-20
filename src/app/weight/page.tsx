"use client";

import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { PetAvatarMenu } from "@/components/pet-avatar-menu";
import { useEffect, useMemo, useRef, useState } from "react";

import { BottomNav } from "@/components/bottom-nav";
import { Button } from "@/components/ui/button";
import { CenteredLoadingIcon } from "@/components/centered-loading-icon";
import { ExpandableNoteText } from "@/components/expandable-note-text";
import {
  type WeightLog,
  deleteWeightLogInSupabase,
  loadAppState,
  loadNotebookEntryPermissions,
  markWeightLogDeleted,
  loadLocalState,
  persistLocalState,
  saveWeightLogToSupabase,
  updateWeightLogInSupabase,
} from "@/lib/hewster-data";
import {
  type PetProfile,
  appThemes,
  loadPetProfile,
  loadUserTheme,
  savePetProfile,
  type ThemeId,
} from "@/lib/pet-profile";
import { getActiveProfileSlug, isSupabaseConfigured } from "@/lib/supabase";
import { PetNotebookTitle } from "@/components/pet-notebook-title";
import { TEXT_LIMITS, clampText } from "@/lib/text-limits";

const WEIGHT_VALUE_MAX_LENGTH = 12;
const formInputClass = "hewie-input-bubble";

function todayInputValue() {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatWeightDate(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00`));
}

function formatWeightWithUnit(weight: string, unit: PetProfile["weightUnit"]) {
  const trimmed = weight.trim().replace(/\s*(kg|lb)\s*$/i, " $1");
  if (/\s(?:lb|kg)$/i.test(trimmed)) return trimmed;
  return `${trimmed} ${unit}`;
}

function weightInputValue(weight: string) {
  return weight.replace(/\s*(?:lb|kg)$/i, "");
}

export default function WeightPage() {
  const [profile, setProfile] = useState<PetProfile>(() => loadPetProfile());
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([]);
  const [themeId, setThemeId] = useState<ThemeId>(() => loadUserTheme());
  const [dateValue, setDateValue] = useState(todayInputValue());
  const [weightValue, setWeightValue] = useState("");
  const [noteValue, setNoteValue] = useState("");
  const [editingWeightId, setEditingWeightId] = useState<string | null>(null);
  const [editingDateValue, setEditingDateValue] = useState("");
  const [editingWeightValue, setEditingWeightValue] = useState("");
  const [editingNoteValue, setEditingNoteValue] = useState("");
  const [pendingDeleteWeight, setPendingDeleteWeight] = useState<WeightLog | null>(null);
  const [expandedYears, setExpandedYears] = useState<string[]>(() => [todayInputValue().slice(0, 4)]);
  const [saveState, setSaveState] = useState<"idle" | "saved" | "saving" | "error">("idle");
  const [hydrated, setHydrated] = useState(false);
  const [canEditEntries, setCanEditEntries] = useState(true);
  const [canDeleteEntries, setCanDeleteEntries] = useState(true);
  const hasSetInitialOpenYear = useRef(false);
  const supabaseReady = isSupabaseConfigured();
  const theme = appThemes[themeId];

  const updateWeightUnit = (weightUnit: PetProfile["weightUnit"]) => {
    const updated = { ...profile, weightUnit };
    setProfile(updated);
    savePetProfile(updated);
  };

  useEffect(() => {
    let cancelled = false;
    const refreshPermissions = () => {
      void loadNotebookEntryPermissions().then((permissions) => {
        if (!cancelled) {
          setCanEditEntries(permissions.canEditEntries);
          setCanDeleteEntries(permissions.canDeleteEntries);
        }
      });
    };

    refreshPermissions();
    window.addEventListener("petnotebook-active-notebook-updated", refreshPermissions);
    window.addEventListener("focus", refreshPermissions);
    return () => {
      cancelled = true;
      window.removeEventListener("petnotebook-active-notebook-updated", refreshPermissions);
      window.removeEventListener("focus", refreshPermissions);
    };
  }, []);

  useEffect(() => {
    const refreshTheme = () => setThemeId(loadUserTheme());
    window.addEventListener("pet-theme-updated", refreshTheme);
    window.addEventListener("storage", refreshTheme);
    return () => {
      window.removeEventListener("pet-theme-updated", refreshTheme);
      window.removeEventListener("storage", refreshTheme);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fallbackTimer = window.setTimeout(() => {
      if (!cancelled) {
        setHydrated(true);
      }
    }, 2200);

    async function hydrate() {
      try {
        const state = await loadAppState();
        if (cancelled) return;
        setWeightLogs(state.weightLogs ?? []);
      } finally {
        if (!cancelled) {
          window.clearTimeout(fallbackTimer);
          setHydrated(true);
        }
      }
    }

    hydrate();

    return () => {
      cancelled = true;
      window.clearTimeout(fallbackTimer);
    };
  }, []);

  const sortedLogs = useMemo(
    () => [...weightLogs].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)),
    [weightLogs]
  );

  const logsByYear = useMemo(() => {
    return sortedLogs.reduce<Array<{ year: string; entries: WeightLog[] }>>((groups, entry) => {
      const year = entry.date.slice(0, 4) || "Unknown";
      const existingGroup = groups.find((group) => group.year === year);

      if (existingGroup) {
        existingGroup.entries.push(entry);
      } else {
        groups.push({ year, entries: [entry] });
      }

      return groups;
    }, []);
  }, [sortedLogs]);

  useEffect(() => {
    if (!logsByYear.length || hasSetInitialOpenYear.current) return;
    hasSetInitialOpenYear.current = true;
    if (!logsByYear.some((group) => expandedYears.includes(group.year))) {
      setExpandedYears([logsByYear[0].year]);
    }
  }, [expandedYears, logsByYear]);

  const toggleYear = (year: string) => {
    setExpandedYears((current) =>
      current.includes(year) ? current.filter((entry) => entry !== year) : [...current, year]
    );
  };

  const saveWeight = async () => {
    if (!dateValue || !weightValue.trim()) return;

    const entry: WeightLog = {
      id: `weight-${Date.now()}`,
      profileSlug: getActiveProfileSlug(),
      date: dateValue,
      weight: formatWeightWithUnit(weightValue, profile.weightUnit),
      note: clampText(noteValue.trim(), TEXT_LIMITS.note) || null,
    };

    const nextLogs = [entry, ...weightLogs];
    const localState = loadLocalState();

    setWeightLogs(nextLogs);
    persistLocalState(localState.templates, localState.dailyMealState, localState.activityLogs, nextLogs);
    setSaveState("saving");

    try {
      if (supabaseReady) {
        await saveWeightLogToSupabase(entry);
      }

      setSaveState("saved");
      setExpandedYears((current) => (current.includes(entry.date.slice(0, 4)) ? current : [entry.date.slice(0, 4), ...current]));
      setDateValue(todayInputValue());
      setWeightValue("");
      setNoteValue("");
      window.setTimeout(() => setSaveState("idle"), 1800);
    } catch {
      setSaveState("error");
    }
  };

  const editWeight = (entry: WeightLog) => {
    setEditingWeightId(entry.id);
    setEditingDateValue(entry.date);
    setEditingWeightValue(weightInputValue(entry.weight));
    setEditingNoteValue(clampText(entry.note ?? "", TEXT_LIMITS.note));
    setSaveState("idle");
  };

  const cancelEdit = () => {
    setEditingWeightId(null);
    setEditingDateValue("");
    setEditingWeightValue("");
    setEditingNoteValue("");
    setSaveState("idle");
  };

  const confirmDeleteWeight = async () => {
    if (!pendingDeleteWeight) return;

    const entry = pendingDeleteWeight;
    const nextLogs = weightLogs.filter((log) => log.id !== entry.id);
    const localState = loadLocalState();

    markWeightLogDeleted(entry.id);
    setWeightLogs(nextLogs);
    persistLocalState(localState.templates, localState.dailyMealState, localState.activityLogs, nextLogs);
    setSaveState("saving");
    setPendingDeleteWeight(null);
    cancelEdit();

    try {
      if (supabaseReady) {
        await deleteWeightLogInSupabase(entry.id);
      }

      setSaveState("saved");
      window.setTimeout(() => setSaveState("idle"), 1800);
    } catch {
      setSaveState("error");
    }
  };

  const saveEditedWeight = async () => {
    if (!editingWeightId || !editingDateValue || !editingWeightValue.trim()) return;

    const existing = weightLogs.find((log) => log.id === editingWeightId);
    if (!existing) return;

    const entry: WeightLog = {
      ...existing,
      date: editingDateValue,
      weight: formatWeightWithUnit(editingWeightValue, profile.weightUnit),
      note: clampText(editingNoteValue.trim(), TEXT_LIMITS.note) || null,
    };
    const nextLogs = weightLogs.map((log) => (log.id === editingWeightId ? entry : log));
    const localState = loadLocalState();

    setWeightLogs(nextLogs);
    persistLocalState(localState.templates, localState.dailyMealState, localState.activityLogs, nextLogs);
    setSaveState("saving");
    cancelEdit();

    try {
      if (supabaseReady) {
        await updateWeightLogInSupabase(entry);
      }

      setSaveState("saved");
      window.setTimeout(() => setSaveState("idle"), 1800);
    } catch {
      setSaveState("error");
    }
  };

  const renderWeightEntry = (entry: WeightLog) => {
    const isEditing = editingWeightId === entry.id;
    const summary = (
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-zinc-600">{formatWeightDate(entry.date)}</p>
          {entry.note ? <ExpandableNoteText className="mt-1 text-sm text-[var(--hewie-active-text)]/75">{entry.note}</ExpandableNoteText> : null}
        </div>
        <p className="max-w-[8.5rem] shrink-0 truncate text-right text-sm font-semibold">{formatWeightWithUnit(entry.weight, profile.weightUnit)}</p>
      </div>
    );

    if (!isEditing) {
      return (
        <button
          key={entry.id}
          type="button"
          onClick={canEditEntries ? () => editWeight(entry) : undefined}
          disabled={!canEditEntries}
          className="w-full rounded-2xl bg-white/70 p-4 text-left text-[var(--hewie-active-text)] shadow-[0_8px_18px_rgba(15,23,42,0.045)] transition enabled:hover:bg-white/85 disabled:cursor-default"
          aria-label={`Edit weight from ${formatWeightDate(entry.date)}`}
        >
          {summary}
        </button>
      );
    }

    return (
      <article
        key={entry.id}
        className="relative rounded-2xl bg-white/70 p-4 text-[var(--hewie-active-text)] shadow-[0_8px_18px_rgba(15,23,42,0.045)]"
      >
      {summary}
        <div className="mt-4 space-y-3 border-t border-[var(--hewie-ring)]/70 pt-4">
          <label className="block min-w-0 text-sm">
            <span className="mb-1 block font-medium text-[var(--hewie-active-text)]/85">Date</span>
            <input
              type="date"
              value={editingDateValue}
              onChange={(event) => setEditingDateValue(event.target.value)}
              className={`${formInputClass} hewie-date-input`}
            />
          </label>

          <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-3">
            <label className="block min-w-0 text-sm">
              <span className="mb-1 block font-medium text-[var(--hewie-active-text)]/85">Weight</span>
              <input
                inputMode="decimal"
                value={editingWeightValue}
                onChange={(event) => setEditingWeightValue(clampText(event.target.value, WEIGHT_VALUE_MAX_LENGTH))}
                maxLength={WEIGHT_VALUE_MAX_LENGTH}
                placeholder={`e.g. 24.8 ${profile.weightUnit}`}
                className={formInputClass}
              />
            </label>

            <label className="block min-w-0 text-sm">
              <span className="mb-1 block font-medium text-[var(--hewie-active-text)]/85">Unit</span>
              <select
                value={profile.weightUnit}
                onChange={(event) => updateWeightUnit(event.target.value as PetProfile["weightUnit"])}
                className={formInputClass}
              >
                <option value="lb">lb</option>
                <option value="kg">kg</option>
              </select>
            </label>
          </div>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-[var(--hewie-active-text)]/85">Notes</span>
              <input
                value={editingNoteValue}
                onChange={(event) => setEditingNoteValue(clampText(event.target.value, TEXT_LIMITS.note))}
                maxLength={TEXT_LIMITS.note}
                placeholder="Optional notes"
                className={formInputClass}
              />
          </label>

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={saveEditedWeight}
              className="rounded-full !text-white hover:opacity-90"
              style={{ backgroundColor: theme.activeText }}
            >
              Save
            </Button>
            <Button variant="outline" onClick={cancelEdit} className="rounded-full">
              Cancel
            </Button>
            {canDeleteEntries ? (
              <Button variant="outline" onClick={() => setPendingDeleteWeight(entry)} className="rounded-full border-rose-200 text-rose-600 hover:bg-rose-50">
                Delete
              </Button>
            ) : null}
          </div>
        </div>
    </article>
    );
  };

  if (!hydrated) {
    return (
      <main className="min-h-screen bg-[var(--hewie-bg)] text-zinc-900">
        <CenteredLoadingIcon className="min-h-screen" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--hewie-bg)] text-zinc-900">
      <div className="content-fade-in mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-24 pt-6">
        <header className="mb-6">
          <div className="flex min-h-[4.5rem] items-center justify-between gap-3">
            <div>
              <PetNotebookTitle href="/notebook" className="text-sm font-bold text-[var(--hewie-active-text)]" />
              <h1 className="mt-1 text-xl font-bold tracking-tight text-[#3b2832]">Weight</h1>
            </div>
            <PetAvatarMenu shape="tile" />
          </div>
        </header>

        <section data-guide="weight-log" className="mb-4 rounded-3xl bg-[var(--hewie-active-bg)] p-5 text-[var(--hewie-active-text)] shadow-sm ring-1 ring-[var(--hewie-ring)]">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Add Weight</h2>
            </div>
            <div className="text-right text-xs text-[var(--hewie-active-text)]/60">
              {saveState === "saving"
                ? "Saving..."
                : saveState === "saved"
                  ? "Saved"
                  : saveState === "error"
                    ? "Saved In Browser Only"
                    : ""}
            </div>
          </div>

          <div className="space-y-3">
            <label className="block min-w-0 text-sm">
              <span className="mb-1 block font-medium text-[var(--hewie-active-text)]/85">Date</span>
              <input
                type="date"
                value={dateValue}
                onChange={(event) => setDateValue(event.target.value)}
                className={`${formInputClass} hewie-date-input`}
              />
            </label>

            <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-3">
              <label className="block min-w-0 text-sm">
                <span className="mb-1 block font-medium text-[var(--hewie-active-text)]/85">Weight</span>
                <input
                  inputMode="decimal"
                  value={weightValue}
                  onChange={(event) => setWeightValue(clampText(event.target.value, WEIGHT_VALUE_MAX_LENGTH))}
                  maxLength={WEIGHT_VALUE_MAX_LENGTH}
                  placeholder={`e.g. 24.8 ${profile.weightUnit}`}
                  className={formInputClass}
                />
              </label>

              <label className="block min-w-0 text-sm">
                <span className="mb-1 block font-medium text-[var(--hewie-active-text)]/85">Unit</span>
                <select
                  value={profile.weightUnit}
                  onChange={(event) => updateWeightUnit(event.target.value as PetProfile["weightUnit"])}
                  className={formInputClass}
                >
                  <option value="lb">lb</option>
                  <option value="kg">kg</option>
                </select>
              </label>
            </div>

            <label className="block text-sm">
              <span className="mb-1 block font-medium text-[var(--hewie-active-text)]/85">Notes</span>
              <input
                value={noteValue}
                onChange={(event) => setNoteValue(clampText(event.target.value, TEXT_LIMITS.note))}
                maxLength={TEXT_LIMITS.note}
                placeholder="Optional notes"
                className={formInputClass}
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={saveWeight}
                className="rounded-full !text-white hover:opacity-90"
                style={{ backgroundColor: theme.activeText }}
              >
                Save Weight
              </Button>
            </div>
          </div>
        </section>

        <section className="mb-4 overflow-hidden rounded-3xl bg-[var(--hewie-active-bg)] text-[var(--hewie-active-text)] shadow-sm">
          <div className="bg-[var(--hewie-accent)] px-5 py-4 text-[var(--hewie-accent-text)]">
            <h2 className="text-lg font-semibold">Weight History</h2>
          </div>

          <div className="space-y-3 p-5">
            {sortedLogs.length ? (
              <div className="space-y-3">
                {logsByYear.map((group) => {
                  const isExpanded = expandedYears.includes(group.year);

                  return (
                    <div key={group.year} className="space-y-2">
                      <button
                        type="button"
                        onClick={() => toggleYear(group.year)}
                        className="flex w-full items-center justify-between rounded-2xl bg-white/60 px-3 py-2 text-left shadow-[0_6px_14px_rgba(15,23,42,0.035)] transition hover:bg-white/75"
                        aria-expanded={isExpanded}
                      >
                        <span className="flex items-center gap-2">
                          {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                          <span className="text-sm font-bold text-[var(--hewie-active-text)]/85">{group.year}</span>
                        </span>
                      </button>

                      {isExpanded ? (
                        <div className="space-y-3">
                          {group.entries.map((entry) => renderWeightEntry(entry))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-[var(--hewie-active-text)]/65">No weight entries yet.</p>
            )}
          </div>
        </section>

        {pendingDeleteWeight ? (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-zinc-950/35 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="delete-weight-title">
            <button type="button" aria-label="Cancel delete weight entry" className="absolute inset-0 cursor-default" onClick={() => setPendingDeleteWeight(null)} />
            <div className="relative w-full max-w-md rounded-3xl bg-white p-4 text-zinc-900 shadow-2xl ring-1 ring-zinc-200">
              <div className="mb-4 flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-600 ring-1 ring-rose-100">
                  <Trash2 className="size-5" />
                </span>
                <div className="min-w-0">
                  <h2 id="delete-weight-title" className="text-base font-semibold">Delete weight entry?</h2>
                  <p className="mt-1 text-sm leading-6 text-zinc-500">
                    Delete the weight entry from {formatWeightDate(pendingDeleteWeight.date)}?
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" className="rounded-full" onClick={() => setPendingDeleteWeight(null)}>
                  Cancel
                </Button>
                <Button type="button" className="rounded-full bg-rose-600 text-white hover:bg-rose-700" onClick={confirmDeleteWeight}>
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
