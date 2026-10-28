import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { COOKIE, readToken, signSession, type Session } from "./session";
import { staffLevel } from "./tasks";
import { investorStage, type Stage, type StepStatus } from "./disclosure";

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

/** Approved investor (or admin, who can preview everything). */
export async function requireMember() {
  const u = await currentUser();
  if (!u) redirect("/login");
  if (u.role === "ADMIN") return u;
  if (u.role !== "INVESTOR" || u.status !== "APPROVED") redirect("/pending");
  return u;
}

/** Where an investor stands on one listing. Admins see everything. */
export async function listingAccess(projectId: string, u: { role: string; investorId: string | null; investor?: { ndaSigned: boolean } | null }) {
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
