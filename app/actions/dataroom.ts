"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { isStage, type Stage } from "@/lib/disclosure";
import { canMoveFolder, cleanName, docNameFromFile, fileUrl, countTemplate, normalizeTemplate, parseTemplate, type TemplateNode, uniqueName } from "@/lib/dataroom";
import { deleteStored, verifyStored } from "@/lib/storage";

type Result = { error?: string };

function refresh(projectId: string) {
  revalidatePath(`/admin/projects/${projectId}/data-room`);
  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/marketplace/${projectId}`);
}

/** Names already used by folders and files directly inside `parentId` (Explorer treats both as one namespace). */
async function siblingNames(projectId: string, parentId: string | null, except?: string) {
  const [folders, files] = await Promise.all([
    db.dataRoomFolder.findMany({ where: { projectId, parentId }, select: { id: true, name: true } }),
    db.dataRoomFile.findMany({ where: { projectId, folderId: parentId }, select: { id: true, name: true } }),
  ]);
  return [...folders, ...files].filter((x) => x.id !== except).map((x) => x.name);
}

/** Throws unless the folder belongs to the project. `null` is the top level. */
async function checkFolder(projectId: string, folderId: string | null) {
  if (folderId === null) return;
  const f = await db.dataRoomFolder.findFirst({ where: { id: folderId, projectId }, select: { id: true } });
  if (!f) throw new Error("Folder not found");
}

export async function createFolder(projectId: string, parentId: string | null, name = "New folder"): Promise<Result & { id?: string; name?: string }> {
  await requireAdmin();
  await checkFolder(projectId, parentId);
  const clean = cleanName(name);
  if (!clean) return { error: "Enter a folder name." };
  const unique = uniqueName(clean, await siblingNames(projectId, parentId));
  const f = await db.dataRoomFolder.create({ data: { projectId, parentId, name: unique } });
  refresh(projectId);
  return { id: f.id, name: f.name };
}

/** Adds the folders of the data room template (Admin → Data room template). Folders that already exist are kept and filled in. */
export async function createStandardFolders(projectId: string): Promise<Result> {
  await requireAdmin();
  const row = await db.dataRoomTemplate.findUnique({ where: { id: "default" } });
  const template = parseTemplate(row?.config);
  if (!template.length) return { error: "The data room template is empty. Add folders under Admin → Data room template." };
  const add = async (nodes: TemplateNode[], parentId: string | null) => {
    const existing = await db.dataRoomFolder.findMany({ where: { projectId, parentId }, select: { id: true, name: true } });
    const taken = await siblingNames(projectId, parentId);
    for (const n of nodes) {
      let folder = existing.find((f) => f.name.toLowerCase() === n.name.toLowerCase());
      if (!folder) {
        // A file with the same name can sit there; keep both, like Explorer.
        const name = uniqueName(n.name, taken);
        taken.push(name);
        folder = await db.dataRoomFolder.create({ data: { projectId, parentId, name }, select: { id: true, name: true } });
      }
      if (n.children.length) await add(n.children, folder.id);
    }
  };
  await add(template, null);
  refresh(projectId);
  return {};
}

/**
 * Finds or creates the folders of a folder upload, parents first. Returns "A/B" -> folder id.
 * Runs before the files upload so parallel uploads land in the same folders.
 */
export async function ensureFolders(projectId: string, parentId: string | null, paths: string[][]): Promise<Record<string, string>> {
  await requireAdmin();
  await checkFolder(projectId, parentId);
  const out: Record<string, string> = {};
  for (const p of [...paths].sort((a, b) => a.length - b.length)) {
    const parts = p.map(cleanName);
    if (parts.some((x) => !x)) continue;
    const key = parts.join("/");
    if (out[key]) continue;
    const parent = parts.length > 1 ? out[parts.slice(0, -1).join("/")] : parentId;
    if (parent === undefined) continue;
    const name = parts[parts.length - 1];
    const existing = await db.dataRoomFolder.findFirst({ where: { projectId, parentId: parent, name: { equals: name, mode: "insensitive" } } });
    out[key] = existing?.id ?? (await db.dataRoomFolder.create({ data: { projectId, parentId: parent, name: uniqueName(name, await siblingNames(projectId, parent)) } })).id;
  }
  refresh(projectId);
  return out;
}

/** Records an uploaded file in the data room. A name clash keeps both ("Report (2).pdf"). */
export async function registerFile(input: { projectId: string; folderId: string | null; name: string; storageKey: string; contentType?: string }): Promise<Result & { id?: string }> {
  const admin = await requireAdmin();
  const { projectId, folderId } = input;
  await checkFolder(projectId, folderId);
  const stored = await verifyStored(input.storageKey, projectId);
  if (!stored) return { error: `Upload of ${input.name} didn't complete. Try again.` };
  const name = uniqueName(cleanName(input.name) || "Untitled", await siblingNames(projectId, folderId));
  const contentType = (stored.contentType || input.contentType || "application/octet-stream").slice(0, 200);
  const f = await db.dataRoomFile.create({ data: { projectId, folderId, name, size: stored.size, contentType, storageKey: input.storageKey, uploadedBy: admin.name, uploadedById: admin.id } });
  refresh(projectId);
  return { id: f.id };
}

/** Renames a folder or file. Unlike uploads, a clash is an error, the way Explorer does it. */
export async function renameItem(projectId: string, kind: "folder" | "file", id: string, name: string): Promise<Result> {
  await requireAdmin();
  const clean = cleanName(name);
  if (!clean) return { error: "Enter a name." };
  const item = kind === "folder"
    ? await db.dataRoomFolder.findFirst({ where: { id, projectId }, select: { parentId: true } }).then((f) => f && { parent: f.parentId })
    : await db.dataRoomFile.findFirst({ where: { id, projectId }, select: { folderId: true } }).then((f) => f && { parent: f.folderId });
  if (!item) return { error: "It was moved or deleted. Refresh the page." };
  if ((await siblingNames(projectId, item.parent, id)).some((n) => n.toLowerCase() === clean.toLowerCase())) return { error: `There is already an item named "${clean}" in this folder.` };
  if (kind === "folder") await db.dataRoomFolder.update({ where: { id }, data: { name: clean } });
  else await db.dataRoomFile.update({ where: { id }, data: { name: clean } });
  refresh(projectId);
  return {};
}

/** Moves folders and files into `targetId` (null = top level). Name clashes keep both. */
export async function moveItems(projectId: string, items: { folderIds: string[]; fileIds: string[] }, targetId: string | null): Promise<Result> {
  await requireAdmin();
  await checkFolder(projectId, targetId);
  const all = await db.dataRoomFolder.findMany({ where: { projectId }, select: { id: true, parentId: true, name: true } });
  const taken = await siblingNames(projectId, targetId);
  const ops = [];
  for (const id of items.folderIds) {
    const f = all.find((x) => x.id === id);
    if (!f || f.parentId === targetId) continue;
    if (!canMoveFolder(all, id, targetId)) return { error: `Can't move "${f.name}" into itself or one of its subfolders.` };
    const name = uniqueName(f.name, taken);
    taken.push(name);
    ops.push(db.dataRoomFolder.update({ where: { id }, data: { parentId: targetId, name } }));
  }
  const files = await db.dataRoomFile.findMany({ where: { projectId, id: { in: items.fileIds } }, select: { id: true, name: true, folderId: true } });
  for (const f of files) {
    if (f.folderId === targetId) continue;
    const name = uniqueName(f.name, taken);
    taken.push(name);
    ops.push(db.dataRoomFile.update({ where: { id: f.id }, data: { folderId: targetId, name } }));
  }
  await db.$transaction(ops);
  refresh(projectId);
  return {};
}

/** Deletes folders (with everything inside) and files, and removes them from the listing. */
export async function deleteItems(projectId: string, items: { folderIds: string[]; fileIds: string[] }): Promise<Result> {
  await requireAdmin();
  const all = await db.dataRoomFolder.findMany({ where: { projectId }, select: { id: true, parentId: true } });
  const folderIds = new Set<string>();
  const kids = new Map<string | null, string[]>();
  for (const f of all) kids.set(f.parentId, [...(kids.get(f.parentId) ?? []), f.id]);
  const stack = items.folderIds.filter((id) => all.some((f) => f.id === id));
  while (stack.length) {
    const id = stack.pop()!;
    if (folderIds.has(id)) continue;
    folderIds.add(id);
    stack.push(...(kids.get(id) ?? []));
  }
  const files = await db.dataRoomFile.findMany({
    where: { projectId, OR: [{ id: { in: items.fileIds } }, { folderId: { in: [...folderIds] } }] },
    select: { id: true, storageKey: true },
  });
  await db.$transaction([
    db.document.deleteMany({ where: { projectId, fileId: { in: files.map((f) => f.id) } } }),
    db.dataRoomFile.deleteMany({ where: { projectId, id: { in: files.map((f) => f.id) } } }),
    db.dataRoomFolder.deleteMany({ where: { projectId, id: { in: [...folderIds] } } }),
  ]);
  await deleteStored(files.map((f) => f.storageKey));
  refresh(projectId);
  return {};
}

/** Shares data room files on the listing's Documents tab at an access tier (or changes the tier of ones already shared). */
export async function shareOnListing(projectId: string, fileIds: string[], access: Stage): Promise<Result> {
  await requireAdmin();
  if (!isStage(access)) return { error: "Pick an access tier." };
  const files = await db.dataRoomFile.findMany({ where: { projectId, id: { in: fileIds } }, include: { documents: { select: { id: true } } } });
  await db.$transaction(files.map((f) => f.documents.length
    ? db.document.updateMany({ where: { fileId: f.id }, data: { access } })
    : db.document.create({ data: { projectId, fileId: f.id, name: docNameFromFile(f.name), url: fileUrl(f.id), access, category: "Other" } })));
  refresh(projectId);
  revalidatePath("/marketplace");
  return {};
}

/** Takes files off the listing. They stay in the data room. */
export async function unshareFromListing(projectId: string, fileIds: string[]): Promise<Result> {
  await requireAdmin();
  await db.document.deleteMany({ where: { projectId, fileId: { in: fileIds } } });
  refresh(projectId);
  return {};
}

/** Saves the folder set used by "Create standard folders" (Admin → Data room template). Existing data rooms don't change. */
export async function saveDataRoomTemplate(_: { error?: string; ok?: string } | undefined, f: FormData): Promise<{ error?: string; ok?: string }> {
  const admin = await requireAdmin();
  let nodes: TemplateNode[];
  try { nodes = normalizeTemplate(JSON.parse(String(f.get("config") ?? ""))); } catch { return { error: "Could not read the folders. Reload the page and try again." }; }
  const config = JSON.stringify(nodes);
  await db.dataRoomTemplate.upsert({ where: { id: "default" }, create: { id: "default", config, updatedBy: admin.name }, update: { config, updatedBy: admin.name } });
  revalidatePath("/admin/data-room-template");
  return { ok: `Template saved: ${countTemplate(nodes)} folder${countTemplate(nodes) === 1 ? "" : "s"}. New data rooms will use it.` };
}
