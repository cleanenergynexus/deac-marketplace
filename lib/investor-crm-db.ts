import "server-only";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { getTeam, visibleTaskWhere } from "@/lib/tasks-db";
import { getInvestorPipeline } from "@/lib/pipeline-db";
import { funnelStages, pipelineLabel } from "@/lib/pipeline";
import { STEP_SOURCE, STEP_STAGE, advanceStage, firmKey, stepFromHistory, type InterestStep } from "@/lib/investor-crm";

/** The firm with this name (any case), created if it doesn't exist yet. Empty name = no company. */
export async function firmIdFor(name: string | null | undefined, investorType?: string | null): Promise<string | null> {
  const key = name ? firmKey(name) : "";
  if (!key) return null;
  const clean = name!.replace(/\s+/g, " ").trim();
  const found = await db.investorFirm.findFirst({ where: { name: { equals: clean, mode: "insensitive" } }, select: { id: true } });
  if (found) return found.id;
  return (await db.investorFirm.create({ data: { name: clean, investorType: investorType ?? null } })).id;
}

/**
 * Investors saved before company records existed have their firm as free text. Links each one to an
 * InvestorFirm (creating it the first time) when a CRM page loads. Safe to call on every request.
 */
export async function ensureFirms() {
  const loose = await db.investor.findMany({ where: { firmId: null, firm: { not: null } }, select: { id: true, firm: true, investorType: true } });
  const byKey = new Map<string, typeof loose>();
  for (const i of loose) {
    const k = firmKey(i.firm ?? "");
    if (k) byKey.set(k, [...(byKey.get(k) ?? []), i]);
  }
  for (const group of byKey.values()) {
    const firmId = await firmIdFor(group[0].firm, group.find((i) => i.investorType)?.investorType);
    await db.investor.updateMany({ where: { id: { in: group.map((i) => i.id) } }, data: { firmId } });
  }
}

/**
 * Every investor who already has an NDA, LOI, diligence request or intake request on a listing gets a board tile
 * for it, placed by how far they got. Runs on CRM page loads; only creates tiles that are missing.
 */
export async function ensureInterests() {
  const [lois, steps, intake, have] = await Promise.all([
    db.loi.findMany({ select: { investorId: true, projectId: true, status: true } }),
    db.dealStep.findMany({ select: { investorId: true, projectId: true, step: true, status: true } }),
    db.analysisRequest.findMany({ select: { investorId: true, projectId: true } }),
    db.investorInterest.findMany({ select: { investorId: true, projectId: true } }),
  ]);
  const key = (x: { investorId: string; projectId: string }) => `${x.investorId}|${x.projectId}`;
  const exists = new Set(have.map(key));
  const missing = new Map<string, { investorId: string; projectId: string; nda?: string; loi?: string; diligence?: string; intake?: boolean }>();
  const at = (x: { investorId: string; projectId: string }) => {
    const k = key(x);
    if (exists.has(k)) return null;
    if (!missing.has(k)) missing.set(k, { investorId: x.investorId, projectId: x.projectId });
    return missing.get(k)!;
  };
  for (const l of lois) { const m = at(l); if (m) m.loi = l.status; }
  for (const s of steps) { const m = at(s); if (m) m[s.step === "NDA" ? "nda" : "diligence"] = s.status; }
  for (const r of intake) { const m = at(r); if (m) m.intake = true; }
  if (!missing.size) return;

  const pipeline = await getInvestorPipeline();
  const projects = new Map((await db.project.findMany({ where: { id: { in: [...missing.values()].map((m) => m.projectId) } }, select: { id: true, dealType: true } })).map((p) => [p.id, p]));
  for (const m of missing.values()) {
    const p = projects.get(m.projectId);
    if (!p) continue;
    const step = stepFromHistory(m);
    await db.investorInterest.create({ data: { investorId: m.investorId, projectId: m.projectId, stage: advanceStage(funnelStages(pipeline, p.dealType), null, STEP_STAGE[step]), source: STEP_SOURCE[step] } }).catch(() => null); // another request may have created it
  }
}

/**
 * Links an investor to a listing (a tile on the Investor CRM board), or moves their tile forward after a marketplace
 * step such as signing the NDA or submitting an LOI. Never moves a tile backwards. Logs a stage change when it moves.
 */
export async function touchInterest(investorId: string, projectId: string, step: InterestStep, by?: string | null) {
  const [pipeline, project, current] = await Promise.all([
    getInvestorPipeline(),
    db.project.findUnique({ where: { id: projectId }, select: { dealType: true, code: true, title: true } }),
    db.investorInterest.findUnique({ where: { investorId_projectId: { investorId, projectId } } }),
  ]);
  if (!project) return null;
  const stages = funnelStages(pipeline, project.dealType);
  const stage = advanceStage(stages, current?.stage, STEP_STAGE[step]);
  if (current && current.stage === stage) return current;
  const row = await db.investorInterest.upsert({
    where: { investorId_projectId: { investorId, projectId } },
    create: { investorId, projectId, stage, source: STEP_SOURCE[step] },
    update: { stage },
  });
  await db.activity.create({
    data: { investorId, projectId, kind: "STAGE", by: by ?? null, body: current ? `${project.code} (${project.title}) stage → ${pipelineLabel(stages, stage)}` : `Linked to ${project.code} (${project.title}) · ${pipelineLabel(stages, stage)}` },
  });
  return row;
}

const LOGGED = ["NOTE", "EMAIL", "CALL", "MEETING", "TASK"];

/**
 * Everything the Investor CRM lists need: firms, investor contacts with their listings, last touch and open tasks per
 * contact. Open task counts only include the tasks the signed-in team member may see.
 */
export async function loadInvestorCrm() {
  await ensureFirms();
  await ensureInterests();
  const [me, team] = await Promise.all([requireAdmin(), getTeam()]);
  const [firms, investors, touches, tasks] = await Promise.all([
    db.investorFirm.findMany({ orderBy: { name: "asc" } }),
    db.investor.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        user: { select: { status: true } },
        interests: { include: { project: { select: { id: true, code: true, title: true, mw: true, state: true, dealType: true, fundingNeeded: true, visibility: true } } }, orderBy: { createdAt: "asc" } },
      },
    }),
    db.activity.groupBy({ by: ["investorId"], where: { investorId: { not: null }, kind: { in: LOGGED } }, _max: { createdAt: true } }),
    db.activity.groupBy({ by: ["investorId"], where: { ...visibleTaskWhere(me, team), investorId: { not: null }, doneAt: null }, _count: true }),
  ]);
  const lastTouch = new Map(touches.map((t) => [t.investorId!, t._max.createdAt]));
  const openTasks = new Map(tasks.map((t) => [t.investorId!, t._count]));
  return { firms, investors, lastTouch, openTasks };
}
export type CrmInvestor = Awaited<ReturnType<typeof loadInvestorCrm>>["investors"][number];
