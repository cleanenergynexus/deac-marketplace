import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { getPipeline } from "./pipeline-db";
import { funnelStages, projectStage } from "./pipeline";
import { parseTemplates, planSprint, roadmap, schedule, stageSprint, type SprintTemplates } from "./sprints";
import { getTaskPeople } from "./tasks-db";
import { notifyTaskAssignee } from "./task-mail";

/** The saved sprint templates, or DEAC's starting sprints if nobody has edited them yet. */
export async function getSprintTemplates(): Promise<SprintTemplates> {
  const row = await db.sprintTemplate.findUnique({ where: { id: "default" } });
  return parseTemplates(row?.config);
}

/**
 * Who started a sprint. A team member holds the template's "whoever moves the project" tasks; a referral agent's
 * go to their DEAC partner; with nobody (a project submitted on the public website) those tasks start unassigned.
 */
export type SprintActor = { id: string; name: string; role: string; partnerId?: string | null } | null;

/**
 * Starts the sprint for the CRM stage the project is in now, from that stage's template, unless the project already
 * has a sprint for it (it was there before and moved back, or two requests raced). Every place that puts a project
 * in a stage calls this after saving the stage. Returns the sprint's id, or null when it already existed.
 *
 * The sprint and its tasks are written in one transaction, so a crash can't leave a sprint without its tasks.
 * Assignees are emailed after the commit; a failed email never undoes the sprint (lib/task-mail.ts).
 */
export async function startSprint(projectId: string, actor: SprintActor): Promise<string | null> {
  const [p, pipeline, templates, people] = await Promise.all([
    db.project.findUnique({ where: { id: projectId }, select: { id: true, dealType: true, pipelineStage: true, developerId: true, contactId: true, developer: { select: { stage: true } } } }),
    getPipeline(),
    getSprintTemplates(),
    getTaskPeople(),
  ]);
  if (!p) return null;
  const stage = projectStage(pipeline, p, p.developer.stage);
  if (await db.sprint.count({ where: { projectId, stage } })) return null;

  const holders = new Set(people.filter((u) => !u.suspended).map((u) => u.id));
  const mover = actor === null ? null : actor.role === "AGENT" ? (actor.partnerId ?? null) : actor.id;
  const tpl = stageSprint(templates, stage);
  const start = new Date();
  const plan = planSprint(tpl, start, mover && holders.has(mover) ? mover : null, (id) => holders.has(id));
  // A project task with no contact goes on the project contact's timeline (same as app/actions/contacts.ts taskLinks).
  const contactId = p.contactId ?? (await db.contact.findFirst({ where: { developerId: p.developerId, isPrimary: true }, select: { id: true } }))?.id ?? null;
  const ids = plan.tasks.map(() => randomUUID());
  const rows = plan.tasks.map((x, i) => ({
    id: ids[i], kind: "TASK", subject: x.subject, body: x.body, startAt: x.startAt, dueAt: x.dueAt, priority: x.priority, assigneeId: x.assigneeId,
    parentId: x.parent === null ? null : ids[x.parent], projectId, developerId: p.developerId, contactId, by: actor?.name ?? "Sprint template",
    createdAt: new Date(start.getTime() + i), // keeps the template's order
  }));

  let sprintId: string;
  try {
    sprintId = await db.$transaction(async (tx) => {
      const sprint = await tx.sprint.create({ data: { projectId, stage, goal: tpl.goal, startedAt: start, targetAt: plan.targetAt, startedBy: actor?.name ?? null } });
      // Tasks first, then sub-tasks, so every sub-task's parent row exists when it's written.
      await tx.activity.createMany({ data: rows.filter((r) => !r.parentId).map((r) => ({ ...r, sprintId: sprint.id })) });
      await tx.activity.createMany({ data: rows.filter((r) => r.parentId).map((r) => ({ ...r, sprintId: sprint.id })) });
      return sprint.id;
    });
  } catch (e) {
    // Another request started this sprint first (double click, two tabs): theirs stands.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return null;
    throw e;
  }

  // One email per task that's now someone else's (sub-tasks go with their task, so they don't get their own).
  if (actor) for (const r of rows) if (!r.parentId) await notifyTaskAssignee({ ...r, investorId: null }, actor);
  return sprintId;
}

/** Starts the current stage's sprint for each project; for callers that place several projects at once. */
export async function startSprints(projectIds: string[], actor: SprintActor) {
  for (const id of projectIds) await startSprint(id, actor);
}

/** A project's sprints with their tasks (sub-tasks nested under their task), oldest first. */
export function projectSprints(projectId: string, taskWhere: Prisma.ActivityWhereInput) {
  const assignee = { select: { id: true, name: true } } as const;
  return db.sprint.findMany({
    where: { projectId },
    orderBy: { startedAt: "asc" },
    include: {
      tasks: {
        where: { AND: [taskWhere, { parentId: null }] },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        include: { assignee, subtasks: { where: taskWhere, orderBy: [{ createdAt: "asc" }, { id: "asc" }], include: { assignee } } },
      },
    },
  });
}
export type ProjectSprint = Awaited<ReturnType<typeof projectSprints>>[number];

/** Everything a project's Sprints page shows: its funnel's stages with their sprints and dates, and the templates. */
export async function loadRoadmap(projectId: string, taskWhere: Prisma.ActivityWhereInput, now = new Date()) {
  const [p, pipeline, templates, sprints] = await Promise.all([
    db.project.findUnique({ where: { id: projectId }, select: { id: true, code: true, title: true, dealType: true, pipelineStage: true, developerId: true, developer: { select: { company: true, stage: true } } } }),
    getPipeline(),
    getSprintTemplates(),
    projectSprints(projectId, taskWhere),
  ]);
  if (!p) return null;
  const stages = funnelStages(pipeline, p.dealType);
  const current = projectStage(pipeline, p, p.developer.stage);
  const rows = roadmap(stages, current, sprints);
  return { project: p, stages, current, rows, templates, ...schedule(rows, templates, now) };
}

/**
 * Adds a task (or, with `parentId`, a sub-task) to a sprint, on the sprint's project. Sub-tasks go one level deep under
 * a task of the same sprint and start with that task's dates and person unless given others. The caller has already
 * checked who may add tasks here and that `assigneeId` is someone they may assign to (undefined = the parent's person).
 */
export async function createSprintTask(o: {
  sprintId: string; parentId: string | null; subject: string; body?: string; startAt?: Date | null; dueAt?: Date | null; priority?: string | null;
  assigneeId: string | null | undefined; by: { id: string; name: string }; projectId?: string;
}) {
  const sprint = await db.sprint.findUnique({ where: { id: o.sprintId }, include: { project: { select: { id: true, developerId: true, contactId: true } } } });
  if (!sprint || (o.projectId && sprint.projectId !== o.projectId)) throw new Error("That sprint no longer exists.");
  const parent = o.parentId ? await db.activity.findUnique({ where: { id: o.parentId }, select: { sprintId: true, parentId: true, assigneeId: true, startAt: true, dueAt: true } }) : null;
  if (o.parentId && (!parent || parent.sprintId !== sprint.id || parent.parentId)) throw new Error("Sub-tasks go under a task of the same sprint.");
  const p = sprint.project;
  const contactId = p.contactId ?? (await db.contact.findFirst({ where: { developerId: p.developerId, isPrimary: true }, select: { id: true } }))?.id ?? null;
  const task = await db.activity.create({
    data: {
      kind: "TASK", subject: o.subject.slice(0, 200), body: (o.body ?? "").slice(0, 5000),
      startAt: o.startAt ?? parent?.startAt ?? null, dueAt: o.dueAt ?? parent?.dueAt ?? null, priority: o.priority ?? null,
      assigneeId: o.assigneeId === undefined ? (parent?.assigneeId ?? o.by.id) : o.assigneeId,
      sprintId: sprint.id, parentId: parent ? o.parentId : null,
      projectId: p.id, developerId: p.developerId, contactId, by: o.by.name,
    },
  });
  await notifyTaskAssignee(task, o.by);
  return task;
}
