import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { COOKIE, readToken, signSession, type Session } from "./session";

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

/** Approved investor (or admin, who can preview everything). */
export async function requireMember() {
  const u = await currentUser();
  if (!u) redirect("/login");
  if (u.role === "ADMIN") return u;
  if (u.role !== "INVESTOR" || u.status !== "APPROVED") redirect("/pending");
  return u;
}

export async function hasDataRoomAccess(projectId: string, investorId?: string | null) {
  if (!investorId) return false;
  const loi = await db.loi.findUnique({ where: { projectId_investorId: { projectId, investorId } } });
  return loi?.status === "APPROVED";
}
