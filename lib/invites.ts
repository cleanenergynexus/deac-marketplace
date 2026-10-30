// Direct investor invites: the team creates an approved login and shares a one-time link to set a password.
import { createHash, randomBytes } from "node:crypto";

export const INVITE_DAYS = 14;

/** Only the hash is stored, so a leaked database can't be used to accept invites. */
export const hashInviteToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function newInvite(now = new Date()) {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashInviteToken(token), expiresAt: new Date(now.getTime() + INVITE_DAYS * 86_400_000) };
}

export const inviteUrl = (base: string, token: string) => `${base.replace(/\/+$/, "")}/invite/${token}`;

export const inviteExpired = (expiresAt: Date | null, now = new Date()) => !expiresAt || expiresAt.getTime() <= now.getTime();

/** Where a CRM contact stands on marketplace access, for the contact record. */
export type LoginState = "NONE" | "INVITED" | "INVITE_EXPIRED" | "PENDING" | "APPROVED" | "REJECTED";
export function loginState(user: { status: string; inviteTokenHash: string | null; inviteExpiresAt: Date | null } | null, now = new Date()): LoginState {
  if (!user) return "NONE";
  if (user.inviteTokenHash) return inviteExpired(user.inviteExpiresAt, now) ? "INVITE_EXPIRED" : "INVITED";
  if (user.status === "APPROVED") return "APPROVED";
  if (user.status === "REJECTED") return "REJECTED";
  return "PENDING";
}

/** Stages that already mean "member": inviting keeps them; anything else moves to Approved Member. */
export const stageAfterInvite = (stage: string) => (stage === "ACTIVE" || stage === "APPROVED" ? stage : "APPROVED");
