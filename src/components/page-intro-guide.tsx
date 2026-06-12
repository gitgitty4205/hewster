"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CircleHelp, X } from "lucide-react";

const PAGE_GUIDE_STORAGE_KEY = "hewster.pageIntro.completed";
const PAGE_GUIDE_STEP_STORAGE_KEY = "hewster.pageIntro.step";

type GuideStep = {
  title: string;
  href: string;
  target: string;
  text: string;
};

type GuideRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

const guideSteps: GuideStep[] = [
  { title: "Today's Page", href: "/hewie", target: "today-upcoming", text: "View upcoming meals, supplements, medications, and reminders." },
  { title: "Quick Log", href: "/hewie", target: "today-quick-log", text: "Tap an icon to quickly log an event. Swipe for more event types." },
  { title: "Poop Records", href: "/hewie", target: "today-poop-records", text: "View recent stool history." },
  { title: "Manage Events", href: "/hewie/log", target: "log-events", text: "Open the log menu to add new events." },
  { title: "Today's Events", href: "/hewie/log", target: "log-review", text: "Logged events show here. After you add one, tap it to view or edit details." },
  { title: "Today's Meal Plan", href: "/hewie/log", target: "log-meal-plan", text: "Meals from your saved meal plan appear here. Tap any meal to view or edit details." },
  { title: "Health Records", href: "/hewie/medical-records", target: "medical-records", text: "Quickly find health records, medications, and documents." },
  { title: "Alerts & Reminders", href: "/hewie/alerts", target: "alerts-reminders", text: "Keep everyone on the same page with alerts, reminders, and important care notes." },
  { title: "Notebook Sharing", href: "/hewie/profile", target: "profile-sharing", text: "Invite family, caretakers, and pet sitters to help care for your pet and log events together." },
  { title: "Settings", href: "/hewie/settings", target: "settings-schedules", text: "Create meal, supplement, and medication schedules. PetNotebook uses them to generate reminders and upcoming items automatically." },
];

function currentPathMatches(pathname: string, href: string) {
  return pathname === href || (href === "/hewie" && pathname === "/");
}

function clampStepIndex(value: number) {
  return Math.min(Math.max(value, 0), guideSteps.length - 1);
}

function toGuideRect(rect: DOMRect): GuideRect {
  return {
    left: Math.round(rect.left),
    top: Math.round(rect.top),
    right: Math.round(rect.right),
    bottom: Math.round(rect.bottom),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

function rectsMatch(a: GuideRect | null, b: GuideRect) {
  return (
    a !== null &&
    Math.abs(a.left - b.left) <= 1 &&
    Math.abs(a.top - b.top) <= 1 &&
    Math.abs(a.width - b.width) <= 1 &&
    Math.abs(a.height - b.height) <= 1
  );
}

export function PageIntroGuide() {
  const pathname = usePathname();
  const router = useRouter();
  const [step, setStep] = useState<number | null>(null);
  const [targetRect, setTargetRect] = useState<GuideRect | null>(null);

  useEffect(() => {
    if (window.localStorage.getItem(PAGE_GUIDE_STORAGE_KEY) === "true") return;

    const storedStep = Number.parseInt(window.localStorage.getItem(PAGE_GUIDE_STEP_STORAGE_KEY) ?? "0", 10);
    const nextStep = Number.isFinite(storedStep) ? clampStepIndex(storedStep) : 0;
    queueMicrotask(() => setStep(nextStep));
  }, []);

  const currentStep = step === null ? null : guideSteps[step];
  const isViewingCurrentPage = currentStep ? currentPathMatches(pathname, currentStep.href) : false;

  useEffect(() => {
    if (!currentStep || !isViewingCurrentPage) {
      queueMicrotask(() => setTargetRect(null));
      return;
    }

    let frameId = 0;
    let scrollTimeoutId = 0;
    let resizeObserver: ResizeObserver | null = null;

    const measureTarget = () => {
      const target = document.querySelector<HTMLElement>(`[data-guide="${currentStep.target}"]`);
      if (!target) {
        setTargetRect(null);
        return;
      }

      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        const nextRect = toGuideRect(target.getBoundingClientRect());
        setTargetRect((previousRect) => (rectsMatch(previousRect, nextRect) ? previousRect : nextRect));
      });
    };

    const target = document.querySelector<HTMLElement>(`[data-guide="${currentStep.target}"]`);
    if (target) {
      target.scrollIntoView({ block: "center", behavior: "smooth" });
      resizeObserver = new ResizeObserver(measureTarget);
      resizeObserver.observe(target);
    }

    const timeoutId = window.setTimeout(measureTarget, 80);
    scrollTimeoutId = window.setTimeout(measureTarget, 380);
    window.addEventListener("resize", measureTarget);
    window.addEventListener("scroll", measureTarget, true);

    return () => {
      window.clearTimeout(timeoutId);
      window.clearTimeout(scrollTimeoutId);
      window.cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", measureTarget);
      window.removeEventListener("scroll", measureTarget, true);
    };
  }, [currentStep, isViewingCurrentPage]);

  const cardStyle = useMemo(() => {
    if (!targetRect) return undefined;

    const cardWidth = Math.min(320, window.innerWidth - 32);
    const left = Math.min(Math.max(16, targetRect.left), window.innerWidth - cardWidth - 16);
    const hasRoomBelow = targetRect.bottom + 148 < window.innerHeight;
    const top = hasRoomBelow ? targetRect.bottom + 10 : Math.max(16, targetRect.top - 132);

    return { left, top, width: cardWidth };
  }, [targetRect]);

  const startGuide = () => {
    window.localStorage.removeItem(PAGE_GUIDE_STORAGE_KEY);
    window.localStorage.setItem(PAGE_GUIDE_STEP_STORAGE_KEY, "0");
    setStep(0);
    router.push(guideSteps[0].href);
  };

  const finishGuide = () => {
    window.localStorage.setItem(PAGE_GUIDE_STORAGE_KEY, "true");
    window.localStorage.removeItem(PAGE_GUIDE_STEP_STORAGE_KEY);
    setStep(null);
  };

  const goToStep = (nextStep: number) => {
    const safeStep = clampStepIndex(nextStep);
    window.localStorage.setItem(PAGE_GUIDE_STEP_STORAGE_KEY, String(safeStep));
    setStep(safeStep);
    router.push(guideSteps[safeStep].href);
  };

  if (step === null || !currentStep) {
    return (
      <button
        type="button"
        onClick={startGuide}
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] left-4 z-[65] inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-2 text-xs font-bold text-[var(--hewie-active-text,#334155)] shadow-sm ring-1 ring-[var(--hewie-ring,#cbd5e1)] backdrop-blur"
      >
        <CircleHelp className="size-4" />
        Guide
      </button>
    );
  }

  const activeStepIndex = step;
  const isLastStep = step === guideSteps.length - 1;
  const isFirstStep = step === 0;
  const spotlightStyle = targetRect
    ? {
        left: Math.max(8, targetRect.left - 6),
        top: Math.max(8, targetRect.top - 6),
        width: Math.min(window.innerWidth - 16, targetRect.width + 12),
        height: targetRect.height + 12,
      }
    : undefined;

  return (
    <>
      <div className="pointer-events-none fixed inset-0 z-[88] bg-zinc-950/20" />
      {spotlightStyle ? (
        <div
          className="pointer-events-none fixed z-[89] rounded-[1.6rem] ring-2 ring-white shadow-[0_0_0_9999px_rgba(15,23,42,0.22),0_12px_32px_rgba(15,23,42,0.22)]"
          style={spotlightStyle}
        />
      ) : null}

      <section
        className="fixed z-[90] rounded-[1.4rem] bg-white p-4 text-zinc-900 shadow-[0_18px_48px_rgba(15,23,42,0.24)] ring-1 ring-zinc-200"
        style={cardStyle ?? { left: "50%", bottom: "calc(env(safe-area-inset-bottom) + 1rem)", width: "min(20rem, calc(100vw - 2rem))", transform: "translateX(-50%)" }}
        role="status"
        aria-labelledby="page-guide-title"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-400">
              {activeStepIndex + 1} of {guideSteps.length}
            </p>
            <h2 id="page-guide-title" className="mt-1 text-base font-bold tracking-tight text-zinc-900">
              {currentStep.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={finishGuide}
            className="flex size-7 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200"
            aria-label="Close guide"
          >
            <X className="size-3.5" />
          </button>
        </div>

        <p className="mt-2 text-sm leading-5 text-zinc-600">{currentStep.text}</p>

        {!isViewingCurrentPage ? (
          <button
            type="button"
            onClick={() => router.push(currentStep.href)}
            className="mt-3 h-9 rounded-full bg-zinc-900 px-4 text-xs font-bold text-white"
          >
            View Page
          </button>
        ) : null}

        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => isFirstStep ? finishGuide() : goToStep(step - 1)}
            className="h-9 rounded-full bg-zinc-100 px-4 text-xs font-bold text-zinc-600 ring-1 ring-zinc-200"
          >
            {isFirstStep ? "Skip" : "Back"}
          </button>
          <button
            type="button"
            onClick={() => isLastStep ? finishGuide() : goToStep(step + 1)}
            className="h-9 rounded-full bg-[var(--hewie-accent,#64748b)] px-4 text-xs font-bold text-[var(--hewie-accent-text,#ffffff)]"
          >
            {isLastStep ? "Done" : "Next"}
          </button>
        </div>
      </section>
    </>
  );
}
