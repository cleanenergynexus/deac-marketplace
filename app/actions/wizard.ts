"use server";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { importerEnabled } from "@/lib/extract";
import { cleanName, uniqueName } from "@/lib/dataroom";
import { deleteStored, saveGenerated, storageMode } from "@/lib/storage";
import { runWizard } from "@/lib/wizard-run";
import { deckPdf, deckPptx, documentPdf } from "@/lib/wizard-export";
import { markdownTitle } from "@/lib/markdown";
import { KIND_INFO, effectiveStatus, isWizardKind, outputFileName, type WizardKind, type WizardOptions } from "@/lib/wizard";

type Result = { error?: string };

const paths = (projectId: string, docId?: string) => {
  revalidatePath(`/admin/projects/${projectId}/data-room`);
  revalidatePath(`/admin/projects/${projectId}/data-room/wizard`);
  if (docId) revalidatePath(`/admin/projects/${projectId}/data-room/wizard/${docId}`);
};

const NOT_SET_UP = "The Document Wizard needs an Anthropic API key: add ANTHROPIC_API_KEY in Vercel → Settings → Environment Variables, then redeploy.";

export type StartInput = { projectId: string; kind: string; title: string; fileIds: string[]; options: WizardOptions };

/** Starts writing a document. Claude works after the response, so the page can show progress. */
export async function startWizard(input: StartInput): Promise<Result & { id?: string }> {
  const admin = await requireAdmin();
  if (!importerEnabled()) return { error: NOT_SET_UP };
  if (!isWizardKind(input.kind)) return { error: "Pick a document type." };
  const kind: WizardKind = input.kind;
  const options: WizardOptions = {
    anonymous: !!input.options.anonymous,
    webResearch: !!input.options.webResearch,
    instructions: String(input.options.instructions ?? "").slice(0, 8000),
    audience: String(input.options.audience ?? "").slice(0, 300),
  };
  if (kind === "CUSTOM" && !options.instructions.trim()) return { error: "Describe the report you want in the brief." };
  const project = await db.project.findUnique({ where: { id: input.projectId }, select: { id: true, code: true } });
  if (!project) return { error: "Project not found." };
  const files = await db.dataRoomFile.findMany({ where: { projectId: project.id, id: { in: input.fileIds } }, select: { id: true } });
  const ids = input.fileIds.filter((id) => files.some((f) => f.id === id));
  if (!ids.length && !options.webResearch && kind !== "CUSTOM") return { error: "Pick at least one data room file, or turn on web research." };

  const title = cleanName(input.title) || (kind === "CUSTOM" ? "Custom report" : `${project.code} ${KIND_INFO[kind].label}`);
  const doc = await db.wizardDocument.create({
    data: { projectId: project.id, kind, title, options: JSON.stringify(options), sourceIds: JSON.stringify(ids), createdBy: admin.name },
  });
  after(() => runWizard(doc.id));
  paths(project.id);
  return { id: doc.id };
}

/** Writes the document again with the same files and settings (replaces the draft text). */
export async function regenerateWizard(docId: string): Promise<Result> {
  await requireAdmin();
  if (!importerEnabled()) return { error: NOT_SET_UP };
  const doc = await db.wizardDocument.findUnique({ where: { id: docId }, select: { projectId: true, status: true, updatedAt: true } });
  if (!doc) return { error: "This draft was deleted." };
  if (effectiveStatus(doc.status, doc.updatedAt) === "GENERATING") return { error: "Claude is still writing it." };
  await db.wizardDocument.update({ where: { id: docId }, data: { status: "GENERATING", error: null } });
  after(() => runWizard(docId));
  paths(doc.projectId, docId);
  return {};
}

export async function saveDraft(docId: string, input: { title: string; markdown: string }): Promise<Result> {
  await requireAdmin();
  const doc = await db.wizardDocument.findUnique({ where: { id: docId }, select: { projectId: true, status: true, updatedAt: true } });
  if (!doc) return { error: "This draft was deleted." };
  if (effectiveStatus(doc.status, doc.updatedAt) === "GENERATING") return { error: "Wait until Claude has finished writing." };
  const markdown = input.markdown.slice(0, 500_000);
  await db.wizardDocument.update({ where: { id: docId }, data: { title: cleanName(input.title) || markdownTitle(markdown) || "Untitled", markdown, status: "READY", error: null } });
  paths(doc.projectId, docId);
  return {};
}

/** Folder the document is filed in: an existing matching top-level folder, or a new one. */
async function targetFolder(projectId: string, kind: WizardKind) {
  const top = await db.dataRoomFolder.findMany({ where: { projectId, parentId: null }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const match = top.find((f) => KIND_INFO[kind].folderMatch.test(f.name));
  if (match) return match.id;
  const files = await db.dataRoomFile.findMany({ where: { projectId, folderId: null }, select: { name: true } });
  const name = uniqueName(KIND_INFO[kind].folder, [...top, ...files].map((x) => x.name));
  return (await db.dataRoomFolder.create({ data: { projectId, parentId: null, name } })).id;
}

/** Saves or replaces one generated file. Replacing keeps the file id, so listing links keep working. */
async function putFile(projectId: string, existingId: string | null, folderId: string, name: string, bytes: Uint8Array, contentType: string, by: string) {
  const storageKey = await saveGenerated(projectId, name, bytes, contentType);
  const existing = existingId ? await db.dataRoomFile.findFirst({ where: { id: existingId, projectId }, select: { id: true, storageKey: true } }) : null;
  if (existing) {
    await db.dataRoomFile.update({ where: { id: existing.id }, data: { storageKey, size: bytes.byteLength, contentType, uploadedBy: by } });
    await deleteStored([existing.storageKey]);
    return existing.id;
  }
  const [folders, files] = await Promise.all([
    db.dataRoomFolder.findMany({ where: { projectId, parentId: folderId }, select: { name: true } }),
    db.dataRoomFile.findMany({ where: { projectId, folderId }, select: { name: true } }),
  ]);
  const f = await db.dataRoomFile.create({
    data: { projectId, folderId, name: uniqueName(name, [...folders, ...files].map((x) => x.name)), size: bytes.byteLength, contentType, storageKey, uploadedBy: by },
  });
  return f.id;
}

/** Saves the draft into the data room: PDF for documents; PDF and PowerPoint for pitch decks. */
export async function saveToDataRoom(docId: string): Promise<Result & { fileId?: string }> {
  const admin = await requireAdmin();
  if (storageMode() === "missing") return { error: "File storage isn't connected yet. See the data room page for the one-time setup." };
  const doc = await db.wizardDocument.findUnique({ where: { id: docId }, include: { project: { select: { code: true } } } });
  if (!doc) return { error: "This draft was deleted." };
  if (doc.status !== "READY" || !doc.markdown.trim()) return { error: "There is no finished draft to save yet." };
  const kind = doc.kind as WizardKind;
  const meta = { kindLabel: KIND_INFO[kind].label, code: doc.project.code };
  try {
    const folderId = await targetFolder(doc.projectId, kind);
    const pdf = kind === "DECK" ? await deckPdf(doc.markdown, meta) : await documentPdf(doc.markdown, meta);
    const fileId = await putFile(doc.projectId, doc.fileId, folderId, outputFileName(doc.project.code, kind, doc.title, "pdf"), pdf, "application/pdf", admin.name);
    let pptxFileId = doc.pptxFileId;
    if (kind === "DECK") {
      const pptx = await deckPptx(doc.markdown, meta);
      pptxFileId = await putFile(doc.projectId, doc.pptxFileId, folderId, outputFileName(doc.project.code, kind, doc.title, "pptx"), pptx, "application/vnd.openxmlformats-officedocument.presentationml.presentation", admin.name);
    }
    await db.wizardDocument.update({ where: { id: docId }, data: { fileId, pptxFileId, savedAt: new Date() } });
    paths(doc.projectId, docId);
    revalidatePath(`/marketplace/${doc.projectId}`);
    return { fileId };
  } catch (e) {
    console.error("Saving wizard document failed", e);
    return { error: e instanceof Error ? e.message : "Couldn't save the file." };
  }
}

/** Deletes the draft. Files already saved to the data room stay there. */
export async function deleteWizardDoc(docId: string): Promise<Result> {
  await requireAdmin();
  const doc = await db.wizardDocument.findUnique({ where: { id: docId }, select: { projectId: true } });
  if (!doc) return {};
  await db.wizardDocument.delete({ where: { id: docId } });
  paths(doc.projectId);
  return {};
}
