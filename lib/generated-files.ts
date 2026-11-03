import "server-only";
import { db } from "@/lib/db";
import { uniqueName } from "@/lib/dataroom";
import { deleteStored, saveGenerated } from "@/lib/storage";

/** Top-level data room folder for generated files: the first whose name matches, or a new one. */
export async function generatedFolder(projectId: string, match: RegExp, name: string) {
  const top = await db.dataRoomFolder.findMany({ where: { projectId, parentId: null }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const found = top.find((f) => match.test(f.name));
  if (found) return found.id;
  const files = await db.dataRoomFile.findMany({ where: { projectId, folderId: null }, select: { name: true } });
  return (await db.dataRoomFolder.create({ data: { projectId, parentId: null, name: uniqueName(name, [...top, ...files].map((x) => x.name)) } })).id;
}

/** Saves or replaces one generated file. Replacing keeps the file id, so listing links keep working. */
export async function putGeneratedFile(projectId: string, existingId: string | null, folderId: string, name: string, bytes: Uint8Array, contentType: string, by: string) {
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
