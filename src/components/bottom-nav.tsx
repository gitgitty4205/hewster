"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type CSSProperties, type SVGProps, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { PetNotebookTitle } from "@/components/pet-notebook-title";
import { useAuth } from "@/components/auth-provider";
import {
  ALERT_BADGE_COUNT_STORAGE_KEY,
  loadReminderAlertRules,
  resolveAlerts,
} from "@/lib/alerts";
import { loadCareTemplates } from "@/lib/care-settings";
import { loadAppState } from "@/lib/hewster-data";
import { PET_THEME_UPDATED_EVENT, applyPetTheme, loadUserTheme } from "@/lib/pet-profile";

type Props = {
  alertsCount?: number;
};

const APP_BASE = "/hewie";
const FLOATING_MENU_POSITION_STORAGE_KEY = "hewster.floatingMenuPosition";
const FLOATING_MENU_EDGE_GAP = 12;
const MENU_TYPE_STYLE = {
  fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
} satisfies CSSProperties;

type FloatingMenuPosition = {
  x: number;
  y: number;
};

function MinimalIcon({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

function TodayIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <MinimalIcon {...props}>
      <path d="M7 4.8h10a2.2 2.2 0 0 1 2.2 2.2v10A2.2 2.2 0 0 1 17 19.2H7A2.2 2.2 0 0 1 4.8 17V7A2.2 2.2 0 0 1 7 4.8Z" />
      <path d="M8.2 9.2h7.6" />
      <path d="M9 3.8v2.1M15 3.8v2.1" />
      <path d="M9.2 13.1h5.6" />
    </MinimalIcon>
  );
}

function EventsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <MinimalIcon {...props}>
      <path d="M7 5.2h10a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7.2a2 2 0 0 1 2-2Z" />
      <path d="M8.4 9.1h7.2M8.4 12h5.3M8.4 14.9h6.3" />
    </MinimalIcon>
  );
}

function HistoryIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <MinimalIcon {...props}>
      <path d="M5.1 12a6.9 6.9 0 1 0 2-4.9" />
      <path d="M5.1 6v4h4" />
      <path d="M12 8.5v4l2.8 1.6" />
    </MinimalIcon>
  );
}

function HealthIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <MinimalIcon {...props}>
      <path d="M12 19.1s-6.5-3.8-6.5-8.7A3.9 3.9 0 0 1 12 7.5a3.9 3.9 0 0 1 6.5 2.9c0 4.9-6.5 8.7-6.5 8.7Z" />
      <path d="M12 9.5v4.6M9.7 11.8h4.6" />
    </MinimalIcon>
  );
}

function WeightIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <MinimalIcon {...props}>
      <path d="M7.2 19.1h9.6a2 2 0 0 0 2-2.3l-1.1-7.4a2.2 2.2 0 0 0-2.2-1.9h-7a2.2 2.2 0 0 0-2.2 1.9l-1.1 7.4a2 2 0 0 0 2 2.3Z" />
      <path d="M9.4 10.4a2.8 2.8 0 0 1 5.2 0" />
      <path d="M12 10.5l1-1.5" />
    </MinimalIcon>
  );
}

function FitnessIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <MinimalIcon {...props}>
      <path d="M4.5 13.2h3l2-5.4 3.4 9 2.2-5.1h4.4" />
    </MinimalIcon>
  );
}

function AlertsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <MinimalIcon {...props}>
      <path d="M7.2 16.5h9.6l-1-1.7V11a3.8 3.8 0 0 0-7.6 0v3.8l-1 1.7Z" />
      <path d="M10.4 18.2a1.8 1.8 0 0 0 3.2 0" />
      <path d="M12 4.3v1.5" />
    </MinimalIcon>
  );
}

function ProfileIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <MinimalIcon {...props}>
      <path d="M12 12.4a3.1 3.1 0 1 0 0-6.2 3.1 3.1 0 0 0 0 6.2Z" />
      <path d="M6.7 18.2a5.7 5.7 0 0 1 10.6 0" />
    </MinimalIcon>
  );
}

function SettingsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <MinimalIcon {...props}>
      <path d="M5 7.5h14M5 16.5h14" />
      <path d="M9 5.5v4M15 14.5v4" />
    </MinimalIcon>
  );
}

const pages = [
  { label: "Today", href: `${APP_BASE}`, icon: TodayIcon },
  { label: "Events", href: `${APP_BASE}/log`, icon: EventsIcon },
  { label: "History", href: `${APP_BASE}/history`, icon: HistoryIcon },
  { label: "Health", href: `${APP_BASE}/medical-records`, icon: HealthIcon },
  { label: "Weight", href: `${APP_BASE}/weight`, icon: WeightIcon },
  { label: "Fitness", href: `${APP_BASE}/activity`, icon: FitnessIcon },
  { label: "Alerts", href: `${APP_BASE}/alerts`, icon: AlertsIcon, badge: true },
  { label: "Profile", href: `${APP_BASE}/profile`, icon: ProfileIcon },
  { label: "Settings", href: `${APP_BASE}/settings`, icon: SettingsIcon },
];

function BrandNotebookIcon() {
  return (
    <img
      src="/paw-notes-transparent.svg"
      alt=""
      className="h-[3.25rem] w-[3.25rem] object-contain drop-shadow-[0_5px_7px_rgba(15,23,42,0.34)] contrast-[1.04] saturate-[1.06]"
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

function floatingMenuPositionStorageKey(userId?: string | null) {
  return userId ? `${FLOATING_MENU_POSITION_STORAGE_KEY}.${userId}` : FLOATING_MENU_POSITION_STORAGE_KEY;
}

function clampFloatingMenuPosition(position: FloatingMenuPosition, width: number, height: number) {
  if (typeof window === "undefined") return position;

  return {
    x: Math.min(Math.max(FLOATING_MENU_EDGE_GAP, position.x), Math.max(FLOATING_MENU_EDGE_GAP, window.innerWidth - width - FLOATING_MENU_EDGE_GAP)),
    y: Math.min(Math.max(FLOATING_MENU_EDGE_GAP, position.y), Math.max(FLOATING_MENU_EDGE_GAP, window.innerHeight - height - FLOATING_MENU_EDGE_GAP)),
  };
}

function readFloatingMenuPosition(userId?: string | null) {
  if (typeof window === "undefined") return null;

  try {
    const stored = window.localStorage.getItem(floatingMenuPositionStorageKey(userId));
    if (!stored) return null;

    const parsed = JSON.parse(stored);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof parsed.x === "number" &&
      typeof parsed.y === "number" &&
      Number.isFinite(parsed.x) &&
      Number.isFinite(parsed.y)
    ) {
      return parsed as FloatingMenuPosition;
    }
  } catch {
    return null;
  }

  return null;
}

export function BottomNav({ alertsCount }: Props) {
  const { user } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [floatingMenuPosition, setFloatingMenuPosition] = useState<FloatingMenuPosition | null>(null);
  const [draggingFloatingMenu, setDraggingFloatingMenu] = useState(false);
  const floatingMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const floatingMenuDragRef = useRef<{
    pointerId: number;
    moved: boolean;
    offsetX: number;
    offsetY: number;
    startX: number;
    startY: number;
  } | null>(null);
  const floatingMenuDragCleanupRef = useRef<(() => void) | null>(null);
  const storedAlertsCountSnapshot = useSyncExternalStore(subscribeToStoredAlertsCount, loadStoredAlertsCountSnapshot, () => "0");
  const storedAlertsCount = normalizeStoredAlertsCount(storedAlertsCountSnapshot);
  const activeAlertsCount = alertsCount ?? storedAlertsCount;

  useEffect(() => {
    const savedPosition = readFloatingMenuPosition(user?.id);
    if (!savedPosition) {
      setFloatingMenuPosition(null);
      return;
    }

    const rect = floatingMenuButtonRef.current?.getBoundingClientRect();
    setFloatingMenuPosition(clampFloatingMenuPosition(savedPosition, rect?.width ?? 68, rect?.height ?? 68));
  }, [user?.id]);

  useEffect(() => {
    const refreshTheme = () => applyPetTheme(loadUserTheme(user?.id));
    refreshTheme();
    window.addEventListener(PET_THEME_UPDATED_EVENT, refreshTheme);
    window.addEventListener("storage", refreshTheme);
    return () => {
      window.removeEventListener(PET_THEME_UPDATED_EVENT, refreshTheme);
      window.removeEventListener("storage", refreshTheme);
    };
  }, [user?.id]);

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

  useEffect(() => {
    if (!floatingMenuPosition) return;

    const keepFloatingMenuOnScreen = () => {
      const rect = floatingMenuButtonRef.current?.getBoundingClientRect();
      setFloatingMenuPosition((position) => {
        if (!position) return null;
        const nextPosition = clampFloatingMenuPosition(position, rect?.width ?? 68, rect?.height ?? 68);
        window.localStorage.setItem(floatingMenuPositionStorageKey(user?.id), JSON.stringify(nextPosition));
        return nextPosition;
      });
    };

    window.addEventListener("resize", keepFloatingMenuOnScreen);
    window.addEventListener("orientationchange", keepFloatingMenuOnScreen);
    return () => {
      window.removeEventListener("resize", keepFloatingMenuOnScreen);
      window.removeEventListener("orientationchange", keepFloatingMenuOnScreen);
    };
  }, [floatingMenuPosition, user?.id]);

  useEffect(() => () => floatingMenuDragCleanupRef.current?.(), []);

  const moveFloatingMenu = (clientX: number, clientY: number) => {
    const drag = floatingMenuDragRef.current;
    const rect = floatingMenuButtonRef.current?.getBoundingClientRect();
    if (!drag || !rect) return;

    const dragDistance = Math.hypot(clientX - drag.startX, clientY - drag.startY);
    if (!drag.moved && dragDistance < 5) return;

    const nextPosition = clampFloatingMenuPosition(
      {
        x: clientX - drag.offsetX,
        y: clientY - drag.offsetY,
      },
      rect.width,
      rect.height
    );

    drag.moved = true;
    setFloatingMenuPosition(nextPosition);
    window.localStorage.setItem(floatingMenuPositionStorageKey(user?.id), JSON.stringify(nextPosition));
  };

  return (
    <>
      {open ? (
        <div className="fixed inset-0 z-[70] overflow-y-auto bg-zinc-950/25 px-3 py-4 backdrop-blur-sm sm:py-6">
          <div className="relative mx-auto flex h-[calc(100dvh-2rem)] max-h-[720px] min-h-0 w-full max-w-md flex-col overflow-hidden rounded-[2rem] bg-[var(--hewie-active-bg,#f1f5f9)] shadow-2xl ring-1 ring-[var(--hewie-ring,#cbd5e1)] sm:h-[82vh] sm:min-h-[620px]" style={MENU_TYPE_STYLE}>
            <div
              className="absolute inset-0 bg-cover bg-center grayscale"
              style={{ backgroundImage: "url('/hewster-profile.jpg')" }}
              aria-hidden="true"
            />
            <div className="absolute inset-0 bg-[var(--hewie-bg,#979ca7)]/34" aria-hidden="true" />
            <div className="relative flex items-center justify-between bg-[var(--hewie-active-bg,#f1f5f9)]/92 px-6 py-5 text-[var(--hewie-active-text,#334155)] shadow-sm backdrop-blur-[1px]">
              <div>
                <p className="text-[11px] font-normal uppercase tracking-[0.14em] text-[var(--hewie-active-text,#334155)]/55"><PetNotebookTitle /></p>
                <h2 className="mt-1 text-[1.58rem] font-normal leading-none text-[var(--hewie-active-text,#334155)]">Pages</h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex size-10 items-center justify-center rounded-full bg-white/80 text-[var(--hewie-active-text,#334155)] shadow-sm"
                aria-label="Close notebook menu"
              >
                <X className="size-5" strokeWidth={1.7} />
              </button>
            </div>

            <div className="relative flex flex-1 items-center overflow-y-auto px-7 py-8 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] sm:py-10">
              <div className="grid w-full grid-cols-3 justify-items-center gap-x-7 gap-y-10">
                {pages.map((item) => {
                  const Icon = item.icon;
                  const active = pathname === item.href || (item.href === APP_BASE && pathname === "/");
                  const showBadge = item.badge && activeAlertsCount > 0;

                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={`group relative flex min-h-[4.75rem] w-[5.1rem] flex-col items-center justify-center gap-2 text-center transition ${
                        active
                          ? "text-[var(--hewie-accent-text,#ffffff)]"
                          : "text-[var(--hewie-accent-text,#ffffff)]/76 hover:text-[var(--hewie-accent-text,#ffffff)]"
                      }`}
                    >
                      <span
                        className="relative flex size-9 items-center justify-center drop-shadow-[0_1px_3px_rgba(15,23,42,0.28)] transition group-hover:-translate-y-0.5"
                      >
                        {Icon ? <Icon className="size-[1.7rem]" strokeWidth={1.25} /> : null}
                        {showBadge ? (
                          <span className="absolute -right-2 -top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-[var(--hewie-accent,#64748b)] px-1 text-[10px] font-semibold text-[var(--hewie-accent-text,#ffffff)] ring-2 ring-[var(--hewie-active-bg,#f1f5f9)]">
                            {activeAlertsCount > 9 ? "9+" : activeAlertsCount}
                          </span>
                        ) : null}
                      </span>
                      <span className="max-w-[5rem] text-[11.5px] font-normal leading-none tracking-normal drop-shadow-[0_1px_3px_rgba(15,23,42,0.42)]">{item.label}</span>
                      {active ? <span className="mt-0.5 h-0.5 w-5 rounded-full bg-current" aria-hidden="true" /> : <span className="mt-0.5 h-0.5 w-5" aria-hidden="true" />}
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {!open ? (
      <button
        ref={floatingMenuButtonRef}
        type="button"
        onClick={() => {
          if (floatingMenuDragRef.current?.moved) {
            floatingMenuDragRef.current = null;
            return;
          }

          setOpen(true);
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();

          const rect = event.currentTarget.getBoundingClientRect();
          floatingMenuDragCleanupRef.current?.();
          floatingMenuDragRef.current = {
            pointerId: event.pointerId,
            moved: false,
            offsetX: event.clientX - rect.left,
            offsetY: event.clientY - rect.top,
            startX: event.clientX,
            startY: event.clientY,
          };
          const handlePointerMove = (moveEvent: PointerEvent) => {
            if (floatingMenuDragRef.current?.pointerId !== moveEvent.pointerId) return;
            moveEvent.preventDefault();
            moveFloatingMenu(moveEvent.clientX, moveEvent.clientY);
          };
          const handleMouseMove = (moveEvent: MouseEvent) => {
            moveEvent.preventDefault();
            moveFloatingMenu(moveEvent.clientX, moveEvent.clientY);
          };
          const stopDragging = (stopEvent: PointerEvent) => {
            if (floatingMenuDragRef.current?.pointerId !== stopEvent.pointerId) return;
            setDraggingFloatingMenu(false);
            floatingMenuDragCleanupRef.current?.();
          };
          const stopMouseDragging = () => {
            setDraggingFloatingMenu(false);
            floatingMenuDragCleanupRef.current?.();
          };
          floatingMenuDragCleanupRef.current = () => {
            window.removeEventListener("pointermove", handlePointerMove, true);
            window.removeEventListener("pointerup", stopDragging, true);
            window.removeEventListener("mousemove", handleMouseMove, true);
            window.removeEventListener("mouseup", stopMouseDragging, true);
            floatingMenuDragCleanupRef.current = null;
          };
          window.addEventListener("pointermove", handlePointerMove, true);
          window.addEventListener("pointerup", stopDragging, true);
          window.addEventListener("mousemove", handleMouseMove, true);
          window.addEventListener("mouseup", stopMouseDragging, true);
          setDraggingFloatingMenu(true);
        }}
        onPointerUp={(event) => {
          if (floatingMenuDragRef.current?.pointerId !== event.pointerId) return;
          setDraggingFloatingMenu(false);
        }}
        className={`fixed z-[60] flex size-[4.25rem] touch-none select-none items-center justify-center rounded-[1.45rem] bg-[var(--hewie-accent,#64748b)] shadow-[0_16px_34px_rgba(15,23,42,0.28)] transition hover:scale-105 ${
          floatingMenuPosition ? "" : "bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] right-[max(1rem,calc((100vw-28rem)/2+1rem))]"
        } ${draggingFloatingMenu ? "cursor-grabbing scale-105" : "cursor-grab"}`}
        style={floatingMenuPosition ? { left: `${floatingMenuPosition.x}px`, top: `${floatingMenuPosition.y}px` } : undefined}
        aria-label="Open notebook pages"
      >
        <BrandNotebookIcon />
        {activeAlertsCount > 0 ? (
          <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[var(--hewie-accent,#64748b)] px-1.5 text-[11px] font-bold text-[var(--hewie-accent-text,#ffffff)] ring-2 ring-white">
            {activeAlertsCount > 9 ? "9+" : activeAlertsCount}
          </span>
        ) : null}
      </button>
      ) : null}
    </>
  );
}
