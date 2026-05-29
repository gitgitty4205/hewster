import type { SupabaseClient, User } from "@supabase/supabase-js";

import { getSupabaseCurrentSession } from "@/lib/supabase";

export type NotebookAccessRole = "owner" | "co-owner" | "caretaker" | "pet-sitter";

export type NotebookMember = {
  id: string;
  notebookOwnerId: string;
  memberUserId: string | null;
  memberEmail: string;
  role: NotebookAccessRole;
  status: "active" | "invited" | "revoked";
  createdAt?: string;
  updatedAt?: string;
};

type NotebookMemberRow = {
  id: string;
  notebook_owner_id: string;
  member_user_id: string | null;
  member_email: string;
  role: NotebookAccessRole;
  status: "active" | "invited" | "revoked";
  created_at?: string;
  updated_at?: string;
};

const ACCESS_CACHE_TTL_MS = 60_000;
const MEMBERS_CACHE_TTL_MS = 60_000;
export const ACTIVE_NOTEBOOK_OWNER_STORAGE_KEY = "petnotebook.activeNotebookOwnerId";
const ACTIVE_NOTEBOOK_SELECTION_EXPLICIT_KEY = "petnotebook.activeNotebookSelectionExplicit";
const ACTIVE_NOTEBOOK_SELECTION_VERSION_KEY = "petnotebook.activeNotebookSelectionVersion";
const ACTIVE_NOTEBOOK_SELECTION_VERSION = "2";
const activeAccessCache = new Map<string, { expiresAt: number; access: ResolvedNotebookAccess }>();
const activeAccessPromises = new Map<string, Promise<ResolvedNotebookAccess>>();
const notebookMembersCache = new Map<string, { expiresAt: number; members: NotebookMember[] }>();
const notebookMembersPromises = new Map<string, Promise<NotebookMember[]>>();

type ResolvedNotebookAccess = {
  notebookOwnerId: string;
  role: NotebookAccessRole;
  members: NotebookMember[];
};

export const notebookAccessRoleDescriptions: Record<NotebookAccessRole, string> = {
  owner: "Full access, including invites, access management, and exporting notebook copies.",
  "co-owner": "Full notebook access, including care history and exporting copies. Cannot manage invites or access.",
  caretaker: "Can help manage daily care, logs, alerts, and settings. Cannot manage invites, access, or exports.",
  "pet-sitter": "Limited access for short-term care. Can log basic care only, with no medical records, full history, or exports.",
};

export function canExportNotebook(role: NotebookAccessRole) {
  return role === "owner" || role === "co-owner";
}

export const notebookInviteRoles: NotebookAccessRole[] = ["co-owner", "caretaker", "pet-sitter"];

export function activeNotebookOwnerIdFromStorage() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACTIVE_NOTEBOOK_OWNER_STORAGE_KEY);
}

export function setActiveNotebookOwnerId(ownerId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACTIVE_NOTEBOOK_OWNER_STORAGE_KEY, ownerId);
  window.localStorage.setItem(ACTIVE_NOTEBOOK_SELECTION_EXPLICIT_KEY, "true");
  window.localStorage.setItem(ACTIVE_NOTEBOOK_SELECTION_VERSION_KEY, ACTIVE_NOTEBOOK_SELECTION_VERSION);
  activeAccessCache.clear();
  activeAccessPromises.clear();
  window.dispatchEvent(new Event("petnotebook-active-notebook-updated"));
}

export function clearActiveNotebookOwnerId() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ACTIVE_NOTEBOOK_OWNER_STORAGE_KEY);
  window.localStorage.removeItem(ACTIVE_NOTEBOOK_SELECTION_EXPLICIT_KEY);
  window.localStorage.removeItem(ACTIVE_NOTEBOOK_SELECTION_VERSION_KEY);
  activeAccessCache.clear();
  activeAccessPromises.clear();
  window.dispatchEvent(new Event("petnotebook-active-notebook-updated"));
}

export function hasExplicitActiveNotebookSelection() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(ACTIVE_NOTEBOOK_SELECTION_EXPLICIT_KEY) === "true" &&
    window.localStorage.getItem(ACTIVE_NOTEBOOK_SELECTION_VERSION_KEY) === ACTIVE_NOTEBOOK_SELECTION_VERSION;
}

function memberBelongsToCurrentUser(member: NotebookMember, currentUserId: string, currentUserEmail?: string | null) {
  const currentEmail = currentUserEmail ? normalizeEmail(currentUserEmail) : "";
  return member.memberUserId === currentUserId ||
    member.notebookOwnerId === currentUserId ||
    (currentEmail && normalizeEmail(member.memberEmail) === currentEmail);
}

function dedupeNotebookMemberships(members: NotebookMember[]) {
  const byNotebookOwnerId = new Map<string, NotebookMember>();

  for (const member of members) {
    const existing = byNotebookOwnerId.get(member.notebookOwnerId);
    if (!existing) {
      byNotebookOwnerId.set(member.notebookOwnerId, member);
      continue;
    }

    if (existing.status !== "active" && member.status === "active") {
      byNotebookOwnerId.set(member.notebookOwnerId, member);
    }
  }

  return Array.from(byNotebookOwnerId.values());
}

export function selectActiveNotebookMembership(members: NotebookMember[], currentUserId: string, currentUserEmail?: string | null) {
  const visibleMemberships = dedupeNotebookMemberships(
    members.filter((member) => member.status !== "revoked" && memberBelongsToCurrentUser(member, currentUserId, currentUserEmail)),
  );
  const selectedNotebookOwnerId = activeNotebookOwnerIdFromStorage();
  const selectedMembership = selectedNotebookOwnerId
    ? visibleMemberships.find((member) => member.notebookOwnerId === selectedNotebookOwnerId)
    : null;
  const sharedMembership = visibleMemberships.find((member) => member.notebookOwnerId !== currentUserId && member.role !== "owner");
  const ownNotebook = visibleMemberships.find((member) => member.notebookOwnerId === currentUserId && member.role === "owner" && member.status === "active");
  const explicitSelectedMembership = hasExplicitActiveNotebookSelection() ? selectedMembership : null;
  const selectedOwnNotebook = explicitSelectedMembership?.notebookOwnerId === currentUserId && explicitSelectedMembership.role === "owner"
    ? selectedMembership
    : null;

  return {
    activeMembership: explicitSelectedMembership ?? sharedMembership ?? selectedMembership ?? ownNotebook ?? visibleMemberships[0] ?? null,
    ownNotebook: ownNotebook ?? null,
    selectedOwnNotebook,
    sharedMembership: sharedMembership ?? null,
    visibleMemberships,
  };
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function mapNotebookMember(row: NotebookMemberRow): NotebookMember {
  return {
    id: row.id,
    notebookOwnerId: row.notebook_owner_id,
    memberUserId: row.member_user_id,
    memberEmail: row.member_email,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function throwSupabaseError(error: { message?: string } | null) {
  if (!error) return;
  throw new Error(error.message || "Notebook access request failed.");
}

function clearNotebookAccessCaches(userId?: string) {
  if (userId) {
    notebookMembersCache.delete(userId);
    notebookMembersPromises.delete(userId);
    activeAccessCache.delete(userId);
    activeAccessPromises.delete(userId);
    return;
  }

  notebookMembersCache.clear();
  notebookMembersPromises.clear();
  activeAccessCache.clear();
  activeAccessPromises.clear();
}

export async function ensureOwnNotebookMembership(supabase: SupabaseClient, user: User) {
  const memberEmail = normalizeEmail(user.email ?? "");
  if (!memberEmail) return null;

  const { data: existing, error: existingError } = await supabase
    .from("notebook_members")
    .select("id, notebook_owner_id, member_user_id, member_email, role, status, created_at, updated_at")
    .eq("notebook_owner_id", user.id)
    .eq("member_user_id", user.id)
    .maybeSingle();

  if (existingError) return null;
  if (existing) return mapNotebookMember(existing as NotebookMemberRow);

  const { data, error } = await supabase
    .from("notebook_members")
    .insert({
      notebook_owner_id: user.id,
      member_user_id: user.id,
      member_email: memberEmail,
      role: "owner",
      status: "active",
    })
    .select("id, notebook_owner_id, member_user_id, member_email, role, status, created_at, updated_at")
    .single();

  if (error || !data) return null;
  return mapNotebookMember(data as NotebookMemberRow);
}

export async function claimNotebookInvites(supabase: SupabaseClient, user: User) {
  const memberEmail = normalizeEmail(user.email ?? "");
  if (!memberEmail) return;

  await supabase
    .from("notebook_members")
    .update({ member_user_id: user.id, status: "active", updated_at: new Date().toISOString() })
    .eq("member_email", memberEmail)
    .is("member_user_id", null)
    .eq("status", "invited");
}

export async function loadNotebookMembers(supabase: SupabaseClient, user: User) {
  const cached = notebookMembersCache.get(user.id);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.members;
  }

  const pending = notebookMembersPromises.get(user.id);
  if (pending) return pending;

  const promise = loadNotebookMembersUncached(supabase, user);
  notebookMembersPromises.set(user.id, promise);

  try {
    const members = await promise;
    notebookMembersCache.set(user.id, { members, expiresAt: Date.now() + MEMBERS_CACHE_TTL_MS });
    return members;
  } finally {
    notebookMembersPromises.delete(user.id);
  }
}

async function loadNotebookMembersUncached(supabase: SupabaseClient, user: User) {
  await ensureOwnNotebookMembership(supabase, user);
  await claimNotebookInvites(supabase, user);

  const { data, error } = await supabase
    .from("notebook_members")
    .select("id, notebook_owner_id, member_user_id, member_email, role, status, created_at, updated_at")
    .order("created_at", { ascending: true });

  if (error || !data) return [];
  return (data as NotebookMemberRow[]).map(mapNotebookMember);
}

export async function resolveActiveNotebookAccess(supabase: SupabaseClient, user: User) {
  const cachedAccess = activeAccessCache.get(user.id);
  if (cachedAccess && cachedAccess.expiresAt > Date.now()) {
    return cachedAccess.access;
  }

  const pendingAccess = activeAccessPromises.get(user.id);
  if (pendingAccess) return pendingAccess;

  const accessPromise = resolveFreshNotebookAccess(supabase, user);
  activeAccessPromises.set(user.id, accessPromise);

  try {
    const access = await accessPromise;
    activeAccessCache.set(user.id, { access, expiresAt: Date.now() + ACCESS_CACHE_TTL_MS });
    return access;
  } finally {
    activeAccessPromises.delete(user.id);
  }
}

async function resolveFreshNotebookAccess(supabase: SupabaseClient, user: User): Promise<ResolvedNotebookAccess> {
  const members = await loadNotebookMembers(supabase, user);
  const { activeMembership } = selectActiveNotebookMembership(members, user.id, user.email);

  if (!activeMembership) {
    return {
      notebookOwnerId: user.id,
      role: "owner" as NotebookAccessRole,
      members,
    };
  }

  return {
    notebookOwnerId: activeMembership.notebookOwnerId,
    role: activeMembership.role,
    members,
  };
}

export async function inviteNotebookMember(
  supabase: SupabaseClient,
  user: User,
  email: string,
  role: Exclude<NotebookAccessRole, "owner">,
  notebookName?: string,
  petPhotoUrl?: string,
) {
  const memberEmail = normalizeEmail(email);
  if (!memberEmail) throw new Error("Enter an email address.");

  await ensureOwnNotebookMembership(supabase, user);
  clearNotebookAccessCaches(user.id);

  const { data: ownerMembership, error: ownerError } = await supabase
    .from("notebook_members")
    .select("notebook_owner_id, role, status")
    .eq("notebook_owner_id", user.id)
    .eq("member_user_id", user.id)
    .eq("role", "owner")
    .eq("status", "active")
    .maybeSingle();

  if (ownerError || !ownerMembership) {
    throw new Error("Only the notebook owner can invite people right now.");
  }

  const { error } = await supabase.from("notebook_members").upsert(
    {
      notebook_owner_id: user.id,
      member_email: memberEmail,
      role,
      status: "invited",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "notebook_owner_id,member_email" },
  );

  throwSupabaseError(error);
  clearNotebookAccessCaches(user.id);

  const session = await getSupabaseCurrentSession(supabase);
  const accessToken = session?.access_token;
  if (!accessToken) return { emailSent: false, emailSkipped: true };

  const response = await fetch("/api/notebook-invites/email", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email: memberEmail, role, notebookName, petPhotoUrl }),
  });

  const result = await response.json().catch(() => null) as { sent?: boolean; skipped?: boolean; reason?: string; error?: string } | null;

  if (!response.ok) {
    return { emailSent: false, emailSkipped: false, emailError: result?.error ?? "Invite saved, but the email could not be sent." };
  }

  return { emailSent: result?.sent === true, emailSkipped: result?.skipped === true, emailReason: result?.reason };
}

export async function updateNotebookMemberRole(
  supabase: SupabaseClient,
  user: User,
  memberId: string,
  role: Exclude<NotebookAccessRole, "owner">,
) {
  const { error } = await supabase
    .from("notebook_members")
    .update({ role, updated_at: new Date().toISOString() })
    .eq("id", memberId)
    .eq("notebook_owner_id", user.id)
    .neq("role", "owner");

  throwSupabaseError(error);
  clearNotebookAccessCaches(user.id);
}

export async function removeNotebookMember(supabase: SupabaseClient, user: User, memberId: string) {
  const { error } = await supabase
    .from("notebook_members")
    .update({ status: "revoked", updated_at: new Date().toISOString() })
    .eq("id", memberId)
    .eq("notebook_owner_id", user.id)
    .neq("role", "owner");

  throwSupabaseError(error);
  clearNotebookAccessCaches(user.id);
}
