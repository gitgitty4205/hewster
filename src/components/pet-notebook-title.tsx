"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

import { PET_PROFILE_STORAGE_KEY, defaultPetProfile, normalizePetProfile } from "@/lib/pet-profile";

const defaultPetProfileSnapshot = JSON.stringify(defaultPetProfile);

function getPetProfileSnapshot() {
  if (typeof window === "undefined") return defaultPetProfileSnapshot;
  return window.localStorage.getItem(PET_PROFILE_STORAGE_KEY) ?? defaultPetProfileSnapshot;
}

function subscribeToPetProfile(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener("pet-profile-updated", onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener("pet-profile-updated", onStoreChange);
  };
}

function notebookTitleFromSnapshot(snapshot: string) {
  try {
    const profile = normalizePetProfile(JSON.parse(snapshot));
    const petName = profile.petName || profile.petFirstName || defaultPetProfile.petName;
    return `${petName}'s Notebook`;
  } catch {
    return `${defaultPetProfile.petName}'s Notebook`;
  }
}

type Props = {
  className?: string;
  href?: string;
};

export function PetNotebookTitle({ className, href }: Props) {
  const profileSnapshot = useSyncExternalStore(
    subscribeToPetProfile,
    getPetProfileSnapshot,
    () => defaultPetProfileSnapshot,
  );
  const title = notebookTitleFromSnapshot(profileSnapshot);

  if (href) {
    return <Link href={href} className={className}>{title}</Link>;
  }

  return <span className={className}>{title}</span>;
}
