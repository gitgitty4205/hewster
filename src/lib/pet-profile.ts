export type ThemeId = "slate" | "violet" | "sky" | "rose" | "emerald" | "amber";

export type PetProfile = {
  petName: string;
  petFirstName: string;
  petLastName: string;
  species: string;
  breed: string;
  birthday: string;
  microchipNumber: string;
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

export const defaultPetProfile: PetProfile = {
  petName: "Hewster",
  petFirstName: "Hewster",
  petLastName: "",
  species: "Dog",
  breed: "",
  birthday: "",
  microchipNumber: "",
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

  const legacyPetName = typeof profile.petName === "string" ? profile.petName : defaultPetProfile.petName;
  const [legacyFirstName, ...legacyLastNameParts] = legacyPetName.trim().split(/\s+/).filter(Boolean);
  const petFirstName = typeof profile.petFirstName === "string" ? profile.petFirstName : legacyFirstName || defaultPetProfile.petFirstName;
  const petLastName = typeof profile.petLastName === "string" ? profile.petLastName : legacyLastNameParts.join(" ");

  return {
    petName: [petFirstName, petLastName].filter(Boolean).join(" ") || defaultPetProfile.petName,
    petFirstName,
    petLastName,
    species: typeof profile.species === "string" ? profile.species : defaultPetProfile.species,
    breed: typeof profile.breed === "string" ? profile.breed : defaultPetProfile.breed,
    birthday: typeof profile.birthday === "string" ? profile.birthday : defaultPetProfile.birthday,
    microchipNumber: typeof profile.microchipNumber === "string" ? profile.microchipNumber : defaultPetProfile.microchipNumber,
    sex: profile.sex === "female" || profile.sex === "male" ? profile.sex : defaultPetProfile.sex,
    spayNeuterStatus:
      profile.spayNeuterStatus === "spayed" || profile.spayNeuterStatus === "neutered" || profile.spayNeuterStatus === "intact"
        ? profile.spayNeuterStatus
        : defaultPetProfile.spayNeuterStatus,
    personality: typeof profile.personality === "string" ? profile.personality : defaultPetProfile.personality,
    likes: typeof profile.likes === "string" ? profile.likes : defaultPetProfile.likes,
    dislikes: typeof profile.dislikes === "string" ? profile.dislikes : defaultPetProfile.dislikes,
    carePreferences: typeof profile.carePreferences === "string" ? profile.carePreferences : defaultPetProfile.carePreferences,
    hasPassedAway: typeof profile.hasPassedAway === "boolean" ? profile.hasPassedAway : defaultPetProfile.hasPassedAway,
    passedAwayDate: typeof profile.passedAwayDate === "string" ? profile.passedAwayDate : defaultPetProfile.passedAwayDate,
    memorialNotes: typeof profile.memorialNotes === "string" ? profile.memorialNotes : defaultPetProfile.memorialNotes,
    archivedFromPetSwitcher: typeof profile.archivedFromPetSwitcher === "boolean" ? profile.archivedFromPetSwitcher : defaultPetProfile.archivedFromPetSwitcher,
    photoUrl: typeof profile.photoUrl === "string" ? profile.photoUrl : defaultPetProfile.photoUrl,
    weightUnit: profile.weightUnit === "kg" ? "kg" : "lb",
    themeId,
  };
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

export function savePetProfile(profile: PetProfile) {
  window.localStorage.setItem(PET_PROFILE_STORAGE_KEY, JSON.stringify(profile));
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
