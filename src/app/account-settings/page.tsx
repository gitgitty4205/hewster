"use client";

import Image from "next/image";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { Bell, Check, ChevronDown, Crown, KeyRound, Pencil, UserRound, X } from "lucide-react";
import { PetAvatarMenu } from "@/components/pet-avatar-menu";
import { useEffect, useState } from "react";

import { BottomNav } from "@/components/bottom-nav";
import { Button } from "@/components/ui/button";
import { PetNotebookTitle } from "@/components/pet-notebook-title";
import { useAuth } from "@/components/auth-provider";
import {
  loadNotebookMembers,
  selectActiveNotebookMembership,
  type NotebookAccessRole,
} from "@/lib/notebook-access";
import { getStoredSupabaseSession, getSupabaseBrowserClient, PASSWORD_RESET_REQUIRED_STORAGE_KEY, refreshSupabaseCurrentSession } from "@/lib/supabase";
import {
  PET_THEME_UPDATED_EVENT,
  PET_PROFILE_UPDATED_EVENT,
  appThemes,
  applyPetTheme,
  defaultPetProfile,
  loadPetProfile,
  loadSharedPetProfile,
  loadUserTheme,
  type ThemeId,
} from "@/lib/pet-profile";
import {
  loadStoredSubscriptionPlan,
  saveStoredSubscriptionPlan,
  subscriptionPlans,
  type SubscriptionPlanId,
} from "@/lib/subscription-plan";
import { TEXT_LIMITS, clampText } from "@/lib/text-limits";

const EMAIL_MAX_LENGTH = 254;
const PHONE_MAX_LENGTH = 32;
const PASSWORD_MAX_LENGTH = 128;

const ACCOUNT_INFO_STORAGE_KEY = "petnotebook.accountInfoSnapshot";
const NOTIFICATION_SETTINGS_STORAGE_KEY = "petnotebook.notificationSettings";
const PLUS_PET_TILE_FALLBACK_URL = "/paw-notes-transparent.svg";
const ADD_PET_UPGRADE_RETURN_PATH_KEY = "petnotebook.addPetUpgradeReturnPath";
const OPEN_ADD_PET_UPGRADE_DIALOG_KEY = "petnotebook.openAddPetUpgradeDialog";
type TwoFactorMethod = "email" | "sms";
type NotificationChannel = "app" | "email" | "sms";
type ReminderTimeUnit = "minutes" | "hours";
type BillingInterval = "monthly" | "annual";
type AccountInfoSnapshot = {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  phoneVerified: boolean;
  twoFactorEnabled: boolean;
  twoFactorMethod: TwoFactorMethod;
};
type NotificationSettingsSnapshot = {
  enabled: boolean;
  preferences: Record<string, boolean>;
  upcomingReminderAmount: string;
  upcomingReminderUnit: ReminderTimeUnit;
  channels: NotificationChannel[];
  quietHoursStart: string;
  quietHoursEnd: string;
};

const notificationPreferences = [
  {
    title: "Notification channels",
    description: "Choose where notifications are sent.",
  },
  {
    title: "Updates from other users",
    description: "Get notified when someone updates a shared notebook.",
  },
  {
    title: "Alerts and reminders",
    description: "Get notified for alerts and reminders.",
  },
  {
    title: "Due today",
    description: "Get notified about items due today.",
  },
  {
    title: "Advance reminders",
    description: "Get notified before an upcoming item is due.",
  },
  {
    title: "Anniversaries",
    description: "Get notified about birthdays and other special dates.",
  },
  {
    title: "Quiet hours",
    description: "Set times when notifications are muted.",
  },
];

const notificationChannels: { id: NotificationChannel; label: string }[] = [
  { id: "app", label: "App" },
  { id: "sms", label: "SMS" },
  { id: "email", label: "Email" },
];
const notificationChannelIds = notificationChannels.map((channel) => channel.id);
const membershipPlanDisplayOrder = [...subscriptionPlans].sort((plan) => (plan.id === "plus" ? -1 : 1));

function getDefaultNotificationPreferenceStates() {
  return Object.fromEntries(notificationPreferences.map((item) => [item.title, true]));
}

function getReminderMaxAmount(unit: ReminderTimeUnit) {
  return unit === "hours" ? 24 : 1440;
}

function normalizeReminderAmount(value: string, unit: ReminderTimeUnit) {
  if (!value) return value;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "1";
  return String(Math.min(Math.max(Math.trunc(parsed), 1), getReminderMaxAmount(unit)));
}

function reminderUnitLabel(unit: ReminderTimeUnit, amount: string) {
  const parsed = Number(amount);
  const isSingular = Number.isFinite(parsed) && Math.trunc(parsed) === 1;
  if (unit === "hours") return isSingular ? "Hour" : "Hours";
  return isSingular ? "Minute" : "Minutes";
}

function loadStoredNotificationSettings(): NotificationSettingsSnapshot | null {
  if (typeof window === "undefined") return null;

  try {
    const stored = window.localStorage.getItem(NOTIFICATION_SETTINGS_STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as Partial<NotificationSettingsSnapshot>;
    const unit: ReminderTimeUnit = parsed.upcomingReminderUnit === "hours" ? "hours" : "minutes";
    const channels = Array.isArray(parsed.channels)
      ? parsed.channels.filter((channel): channel is NotificationChannel => notificationChannelIds.includes(channel as NotificationChannel))
      : [];

    return {
      enabled: parsed.enabled !== false,
      preferences: {
        ...getDefaultNotificationPreferenceStates(),
        ...(parsed.preferences && typeof parsed.preferences === "object" ? parsed.preferences : {}),
      },
      upcomingReminderAmount: normalizeReminderAmount(typeof parsed.upcomingReminderAmount === "string" ? parsed.upcomingReminderAmount : "30", unit),
      upcomingReminderUnit: unit,
      channels: channels.length ? channels : ["app"],
      quietHoursStart: typeof parsed.quietHoursStart === "string" ? parsed.quietHoursStart : "22:00",
      quietHoursEnd: typeof parsed.quietHoursEnd === "string" ? parsed.quietHoursEnd : "07:00",
    };
  } catch {
    return null;
  }
}

function saveStoredNotificationSettings(settings: NotificationSettingsSnapshot) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(NOTIFICATION_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
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
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [twoFactorMethod, setTwoFactorMethod] = useState<TwoFactorMethod>("email");
  const [savedOwnerInfo, setSavedOwnerInfo] = useState<AccountInfoSnapshot>({ firstName: "", lastName: "", email: "", phoneNumber: "", phoneVerified: false, twoFactorEnabled: false, twoFactorMethod: "email" });
  const [ownerInfoEditing, setOwnerInfoEditing] = useState(false);
  const [accountStatus, setAccountStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [accountMessage, setAccountMessage] = useState("");
  const [notebookRole, setNotebookRole] = useState<NotebookAccessRole | null>(null);
  const [notebookRoleLoaded, setNotebookRoleLoaded] = useState(false);
  const [membershipPlanVisible, setMembershipPlanVisible] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlanId>(() => loadStoredSubscriptionPlan());
  const [expandedPlanDetails, setExpandedPlanDetails] = useState<Record<SubscriptionPlanId, boolean>>({ free: false, plus: false });
  const [upgradeDialogOpen, setUpgradeDialogOpen] = useState(false);
  const [selectedBillingInterval, setSelectedBillingInterval] = useState<BillingInterval>("monthly");
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [notificationsExpanded, setNotificationsExpanded] = useState(false);
  const [notificationPreferenceStates, setNotificationPreferenceStates] = useState<Record<string, boolean>>(
    getDefaultNotificationPreferenceStates,
  );
  const [upcomingReminderAmount, setUpcomingReminderAmount] = useState("30");
  const [upcomingReminderUnit, setUpcomingReminderUnit] = useState<ReminderTimeUnit>("minutes");
  const [upcomingReminderMessage, setUpcomingReminderMessage] = useState("");
  const [selectedNotificationChannels, setSelectedNotificationChannels] = useState<NotificationChannel[]>(["app"]);
  const [quietHoursStart, setQuietHoursStart] = useState("22:00");
  const [quietHoursEnd, setQuietHoursEnd] = useState("07:00");
  const [securityExpanded, setSecurityExpanded] = useState(false);
  const [passwordEditing, setPasswordEditing] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordStatus, setPasswordStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordResetRequired, setPasswordResetRequired] = useState(false);
  const [twoFactorStatus, setTwoFactorStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [twoFactorMessage, setTwoFactorMessage] = useState("");
  const [membershipExpanded, setMembershipExpanded] = useState(false);
  const [themeId, setThemeId] = useState<ThemeId>(defaultPetProfile.themeId);
  const [plusPetPhotoUrl, setPlusPetPhotoUrl] = useState(PLUS_PET_TILE_FALLBACK_URL);

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
    void Promise.resolve().then(() => {
      const storedSettings = loadStoredNotificationSettings();
      if (!storedSettings) return;

      setNotificationsEnabled(storedSettings.enabled);
      setNotificationsExpanded(false);
      setNotificationPreferenceStates(storedSettings.preferences);
      setUpcomingReminderAmount(storedSettings.upcomingReminderAmount);
      setUpcomingReminderUnit(storedSettings.upcomingReminderUnit);
      setSelectedNotificationChannels(storedSettings.channels);
      setQuietHoursStart(storedSettings.quietHoursStart);
      setQuietHoursEnd(storedSettings.quietHoursEnd);
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("resetPassword") !== "1") return;

    const timeoutId = window.setTimeout(() => {
      window.localStorage.setItem(PASSWORD_RESET_REQUIRED_STORAGE_KEY, "1");
      setPasswordResetRequired(true);
      setPasswordEditing(true);
      setPasswordStatus("idle");
      setPasswordMessage("Choose a new password for this account.");
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("upgrade") !== "plus") return;

    const timeoutId = window.setTimeout(() => {
      setMembershipExpanded(true);
      setExpandedPlanDetails((current) => ({ ...current, plus: true }));
      setUpgradeDialogOpen(true);
    }, 0);

    return () => window.clearTimeout(timeoutId);
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
    let active = true;

    const refreshPlusPetPhoto = () => {
      const localPhotoUrl = loadPetProfile().photoUrl || PLUS_PET_TILE_FALLBACK_URL;
      setPlusPetPhotoUrl(localPhotoUrl);

      const supabase = getSupabaseBrowserClient();
      if (!supabase || !displayUser) return;

      loadSharedPetProfile(supabase, displayUser)
        .then((profile) => {
          if (active) setPlusPetPhotoUrl(profile.photoUrl || PLUS_PET_TILE_FALLBACK_URL);
        })
        .catch(() => {
          if (active) setPlusPetPhotoUrl(loadPetProfile().photoUrl || PLUS_PET_TILE_FALLBACK_URL);
        });
    };

    refreshPlusPetPhoto();
    window.addEventListener(PET_PROFILE_UPDATED_EVENT, refreshPlusPetPhoto);
    window.addEventListener("petnotebook-active-notebook-updated", refreshPlusPetPhoto);
    window.addEventListener("storage", refreshPlusPetPhoto);

    return () => {
      active = false;
      window.removeEventListener(PET_PROFILE_UPDATED_EVENT, refreshPlusPetPhoto);
      window.removeEventListener("petnotebook-active-notebook-updated", refreshPlusPetPhoto);
      window.removeEventListener("storage", refreshPlusPetPhoto);
    };
  }, [displayUser]);

  const completePlusUpgrade = () => {
    setSelectedPlan("plus");
    saveStoredSubscriptionPlan("plus");
    setExpandedPlanDetails((current) => ({ ...current, plus: true }));
    setUpgradeDialogOpen(false);

    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("returnToAddPet") !== "1") return;

    const returnPath = window.sessionStorage.getItem(ADD_PET_UPGRADE_RETURN_PATH_KEY) || "/notebook";
    window.sessionStorage.removeItem(ADD_PET_UPGRADE_RETURN_PATH_KEY);
    window.sessionStorage.setItem(OPEN_ADD_PET_UPGRADE_DIALOG_KEY, "1");
    window.location.href = returnPath;
  };

  useEffect(() => {
    void Promise.resolve().then(() => {
      const nextOwnerInfo = accountInfoFromUser(displayUser) ?? loadStoredAccountInfo();

      if (!nextOwnerInfo) {
        if (authLoading) return;
        setOwnerFirstName("");
        setOwnerLastName("");
        setOwnerEmail("");
        setOwnerPhoneNumber("");
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

  function toggleNotificationPreference(title: string) {
    setNotificationPreferenceStates((current) => ({
      ...current,
      [title]: !current[title],
    }));
  }

  function handleToggleNotifications() {
    setNotificationsEnabled((enabled) => {
      const nextEnabled = !enabled;
      setNotificationsExpanded(nextEnabled);
      saveStoredNotificationSettings({
        enabled: nextEnabled,
        preferences: notificationPreferenceStates,
        upcomingReminderAmount: normalizeReminderAmount(upcomingReminderAmount, upcomingReminderUnit),
        upcomingReminderUnit,
        channels: selectedNotificationChannels,
        quietHoursStart,
        quietHoursEnd,
      });
      return nextEnabled;
    });
  }

  function toggleNotificationChannel(channel: NotificationChannel) {
    setSelectedNotificationChannels((current) => {
      if (current.includes(channel)) {
        return current.length > 1 ? current.filter((item) => item !== channel) : current;
      }
      return [...current, channel];
    });
  }

  function handleUpcomingReminderAmountChange(value: string) {
    const parsed = Number(value);
    const maxAmount = getReminderMaxAmount(upcomingReminderUnit);
    setUpcomingReminderMessage(Number.isFinite(parsed) && parsed > maxAmount ? "Maximum is 1 day." : "");
    setUpcomingReminderAmount(normalizeReminderAmount(value, upcomingReminderUnit));
  }

  function handleUpcomingReminderUnitChange(unit: ReminderTimeUnit) {
    setUpcomingReminderUnit(unit);
    setUpcomingReminderAmount((amount) => {
      const parsed = Number(amount);
      const maxAmount = getReminderMaxAmount(unit);
      setUpcomingReminderMessage(Number.isFinite(parsed) && parsed > maxAmount ? "Maximum is 1 day." : "");
      return normalizeReminderAmount(amount, unit);
    });
  }

  function handleSaveNotificationSettings() {
    saveStoredNotificationSettings({
      enabled: notificationsEnabled,
      preferences: notificationPreferenceStates,
      upcomingReminderAmount: normalizeReminderAmount(upcomingReminderAmount, upcomingReminderUnit),
      upcomingReminderUnit,
      channels: selectedNotificationChannels,
      quietHoursStart,
      quietHoursEnd,
    });
    setNotificationsExpanded(false);
  }

  async function handleSaveAccountInfo() {
    const trimmedFirstName = clampText(ownerFirstName.trim(), TEXT_LIMITS.shortName);
    const trimmedLastName = clampText(ownerLastName.trim(), TEXT_LIMITS.shortName);
    const trimmedEmail = clampText(ownerEmail.trim().toLowerCase(), EMAIL_MAX_LENGTH);
    const trimmedPhoneNumber = clampText(ownerPhoneNumber.trim(), PHONE_MAX_LENGTH);

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

  function startPasswordChange() {
    setNewPassword("");
    setConfirmNewPassword("");
    setSecurityExpanded(true);
    setPasswordEditing(true);
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

    window.localStorage.removeItem(PASSWORD_RESET_REQUIRED_STORAGE_KEY);
    setPasswordResetRequired(false);
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
  const securityContentVisible = passwordResetRequired || securityExpanded || passwordEditing;
  const membershipSummary = selectedPlan === "plus" ? "PetNotebook Plus" : "Free";

  return (
    <main className="min-h-[100dvh] bg-[var(--hewie-bg,#979ca7)] text-zinc-900">
      <div className="content-fade-in mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-4 pb-[calc(8rem+env(safe-area-inset-bottom))] pt-6">
        <header className="mb-5">
          <div className="flex min-h-[4.5rem] items-center justify-between gap-3">
            <div>
              <PetNotebookTitle href="/notebook" className="text-sm font-bold text-[var(--hewie-active-text,#6d28d9)]" />
              <h1 className="mt-1 text-xl font-bold tracking-tight text-[#3b2832]">Account Settings</h1>
            </div>
            <PetAvatarMenu shape="tile" />
          </div>
        </header>

        {!passwordResetRequired ? (
        <section data-guide="account-settings" className="mb-4 rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
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
                <Pencil className="size-4" />
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
                  onChange={(event) => setOwnerFirstName(clampText(event.target.value, TEXT_LIMITS.shortName))}
                  maxLength={TEXT_LIMITS.shortName}
                  placeholder={authLoading ? "Loading..." : "First"}
                  disabled={!ownerInfoEditing}
                  className={`mt-2 w-full rounded-2xl border-0 px-4 py-3 text-sm font-normal normal-case tracking-normal text-zinc-800 ring-1 placeholder:text-zinc-400 ${
                    ownerInfoEditing ? "bg-zinc-50 ring-zinc-200" : "bg-zinc-100 text-zinc-600 ring-zinc-200"
                  }`}
                />
              </label>
              <label className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
                Last Name
                <input
                  type="text"
                  value={ownerLastName}
                  onChange={(event) => setOwnerLastName(clampText(event.target.value, TEXT_LIMITS.shortName))}
                  maxLength={TEXT_LIMITS.shortName}
                  placeholder={authLoading ? "Loading..." : "Last"}
                  disabled={!ownerInfoEditing}
                  className={`mt-2 w-full rounded-2xl border-0 px-4 py-3 text-sm font-normal normal-case tracking-normal text-zinc-800 ring-1 placeholder:text-zinc-400 ${
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
                onChange={(event) => setOwnerEmail(clampText(event.target.value, EMAIL_MAX_LENGTH))}
                maxLength={EMAIL_MAX_LENGTH}
                placeholder={authLoading ? "Loading account..." : "name@example.com"}
                disabled={!ownerInfoEditing}
                className={`mt-2 w-full rounded-2xl border-0 px-4 py-3 text-sm font-normal normal-case tracking-normal text-zinc-800 ring-1 placeholder:text-zinc-400 ${
                  ownerInfoEditing ? "bg-zinc-50 ring-zinc-200" : "bg-zinc-100 text-zinc-600 ring-zinc-200"
                }`}
              />
            </label>
            <label className="block pt-3 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
              Phone Number
              <input
                type="tel"
                value={ownerPhoneNumber}
                onChange={(event) => setOwnerPhoneNumber(clampText(event.target.value, PHONE_MAX_LENGTH))}
                maxLength={PHONE_MAX_LENGTH}
                placeholder={authLoading ? "Loading account..." : "Optional"}
                disabled={!ownerInfoEditing}
                autoComplete="tel"
                className={`mt-2 w-full rounded-2xl border-0 px-4 py-3 text-sm font-normal normal-case tracking-normal text-zinc-800 ring-1 placeholder:text-zinc-400 ${
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

        ) : null}

        {!passwordResetRequired ? (
          <section className="mb-4 rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <span
                className="flex size-11 shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: theme.accent, color: theme.accentText }}
              >
                <Bell className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold">Notifications</h2>
                <p className="text-sm leading-5 text-zinc-500">
                  {notificationsEnabled ? "On" : "Off"}
                </p>
              </div>
              {notificationsEnabled && !notificationsExpanded ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setNotificationsExpanded(true)}
                  aria-label="Expand notification settings"
                  className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white p-0 text-zinc-700"
                >
                  <ChevronDown className="size-5" />
                </Button>
              ) : null}
              <button
                type="button"
                role="switch"
                aria-checked={notificationsEnabled}
                onClick={handleToggleNotifications}
                className={`flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition ${
                  notificationsEnabled ? "justify-end bg-[var(--hewie-accent,#64748b)]" : "justify-start bg-zinc-300"
                }`}
              >
                <span className="size-5 rounded-full bg-white shadow-sm" />
              </button>
            </div>

            <div className={`grid transition-all ${notificationsEnabled && notificationsExpanded ? "mt-4 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
              <div className="min-h-0 overflow-hidden space-y-2">
                {notificationPreferences.map((item) => {
                  const isSelected = notificationPreferenceStates[item.title] ?? true;
                  const hasSelectionInput = item.title === "Advance reminders" || item.title === "Notification channels" || item.title === "Quiet hours";

                  return (
                    <div key={item.title} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                      <div className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <h3 className="text-sm font-semibold text-zinc-900">{item.title}</h3>
                          <p className="mt-1 text-xs leading-4 text-zinc-500">{item.description}</p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={isSelected}
                          onClick={() => toggleNotificationPreference(item.title)}
                          className={`flex h-6 w-10 shrink-0 items-center rounded-full p-1 transition ${
                            isSelected ? "justify-end bg-[var(--hewie-accent,#64748b)]" : "justify-start bg-zinc-300"
                          }`}
                        >
                          <span className="size-4 rounded-full bg-white shadow-sm" />
                        </button>
                      </div>

                      {hasSelectionInput && isSelected ? (
                        <div className="mt-3">
                          {item.title === "Advance reminders" ? (
                            <label className="block text-xs font-semibold text-zinc-600">
                              Remind me before
                              <div className="mt-2 grid grid-cols-[minmax(0,1fr)_7rem] gap-2">
                                <div className="flex h-11 items-center rounded-2xl border border-zinc-200 bg-white px-3 focus-within:border-[var(--hewie-accent,#64748b)]">
                                  <input
                                    type="number"
                                    min="1"
                                    max={getReminderMaxAmount(upcomingReminderUnit)}
                                    step="1"
                                    inputMode="numeric"
                                    value={upcomingReminderAmount}
                                    onChange={(event) => handleUpcomingReminderAmountChange(event.target.value)}
                                    className="min-w-0 flex-1 border-0 bg-transparent text-sm font-semibold text-zinc-800 outline-none"
                                  />
                                </div>
                                <select
                                  value={upcomingReminderUnit}
                                  onChange={(event) => handleUpcomingReminderUnitChange(event.target.value as ReminderTimeUnit)}
                                  className="h-11 rounded-2xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-800 outline-none focus:border-[var(--hewie-accent,#64748b)]"
                                >
                                  <option value="minutes">{reminderUnitLabel("minutes", upcomingReminderAmount)}</option>
                                  <option value="hours">{reminderUnitLabel("hours", upcomingReminderAmount)}</option>
                                </select>
                              </div>
                              {upcomingReminderMessage ? (
                                <span className="mt-1 block text-[11px] font-semibold text-amber-700">
                                  {upcomingReminderMessage}
                                </span>
                              ) : null}
                            </label>
                          ) : null}

                          {item.title === "Notification channels" ? (
                            <div>
                              <p className="text-xs font-semibold text-zinc-600">Send to</p>
                              <div className="mt-2 grid grid-cols-3 gap-2">
                                {notificationChannels.map((channel) => {
                                  const selected = selectedNotificationChannels.includes(channel.id);
                                  return (
                                    <button
                                      key={channel.id}
                                      type="button"
                                      aria-pressed={selected}
                                      onClick={() => toggleNotificationChannel(channel.id)}
                                      className={`h-10 rounded-2xl px-2 text-xs font-semibold ring-1 transition ${
                                        selected
                                          ? "bg-[var(--hewie-active-bg,#f1f5f9)] text-zinc-900 ring-[var(--hewie-ring,#cbd5e1)]"
                                          : "bg-white text-zinc-500 ring-zinc-200"
                                      }`}
                                    >
                                      {channel.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ) : null}

                          {item.title === "Quiet hours" ? (
                            <div className="grid grid-cols-2 gap-2">
                              <label className="block text-xs font-semibold text-zinc-600">
                                Start
                                <input
                                  type="time"
                                  value={quietHoursStart}
                                  onChange={(event) => setQuietHoursStart(event.target.value)}
                                  className="mt-2 h-11 w-full rounded-2xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-800 outline-none focus:border-[var(--hewie-accent,#64748b)]"
                                />
                              </label>
                              <label className="block text-xs font-semibold text-zinc-600">
                                End
                                <input
                                  type="time"
                                  value={quietHoursEnd}
                                  onChange={(event) => setQuietHoursEnd(event.target.value)}
                                  className="mt-2 h-11 w-full rounded-2xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-800 outline-none focus:border-[var(--hewie-accent,#64748b)]"
                                />
                              </label>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}

                <Button
                  type="button"
                  onClick={handleSaveNotificationSettings}
                  className="mt-3 h-11 w-full rounded-full bg-[var(--hewie-accent,#64748b)] text-[var(--hewie-accent-text,#ffffff)]"
                >
                  Save
                </Button>
              </div>
            </div>
          </section>
        ) : null}

        <section className="mb-4 rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <span
                className="flex size-11 shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: theme.accent, color: theme.accentText }}
              >
                <KeyRound className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold">Security</h2>
                <p className="text-sm leading-5 text-zinc-500">{passwordResetRequired ? "Choose a new password to finish account recovery." : "Password and login verification"}</p>
              </div>
            </div>
            {!passwordResetRequired ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setSecurityExpanded((expanded) => !expanded)}
                aria-label={securityContentVisible ? "Collapse security settings" : "Expand security settings"}
                aria-expanded={securityContentVisible}
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white p-0 text-zinc-700"
              >
                <ChevronDown className={`size-5 transition-transform ${securityContentVisible ? "rotate-180" : ""}`} />
              </Button>
            ) : null}
          </div>

          <div className={`grid transition-all ${securityContentVisible ? "mt-4 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
            <div className="min-h-0 overflow-hidden">
          {!passwordEditing && !passwordResetRequired ? (
            <button
              type="button"
              onClick={startPasswordChange}
              disabled={!displayUser}
              className="mt-2 flex w-full items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-left transition hover:bg-zinc-100 disabled:opacity-60"
            >
              <span>
                <span className="block text-sm font-semibold text-zinc-900">Change Password</span>
              </span>
              <ChevronDown className="-rotate-90 size-5 shrink-0 text-zinc-400" />
            </button>
          ) : null}

          {passwordEditing ? (
            <div className="space-y-3">
              <label className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
                New Password
                <input
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(clampText(event.target.value, PASSWORD_MAX_LENGTH))}
                  placeholder="New password"
                  autoComplete="new-password"
                  minLength={6}
                  maxLength={PASSWORD_MAX_LENGTH}
                  className="mt-2 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-medium normal-case tracking-normal text-zinc-800 placeholder:text-zinc-400"
                />
              </label>
              <label className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
                Confirm Password
                <input
                  type="password"
                  value={confirmNewPassword}
                  onChange={(event) => setConfirmNewPassword(clampText(event.target.value, PASSWORD_MAX_LENGTH))}
                  placeholder="Confirm password"
                  autoComplete="new-password"
                  minLength={6}
                  maxLength={PASSWORD_MAX_LENGTH}
                  className="mt-2 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-medium normal-case tracking-normal text-zinc-800 placeholder:text-zinc-400"
                />
              </label>
            </div>
          ) : null}

          {!passwordResetRequired ? (
          <div className="mt-2">
            <div className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-2">
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
                  className={`rounded-xl border px-3 py-1.5 text-left transition ${
                    twoFactorMethod === "email" ? "border-[var(--hewie-ring,#cbd5e1)] bg-[var(--hewie-active-bg,#f1f5f9)]" : "border-zinc-200 bg-white"
                  }`}
                  disabled={!displayUser || twoFactorStatus === "saving" || !twoFactorEnabled}
                >
                  <span className="block text-center text-sm font-semibold text-zinc-800">Email</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleSaveTwoFactorSettings(true, "sms")}
                  className={`rounded-xl border px-3 py-1.5 text-left transition ${
                    twoFactorMethod === "sms" ? "border-[var(--hewie-ring,#cbd5e1)] bg-[var(--hewie-active-bg,#f1f5f9)]" : "border-zinc-200 bg-white"
                  } ${canUseSmsTwoFactor ? "" : "opacity-60"}`}
                  disabled={!displayUser || twoFactorStatus === "saving" || !twoFactorEnabled || !canUseSmsTwoFactor}
                >
                  <span className="block text-center text-sm font-semibold text-zinc-800">SMS</span>
                </button>
              </div>
            </div>
          </div>
          ) : null}

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
              {passwordResetRequired ? <div /> : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={resetPasswordForm}
                  className="rounded-full bg-white text-zinc-700"
                  disabled={passwordStatus === "saving"}
                >
                  Cancel
                </Button>
              )}
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
            </div>
          </div>
        </section>

        {!passwordResetRequired && canViewMembershipPlan ? (
          <section className="mb-4 rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span
                  className="flex size-11 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: theme.accent, color: theme.accentText }}
                >
                  <Crown className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-semibold">Membership</h2>
                  <p className="text-sm leading-5 text-zinc-500">{membershipSummary}</p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => setMembershipExpanded((expanded) => !expanded)}
                aria-label={membershipExpanded ? "Collapse membership settings" : "Expand membership settings"}
                aria-expanded={membershipExpanded}
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white p-0 text-zinc-700"
              >
                <ChevronDown className={`size-5 transition-transform ${membershipExpanded ? "rotate-180" : ""}`} />
              </Button>
            </div>

            <div className={`grid transition-all ${membershipExpanded ? "mt-4 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
              <div className="min-h-0 overflow-hidden space-y-2">
              {membershipPlanDisplayOrder.map((plan) => {
                const selected = selectedPlan === plan.id;
                const selectedPlus = selected && plan.id === "plus";
                const expanded = expandedPlanDetails[plan.id];
                const showSummary = plan.id !== "free" || expanded;
                return (
                  <div
                    key={plan.id}
                    className={`rounded-2xl border transition ${
                      selectedPlus
                        ? "border-[var(--hewie-accent,#64748b)] bg-[var(--hewie-active-bg,#f1f5f9)]"
                        : "border-zinc-200 bg-zinc-50"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (plan.id === "plus" && selectedPlan !== "plus") {
                          setUpgradeDialogOpen(true);
                          setExpandedPlanDetails((current) => ({ ...current, plus: true }));
                          return;
                        }
                        setSelectedPlan(plan.id);
                        saveStoredSubscriptionPlan(plan.id);
                        setExpandedPlanDetails((current) => ({ ...current, [plan.id]: !current[plan.id] }));
                      }}
                      aria-expanded={expanded}
                      className="flex w-full items-center justify-between gap-3 p-4 text-left"
                    >
                      <span className="min-w-0">
                        {plan.id === "plus" ? (
                          <span className="inline-flex rounded-full border border-[var(--hewie-accent,#64748b)] bg-[var(--hewie-active-bg,#f1f5f9)] px-2.5 py-1 text-sm font-bold text-[var(--hewie-active-text,#334155)]">
                            {plan.name}
                          </span>
                        ) : (
                          <span className="block text-sm font-medium text-zinc-700">{plan.name}</span>
                        )}
                        {plan.priceLabel ? <span className="mt-0.5 block text-xs font-medium text-zinc-500">{plan.priceLabel}</span> : null}
                        {showSummary && plan.summary ? (
                          <span className="mt-1 block whitespace-pre-line text-xs font-medium leading-4 text-zinc-500">
                            {plan.summary}
                          </span>
                        ) : null}
                      </span>
                      <span className="flex shrink-0 items-center gap-2 text-zinc-400">
                        {selected ? <Check className={`size-4 ${selectedPlus ? "text-emerald-600" : "text-zinc-400"}`} /> : null}
                        <ChevronDown className={`size-5 transition-transform ${expanded ? "rotate-180" : ""}`} />
                      </span>
                    </button>
                    <div className={`grid transition-all ${expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                      <div className="min-h-0 overflow-hidden">
                        <div className="mx-4 mb-4 space-y-2 border-t border-zinc-200/80 pt-3">
                          {plan.features.map((feature) => (
                            <div key={feature} className="flex items-center gap-2 text-xs font-medium text-zinc-500">
                              <Check className="size-3.5 shrink-0 text-emerald-600" />
                              <span>{feature}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              </div>
            </div>
          </section>
        ) : null}

        {!passwordResetRequired ? (
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
              className="h-12 w-full rounded-full bg-white px-4 text-zinc-700 shadow-sm"
            >
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
        ) : null}

        {upgradeDialogOpen ? (
          <div className="fixed inset-0 z-[80] flex items-end bg-zinc-950/35 p-3 backdrop-blur-sm sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-labelledby="plus-upgrade-title">
            <button type="button" aria-label="Close upgrade" className="absolute inset-0 cursor-default" onClick={() => setUpgradeDialogOpen(false)} />
            <div className="relative w-full max-w-md rounded-3xl bg-white p-5 shadow-xl ring-1 ring-zinc-200">
              <button
                type="button"
                aria-label="Close upgrade"
                className="absolute right-3 top-3 inline-flex size-6 items-center justify-center rounded-full bg-zinc-50 text-zinc-500 shadow-sm ring-1 ring-zinc-200 transition hover:bg-white hover:text-zinc-700 focus:outline-none focus:ring-2 focus:ring-[var(--hewie-accent,#64748b)] focus:ring-offset-2"
                onClick={() => setUpgradeDialogOpen(false)}
              >
                <X className="size-3" aria-hidden="true" />
              </button>
              <div className="mb-4 pr-8">
                <div className="min-w-0">
                  <h3 id="plus-upgrade-title" className="flex flex-wrap items-center gap-2 text-lg font-semibold text-zinc-900">
                    <span>Upgrade to</span>
                    <span className="inline-flex rounded-full border border-[var(--hewie-accent,#64748b)] bg-[var(--hewie-active-bg,#f1f5f9)] px-2.5 py-1 text-sm font-bold text-[var(--hewie-active-text,#334155)]">
                      PetNotebook Plus
                    </span>
                  </h3>
                  <p className="mt-1 text-sm font-semibold leading-5 text-[var(--hewie-active-text,#334155)]">
                    A shared notebook for everyone who cares for your pet.
                  </p>
                </div>
              </div>

              <div className="relative mb-4 space-y-2 rounded-2xl bg-zinc-50 p-3 pr-20 ring-1 ring-zinc-200">
                <span className="absolute right-3 top-3 size-14 overflow-hidden rounded-2xl border border-white bg-[var(--hewie-active-bg,#f1f5f9)] shadow-[0_10px_24px_rgba(15,23,42,0.18)] ring-1 ring-[var(--hewie-accent,#64748b)]/25">
                  <Image
                    src={plusPetPhotoUrl}
                    alt="Pet profile"
                    fill
                    sizes="56px"
                    className="object-cover object-center"
                  />
                </span>
                {[
                  "Unlimited pets",
                  "Notebook sharing",
                  "Keep everyone in sync",
                  "Unlimited PDF reports",
                  "Unlimited photos and files",
                  "Lifetime health history",
                  "Meals, reminders, and alerts",
                  "Health records and daily logs",
                ].map((feature) => (
                  <div key={feature} className="flex items-start gap-2 text-xs font-medium leading-5 text-zinc-500">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                    <span>{feature}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">Choose a plan</p>
                {[
                  { id: "monthly" as BillingInterval, title: "Monthly", price: "$9.99/month", badge: "Cancel anytime" },
                  { id: "annual" as BillingInterval, title: "Annual", price: "$99/year", note: "2 months free", badge: "Most popular" },
                ].map((option) => {
                  const billingSelected = selectedBillingInterval === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setSelectedBillingInterval(option.id)}
                      className={`flex w-full items-center justify-between rounded-2xl border-2 p-3 text-left transition ${
                        billingSelected
                          ? "border-[var(--hewie-accent,#64748b)] bg-zinc-50"
                          : "border-zinc-200 bg-zinc-50"
                      }`}
                    >
                      <span>
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-zinc-900">{option.title}</span>
                        </span>
                        {option.note ? <span className="mt-0.5 block text-xs text-zinc-500">{option.note}</span> : null}
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {option.badge ? (
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                            option.id === "annual"
                              ? "bg-[var(--hewie-accent,#64748b)] text-[var(--hewie-accent-text,#ffffff)]"
                              : "border border-zinc-300 bg-white text-zinc-500"
                          }`}>
                            {option.badge}
                          </span>
                        ) : null}
                        <span className="text-sm font-semibold text-zinc-500">{option.price}</span>
                      </span>
                    </button>
                  );
                })}
              </div>

              <Button
                type="button"
                className="mt-4 h-12 w-full rounded-full bg-[var(--hewie-accent,#64748b)] px-4 text-[var(--hewie-accent-text,#ffffff)]"
                onClick={completePlusUpgrade}
              >
                Upgrade to Plus
              </Button>
            </div>
          </div>
        ) : null}

        <BottomNav />
      </div>
    </main>
  );
}
