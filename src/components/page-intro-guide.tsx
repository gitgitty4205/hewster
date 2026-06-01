"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const PAGE_INTRO_STORAGE_KEY = "hewster.pageIntro.completed";
const PAGE_INTRO_STEP_STORAGE_KEY = "hewster.pageIntro.step";

const introPages = [
  {
    title: "Today",
    href: "/hewie",
    description: "See today's meals, care reminders, alerts, potty notes, and recent events in one place.",
  },
  {
    title: "Event Details",
    href: "/hewie/log",
    description: "Log meals, potty breaks, treats, symptoms, notes, medication, supplements, and attachments.",
  },
  {
    title: "History",
    href: "/hewie/history",
    description: "Review meals, activities, notes, alerts, and weight entries by day or filter.",
  },
  {
    title: "Health Records",
    href: "/hewie/medical-records",
    description: "Keep vet visits, health notes, and medical attachments easy to find.",
  },
  {
    title: "Weight",
    href: "/hewie/weight",
    description: "Save weight entries and track changes over time.",
  },
  {
    title: "Fitness",
    href: "/hewie/activity",
    description: "View tracker summaries and activity details.",
  },
  {
    title: "Alerts",
    href: "/hewie/alerts",
    description: "Create reminders for anything that needs special attention.",
  },
  {
    title: "Pet Profile",
    href: "/hewie/profile",
    description: "Edit pet info, profile photo, care notes, sharing, and theme settings.",
  },
  {
    title: "Settings",
    href: "/hewie/settings",
    description: "Manage saved plans, supplements, medications, account options, and notebook setup.",
  },
];

export function PageIntroGuide() {
  const pathname = usePathname();
  const router = useRouter();
  const [step, setStep] = useState<number | null>(null);

  useEffect(() => {
    if (window.localStorage.getItem(PAGE_INTRO_STORAGE_KEY) !== "true") {
      const storedStep = Number.parseInt(window.localStorage.getItem(PAGE_INTRO_STEP_STORAGE_KEY) ?? "0", 10);
      setStep(Number.isFinite(storedStep) ? Math.min(Math.max(storedStep, 0), introPages.length - 1) : 0);
    }
  }, []);

  if (step === null) return null;

  const currentPage = introPages[step];
  const isLastStep = step === introPages.length - 1;
  const isViewingCurrentPage = pathname === currentPage.href || (currentPage.href === "/hewie" && pathname === "/");

  const finishIntro = () => {
    window.localStorage.setItem(PAGE_INTRO_STORAGE_KEY, "true");
    window.localStorage.removeItem(PAGE_INTRO_STEP_STORAGE_KEY);
    setStep(null);
  };

  const goToStep = (nextStep: number) => {
    window.localStorage.setItem(PAGE_INTRO_STEP_STORAGE_KEY, String(nextStep));
    setStep(nextStep);
    router.push(introPages[nextStep].href);
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[90] px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
      <section
        className="pointer-events-auto mx-auto w-full max-w-md rounded-[1.4rem] bg-[var(--hewie-active-bg,#f1f5f9)]/95 p-4 text-[var(--hewie-active-text,#334155)] shadow-[0_16px_42px_rgba(15,23,42,0.18)] ring-1 ring-[var(--hewie-ring,#cbd5e1)] backdrop-blur-md"
        role="status"
        aria-labelledby="page-intro-title"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] opacity-60">
              Page {step + 1} of {introPages.length}
            </p>
            <h2 id="page-intro-title" className="mt-1 text-lg font-bold tracking-tight">
              {currentPage.title}
            </h2>
          </div>
          {!isViewingCurrentPage ? (
            <button
              type="button"
              onClick={() => router.push(currentPage.href)}
              className="shrink-0 rounded-full bg-white/70 px-3 py-1.5 text-xs font-bold text-[var(--hewie-active-text,#334155)] shadow-sm ring-1 ring-[var(--hewie-ring,#cbd5e1)]"
            >
              View Page
            </button>
          ) : null}
        </div>
        <p className="mt-2 text-sm leading-5 opacity-75">{currentPage.description}</p>

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex gap-1.5" aria-hidden="true">
            {introPages.map((page, index) => (
              <span
                key={page.title}
                className={`h-1.5 rounded-full transition-all ${
                  index === step ? "w-5 bg-[var(--hewie-accent,#64748b)]" : "w-1.5 bg-[var(--hewie-active-text,#334155)]/20"
                }`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => isLastStep ? finishIntro() : goToStep(step + 1)}
            className="rounded-full bg-[var(--hewie-accent,#64748b)] px-5 py-2.5 text-sm font-bold text-[var(--hewie-accent-text,#ffffff)] shadow-sm"
          >
            {isLastStep ? "Start Notebook" : "Next"}
          </button>
        </div>
      </section>
    </div>
  );
}
