"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { listingAccess, requireMember } from "@/lib/auth";
import { atLeast } from "@/lib/disclosure";
import { touchInterest } from "@/lib/investor-crm-db";

const s = (f: FormData, k: string) => (f.get(k) as string | null)?.trim() || null;

export async function submitLoi(_: unknown, f: FormData) {
  const u = await requireMember();
  if (!u.investorId) return { error: "Only investor accounts can submit a letter of interest." };
  const projectId = String(f.get("projectId"));
  const access = await listingAccess(projectId, u);
  if (!atLeast(access.stage, "NDA")) return { error: "Your NDA for this project needs to be confirmed before you can submit a letter of interest." };
  if (access.loi?.status === "APPROVED") return { error: "Your letter of interest has already been accepted." };
  const amount = s(f, "amount");
  await db.loi.upsert({
    where: { projectId_investorId: { projectId, investorId: u.investorId } },
    create: { projectId, investorId: u.investorId, amount: amount ? Number(amount.replace(/[$,]/g, "")) : null, structure: s(f, "structure"), timeline: s(f, "timeline"), message: s(f, "message") },
    update: { amount: amount ? Number(amount.replace(/[$,]/g, "")) : null, structure: s(f, "structure"), timeline: s(f, "timeline"), message: s(f, "message"), status: "PENDING" },
  });
  const p = await db.project.findUnique({ where: { id: projectId } });
  await db.activity.create({ data: { investorId: u.investorId, projectId, kind: "SYSTEM", body: `Submitted letter of interest for ${p?.code}.` } });
  await touchInterest(u.investorId, projectId, "LOI");
  revalidatePath(`/marketplace/${projectId}`);
  return { ok: true };
}

/** Investor signs the project NDA (click-through). The DEAC team confirms it to unlock the NDA stage. */
export async function submitNda(_: unknown, f: FormData) {
  const u = await requireMember();
  if (!u.investorId) return { error: "Only investor accounts can sign an NDA." };
  const projectId = String(f.get("projectId"));
  const signerName = s(f, "signerName");
  if (!signerName) return { error: "Type your full name to sign." };
  if (f.get("agree") !== "on") return { error: "Please confirm you agree to the confidentiality terms." };
  const access = await listingAccess(projectId, u);
  if (access.stage !== "TEASER") return { error: "Your NDA for this project is already on file." };
  const where = { projectId_investorId_step: { projectId, investorId: u.investorId, step: "NDA" } };
  const data = { signerName, signerTitle: s(f, "signerTitle"), status: "PENDING", reviewedAt: null };
  await db.dealStep.upsert({ where, create: { projectId, investorId: u.investorId, step: "NDA", ...data }, update: data });
  const p = await db.project.findUnique({ where: { id: projectId } });
  await db.activity.create({ data: { investorId: u.investorId, projectId, kind: "SYSTEM", body: `Signed NDA for ${p?.code} as ${signerName}; awaiting confirmation.` } });
  await touchInterest(u.investorId, projectId, "NDA");
  revalidatePath(`/marketplace/${projectId}`);
  return { ok: true };
}

/** After an accepted LOI, the investor confirms continued interest and asks for the full data room. */
export async function requestDiligence(_: unknown, f: FormData) {
  const u = await requireMember();
  if (!u.investorId) return { error: "Only investor accounts can request diligence access." };
  const projectId = String(f.get("projectId"));
  const access = await listingAccess(projectId, u);
  if (access.stage !== "LOI") return { error: access.stage === "DILIGENCE" ? "Full diligence access is already open." : "Your letter of interest needs to be accepted first." };
  const where = { projectId_investorId_step: { projectId, investorId: u.investorId, step: "DILIGENCE" } };
  const data = { message: s(f, "message"), status: "PENDING", reviewedAt: null };
  await db.dealStep.upsert({ where, create: { projectId, investorId: u.investorId, step: "DILIGENCE", ...data }, update: data });
  const p = await db.project.findUnique({ where: { id: projectId } });
  await db.activity.create({ data: { investorId: u.investorId, projectId, kind: "SYSTEM", body: `Confirmed interest in ${p?.code} and requested full diligence access.` } });
  revalidatePath(`/marketplace/${projectId}`);
  return { ok: true };
}

export async function submitAnalysisRequest(_: unknown, f: FormData) {
  const u = await requireMember();
  if (!u.investorId) return { error: "Only investor accounts can submit an intake form." };
  const projectId = String(f.get("projectId"));
  await db.analysisRequest.create({
    data: { projectId, investorId: u.investorId, focusAreas: f.getAll("focusAreas").map(String).join(","), returnMetric: s(f, "returnMetric"), holdPeriod: s(f, "holdPeriod"), format: s(f, "format"), questions: s(f, "questions") },
  });
  await touchInterest(u.investorId, projectId, "INTAKE");
  revalidatePath(`/marketplace/${projectId}`);
  return { ok: true };
}
