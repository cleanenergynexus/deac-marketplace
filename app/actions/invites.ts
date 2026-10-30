"use server";
// Direct investor invites: skip the Access Requests queue by creating an approved login from the Investor CRM.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { hashPassword, requireAdmin, startSession } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { hashInviteToken, inviteExpired, inviteUrl, INVITE_DAYS, loginState, newInvite, stageAfterInvite } from "@/lib/invites";

export type InviteState = { error?: string; link?: string; emailed?: boolean; name?: string } | undefined;

const appUrl = () => process.env.PUBLIC_APP_URL || "https://marketplace.deacna.com";

/** Creates (or renews) an approved investor login and returns a one-time link to set a password. */
export async function inviteInvestor(_: InviteState, f: FormData): Promise<InviteState> {
  const admin = await requireAdmin();
  const inv = await db.investor.findUnique({ where: { id: String(f.get("investorId")) }, include: { user: true } });
  if (!inv) return { error: "That contact no longer exists." };
  const state = loginState(inv.user);
  if (state === "APPROVED") return { error: `${inv.name} already has a marketplace login.` };
  if (state === "PENDING") return { error: `${inv.name} already applied. Use Approve to let them in.` };
  if (state === "REJECTED") return { error: `${inv.name}'s login was declined. Set the membership stage to Approved Member to let them back in.` };
  const taken = await db.user.findUnique({ where: { email: inv.email } });
  if (taken && taken.investorId !== inv.id) return { error: `${inv.email} is already used by another login (team or referral agent). Change the contact's email first.` };

  const { token, hash, expiresAt } = newInvite();
  // Nobody knows this password; the invite link replaces it.
  const unusable = await hashPassword(randomBytes(24).toString("hex"));
  if (inv.user) await db.user.update({ where: { id: inv.user.id }, data: { inviteTokenHash: hash, inviteExpiresAt: expiresAt, status: "APPROVED" } });
  else await db.user.create({ data: { email: inv.email, name: inv.name, passwordHash: unusable, role: "INVESTOR", status: "APPROVED", investorId: inv.id, inviteTokenHash: hash, inviteExpiresAt: expiresAt } });

  const stage = stageAfterInvite(inv.stage);
  if (stage !== inv.stage) await db.investor.update({ where: { id: inv.id }, data: { stage } });
  await db.activity.create({ data: { investorId: inv.id, kind: "SYSTEM", by: admin.name, body: `${state === "NONE" ? "Invited" : "Re-invited"} to the marketplace by ${admin.name} (approved, no access request).${stage !== inv.stage ? ` Stage → ${stage}` : ""}` } });

  const link = inviteUrl(appUrl(), token);
  const mail = await sendEmail({
    to: inv.email,
    subject: "You're invited to the DEAC Marketplace",
    text: `Hi ${inv.name.split(" ")[0]},\n\n${admin.name} has invited you to the DEAC private investor marketplace. Your membership is already approved.\n\nSet your password and sign in here (link valid for ${INVITE_DAYS} days):\n${link}\n\n— DEAC Team`,
  });
  revalidatePath(`/admin/investors/${inv.id}`);
  revalidatePath("/admin", "layout");
  return { link, emailed: mail.status === "SENT", name: inv.name };
}

/** Takes back an invite nobody has used yet (removes the unused login). */
export async function cancelInvite(f: FormData) {
  const admin = await requireAdmin();
  const investorId = String(f.get("investorId"));
  const { count } = await db.user.deleteMany({ where: { investorId, role: "INVESTOR", inviteTokenHash: { not: null } } });
  if (count) await db.activity.create({ data: { investorId, kind: "SYSTEM", by: admin.name, body: `Marketplace invite cancelled by ${admin.name}.` } });
  revalidatePath(`/admin/investors/${investorId}`);
}

/** The investor opens their link and picks a password; they're signed straight in. */
export async function acceptInvite(_: { error?: string } | undefined, f: FormData): Promise<{ error?: string } | undefined> {
  const token = String(f.get("token") ?? "");
  const password = String(f.get("password") ?? "");
  if (password.length < 8) return { error: "Choose a password of at least 8 characters." };
  if (password !== String(f.get("confirm") ?? "")) return { error: "The two passwords don't match." };
  const user = token ? await db.user.findFirst({ where: { inviteTokenHash: hashInviteToken(token) } }) : null;
  if (!user || user.role !== "INVESTOR" || inviteExpired(user.inviteExpiresAt)) return { error: "This invite link has expired or was already used. Ask the DEAC team for a new one." };
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password), inviteTokenHash: null, inviteExpiresAt: null } });
  if (user.investorId) await db.activity.create({ data: { investorId: user.investorId, kind: "SYSTEM", by: user.name, body: "Accepted the marketplace invite and set a password." } });
  await startSession({ uid: user.id, role: "INVESTOR", status: user.status, name: user.name });
  redirect("/marketplace");
}
