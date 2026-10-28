"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { isLogKind, parseWhen } from "@/lib/crm";
import { addressFromForm } from "@/lib/address";
import { getTeam, pickAssignee } from "@/lib/tasks-db";
import { STEP_SOURCE, STEP_STAGE, advanceStage } from "@/lib/investor-crm";
import { DEFAULT_INVESTOR_PIPELINE, funnelStages, normalizePipeline, pipelineLabel, placeStage, type PipelineConfig } from "@/lib/pipeline";
import { getInvestorPipeline, PIPELINE_ROW } from "@/lib/pipeline-db";
import { INVESTOR_TYPES } from "@/lib/constants";

const s = (f: FormData, k: string) => (f.get(k) as string | null)?.trim() || null;
const n = (f: FormData, k: string) => { const v = s(f, k); return v ? Number(v.replace(/[$,%]/g, "")) : null; };

function revalidateInvestorCrm(investorId?: string | null, firmId?: string | null) {
  revalidatePath("/admin/investors", "layout");
  if (investorId) revalidatePath(`/admin/investors/${investorId}`);
  if (firmId) revalidatePath(`/admin/investors/companies/${firmId}`);
}

// ---------- Companies (investor firms) ----------
function firmData(f: FormData) {
  const type = s(f, "investorType");
  return {
    ...addressFromForm(f),
    name: (s(f, "name") ?? "").replace(/\s+/g, " "),
    investorType: type && (INVESTOR_TYPES as readonly string[]).includes(type) ? type : null,
    website: s(f, "website"),
    linkedin: s(f, "linkedin"),
    aum: n(f, "aum"),
    source: s(f, "source"),
    owner: s(f, "owner"),
    notes: s(f, "notes"),
  };
}

export async function createFirm(f: FormData) {
  const admin = await requireAdmin();
  const data = firmData(f);
  if (!data.name) throw new Error("Enter the company name.");
  if (await db.investorFirm.count({ where: { name: { equals: data.name, mode: "insensitive" } } })) throw new Error(`${data.name} is already in the Investor CRM.`);
  const firm = await db.investorFirm.create({ data: { ...data, owner: data.owner ?? admin.name } });
  revalidateInvestorCrm();
  redirect(`/admin/investors/companies/${firm.id}`);
}

/** Saves a firm. Its people keep the company name in Investor.firm too, for emails and older screens. */
export async function updateFirm(f: FormData) {
  await requireAdmin();
  const id = String(f.get("id"));
  const data = firmData(f);
  if (!data.name) throw new Error("Enter the company name.");
  await db.investorFirm.update({ where: { id }, data });
  await db.investor.updateMany({ where: { firmId: id }, data: { firm: data.name } });
  revalidateInvestorCrm(null, id);
}

/** Removes a firm. Its people stay in the CRM with no company. */
export async function deleteFirm(f: FormData) {
  await requireAdmin();
  const id = String(f.get("id"));
  await db.investor.updateMany({ where: { firmId: id }, data: { firm: null } });
  await db.investorFirm.delete({ where: { id } });
  revalidateInvestorCrm();
  redirect("/admin/investors/companies");
}

// ---------- Listings an investor is working (board tiles) ----------
async function stagesFor(projectId: string) {
  const p = await db.project.findUniqueOrThrow({ where: { id: projectId }, select: { dealType: true, code: true, title: true } });
  return { p, stages: funnelStages(await getInvestorPipeline(), p.dealType) };
}

/** Links one investor to a listing (or several investors to one listing, from the listing view). */
export async function addInterest(f: FormData) {
  const admin = await requireAdmin();
  const projectId = String(f.get("projectId") ?? "");
  const ids = f.getAll("investorId").map(String).filter(Boolean);
  if (!projectId || !ids.length) throw new Error("Pick a listing and an investor.");
  const { p, stages } = await stagesFor(projectId);
  const picked = s(f, "stage");
  // A chosen starting column (e.g. "Teaser Sent"), otherwise "Interested" (or the funnel's first column).
  const stage = picked && stages.some((x) => x.value === picked) ? picked : advanceStage(stages, null, STEP_STAGE.ADDED);
  const linked = new Set((await db.investorInterest.findMany({ where: { projectId, investorId: { in: ids } }, select: { investorId: true } })).map((r) => r.investorId));
  for (const investorId of ids.filter((i) => !linked.has(i))) {
    await db.investorInterest.create({ data: { investorId, projectId, stage, source: STEP_SOURCE.ADDED } });
    await db.activity.create({ data: { investorId, projectId, kind: "STAGE", body: `Linked to ${p.code} (${p.title}) · ${pipelineLabel(stages, stage)}`, by: admin.name } });
  }
  revalidateInvestorCrm(ids.length === 1 ? ids[0] : null);
}

/** Moves one investor-listing tile on the Investor CRM board. */
export async function setInterestStage(f: FormData) {
  const admin = await requireAdmin();
  const id = String(f.get("id"));
  const stage = String(f.get("stage"));
  const row = await db.investorInterest.findUniqueOrThrow({ where: { id } });
  const { p, stages } = await stagesFor(row.projectId);
  if (!stages.some((x) => x.value === stage)) throw new Error("That stage isn't in this deal type's funnel.");
  if (row.stage === stage) return;
  await db.investorInterest.update({ where: { id }, data: { stage } });
  await db.activity.create({ data: { investorId: row.investorId, projectId: row.projectId, kind: "STAGE", body: `${p.code} (${p.title}) stage → ${pipelineLabel(stages, stage)}`, by: admin.name } });
  revalidateInvestorCrm(row.investorId);
}

/** Unlinks an investor from a listing. Their NDA / LOI history stays; the tile can be added back later. */
export async function removeInterest(f: FormData) {
  const admin = await requireAdmin();
  const row = await db.investorInterest.delete({ where: { id: String(f.get("id")) }, include: { project: { select: { code: true } } } });
  await db.activity.create({ data: { investorId: row.investorId, projectId: row.projectId, kind: "SYSTEM", body: `Removed from ${row.project.code} on the Investor CRM board.`, by: admin.name } });
  revalidateInvestorCrm(row.investorId);
}

// ---------- Timeline ----------
/** Logs a note, email, call, meeting or task against an investor contact (same timeline as the Developer CRM). */
export async function logInvestorActivity(f: FormData) {
  const admin = await requireAdmin();
  const investorId = String(f.get("investorId"));
  const kind = s(f, "kind");
  if (!isLogKind(kind)) throw new Error("Pick what you're logging.");
  const inv = await db.investor.findUniqueOrThrow({ where: { id: investorId }, select: { id: true, firmId: true } });
  const subject = s(f, "subject");
  const body = s(f, "body") ?? "";
  if (kind === "TASK" ? !subject : !body && !subject) throw new Error(kind === "TASK" ? "Give the task a title." : "Write something to log.");
  const tz = Number(f.get("tz") ?? 0);
  const when = parseWhen(s(f, "when"), tz);
  const projectId = s(f, "projectId");
  if (projectId && !(await db.project.count({ where: { id: projectId } }))) throw new Error("That listing no longer exists.");
  const assigneeId = kind === "TASK" ? pickAssignee(admin, await getTeam(), f.get("assigneeId")) : null;
  const createdAt = when && kind !== "TASK" ? when : new Date();
  await db.activity.create({
    data: {
      investorId, projectId, kind, subject, body,
      outcome: kind === "CALL" || kind === "EMAIL" ? s(f, "outcome") : null,
      dueAt: kind === "TASK" ? parseWhen(s(f, "dueAt"), tz) : null,
      assigneeId, by: admin.name, createdAt,
    },
  });
  if (kind !== "TASK") await db.investor.update({ where: { id: investorId }, data: { lastContactAt: createdAt } });
  revalidateInvestorCrm(investorId, inv.firmId);
  if (kind === "TASK") revalidatePath("/admin", "layout");
}

// ---------- Funnels ----------
type PipelineState = { error?: string; ok?: string; config?: PipelineConfig } | undefined;

/** Saves the Investor CRM columns per deal type. Tiles in a removed column move to the first column of their funnel. */
export async function saveInvestorPipeline(_: PipelineState, f: FormData): Promise<PipelineState> {
  const admin = await requireAdmin();
  let cfg: PipelineConfig;
  try { cfg = normalizePipeline(JSON.parse(String(f.get("config") ?? "")), DEFAULT_INVESTOR_PIPELINE); } catch { return { error: "Could not read the funnels. Reload the page and try again." }; }
  const config = JSON.stringify(cfg);
  const id = PIPELINE_ROW.investor;
  await db.pipelineSettings.upsert({ where: { id }, create: { id, config, updatedBy: admin.name }, update: { config, updatedBy: admin.name } });
  const rows = await db.investorInterest.findMany({ select: { id: true, stage: true, project: { select: { dealType: true } } } });
  let moved = 0;
  for (const r of rows) {
    const now = placeStage(funnelStages(cfg, r.project.dealType), r.stage);
    if (now === r.stage) continue;
    await db.investorInterest.update({ where: { id: r.id }, data: { stage: now } });
    moved++;
  }
  revalidatePath("/admin", "layout");
  return { config: cfg, ok: `Funnels saved.${moved ? ` ${moved} tile${moved === 1 ? "" : "s"} moved to a first column because their column was removed.` : ""}` };
}
