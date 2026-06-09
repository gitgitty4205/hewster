import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import type { NotebookAccessRole } from "@/lib/notebook-access";
import { getSupabaseEnv } from "@/lib/supabase";

const resendApiKey = process.env.RESEND_API_KEY;
const resendFromEmail = process.env.RESEND_FROM_EMAIL || "PetNoteBook <onboarding@resend.dev>";
const inviteBaseUrl = process.env.INVITE_BASE_URL || process.env.NEXT_PUBLIC_APP_URL;
const inviteReplyToEmail = process.env.INVITE_REPLY_TO_EMAIL;

function isInviteRole(value: unknown): value is Exclude<NotebookAccessRole, "owner"> {
  return value === "co-owner" || value === "caretaker" || value === "pet-sitter";
}

function roleLabel(role: NotebookAccessRole) {
  if (role === "pet-sitter") return "Pet Sitter";
  if (role === "co-owner") return "Co-owner";
  if (role === "caretaker") return "Caretaker";
  return "Owner";
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeDisplayValue(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function normalizeEmailImageUrl(value: unknown, origin: string) {
  const photoUrl = normalizeDisplayValue(value);
  if (!photoUrl || photoUrl.startsWith("data:") || photoUrl.startsWith("blob:")) return "";

  try {
    const url = new URL(photoUrl, origin);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function ownerDisplayName(user: { email?: string; user_metadata?: Record<string, unknown> }) {
  const metadata = user.user_metadata ?? {};
  const fullName = normalizeDisplayValue(metadata.full_name);
  if (fullName) return fullName;

  const firstName = normalizeDisplayValue(metadata.first_name);
  const lastName = normalizeDisplayValue(metadata.last_name);
  const combinedName = [firstName, lastName].filter(Boolean).join(" ");
  return combinedName || user.email || "The notebook owner";
}

function entityRefId(ownerId: string, inviteEmail: string) {
  const input = `${ownerId}:${inviteEmail}`;
  const bytes = new TextEncoder().encode(input);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return `pet-notebook-invite-${btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")}`;
}

export async function POST(request: Request) {
  const { url, anonKey } = getSupabaseEnv();
  const authorization = request.headers.get("authorization");

  if (!url || !anonKey || !authorization) {
    return NextResponse.json({ sent: false, error: "Auth is not configured." }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as { email?: unknown; role?: unknown; notebookName?: unknown; petPhotoUrl?: unknown } | null;
  const inviteEmail = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const role = body?.role;
  const notebookName = normalizeDisplayValue(body?.notebookName) || "a PetNoteBook";

  if (!inviteEmail || !isInviteRole(role)) {
    return NextResponse.json({ sent: false, error: "Invite email and role are required." }, { status: 400 });
  }

  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData.user;

  if (userError || !user) {
    return NextResponse.json({ sent: false, error: "Sign in again before sending invites." }, { status: 401 });
  }

  const { data: ownerMembership, error: ownerError } = await supabase
    .from("notebook_members")
    .select("notebook_owner_id, role, status")
    .eq("notebook_owner_id", user.id)
    .eq("member_user_id", user.id)
    .eq("role", "owner")
    .eq("status", "active")
    .maybeSingle();

  if (ownerError || !ownerMembership) {
    return NextResponse.json({ sent: false, error: "Only the notebook owner can email invites." }, { status: 403 });
  }

  if (!resendApiKey) {
    return NextResponse.json({ sent: false, skipped: true, reason: "RESEND_API_KEY is not configured." });
  }

  const origin = inviteBaseUrl || new URL(request.url).origin;
  const loginUrl = `${origin.replace(/\/$/, "")}/login?mode=register`;
  const petPhotoUrl = normalizeEmailImageUrl(body?.petPhotoUrl, origin);
  const ownerName = ownerDisplayName(user);
  const safeRoleLabel = roleLabel(role);
  const safeLoginUrl = escapeHtml(loginUrl);
  const safePetPhotoUrl = escapeHtml(petPhotoUrl);
  const safeOwnerName = escapeHtml(ownerName);
  const safeNotebookName = escapeHtml(notebookName);
  const safeRoleLabelHtml = escapeHtml(safeRoleLabel);
  const petPhotoHtml = safePetPhotoUrl
    ? `<img src="${safePetPhotoUrl}" alt="${safeNotebookName}" width="96" height="96" style="border: 0; border-radius: 999px; display: block; height: 96px; margin: 0 0 20px; object-fit: cover; width: 96px;" />`
    : "";

  const html = `<!doctype html>
<html>
  <body style="font-family: Arial, sans-serif; color: #27272a; line-height: 1.5; margin: 0; padding: 24px;">
    <p>PetNoteBook</p>
    ${petPhotoHtml}
    <h1 style="font-size: 28px; line-height: 1.2; margin: 0 0 16px;">You've been invited to ${safeNotebookName}</h1>
    <p>${safeOwnerName} invited you as a ${safeRoleLabelHtml}.</p>
    <p>Use this email address to create an account or sign in.</p>
    <p style="margin: 24px 0;">
      <a href="${safeLoginUrl}" style="background: #6d5a95; border-radius: 999px; color: #ffffff; display: inline-block; font-weight: 700; padding: 13px 22px; text-decoration: none;">Open ${safeNotebookName}</a>
    </p>
    <p style="font-size: 13px; color: #71717a;">If the button does not work, open this link: <a href="${safeLoginUrl}">${safeLoginUrl}</a></p>
    <p style="font-size: 13px; color: #71717a;">This is an account access message for PetNoteBook.</p>
  </body>
</html>`;

  const text = `PetNoteBook\n\nYou've been invited to ${notebookName}\n\n${ownerName} invited you as a ${safeRoleLabel}.\n\nOpen ${notebookName}:\n${loginUrl}\n\nThis is an account access message for PetNoteBook.`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: resendFromEmail,
      to: inviteEmail,
      subject: `You've been invited to ${notebookName}`,
      html,
      text,
      ...(inviteReplyToEmail ? { reply_to: inviteReplyToEmail } : {}),
      headers: {
        "Auto-Submitted": "auto-generated",
        "X-Entity-Ref-ID": entityRefId(user.id, inviteEmail),
        "X-Pet-Notebook-Message-Type": "account-access",
      },
      tags: [
        { name: "message_type", value: "account_access" },
        { name: "role", value: role },
      ],
    }),
  });

  const result = await response.json().catch(() => null);

  if (!response.ok) {
    return NextResponse.json({ sent: false, error: "Email provider rejected the invite.", detail: result }, { status: 502 });
  }

  return NextResponse.json({ sent: true, id: result?.id ?? null });
}
