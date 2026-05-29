"use client";

import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { Check, Ellipsis, LogOut, UserRound } from "lucide-react";
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
  appThemes,
  applyPetTheme,
  defaultPetProfile,
  normalizePetProfile,
} from "@/lib/pet-profile";

const defaultPetProfileSnapshot = JSON.stringify(defaultPetProfile);
const ACCOUNT_INFO_STORAGE_KEY = "petnotebook.accountInfoSnapshot";

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
  };
}

function loadStoredAccountInfo() {
  if (typeof window === "undefined") return null;

  const sessionInfo = accountInfoFromUser(getStoredSupabaseSession()?.user ?? null);
  if (sessionInfo?.email) return sessionInfo;

  try {
    const stored = window.localStorage.getItem(ACCOUNT_INFO_STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as Partial<{ firstName: string; lastName: string; email: string }>;
    if (typeof parsed.email !== "string" || !parsed.email) return null;
    return {
      firstName: typeof parsed.firstName === "string" ? parsed.firstName : "",
      lastName: typeof parsed.lastName === "string" ? parsed.lastName : "",
      email: parsed.email,
    };
  } catch {
    return null;
  }
}

function saveStoredAccountInfo(info: { firstName: string; lastName: string; email: string }) {
  if (typeof window === "undefined" || !info.email) return;
  window.localStorage.setItem(ACCOUNT_INFO_STORAGE_KEY, JSON.stringify(info));
}

export default function AccountSettingsPage() {
  const { configured, loading: authLoading, user, signOut } = useAuth();
  const [storedUser, setStoredUser] = useState<User | null>(null);
  const [ownerFirstName, setOwnerFirstName] = useState("");
  const [ownerLastName, setOwnerLastName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [savedOwnerInfo, setSavedOwnerInfo] = useState({ firstName: "", lastName: "", email: "" });
  const [ownerInfoEditing, setOwnerInfoEditing] = useState(false);
  const [accountStatus, setAccountStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [accountMessage, setAccountMessage] = useState("");
  const [notebookRole, setNotebookRole] = useState<NotebookAccessRole | null>(null);
  const [notebookRoleLoaded, setNotebookRoleLoaded] = useState(false);
  const [membershipPlanVisible, setMembershipPlanVisible] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState("Plus");

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
    applyPetTheme(profile.themeId);
  }, [profile.themeId]);

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
        setSavedOwnerInfo({ firstName: "", lastName: "", email: "" });
        setNotebookRole(null);
        setNotebookRoleLoaded(true);
        return;
      }

      setNotebookRoleLoaded(false);

      setOwnerFirstName(nextOwnerInfo.firstName);
      setOwnerLastName(nextOwnerInfo.lastName);
      setOwnerEmail(nextOwnerInfo.email);
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
    setOwnerInfoEditing(false);
    setAccountStatus("idle");
    setAccountMessage("");
  }

  async function handleSaveAccountInfo() {
    const trimmedFirstName = ownerFirstName.trim();
    const trimmedLastName = ownerLastName.trim();
    const trimmedEmail = ownerEmail.trim().toLowerCase();

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
    setSavedOwnerInfo({
      firstName: trimmedFirstName,
      lastName: trimmedLastName,
      email: trimmedEmail || displayUser.email || "",
    });
    saveStoredAccountInfo({
      firstName: trimmedFirstName,
      lastName: trimmedLastName,
      email: trimmedEmail || displayUser.email || "",
    });
    setOwnerInfoEditing(false);
    setAccountStatus("saved");
    setAccountMessage(trimmedEmail && trimmedEmail !== displayUser.email ? "Account info saved. Check the new email address to confirm the email change." : "Account info saved.");
  }

  const theme = appThemes[profile.themeId];
  const canViewMembershipPlan = membershipPlanVisible && notebookRole === "owner";
  const displayedNotebookRole = canViewMembershipPlan ? "owner" : notebookRole === "owner" ? null : notebookRole;
  const accountInfoTitle = `${notebookRoleLabel(displayedNotebookRole)} Info`;
  const showAccountInfoTitle = (!authLoading && !displayUser) || notebookRoleLoaded;

  return (
    <main className="min-h-[100dvh] bg-[var(--hewie-bg,#979ca7)] text-zinc-900">
      <div className="content-fade-in mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-4 pb-[calc(8rem+env(safe-area-inset-bottom))] pt-6">
        <header className="mb-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <PetNotebookTitle href="/hewie" className="text-sm font-bold text-[var(--hewie-active-text,#6d28d9)]" />
              <h1 className="mt-1 text-xl font-bold tracking-tight text-zinc-700">Account Settings</h1>
            </div>
            <PetAvatarMenu className="mt-0.5 size-20 rounded-full object-cover object-center ring-1 ring-zinc-500/60 shadow-sm" />
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
