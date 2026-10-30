"use server";
// Team side of referral agents: Admins add agents, assign their DEAC partner, suspend or remove them.
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { signViewAs, VIEW_AS_COOKIE } from "@/lib/session";
import { db } from "@/lib/db";
import { hashPassword, requireAdmin, requireTeamAdmin } from "@/lib/auth";
import { isAgentStatus } from "@/lib/agents";
import { phoneFromForm } from "@/lib/phone";
import { sendEmail } from "@/lib/email";

type State = { error?: string; ok?: boolean } | undefined;
const s = (f: FormData, k: string) => (f.get(k) as string | null)?.trim() || null;

/** The partner picked on the form: a team login, or null for none. */
async function partnerFrom(f: FormData): Promise<{ id: string; name: string; email: string } | null | "bad"> {
  const id = s(f, "partnerId");
  if (!id) return null;
  return (await db.user.findFirst({ where: { id, role: "ADMIN" }, select: { id: true, name: true, email: true } })) ?? "bad";
}

function refresh() {
  revalidatePath("/admin/agents");
  revalidatePath("/admin", "layout");
}

export async function addAgent(_: State, f: FormData): Promise<State> {
  const admin = await requireTeamAdmin();
  const email = s(f, "email")?.toLowerCase();
  const name = s(f, "name");
  const password = String(f.get("password") ?? "");
  if (!email || !name || password.length < 10) return { error: "Name, email and a temporary password of at least 10 characters are required." };
  if (await db.user.findUnique({ where: { email } })) return { error: "That email already has a login (team, investor or agent). Use a different email." };
  const partner = await partnerFrom(f);
  if (partner === "bad") return { error: "Pick a DEAC partner from the team." };
  await db.user.create({ data: { email, name, passwordHash: await hashPassword(password), role: "AGENT", status: "APPROVED", company: s(f, "company"), phone: phoneFromForm(f, "phone"), partnerId: partner?.id ?? null } });
  const url = process.env.PUBLIC_APP_URL ?? "";
  await sendEmail({ to: email, subject: "Your DEAC referral agent login", text: `Hi ${name.split(" ")[0]},\n\n${admin.name} set up your DEAC Marketplace referral agent account.\n\nSign in at ${url}/login with this email. ${admin.name} will share your temporary password; please change it under My account after signing in.${partner ? `\n\nYour DEAC partner is ${partner.name} (${partner.email}). They support your transactions and schedule your meetings.` : ""}\n\n— DEAC Team` });
  if (partner) await sendEmail({ to: partner.email, subject: `You're now DEAC partner for referral agent ${name}`, text: `${admin.name} assigned you as the DEAC partner for referral agent ${name} (${email}). Their referrals and meeting requests will show up in your tasks.\n\n${url}/admin/agents` });
  refresh();
  return { ok: true };
}

/** Partner, company, phone, status, and optionally a new temporary password. */
export async function updateAgent(_: State, f: FormData): Promise<State> {
  const admin = await requireTeamAdmin();
  const id = String(f.get("id"));
  const agent = await db.user.findFirst({ where: { id, role: "AGENT" } });
  if (!agent) return { error: "That referral agent no longer exists." };
  const partner = await partnerFrom(f);
  if (partner === "bad") return { error: "Pick a DEAC partner from the team." };
  const status = s(f, "status") ?? agent.status;
  if (!isAgentStatus(status)) return { error: "Pick a status." };
  const password = String(f.get("password") ?? "");
  if (password && password.length < 10) return { error: "A new password needs at least 10 characters." };
  await db.user.update({
    where: { id },
    data: { partnerId: partner?.id ?? null, company: s(f, "company"), phone: phoneFromForm(f, "phone"), status, ...(password ? { passwordHash: await hashPassword(password) } : {}) },
  });
  if (partner && partner.id !== agent.partnerId) {
    await sendEmail({ to: partner.email, subject: `You're now DEAC partner for referral agent ${agent.name}`, text: `${admin.name} assigned you as the DEAC partner for referral agent ${agent.name} (${agent.email}). Their referrals and meeting requests will show up in your tasks.\n\n${process.env.PUBLIC_APP_URL ?? ""}/admin/agents` });
  }
  refresh();
  return { ok: true };
}

/** "View as agent": opens the agent's portal as they see it, without their password. Read-only, ends after 2 hours or on Exit. */
export async function viewAsAgent(f: FormData) {
  const me = await requireAdmin();
  const agent = await db.user.findFirst({ where: { id: String(f.get("id")), role: "AGENT" }, select: { id: true } });
  if (!agent) redirect("/admin/agents");
  (await cookies()).set(VIEW_AS_COOKIE, await signViewAs({ admin: me.id, agent: agent.id }), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 2 * 60 * 60 });
  redirect("/agent");
}

/** Leaves the preview and goes back to the Referral agents page. */
export async function exitAgentView() {
  (await cookies()).delete(VIEW_AS_COOKIE);
  redirect("/admin/agents");
}

/** Deletes the agent's login. The contacts they referred stay in the CRM, without a referral agent. */
export async function removeAgent(f: FormData) {
  await requireTeamAdmin();
  const id = String(f.get("id"));
  await db.user.deleteMany({ where: { id, role: "AGENT" } });
  refresh();
}

/** A team member's phone and meeting booking link, shown to the referral agents they partner with. */
export async function updateMyProfile(_: State, f: FormData): Promise<State> {
  const me = await requireAdmin();
  const bookingUrl = s(f, "bookingUrl");
  if (bookingUrl && !/^https:\/\/\S+$/i.test(bookingUrl)) return { error: "The booking link should start with https://" };
  await db.user.update({ where: { id: me.id }, data: { phone: phoneFromForm(f, "phone"), bookingUrl } });
  revalidatePath("/admin/account");
  return { ok: true };
}
