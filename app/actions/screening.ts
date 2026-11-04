"use server";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { importerEnabled } from "@/lib/extract";
import { storageMode } from "@/lib/storage";
import { generatedFolder, putGeneratedFile } from "@/lib/generated-files";
import { documentPdf } from "@/lib/wizard-export";
import { runScreening } from "@/lib/screening-run";
import { getScreeningTemplate } from "@/lib/screening-db";
import {
  DECISIONS, EMPTY_TEAM, effectiveRunStatus, isAnswerStatus, normalizeTemplate, parseAnswers, questionsFor, screeningMarkdown,
  type Decision, type ScreeningOptions,
} from "@/lib/screening";

type Result = { error?: string; ok?: string };

const paths = (projectId: string) => {
  revalidatePath(`/admin/projects/${projectId}/screening`);
  revalidatePath("/admin/screening");
};

// ---------- template ----------

export async function saveScreeningTemplate(_: Result | undefined, f: FormData): Promise<Result> {
  const admin = await requireAdmin();
  let t;
  try { t = normalizeTemplate(JSON.parse(String(f.get("config") ?? ""))); } catch { return { error: "Could not read the template. Reload the page and try again." }; }
  const n = t.categories.reduce((s, c) => s + c.questions.length, 0);
  if (!n) return { error: "Add at least one question." };
  const config = JSON.stringify(t);
  await db.screeningTemplate.upsert({ where: { id: "default" }, create: { id: "default", config, updatedBy: admin.name }, update: { config, updatedBy: admin.name } });
  revalidatePath("/admin/screening/template");
  revalidatePath("/admin/screening");
  return { ok: `Template saved: ${t.categories.length} categor${t.categories.length === 1 ? "y" : "ies"}, ${n} question${n === 1 ? "" : "s"}.` };
}

// ---------- a project's screening ----------

const NOT_SET_UP = "AI research needs an Anthropic API key: add ANTHROPIC_API_KEY in Vercel → Settings → Environment Variables, then redeploy. You can still fill in the screening by hand.";

/** Starts Claude's pre-research. It works after the response, so the page can show progress. Team answers are kept. */
export async function startScreening(input: { projectId: string; fileIds: string[]; options: ScreeningOptions }): Promise<Result> {
  const admin = await requireAdmin();
  if (!importerEnabled()) return { error: NOT_SET_UP };
  const project = await db.project.findUnique({ where: { id: input.projectId }, select: { id: true, screening: { select: { status: true, startedAt: true, updatedAt: true } } } });
  if (!project) return { error: "Project not found." };
  if (project.screening && effectiveRunStatus(project.screening.status, project.screening.startedAt ?? project.screening.updatedAt) === "RUNNING") return { error: "Claude is already researching this project." };
  const files = await db.dataRoomFile.findMany({ where: { projectId: project.id, id: { in: input.fileIds } }, select: { id: true } });
  const ids = input.fileIds.filter((id) => files.some((f) => f.id === id));
  const options: ScreeningOptions = { webResearch: !!input.options.webResearch, notes: String(input.options.notes ?? "").slice(0, 20000) };
  const data = {
    status: "RUNNING", error: null, startedAt: new Date(), ranBy: admin.name, updatedBy: admin.name,
    options: JSON.stringify(options), sourceIds: JSON.stringify(ids), sourceNotes: "[]",
    ...(options.webResearch ? {} : { researchNotes: "", webSources: "[]" }),
  };
  const s = await db.screening.upsert({ where: { projectId: project.id }, create: { projectId: project.id, ...data }, update: data });
  after(() => runScreening(s.id));
  paths(project.id);
  return {};
}

async function screeningFor(projectId: string, by: string) {
  return db.screening.upsert({ where: { projectId }, create: { projectId, updatedBy: by }, update: {} });
}

/** Saves the team's answer to one question (overrides Claude's). */
export async function saveScreeningAnswer(projectId: string, questionId: string, team: { status: string; answer: string; verified: boolean }): Promise<Result> {
  const admin = await requireAdmin();
  if (!/^[a-z0-9-]{1,80}$/.test(questionId)) return { error: "Unknown question." };
  const s = await screeningFor(projectId, admin.name);
  const answers = parseAnswers(s.answers);
  const next = { status: isAnswerStatus(team.status) ? team.status : "", answer: String(team.answer ?? "").slice(0, 10000), verified: !!team.verified } as const;
  answers[questionId] = { ai: answers[questionId]?.ai ?? null, team: next.status || next.answer.trim() || next.verified ? next : EMPTY_TEAM };
  await db.screening.update({ where: { id: s.id }, data: { answers: JSON.stringify(answers), updatedBy: admin.name } });
  paths(projectId);
  return {};
}

export async function saveScreeningDecision(projectId: string, decision: string, note: string): Promise<Result> {
  const admin = await requireAdmin();
  if (!DECISIONS.includes(decision as Decision)) return { error: "Pick a decision." };
  const s = await screeningFor(projectId, admin.name);
  await db.screening.update({ where: { id: s.id }, data: { decision, decisionNote: String(note ?? "").slice(0, 5000), updatedBy: admin.name } });
  paths(projectId);
  return { ok: "Decision saved." };
}

/** Saves the screening as a PDF report in the data room (replaces the earlier one, keeping its file id). */
export async function saveScreeningReport(projectId: string): Promise<Result & { url?: string }> {
  const admin = await requireAdmin();
  if (storageMode() === "missing") return { error: "File storage isn't connected yet. See the data room page for the one-time setup." };
  const p = await db.project.findUnique({ where: { id: projectId }, select: { id: true, code: true, title: true, country: true, screening: true } });
  if (!p?.screening) return { error: "Nothing to save yet." };
  const s = p.screening;
  const cats = questionsFor(await getScreeningTemplate(), p.country);
  const md = screeningMarkdown(cats, parseAnswers(s.answers), {
    code: p.code, title: p.title, summary: s.summary, redFlags: JSON.parse(s.redFlags), decision: s.decision as Decision, decisionNote: s.decisionNote, webSources: JSON.parse(s.webSources),
  });
  try {
    const pdf = await documentPdf(md, { kindLabel: "Project Screening", code: p.code });
    const folderId = await generatedFolder(p.id, /screening|report|analysis/i, "09 Reports & Analysis");
    const fileId = await putGeneratedFile(p.id, s.fileId, folderId, `${p.code} Project Screening.pdf`, pdf, "application/pdf", admin.name);
    await db.screening.update({ where: { id: s.id }, data: { fileId, savedAt: new Date() } });
    paths(p.id);
    revalidatePath(`/admin/projects/${p.id}/data-room`);
    return { ok: "Saved to the data room as PDF.", url: `/api/data-room/files/${fileId}` };
  } catch (e) {
    console.error("Saving screening report failed", e);
    return { error: e instanceof Error ? e.message : "Couldn't save the file." };
  }
}
