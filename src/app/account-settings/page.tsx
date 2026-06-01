"use client";

import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { Check, Ellipsis, KeyRound, LogOut, UserRound } from "lucide-react";
import { PetAvatarMenu } from "@/components/pet-avatar-menu";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { BottomNav } from "@/components/bottom-nav";
import { Button } from "@/components/ui/button";
import { PetNotebookTitle } from "@/components/pet-notebook-title";
import { useAuth } from "@/components/auth-provider";
import {
  loadNotebookMembers,
  selectActiveNotebookMembership,
  type NotebookAccessRole,
} from "@/lib/notebook-access";
import { getStoredSupabaseSession, getSupabaseBrowserClient, refreshSupabaseCurrentSession } from "@/lib/supabase";
import {
  PET_PROFILE_STORAGE_KEY,
  PET_THEME_UPDATED_EVENT,
  appThemes,
  applyPetTheme,
  defaultPetProfile,
  loadUserTheme,
  normalizePetProfile,
  type ThemeId,
} from "@/lib/pet-profile";

const defaultPetProfileSnapshot = JSON.stringify(defaultPetProfile);
const ACCOUNT_INFO_STORAGE_KEY = "petnotebook.accountInfoSnapshot";
type TwoFactorMethod = "email" | "sms";
type AccountInfoSnapshot = {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  phoneVerified: boolean;
  twoFactorEnabled: boolean;
  twoFactorMethod: TwoFactorMethod;
};

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

function notebookRoleLabel(role: NotebookAccessRole | null) {
  if (role === "co-owner") return "Co-Owner";
  if (role === "pet-sitter") return "Pet Sitter";
  if (role === "caretaker") return "Caretaker";
  if (role === "owner") return "Owner";
  return "Account";
}

function accountInfoFromUser(user: User | null) {
  if (!user) return null;

  const metadata = user.user_metadata ?? {};
  const metadataFirstName = typeof metadata.first_name === "string" ? metadata.first_name : "";
  const metadataLastName = typeof metadata.last_name === "string" ? metadata.last_name : "";
  const metadataPhoneNumber = typeof metadata.phone_number === "string" ? metadata.phone_number : "";
  const metadataPhoneVerified = metadata.phone_verified === true;
  const metadataTwoFactorEnabled = metadata.two_factor_enabled === true || metadata.sms_two_factor_enabled === true;
  const metadataTwoFactorMethod: TwoFactorMethod = metadata.two_factor_method === "sms" || metadata.sms_two_factor_enabled === true ? "sms" : "email";
  const metadataFullName = typeof metadata.full_name === "string"
    ? metadata.full_name
    : typeof metadata.name === "string"
      ? metadata.name
      : "";
  const fullNameParts = metadataFullName.trim().split(/\s+/).filter(Boolean);

  return {
    firstName: metadataFirstName || fullNameParts[0] || "",
    lastName: metadataLastName || fullNameParts.slice(1).join(" "),
    email: user.email ?? "",
    phoneNumber: user.phone || metadataPhoneNumber,
    phoneVerified: Boolean(user.phone_confirmed_at) || metadataPhoneVerified,
    twoFactorEnabled: metadataTwoFactorEnabled,
    twoFactorMethod: metadataTwoFactorMethod,
  };
}

function loadStoredAccountInfo() {
  if (typeof window === "undefined") return null;

  const sessionInfo = accountInfoFromUser(getStoredSupabaseSession()?.user ?? null);
  if (sessionInfo?.email) return sessionInfo;

  try {
    const stored = window.localStorage.getItem(ACCOUNT_INFO_STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as Partial<AccountInfoSnapshot> & { smsTwoFactorEnabled?: boolean };
    if (typeof parsed.email !== "string" || !parsed.email) return null;
    const twoFactorMethod: TwoFactorMethod = parsed.twoFactorMethod === "sms" || parsed.smsTwoFactorEnabled === true ? "sms" : "email";
    return {
      firstName: typeof parsed.firstName === "string" ? parsed.firstName : "",
      lastName: typeof parsed.lastName === "string" ? parsed.lastName : "",
      email: parsed.email,
      phoneNumber: typeof parsed.phoneNumber === "string" ? parsed.phoneNumber : "",
      phoneVerified: parsed.phoneVerified === true,
      twoFactorEnabled: parsed.twoFactorEnabled === true || parsed.smsTwoFactorEnabled === true,
      twoFactorMethod,
    };
  } catch {
    return null;
  }
}

function saveStoredAccountInfo(info: AccountInfoSnapshot) {
  if (typeof window === "undefined" || !info.email) return;
  window.localStorage.setItem(ACCOUNT_INFO_STORAGE_KEY, JSON.stringify(info));
}

export default function AccountSettingsPage() {
  const { configured, loading: authLoading, user, signOut } = useAuth();
  const [storedUser, setStoredUser] = useState<User | null>(null);
  const [ownerFirstName, setOwnerFirstName] = useState("");
  const [ownerLastName, setOwnerLastName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPhoneNumber, setOwnerPhoneNumber] = useState("");
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [twoFactorMethod, setTwoFactorMethod] = useState<TwoFactorMethod>("email");
  const [savedOwnerInfo, setSavedOwnerInfo] = useState<AccountInfoSnapshot>({ firstName: "", lastName: "", email: "", phoneNumber: "", phoneVerified: false, twoFactorEnabled: false, twoFactorMethod: "email" });
  const [ownerInfoEditing, setOwnerInfoEditing] = useState(false);
  const [accountStatus, setAccountStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [accountMessage, setAccountMessage] = useState("");
  const [notebookRole, setNotebookRole] = useState<NotebookAccessRole | null>(null);
  const [notebookRoleLoaded, setNotebookRoleLoaded] = useState(false);
  const [membershipPlanVisible, setMembershipPlanVisible] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState("Plus");
  const [passwordEditing, setPasswordEditing] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordStatus, setPasswordStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [twoFactorStatus, setTwoFactorStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [twoFactorMessage, setTwoFactorMessage] = useState("");
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("resetPassword") !== "1") return;

    setPasswordEditing(true);
    setPasswordStatus("idle");
    setPasswordMessage("Choose a new password for this account.");
  }, []);

  useEffect(() => {
    const refreshStoredUser = () => setStoredUser(getStoredSupabaseSession()?.user ?? null);
    refreshStoredUser();

    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      refreshSupabaseCurrentSession(supabase).then((session) => {
        setStoredUser(session?.user ?? getStoredSupabaseSession()?.user ?? null);
      });
    }

    window.addEventListener("focus", refreshStoredUser);
    window.addEventListener("storage", refreshStoredUser);
    return () => {
      window.removeEventListener("focus", refreshStoredUser);
      window.removeEventListener("storage", refreshStoredUser);
    };
  }, []);

  const displayUser = user ?? storedUser;

  useEffect(() => {
    void Promise.resolve().then(() => {
      const nextOwnerInfo = accountInfoFromUser(displayUser) ?? loadStoredAccountInfo();

      if (!nextOwnerInfo) {
        if (authLoading) return;
        setOwnerFirstName("");
        setOwnerLastName("");
        setOwnerEmail("");
        setOwnerPhoneNumber("");
        setPhoneVerified(false);
        setTwoFactorEnabled(false);
        setTwoFactorMethod("email");
        setSavedOwnerInfo({ firstName: "", lastName: "", email: "", phoneNumber: "", phoneVerified: false, twoFactorEnabled: false, twoFactorMethod: "email" });
        setNotebookRole(null);
        setNotebookRoleLoaded(true);
        return;
      }

      setNotebookRoleLoaded(false);

      setOwnerFirstName(nextOwnerInfo.firstName);
      setOwnerLastName(nextOwnerInfo.lastName);
      setOwnerEmail(nextOwnerInfo.email);
      setOwnerPhoneNumber(nextOwnerInfo.phoneNumber);
      setPhoneVerified(nextOwnerInfo.phoneVerified);
      setTwoFactorEnabled(nextOwnerInfo.twoFactorEnabled);
      setTwoFactorMethod(nextOwnerInfo.phoneNumber ? nextOwnerInfo.twoFactorMethod : "email");
      setSavedOwnerInfo(nextOwnerInfo);
      saveStoredAccountInfo(nextOwnerInfo);
      setOwnerInfoEditing(false);
    });
  }, [authLoading, displayUser]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    let active = true;
    const loadAccountAccess = async () => {
      if (!supabase || !displayUser) {
        if (active) {
          setNotebookRole(null);
          setNotebookRoleLoaded(true);
          setMembershipPlanVisible(false);
        }
        return;
      }

      try {
        const members = await loadNotebookMembers(supabase, displayUser);
        const { activeMembership, ownNotebook, selectedOwnNotebook, sharedMembership } = selectActiveNotebookMembership(members, displayUser.id, displayUser.email);
        if (active) {
          setNotebookRole((selectedOwnNotebook ?? sharedMembership ?? activeMembership)?.role ?? null);
          setNotebookRoleLoaded(true);
          setMembershipPlanVisible(Boolean(selectedOwnNotebook || (!sharedMembership && ownNotebook)));
        }
      } catch {
        if (active) {
          setNotebookRole(null);
          setNotebookRoleLoaded(true);
          setMembershipPlanVisible(false);
        }
      }
    };

    void loadAccountAccess();

    if (typeof window !== "undefined") {
      window.addEventListener("petnotebook-active-notebook-updated", loadAccountAccess);
      window.addEventListener("focus", loadAccountAccess);
    }

    return () => {
      active = false;
      if (typeof window !== "undefined") {
        window.removeEventListener("petnotebook-active-notebook-updated", loadAccountAccess);
        window.removeEventListener("focus", loadAccountAccess);
      }
    };
  }, [displayUser]);

  function handleCancelOwnerInfoEdit() {
    setOwnerFirstName(savedOwnerInfo.firstName);
    setOwnerLastName(savedOwnerInfo.lastName);
    setOwnerEmail(savedOwnerInfo.email);
    setOwnerPhoneNumber(savedOwnerInfo.phoneNumber);
    setOwnerInfoEditing(false);
    setAccountStatus("idle");
    setAccountMessage("");
  }

  async function handleSaveAccountInfo() {
    const trimmedFirstName = ownerFirstName.trim();
    const trimmedLastName = ownerLastName.trim();
    const trimmedEmail = ownerEmail.trim().toLowerCase();
    const trimmedPhoneNumber = ownerPhoneNumber.trim();

    if (!displayUser) {
      setAccountStatus("error");
      setAccountMessage("Sign in before saving account info.");
      return;
    }

    if (!trimmedFirstName || !trimmedLastName) {
      setAccountStatus("error");
      setAccountMessage("Enter the first and last name.");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setAccountStatus("error");
      setAccountMessage("Supabase is not configured yet.");
      return;
    }

    setAccountStatus("saving");
    setAccountMessage("");

    const nextUser = {
      data: {
        first_name: trimmedFirstName,
        last_name: trimmedLastName,
        full_name: `${trimmedFirstName} ${trimmedLastName}`,
        phone_number: trimmedPhoneNumber,
        phone_verified: trimmedPhoneNumber && trimmedPhoneNumber === savedOwnerInfo.phoneNumber ? savedOwnerInfo.phoneVerified : false,
        two_factor_enabled: savedOwnerInfo.twoFactorEnabled,
        two_factor_method: trimmedPhoneNumber ? savedOwnerInfo.twoFactorMethod : "email",
        sms_two_factor_enabled: false,
      },
      ...(trimmedEmail && trimmedEmail !== displayUser.email ? { email: trimmedEmail } : {}),
    };

    const { error } = await supabase.auth.updateUser(nextUser);

    if (error) {
      setAccountStatus("error");
      setAccountMessage(error.message);
      return;
    }

    setOwnerFirstName(trimmedFirstName);
    setOwnerLastName(trimmedLastName);
    setOwnerEmail(trimmedEmail || displayUser.email || "");
    setOwnerPhoneNumber(trimmedPhoneNumber);
    const nextPhoneVerified = trimmedPhoneNumber && trimmedPhoneNumber === savedOwnerInfo.phoneNumber ? savedOwnerInfo.phoneVerified : false;
    const nextTwoFactorMethod = trimmedPhoneNumber ? savedOwnerInfo.twoFactorMethod : "email";
    const nextTwoFactorEnabled = savedOwnerInfo.twoFactorEnabled;
    setPhoneVerified(nextPhoneVerified);
    setTwoFactorEnabled(nextTwoFactorEnabled);
    setTwoFactorMethod(nextTwoFactorMethod);
    setSavedOwnerInfo({
      firstName: trimmedFirstName,
      lastName: trimmedLastName,
      email: trimmedEmail || displayUser.email || "",
      phoneNumber: trimmedPhoneNumber,
      phoneVerified: nextPhoneVerified,
      twoFactorEnabled: nextTwoFactorEnabled,
      twoFactorMethod: nextTwoFactorMethod,
    });
    saveStoredAccountInfo({
      firstName: trimmedFirstName,
      lastName: trimmedLastName,
      email: trimmedEmail || displayUser.email || "",
      phoneNumber: trimmedPhoneNumber,
      phoneVerified: nextPhoneVerified,
      twoFactorEnabled: nextTwoFactorEnabled,
      twoFactorMethod: nextTwoFactorMethod,
    });
    setOwnerInfoEditing(false);
    setAccountStatus("saved");
    setAccountMessage(trimmedEmail && trimmedEmail !== displayUser.email ? "Account info saved. Check the new email address to confirm the email change." : "Account info saved.");
  }

  function resetPasswordForm() {
    setNewPassword("");
    setConfirmNewPassword("");
    setPasswordEditing(false);
    setPasswordStatus("idle");
    setPasswordMessage("");
  }

  async function handleSavePassword() {
    if (!displayUser) {
      setPasswordStatus("error");
      setPasswordMessage("Sign in before changing your password.");
      return;
    }

    if (newPassword.length < 6) {
      setPasswordStatus("error");
      setPasswordMessage("Password must be at least 6 characters.");
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setPasswordStatus("error");
      setPasswordMessage("Passwords do not match.");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setPasswordStatus("error");
      setPasswordMessage("Supabase is not configured yet.");
      return;
    }

    setPasswordStatus("saving");
    setPasswordMessage("");

    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      setPasswordStatus("error");
      setPasswordMessage(error.message);
      return;
    }

    setNewPassword("");
    setConfirmNewPassword("");
    setPasswordEditing(false);
    setPasswordStatus("saved");
    setPasswordMessage("Password updated.");
  }

  async function handleSaveTwoFactorSettings(nextEnabled: boolean, nextMethod = twoFactorMethod) {
    if (nextEnabled && nextMethod === "sms" && !savedOwnerInfo.phoneNumber) {
      setTwoFactorStatus("error");
      setTwoFactorMessage("Add a phone number before choosing SMS verification.");
      return;
    }

    if (!displayUser) {
      setTwoFactorStatus("error");
      setTwoFactorMessage("Sign in before changing verification settings.");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setTwoFactorStatus("error");
      setTwoFactorMessage("Supabase is not configured yet.");
      return;
    }

    const previousEnabled = twoFactorEnabled;
    const previousMethod = twoFactorMethod;
    setTwoFactorEnabled(nextEnabled);
    setTwoFactorMethod(nextMethod);
    setTwoFactorStatus("saving");
    setTwoFactorMessage("");

    const { error } = await supabase.auth.updateUser({
      data: {
        two_factor_enabled: nextEnabled,
        two_factor_method: nextMethod,
        sms_two_factor_enabled: false,
      },
    });

    if (error) {
      setTwoFactorEnabled(previousEnabled);
      setTwoFactorMethod(previousMethod);
      setTwoFactorStatus("error");
      setTwoFactorMessage(error.message);
      return;
    }

    const nextOwnerInfo = { ...savedOwnerInfo, twoFactorEnabled: nextEnabled, twoFactorMethod: nextMethod };
    setSavedOwnerInfo(nextOwnerInfo);
    saveStoredAccountInfo(nextOwnerInfo);
    setTwoFactorStatus("saved");
    setTwoFactorMessage(nextEnabled ? `2FA enabled with ${nextMethod === "sms" ? "SMS" : "email"} codes.` : "2FA disabled.");
  }

  const theme = appThemes[themeId];
  const canViewMembershipPlan = membershipPlanVisible && notebookRole === "owner";
  const displayedNotebookRole = canViewMembershipPlan ? "owner" : notebookRole === "owner" ? null : notebookRole;
  const accountInfoTitle = `${notebookRoleLabel(displayedNotebookRole)} Info`;
  const showAccountInfoTitle = (!authLoading && !displayUser) || notebookRoleLoaded;
  const canUseSmsTwoFactor = Boolean(savedOwnerInfo.phoneNumber);

  return (
    <main className="min-h-[100dvh] bg-[var(--hewie-bg,#979ca7)] text-zinc-900">
      <div className="content-fade-in mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-4 pb-[calc(8rem+env(safe-area-inset-bottom))] pt-6">
        <header className="mb-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <PetNotebookTitle href="/hewie" className="text-sm font-bold text-[var(--hewie-active-text,#6d28d9)]" />
              <h1 className="mt-1 text-xl font-bold tracking-tight text-[var(--hewie-active-text,#334155)]/85">Account Settings</h1>
            </div>
            <PetAvatarMenu shape="tile" />
          </div>
        </header>

        <section className="mb-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span
                className="flex size-11 shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: theme.accent, color: theme.accentText }}
              >
                <UserRound className="size-5" />
              </span>
              <div>
                <h2 className="min-h-7 text-lg font-semibold" aria-busy={!showAccountInfoTitle}>
                  {showAccountInfoTitle ? accountInfoTitle : null}
                </h2>
              </div>
            </div>
            {!ownerInfoEditing && showAccountInfoTitle ? (
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => {
                  setOwnerInfoEditing(true);
                  setAccountMessage("");
                  setAccountStatus("idle");
                }}
                className="size-9 shrink-0 rounded-full bg-white text-zinc-600"
                aria-label={`Edit ${accountInfoTitle.toLowerCase()}`}
              >
                <Ellipsis className="size-4" />
              </Button>
            ) : null}
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
                First Name
                <input
                  type="text"
                  value={ownerFirstName}
                  onChange={(event) => setOwnerFirstName(event.target.value)}
                  placeholder={authLoading ? "Loading..." : "First"}
                  disabled={!ownerInfoEditing}
                  className={`mt-2 w-full rounded-2xl border-0 px-4 py-3 text-sm font-medium normal-case tracking-normal text-zinc-800 ring-1 placeholder:text-zinc-400 ${
                    ownerInfoEditing ? "bg-zinc-50 ring-zinc-200" : "bg-zinc-100 text-zinc-600 ring-zinc-200"
                  }`}
                />
              </label>
              <label className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
                Last Name
                <input
                  type="text"
                  value={ownerLastName}
                  onChange={(event) => setOwnerLastName(event.target.value)}
                  placeholder={authLoading ? "Loading..." : "Last"}
                  disabled={!ownerInfoEditing}
                  className={`mt-2 w-full rounded-2xl border-0 px-4 py-3 text-sm font-medium normal-case tracking-normal text-zinc-800 ring-1 placeholder:text-zinc-400 ${
                    ownerInfoEditing ? "bg-zinc-50 ring-zinc-200" : "bg-zinc-100 text-zinc-600 ring-zinc-200"
                  }`}
                />
              </label>
            </div>
            <label className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
              Account Email
              <input
                type="email"
                value={ownerEmail || displayUser?.email || ""}
                onChange={(event) => setOwnerEmail(event.target.value)}
                placeholder={authLoading ? "Loading account..." : "name@example.com"}
                disabled={!ownerInfoEditing}
                className={`mt-2 w-full rounded-2xl border-0 px-4 py-3 text-sm font-medium normal-case tracking-normal text-zinc-800 ring-1 placeholder:text-zinc-400 ${
                  ownerInfoEditing ? "bg-zinc-50 ring-zinc-200" : "bg-zinc-100 text-zinc-600 ring-zinc-200"
                }`}
              />
            </label>
            <label className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
              Phone Number
              <input
                type="tel"
                value={ownerPhoneNumber}
                onChange={(event) => setOwnerPhoneNumber(event.target.value)}
                placeholder={authLoading ? "Loading account..." : "Optional for account recovery"}
                disabled={!ownerInfoEditing}
                autoComplete="tel"
                className={`mt-2 w-full rounded-2xl border-0 px-4 py-3 text-sm font-medium normal-case tracking-normal text-zinc-800 ring-1 placeholder:text-zinc-400 ${
                  ownerInfoEditing ? "bg-zinc-50 ring-zinc-200" : "bg-zinc-100 text-zinc-600 ring-zinc-200"
                }`}
              />
            </label>
          </div>

          {accountMessage ? (
            <p className={`mt-3 rounded-2xl p-3 text-sm ring-1 ${accountStatus === "error" ? "bg-rose-50 text-rose-700 ring-rose-100" : "bg-emerald-50 text-emerald-700 ring-emerald-100"}`}>
              {accountMessage}
            </p>
          ) : null}

          {ownerInfoEditing ? (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={handleCancelOwnerInfoEdit}
                className="rounded-full bg-white text-zinc-700"
                disabled={accountStatus === "saving"}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void handleSaveAccountInfo()}
                className="rounded-full bg-[var(--hewie-accent,#64748b)] text-[var(--hewie-accent-text,#ffffff)] disabled:opacity-60"
                disabled={!displayUser || accountStatus === "saving"}
              >
                {accountStatus === "saving" ? "Saving..." : "Save"}
              </Button>
            </div>
          ) : null}
        </section>

        <section className="mb-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span
                className="flex size-11 shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: theme.accent, color: theme.accentText }}
              >
                <KeyRound className="size-5" />
              </span>
              <div>
                <h2 className="text-lg font-semibold">Security</h2>
                <p className="mt-1 text-sm leading-5 text-zinc-500">Update password and login verification settings.</p>
              </div>
            </div>
          </div>

          {passwordEditing ? (
            <div className="space-y-3">
              <label className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
                New Password
                <input
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder="New password"
                  autoComplete="new-password"
                  minLength={6}
                  className="mt-2 w-full rounded-2xl border-0 bg-zinc-50 px-4 py-3 text-sm font-medium normal-case tracking-normal text-zinc-800 ring-1 ring-zinc-200 placeholder:text-zinc-400"
                />
              </label>
              <label className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
                Confirm Password
                <input
                  type="password"
                  value={confirmNewPassword}
                  onChange={(event) => setConfirmNewPassword(event.target.value)}
                  placeholder="Confirm password"
                  autoComplete="new-password"
                  minLength={6}
                  className="mt-2 w-full rounded-2xl border-0 bg-zinc-50 px-4 py-3 text-sm font-medium normal-case tracking-normal text-zinc-800 ring-1 ring-zinc-200 placeholder:text-zinc-400"
                />
              </label>
            </div>
          ) : null}

          <div className="mt-2">
            <div className="flex items-center gap-3 rounded-2xl bg-zinc-50 px-4 py-2 ring-1 ring-zinc-200">
              <p className="shrink-0 text-sm font-semibold text-zinc-800">2FA</p>
              <button
                type="button"
                role="switch"
                aria-checked={twoFactorEnabled}
                onClick={() => void handleSaveTwoFactorSettings(!twoFactorEnabled)}
                className={`flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition ${
                  twoFactorEnabled ? "justify-end bg-[var(--hewie-accent,#64748b)]" : "justify-start bg-zinc-300"
                }`}
                disabled={!displayUser || twoFactorStatus === "saving"}
              >
                <span className="size-5 rounded-full bg-white shadow-sm" />
              </button>
              <div className={`grid min-w-0 flex-1 grid-cols-2 gap-1.5 ${twoFactorEnabled ? "" : "opacity-60"}`}>
                <button
                  type="button"
                  onClick={() => void handleSaveTwoFactorSettings(true, "email")}
                  className={`rounded-xl px-3 py-1.5 text-left ring-1 transition ${
                    twoFactorMethod === "email" ? "bg-[var(--hewie-active-bg,#f1f5f9)] ring-[var(--hewie-ring,#cbd5e1)]" : "bg-white ring-zinc-200"
                  }`}
                  disabled={!displayUser || twoFactorStatus === "saving" || !twoFactorEnabled}
                >
                  <span className="block text-center text-sm font-semibold text-zinc-800">Email</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleSaveTwoFactorSettings(true, "sms")}
                  className={`rounded-xl px-3 py-1.5 text-left ring-1 transition ${
                    twoFactorMethod === "sms" ? "bg-[var(--hewie-active-bg,#f1f5f9)] ring-[var(--hewie-ring,#cbd5e1)]" : "bg-white ring-zinc-200"
                  } ${canUseSmsTwoFactor ? "" : "opacity-60"}`}
                  disabled={!displayUser || twoFactorStatus === "saving" || !twoFactorEnabled || !canUseSmsTwoFactor}
                >
                  <span className="block text-center text-sm font-semibold text-zinc-800">SMS</span>
                </button>
              </div>
            </div>
          </div>

          {twoFactorMessage ? (
            <p className={`mt-3 rounded-2xl p-3 text-sm ring-1 ${twoFactorStatus === "error" ? "bg-rose-50 text-rose-700 ring-rose-100" : "bg-emerald-50 text-emerald-700 ring-emerald-100"}`}>
              {twoFactorMessage}
            </p>
          ) : null}

          {passwordMessage ? (
            <p className={`mt-3 rounded-2xl p-3 text-sm ring-1 ${passwordStatus === "error" ? "bg-rose-50 text-rose-700 ring-rose-100" : "bg-emerald-50 text-emerald-700 ring-emerald-100"}`}>
              {passwordMessage}
            </p>
          ) : null}

          {passwordEditing ? (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={resetPasswordForm}
                className="rounded-full bg-white text-zinc-700"
                disabled={passwordStatus === "saving"}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void handleSavePassword()}
                className="rounded-full bg-[var(--hewie-accent,#64748b)] text-[var(--hewie-accent-text,#ffffff)] disabled:opacity-60"
                disabled={!displayUser || passwordStatus === "saving"}
              >
                {passwordStatus === "saving" ? "Saving..." : "Save"}
              </Button>
            </div>
          ) : null}
        </section>

        {canViewMembershipPlan ? (
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
        ) : null}

        <div className="mt-5">
          {authLoading && !displayUser ? (
            <Button type="button" className="w-full rounded-full bg-[var(--hewie-accent,#64748b)] px-4 text-[var(--hewie-accent-text,#ffffff)] opacity-80" disabled>
              Loading Account...
            </Button>
          ) : displayUser ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => void signOut()}
              className="w-full rounded-full bg-white px-4 text-zinc-700"
            >
              <LogOut className="size-4" />
              Sign Out
            </Button>
          ) : (
            <Button asChild className="w-full rounded-full bg-[var(--hewie-accent,#64748b)] px-4 text-[var(--hewie-accent-text,#ffffff)]">
              <Link href="/login">Sign In</Link>
            </Button>
          )}
          {!configured ? (
            <p className="mt-3 rounded-2xl bg-amber-50 p-3 text-xs leading-5 text-amber-700 ring-1 ring-amber-100">Supabase auth needs the public URL and anon key before login can work.</p>
          ) : null}
        </div>

        <BottomNav />
      </div>
    </main>
  );
}
