"use client";

import { ChevronDown, ChevronRight, Ellipsis, Trash2 } from "lucide-react";
import { PetAvatarMenu } from "@/components/pet-avatar-menu";
import { useEffect, useMemo, useRef, useState } from "react";

import { BottomNav } from "@/components/bottom-nav";
import { Button } from "@/components/ui/button";
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
import { HEWSTER_PROFILE_SLUG, isSupabaseConfigured } from "@/lib/supabase";
import { PetNotebookTitle } from "@/components/pet-notebook-title";
import { TEXT_LIMITS, clampText } from "@/lib/text-limits";

const WEIGHT_VALUE_MAX_LENGTH = 12;

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
      profileSlug: HEWSTER_PROFILE_SLUG,
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

  const deleteWeight = async (entry: WeightLog) => {
    const confirmed = window.confirm(`Delete the weight entry from ${formatWeightDate(entry.date)}?`);
    if (!confirmed) return;

    const nextLogs = weightLogs.filter((log) => log.id !== entry.id);
    const localState = loadLocalState();

    markWeightLogDeleted(entry.id);
    setWeightLogs(nextLogs);
    persistLocalState(localState.templates, localState.dailyMealState, localState.activityLogs, nextLogs);
    setSaveState("saving");
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

  const renderWeightEntry = (entry: WeightLog) => (
    <article
      key={entry.id}
      className="relative rounded-2xl bg-white/70 p-4 pr-10 text-[var(--hewie-active-text,#334155)] shadow-[0_8px_18px_rgba(15,23,42,0.045)]"
    >
      {canEditEntries ? (
        <button
          type="button"
          onClick={() => editWeight(entry)}
          className="absolute right-2.5 top-2.5 flex size-7 items-center justify-center rounded-full bg-white/75 text-[var(--hewie-active-text,#334155)]/55 ring-1 ring-[var(--hewie-ring,#cbd5e1)]/45 transition hover:bg-white hover:text-[var(--hewie-active-text,#334155)]"
          aria-label={`Edit weight from ${formatWeightDate(entry.date)}`}
        >
          <Ellipsis className="size-3.5" />
        </button>
      ) : null}
      {canDeleteEntries ? (
        <button
          type="button"
          onClick={() => deleteWeight(entry)}
          className="absolute right-10 top-2.5 flex size-7 items-center justify-center rounded-full bg-white/75 text-rose-500 ring-1 ring-rose-200/60 transition hover:bg-rose-50 hover:text-rose-600"
          aria-label={`Delete weight from ${formatWeightDate(entry.date)}`}
        >
          <Trash2 className="size-3.5" />
        </button>
      ) : null}
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-medium">{formatWeightDate(entry.date)}</p>
          {entry.note ? <ExpandableNoteText className="mt-1 text-sm text-[var(--hewie-active-text,#334155)]/75">{entry.note}</ExpandableNoteText> : null}
        </div>
        <p className="mr-14 shrink-0 text-sm font-semibold">{formatWeightWithUnit(entry.weight, profile.weightUnit)}</p>
      </div>
      {editingWeightId === entry.id ? (
        <div className="mt-4 space-y-3 border-t border-[var(--hewie-ring,#cbd5e1)]/70 pt-4">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-[var(--hewie-active-text,#334155)]/85">Date</span>
            <input
              type="date"
              value={editingDateValue}
              onChange={(event) => setEditingDateValue(event.target.value)}
              className="w-full rounded-2xl border border-[var(--hewie-ring,#cbd5e1)] bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--hewie-accent,#64748b)] focus:ring-4 focus:ring-[var(--hewie-ring,#cbd5e1)]/45"
            />
          </label>

          <div className="grid grid-cols-[1fr_auto] gap-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-[var(--hewie-active-text,#334155)]/85">Weight</span>
              <input
                inputMode="decimal"
                value={editingWeightValue}
                onChange={(event) => setEditingWeightValue(clampText(event.target.value, WEIGHT_VALUE_MAX_LENGTH))}
                maxLength={WEIGHT_VALUE_MAX_LENGTH}
                placeholder={`e.g. 24.8 ${profile.weightUnit}`}
                className="w-full rounded-2xl border border-[var(--hewie-ring,#cbd5e1)] bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--hewie-accent,#64748b)] focus:ring-4 focus:ring-[var(--hewie-ring,#cbd5e1)]/45"
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block font-medium text-[var(--hewie-active-text,#334155)]/85">Unit</span>
              <select
                value={profile.weightUnit}
                onChange={(event) => updateWeightUnit(event.target.value as PetProfile["weightUnit"])}
                className="w-24 rounded-2xl border border-[var(--hewie-ring,#cbd5e1)] bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--hewie-accent,#64748b)] focus:ring-4 focus:ring-[var(--hewie-ring,#cbd5e1)]/45"
              >
                <option value="lb">lb</option>
                <option value="kg">kg</option>
              </select>
            </label>
          </div>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-[var(--hewie-active-text,#334155)]/85">Notes</span>
              <input
                value={editingNoteValue}
                onChange={(event) => setEditingNoteValue(clampText(event.target.value, TEXT_LIMITS.note))}
                maxLength={TEXT_LIMITS.note}
                placeholder="Optional Notes"
                className="w-full rounded-2xl border border-[var(--hewie-ring,#cbd5e1)] bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--hewie-accent,#64748b)] focus:ring-4 focus:ring-[var(--hewie-ring,#cbd5e1)]/45"
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
              <Button variant="outline" onClick={() => deleteWeight(entry)} className="rounded-full border-rose-200 text-rose-600 hover:bg-rose-50">
                Delete
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </article>
  );

  if (!hydrated) {
    return (
      <main className="min-h-screen bg-[var(--hewie-bg,#979ca7)] text-zinc-900">
        <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-24 pt-6">
          <header className="mb-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <PetNotebookTitle href="/hewie" className="text-sm font-bold text-[var(--hewie-active-text,#6d28d9)]" />
                <div className="skeleton-pulse mt-1 h-10 w-32 rounded-xl bg-white/40" />
              </div>
              <PetAvatarMenu shape="tile" />
            </div>
          </header>

          <div className="space-y-4">
            <div className="skeleton-pulse h-72 rounded-3xl bg-white/60 shadow-sm ring-1 ring-white/50" />
            <div className="skeleton-pulse h-48 rounded-3xl bg-white/60 shadow-sm ring-1 ring-white/50" />
          </div>

          <BottomNav />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--hewie-bg,#979ca7)] text-zinc-900">
      <div className="content-fade-in mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-24 pt-6">
        <header className="mb-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <PetNotebookTitle href="/hewie" className="text-sm font-bold text-[var(--hewie-active-text,#6d28d9)]" />
              <h1 className="mt-1 text-xl font-bold tracking-tight text-[#3b2832]">Weight</h1>
            </div>
            <PetAvatarMenu shape="tile" />
          </div>
        </header>

        <section className="mb-4 rounded-3xl bg-[var(--hewie-active-bg,#f1f5f9)] p-5 text-[var(--hewie-active-text,#334155)] shadow-sm ring-1 ring-[var(--hewie-ring,#cbd5e1)]">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Add Weight</h2>
            </div>
            <div className="text-right text-xs text-[var(--hewie-active-text,#334155)]/60">
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
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-[var(--hewie-active-text,#334155)]/85">Date</span>
              <input
                type="date"
                value={dateValue}
                onChange={(event) => setDateValue(event.target.value)}
                className="w-full rounded-2xl border border-[var(--hewie-ring,#cbd5e1)] bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--hewie-accent,#64748b)] focus:ring-4 focus:ring-[var(--hewie-ring,#cbd5e1)]/45"
              />
            </label>

            <div className="grid grid-cols-[1fr_auto] gap-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-[var(--hewie-active-text,#334155)]/85">Weight</span>
                <input
                  inputMode="decimal"
                  value={weightValue}
                  onChange={(event) => setWeightValue(clampText(event.target.value, WEIGHT_VALUE_MAX_LENGTH))}
                  maxLength={WEIGHT_VALUE_MAX_LENGTH}
                  placeholder={`e.g. 24.8 ${profile.weightUnit}`}
                  className="w-full rounded-2xl border border-[var(--hewie-ring,#cbd5e1)] bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--hewie-accent,#64748b)] focus:ring-4 focus:ring-[var(--hewie-ring,#cbd5e1)]/45"
                />
              </label>

              <label className="block text-sm">
                <span className="mb-1 block font-medium text-[var(--hewie-active-text,#334155)]/85">Unit</span>
                <select
                  value={profile.weightUnit}
                  onChange={(event) => updateWeightUnit(event.target.value as PetProfile["weightUnit"])}
                  className="w-24 rounded-2xl border border-[var(--hewie-ring,#cbd5e1)] bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--hewie-accent,#64748b)] focus:ring-4 focus:ring-[var(--hewie-ring,#cbd5e1)]/45"
                >
                  <option value="lb">lb</option>
                  <option value="kg">kg</option>
                </select>
              </label>
            </div>

            <label className="block text-sm">
              <span className="mb-1 block font-medium text-[var(--hewie-active-text,#334155)]/85">Notes</span>
              <input
                value={noteValue}
                onChange={(event) => setNoteValue(clampText(event.target.value, TEXT_LIMITS.note))}
                maxLength={TEXT_LIMITS.note}
                placeholder="Optional Notes"
                className="w-full rounded-2xl border border-[var(--hewie-ring,#cbd5e1)] bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--hewie-accent,#64748b)] focus:ring-4 focus:ring-[var(--hewie-ring,#cbd5e1)]/45"
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

        <section className="mb-4 overflow-hidden rounded-3xl bg-[var(--hewie-active-bg,#f1f5f9)] text-[var(--hewie-active-text,#334155)] shadow-sm">
          <div className="bg-[var(--hewie-accent,#64748b)] px-5 py-4 text-[var(--hewie-accent-text,#ffffff)]">
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
                          <span className="text-sm font-bold text-[var(--hewie-active-text,#334155)]/85">{group.year}</span>
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
              <p className="text-sm text-[var(--hewie-active-text,#334155)]/65">No Weight Entries Yet.</p>
            )}
          </div>
        </section>

        <BottomNav />
      </div>
    </main>
  );
}
