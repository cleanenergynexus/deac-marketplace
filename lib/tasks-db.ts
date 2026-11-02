import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { canAssign, canSeeTask, staffLevel, visibleAssigneeIds, visibleStaff, type Staff } from "./tasks";

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

export type TaskPickers = {
  contacts: { id: string; name: string; company: string; developerId: string }[];
  /** Investor CRM contacts, ids prefixed "inv:". */
  investors: { id: string; name: string; company: string; developerId: string }[];
  projects: { id: string; label: string; developerId: string }[];
};

/** Contacts, investors and projects a task can be linked to, for the new-task and edit-task forms. */
export async function getTaskPickers(): Promise<TaskPickers> {
  const [contacts, investors, projects] = await Promise.all([
    db.contact.findMany({ select: { id: true, name: true, developerId: true, developer: { select: { company: true } } }, orderBy: { name: "asc" } }),
    db.investor.findMany({ select: { id: true, name: true, firm: true }, orderBy: { name: "asc" } }),
    db.project.findMany({ select: { id: true, code: true, title: true, developerId: true }, orderBy: { code: "asc" } }),
  ]);
  return {
    contacts: contacts.map((c) => ({ id: c.id, name: c.name, company: c.developer.company, developerId: c.developerId })),
    investors: investors.map((i) => ({ id: `inv:${i.id}`, name: i.name, company: i.firm ?? "Investor", developerId: "" })),
    projects: projects.map((p) => ({ id: p.id, label: `${p.code} · ${p.title}`, developerId: p.developerId })),
  };
}

/** Everything the edit-task dialog needs: link pickers, who this person can assign to, and whether "Unassigned" is allowed. */
export type TaskEditing = TaskPickers & { assignees: { id: string; name: string }[]; me: string; allowUnassigned: boolean };

export async function getTaskEditing(viewer: Staff, team: Staff[]): Promise<TaskEditing> {
  return {
    ...(await getTaskPickers()),
    assignees: visibleStaff(viewer, team).map((u) => ({ id: u.id, name: u.name })),
    me: viewer.id,
    allowUnassigned: staffLevel(viewer.staffLevel) === "ADMIN",
  };
}
