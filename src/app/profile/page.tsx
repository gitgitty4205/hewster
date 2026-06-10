"use client";

import Image from "next/image";
import { CircleHelp, Heart, Pencil, ShieldCheck } from "lucide-react";
import { PetAvatarMenu } from "@/components/pet-avatar-menu";
import { useEffect, useState } from "react";

import { BottomNav } from "@/components/bottom-nav";
import { Button } from "@/components/ui/button";
import { PetNotebookTitle } from "@/components/pet-notebook-title";
import { useAuth } from "@/components/auth-provider";
import {
  inviteNotebookMember,
  loadNotebookMembers,
  notebookAccessRoleDescriptions,
  notebookInviteRoles,
  removeNotebookMember,
  selectActiveNotebookMembership,
  updateNotebookMemberRole,
  type NotebookAccessRole,
  type NotebookMember,
} from "@/lib/notebook-access";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import {
  appThemes,
  applyPetTheme,
  DEFAULT_PET_PHOTO_URL,
  displayPetAge,
  loadPetProfile,
  loadSharedPetProfile,
  loadUserTheme,
  savePetProfile,
  saveSharedPetProfile,
  saveUserTheme,
  type PetProfile,
  type ThemeId,
} from "@/lib/pet-profile";
import { TEXT_LIMITS, clampText } from "@/lib/text-limits";
import { loadStoredSubscriptionPlan, type SubscriptionPlanId } from "@/lib/subscription-plan";

const EMAIL_MAX_LENGTH = 254;

function petNotebookName(profile: PetProfile) {
  const petFirstName = profile.petFirstName.trim() || profile.petName.split(/\s+/)[0] || "Pet";
  return `${petFirstName}'s Notebook`;
}

function notebookRoleLabel(role: NotebookAccessRole) {
  if (role === "pet-sitter") return "Pet Sitter";
  if (role === "co-owner") return "Co-owner";
  if (role === "caretaker") return "Caretaker";
  return "Owner";
}

function accessStatusLabel(status: NotebookMember["status"]) {
  if (status === "active") return "Active";
  if (status === "invited") return "Invited";
  return "Revoked";
}

type RequiredPetInfoField = "petFirstName" | "petLastName" | "species" | "breed" | "birthday" | "sex" | "spayNeuterStatus" | "color";

function missingRequiredPetInfoFields(profile: PetProfile): RequiredPetInfoField[] {
  const missing: RequiredPetInfoField[] = [];
  if (!profile.petFirstName.trim()) missing.push("petFirstName");
  if (!profile.petLastName.trim()) missing.push("petLastName");
  if (!profile.species.trim()) missing.push("species");
  if (!profile.breed.trim()) missing.push("breed");
  if (!profile.birthday) missing.push("birthday");
  if (!profile.sex) missing.push("sex");
  if (!profile.spayNeuterStatus) missing.push("spayNeuterStatus");
  if (!profile.color.trim()) missing.push("color");
  return missing;
}

function RequiredMark({ show }: { show: boolean }) {
  return show ? <span className="text-rose-500">*</span> : null;
}

function todayDateInputValue() {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatRememberedDate(value: string) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

const MAX_PROFILE_PHOTO_ORIGINAL_BYTES = 900_000;
const MAX_PROFILE_PHOTO_SIZE = 1600;
const PROFILE_PHOTO_JPEG_QUALITY = 0.92;

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read this photo."));
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Could not read this photo."));
    };
    reader.readAsDataURL(file);
  });
}

async function prepareProfilePhoto(file: File) {
  if (file.size <= MAX_PROFILE_PHOTO_ORIGINAL_BYTES) {
    return fileToDataUrl(file);
  }

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read this photo."));
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Could not read this photo."));
        return;
      }

      const image = new window.Image();
      image.onerror = () => reject(new Error("Could not load this photo."));
      image.onload = () => {
        const scale = Math.min(1, MAX_PROFILE_PHOTO_SIZE / Math.max(image.naturalWidth, image.naturalHeight));
        const width = Math.max(1, Math.round(image.naturalWidth * scale));
        const height = Math.max(1, Math.round(image.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Could not prepare this photo."));
          return;
        }

        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", PROFILE_PHOTO_JPEG_QUALITY));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function ProfilePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<PetProfile>(() => loadPetProfile());
  const [themeId, setThemeId] = useState<ThemeId>(() => loadUserTheme());
  const [saveState, setSaveState] = useState<"idle" | "saved">("idle");
  const [accessEmail, setAccessEmail] = useState("");
  const [accessRole, setAccessRole] = useState<Exclude<NotebookAccessRole, "owner">>("caretaker");
  const [members, setMembers] = useState<NotebookMember[]>([]);
  const [activeNotebookOwnerId, setActiveNotebookOwnerId] = useState("");
  const [activeNotebookRole, setActiveNotebookRole] = useState<NotebookAccessRole>("owner");
  const [pendingMemberAccess, setPendingMemberAccess] = useState<Record<string, Exclude<NotebookAccessRole, "owner"> | "remove">>({});
  const [accessStatus, setAccessStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [accessMessage, setAccessMessage] = useState("");
  const [accessRoleHelp, setAccessRoleHelp] = useState<Exclude<NotebookAccessRole, "owner"> | null>(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isEditingAbout, setIsEditingAbout] = useState(false);
  const [isEditingEmergencyContact, setIsEditingEmergencyContact] = useState(false);
  const [missingPetInfoFields, setMissingPetInfoFields] = useState<Set<RequiredPetInfoField>>(new Set());
  const [profileValidationMessage, setProfileValidationMessage] = useState("");
  const [profilePhotoMessage, setProfilePhotoMessage] = useState("");
  const [showGoodbyeIntro, setShowGoodbyeIntro] = useState(false);
  const [showMemorialSettings, setShowMemorialSettings] = useState(false);
  const [subscriptionPlan, setSubscriptionPlan] = useState<SubscriptionPlanId>("free");

  useEffect(() => {
    const refreshPlan = () => setSubscriptionPlan(loadStoredSubscriptionPlan());
    refreshPlan();
    window.addEventListener("storage", refreshPlan);
    window.addEventListener("focus", refreshPlan);
    return () => {
      window.removeEventListener("storage", refreshPlan);
      window.removeEventListener("focus", refreshPlan);
    };
  }, []);

  useEffect(() => {
    void Promise.resolve().then(async () => {
      const supabase = getSupabaseBrowserClient();
      const storedProfile = supabase && user
        ? await loadSharedPetProfile(supabase, user)
        : loadPetProfile();
      setProfile(storedProfile);
      setThemeId(loadUserTheme(user?.id));
    });
  }, [user]);

  useEffect(() => {
    applyPetTheme(themeId);
  }, [themeId]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !user) return;

    let active = true;
    loadNotebookMembers(supabase, user).then((loadedMembers) => {
      if (!active) return;
      const { activeMembership } = selectActiveNotebookMembership(loadedMembers, user.id, user.email);
      const notebookOwnerId = activeMembership?.notebookOwnerId ?? user.id;
      setActiveNotebookOwnerId(notebookOwnerId);
      setActiveNotebookRole(activeMembership?.role ?? "owner");
      setMembers(loadedMembers.filter((member) => member.notebookOwnerId === notebookOwnerId));
    });

    return () => {
      active = false;
    };
  }, [user]);

  async function refreshMembers() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !user) return;
    const loadedMembers = await loadNotebookMembers(supabase, user);
    const { activeMembership } = selectActiveNotebookMembership(loadedMembers, user.id, user.email);
    const notebookOwnerId = activeMembership?.notebookOwnerId ?? user.id;
    setActiveNotebookOwnerId(notebookOwnerId);
    setActiveNotebookRole(activeMembership?.role ?? "owner");
    setMembers(loadedMembers.filter((member) => member.notebookOwnerId === notebookOwnerId));
  }

  async function handleInvitePerson() {
    if (subscriptionPlan !== "plus") {
      setAccessStatus("error");
      setAccessMessage("Shared access is a PetNotebook Plus feature. Upgrade for $9.99/month to invite people.");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase || !user) {
      setAccessStatus("error");
      setAccessMessage("Sign in as the notebook owner to add people.");
      return;
    }

    setAccessStatus("saving");
    setAccessMessage("");

    try {
      const inviteResult = await inviteNotebookMember(
        supabase,
        user,
        accessEmail,
        accessRole,
        petNotebookName(profile),
        profile.photoUrl || DEFAULT_PET_PHOTO_URL,
      );
      setAccessEmail("");
      await refreshMembers();
      setAccessStatus("saved");
      if (inviteResult.emailSent) {
        setAccessMessage("Invitation email sent.");
      } else if (inviteResult.emailSkipped) {
        setAccessMessage("Invitation saved. Email sending is not configured yet, so they can sign in with this email to claim access.");
      } else if (inviteResult.emailError) {
        setAccessMessage(`Invitation saved, but email failed: ${inviteResult.emailError}`);
      } else {
        setAccessMessage("Invitation saved. They can sign in with this email to access the notebook.");
      }
    } catch (error) {
      setAccessStatus("error");
      setAccessMessage(error instanceof Error ? error.message : "Could not add this person.");
    }
  }

  async function handleSaveMemberAccess(member: NotebookMember) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !user || member.role === "owner") return;

    const pendingAccess = pendingMemberAccess[member.id];
    if (!pendingAccess || pendingAccess === member.role) return;

    setAccessStatus("saving");
    setAccessMessage("");

    try {
      if (pendingAccess === "remove") {
        await removeNotebookMember(supabase, user, member.id);
        setAccessMessage("Access removed.");
      } else {
        await updateNotebookMemberRole(supabase, user, member.id, pendingAccess);
        setAccessMessage("Access level updated.");
      }

      setPendingMemberAccess((current) => {
        const next = { ...current };
        delete next[member.id];
        return next;
      });
      await refreshMembers();
      setAccessStatus("saved");
    } catch (error) {
      setAccessStatus("error");
      setAccessMessage(error instanceof Error ? error.message : "Could not update access.");
    }
  }


  const updateProfile = (next: Partial<PetProfile>) => {
    const merged = { ...profile, ...next };
    const updated = {
      ...merged,
      petName: [merged.petFirstName, merged.petLastName].filter(Boolean).join(" ") || merged.petName,
    };
    setProfile(updated);
    const saved = savePetProfile(updated);
    if (!saved) {
      setProfilePhotoMessage("Could not save this change because browser storage is full.");
      return;
    }
    const supabase = getSupabaseBrowserClient();
    if (supabase && user) {
      void saveSharedPetProfile(supabase, user, updated).catch(() => {
        setProfilePhotoMessage("Saved on this device, but could not sync the shared profile.");
      });
    }
    if (profileValidationMessage) {
      const missing = missingRequiredPetInfoFields(updated);
      setMissingPetInfoFields(new Set(missing));
      if (missing.length === 0) setProfileValidationMessage("");
    }
    setSaveState("saved");
    window.setTimeout(() => setSaveState("idle"), 1400);
  };

  const handleProfilePhotoFile = async (file?: File) => {
    if (!canManageProfilePhoto) return;
    if (!file || !file.type.startsWith("image/")) return;

    setProfilePhotoMessage("");
    try {
      const photoUrl = await prepareProfilePhoto(file);
      updateProfile({ photoUrl });
    } catch {
      setProfilePhotoMessage("Could not save this photo. Try a different image.");
    }
  };

  const handleDoneEditingProfile = () => {
    const missing = missingRequiredPetInfoFields(profile);
    if (missing.length > 0) {
      setMissingPetInfoFields(new Set(missing));
      setProfileValidationMessage("Fill in the required Pet Info fields before saving.");
      return;
    }

    setMissingPetInfoFields(new Set());
    setProfileValidationMessage("");
    setIsEditingProfile(false);
  };

  const updateTheme = (nextThemeId: ThemeId) => {
    setThemeId(nextThemeId);
    saveUserTheme(nextThemeId, user?.id);
    applyPetTheme(nextThemeId);
    setSaveState("saved");
    window.setTimeout(() => setSaveState("idle"), 1400);
  };

  const theme = appThemes[themeId];
  const notebookName = petNotebookName(profile);
  const isNotebookSharingUnlocked = subscriptionPlan === "plus";
  const canManageNotebookAccess = activeNotebookRole === "owner" && activeNotebookOwnerId === user?.id && isNotebookSharingUnlocked;
  const canOwnNotebookAccess = activeNotebookRole === "owner" && activeNotebookOwnerId === user?.id;
  const notebookRoleLoaded = !user || Boolean(activeNotebookOwnerId);
  const canEditProfile = !user || canOwnNotebookAccess;
  const canManageProfilePhoto = !user || (notebookRoleLoaded && activeNotebookRole === "owner" && activeNotebookOwnerId === user.id);
  const profileDetailsLocked = !canEditProfile || !isEditingProfile;
  const aboutDetailsLocked = !canEditProfile || !isEditingAbout;
  const emergencyContactLocked = !canEditProfile || !isEditingEmergencyContact;
  const calculatedAge = displayPetAge(profile);
  const petFirstName = profile.petFirstName.trim() || profile.petName.split(/\s+/)[0] || "Pet";
  const rememberedDateLabel = formatRememberedDate(profile.passedAwayDate);
  const petInfoInputClass = (field?: RequiredPetInfoField) =>
    `w-full rounded-2xl border bg-white px-3 py-2.5 text-sm outline-none transition focus:ring-4 ${
      field && missingPetInfoFields.has(field)
        ? "border-rose-300 focus:border-rose-300 focus:ring-rose-100"
        : "border-zinc-200 focus:border-[var(--hewie-ring,#cbd5e1)] focus:ring-zinc-100"
    }`;

  return (
    <main className="min-h-screen bg-[var(--hewie-bg,#979ca7)] text-zinc-900">
      <div className="content-fade-in mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-24 pt-6">
        <header className="mb-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <PetNotebookTitle href="/hewie" className="text-sm font-bold text-[var(--hewie-active-text,#6d28d9)]" />
              <h1 className="mt-1 text-xl font-bold tracking-tight text-[#3b2832]">Pet Profile</h1>
            </div>
            <PetAvatarMenu shape="tile" />
          </div>
        </header>

        <section className="mb-4 rounded-3xl bg-[var(--hewie-active-bg,#f1f5f9)] p-5 text-[var(--hewie-active-text,#334155)] shadow-sm ring-1 ring-[var(--hewie-ring,#cbd5e1)]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">Pet Info</h2>
                <button
                  type="button"
                  onClick={() => setShowGoodbyeIntro(true)}
                  disabled={profileDetailsLocked}
                  className="flex items-center justify-center text-[var(--hewie-active-text,#334155)]/60 transition hover:text-[var(--hewie-active-text,#334155)]/75"
                  aria-label="Sensitive pet options"
                >
                  <Heart className="size-4 fill-current" />
                </button>
              </div>
              <p className="text-sm text-[var(--hewie-active-text,#334155)]/65">Shared with everyone who has notebook access.</p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <p className="min-h-4 text-xs font-semibold text-emerald-600">{saveState === "saved" ? "Saved" : ""}</p>
              {canEditProfile ? (
                isEditingProfile ? (
                  <button
                    type="button"
                    onClick={handleDoneEditingProfile}
                    className="inline-flex items-center rounded-full bg-white/75 px-3 py-1.5 text-xs font-bold text-[var(--hewie-active-text,#334155)]/75 shadow-sm ring-1 ring-[var(--hewie-ring,#cbd5e1)] transition hover:bg-white"
                  >
                    Save
                  </button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setIsEditingProfile(true)}
                    className="size-9 shrink-0 rounded-full bg-white/75 text-[var(--hewie-active-text,#334155)]/70 ring-[var(--hewie-ring,#cbd5e1)] hover:bg-white"
                    aria-label="Edit pet profile"
                  >
                    <Pencil className="size-4" />
                  </Button>
                )
              ) : (
                <span className="rounded-full bg-white/65 px-3 py-1.5 text-xs font-bold text-[var(--hewie-active-text,#334155)]/55 ring-1 ring-[var(--hewie-ring,#cbd5e1)]">
                  View Only
                </span>
              )}
            </div>
          </div>
          {profileValidationMessage ? (
            <p className="mb-3 rounded-2xl bg-rose-50 p-3 text-xs font-semibold leading-5 text-rose-700 ring-1 ring-rose-100">
              {profileValidationMessage}
            </p>
          ) : null}
          {profile.hasPassedAway ? (
            <div className="mb-3 rounded-2xl bg-white/70 p-3 text-sm ring-1 ring-[var(--hewie-ring,#cbd5e1)]/70">
              <p className="font-semibold text-[var(--hewie-active-text,#334155)]/85">Remembered{rememberedDateLabel ? ` ${rememberedDateLabel}` : ""}</p>
              {profile.memorialNotes ? (
                <p className="mt-1 text-[var(--hewie-active-text,#334155)]/65">{profile.memorialNotes}</p>
              ) : null}
            </div>
          ) : null}

          <fieldset disabled={profileDetailsLocked} className="space-y-3 disabled:opacity-80">
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="mb-1 flex items-center gap-1 font-medium text-[var(--hewie-active-text,#334155)]/85">Pet Name <RequiredMark show={isEditingProfile} /></span>
                <input
                  value={profile.petFirstName}
                  onChange={(event) => updateProfile({ petFirstName: clampText(event.target.value, TEXT_LIMITS.shortName) })}
                  maxLength={TEXT_LIMITS.shortName}
                  required
                  className={petInfoInputClass("petFirstName")}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 flex items-center gap-1 font-medium text-[var(--hewie-active-text,#334155)]/85">Family Name <RequiredMark show={isEditingProfile} /></span>
                <input
                  value={profile.petLastName}
                  onChange={(event) => updateProfile({ petLastName: clampText(event.target.value, TEXT_LIMITS.shortName) })}
                  maxLength={TEXT_LIMITS.shortName}
                  required
                  className={petInfoInputClass("petLastName")}
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="mb-1 flex items-center gap-1 font-medium text-[var(--hewie-active-text,#334155)]/85">Species <RequiredMark show={isEditingProfile} /></span>
                <input
                  value={profile.species}
                  onChange={(event) => updateProfile({ species: clampText(event.target.value, TEXT_LIMITS.shortName) })}
                  maxLength={TEXT_LIMITS.shortName}
                  required
                  className={petInfoInputClass("species")}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 flex items-center gap-1 font-medium text-[var(--hewie-active-text,#334155)]/85">Breed <RequiredMark show={isEditingProfile} /></span>
                <input
                  value={profile.breed}
                  onChange={(event) => updateProfile({ breed: clampText(event.target.value, TEXT_LIMITS.shortName) })}
                  maxLength={TEXT_LIMITS.shortName}
                  required
                  className={petInfoInputClass("breed")}
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="mb-1 flex items-center gap-1 font-medium text-[var(--hewie-active-text,#334155)]/85">Birthday <RequiredMark show={isEditingProfile} /></span>
                <input
                  type="date"
                  value={profile.birthday}
                  onChange={(event) => updateProfile({ birthday: event.target.value })}
                  required
                  className={petInfoInputClass("birthday")}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-[var(--hewie-active-text,#334155)]/85">Age</span>
                <input
                  type="text"
                  value={calculatedAge}
                  onChange={(event) => updateProfile({ manualAge: event.target.value.slice(0, 24) })}
                  maxLength={24}
                  placeholder="Optional"
                  readOnly={Boolean(profile.birthday) || profileDetailsLocked}
                  aria-readonly={Boolean(profile.birthday) || profileDetailsLocked}
                  className={petInfoInputClass()}
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="mb-1 flex items-center gap-1 font-medium text-[var(--hewie-active-text,#334155)]/85">Sex <RequiredMark show={isEditingProfile} /></span>
                <select
                  value={profile.sex}
                  onChange={(event) => updateProfile({ sex: event.target.value as PetProfile["sex"] })}
                  required
                  className={petInfoInputClass("sex")}
                >
                  <option value="">Select</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 flex items-center gap-1 font-medium text-[var(--hewie-active-text,#334155)]/85">Spay / Neuter <RequiredMark show={isEditingProfile} /></span>
                <select
                  value={profile.spayNeuterStatus}
                  onChange={(event) => updateProfile({ spayNeuterStatus: event.target.value as PetProfile["spayNeuterStatus"] })}
                  required
                  className={petInfoInputClass("spayNeuterStatus")}
                >
                  <option value="">Select</option>
                  <option value="spayed">Spayed</option>
                  <option value="neutered">Neutered</option>
                  <option value="intact">Not Spayed / Neutered</option>
                </select>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-[var(--hewie-active-text,#334155)]/85">Microchip #</span>
                <input
                  value={profile.microchipNumber}
                  onChange={(event) => updateProfile({ microchipNumber: clampText(event.target.value, TEXT_LIMITS.shortName) })}
                  maxLength={TEXT_LIMITS.shortName}
                  placeholder="Optional"
                  className={petInfoInputClass()}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 flex items-center gap-1 font-medium text-[var(--hewie-active-text,#334155)]/85">Color <RequiredMark show={isEditingProfile} /></span>
                <input
                  value={profile.color}
                  onChange={(event) => updateProfile({ color: clampText(event.target.value, TEXT_LIMITS.shortName) })}
                  maxLength={TEXT_LIMITS.shortName}
                  required
                  className={petInfoInputClass("color")}
                />
              </label>
            </div>
          </fieldset>
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
                  if (profileDetailsLocked) return;
                  setShowGoodbyeIntro(false);
                  setShowMemorialSettings(true);
                }}
                disabled={profileDetailsLocked}
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
                  <h2 className="text-lg font-semibold">Remember {petFirstName}</h2>
                  <p className="text-sm leading-5 text-[var(--hewie-active-text,#334155)]/65">
                    This pauses daily care reminders and keeps a simple memorial note on the profile.
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
                  onChange={(event) => updateProfile({
                    hasPassedAway: event.target.checked,
                    passedAwayDate: event.target.checked && !profile.passedAwayDate ? todayDateInputValue() : profile.passedAwayDate,
                  })}
                  disabled={profileDetailsLocked}
                  className="mt-1 size-4 accent-[var(--hewie-accent,#64748b)]"
                />
                <span>
                  I want this pet to be remembered
                  <span className="mt-0.5 block text-xs font-medium text-[var(--hewie-active-text,#334155)]/60">
                    Stops today&apos;s upcoming meals, care reminders, and alert cards.
                  </span>
                </span>
              </label>

              <label className="flex items-start gap-3 rounded-2xl bg-white p-3 text-sm font-semibold shadow-sm ring-1 ring-[var(--hewie-ring,#cbd5e1)]/70">
                <input
                  type="checkbox"
                  checked={profile.archivedFromPetSwitcher}
                  onChange={(event) => updateProfile({ archivedFromPetSwitcher: event.target.checked })}
                  disabled={profileDetailsLocked}
                  className="mt-1 size-4 accent-[var(--hewie-accent,#64748b)]"
                />
                <span>
                  Hide from active pet switcher
                  <span className="mt-0.5 block text-xs font-medium text-[var(--hewie-active-text,#334155)]/60">
                    Keeps the notebook saved, but removes this pet from the active pet picker.
                  </span>
                </span>
              </label>

              {profile.hasPassedAway ? (
                <>
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium text-[var(--hewie-active-text,#334155)]/85">Remembered Date</span>
                    <input
                      type="date"
                      value={profile.passedAwayDate}
                      onChange={(event) => updateProfile({ passedAwayDate: event.target.value })}
                      disabled={profileDetailsLocked}
                      className="w-full rounded-2xl border border-[var(--hewie-ring,#cbd5e1)] bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--hewie-accent,#64748b)] focus:ring-4 focus:ring-[var(--hewie-ring,#cbd5e1)]/45"
                    />
                  </label>

                  <label className="block text-sm">
                    <span className="mb-1 block font-medium text-[var(--hewie-active-text,#334155)]/85">Memory Notes</span>
                    <textarea
                      value={profile.memorialNotes}
                      onChange={(event) => updateProfile({ memorialNotes: clampText(event.target.value, TEXT_LIMITS.note) })}
                      maxLength={TEXT_LIMITS.note}
                      rows={3}
                      placeholder="A favorite memory, nickname, or note"
                      disabled={profileDetailsLocked}
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
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">About {petFirstName}</h2>
              <p className="text-sm text-[var(--hewie-active-text,#334155)]/65">Helpful notes for anyone caring for this pet.</p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <p className="min-h-4 text-xs font-semibold text-emerald-600">{saveState === "saved" ? "Saved" : ""}</p>
              {canEditProfile ? (
                isEditingAbout ? (
                  <button
                    type="button"
                    onClick={() => setIsEditingAbout(false)}
                    className="inline-flex items-center rounded-full bg-white/75 px-3 py-1.5 text-xs font-bold text-[var(--hewie-active-text,#334155)]/75 shadow-sm ring-1 ring-[var(--hewie-ring,#cbd5e1)] transition hover:bg-white"
                  >
                    Save
                  </button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setIsEditingAbout(true)}
                    className="size-9 shrink-0 rounded-full bg-white/75 text-[var(--hewie-active-text,#334155)]/70 ring-[var(--hewie-ring,#cbd5e1)] hover:bg-white"
                    aria-label={`Edit about ${petFirstName}`}
                  >
                    <Pencil className="size-4" />
                  </Button>
                )
              ) : (
                <span className="rounded-full bg-white/65 px-3 py-1.5 text-xs font-bold text-[var(--hewie-active-text,#334155)]/55 ring-1 ring-[var(--hewie-ring,#cbd5e1)]">
                  View Only
                </span>
              )}
            </div>
          </div>

          <fieldset disabled={aboutDetailsLocked} className="space-y-3 disabled:opacity-80">
            {canManageProfilePhoto ? (
              <div className="block text-sm">
                <span className="mb-2 block font-medium text-[var(--hewie-active-text,#334155)]/85">Profile Photo</span>
                <label
                  className={`relative flex size-16 overflow-hidden rounded-[1.05rem] bg-white/55 shadow-sm ring-1 ring-[var(--hewie-ring,#cbd5e1)]/70 ${
                    !aboutDetailsLocked ? "cursor-pointer transition hover:scale-[1.02] active:scale-[0.98]" : ""
                  }`}
                  aria-label={`Change ${petFirstName}'s profile photo`}
                >
                  <Image
                    src={profile.photoUrl || DEFAULT_PET_PHOTO_URL}
                    alt={profile.petFirstName || profile.petName || "Pet profile photo"}
                    fill
                    className="object-cover object-center"
                    sizes="64px"
                  />
                  <input
                    type="file"
                    accept="image/*"
                    disabled={aboutDetailsLocked}
                    onChange={(event) => {
                      void handleProfilePhotoFile(event.target.files?.[0]);
                      event.currentTarget.value = "";
                    }}
                    className="sr-only"
                  />
                </label>
                {profilePhotoMessage ? (
                  <p className="mt-2 text-xs font-semibold text-rose-600">{profilePhotoMessage}</p>
                ) : null}
              </div>
            ) : null}

            <label className="block text-sm">
              <span className="mb-1 block font-medium text-[var(--hewie-active-text,#334155)]/85">Personality</span>
              <textarea
                value={profile.personality}
                onChange={(event) => updateProfile({ personality: clampText(event.target.value, TEXT_LIMITS.note) })}
                maxLength={TEXT_LIMITS.note}
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
                  onChange={(event) => updateProfile({ likes: clampText(event.target.value, TEXT_LIMITS.note) })}
                  maxLength={TEXT_LIMITS.note}
                  rows={2}
                  placeholder="Treats, toys, routines"
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--hewie-ring,#cbd5e1)] focus:ring-4 focus:ring-zinc-100"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-[var(--hewie-active-text,#334155)]/85">Dislikes</span>
                <textarea
                  value={profile.dislikes}
                  onChange={(event) => updateProfile({ dislikes: clampText(event.target.value, TEXT_LIMITS.note) })}
                  maxLength={TEXT_LIMITS.note}
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
                onChange={(event) => updateProfile({ carePreferences: clampText(event.target.value, TEXT_LIMITS.note) })}
                maxLength={TEXT_LIMITS.note}
                rows={3}
                placeholder="Feeding quirks, walking style, bedtime routine"
                className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--hewie-ring,#cbd5e1)] focus:ring-4 focus:ring-zinc-100"
              />
            </label>
          </fieldset>
        </section>

        <section className="mb-4 rounded-3xl bg-[var(--hewie-active-bg,#f1f5f9)] p-5 text-[var(--hewie-active-text,#334155)] shadow-sm ring-1 ring-[var(--hewie-ring,#cbd5e1)]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Emergency Contact</h2>
            <div className="flex shrink-0 items-center">
              {canEditProfile ? (
                isEditingEmergencyContact ? (
                  <button
                    type="button"
                    onClick={() => setIsEditingEmergencyContact(false)}
                    className="inline-flex items-center rounded-full bg-white/75 px-3 py-1.5 text-xs font-bold text-[var(--hewie-active-text,#334155)]/75 shadow-sm ring-1 ring-[var(--hewie-ring,#cbd5e1)] transition hover:bg-white"
                  >
                    Save
                  </button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setIsEditingEmergencyContact(true)}
                    className="size-9 shrink-0 rounded-full bg-white/75 text-[var(--hewie-active-text,#334155)]/70 ring-[var(--hewie-ring,#cbd5e1)] hover:bg-white"
                    aria-label="Edit emergency contact"
                  >
                    <Pencil className="size-4" />
                  </Button>
                )
              ) : (
                <span className="rounded-full bg-white/65 px-3 py-1.5 text-xs font-bold text-[var(--hewie-active-text,#334155)]/55 ring-1 ring-[var(--hewie-ring,#cbd5e1)]">
                  View Only
                </span>
              )}
            </div>
          </div>
          <fieldset disabled={emergencyContactLocked} className="grid grid-cols-2 gap-3 disabled:opacity-80">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-[var(--hewie-active-text,#334155)]/85">Name</span>
              <input
                value={profile.emergencyContactName}
                onChange={(event) => updateProfile({ emergencyContactName: clampText(event.target.value, TEXT_LIMITS.shortName) })}
                maxLength={TEXT_LIMITS.shortName}
                className={petInfoInputClass()}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-[var(--hewie-active-text,#334155)]/85">Phone</span>
              <input
                type="tel"
                value={profile.emergencyContactPhone}
                onChange={(event) => updateProfile({ emergencyContactPhone: clampText(event.target.value, TEXT_LIMITS.shortName) })}
                maxLength={TEXT_LIMITS.shortName}
                className={petInfoInputClass()}
              />
            </label>
          </fieldset>
        </section>

        <section className="mb-4 rounded-3xl bg-[var(--hewie-active-bg,#f1f5f9)] p-5 text-[var(--hewie-active-text,#334155)] shadow-sm ring-1 ring-[var(--hewie-ring,#cbd5e1)]">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">App Theme Color</h2>
            <p className="text-sm text-[var(--hewie-active-text,#334155)]/65">This only changes how the notebook looks for you.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {Object.values(appThemes).map((option) => {
              const selected = option.id === themeId;
              return (
                <button
                  key={option.id}
                  type="button"
                  className={`rounded-2xl p-3 text-left ring-1 transition ${selected ? "bg-[var(--hewie-active-bg,#f1f5f9)] text-[var(--hewie-active-text,#334155)] ring-[var(--hewie-ring,#cbd5e1)]" : "bg-white text-[var(--hewie-active-text,#334155)]/85 ring-zinc-200 hover:bg-zinc-50"}`}
                  onClick={() => updateTheme(option.id as ThemeId)}
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
              <h2 className="text-lg font-semibold">{notebookName} Access</h2>
              <p className="text-sm text-[var(--hewie-active-text,#334155)]/65">
                {canManageNotebookAccess
                  ? "Invite people and choose how they can help with this notebook."
                  : canOwnNotebookAccess && !isNotebookSharingUnlocked
                    ? "Notebook sharing is included with PetNotebook Plus."
                    : "View who has access to this notebook."}
              </p>
            </div>
          </div>

          {canManageNotebookAccess ? (
            <>
              <div className="space-y-3">
                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
                  Email
                  <input
                    type="email"
                    value={accessEmail}
                    onChange={(event) => setAccessEmail(clampText(event.target.value, EMAIL_MAX_LENGTH))}
                    maxLength={EMAIL_MAX_LENGTH}
                    placeholder="name@example.com"
                    className="mt-2 w-full rounded-2xl border-0 bg-white px-4 py-3 text-sm font-medium normal-case tracking-normal text-zinc-800 ring-1 ring-[var(--hewie-ring,#cbd5e1)] placeholder:text-zinc-400"
                  />
                </label>
                <fieldset className="mt-2">
                  <legend className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">Role</legend>
                  <div className="mt-2 grid gap-2">
                    {notebookInviteRoles.map((role) => {
                      const selected = accessRole === role;
                      const helpOpen = accessRoleHelp === role;

                      return (
                        <div key={role}>
                          <div
                            role="radio"
                            aria-checked={selected}
                            tabIndex={0}
                            onClick={() => setAccessRole(role as Exclude<NotebookAccessRole, "owner">)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                setAccessRole(role as Exclude<NotebookAccessRole, "owner">);
                              }
                            }}
                            className="flex w-full cursor-pointer items-center justify-between rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-zinc-800 ring-1 ring-[var(--hewie-ring,#cbd5e1)] transition"
                          >
                            <div className="flex min-w-0 items-start gap-0.5">
                              <span className="min-w-0 text-left">
                                {notebookRoleLabel(role)}
                              </span>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setAccessRoleHelp((current) => current === role ? null : role as Exclude<NotebookAccessRole, "owner">);
                                }}
                                aria-expanded={helpOpen}
                                aria-label={`Show ${notebookRoleLabel(role)} details`}
                                className="mt-[-4px] flex size-5 shrink-0 items-center justify-center text-[var(--hewie-active-text,#334155)]/55"
                              >
                                <CircleHelp className="size-3.5" />
                              </button>
                            </div>
                            <span
                              aria-hidden="true"
                              className={`size-3 shrink-0 rounded-full ring-2 ${
                                selected
                                  ? "bg-[var(--hewie-accent,#64748b)] ring-[var(--hewie-accent,#64748b)]/60"
                                  : "bg-transparent ring-[var(--hewie-ring,#cbd5e1)]"
                              }`}
                            />
                          </div>
                          {helpOpen ? (
                            <p className="mt-2 rounded-2xl bg-white/65 p-3 text-xs leading-5 text-[var(--hewie-active-text,#334155)]/65 ring-1 ring-[var(--hewie-ring,#cbd5e1)]/70">
                              {notebookAccessRoleDescriptions[role]}
                            </p>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </fieldset>
              </div>
              <Button
                type="button"
                onClick={() => void handleInvitePerson()}
                className="mt-3 h-11 w-full rounded-full bg-[var(--hewie-accent,#64748b)] text-[var(--hewie-accent-text,#ffffff)] disabled:opacity-60"
                disabled={!user || accessStatus === "saving"}
              >
                {accessStatus === "saving" ? "Sending..." : "Invite"}
              </Button>
            </>
          ) : null}
          {canOwnNotebookAccess && !isNotebookSharingUnlocked ? (
            <div className="rounded-2xl bg-white/65 p-3 text-sm leading-5 text-[var(--hewie-active-text,#334155)]/75 ring-1 ring-[var(--hewie-ring,#cbd5e1)]/70">
              Shared access is a PetNotebook Plus feature. Upgrade to invite family, caretakers, or pet sitters for $9.99/month.
            </div>
          ) : null}
          {canManageNotebookAccess && accessMessage ? (
            <p className={`mt-3 rounded-2xl p-3 text-xs leading-5 ring-1 ${accessStatus === "error" ? "bg-rose-50 text-rose-700 ring-rose-100" : "bg-white/65 text-[var(--hewie-active-text,#334155)]/65 ring-[var(--hewie-ring,#cbd5e1)]/70"}`}>
              {accessMessage}
            </p>
          ) : null}

          <div className="mt-5 space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">Current users</h3>
            {members.filter((member) => member.status !== "revoked").map((member) => {
              const pendingAccess = pendingMemberAccess[member.id] ?? member.role;
              const hasPendingChange = member.role !== "owner" && pendingAccess !== member.role;

              return (
                <div key={member.id} className="rounded-2xl bg-white/70 p-3 text-sm ring-1 ring-[var(--hewie-ring,#cbd5e1)]/70">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-[var(--hewie-active-text,#334155)]/85">{member.memberEmail}</p>
                      <p className="mt-0.5 text-xs text-[var(--hewie-active-text,#334155)]/60">
                        {notebookRoleLabel(member.role)} - {accessStatusLabel(member.status)}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[var(--hewie-active-text,#334155)]/65 ring-1 ring-[var(--hewie-ring,#cbd5e1)]">
                      {notebookRoleLabel(member.role)}
                    </span>
                  </div>

                  {canManageNotebookAccess && member.role !== "owner" ? (
                    <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
                      <select
                        value={pendingAccess}
                        onChange={(event) => {
                          const nextAccess = event.target.value as Exclude<NotebookAccessRole, "owner"> | "remove";
                          setPendingMemberAccess((current) => ({ ...current, [member.id]: nextAccess }));
                        }}
                        disabled={accessStatus === "saving"}
                        className="min-w-0 rounded-full border-0 bg-white px-3 py-2 text-xs font-semibold text-[var(--hewie-active-text,#334155)]/75 ring-1 ring-[var(--hewie-ring,#cbd5e1)] disabled:opacity-60"
                        aria-label={`Choose access action for ${member.memberEmail}`}
                      >
                        {notebookInviteRoles.map((role) => (
                          <option key={role} value={role}>{notebookRoleLabel(role)}</option>
                        ))}
                        <option value="remove">Remove access</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => void handleSaveMemberAccess(member)}
                        disabled={!hasPendingChange || accessStatus === "saving"}
                        className="rounded-full bg-[var(--hewie-accent,#64748b)] px-4 py-2 text-xs font-semibold text-[var(--hewie-accent-text,#ffffff)] shadow-sm disabled:opacity-40"
                      >
                        Save
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>


        <BottomNav />
      </div>
    </main>
  );
}
