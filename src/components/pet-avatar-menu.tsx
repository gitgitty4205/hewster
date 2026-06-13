"use client";

import Image from "next/image";
import { Check, ChevronRight, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import {
  loadNotebookMembers,
  selectActiveNotebookMembership,
  ensureOwnNotebookMembership,
  setActiveNotebookOwnerId,
  type NotebookAccessRole,
  type NotebookMember,
} from "@/lib/notebook-access";
import { DEFAULT_PET_PHOTO_URL, defaultPetProfile, loadPetProfile, loadSharedPetProfile, savePetProfile, type PetProfile } from "@/lib/pet-profile";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import {
  loadStoredSubscriptionPlan,
  petLimitForSubscriptionPlan,
  SUBSCRIPTION_PLAN_UPDATED_EVENT,
  type SubscriptionPlanId,
} from "@/lib/subscription-plan";
import { TEXT_LIMITS, clampText } from "@/lib/text-limits";
import { cn } from "@/lib/utils";

const PET_ROSTER_STORAGE_KEY = "hewster.petRoster";
const ADD_PET_UPGRADE_RETURN_PATH_KEY = "petnotebook.addPetUpgradeReturnPath";
const OPEN_ADD_PET_UPGRADE_DIALOG_KEY = "petnotebook.openAddPetUpgradeDialog";

type RosterPet = {
  id: string;
  name: string;
  species: string;
  photoUrl?: string;
  archived?: boolean;
};

type Props = {
  className?: string;
  width?: number;
  height?: number;
  shape?: "circle" | "tile";
};

function currentPetToRosterPet(profile: PetProfile): RosterPet {
  return {
    id: "current",
    name: profile.petName || profile.petFirstName || defaultPetProfile.petName,
    species: profile.species || defaultPetProfile.species,
    photoUrl: profile.photoUrl || DEFAULT_PET_PHOTO_URL,
    archived: profile.archivedFromPetSwitcher,
  };
}

function petRosterStorageKey(userId?: string | null) {
  return userId ? `${PET_ROSTER_STORAGE_KEY}.${userId}` : PET_ROSTER_STORAGE_KEY;
}

function readRoster(userId?: string | null) {
  if (typeof window === "undefined") return [] as RosterPet[];
  if (!userId) return [];

  try {
    const stored = window.localStorage.getItem(petRosterStorageKey(userId));
    const parsed = stored ? JSON.parse(stored) : [];
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((item): item is RosterPet => (
      typeof item === "object" &&
      item !== null &&
      typeof item.id === "string" &&
      typeof item.name === "string" &&
      typeof item.species === "string"
    )).filter((item) => !item.archived);
  } catch {
    return [];
  }
}

function saveRoster(pets: RosterPet[], userId?: string | null) {
  if (!userId) return;
  window.localStorage.setItem(petRosterStorageKey(userId), JSON.stringify(pets));
}

function roleLabel(role: NotebookAccessRole) {
  if (role === "pet-sitter") return "Pet Sitter";
  if (role === "co-owner") return "Co-Owner";
  if (role === "caretaker") return "Caretaker";
  return "Owner";
}

function notebookLabel(member: NotebookMember, profile: PetProfile, currentUserId?: string) {
  if (member.notebookOwnerId === currentUserId) {
    return profile.petName || profile.petFirstName || "My Pet";
  }

  return profile.petName || profile.petFirstName || "Shared Pet";
}

const avatarClassNames = {
  circle: "mt-0.5 size-20 rounded-full object-cover object-center ring-1 ring-zinc-500/60 shadow-sm",
  tile: "size-[4.5rem] rounded-[1.15rem] object-cover object-center shadow-[0_10px_22px_rgba(15,23,42,0.22),0_1px_3px_rgba(255,255,255,0.35)_inset] ring-1 ring-[var(--hewie-active-text,#334155)]/18",
};

const defaultAvatarClassNames = {
  circle: "object-contain p-2",
  tile: "object-contain p-2.5",
};

const avatarButtonClassNames = {
  circle: "shrink-0 rounded-full text-left transition hover:scale-[1.02] focus:outline-none focus:ring-4 focus:ring-[var(--hewie-ring,#cbd5e1)]/55",
  tile: "shrink-0 rounded-[1.15rem] text-left transition hover:scale-[1.02] focus:outline-none focus:ring-4 focus:ring-[var(--hewie-ring,#cbd5e1)]/55",
};

function isDefaultPetPhoto(photoUrl?: string) {
  return !photoUrl || photoUrl === DEFAULT_PET_PHOTO_URL;
}

export function PetAvatarMenu({ className, width, height, shape = "circle" }: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<PetProfile>(() => defaultPetProfile);
  const [pets, setPets] = useState<RosterPet[]>([]);
  const [memberships, setMemberships] = useState<NotebookMember[]>([]);
  const [notebookRole, setNotebookRole] = useState<NotebookAccessRole | null>(null);
  const [ownNotebook, setOwnNotebook] = useState<NotebookMember | null>(null);
  const [subscriptionPlan, setSubscriptionPlan] = useState<SubscriptionPlanId>("free");
  const [adding, setAdding] = useState(false);
  const [addPetMessage, setAddPetMessage] = useState("");
  const [freePetUpgradeDialogOpen, setFreePetUpgradeDialogOpen] = useState(false);
  const [newPetName, setNewPetName] = useState("");
  const [newPetSpecies, setNewPetSpecies] = useState("Dog");

  useEffect(() => {
    const refreshPlan = () => setSubscriptionPlan(loadStoredSubscriptionPlan());
    refreshPlan();
    window.addEventListener(SUBSCRIPTION_PLAN_UPDATED_EVENT, refreshPlan);
    window.addEventListener("storage", refreshPlan);
    return () => {
      window.removeEventListener(SUBSCRIPTION_PLAN_UPDATED_EVENT, refreshPlan);
      window.removeEventListener("storage", refreshPlan);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !user) return;
    if (window.sessionStorage.getItem(OPEN_ADD_PET_UPGRADE_DIALOG_KEY) !== "1") return;

    window.sessionStorage.removeItem(OPEN_ADD_PET_UPGRADE_DIALOG_KEY);
    const timeoutId = window.setTimeout(() => {
      setOpen(true);
      setAddPetMessage("");
      setAdding(false);
      setFreePetUpgradeDialogOpen(true);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [user]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      const localProfile = loadPetProfile();
      if (localProfile.photoUrl) {
        setProfile(localProfile);
      }

      const supabase = getSupabaseBrowserClient();
      if (supabase && user) {
        void loadSharedPetProfile(supabase, user).then(setProfile).catch(() => setProfile(loadPetProfile()));
      } else {
        setProfile(localProfile);
      }
      setPets(readRoster(user?.id));
    }, 0);

    return () => window.clearTimeout(id);
  }, [user]);

  useEffect(() => {
    const refreshProfile = () => {
      const localProfile = loadPetProfile();
      if (localProfile.photoUrl) {
        setProfile(localProfile);
      }

      const supabase = getSupabaseBrowserClient();
      if (supabase && user) {
        void loadSharedPetProfile(supabase, user).then(setProfile).catch(() => setProfile(loadPetProfile()));
      } else {
        setProfile(localProfile);
      }
      setPets(readRoster(user?.id));
    };

    window.addEventListener("pet-profile-updated", refreshProfile);
    window.addEventListener("storage", refreshProfile);

    return () => {
      window.removeEventListener("pet-profile-updated", refreshProfile);
      window.removeEventListener("storage", refreshProfile);
    };
  }, [user]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    let active = true;
    void Promise.resolve().then(async () => {
      if (!supabase || !user) {
        if (active) {
          setNotebookRole(null);
          setOwnNotebook(null);
        }
        return;
      }

      const members = await loadNotebookMembers(supabase, user);
      const userRoster = readRoster(user.id);
      const { activeMembership, ownNotebook: loadedOwnNotebook, visibleMemberships } = selectActiveNotebookMembership(members, user.id, user.email);
      if (active) {
        setPets(userRoster);
        setMemberships(visibleMemberships);
        setNotebookRole(activeMembership?.role ?? null);
        setOwnNotebook(loadedOwnNotebook);
      }
    }).catch(() => {
      if (active) setNotebookRole(null);
    });

    return () => {
      active = false;
    };
  }, [user]);

  const currentPet = useMemo(() => currentPetToRosterPet(profile), [profile]);
  const canManagePets = notebookRole === "owner";
  const ownedPrimaryPet = pets[0] ?? null;
  const accessibleNotebooks = useMemo(() => {
    if (!memberships.length) {
      return [{ ...currentPet, role: notebookRole ?? "owner" as NotebookAccessRole, notebookOwnerId: "local" }];
    }

    const hasSharedNotebook = memberships.some((member) => member.notebookOwnerId !== user?.id && member.role !== "owner");

    return memberships
      .filter((member) => {
        const isOwnNotebook = member.notebookOwnerId === user?.id;
        return !(isOwnNotebook && hasSharedNotebook && !ownedPrimaryPet);
      })
      .map((member) => {
        const isOwnNotebook = member.notebookOwnerId === user?.id;
        const displayedPet = isOwnNotebook && ownedPrimaryPet ? ownedPrimaryPet : currentPet;

        return {
          id: member.id,
          name: isOwnNotebook && ownedPrimaryPet ? ownedPrimaryPet.name : notebookLabel(member, profile, user?.id),
          species: displayedPet.species || defaultPetProfile.species,
          photoUrl: displayedPet.photoUrl || DEFAULT_PET_PHOTO_URL,
          role: member.role,
          notebookOwnerId: member.notebookOwnerId,
        };
      });
  }, [currentPet, memberships, notebookRole, ownedPrimaryPet, profile, user?.id]);
  const canAddOwnedPet = Boolean(user);
  const ownedPetCount = user ? Math.max(pets.length, 1) : 0;
  const ownedPetLimit = petLimitForSubscriptionPlan(subscriptionPlan);
  const imageSize = shape === "tile" ? 72 : 80;
  const currentPetUsesDefaultPhoto = isDefaultPetPhoto(currentPet.photoUrl);

  const openFreePetUpgradeDialog = () => {
    setAddPetMessage("");
    setAdding(false);
    setFreePetUpgradeDialogOpen(true);
  };

  const addPet = async () => {
    const name = clampText(newPetName.trim(), TEXT_LIMITS.shortName);
    const species = clampText(newPetSpecies.trim(), TEXT_LIMITS.shortName) || "Pet";
    const supabase = getSupabaseBrowserClient();
    if (!name || !user || !supabase) return;
    if (ownedPetCount >= ownedPetLimit) {
      if (subscriptionPlan === "free") {
        openFreePetUpgradeDialog();
        return;
      }

      setAddPetMessage("Need to add more pets? Contact support and we'll help.");
      setAdding(false);
      return;
    }
    const [petFirstName, ...petLastNameParts] = name.split(/\s+/).filter(Boolean);
    const newProfile = {
      ...defaultPetProfile,
      themeId: profile.themeId,
      petName: name,
      petFirstName: petFirstName || name,
      petLastName: petLastNameParts.join(" "),
      species,
      archivedFromPetSwitcher: false,
    };

    const nextPets = [
      ...pets,
      {
        id: `pet-${Date.now()}`,
        name,
        species,
        photoUrl: newProfile.photoUrl || DEFAULT_PET_PHOTO_URL,
      },
    ];

    const ensuredOwnNotebook = ownNotebook ?? await ensureOwnNotebookMembership(supabase, user);

    setProfile(newProfile);
    savePetProfile(newProfile);
    setPets(nextPets);
    saveRoster(nextPets, user?.id);
    if (ensuredOwnNotebook) {
      setOwnNotebook(ensuredOwnNotebook);
      setMemberships((currentMemberships) => (
        currentMemberships.some((member) => member.notebookOwnerId === ensuredOwnNotebook.notebookOwnerId)
          ? currentMemberships
          : [...currentMemberships, ensuredOwnNotebook]
      ));
    }
    setActiveNotebookOwnerId(user.id);
    setNotebookRole("owner");
    setNewPetName("");
    setNewPetSpecies("Dog");
    setAddPetMessage("");
    setAdding(false);
  };

  const handleStartAddPet = () => {
    if (ownedPetCount >= ownedPetLimit) {
      if (subscriptionPlan === "free") {
        openFreePetUpgradeDialog();
        return;
      }

      setAddPetMessage("Need to add more pets? Contact support and we'll help.");
      setAdding(false);
      return;
    }

    setAddPetMessage("");
    setAdding(true);
  };

  const handleUpgradeForMorePets = () => {
    if (typeof window === "undefined") return;

    window.sessionStorage.setItem(
      ADD_PET_UPGRADE_RETURN_PATH_KEY,
      `${window.location.pathname}${window.location.search}${window.location.hash}`,
    );
    window.location.href = "/notebook/account-settings?upgrade=plus&returnToAddPet=1";
  };

  const switchNotebook = (ownerId: string) => {
    if (ownerId === "local") return;
    setActiveNotebookOwnerId(ownerId);
    setOpen(false);
    window.location.reload();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={avatarButtonClassNames[shape]}
        aria-label="Open pet switcher"
      >
        <Image
          src={currentPet.photoUrl || DEFAULT_PET_PHOTO_URL}
          alt={currentPet.name}
          width={width ?? imageSize}
          height={height ?? imageSize}
          className={cn(className, avatarClassNames[shape], currentPetUsesDefaultPhoto && defaultAvatarClassNames[shape])}
        />
      </button>

      {open ? (
        <div className="fixed inset-0 z-[70] overflow-y-auto bg-zinc-950/25 px-3 py-4 backdrop-blur-sm sm:py-6">
          <div className="relative mx-auto flex h-[calc(100dvh-2rem)] max-h-[680px] min-h-0 w-full max-w-md flex-col overflow-hidden rounded-3xl bg-[var(--hewie-active-bg,#f1f5f9)] text-[var(--hewie-active-text,#334155)] shadow-2xl ring-1 ring-[var(--hewie-ring,#cbd5e1)] sm:h-[78vh] sm:min-h-[560px]">
            <div
              className="absolute inset-0 bg-cover bg-center opacity-[0.82] grayscale contrast-90 saturate-80"
              style={{ backgroundImage: `url('${currentPet.photoUrl || DEFAULT_PET_PHOTO_URL}')` }}
              aria-hidden="true"
            />
            <div
              className="absolute inset-0 backdrop-blur-[0.6px]"
              style={{
                background:
                  "linear-gradient(180deg, color-mix(in srgb, var(--hewie-active-bg,#f1f5f9) 52%, transparent) 0%, color-mix(in srgb, var(--hewie-bg,#979ca7) 24%, transparent) 44%, color-mix(in srgb, var(--hewie-active-bg,#f1f5f9) 40%, transparent) 100%)",
              }}
              aria-hidden="true"
            />
            <div className="relative flex items-center justify-between bg-[var(--hewie-active-bg,#f1f5f9)]/92 px-5 py-4 text-[var(--hewie-active-text,#334155)] shadow-sm backdrop-blur-[1px]">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--hewie-active-text,#334155)]/64">PetNoteBook</p>
                <h2 className="text-xl font-semibold text-[var(--hewie-active-text,#334155)]">Pets</h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex size-10 items-center justify-center rounded-full bg-white/85 text-[var(--hewie-active-text,#334155)] shadow-sm"
                aria-label="Close pet switcher"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="relative flex flex-1 flex-col justify-start gap-3 overflow-y-auto px-5 py-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] sm:py-6">
              {accessibleNotebooks.length ? (
                accessibleNotebooks.map((pet) => (
                  <button
                    key={pet.id}
                    type="button"
                    onClick={() => switchNotebook(pet.notebookOwnerId)}
                    className="flex items-center gap-3 rounded-2xl bg-[var(--hewie-active-bg,#f1f5f9)]/82 p-3 text-[var(--hewie-active-text,#334155)] shadow-sm ring-1 ring-[rgba(15,23,42,0.08)] backdrop-blur-[1.5px] transition"
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-3 text-left">
                      <span className="relative flex size-16 shrink-0 overflow-hidden rounded-[1.05rem] bg-white/20 shadow-sm ring-1 ring-[rgba(15,23,42,0.08)]">
                        {pet.photoUrl ? (
                          <Image src={pet.photoUrl} alt={pet.name} fill className="object-cover object-center" sizes="64px" />
                        ) : (
                          <span className="flex size-full items-center justify-center text-3xl">🐾</span>
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-lg font-bold leading-tight">{pet.name}</span>
                        <span className="mt-1 block text-sm font-semibold opacity-75">{pet.species} - {roleLabel(pet.role)}</span>
                      </span>
                    </span>
                  </button>
                ))
              ) : (
                <div className="rounded-2xl bg-[var(--hewie-bg,#979ca7)] p-4 text-sm font-semibold leading-5 text-[var(--hewie-accent-text,#ffffff)] shadow-sm">
                  No pets are showing in this card right now. Archived pets stay saved in their profile.
                </div>
              )}

              {canManagePets && pets.length > 1 ? (
                <div className="space-y-3">
                  {pets.slice(1).map((pet) => (
                    <div
                      key={pet.id}
                      className="rounded-2xl bg-[var(--hewie-active-bg,#f1f5f9)]/70 p-4 text-sm font-semibold text-[var(--hewie-active-text,#334155)] ring-1 ring-[var(--hewie-ring,#cbd5e1)]"
                    >
                      {pet.name}
                    </div>
                  ))}
                </div>
              ) : null}

              {canAddOwnedPet && adding ? (
                <div className="space-y-3 rounded-2xl bg-[var(--hewie-active-bg,#f1f5f9)]/92 p-4 shadow-sm ring-1 ring-[var(--hewie-ring,#cbd5e1)] backdrop-blur-[1px]">
                  <label className="block text-sm font-semibold">
                    Pet Name
                    <input
                      value={newPetName}
                      onChange={(event) => setNewPetName(clampText(event.target.value, TEXT_LIMITS.shortName))}
                      maxLength={TEXT_LIMITS.shortName}
                      placeholder="e.g. Miso"
                      className="mt-1 w-full rounded-2xl border border-[var(--hewie-ring,#cbd5e1)] bg-white px-3 py-2.5 text-sm font-medium outline-none focus:border-[var(--hewie-accent,#64748b)] focus:ring-4 focus:ring-[var(--hewie-ring,#cbd5e1)]/45"
                    />
                  </label>
                  <label className="block text-sm font-semibold">
                    Species
                    <input
                      value={newPetSpecies}
                      onChange={(event) => setNewPetSpecies(clampText(event.target.value, TEXT_LIMITS.shortName))}
                      maxLength={TEXT_LIMITS.shortName}
                      placeholder="Dog, cat, rabbit..."
                      className="mt-1 w-full rounded-2xl border border-[var(--hewie-ring,#cbd5e1)] bg-white px-3 py-2.5 text-sm font-medium outline-none focus:border-[var(--hewie-accent,#64748b)] focus:ring-4 focus:ring-[var(--hewie-ring,#cbd5e1)]/45"
                    />
                  </label>
                  <div className="flex gap-2">
                    <button type="button" onClick={addPet} className="rounded-full bg-[var(--hewie-active-text,#334155)] px-4 py-2 text-sm font-bold text-white">
                      Add Pet
                    </button>
                    <button type="button" onClick={() => {
                      setAdding(false);
                      setAddPetMessage("");
                    }} className="rounded-full bg-white px-4 py-2 text-sm font-bold text-[var(--hewie-active-text,#334155)] shadow-sm">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : canAddOwnedPet ? (
                <button
                  type="button"
                  onClick={handleStartAddPet}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--hewie-active-text,#334155)] px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:scale-[1.01] hover:opacity-90"
                >
                  <Plus className="size-4" />
                  Add Pet
                </button>
              ) : null}

              {addPetMessage ? (
                <p className="rounded-2xl bg-[var(--hewie-active-bg,#f1f5f9)]/92 p-3 text-sm font-semibold leading-5 text-[var(--hewie-active-text,#334155)] shadow-sm ring-1 ring-[var(--hewie-ring,#cbd5e1)] backdrop-blur-[1px]">
                  {addPetMessage}
                </p>
              ) : null}

            </div>
          </div>

          {freePetUpgradeDialogOpen ? (
            <div className="fixed inset-0 z-[90] flex items-end bg-zinc-950/35 p-3 backdrop-blur-sm sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-labelledby="add-pet-upgrade-title">
              <button type="button" aria-label="Close upgrade" className="absolute inset-0 cursor-default" onClick={() => setFreePetUpgradeDialogOpen(false)} />
              <div className="relative w-full max-w-md rounded-3xl bg-white p-5 text-zinc-900 shadow-xl ring-1 ring-zinc-200">
                <div className="mb-4">
                  <h3 id="add-pet-upgrade-title" className="flex items-center gap-1.5 whitespace-nowrap text-base font-semibold">
                    <span>Add unlimited pets with</span>
                    <span className="inline-flex rounded-full border border-[var(--hewie-accent,#64748b)] bg-[var(--hewie-active-bg,#f1f5f9)] px-2.5 py-1 text-[13px] font-bold leading-none text-[var(--hewie-active-text,#334155)]">
                      Plus
                    </span>
                  </h3>
                  <p className="mt-1 text-sm font-semibold leading-5 text-[var(--hewie-active-text,#334155)]">
                    Free includes 1 pet. Upgrade to Plus for unlimited pets, notebook sharing, and lifetime health history.
                  </p>
                </div>

                <div className="mb-4 space-y-2 rounded-2xl bg-zinc-50 p-3 ring-1 ring-zinc-200">
                  {[
                    "Unlimited pets",
                    "Notebook sharing",
                    "Unlimited PDF reports",
                    "Lifetime health history",
                  ].map((feature) => (
                    <div key={feature} className="flex items-start gap-2 text-xs font-medium leading-5 text-zinc-500">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                      <span>{feature}</span>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={handleUpgradeForMorePets}
                    className="flex w-full items-center justify-between gap-2 rounded-xl px-0 text-left text-xs font-bold leading-5 text-[var(--hewie-active-text,#334155)]"
                  >
                    <span className="flex items-start gap-2">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                      <span>View all Plus features</span>
                    </span>
                    <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setFreePetUpgradeDialogOpen(false)}
                    className="h-11 rounded-full border border-zinc-200 bg-white px-4 text-sm font-bold text-zinc-700"
                  >
                    Not now
                  </button>
                  <button
                    type="button"
                    onClick={handleUpgradeForMorePets}
                    className="h-11 rounded-full bg-[var(--hewie-active-text,#334155)] px-4 text-sm font-bold text-white"
                  >
                    Upgrade to Plus
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
