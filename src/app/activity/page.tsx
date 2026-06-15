"use client";

import { BottomNav } from "@/components/bottom-nav";
import { PetAvatarMenu } from "@/components/pet-avatar-menu";
import { FitBarkActivityCard } from "@/components/fitbark-activity-card";
import { PetNotebookTitle } from "@/components/pet-notebook-title";

export default function ActivityPage() {
  return (
    <main className="min-h-screen bg-[var(--hewie-bg)] text-zinc-900">
      <div className="content-fade-in mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-24 pt-6">
        <header className="mb-6">
          <div className="flex min-h-[4.5rem] items-center justify-between gap-3">
            <div>
              <PetNotebookTitle href="/notebook" className="text-sm font-bold text-[var(--hewie-active-text)]" />
              <h1 className="mt-1 text-xl font-bold tracking-tight text-[#3b2832]">Fitness</h1>
            </div>
            <PetAvatarMenu shape="tile" />
          </div>
        </header>

        <FitBarkActivityCard />

        <BottomNav />
      </div>
    </main>
  );
}
