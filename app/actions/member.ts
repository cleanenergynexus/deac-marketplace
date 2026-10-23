"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/auth";

const s = (f: FormData, k: string) => (f.get(k) as string | null)?.trim() || null;

export async function submitLoi(_: unknown, f: FormData) {
  const u = await requireMember();
  if (!u.investorId) return { error: "Only investor accounts can submit a letter of interest." };
  const projectId = String(f.get("projectId"));
  const amount = s(f, "amount");
  await db.loi.upsert({
    where: { projectId_investorId: { projectId, investorId: u.investorId } },
    create: { projectId, investorId: u.investorId, amount: amount ? Number(amount.replace(/[$,]/g, "")) : null, structure: s(f, "structure"), timeline: s(f, "timeline"), message: s(f, "message") },
    update: { amount: amount ? Number(amount.replace(/[$,]/g, "")) : null, structure: s(f, "structure"), timeline: s(f, "timeline"), message: s(f, "message"), status: "PENDING" },
  });
  const p = await db.project.findUnique({ where: { id: projectId } });
  await db.activity.create({ data: { investorId: u.investorId, kind: "SYSTEM", body: `Submitted letter of interest for ${p?.code}.` } });
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
  revalidatePath(`/marketplace/${projectId}`);
  return { ok: true };
}
