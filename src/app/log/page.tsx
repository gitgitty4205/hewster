"use client";

import { useEffect, useMemo, useState } from "react";

import { ActivityDetailForm } from "@/components/activity-detail-form";
import { ActivityFeed } from "@/components/activity-feed";
import { BottomNav } from "@/components/bottom-nav";
import { QuickLogCard } from "@/components/quick-log-card";
import {
  currentTodayKey,
  deleteActivityLogInSupabase,
  type ActivityLog,
  type ActivityType,
  loadAppState,
  saveActivityLogToSupabase,
  updateActivityLogInSupabase,
} from "@/lib/hewster-data";
import { HEWSTER_PROFILE_SLUG, isSupabaseConfigured } from "@/lib/supabase";

function nowForTimeInput() {
  return new Intl.DateTimeFormat("en-CA", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

function toTimeInputValue(isoString: string) {
  return new Intl.DateTimeFormat("en-CA", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(isoString));
}

function mergeTodayWithTime(timeValue: string) {
  const [hours, minutes] = timeValue.split(":").map(Number);
  const now = new Date();
  now.setHours(hours, minutes, 0, 0);
  return now.toISOString();
}

export default function LogPage() {
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [activityState, setActivityState] = useState<"idle" | "saved" | "saving" | "error">("idle");
  const [detailActivityType, setDetailActivityType] = useState<ActivityType | null>(null);
  const [editingActivityId, setEditingActivityId] = useState<string | null>(null);
  const [detailValue, setDetailValue] = useState("");
  const [notesValue, setNotesValue] = useState("");
  const [happenedAtValue, setHappenedAtValue] = useState(nowForTimeInput());
  const supabaseReady = isSupabaseConfigured();

  useEffect(() => {
    async function hydrate() {
      const state = await loadAppState();
      setActivityLogs(state.activityLogs);
    }

    hydrate();
  }, []);

  const todayActivityLogs = useMemo(() => {
    const today = currentTodayKey();
    return activityLogs.filter((activity) => {
      const activityDayKey = new Intl.DateTimeFormat("en-CA", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(activity.happenedAt));

      return activityDayKey === today;
    });
  }, [activityLogs]);

  const resetEditor = () => {
    setDetailActivityType(null);
    setEditingActivityId(null);
    setDetailValue("");
    setNotesValue("");
    setHappenedAtValue(nowForTimeInput());
  };

  const openEditorForActivity = (activity: ActivityLog) => {
    setDetailActivityType(activity.activityType);
    setEditingActivityId(activity.id);
    setDetailValue(activity.detail ?? "");
    setNotesValue(activity.notes ?? "");
    setHappenedAtValue(toTimeInputValue(activity.happenedAt));
  };

  const saveActivity = async (activity: ActivityLog, mode: "create" | "update") => {
    setActivityLogs((current) => {
      const withoutExisting = current.filter((entry) => entry.id !== activity.id);
      return [activity, ...withoutExisting].sort((a, b) => b.happenedAt.localeCompare(a.happenedAt));
    });
    setActivityState("saving");

    try {
      if (supabaseReady) {
        if (mode === "update") {
          await updateActivityLogInSupabase(activity);
        } else {
          await saveActivityLogToSupabase(activity);
        }
      }

      setActivityState("saved");
      window.setTimeout(() => setActivityState("idle"), 1800);
    } catch {
      setActivityState("error");
    }
  };

  const quickLogActivity = async (activityType: ActivityType) => {
    if (activityType === "other") {
      setDetailActivityType("other");
      setEditingActivityId(null);
      setDetailValue("");
      setNotesValue("");
      setHappenedAtValue(nowForTimeInput());
      return;
    }

    const activity: ActivityLog = {
      id: `${activityType}-${Date.now()}`,
      profileSlug: HEWSTER_PROFILE_SLUG,
      activityType,
      happenedAt: new Date().toISOString(),
      detail: null,
      notes: null,
    };

    setEditingActivityId(null);
    await saveActivity(activity, "create");
    openEditorForActivity(activity);
  };

  const saveDetailedActivity = async () => {
    if (!detailActivityType) return;

    const resolvedNotes = detailActivityType === "treat" && detailValue === "Other" ? notesValue.trim() : notesValue.trim() || null;
    const activity: ActivityLog = {
      id: editingActivityId ?? `${detailActivityType}-${Date.now()}`,
      profileSlug: HEWSTER_PROFILE_SLUG,
      activityType: detailActivityType,
      happenedAt: mergeTodayWithTime(happenedAtValue),
      detail: detailValue.trim() || null,
      notes: resolvedNotes,
    };

    await saveActivity(activity, editingActivityId ? "update" : "create");
    resetEditor();
  };

  const deleteActivity = async () => {
    if (!editingActivityId) return;

    const deletingId = editingActivityId;
    setActivityLogs((current) => current.filter((activity) => activity.id !== deletingId));
    setActivityState("saving");

    try {
      if (supabaseReady) {
        await deleteActivityLogInSupabase(deletingId);
      }

      setActivityState("saved");
      window.setTimeout(() => setActivityState("idle"), 1800);
      resetEditor();
    } catch {
      setActivityState("error");
    }
  };

  return (
    <main className="min-h-screen bg-[#979ca7] text-zinc-900">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-24 pt-6">
        <header className="mb-6">
          <p className="text-sm font-medium text-violet-500">Hewster</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Log Activity</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Quick activity tracking for potty breaks, hikes, treats, and anything else you want to remember.
          </p>
        </header>

        <QuickLogCard activityState={activityState} onQuickLog={quickLogActivity} />

        {detailActivityType ? (
          <ActivityDetailForm
            activityType={detailActivityType as Exclude<ActivityType, "pee">}
            detail={detailValue}
            notes={notesValue}
            happenedAt={happenedAtValue}
            isEditing={Boolean(editingActivityId)}
            onDetailChange={setDetailValue}
            onNotesChange={setNotesValue}
            onHappenedAtChange={setHappenedAtValue}
            onSave={saveDetailedActivity}
            onCancel={resetEditor}
            onDelete={editingActivityId ? deleteActivity : undefined}
            saving={activityState === "saving"}
          />
        ) : null}

        <ActivityFeed
          activityLogs={todayActivityLogs}
          grouped
          title="Activity History"
          onSelectActivity={openEditorForActivity}
        />

        <BottomNav />
      </div>
    </main>
  );
}
