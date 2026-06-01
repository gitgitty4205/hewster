"use client";

import { useEffect, useState } from "react";

const PAGE_INTRO_STORAGE_KEY = "hewster.pageIntro.completed";

const introPages = [
  {
    title: "Today's",
    description: "See today's meals, care reminders, alerts, potty notes, and recent events in one place.",
  },
  {
    title: "Event Details",
    description: "Log meals, potty breaks, treats, symptoms, notes, medication, supplements, and attachments.",
  },
  {
    title: "History",
    description: "Review meals, activities, notes, alerts, and weight entries by day or filter.",
  },
  {
    title: "Health",
    description: "Keep vet visits, health notes, and medical attachments easy to find.",
  },
  {
    title: "Weight",
    description: "Save weight entries and track changes over time.",
  },
  {
    title: "Fitness",
    description: "View tracker summaries and activity details.",
  },
  {
    title: "Alerts",
    description: "Create reminders for anything that needs special attention.",
  },
  {
    title: "Profile",
    description: "Edit pet info, profile photo, care notes, sharing, and theme settings.",
  },
  {
    title: "Settings",
    description: "Manage saved plans, supplements, medications, account options, and notebook setup.",
  },
];

export function PageIntroGuide() {
  const [step, setStep] = useState<number | null>(null);

  useEffect(() => {
    if (window.localStorage.getItem(PAGE_INTRO_STORAGE_KEY) !== "true") {
      setStep(0);
    }
  }, []);

  if (step === null) return null;

  const currentPage = introPages[step];
  const isLastStep = step === introPages.length - 1;

  const finishIntro = () => {
    window.localStorage.setItem(PAGE_INTRO_STORAGE_KEY, "true");
    setStep(null);
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-end bg-zinc-950/35 px-4 pb-5 pt-10 backdrop-blur-sm sm:items-center">
      <section
        className="mx-auto w-full max-w-md rounded-[2rem] bg-[var(--hewie-active-bg,#f1f5f9)] p-5 text-[var(--hewie-active-text,#334155)] shadow-2xl ring-1 ring-[var(--hewie-ring,#cbd5e1)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="page-intro-title"
      >
        <p className="text-xs font-bold uppercase tracking-[0.16em] opacity-60">
          Page {step + 1} of {introPages.length}
        </p>
        <h2 id="page-intro-title" className="mt-2 text-2xl font-bold tracking-tight">
          {currentPage.title}
        </h2>
        <p className="mt-3 text-sm leading-6 opacity-75">{currentPage.description}</p>

        <div className="mt-5 flex items-center justify-between gap-3">
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
            onClick={() => isLastStep ? finishIntro() : setStep((current) => (current ?? 0) + 1)}
            className="rounded-full bg-[var(--hewie-accent,#64748b)] px-5 py-2.5 text-sm font-bold text-[var(--hewie-accent-text,#ffffff)] shadow-sm"
          >
            {isLastStep ? "Start Notebook" : "Next"}
          </button>
        </div>
      </section>
    </div>
  );
}
