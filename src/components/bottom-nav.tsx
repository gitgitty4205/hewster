"use client";

import {
  Activity,
  BellPlus,
  CalendarDays,
  ClipboardList,
  FileHeart,
  History,
  NotebookTabs,
  Scale,
  Settings2,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";

import { PetNotebookTitle } from "@/components/pet-notebook-title";
import {
  ALERT_BADGE_COUNT_STORAGE_KEY,
  loadReminderAlertRules,
  resolveAlerts,
} from "@/lib/alerts";
import { loadCareTemplates } from "@/lib/care-settings";
import { loadAppState } from "@/lib/hewster-data";
import { applyPetTheme, loadPetProfile } from "@/lib/pet-profile";

type Props = {
  alertsCount?: number;
};

const APP_BASE = "/hewie";

const pages = [
  { label: "Today", href: `${APP_BASE}`, icon: CalendarDays },
  { label: "Noted", href: `${APP_BASE}/log`, icon: ClipboardList },
  { label: "History", href: `${APP_BASE}/history`, icon: History },
  { label: "Medical", href: `${APP_BASE}/medical-records`, icon: FileHeart },
  { label: "Weight", href: `${APP_BASE}/weight`, icon: Scale },
  { label: "Fitness", href: `${APP_BASE}/activity`, icon: Activity },
  { label: "Alerts", href: `${APP_BASE}/alerts`, icon: BellPlus, badge: true },
  { label: "Profile", href: `${APP_BASE}/profile`, iconKind: "paw" },
  { label: "Settings", href: `${APP_BASE}/settings`, icon: Settings2 },
];

function PawIcon() {
  return (
    <span
      className="block size-5 bg-current"
      style={{
        WebkitMask: "url('/paw-print.svg') center / contain no-repeat",
        mask: "url('/paw-print.svg') center / contain no-repeat",
      }}
      aria-hidden="true"
    />
  );
}

function normalizeStoredAlertsCount(snapshot: string) {
  const value = Number.parseInt(snapshot, 10);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function loadStoredAlertsCountSnapshot() {
  if (typeof window === "undefined") return "0";
  return window.localStorage.getItem(ALERT_BADGE_COUNT_STORAGE_KEY) ?? "0";
}

function subscribeToStoredAlertsCount(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener("alert-badge-count-updated", onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener("alert-badge-count-updated", onStoreChange);
  };
}

function syncStoredAlertsCount(count: number) {
  window.localStorage.setItem(ALERT_BADGE_COUNT_STORAGE_KEY, String(Math.max(0, count)));
  window.dispatchEvent(new Event("alert-badge-count-updated"));
}

export function BottomNav({ alertsCount }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const storedAlertsCountSnapshot = useSyncExternalStore(subscribeToStoredAlertsCount, loadStoredAlertsCountSnapshot, () => "0");
  const storedAlertsCount = normalizeStoredAlertsCount(storedAlertsCountSnapshot);
  const activeAlertsCount = alertsCount ?? storedAlertsCount;

  useEffect(() => {
    applyPetTheme(loadPetProfile().themeId);
  }, []);

  useEffect(() => {
    if (alertsCount === undefined) return;
    syncStoredAlertsCount(alertsCount);
  }, [alertsCount]);

  useEffect(() => {
    if (alertsCount !== undefined) return;

    let cancelled = false;

    async function refreshStoredBadgeFromState() {
      try {
        const state = await loadAppState();
        if (cancelled) return;

        const careTemplates = [
          ...loadCareTemplates("supplement"),
          ...loadCareTemplates("medication"),
        ];
        const unresolvedCount = resolveAlerts(
          state.templates,
          state.dailyMealState,
          state.activityLogs,
          state.manualAlerts ?? [],
          loadReminderAlertRules(),
          careTemplates
        ).filter((alert) => alert.kind !== "reminder").length;

        syncStoredAlertsCount(unresolvedCount);
      } catch {
        // Keep the visible nav usable; the Alerts page still owns the canonical count.
      }
    }

    void refreshStoredBadgeFromState();
    window.addEventListener("focus", refreshStoredBadgeFromState);
    document.addEventListener("visibilitychange", refreshStoredBadgeFromState);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", refreshStoredBadgeFromState);
      document.removeEventListener("visibilitychange", refreshStoredBadgeFromState);
    };
  }, [alertsCount]);

  return (
    <>
      {open ? (
        <div className="fixed inset-0 z-50 bg-zinc-950/25 px-3 py-6 backdrop-blur-sm">
          <div className="relative mx-auto flex h-[82vh] max-h-[720px] min-h-[620px] w-full max-w-md flex-col overflow-hidden rounded-[2rem] bg-[var(--hewie-active-bg,#f1f5f9)] shadow-2xl ring-1 ring-[var(--hewie-ring,#cbd5e1)]">
            <div
              className="absolute inset-0 bg-cover bg-center grayscale"
              style={{ backgroundImage: "url('/hewster-profile.jpg')" }}
              aria-hidden="true"
            />
            <div className="absolute inset-0 bg-[var(--hewie-bg,#979ca7)]/34" aria-hidden="true" />
            <div className="relative flex items-center justify-between bg-[var(--hewie-active-bg,#f1f5f9)]/92 px-6 py-5 text-[var(--hewie-active-text,#334155)] shadow-sm backdrop-blur-[1px]">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--hewie-active-text,#334155)]/70"><PetNotebookTitle /></p>
                <h2 className="text-2xl font-semibold text-[var(--hewie-active-text,#334155)]">Pages</h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex size-10 items-center justify-center rounded-full bg-white/85 text-[var(--hewie-active-text,#334155)] shadow-sm"
                aria-label="Close notebook menu"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="relative flex flex-1 items-center overflow-y-auto px-6 py-10">
              <div className="grid w-full grid-cols-3 justify-items-center gap-x-6 gap-y-10">
                {pages.map((item) => {
                  const Icon = item.icon;
                  const active = pathname === item.href || (item.href === APP_BASE && pathname === "/");
                  const showBadge = item.badge && activeAlertsCount > 0;

                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className="group relative text-center"
                    >
                      <span
                        className={`relative flex size-[4.75rem] flex-col items-center justify-center gap-1 rounded-[1.45rem] shadow-sm transition group-hover:-translate-y-0.5 ${
                          active
                            ? "bg-[var(--hewie-accent,#64748b)] text-[var(--hewie-accent-text,#ffffff)]"
                            : "bg-[var(--hewie-bg,#979ca7)] text-[var(--hewie-accent-text,#ffffff)] group-hover:bg-[var(--hewie-accent,#64748b)]"
                        }`}
                      >
                        {item.iconKind === "paw" ? <PawIcon /> : Icon ? <Icon className="size-5" strokeWidth={2.25} /> : null}
                        {showBadge ? (
                          <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[var(--hewie-accent,#64748b)] px-1.5 text-[11px] font-bold text-[var(--hewie-accent-text,#ffffff)] ring-2 ring-[var(--hewie-active-bg,#f1f5f9)]">
                            {activeAlertsCount > 9 ? "9+" : activeAlertsCount}
                          </span>
                        ) : null}
                        <span className="text-[13px] font-bold leading-tight text-[var(--hewie-accent-text,#ffffff)]">{item.label}</span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] right-[max(1rem,calc((100vw-28rem)/2+1rem))] z-[60] flex size-[4.25rem] items-center justify-center rounded-[1.45rem] bg-[var(--hewie-accent,#64748b)] text-[var(--hewie-accent-text,#ffffff)] shadow-[0_16px_34px_rgba(15,23,42,0.28)] ring-2 ring-white/85 transition hover:scale-105"
        aria-label="Open notebook pages"
      >
        <NotebookTabs className="size-8 drop-shadow-sm" strokeWidth={2.6} />
        {activeAlertsCount > 0 ? (
          <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[var(--hewie-accent,#64748b)] px-1.5 text-[11px] font-bold text-[var(--hewie-accent-text,#ffffff)] ring-2 ring-white">
            {activeAlertsCount > 9 ? "9+" : activeAlertsCount}
          </span>
        ) : null}
      </button>
    </>
  );
}
