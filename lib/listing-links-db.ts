import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { groupRootId, syncedData } from "./listing-links";

/** Every listing of a project's group (the original first, then linked listings oldest first). */
export async function listingGroup(projectId: string) {
  const p = await db.project.findUnique({ where: { id: projectId }, select: { id: true, linkedToId: true } });
  if (!p) return [];
  const root = groupRootId(p);
  const rows = await db.project.findMany({
    where: { OR: [{ id: root }, { linkedToId: root }] },
    select: { id: true, code: true, title: true, dealType: true, dealStage: true, visibility: true, linkedToId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return rows.sort((a, b) => Number(!!a.linkedToId) - Number(!!b.linkedToId));
}

/** The project id that holds this listing's data room, screening and wizard drafts (its group's original listing). */
export async function dataRoomProjectId(projectId: string) {
  const p = await db.project.findUnique({ where: { id: projectId }, select: { id: true, linkedToId: true } });
  return p ? groupRootId(p) : projectId;
}

/** Copies the synced project facts in `data` to the other listings of `projectId`'s group. Returns their ids. */
export async function syncLinkedListings(projectId: string, data: Record<string, unknown>) {
  const p = await db.project.findUnique({ where: { id: projectId }, select: { id: true, linkedToId: true } });
  if (!p) return [];
  const root = groupRootId(p);
  const others = await db.project.findMany({ where: { OR: [{ id: root }, { linkedToId: root }], NOT: { id: p.id } }, select: { id: true } });
  const shared = syncedData(data);
  if (!others.length || !Object.keys(shared).length) return [];
  await db.project.updateMany({ where: { id: { in: others.map((o) => o.id) } }, data: shared as Prisma.ProjectUncheckedUpdateManyInput });
  return others.map((o) => o.id);
}
