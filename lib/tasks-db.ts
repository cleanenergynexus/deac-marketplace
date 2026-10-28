import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { canAssign, canSeeTask, visibleAssigneeIds, type Staff } from "./tasks";

/** Every team login, for assignee pickers and visibility checks. */
export function getTeam(): Promise<Staff[]> {
  return db.user.findMany({ where: { role: "ADMIN" }, select: { id: true, name: true, staffLevel: true, managerId: true }, orderBy: { name: "asc" } });
}

/** Prisma filter for the tasks this person may see (Admin: all, Manager: their team, Support: their own). */
export function visibleTaskWhere(viewer: Staff, team: Staff[]): Prisma.ActivityWhereInput {
  const ids = visibleAssigneeIds(viewer, team);
  return ids === null ? { kind: "TASK" } : { kind: "TASK", assigneeId: { in: ids } };
}

/** Timeline filter: every non-task entry, plus the tasks this person may see. */
export function visibleTimelineWhere(viewer: Staff, team: Staff[]): Prisma.ActivityWhereInput {
  const ids = visibleAssigneeIds(viewer, team);
  return ids === null ? {} : { OR: [{ kind: { not: "TASK" } }, { assigneeId: { in: ids } }] };
}

/** Reads the assignee picked on a task form and checks this person may assign to them. "" = unassigned (Admins only). */
export function pickAssignee(viewer: Staff, team: Staff[], raw: FormDataEntryValue | null): string | null {
  const id = typeof raw === "string" && raw ? raw : raw === null ? viewer.id : null;
  if (!canAssign(viewer, team, id)) throw new Error(id ? "You can't assign tasks to that team member." : "Pick who the task is for.");
  return id;
}

/** Loads a task and checks this person may see (and so tick off, reassign or delete) it. */
export async function findVisibleTask(viewer: Staff, id: string) {
  const [task, team] = await Promise.all([db.activity.findUnique({ where: { id } }), getTeam()]);
  if (!task || (task.kind === "TASK" && !canSeeTask(viewer, team, task))) throw new Error("That task is not one of yours.");
  return { task, team };
}
