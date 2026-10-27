"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { checkPassword, hashPassword, requireAdmin } from "@/lib/auth";
import { DEFAULT_INPUTS, evaluate, parseInputs, type ValuationInputs } from "@/lib/valuation";
import { sendEmail } from "@/lib/email";
import { marketMatches, marketsOverlap } from "@/lib/regions";
import { parseDocRows, planDocChanges } from "@/lib/documents";
import { isStage, SECTIONS, STAGE_INFO, stageRank, type Stage } from "@/lib/disclosure";
import { DEVELOPER_STAGES, stageLabel } from "@/lib/constants";

const csvList = (v: string) => v.split(",").map((x) => x.trim()).filter(Boolean);

const s = (f: FormData, k: string) => (f.get(k) as string | null)?.trim() || null;
const n = (f: FormData, k: string) => { const v = s(f, k); return v ? Number(v.replace(/[$,%]/g, "")) : null; };
const list = (f: FormData, k: string) => f.getAll(k).map(String).filter(Boolean).join(",");

// ---------- Investors ----------
function investorData(f: FormData) {
  return {
    name: s(f, "name") ?? "",
    firm: s(f, "firm"),
    title: s(f, "title"),
    phone: s(f, "phone"),
    investorType: s(f, "investorType"),
    checkMin: n(f, "checkMin"),
    checkMax: n(f, "checkMax"),
    mwMin: n(f, "mwMin"),
    mwMax: n(f, "mwMax"),
    preferredStates: list(f, "states"),
    preferredRegions: list(f, "regions"),
    dealTypes: list(f, "dealTypes"),
    facilityTypes: list(f, "facilityTypes"),
    accredited: f.get("accredited") === "on",
    ndaSigned: f.get("ndaSigned") === "on",
    source: s(f, "source"),
    tags: s(f, "tags") ?? "",
    owner: s(f, "owner"),
    notes: s(f, "notes"),
  };
}

export async function createInvestor(f: FormData) {
  await requireAdmin();
  const email = s(f, "email")!.toLowerCase();
  const inv = await db.investor.create({ data: { email, stage: s(f, "stage") ?? "PROSPECT", ...investorData(f) } });
  redirect(`/admin/investors/${inv.id}`);
}

export async function updateInvestor(f: FormData) {
  await requireAdmin();
  const id = String(f.get("id"));
  await db.investor.update({ where: { id }, data: investorData(f) });
  revalidatePath(`/admin/investors/${id}`);
}

export async function setInvestorStage(f: FormData) {
  const admin = await requireAdmin();
  const id = String(f.get("id"));
  const stage = String(f.get("stage"));
  const inv = await db.investor.update({ where: { id }, data: { stage }, include: { user: true } });
  await db.activity.create({ data: { investorId: id, kind: "STAGE", body: `Stage → ${stage}`, by: admin.name } });
  // Approving the CRM record also approves their login (and declining revokes it).
  if (inv.user && (stage === "APPROVED" || stage === "ACTIVE")) {
    const wasPending = inv.user.status !== "APPROVED";
    await db.user.update({ where: { id: inv.user.id }, data: { status: "APPROVED" } });
    if (wasPending)
      await sendEmail({ to: inv.email, subject: "Your DEAC Marketplace membership is approved", text: `Hi ${inv.name.split(" ")[0]},\n\nWelcome to the DEAC private investor network. Your membership is approved and the full portfolio is now open to you.\n\nSign in: ${process.env.PUBLIC_APP_URL ?? ""}/login\n\n— DEAC Team` });
  }
  if (inv.user && stage === "DECLINED") await db.user.update({ where: { id: inv.user.id }, data: { status: "REJECTED" } });
  revalidatePath(`/admin/investors/${id}`);
  revalidatePath("/admin", "layout");
}

export async function logActivity(f: FormData) {
  const admin = await requireAdmin();
  const investorId = s(f, "investorId");
  const developerId = s(f, "developerId");
  const body = s(f, "body");
  if (!body) return;
  await db.activity.create({ data: { investorId, developerId, kind: s(f, "kind") ?? "NOTE", body, by: admin.name } });
  if (investorId) {
    await db.investor.update({ where: { id: investorId }, data: { lastContactAt: new Date() } });
    revalidatePath(`/admin/investors/${investorId}`);
  }
  if (developerId) revalidatePath(`/admin/developers/${developerId}`);
}

/** CSV import: header row with any of name,email,firm,title,phone,investorType,states,source,tags */
export async function importInvestors(f: FormData) {
  await requireAdmin();
  const file = f.get("file") as File | null;
  const text = file && file.size ? await file.text() : String(f.get("csv") ?? "");
  const rows = parseCsv(text);
  if (rows.length < 2) return;
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (r: string[], k: string) => { const i = header.indexOf(k.toLowerCase()); return i >= 0 ? r[i]?.trim() || null : null; };
  let created = 0;
  for (const r of rows.slice(1)) {
    const email = col(r, "email")?.toLowerCase();
    if (!email) continue;
    const exists = await db.investor.findUnique({ where: { email } });
    if (exists) continue;
    await db.investor.create({ data: { email, name: col(r, "name") ?? email, firm: col(r, "firm"), title: col(r, "title"), phone: col(r, "phone"), investorType: col(r, "investorType"), preferredStates: (col(r, "states") ?? "").replace(/[;| ]+/g, ","), source: col(r, "source") ?? "CSV import", tags: col(r, "tags") ?? "" } });
    created++;
  }
  redirect(`/admin/investors?imported=${created}`);
}

function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cur); out.push(row); row = []; cur = ""; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); out.push(row); }
  return out.filter((r) => r.some((x) => x.trim()));
}

// ---------- Developers ----------
function developerData(f: FormData) {
  return { company: s(f, "company") ?? "", contactName: s(f, "contactName") ?? "", email: (s(f, "email") ?? "").toLowerCase(), phone: s(f, "phone"), website: s(f, "website"), hq: s(f, "hq"), experience: s(f, "experience"), mwDelivered: n(f, "mwDelivered"), source: s(f, "source"), owner: s(f, "owner"), notes: s(f, "notes") };
}
export async function createDeveloper(f: FormData) {
  await requireAdmin();
  const d = await db.developer.create({ data: { ...developerData(f), stage: s(f, "stage") ?? "LEAD" } });
  redirect(`/admin/developers/${d.id}`);
}
export async function updateDeveloper(f: FormData) {
  await requireAdmin();
  const id = String(f.get("id"));
  await db.developer.update({ where: { id }, data: developerData(f) });
  revalidatePath(`/admin/developers/${id}`);
}
export async function setDeveloperStage(f: FormData) {
  const admin = await requireAdmin();
  const id = String(f.get("id"));
  const stage = String(f.get("stage"));
  await db.developer.update({ where: { id }, data: { stage } });
  await db.activity.create({ data: { developerId: id, kind: "STAGE", body: `Stage → ${stage}`, by: admin.name } });
  revalidatePath(`/admin/developers/${id}`);
  revalidatePath("/admin/developers");
}
/** Moves one project on the Developer CRM board. Each project advances on its own, so one can close while another is passed. */
export async function setProjectPipelineStage(f: FormData) {
  const admin = await requireAdmin();
  const id = String(f.get("id"));
  const stage = String(f.get("stage"));
  if (!DEVELOPER_STAGES.some((s) => s.value === stage)) throw new Error("Unknown stage.");
  const p = await db.project.update({ where: { id }, data: { pipelineStage: stage } });
  await db.activity.create({ data: { developerId: p.developerId, kind: "STAGE", body: `${p.code} (${p.title}) stage → ${stageLabel(DEVELOPER_STAGES, stage)}`, by: admin.name } });
  revalidatePath("/admin/developers");
  revalidatePath(`/admin/developers/${p.developerId}`);
  revalidatePath(`/admin/projects/${id}`);
}
export async function addTeamMember(f: FormData) {
  await requireAdmin();
  const developerId = String(f.get("developerId"));
  await db.teamMember.create({ data: { developerId, name: s(f, "name") ?? "", title: s(f, "title") ?? "", bio: s(f, "bio") ?? "", photoUrl: s(f, "photoUrl") } });
  revalidatePath(`/admin/developers/${developerId}`);
}
export async function deleteTeamMember(f: FormData) {
  await requireAdmin();
  const m = await db.teamMember.delete({ where: { id: String(f.get("id")) } });
  revalidatePath(`/admin/developers/${m.developerId}`);
}

// ---------- Projects / listings ----------
function projectData(f: FormData) {
  return {
    title: s(f, "title") ?? "",
    developerId: String(f.get("developerId")),
    state: (s(f, "state") ?? "").toUpperCase(),
    city: s(f, "city"),
    mw: n(f, "mw") ?? 0,
    facilityType: s(f, "facilityType") ?? "",
    dealType: s(f, "dealType") ?? "FINANCING",
    fundingNeeded: n(f, "fundingNeeded") ?? 0,
    projectStatus: s(f, "projectStatus") ?? "",
    summary: s(f, "summary") ?? "",
    highlights: s(f, "highlights") ?? "",
    term: s(f, "term"),
    dealStage: s(f, "dealStage") ?? "MARKETING",
    useOfFunds: s(f, "useOfFunds") ?? "",
    coverImageUrl: s(f, "coverImageUrl"),
    totalCapex: n(f, "totalCapex"),
    targetIrr: n(f, "targetIrr"),
    equityMultiple: n(f, "equityMultiple"),
    leaseRateKwMo: n(f, "leaseRateKwMo"),
    powerRateCents: n(f, "powerRateCents"),
    powerStatus: s(f, "powerStatus"),
    monthsToPower: n(f, "monthsToPower") ?? null,
    codDate: s(f, "codDate"),
    capitalStack: s(f, "capitalStack"),
    economicsNotes: s(f, "economicsNotes"),
    visibility: s(f, "visibility") ?? "DRAFT",
  };
}
/** New projects start at Lead on the CRM board unless the form picked another stage. */
function pipelineStageFrom(f: FormData) {
  const v = s(f, "pipelineStage");
  return v && DEVELOPER_STAGES.some((x) => x.value === v) ? v : "LEAD";
}
export async function createProject(f: FormData) {
  await requireAdmin();
  const data = projectData(f);
  const count = await db.project.count();
  const p = await db.project.create({ data: { ...data, monthsToPower: data.monthsToPower ?? undefined, pipelineStage: pipelineStageFrom(f), code: s(f, "code") ?? `DEAC-${data.state}-${String(count + 1).padStart(3, "0")}` } });
  redirect(`/admin/projects/${p.id}`);
}
/** Last step of the import wizard: saves the reviewed listing, creating the developer if it's new. */
export async function createImportedProject(f: FormData) {
  const admin = await requireAdmin();
  let developerId = String(f.get("developerId") ?? "");
  if (developerId === "__new__") {
    const company = s(f, "devCompany");
    if (!company) throw new Error("Enter the developer's company name.");
    const dev = await db.developer.create({
      data: { company, contactName: s(f, "devContactName") ?? company, email: s(f, "devEmail") ?? "", phone: s(f, "devPhone"), website: s(f, "devWebsite"), source: "Document import", stage: "LEAD", owner: admin.name },
    });
    developerId = dev.id;
  }
  f.set("developerId", developerId);
  const data = projectData(f);
  if (!data.state || !data.facilityType || !data.dealType || !data.projectStatus) throw new Error("State, facility type, deal type and project status are required.");

  // Scoring hints from the document, kept only if they are valid calculator values.
  let valuationInputs: string | null = null;
  try {
    const raw = JSON.parse(String(f.get("valuation") ?? "{}"));
    const clean = Object.fromEntries(Object.entries(raw).filter(([k, v]) => k in DEFAULT_INPUTS && typeof v === typeof DEFAULT_INPUTS[k as keyof ValuationInputs]));
    if (data.mw) clean.mw = data.mw;
    if (data.dealType === "SALE" && data.fundingNeeded) clean.askingPrice = data.fundingNeeded;
    if (Object.keys(clean).length) valuationInputs = JSON.stringify(clean);
  } catch { /* no hints */ }

  const count = await db.project.count();
  const p = await db.project.create({ data: { ...data, developerId, valuationInputs, pipelineStage: pipelineStageFrom(f), monthsToPower: data.monthsToPower ?? undefined, code: `DEAC-${data.state}-${String(count + 1).padStart(3, "0")}` } });
  const source = s(f, "sourceName");
  const contacts = s(f, "contactsNote");
  await db.activity.create({ data: { developerId, kind: "SYSTEM", by: admin.name, body: `${p.code} imported from ${source ?? "a document"}.${contacts ? ` Contacts in the document: ${contacts}` : ""}` } });
  revalidatePath("/admin/projects");
  redirect(`/admin/projects/${p.id}`);
}
export async function updateProject(f: FormData) {
  await requireAdmin();
  const id = String(f.get("id"));
  const data = projectData(f);
  await db.project.update({ where: { id }, data: { ...data, monthsToPower: data.monthsToPower ?? undefined } });
  // The editor sends the whole document list; make the project's documents match it.
  const rows = parseDocRows(f.get("documents"));
  if (rows) {
    const plan = planDocChanges(await db.document.findMany({ where: { projectId: id } }), rows);
    await db.$transaction([
      db.document.deleteMany({ where: { projectId: id, id: { in: plan.remove } } }),
      ...plan.update.map((r) => db.document.updateMany({ where: { id: r.id, projectId: id }, data: { name: r.name, url: r.url, access: r.access } })),
      ...plan.create.map((r) => db.document.create({ data: { projectId: id, name: r.name, url: r.url, access: r.access, category: "Other" } })),
    ]);
  }
  revalidatePath(`/admin/projects/${id}`);
  revalidatePath(`/marketplace/${id}`);
  revalidatePath("/marketplace");
}
/** Deletes a listing and everything attached to it. */
export async function deleteProject(f: FormData) {
  const admin = await requireAdmin();
  const id = String(f.get("id"));
  const p = await db.project.findUnique({ where: { id } });
  if (!p) redirect("/admin/projects");
  await db.$transaction([
    db.loi.deleteMany({ where: { projectId: id } }),
    db.analysisRequest.deleteMany({ where: { projectId: id } }),
    db.project.delete({ where: { id } }), // documents and NDA/diligence steps cascade
  ]);
  await db.activity.create({ data: { developerId: p.developerId, kind: "SYSTEM", by: admin.name, body: `Listing ${p.code} (${p.title}) deleted.` } });
  revalidatePath("/admin/projects");
  revalidatePath("/marketplace");
  redirect("/admin/projects");
}


/** Which listing sections each stage unlocks, plus the project NDA link. */
export async function saveDisclosure(f: FormData) {
  await requireAdmin();
  const id = String(f.get("projectId"));
  const map = Object.fromEntries(SECTIONS.map((x) => [x.key, isStage(f.get(x.key)) ? String(f.get(x.key)) : x.default]));
  await db.project.update({ where: { id }, data: { disclosure: JSON.stringify(map), ndaUrl: s(f, "ndaUrl") } });
  revalidatePath(`/admin/projects/${id}`);
  revalidatePath(`/marketplace/${id}`);
}

/** Admin sets an investor's stage on a listing directly (e.g. NDA signed offline). Lowering it revokes later steps. */
export async function grantStage(f: FormData) {
  const admin = await requireAdmin();
  const projectId = String(f.get("projectId"));
  const investorId = String(f.get("investorId"));
  const target = String(f.get("stage"));
  if (!isStage(target) || !investorId) return;
  const now = new Date();
  const want = (step: Stage) => (stageRank(step) <= stageRank(target) ? "APPROVED" : null);
  for (const step of ["NDA", "DILIGENCE"] as const) {
    const where = { projectId_investorId_step: { projectId, investorId, step } };
    const status = want(step);
    if (status) await db.dealStep.upsert({ where, create: { projectId, investorId, step, status, reviewedAt: now, signerName: `Confirmed by ${admin.name}` }, update: { status, reviewedAt: now } });
    else await db.dealStep.updateMany({ where: { projectId, investorId, step, status: "APPROVED" }, data: { status: "DECLINED", reviewedAt: now } });
  }
  if (want("LOI")) await db.loi.upsert({ where: { projectId_investorId: { projectId, investorId } }, create: { projectId, investorId, status: "APPROVED", reviewedAt: now }, update: { status: "APPROVED", reviewedAt: now } });
  else await db.loi.updateMany({ where: { projectId, investorId, status: "APPROVED" }, data: { status: "DECLINED", reviewedAt: now } });
  const p = await db.project.findUnique({ where: { id: projectId } });
  await db.activity.create({ data: { investorId, kind: "SYSTEM", by: admin.name, body: `Access to ${p?.code} set to ${STAGE_INFO[target].label}.` } });
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/marketplace/${projectId}`);
  revalidatePath("/admin/lois");
}

/** Saves calculator inputs + score to a project (lead scoring). */
export async function saveValuation(projectId: string, inputs: ValuationInputs) {
  await requireAdmin();
  const r = evaluate(inputs);
  const p = await db.project.update({ where: { id: projectId }, data: { valuationInputs: JSON.stringify(inputs), valueScore: r.score, adjustedValueMw: r.adjustedValueMw } });
  const dev = await db.developer.findUnique({ where: { id: p.developerId } });
  if (dev && ["LEAD", "SCREENING"].includes(dev.stage)) await db.developer.update({ where: { id: dev.id }, data: { stage: "SCORED" } });
  await db.activity.create({ data: { developerId: p.developerId, kind: "SYSTEM", body: `${p.code} scored ${r.score} (${r.recommendation.label}); market value $${Math.round(r.adjustedValueMw).toLocaleString()}/MW.` } });
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath("/admin/projects");
  return { score: r.score };
}
export async function getSavedInputs(projectId: string) {
  await requireAdmin();
  const p = await db.project.findUnique({ where: { id: projectId } });
  return parseInputs(p?.valuationInputs);
}

// ---------- LOIs & intake ----------
export async function reviewLoi(f: FormData) {
  const admin = await requireAdmin();
  const id = String(f.get("id"));
  const status = String(f.get("status")); // APPROVED | DECLINED
  const loi = await db.loi.update({ where: { id }, data: { status, reviewedAt: new Date() }, include: { project: true, investor: true } });
  await db.activity.create({ data: { investorId: loi.investorId, kind: "SYSTEM", body: `LOI for ${loi.project.code} ${status.toLowerCase()}${status === "APPROVED" ? " — LOI stage unlocked" : ""}.`, by: admin.name } });
  if (status === "APPROVED") {
    if (loi.investor.stage === "APPROVED") await db.investor.update({ where: { id: loi.investorId }, data: { stage: "ACTIVE" } });
    await sendEmail({ to: loi.investor.email, subject: `Data room access: ${loi.project.code}`, text: `Hi ${loi.investor.name},\n\nYour letter of interest for ${loi.project.title} (${loi.project.code}) has been accepted. The LOI-level details and documents are now open in your DEAC Marketplace portal. When you're ready to go deeper, confirm your interest on the listing to request the full data room.\n\n— DEAC Team` });
  }
  revalidatePath("/admin/lois");
  revalidatePath(`/marketplace/${loi.projectId}`);
}

/** Confirms or declines an NDA or full-diligence request. */
export async function reviewDealStep(f: FormData) {
  const admin = await requireAdmin();
  const status = String(f.get("status")); // APPROVED | DECLINED
  if (status !== "APPROVED" && status !== "DECLINED") return;
  const d = await db.dealStep.update({ where: { id: String(f.get("id")) }, data: { status, reviewedAt: new Date() }, include: { project: true, investor: true } });
  const what = d.step === "NDA" ? "NDA" : "full diligence access";
  await db.activity.create({ data: { investorId: d.investorId, kind: "SYSTEM", by: admin.name, body: `${what} for ${d.project.code} ${status.toLowerCase()}.` } });
  if (status === "APPROVED") {
    const next = d.step === "NDA"
      ? "Your NDA has been confirmed. The confidential project details and NDA-level documents are now open, and you can submit a letter of interest."
      : "Full diligence access is confirmed. The complete data room is now open.";
    await sendEmail({ to: d.investor.email, subject: `${d.project.code}: ${d.step === "NDA" ? "NDA confirmed" : "Data room fully open"}`, text: `Hi ${d.investor.name},\n\n${next}\n\nOpen ${d.project.title} in your DEAC Marketplace portal to continue.\n\n— DEAC Team` });
  }
  revalidatePath("/admin/lois");
  revalidatePath(`/marketplace/${d.projectId}`);
}

export async function updateAnalysisRequest(f: FormData) {
  await requireAdmin();
  await db.analysisRequest.update({ where: { id: String(f.get("id")) }, data: { status: String(f.get("status")), deliverableUrl: s(f, "deliverableUrl") } });
  revalidatePath("/admin/requests");
}

// ---------- Outreach ----------
export type Segment = { stages?: string[]; states?: string[]; regions?: string[]; dealTypes?: string[]; investorTypes?: string[]; tags?: string };

export async function segmentInvestors(seg: Segment) {
  await requireAdmin();
  const all = await db.investor.findMany({ where: seg.stages?.length ? { stage: { in: seg.stages } } : {} });
  const has = (csvField: string, wanted?: string[]) => !wanted?.length || csvField.split(",").some((x) => wanted.includes(x.trim()));
  return all.filter(
    (i) =>
      (!seg.regions?.length || marketsOverlap(csvList(i.preferredStates), csvList(i.preferredRegions), seg.regions)) &&
      (!seg.states?.length || seg.states.some((st) => marketMatches(csvList(i.preferredStates), csvList(i.preferredRegions), st))) &&
      has(i.dealTypes, seg.dealTypes) &&
      (!seg.investorTypes?.length || (i.investorType && seg.investorTypes.includes(i.investorType))) &&
      (!seg.tags || i.tags.toLowerCase().includes(seg.tags.toLowerCase())),
  );
}

export async function createCampaign(f: FormData) {
  await requireAdmin();
  const segment: Segment = { stages: f.getAll("stages").map(String), states: f.getAll("states").map(String), regions: f.getAll("regions").map(String), dealTypes: f.getAll("dealTypes").map(String), investorTypes: f.getAll("investorTypes").map(String), tags: s(f, "tags") ?? undefined };
  const c = await db.campaign.create({ data: { name: s(f, "name") ?? "Campaign", subject: s(f, "subject") ?? "", body: s(f, "body") ?? "", segment: JSON.stringify(segment) } });
  redirect(`/admin/outreach/${c.id}`);
}

export async function sendCampaign(f: FormData) {
  const admin = await requireAdmin();
  const c = await db.campaign.findUniqueOrThrow({ where: { id: String(f.get("id")) } });
  if (c.status === "SENT") return;
  const recipients = await segmentInvestors(JSON.parse(c.segment));
  for (const inv of recipients) {
    const fill = (t: string) => t.replaceAll("{{name}}", inv.name.split(" ")[0]).replaceAll("{{firm}}", inv.firm ?? "your firm");
    const res = await sendEmail({ to: inv.email, subject: fill(c.subject), text: fill(c.body) });
    await db.campaignRecipient.create({ data: { campaignId: c.id, investorId: inv.id, status: res.status, error: res.error } });
    await db.activity.create({ data: { investorId: inv.id, kind: "EMAIL", body: `Campaign: ${c.subject}`, by: admin.name } });
    await db.investor.update({ where: { id: inv.id }, data: { lastContactAt: new Date(), stage: inv.stage === "PROSPECT" ? "CONTACTED" : inv.stage } });
  }
  await db.campaign.update({ where: { id: c.id }, data: { status: "SENT", sentAt: new Date() } });
  revalidatePath(`/admin/outreach/${c.id}`);
}

// ---------- Team (DEAC admin logins) ----------
export async function addTeamAdmin(_: unknown, f: FormData) {
  const admin = await requireAdmin();
  const email = s(f, "email")?.toLowerCase();
  const name = s(f, "name");
  const password = String(f.get("password") ?? "");
  if (!email || !name || password.length < 10) return { error: "Name, email and a temporary password of at least 10 characters are required." };
  const existing = await db.user.findUnique({ where: { email } });
  if (existing && existing.role !== "ADMIN") return { error: "That email belongs to an investor or developer account. Use a different email for the team login." };
  if (existing) return { error: "That person is already on the team." };
  await db.user.create({ data: { email, name, passwordHash: await hashPassword(password), role: "ADMIN", status: "APPROVED" } });
  await sendEmail({ to: email, subject: "Your DEAC Marketplace team login", text: `Hi ${name.split(" ")[0]},\n\n${admin.name} added you to the DEAC Marketplace team.\n\nSign in at ${process.env.PUBLIC_APP_URL ?? ""}/login with this email. ${admin.name} will share your temporary password; please change it under My account after signing in.\n\n— DEAC Team` });
  revalidatePath("/admin/team");
  return { ok: true };
}

export async function removeTeamAdmin(f: FormData) {
  const admin = await requireAdmin();
  const id = String(f.get("id"));
  if (id === admin.id) return; // can't remove yourself
  if ((await db.user.count({ where: { role: "ADMIN" } })) <= 1) return; // always keep one admin
  await db.user.delete({ where: { id } });
  revalidatePath("/admin/team");
}

export async function changeOwnPassword(_: unknown, f: FormData) {
  const admin = await requireAdmin();
  const current = String(f.get("current") ?? "");
  const next = String(f.get("next") ?? "");
  if (next.length < 10) return { error: "New password must be at least 10 characters." };
  if (!(await checkPassword(current, admin.passwordHash))) return { error: "Current password is incorrect." };
  await db.user.update({ where: { id: admin.id }, data: { passwordHash: await hashPassword(next) } });
  return { ok: true };
}
