"use client";

import { Check, UserRound } from "lucide-react";
import { PetAvatarMenu } from "@/components/pet-avatar-menu";
import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { BottomNav } from "@/components/bottom-nav";
import { Button } from "@/components/ui/button";
import {
  PET_PROFILE_STORAGE_KEY,
  appThemes,
  applyPetTheme,
  defaultPetProfile,
  normalizePetProfile,
} from "@/lib/pet-profile";

const defaultPetProfileSnapshot = JSON.stringify(defaultPetProfile);

const planOptions = [
  {
    name: "Free",
    description: "One pet notebook.",
  },
  {
    name: "Plus",
    description: "More history tools and exports for one pet.",
  },
  {
    name: "Family",
    description: "Multiple pet notebooks and shared access.",
  },
];

function getPetProfileSnapshot() {
  if (typeof window === "undefined") return defaultPetProfileSnapshot;
  return window.localStorage.getItem(PET_PROFILE_STORAGE_KEY) ?? defaultPetProfileSnapshot;
}

function subscribeToPetProfile(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", onStoreChange);
  window.addEventListener("focus", onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener("focus", onStoreChange);
  };
}

export default function AccountSettingsPage() {
  const [ownerFirstName, setOwnerFirstName] = useState("");
  const [ownerLastName, setOwnerLastName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [selectedPlan, setSelectedPlan] = useState("Plus");

  const profileSnapshot = useSyncExternalStore(
    subscribeToPetProfile,
    getPetProfileSnapshot,
    () => defaultPetProfileSnapshot,
  );
  const profile = useMemo(() => {
    try {
      return normalizePetProfile(JSON.parse(profileSnapshot));
    } catch {
      return defaultPetProfile;
    }
  }, [profileSnapshot]);

  useEffect(() => {
    applyPetTheme(profile.themeId);
  }, [profile.themeId]);

  const theme = appThemes[profile.themeId];

  return (
    <main className="min-h-screen bg-[var(--hewie-bg,#979ca7)] text-zinc-900">
      <div className="content-fade-in mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-24 pt-6">
        <header className="mb-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Link href="/hewie" className="text-sm font-bold text-[var(--hewie-active-text,#6d28d9)]">
                Hewster&apos;s Notebook
              </Link>
              <h1 className="mt-1 text-xl font-bold tracking-tight text-zinc-700">Account Settings</h1>
            </div>
            <PetAvatarMenu className="mt-0.5 size-20 rounded-full object-cover object-center ring-1 ring-zinc-500/60 shadow-sm" />
          </div>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Owner info and membership plan.
          </p>
        </header>

        <section className="mb-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
          <div className="mb-4 flex items-start gap-3">
            <span
              className="flex size-11 shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: theme.accent, color: theme.accentText }}
            >
              <UserRound className="size-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold">Owner Info</h2>
              <p className="mt-1 text-sm text-zinc-500">Primary owner name and account email.</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
                First Name
                <input
                  type="text"
                  value={ownerFirstName}
                  onChange={(event) => setOwnerFirstName(event.target.value)}
                  placeholder="First"
                  className="mt-2 w-full rounded-2xl border-0 bg-zinc-50 px-4 py-3 text-sm font-medium normal-case tracking-normal text-zinc-800 ring-1 ring-zinc-200 placeholder:text-zinc-400"
                />
              </label>
              <label className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
                Last Name
                <input
                  type="text"
                  value={ownerLastName}
                  onChange={(event) => setOwnerLastName(event.target.value)}
                  placeholder="Last"
                  className="mt-2 w-full rounded-2xl border-0 bg-zinc-50 px-4 py-3 text-sm font-medium normal-case tracking-normal text-zinc-800 ring-1 ring-zinc-200 placeholder:text-zinc-400"
                />
              </label>
            </div>
            <label className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
              Account Email
              <input
                type="email"
                value={ownerEmail}
                onChange={(event) => setOwnerEmail(event.target.value)}
                placeholder="name@example.com"
                className="mt-2 w-full rounded-2xl border-0 bg-zinc-50 px-4 py-3 text-sm font-medium normal-case tracking-normal text-zinc-800 ring-1 ring-zinc-200 placeholder:text-zinc-400"
              />
            </label>
          </div>

          <Button type="button" className="mt-4 w-full rounded-full bg-[var(--hewie-accent,#64748b)] text-[var(--hewie-accent-text,#ffffff)] disabled:opacity-60" disabled>
            Save Account Info
          </Button>
        </section>

        <section className="mb-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">Membership Plan</h2>
            <p className="text-sm text-zinc-500">Choose the account level for pet notebooks.</p>
          </div>

          <div className="space-y-2">
            {planOptions.map((plan) => {
              const selected = selectedPlan === plan.name;
              return (
                <button
                  key={plan.name}
                  type="button"
                  onClick={() => setSelectedPlan(plan.name)}
                  className={`w-full rounded-2xl p-4 text-left ring-1 transition ${
                    selected ? "bg-[var(--hewie-active-bg,#f1f5f9)] ring-[var(--hewie-ring,#cbd5e1)]" : "bg-zinc-50 ring-zinc-200"
                  }`}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span>
                      <span className="block font-semibold text-zinc-900">{plan.name}</span>
                      <span className="mt-1 block text-xs leading-4 text-zinc-500">{plan.description}</span>
                    </span>
                    {selected ? <Check className="size-4 shrink-0 text-emerald-600" /> : null}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-3 rounded-2xl bg-zinc-50 p-3 text-xs leading-5 text-zinc-500 ring-1 ring-zinc-200">
            Plan management will connect later. Adding extra pets can trigger upgrade options when plans are wired in.
          </p>
        </section>

        <BottomNav />
      </div>
    </main>
  );
}
