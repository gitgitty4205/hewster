"use client";

import { Heart, MailPlus, ShieldCheck } from "lucide-react";
import { PetAvatarMenu } from "@/components/pet-avatar-menu";
import Link from "next/link";
import { useEffect, useState } from "react";

import { BottomNav } from "@/components/bottom-nav";
import { Button } from "@/components/ui/button";
import {
  appThemes,
  applyPetTheme,
  defaultPetProfile,
  loadPetProfile,
  savePetProfile,
  type PetProfile,
  type ThemeId,
} from "@/lib/pet-profile";

const accessRoleDescriptions: Record<string, string> = {
  "co-owner": "Full access to this pet notebook.",
  caretaker: "Full access except sending or exporting copies.",
  "pet-sitter": "Can log basic care only. No history or medical records.",
};

export default function ProfilePage() {
  const [profile, setProfile] = useState<PetProfile>(defaultPetProfile);
  const [saveState, setSaveState] = useState<"idle" | "saved">("idle");
  const [accessEmail, setAccessEmail] = useState("");
  const [accessRole, setAccessRole] = useState("caretaker");
  const [showGoodbyeIntro, setShowGoodbyeIntro] = useState(false);
  const [showMemorialSettings, setShowMemorialSettings] = useState(false);

  useEffect(() => {
    void Promise.resolve().then(() => {
      const storedProfile = loadPetProfile();
      setProfile(storedProfile);
      applyPetTheme(storedProfile.themeId);
    });
  }, []);

  useEffect(() => {
    applyPetTheme(profile.themeId);
  }, [profile.themeId]);

  const updateProfile = (next: Partial<PetProfile>) => {
    const merged = { ...profile, ...next };
    const updated = {
      ...merged,
      petName: [merged.petFirstName, merged.petLastName].filter(Boolean).join(" ") || merged.petName,
    };
    setProfile(updated);
    savePetProfile(updated);
    applyPetTheme(updated.themeId);
    setSaveState("saved");
    window.setTimeout(() => setSaveState("idle"), 1400);
  };

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
              <h1 className="mt-1 text-xl font-bold tracking-tight text-[var(--hewie-active-text,#334155)]/85">Pet Profile</h1>
            </div>
            <PetAvatarMenu className="mt-0.5 size-20 rounded-full object-cover object-center ring-1 ring-zinc-500/60 shadow-sm" />
          </div>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Pet Info And App Theme Settings. Login And Accounts Can Come Later.
          </p>
        </header>

        <section className="mb-4 rounded-3xl bg-[var(--hewie-active-bg,#f1f5f9)] p-5 text-[var(--hewie-active-text,#334155)] shadow-sm ring-1 ring-[var(--hewie-ring,#cbd5e1)]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">Pet Info</h2>
                <button
                  type="button"
                  onClick={() => setShowGoodbyeIntro(true)}
                  className="flex items-center justify-center text-[var(--hewie-active-text,#334155)]/60 transition hover:text-[var(--hewie-active-text,#334155)]/75"
                  aria-label="Sensitive pet options"
                >
                  <Heart className="size-4 fill-current" />
                </button>
              </div>
              <p className="text-sm text-[var(--hewie-active-text,#334155)]/65">This Saves Locally For Now.</p>
            </div>
            <p className="text-xs font-semibold text-emerald-600">{saveState === "saved" ? "Saved" : ""}</p>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-[var(--hewie-active-text,#334155)]/85">First Name</span>
                <input
                  value={profile.petFirstName}
                  onChange={(event) => updateProfile({ petFirstName: event.target.value })}
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--hewie-ring,#cbd5e1)] focus:ring-4 focus:ring-zinc-100"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-[var(--hewie-active-text,#334155)]/85">Last Name</span>
                <input
                  value={profile.petLastName}
                  onChange={(event) => updateProfile({ petLastName: event.target.value })}
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--hewie-ring,#cbd5e1)] focus:ring-4 focus:ring-zinc-100"
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-[var(--hewie-active-text,#334155)]/85">Species</span>
                <input
                  value={profile.species}
                  onChange={(event) => updateProfile({ species: event.target.value })}
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--hewie-ring,#cbd5e1)] focus:ring-4 focus:ring-zinc-100"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-[var(--hewie-active-text,#334155)]/85">Breed</span>
                <input
                  value={profile.breed}
                  onChange={(event) => updateProfile({ breed: event.target.value })}
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--hewie-ring,#cbd5e1)] focus:ring-4 focus:ring-zinc-100"
                />
              </label>
            </div>

            <label className="block text-sm">
              <span className="mb-1 block font-medium text-[var(--hewie-active-text,#334155)]/85">Birthday</span>
              <input
                type="date"
                value={profile.birthday}
                onChange={(event) => updateProfile({ birthday: event.target.value })}
                className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--hewie-ring,#cbd5e1)] focus:ring-4 focus:ring-zinc-100"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-[var(--hewie-active-text,#334155)]/85">Sex</span>
                <select
                  value={profile.sex}
                  onChange={(event) => updateProfile({ sex: event.target.value as PetProfile["sex"] })}
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--hewie-ring,#cbd5e1)] focus:ring-4 focus:ring-zinc-100"
                >
                  <option value="">Select</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-[var(--hewie-active-text,#334155)]/85">Spay / Neuter</span>
                <select
                  value={profile.spayNeuterStatus}
                  onChange={(event) => updateProfile({ spayNeuterStatus: event.target.value as PetProfile["spayNeuterStatus"] })}
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--hewie-ring,#cbd5e1)] focus:ring-4 focus:ring-zinc-100"
                >
                  <option value="">Select</option>
                  <option value="spayed">Spayed</option>
                  <option value="neutered">Neutered</option>
                  <option value="intact">Not Spayed / Neutered</option>
                </select>
              </label>
            </div>

            <label className="block text-sm">
              <span className="mb-1 block font-medium text-[var(--hewie-active-text,#334155)]/85">Microchip Number</span>
              <input
                value={profile.microchipNumber}
                onChange={(event) => updateProfile({ microchipNumber: event.target.value })}
                placeholder="Optional"
                className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--hewie-ring,#cbd5e1)] focus:ring-4 focus:ring-zinc-100"
              />
            </label>
          </div>
        </section>

        {showGoodbyeIntro ? (
          <div className="fixed inset-0 z-50 flex items-end bg-zinc-950/35 px-4 pb-5 pt-10 backdrop-blur-sm sm:items-center">
            <div className="mx-auto w-full max-w-md rounded-[2rem] bg-[var(--hewie-active-bg,#f1f5f9)] p-5 text-[var(--hewie-active-text,#334155)] shadow-2xl ring-1 ring-[var(--hewie-ring,#cbd5e1)]">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/70 shadow-sm ring-1 ring-[var(--hewie-ring,#cbd5e1)]/70">
                    <Heart className="size-5" />
                  </span>
                  <div>
                    <h2 className="text-lg font-semibold">A Gentle Place</h2>
                    <p className="mt-1 text-sm leading-6 text-[var(--hewie-active-text,#334155)]/70">
                      This area is for pets when it is time to say goodbye, and their notebook will become a place of remembrance.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowGoodbyeIntro(false)}
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/65 text-lg font-semibold text-[var(--hewie-active-text,#334155)]/65 shadow-sm ring-1 ring-[var(--hewie-ring,#cbd5e1)]/70 transition hover:bg-white"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>

              <Button
                type="button"
                onClick={() => {
                  setShowGoodbyeIntro(false);
                  setShowMemorialSettings(true);
                }}
                className="w-full rounded-full bg-[var(--hewie-accent,#64748b)]/75 text-[var(--hewie-accent-text,#ffffff)] shadow-sm hover:bg-[var(--hewie-accent,#64748b)]/85"
              >
                It&apos;s Time For My Pet
              </Button>
            </div>
          </div>
        ) : null}

        {showMemorialSettings ? (
          <div className="fixed inset-0 z-50 flex items-end bg-zinc-950/35 px-4 pb-5 pt-10 backdrop-blur-sm sm:items-center">
            <div className="mx-auto w-full max-w-md space-y-3 rounded-[2rem] bg-[var(--hewie-active-bg,#f1f5f9)] p-5 text-[var(--hewie-active-text,#334155)] shadow-2xl ring-1 ring-[var(--hewie-ring,#cbd5e1)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Remember This Pet</h2>
                  <p className="text-sm leading-5 text-[var(--hewie-active-text,#334155)]/65">
                    These settings are kept separate from the everyday profile.
                  </p>
                </div>
                {(profile.hasPassedAway || profile.archivedFromPetSwitcher) ? (
                  <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-bold text-[var(--hewie-active-text,#334155)]/70">
                    Saved
                  </span>
                ) : null}
              </div>

              <label className="flex items-start gap-3 rounded-2xl bg-white p-3 text-sm font-semibold shadow-sm ring-1 ring-[var(--hewie-ring,#cbd5e1)]/70">
                <input
                  type="checkbox"
                  checked={profile.hasPassedAway}
                  onChange={(event) => updateProfile({ hasPassedAway: event.target.checked })}
                  className="mt-1 size-4 accent-[var(--hewie-accent,#64748b)]"
                />
                <span>
                  I want this pet to be remembered
                  <span className="mt-0.5 block text-xs font-medium text-[var(--hewie-active-text,#334155)]/60">
                    Opens a gentle remembrance space for this pet.
                  </span>
                </span>
              </label>

              <label className="flex items-start gap-3 rounded-2xl bg-white p-3 text-sm font-semibold shadow-sm ring-1 ring-[var(--hewie-ring,#cbd5e1)]/70">
                <input
                  type="checkbox"
                  checked={profile.archivedFromPetSwitcher}
                  onChange={(event) => updateProfile({ archivedFromPetSwitcher: event.target.checked })}
                  className="mt-1 size-4 accent-[var(--hewie-accent,#64748b)]"
                />
                <span>
                  Hide this pet from the pet card
                  <span className="mt-0.5 block text-xs font-medium text-[var(--hewie-active-text,#334155)]/60">
                    Archives the pet notebook from the profile-picture switcher. The profile info stays saved.
                  </span>
                </span>
              </label>

              {profile.hasPassedAway ? (
                <>
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium text-[var(--hewie-active-text,#334155)]/85">Date of Goodbye</span>
                    <input
                      type="date"
                      value={profile.passedAwayDate}
                      onChange={(event) => updateProfile({ passedAwayDate: event.target.value })}
                      className="w-full rounded-2xl border border-[var(--hewie-ring,#cbd5e1)] bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--hewie-accent,#64748b)] focus:ring-4 focus:ring-[var(--hewie-ring,#cbd5e1)]/45"
                    />
                  </label>

                  <label className="block text-sm">
                    <span className="mb-1 block font-medium text-[var(--hewie-active-text,#334155)]/85">Memory Notes</span>
                    <textarea
                      value={profile.memorialNotes}
                      onChange={(event) => updateProfile({ memorialNotes: event.target.value.slice(0, 180) })}
                      maxLength={180}
                      rows={3}
                      placeholder="A favorite memory, nickname, or note"
                      className="w-full rounded-2xl border border-[var(--hewie-ring,#cbd5e1)] bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--hewie-accent,#64748b)] focus:ring-4 focus:ring-[var(--hewie-ring,#cbd5e1)]/45"
                    />
                  </label>
                </>
              ) : null}

              <Button
                type="button"
                variant="outline"
                onClick={() => setShowMemorialSettings(false)}
                className="rounded-full border-0 bg-white/80 text-[var(--hewie-active-text,#334155)] shadow-sm ring-1 ring-[var(--hewie-ring,#cbd5e1)] hover:bg-white"
              >
                Close
              </Button>
            </div>
          </div>
        ) : null}

        <section className="mb-4 rounded-3xl bg-[var(--hewie-active-bg,#f1f5f9)] p-5 text-[var(--hewie-active-text,#334155)] shadow-sm ring-1 ring-[var(--hewie-ring,#cbd5e1)]">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">Personality & Preferences</h2>
            <p className="text-sm text-[var(--hewie-active-text,#334155)]/65">Helpful notes for anyone caring for this pet.</p>
          </div>

          <div className="space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-[var(--hewie-active-text,#334155)]/85">Personality</span>
              <textarea
                value={profile.personality}
                onChange={(event) => updateProfile({ personality: event.target.value.slice(0, 180) })}
                maxLength={180}
                rows={2}
                placeholder="e.g. Shy at first, playful once comfortable"
                className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--hewie-ring,#cbd5e1)] focus:ring-4 focus:ring-zinc-100"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-[var(--hewie-active-text,#334155)]/85">Likes</span>
                <textarea
                  value={profile.likes}
                  onChange={(event) => updateProfile({ likes: event.target.value.slice(0, 180) })}
                  maxLength={180}
                  rows={2}
                  placeholder="Treats, toys, routines"
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--hewie-ring,#cbd5e1)] focus:ring-4 focus:ring-zinc-100"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-[var(--hewie-active-text,#334155)]/85">Dislikes</span>
                <textarea
                  value={profile.dislikes}
                  onChange={(event) => updateProfile({ dislikes: event.target.value.slice(0, 180) })}
                  maxLength={180}
                  rows={2}
                  placeholder="Sounds, handling, foods"
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--hewie-ring,#cbd5e1)] focus:ring-4 focus:ring-zinc-100"
                />
              </label>
            </div>

            <label className="block text-sm">
              <span className="mb-1 block font-medium text-[var(--hewie-active-text,#334155)]/85">Care Preferences</span>
              <textarea
                value={profile.carePreferences}
                onChange={(event) => updateProfile({ carePreferences: event.target.value.slice(0, 180) })}
                maxLength={180}
                rows={3}
                placeholder="Feeding quirks, walking style, bedtime routine"
                className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--hewie-ring,#cbd5e1)] focus:ring-4 focus:ring-zinc-100"
              />
            </label>
          </div>
        </section>

        <section className="mb-4 rounded-3xl bg-[var(--hewie-active-bg,#f1f5f9)] p-5 text-[var(--hewie-active-text,#334155)] shadow-sm ring-1 ring-[var(--hewie-ring,#cbd5e1)]">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">App Theme</h2>
            <p className="text-sm text-[var(--hewie-active-text,#334155)]/65">Theme Controls Background And Misc Accent Buttons.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {Object.values(appThemes).map((option) => {
              const selected = option.id === profile.themeId;
              return (
                <button
                  key={option.id}
                  className={`rounded-2xl p-3 text-left ring-1 transition ${selected ? "bg-[var(--hewie-active-bg,#f1f5f9)] text-[var(--hewie-active-text,#334155)] ring-[var(--hewie-ring,#cbd5e1)]" : "bg-white text-[var(--hewie-active-text,#334155)]/85 ring-zinc-200 hover:bg-zinc-50"}`}
                  onClick={() => updateProfile({ themeId: option.id as ThemeId })}
                >
                  <span className="mb-2 flex gap-1.5">
                    <span className="size-5 rounded-full ring-1 ring-black/10" style={{ backgroundColor: option.background }} />
                    <span className="size-5 rounded-full ring-1 ring-black/10" style={{ backgroundColor: option.accent }} />
                    <span className="size-5 rounded-full ring-1 ring-black/10" style={{ backgroundColor: option.activeBg }} />
                  </span>
                  <span className="text-sm font-semibold">{option.name}</span>
                </button>
              );
            })}
          </div>

        </section>

        <section className="mb-4 rounded-3xl bg-[var(--hewie-active-bg,#f1f5f9)] p-5 text-[var(--hewie-active-text,#334155)] shadow-sm ring-1 ring-[var(--hewie-ring,#cbd5e1)]">
          <div className="mb-4 flex items-start gap-3">
            <span
              className="flex size-10 shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: theme.accent, color: theme.accentText }}
            >
              <ShieldCheck className="size-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold">Pet Notebook Access</h2>
              <p className="text-sm text-[var(--hewie-active-text,#334155)]/65">Add people and choose how they can help with this pet notebook.</p>
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
              Email
              <input
                type="email"
                value={accessEmail}
                onChange={(event) => setAccessEmail(event.target.value)}
                placeholder="name@example.com"
                className="mt-2 w-full rounded-2xl border-0 bg-white px-4 py-3 text-sm font-medium normal-case tracking-normal text-zinc-800 ring-1 ring-[var(--hewie-ring,#cbd5e1)] placeholder:text-zinc-400"
              />
            </label>
            <label className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
              Role
              <select
                value={accessRole}
                onChange={(event) => setAccessRole(event.target.value)}
                className="mt-2 w-full rounded-2xl border-0 bg-white px-4 py-3 text-sm font-medium normal-case tracking-normal text-zinc-800 ring-1 ring-[var(--hewie-ring,#cbd5e1)]"
              >
                <option value="co-owner">Co-owner</option>
                <option value="caretaker">Caretaker</option>
                <option value="pet-sitter">Pet Sitter</option>
              </select>
            </label>
            <p className="rounded-2xl bg-white/65 p-3 text-xs leading-5 text-[var(--hewie-active-text,#334155)]/65 ring-1 ring-[var(--hewie-ring,#cbd5e1)]/70">
              {accessRoleDescriptions[accessRole]}
            </p>
          </div>
          <Button type="button" className="mt-3 w-full rounded-full bg-[var(--hewie-accent,#64748b)] text-[var(--hewie-accent-text,#ffffff)] disabled:opacity-60" disabled>
            <MailPlus className="size-4" />
            + Add Person
          </Button>
          <p className="mt-3 rounded-2xl bg-white/65 p-3 text-xs leading-5 text-[var(--hewie-active-text,#334155)]/65 ring-1 ring-[var(--hewie-ring,#cbd5e1)]/70">
            Invites will be connected later. Roles will control access per pet notebook.
          </p>
        </section>


        <BottomNav />
      </div>
    </main>
  );
}
