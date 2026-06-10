export type ThemeId = "slate" | "violet" | "sky" | "rose" | "emerald" | "amber";

import type { SupabaseClient, User } from "@supabase/supabase-js";

import { resolveActiveNotebookAccess } from "@/lib/notebook-access";
import { getStoredSupabaseSession, HEWSTER_PROFILE_SLUG } from "@/lib/supabase";
import { TEXT_LIMITS, clampText } from "@/lib/text-limits";

export type PetProfile = {
  petName: string;
  petFirstName: string;
  petLastName: string;
  species: string;
  breed: string;
  birthday: string;
  manualAge: string;
  microchipNumber: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  color: string;
  sex: "" | "female" | "male";
  spayNeuterStatus: "" | "spayed" | "neutered" | "intact";
  personality: string;
  likes: string;
  dislikes: string;
  carePreferences: string;
  hasPassedAway: boolean;
  passedAwayDate: string;
  memorialNotes: string;
  archivedFromPetSwitcher: boolean;
  photoUrl: string;
  weightUnit: "lb" | "kg";
  themeId: ThemeId;
};

export const PET_PROFILE_STORAGE_KEY = "hewster.petProfile";
export const USER_THEME_STORAGE_KEY = "hewster.userTheme";
export const PET_THEME_UPDATED_EVENT = "pet-theme-updated";
export const PET_PROFILE_UPDATED_EVENT = "pet-profile-updated";
export const DEFAULT_PET_PHOTO_URL = "/paw-print.svg";

type PetProfileRow = {
  profile: unknown;
};

function canSyncSharedPetProfile(role: string) {
  return role === "owner" || role === "co-owner";
}

async function upsertSharedPetProfile(supabase: SupabaseClient, ownerId: string, profile: PetProfile) {
  return supabase.from("pet_profiles").upsert(
    {
      owner_id: ownerId,
      profile_slug: HEWSTER_PROFILE_SLUG,
      profile,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "owner_id,profile_slug" },
  );
}

export const defaultPetProfile: PetProfile = {
  petName: "Pet",
  petFirstName: "Pet",
  petLastName: "",
  species: "Dog",
  breed: "",
  birthday: "",
  manualAge: "",
  microchipNumber: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  color: "",
  sex: "",
  spayNeuterStatus: "",
  personality: "",
  likes: "",
  dislikes: "",
  carePreferences: "",
  hasPassedAway: false,
  passedAwayDate: "",
  memorialNotes: "",
  archivedFromPetSwitcher: false,
  photoUrl: "",
  weightUnit: "lb",
  themeId: "slate",
};

export const appThemes: Record<ThemeId, {
  id: ThemeId;
  name: string;
  background: string;
  activeBg: string;
  activeText: string;
  accent: string;
  accentText: string;
  ring: string;
}> = {
  slate: {
    id: "slate",
    name: "Notebook Slate",
    background: "#999b96",
    activeBg: "#f1f1ed",
    activeText: "#3f4540",
    accent: "#686d67",
    accentText: "#ffffff",
    ring: "#cccec8",
  },
  violet: {
    id: "violet",
    name: "Dusty Plum",
    background: "#a7a0bd",
    activeBg: "#f0edf5",
    activeText: "#58436f",
    accent: "#78608f",
    accentText: "#ffffff",
    ring: "#cec4d9",
  },
  sky: {
    id: "sky",
    name: "Soft Denim",
    background: "#8fa8b8",
    activeBg: "#e9eef8",
    activeText: "#35506f",
    accent: "#4f7ea8",
    accentText: "#ffffff",
    ring: "#bdcada",
  },
  rose: {
    id: "rose",
    name: "Dusty Mauve",
    background: "#b69aa0",
    activeBg: "#f5eeee",
    activeText: "#764e57",
    accent: "#9a6874",
    accentText: "#ffffff",
    ring: "#d7c1c6",
  },
  emerald: {
    id: "emerald",
    name: "Muted Sage",
    background: "#8fa79b",
    activeBg: "#eef3ef",
    activeText: "#4d6657",
    accent: "#647e6d",
    accentText: "#ffffff",
    ring: "#c4d2c8",
  },
  amber: {
    id: "amber",
    name: "Soft Sand",
    background: "#b5a06f",
    activeBg: "#f4efe3",
    activeText: "#6f5a3a",
    accent: "#8a5f2f",
    accentText: "#ffffff",
    ring: "#d5c6a8",
  },
};

export function normalizePetProfile(value: unknown): PetProfile {
  if (!value || typeof value !== "object") return defaultPetProfile;

  const profile = value as Partial<PetProfile>;
  const themeId = profile.themeId && appThemes[profile.themeId] ? profile.themeId : defaultPetProfile.themeId;

  const legacyPetName = typeof profile.petName === "string" ? profile.petName.trim() : defaultPetProfile.petName;
  const [legacyFirstName, ...legacyLastNameParts] = legacyPetName.trim().split(/\s+/).filter(Boolean);
  const petFirstName = clampText(typeof profile.petFirstName === "string" ? profile.petFirstName.trim() : legacyFirstName || defaultPetProfile.petFirstName, TEXT_LIMITS.shortName);
  const petLastName = clampText(typeof profile.petLastName === "string" ? profile.petLastName.trim() : legacyLastNameParts.join(" "), TEXT_LIMITS.shortName);

  return {
    petName: [petFirstName, petLastName].filter(Boolean).join(" ") || defaultPetProfile.petName,
    petFirstName,
    petLastName,
    species: clampText(typeof profile.species === "string" ? profile.species : defaultPetProfile.species, TEXT_LIMITS.shortName),
    breed: clampText(typeof profile.breed === "string" ? profile.breed : defaultPetProfile.breed, TEXT_LIMITS.shortName),
    birthday: typeof profile.birthday === "string" ? profile.birthday : defaultPetProfile.birthday,
    manualAge: clampText(typeof profile.manualAge === "string" ? profile.manualAge : defaultPetProfile.manualAge, 24),
    microchipNumber: clampText(typeof profile.microchipNumber === "string" ? profile.microchipNumber : defaultPetProfile.microchipNumber, TEXT_LIMITS.shortName),
    emergencyContactName: clampText(typeof profile.emergencyContactName === "string" ? profile.emergencyContactName : defaultPetProfile.emergencyContactName, TEXT_LIMITS.shortName),
    emergencyContactPhone: clampText(typeof profile.emergencyContactPhone === "string" ? profile.emergencyContactPhone : defaultPetProfile.emergencyContactPhone, TEXT_LIMITS.shortName),
    color: clampText(typeof profile.color === "string" ? profile.color : defaultPetProfile.color, TEXT_LIMITS.shortName),
    sex: profile.sex === "female" || profile.sex === "male" ? profile.sex : defaultPetProfile.sex,
    spayNeuterStatus:
      profile.spayNeuterStatus === "spayed" || profile.spayNeuterStatus === "neutered" || profile.spayNeuterStatus === "intact"
        ? profile.spayNeuterStatus
        : defaultPetProfile.spayNeuterStatus,
    personality: clampText(typeof profile.personality === "string" ? profile.personality : defaultPetProfile.personality, TEXT_LIMITS.note),
    likes: clampText(typeof profile.likes === "string" ? profile.likes : defaultPetProfile.likes, TEXT_LIMITS.note),
    dislikes: clampText(typeof profile.dislikes === "string" ? profile.dislikes : defaultPetProfile.dislikes, TEXT_LIMITS.note),
    carePreferences: clampText(typeof profile.carePreferences === "string" ? profile.carePreferences : defaultPetProfile.carePreferences, TEXT_LIMITS.note),
    hasPassedAway: typeof profile.hasPassedAway === "boolean" ? profile.hasPassedAway : defaultPetProfile.hasPassedAway,
    passedAwayDate: typeof profile.passedAwayDate === "string" ? profile.passedAwayDate : defaultPetProfile.passedAwayDate,
    memorialNotes: clampText(typeof profile.memorialNotes === "string" ? profile.memorialNotes : defaultPetProfile.memorialNotes, TEXT_LIMITS.note),
    archivedFromPetSwitcher: typeof profile.archivedFromPetSwitcher === "boolean" ? profile.archivedFromPetSwitcher : defaultPetProfile.archivedFromPetSwitcher,
    photoUrl: typeof profile.photoUrl === "string" ? profile.photoUrl : defaultPetProfile.photoUrl,
    weightUnit: profile.weightUnit === "kg" ? "kg" : "lb",
    themeId,
  };
}

export function formatPetAgeFromBirthday(birthday: string) {
  if (!birthday) return "";
  const birthDate = new Date(`${birthday}T00:00:00`);
  if (Number.isNaN(birthDate.getTime())) return "";

  const today = new Date();
  let years = today.getFullYear() - birthDate.getFullYear();
  let months = today.getMonth() - birthDate.getMonth();
  if (today.getDate() < birthDate.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years < 0) return "";

  if (years > 0 && months > 0) return `${years} yr ${months} mo`;
  if (years > 0) return `${years} yr`;
  if (months > 0) return `${months} mo`;
  return "Under 1 mo";
}

export function displayPetAge(profile: Pick<PetProfile, "birthday" | "manualAge">) {
  return profile.birthday ? formatPetAgeFromBirthday(profile.birthday) : profile.manualAge.trim();
}

export function loadPetProfile() {
  if (typeof window === "undefined") return defaultPetProfile;

  try {
    const stored = window.localStorage.getItem(PET_PROFILE_STORAGE_KEY);
    return stored ? normalizePetProfile(JSON.parse(stored)) : defaultPetProfile;
  } catch {
    return defaultPetProfile;
  }
}

export function savePetProfile(profile: PetProfile, options: { notify?: boolean } = {}) {
  try {
    window.localStorage.setItem(PET_PROFILE_STORAGE_KEY, JSON.stringify(profile));
    if (options.notify !== false) {
      window.dispatchEvent(new Event(PET_PROFILE_UPDATED_EVENT));
    }
    return true;
  } catch {
    return false;
  }
}

export async function loadSharedPetProfile(supabase: SupabaseClient, user: User) {
  const access = await resolveActiveNotebookAccess(supabase, user);
  const localProfile = loadPetProfile();
  const { data, error } = await supabase
    .from("pet_profiles")
    .select("profile")
    .eq("owner_id", access.notebookOwnerId)
    .eq("profile_slug", HEWSTER_PROFILE_SLUG)
    .maybeSingle();

  if (error || !data) {
    if (canSyncSharedPetProfile(access.role) && localProfile.photoUrl) {
      await upsertSharedPetProfile(supabase, access.notebookOwnerId, localProfile);
    }
    return localProfile;
  }

  const profile = normalizePetProfile((data as PetProfileRow).profile);
  if (!profile.photoUrl && localProfile.photoUrl && canSyncSharedPetProfile(access.role)) {
    const repairedProfile = { ...profile, photoUrl: localProfile.photoUrl };
    await upsertSharedPetProfile(supabase, access.notebookOwnerId, repairedProfile);
    savePetProfile(repairedProfile, { notify: false });
    return repairedProfile;
  }

  savePetProfile(profile, { notify: false });
  return profile;
}

export async function saveSharedPetProfile(supabase: SupabaseClient, user: User, profile: PetProfile) {
  const access = await resolveActiveNotebookAccess(supabase, user);
  if (access.role !== "owner" && access.role !== "co-owner") {
    throw new Error("Only owners and co-owners can edit the pet profile.");
  }

  const { error } = await upsertSharedPetProfile(supabase, access.notebookOwnerId, profile);

  if (error) throw new Error(error.message || "Could not save pet profile.");
  savePetProfile(profile);
}

function userThemeStorageKey(userId?: string | null) {
  return `${USER_THEME_STORAGE_KEY}:${userId || "guest"}`;
}

function activeUserThemeId(userId?: string | null) {
  return userId ?? getStoredSupabaseSession()?.user?.id ?? null;
}

function normalizeThemeId(value: string | null | undefined): ThemeId | null {
  return value && value in appThemes ? value as ThemeId : null;
}

export function loadUserTheme(userId?: string | null) {
  if (typeof window === "undefined") return defaultPetProfile.themeId;

  const storedTheme = normalizeThemeId(window.localStorage.getItem(userThemeStorageKey(activeUserThemeId(userId))));
  if (storedTheme) return storedTheme;

  return loadPetProfile().themeId;
}

export function saveUserTheme(themeId: ThemeId, userId?: string | null) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(userThemeStorageKey(activeUserThemeId(userId)), themeId);
  window.dispatchEvent(new Event(PET_THEME_UPDATED_EVENT));
}

export function applyPetTheme(themeId: ThemeId) {
  if (typeof document === "undefined") return;

  const theme = appThemes[themeId] ?? appThemes.slate;
  const root = document.documentElement;
  root.style.setProperty("--hewie-bg", theme.background);
  root.style.setProperty("--hewie-active-bg", theme.activeBg);
  root.style.setProperty("--hewie-active-text", theme.activeText);
  root.style.setProperty("--hewie-accent", theme.accent);
  root.style.setProperty("--hewie-accent-text", theme.accentText);
  root.style.setProperty("--hewie-ring", theme.ring);
}
