"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { parseWhen } from "@/lib/crm";
import { normalizeTemplates } from "@/lib/sprints";
import { startSprint } from "@/lib/sprints-db";
import { getTaskPeople, pickAssignee } from "@/lib/tasks-db";
import { notifyTaskAssignee } from "@/lib/task-mail";
import { priorityOf } from "@/lib/tasks";

const s = (f: FormData, k: string) => (f.get(k) as string | null)?.trim() || null;

type Result = { error?: string; ok?: string } | undefined;

/** Saves Sprints → Sprint Templates. Sprints already started keep their tasks; the change applies to the next ones. */
export async function saveSprintTemplates(_: Result, f: FormData): Promise<Result> {
  const admin = await requireAdmin();
  let cfg;
  try { cfg = normalizeTemplates(JSON.parse(String(f.get("config") ?? ""))); } catch { return { error: "Could not read the templates. Reload the page and try again." }; }
  const config = JSON.stringify(cfg);
  await db.sprintTemplate.upsert({ where: { id: "default" }, create: { id: "default", config, updatedBy: admin.name }, update: { config, updatedBy: admin.name } });
  revalidatePath("/admin/sprints", "layout");
  const n = Object.values(cfg.stages).reduce((t, x) => t + x.tasks.length, 0);
  return { ok: `Sprint templates saved: ${n} task${n === 1 ? "" : "s"}. Sprints started from now on use them.` };
}

/** "Start Sprint" for a project's current stage when it has none yet (older projects, or a project placed by a funnel edit). */
export async function startProjectSprint(f: FormData) {
  const admin = await requireAdmin();
  const projectId = String(f.get("projectId"));
  await startSprint(projectId, admin);
  revalidatePath("/admin", "layout");
}

/** "+ Add Task" / "+ Sub-task" on a sprint. A sub-task goes under a task of the same sprint (one level deep). */
export async function addSprintTask(f: FormData) {
  const admin = await requireAdmin();
  const subject = s(f, "subject");
  if (!subject) throw new Error("Give the task a title.");
  const sprint = await db.sprint.findUnique({ where: { id: String(f.get("sprintId")) }, include: { project: { select: { id: true, developerId: true, contactId: true } } } });
  if (!sprint) throw new Error("That sprint no longer exists.");
  const parentId = s(f, "parentId");
  const parent = parentId ? await db.activity.findUnique({ where: { id: parentId }, select: { sprintId: true, parentId: true, assigneeId: true, startAt: true, dueAt: true } }) : null;
  if (parentId && (!parent || parent.sprintId !== sprint.id || parent.parentId)) throw new Error("Sub-tasks go under a task of the same sprint.");
  const people = await getTaskPeople();
  // A new sub-task starts with its task's person and dates unless the form picked others.
  const assigneeId = f.has("assigneeId") ? pickAssignee(admin, people, f.get("assigneeId")) : parent ? parent.assigneeId : pickAssignee(admin, people, null);
  const tz = Number(f.get("tz") ?? 0);
  const p = sprint.project;
  const contactId = p.contactId ?? (await db.contact.findFirst({ where: { developerId: p.developerId, isPrimary: true }, select: { id: true } }))?.id ?? null;
  const task = await db.activity.create({
    data: {
      kind: "TASK", subject, body: s(f, "body") ?? "",
      startAt: parseWhen(s(f, "startAt"), tz) ?? parent?.startAt ?? null,
      dueAt: parseWhen(s(f, "dueAt"), tz) ?? parent?.dueAt ?? null,
      priority: priorityOf(s(f, "priority")),
      assigneeId, sprintId: sprint.id, parentId: parent ? parentId : null,
      projectId: p.id, developerId: p.developerId, contactId, by: admin.name,
    },
  });
  await notifyTaskAssignee(task, admin);
  revalidatePath("/admin", "layout");
}
