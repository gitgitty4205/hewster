"use client";

import Image from "next/image";
import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import {
  activeNotebookOwnerIdFromStorage,
  loadNotebookMembers,
  selectActiveNotebookMembership,
  setActiveNotebookOwnerId,
  type NotebookAccessRole,
  type NotebookMember,
} from "@/lib/notebook-access";
import { defaultPetProfile, loadPetProfile, type PetProfile } from "@/lib/pet-profile";
import { getSupabaseBrowserClient } from "@/lib/supabase";

const PET_ROSTER_STORAGE_KEY = "hewster.petRoster";

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
};

function currentPetToRosterPet(profile: PetProfile): RosterPet {
  return {
    id: "current",
    name: profile.petName || profile.petFirstName || defaultPetProfile.petName,
    species: profile.species || defaultPetProfile.species,
    photoUrl: profile.photoUrl || "/hewster-profile.jpg",
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

export function PetAvatarMenu({ className, width = 80, height = 80 }: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<PetProfile>(() => defaultPetProfile);
  const [pets, setPets] = useState<RosterPet[]>([]);
  const [memberships, setMemberships] = useState<NotebookMember[]>([]);
  const [activeNotebookOwnerId, setActiveNotebookOwnerIdState] = useState<string | null>(null);
  const [notebookRole, setNotebookRole] = useState<NotebookAccessRole | null>(null);
  const [ownNotebook, setOwnNotebook] = useState<NotebookMember | null>(null);
  const [adding, setAdding] = useState(false);
  const [newPetName, setNewPetName] = useState("");
  const [newPetSpecies, setNewPetSpecies] = useState("Dog");

  useEffect(() => {
    const id = window.setTimeout(() => {
      setProfile(loadPetProfile());
      setPets(readRoster(user?.id));
      setActiveNotebookOwnerIdState(activeNotebookOwnerIdFromStorage());
    }, 0);

    return () => window.clearTimeout(id);
  }, [user?.id]);

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
        setActiveNotebookOwnerIdState(activeMembership?.notebookOwnerId ?? null);
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
  const activeMembership = useMemo(
    () => memberships.find((member) => member.notebookOwnerId === activeNotebookOwnerId) ?? null,
    [activeNotebookOwnerId, memberships],
  );
  const accessibleNotebooks = useMemo(() => {
    if (!memberships.length) {
      return [{ ...currentPet, role: notebookRole ?? "owner" as NotebookAccessRole, notebookOwnerId: "local" }];
    }

    return memberships
      .map((member) => {
        const isOwnNotebook = member.notebookOwnerId === user?.id;
        const displayedPet = isOwnNotebook && ownedPrimaryPet ? ownedPrimaryPet : currentPet;

        return {
          id: member.id,
          name: isOwnNotebook && ownedPrimaryPet ? ownedPrimaryPet.name : notebookLabel(member, profile, user?.id),
          species: displayedPet.species || defaultPetProfile.species,
          photoUrl: displayedPet.photoUrl || "/hewster-profile.jpg",
          role: member.role,
          notebookOwnerId: member.notebookOwnerId,
        };
      });
  }, [currentPet, memberships, notebookRole, ownedPrimaryPet, profile, user?.id]);
  const canAddOwnedPet = Boolean(user && ownNotebook);

  const addPet = () => {
    const name = newPetName.trim();
    const species = newPetSpecies.trim() || "Pet";
    if (!name) return;

    const nextPets = [
      ...pets,
      {
        id: `pet-${Date.now()}`,
        name,
        species,
      },
    ];

    setPets(nextPets);
    saveRoster(nextPets, user?.id);
    if (user) {
      setActiveNotebookOwnerId(user.id);
      setActiveNotebookOwnerIdState(user.id);
      setNotebookRole("owner");
    }
    setNewPetName("");
    setNewPetSpecies("Dog");
    setAdding(false);
  };

  const switchNotebook = (ownerId: string) => {
    if (ownerId === "local") return;
    setActiveNotebookOwnerId(ownerId);
    setActiveNotebookOwnerIdState(ownerId);
    setOpen(false);
    window.location.reload();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 rounded-full text-left transition hover:scale-[1.02] focus:outline-none focus:ring-4 focus:ring-[var(--hewie-ring,#cbd5e1)]/55"
        aria-label="Open pet switcher"
      >
        <Image
          src={currentPet.photoUrl || "/hewster-profile.jpg"}
          alt={currentPet.name}
          width={width}
          height={height}
          className={className}
        />
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 bg-zinc-950/25 px-3 py-6 backdrop-blur-sm">
          <div className="relative mx-auto flex h-[82vh] max-h-[720px] min-h-[620px] w-full max-w-md flex-col overflow-hidden rounded-[2rem] bg-[var(--hewie-active-bg,#f1f5f9)] text-[var(--hewie-active-text,#334155)] shadow-2xl ring-1 ring-[var(--hewie-ring,#cbd5e1)]">
            <div
              className="absolute inset-0 bg-cover bg-center grayscale"
              style={{ backgroundImage: `url('${currentPet.photoUrl || "/hewster-profile.jpg"}')` }}
              aria-hidden="true"
            />
            <div className="absolute inset-0 bg-[var(--hewie-bg,#979ca7)]/34" aria-hidden="true" />
            <div className="relative flex items-center justify-between bg-[var(--hewie-active-bg,#f1f5f9)]/92 px-6 py-5 text-[var(--hewie-active-text,#334155)] shadow-sm backdrop-blur-[1px]">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--hewie-active-text,#334155)]/70">Pet Notebook</p>
                <h2 className="text-2xl font-semibold text-[var(--hewie-active-text,#334155)]">Pets</h2>
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

            <div className="relative flex flex-1 flex-col justify-center gap-5 overflow-y-auto px-6 py-8">
              {accessibleNotebooks.length ? (
                accessibleNotebooks.map((pet) => (
                  <button
                    key={pet.id}
                    type="button"
                    onClick={() => switchNotebook(pet.notebookOwnerId)}
                    className="flex items-center gap-4 rounded-[1.45rem] bg-[var(--hewie-active-bg,#f1f5f9)]/88 p-4 text-[var(--hewie-active-text,#334155)] shadow-sm ring-1 ring-[var(--hewie-ring,#cbd5e1)] transition"
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-4 text-left">
                      <span className="relative flex size-[4.75rem] shrink-0 overflow-hidden rounded-[1.45rem] bg-white/20 shadow-sm ring-1 ring-white/35">
                        {pet.photoUrl ? (
                          <Image src={pet.photoUrl} alt={pet.name} fill className="object-cover object-center" sizes="76px" />
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
                <div className="rounded-[1.45rem] bg-[var(--hewie-bg,#979ca7)] p-4 text-sm font-semibold leading-5 text-[var(--hewie-accent-text,#ffffff)] shadow-sm">
                  No pets are showing in this card right now. Archived pets stay saved in their profile.
                </div>
              )}

              {canManagePets && pets.length > 1 ? (
                <div className="space-y-3">
                  {pets.slice(1).map((pet) => (
                    <div
                      key={pet.id}
                      className="rounded-[1.45rem] bg-[var(--hewie-active-bg,#f1f5f9)]/70 p-4 text-sm font-semibold text-[var(--hewie-active-text,#334155)] ring-1 ring-[var(--hewie-ring,#cbd5e1)]"
                    >
                      {pet.name}
                    </div>
                  ))}
                </div>
              ) : null}

              {canAddOwnedPet && adding ? (
                <div className="space-y-3 rounded-[1.45rem] bg-[var(--hewie-active-bg,#f1f5f9)]/92 p-4 shadow-sm ring-1 ring-[var(--hewie-ring,#cbd5e1)] backdrop-blur-[1px]">
                  <label className="block text-sm font-semibold">
                    Pet Name
                    <input
                      value={newPetName}
                      onChange={(event) => setNewPetName(event.target.value)}
                      placeholder="e.g. Miso"
                      className="mt-1 w-full rounded-2xl border border-[var(--hewie-ring,#cbd5e1)] bg-white px-3 py-2.5 text-sm font-medium outline-none focus:border-[var(--hewie-accent,#64748b)] focus:ring-4 focus:ring-[var(--hewie-ring,#cbd5e1)]/45"
                    />
                  </label>
                  <label className="block text-sm font-semibold">
                    Species
                    <input
                      value={newPetSpecies}
                      onChange={(event) => setNewPetSpecies(event.target.value)}
                      placeholder="Dog, Cat, Rabbit..."
                      className="mt-1 w-full rounded-2xl border border-[var(--hewie-ring,#cbd5e1)] bg-white px-3 py-2.5 text-sm font-medium outline-none focus:border-[var(--hewie-accent,#64748b)] focus:ring-4 focus:ring-[var(--hewie-ring,#cbd5e1)]/45"
                    />
                  </label>
                  <div className="flex gap-2">
                    <button type="button" onClick={addPet} className="rounded-full bg-[var(--hewie-active-text,#334155)] px-4 py-2 text-sm font-bold text-white">
                      Add Pet
                    </button>
                    <button type="button" onClick={() => setAdding(false)} className="rounded-full bg-white px-4 py-2 text-sm font-bold text-[var(--hewie-active-text,#334155)] shadow-sm">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : canAddOwnedPet ? (
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="flex w-full items-center justify-center rounded-[1.45rem] bg-[var(--hewie-active-text,#334155)] px-4 py-4 text-sm font-bold text-white shadow-sm transition hover:scale-[1.01] hover:opacity-90"
                >
                  + Add Pet
                </button>
              ) : null}

              <p className="rounded-2xl bg-[var(--hewie-active-bg,#f1f5f9)]/80 px-3 py-2 text-xs leading-5 text-[var(--hewie-active-text,#334155)]/65 ring-1 ring-[var(--hewie-ring,#cbd5e1)] backdrop-blur-[1px]">
                {activeMembership?.role === "owner" ? "Owner tools only apply to the active owned notebook." : "Shared accounts only show pet notebooks they have been invited to."}
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
