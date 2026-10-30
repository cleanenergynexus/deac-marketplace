import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { COOKIE, readToken, readViewAs, signSession, VIEW_AS_COOKIE, type Session } from "./session";
import { staffLevel } from "./tasks";
import { investorStage, type Stage, type StepStatus } from "./disclosure";
import { agentProjectWhere } from "./agents";

export async function getSession() {
  const c = await cookies();
  return readToken(c.get(COOKIE)?.value);
}

export async function startSession(s: Session) {
  const c = await cookies();
  c.set(COOKIE, await signSession(s), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 14 });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

export const hashPassword = (p: string) => bcrypt.hash(p, 10);
export const checkPassword = (p: string, h: string) => bcrypt.compare(p, h);

/** Current user, re-read from the DB so approvals/revocations apply immediately. */
export async function currentUser() {
  const s = await getSession();
  if (!s) return null;
  return db.user.findUnique({ where: { id: s.uid }, include: { investor: true, developer: true } });
}

export async function requireAdmin() {
  const u = await currentUser();
  if (!u || u.role !== "ADMIN") redirect("/login");
  return u;
}

/** Team member with Admin access level (manages the team). Managers and Support are sent to the dashboard. */
export async function requireTeamAdmin() {
  const u = await requireAdmin();
  if (staffLevel(u.staffLevel) !== "ADMIN") redirect("/admin");
  return u;
}

/** The agent a team member is previewing with "View as agent", if any (the cookie must have been set for this team member). */
async function previewedAgent(u: { id: string; role: string }) {
  if (u.role !== "ADMIN") return null;
  const v = await readViewAs((await cookies()).get(VIEW_AS_COOKIE)?.value);
  if (!v || v.admin !== u.id) return null;
  return db.user.findFirst({ where: { id: v.agent, role: "AGENT" }, include: { investor: true, developer: true } });
}

/**
 * The referral agent whose portal is showing: the signed-in agent (if not suspended), or the agent a team member is
 * previewing with "View as agent" (`preview` true). Everyone else goes to sign-in.
 */
export async function agentView() {
  const u = await currentUser();
  if (!u) redirect("/login");
  if (u.role === "AGENT" && u.status === "APPROVED") return { agent: u, preview: false as const };
  const agent = await previewedAgent(u);
  if (agent) return { agent, preview: true as const, viewer: u };
  redirect(u.role === "ADMIN" ? "/admin/agents" : "/login");
}

/** Agent portal pages: the agent whose portal is showing (also while a team member previews it). */
export async function requireAgent() {
  return (await agentView()).agent;
}

export const PREVIEW_MESSAGE = "This is a preview of the agent's portal, so nothing is saved. Exit the preview to work as yourself.";

/** Agent actions: only the agent themselves. A team member's preview is read-only. */
export async function requireAgentToAct() {
  const v = await agentView();
  if (v.preview) throw new Error(PREVIEW_MESSAGE);
  return v.agent;
}

/** Approved investor, active referral agent (teaser level, see listingAccess), or admin, who can preview everything. */
export async function requireMember() {
  const u = await currentUser();
  if (!u) redirect("/login");
  if (u.role === "ADMIN") return u;
  if (u.role === "AGENT") {
    if (u.status !== "APPROVED") redirect("/login");
    return u;
  }
  if (u.role !== "INVESTOR" || u.status !== "APPROVED") redirect("/pending");
  return u;
}

/**
 * Where an investor stands on one listing. Admins see everything. Referral agents see every live listing at the
 * Teaser level, and everything on listings they originated (projects of developers they brought in, see lib/agents.ts).
 */
export async function listingAccess(projectId: string, u: { id?: string; role: string; investorId: string | null; investor?: { ndaSigned: boolean } | null }) {
  if (u.role === "AGENT" && u.id) {
    const originated = await isOriginator(u.id, projectId);
    return { stage: (originated ? "DILIGENCE" : "TEASER") as Stage, nda: undefined, loi: null, diligence: undefined, masterNda: false, originated };
  }
  if (u.role === "ADMIN" || !u.investorId) {
    return { stage: (u.role === "ADMIN" ? "DILIGENCE" : "TEASER") as Stage, nda: undefined, loi: null, diligence: undefined, masterNda: false };
  }
  const where = { projectId, investorId: u.investorId };
  const [loi, steps] = await Promise.all([
    db.loi.findUnique({ where: { projectId_investorId: where } }),
    db.dealStep.findMany({ where }),
  ]);
  const nda = steps.find((x) => x.step === "NDA");
  const diligence = steps.find((x) => x.step === "DILIGENCE");
  const masterNda = !!u.investor?.ndaSigned;
  const stage = investorStage({ masterNda, nda: nda?.status as StepStatus | undefined, loi: loi?.status as StepStatus | undefined, diligence: diligence?.status as StepStatus | undefined });
  return { stage, nda, loi, diligence, masterNda };
}

/** Did this referral agent originate the listing (it belongs to a developer company they brought to DEAC)? */
export async function isOriginator(agentId: string, projectId: string) {
  return (await db.project.count({ where: { AND: [{ id: projectId }, agentProjectWhere(agentId)] } })) > 0;
}
