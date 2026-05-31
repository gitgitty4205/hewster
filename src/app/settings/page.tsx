"use client";

import { ChevronRight, Tablets, UserRound } from "lucide-react";
import { MedicationPillIcon } from "@/components/medication-pill-icon";
import { PetAvatarMenu } from "@/components/pet-avatar-menu";
import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { BottomNav } from "@/components/bottom-nav";
import { PetNotebookTitle } from "@/components/pet-notebook-title";
import { useAuth } from "@/components/auth-provider";
import {
  PET_THEME_UPDATED_EVENT,
  PET_PROFILE_STORAGE_KEY,
  appThemes,
  applyPetTheme,
  defaultPetProfile,
  loadUserTheme,
  normalizePetProfile,
  type ThemeId,
} from "@/lib/pet-profile";

const settingsItems = [
  {
    title: "Pet Profile",
    description: "Pet info, background, and accent colors.",
    href: "/hewie/profile",
    icon: null,
    iconKind: "paw",
    accent: "bg-slate-50 text-slate-700",
    iconAccent: "bg-slate-100 text-slate-700",
  },
  {
    title: "Meal Plan Settings",
    description: "Feeding schedule, planned times, foods, notes, and reminders.",
    href: "/hewie/meals",
    icon: null,
    iconText: "\u{1F969}",
    accent: "bg-[#f4eadf]/90 text-[#6b3f22]",
    iconAccent: "bg-[#9a6940]/70 text-white",
  },
  {
    title: "Supplement Settings",
    description: "Supplement names, doses, notes, and reminders.",
    href: "/hewie/supplements",
    icon: Tablets,
    accent: "bg-[#eaf0f8] text-[#1f3d5c]",
    iconAccent: "bg-[#eaf0f8] text-[#1f3d5c] ring-1 ring-[#b8c9dd]",
  },
  {
    title: "Medication Settings",
    description: "Medication names, doses, schedules, and refill notes.",
    href: "/hewie/medications",
    icon: MedicationPillIcon,
    accent: "bg-sky-50 text-sky-700",
    iconAccent: "bg-sky-100 text-sky-600",
  },
  {
    title: "Account Settings",
    description: "Owner info, caretakers, access, and account details.",
    href: "/hewie/account-settings",
    icon: UserRound,
    iconKind: "theme",
    accent: "bg-slate-50 text-slate-700",
    iconAccent: "bg-slate-100 text-slate-700",
  },
];

function CutePawIcon() {
  return (
    <span
      className="block size-6 bg-current"
      style={{
        WebkitMask: "url('/paw-print.svg') center / contain no-repeat",
        mask: "url('/paw-print.svg') center / contain no-repeat",
      }}
      aria-hidden="true"
    />
  );
}

const defaultPetProfileSnapshot = JSON.stringify(defaultPetProfile);

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

export default function SettingsPage() {
  const { user } = useAuth();
  const [themeId, setThemeId] = useState<ThemeId>(defaultPetProfile.themeId);
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
    const refreshTheme = () => setThemeId(loadUserTheme(user?.id));
    refreshTheme();
    window.addEventListener(PET_THEME_UPDATED_EVENT, refreshTheme);
    window.addEventListener("storage", refreshTheme);
    return () => {
      window.removeEventListener(PET_THEME_UPDATED_EVENT, refreshTheme);
      window.removeEventListener("storage", refreshTheme);
    };
  }, [user?.id]);

  useEffect(() => {
    applyPetTheme(themeId);
  }, [themeId]);

  const theme = appThemes[themeId];

  return (
    <main className="min-h-screen bg-[var(--hewie-bg,#979ca7)] text-zinc-900">
      <div className="content-fade-in mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-24 pt-6">
        <header className="mb-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <PetNotebookTitle href="/hewie" className="text-sm font-bold text-[var(--hewie-active-text,#6d28d9)]" />
              <h1 className="mt-1 text-xl font-bold tracking-tight text-zinc-700">Settings</h1>
            </div>
            <PetAvatarMenu className="mt-0.5 size-20 rounded-full object-cover object-center ring-1 ring-zinc-500/60 shadow-sm" />
          </div>
          <p className="mt-2 text-sm leading-6 text-[var(--hewie-active-text,#334155)]/70">
            Manage profile, theme, and saved plans.
          </p>
        </header>

        <section className="mb-4 rounded-3xl bg-white/70 p-5 shadow-sm ring-1 ring-white/60">
          <div className="space-y-4">
            {settingsItems.map((item) => {
              const Icon = item.icon;
              const usesPetTheme = item.iconKind === "paw";
              const usesThemeAccent = usesPetTheme || item.iconKind === "theme";
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex min-h-[112px] items-center justify-between gap-4 rounded-3xl p-5 shadow-sm transition hover:scale-[1.01] ${usesThemeAccent ? "" : item.accent}`}
                  style={usesThemeAccent ? { backgroundColor: theme.activeBg, color: theme.activeText } : undefined}
                >
                  <span className="flex min-w-0 items-center gap-4">
                    <span
                      className={`flex size-14 shrink-0 items-center justify-center rounded-full ${usesThemeAccent ? "" : item.iconAccent}`}
                      style={usesThemeAccent ? { backgroundColor: theme.accent, color: theme.accentText } : undefined}
                    >
                      {usesPetTheme ? <CutePawIcon /> : Icon ? <Icon className="size-6" /> : <span className="text-2xl leading-none">{item.iconText}</span>}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-base font-semibold">{item.title}</span>
                      <span className="mt-1 line-clamp-2 block text-sm leading-5 opacity-70">{item.description}</span>
                    </span>
                  </span>
                  <ChevronRight className="size-5 shrink-0 opacity-60" />
                </Link>
              );
            })}
          </div>
        </section>

        <BottomNav />
      </div>
    </main>
  );
}
