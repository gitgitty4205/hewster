"use client";

import {
  Activity,
  BellPlus,
  Bookmark,
  FileHeart,
  History,
  Settings2,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type CSSProperties, useEffect, useRef, useState, useSyncExternalStore } from "react";

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
const MENU_FONT_STYLE = {
  fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
} satisfies CSSProperties;

type FloatingMenuPosition = {
  x: number;
  y: number;
};

const pages = [
  { label: "Today", href: `${APP_BASE}`, icon: Bookmark },
  { label: "Event Details", href: `${APP_BASE}/log`, iconKind: "pencil" },
  { label: "History", href: `${APP_BASE}/history`, icon: History },
  { label: "Health", href: `${APP_BASE}/medical-records`, icon: FileHeart },
  { label: "Weight", href: `${APP_BASE}/weight`, iconKind: "weight" },
  { label: "Fitness", href: `${APP_BASE}/activity`, icon: Activity },
  { label: "Alerts", href: `${APP_BASE}/alerts`, icon: BellPlus, badge: true },
  { label: "Profile", href: `${APP_BASE}/profile`, iconKind: "paw" },
  { label: "Settings", href: `${APP_BASE}/settings`, icon: Settings2 },
];

function PawIcon() {
  return (
    <span
      className="block size-[1.9rem] bg-current"
      style={{
        WebkitMask: "url('/paw-print.svg') center / contain no-repeat",
        mask: "url('/paw-print.svg') center / contain no-repeat",
      }}
      aria-hidden="true"
    />
  );
}

function PencilIcon() {
  return (
    <svg
      className="size-[2.08rem]"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <path d="M5.2 18.8 6.4 14 15.8 4.6a2 2 0 0 1 2.8 0l.8.8a2 2 0 0 1 0 2.8L10 17.6l-4.8 1.2Z" />
      <path d="m14.3 6.1 3.6 3.6" />
      <path d="m6.4 14 3.6 3.6" />
    </svg>
  );
}

function WeightIcon() {
  return (
    <svg
      className="size-[2.05rem]"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      <path d="M7.6 20.1h8.8a3.2 3.2 0 0 0 3.2-3.5l-.7-7.9a4.2 4.2 0 0 0-4.2-3.8H9.3a4.2 4.2 0 0 0-4.2 3.8l-.7 7.9a3.2 3.2 0 0 0 3.2 3.5Z" />
      <path d="M8.4 9.5c.5-1.2 1.7-1.9 3.6-1.9s3.1.7 3.6 1.9l-.8 2.2c-.2.5-.7.8-1.2.7a9.2 9.2 0 0 0-3.2 0c-.5.1-1-.2-1.2-.7l-.8-2.2Z" />
      <path d="M12 11.2V8.9" />
    </svg>
  );
}

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
          <div className="relative mx-auto flex h-[calc(100dvh-2rem)] max-h-[720px] min-h-0 w-full max-w-md flex-col overflow-hidden rounded-[2rem] bg-[var(--hewie-active-bg,#f1f5f9)] shadow-2xl ring-1 ring-[var(--hewie-ring,#cbd5e1)] sm:h-[82vh] sm:min-h-[620px]" style={MENU_FONT_STYLE}>
            <div
              className="absolute inset-0 bg-cover bg-center opacity-75 grayscale contrast-90 saturate-75"
              style={{ backgroundImage: "url('/hewster-profile.jpg')" }}
              aria-hidden="true"
            />
            <div
              className="absolute inset-0 backdrop-blur-[0.6px]"
              style={{
                background:
                  "linear-gradient(180deg, color-mix(in srgb, var(--hewie-active-bg,#f1f5f9) 64%, transparent) 0%, color-mix(in srgb, var(--hewie-bg,#979ca7) 34%, transparent) 44%, color-mix(in srgb, var(--hewie-active-bg,#f1f5f9) 50%, transparent) 100%)",
              }}
              aria-hidden="true"
            />
            <div className="relative flex items-center justify-between bg-[var(--hewie-active-bg,#f1f5f9)]/92 px-6 py-5 text-[var(--hewie-active-text,#334155)] shadow-sm backdrop-blur-[1px]">
              <div>
                <p className="text-[11px] font-normal uppercase tracking-normal text-[var(--hewie-active-text,#334155)]/62"><PetNotebookTitle /></p>
                <h2 className="mt-0.5 text-[1.55rem] font-normal leading-none tracking-normal text-[var(--hewie-active-text,#334155)]">Pages</h2>
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

            <div className="relative flex flex-1 items-center overflow-y-auto px-6 py-8 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] sm:py-10">
              <div className="grid w-full grid-cols-3 justify-items-center gap-x-6 gap-y-9">
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
                      aria-label={item.label}
                    >
                      <span
                        className={`relative flex size-[4.65rem] items-center justify-center rounded-[1.2rem] shadow-sm ring-1 ring-white/18 transition group-hover:-translate-y-0.5 ${
                          active
                            ? "bg-[var(--hewie-accent,#64748b)]/95 text-[var(--hewie-accent-text,#ffffff)] shadow-[0_10px_24px_rgba(15,23,42,0.16)] ring-white/30 backdrop-blur-[1.5px]"
                            : "bg-[var(--hewie-bg,#979ca7)]/86 text-[var(--hewie-accent-text,#ffffff)] shadow-[0_10px_24px_rgba(15,23,42,0.12)] ring-white/28 backdrop-blur-[1.5px] group-hover:bg-[var(--hewie-accent,#64748b)]/92"
                        }`}
                      >
                        {item.iconKind === "paw" ? <PawIcon /> : item.iconKind === "weight" ? <WeightIcon /> : item.iconKind === "pencil" ? <PencilIcon /> : Icon ? <Icon className="size-[1.72rem]" strokeWidth={1.65} /> : null}
                        {showBadge ? (
                          <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[var(--hewie-accent,#64748b)] px-1.5 text-[11px] font-bold text-[var(--hewie-accent-text,#ffffff)] ring-2 ring-[var(--hewie-active-bg,#f1f5f9)]">
                            {activeAlertsCount > 9 ? "9+" : activeAlertsCount}
                          </span>
                        ) : null}
                        <span className="sr-only">{item.label}</span>
                      </span>
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
