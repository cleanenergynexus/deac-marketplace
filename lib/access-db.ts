import "server-only";
import { db } from "./db";
import { sendEmail } from "./email";
import { touchInterest } from "./investor-crm-db";
import { atLeast, investorStage, stageRank, STAGE_INFO, type Stage, type StepStatus } from "./disclosure";

/**
 * Opens a listing up to `target` for an investor: confirms any pending NDA / LOI / diligence step at or below it and
 * records the target step as confirmed when it's missing. Never lowers access. Used when the team moves an Investor
 * CRM tile (e.g. to "NDA Signed"), so the board, the listing and the contact record stay in step.
 * Returns the new stage when access went up, otherwise null.
 */
export async function confirmListingAccess(investorId: string, projectId: string, target: Exclude<Stage, "TEASER">, by: string): Promise<Stage | null> {
  const [inv, loi, steps, p] = await Promise.all([
    db.investor.findUnique({ where: { id: investorId }, select: { name: true, email: true, ndaSigned: true } }),
    db.loi.findUnique({ where: { projectId_investorId: { projectId, investorId } } }),
    db.dealStep.findMany({ where: { projectId, investorId } }),
    db.project.findUnique({ where: { id: projectId }, select: { code: true, title: true } }),
  ]);
  if (!inv || !p) return null;
  const nda = steps.find((s) => s.step === "NDA");
  const dil = steps.find((s) => s.step === "DILIGENCE");
  const before = investorStage({ masterNda: inv.ndaSigned, nda: nda?.status as StepStatus, loi: loi?.status as StepStatus, diligence: dil?.status as StepStatus });
  const now = new Date();
  const want = (s: Stage) => stageRank(s) <= stageRank(target);
  const approveStep = async (step: "NDA" | "DILIGENCE", row: typeof nda) => {
    if (row?.status === "APPROVED") return;
    if (row) await db.dealStep.update({ where: { id: row.id }, data: { status: "APPROVED", reviewedAt: now } });
    else if (target === step) await db.dealStep.create({ data: { projectId, investorId, step, status: "APPROVED", reviewedAt: now, signerName: `Confirmed by ${by}` } });
  };
  if (want("NDA")) await approveStep("NDA", nda);
  if (want("LOI") && loi?.status !== "APPROVED") {
    if (loi) await db.loi.update({ where: { id: loi.id }, data: { status: "APPROVED", reviewedAt: now } });
    else if (target === "LOI") await db.loi.create({ data: { projectId, investorId, status: "APPROVED", reviewedAt: now } });
  }
  if (want("DILIGENCE")) await approveStep("DILIGENCE", dil);

  const after = atLeast(before, target) ? before : target;
  if (after === before) return null;
  await db.activity.create({ data: { investorId, projectId, kind: "SYSTEM", by, body: `Access to ${p.code} opened to ${STAGE_INFO[after].label} (Investor CRM stage).` } });
  await touchInterest(investorId, projectId, after === "DILIGENCE" ? "DILIGENCE" : after === "LOI" ? "LOI_APPROVED" : "NDA", by);
  const what = after === "NDA" ? "Your NDA has been confirmed. The confidential project details and NDA-level documents are now open, and you can submit a letter of interest." : after === "LOI" ? "Your letter of interest has been accepted. The LOI-level details and documents are now open." : "Full diligence access is confirmed. The complete data room is now open.";
  await sendEmail({ to: inv.email, subject: `${p.code}: ${STAGE_INFO[after].label}`, text: `Hi ${inv.name},\n\n${what}\n\nOpen ${p.title} in your DEAC Marketplace portal to continue.\n\n— DEAC Team` });
  return after;
}
