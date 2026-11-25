import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SPRINTS, nextStage, normalizeTemplates, planSprint, roadmap, schedule, stageSprint } from "./sprints";
import { DEVELOPER_STAGES } from "./constants";
import { taskWorkState, workStateData } from "./tasks";

const stages = DEVELOPER_STAGES.map((s) => ({ value: s.value, label: s.label }));
const d = (s: string) => new Date(`${s}T12:00:00Z`);

test("every original CRM stage has a default sprint with tasks", () => {
  for (const s of stages) assert.ok(stageSprint(DEFAULT_SPRINTS, s.value).tasks.length > 0, s.value);
  assert.deepEqual(stageSprint(DEFAULT_SPRINTS, "NEW_COLUMN"), { goal: "", days: null, tasks: [] });
});

test("normalize drops untitled tasks, keeps timelines in order and reads assignees", () => {
  const cfg = normalizeTemplates({ stages: { LEAD: { goal: " Go ", days: "5", tasks: [
    { title: "", subtasks: [] },
    { title: "Call", startDays: 6, dueDays: 2, priority: "HIGH", assignee: { kind: "USER", id: "u1" }, subtasks: [{ title: "" }, { title: "Sub" }] },
    { title: "Other", priority: "URGENT", assignee: { kind: "?" } },
  ] }, "bad key": {} } });
  assert.deepEqual(Object.keys(cfg.stages), ["LEAD"]);
  const [a, b] = cfg.stages.LEAD.tasks;
  assert.equal(cfg.stages.LEAD.goal, "Go");
  assert.equal(cfg.stages.LEAD.days, 5);
  assert.equal(cfg.stages.LEAD.tasks.length, 2);
  assert.equal(a.startDays, 2); // never after the due day
  assert.deepEqual(a.assignee, { kind: "USER", id: "u1" });
  assert.deepEqual(a.subtasks.map((s) => s.title), ["Sub"]);
  assert.equal(b.priority, null);
  assert.deepEqual(b.assignee, { kind: "MOVER" });
});

test("planSprint dates tasks from the start, gives sub-tasks their task's person, falls back to the mover", () => {
  const tpl = normalizeTemplates({ stages: { X: { days: 10, tasks: [
    { title: "A", startDays: 1, dueDays: 3, assignee: { kind: "USER", id: "gone" }, subtasks: [{ title: "A1" }, { title: "A2", dueDays: 2 }] },
    { title: "B", assignee: { kind: "NONE" } },
  ] } } }).stages.X;
  const plan = planSprint(tpl, d("2026-01-01"), "me", (id) => id !== "gone");
  assert.deepEqual(plan.targetAt, d("2026-01-11"));
  assert.deepEqual(plan.tasks.map((t) => [t.subject, t.assigneeId, t.parent]), [["A", "me", null], ["A1", "me", 0], ["A2", "me", 0], ["B", null, null]]);
  assert.deepEqual(plan.tasks[0].startAt, d("2026-01-02"));
  assert.deepEqual(plan.tasks[1].dueAt, d("2026-01-04"));
  assert.deepEqual(plan.tasks[2].dueAt, d("2026-01-03"));
  assert.equal(plan.tasks[3].dueAt, null);
});

test("roadmap positions come from the project's stage; Passed only shows when the project is there", () => {
  const sprints = [{ stage: "LEAD" }, { stage: "SCREENING" }];
  const r = roadmap(stages, "SCORED", sprints);
  assert.deepEqual(r.map((x) => x.position), ["DONE", "DONE", "ACTIVE", "UPCOMING", "UPCOMING", "UPCOMING", "UPCOMING"]);
  assert.ok(!r.some((x) => x.value === "PASSED"));
  const passed = roadmap(stages, "PASSED", sprints);
  assert.deepEqual(passed.map((x) => [x.value, x.position]), [["LEAD", "DONE"], ["SCREENING", "DONE"], ["SCORED", "NOT_REACHED"], ["ENGAGED", "NOT_REACHED"], ["LISTED", "NOT_REACHED"], ["IN_DILIGENCE", "NOT_REACHED"], ["CLOSED", "NOT_REACHED"], ["PASSED", "ACTIVE"]]);
  // Moved back: the later stage's sprint is kept and shows as upcoming.
  assert.equal(roadmap(stages, "LEAD", sprints)[1].position, "UPCOMING");
  assert.equal(nextStage(stages, "IN_DILIGENCE")?.value, "CLOSED");
  assert.equal(nextStage(stages, "CLOSED"), null);
  assert.equal(nextStage(stages, "PASSED"), null);
});

test("schedule projects the close date from the current sprint's target and each later sprint's length", () => {
  const sprints = [{ stage: "LEAD", startedAt: d("2026-01-01"), targetAt: d("2026-01-08") }, { stage: "SCREENING", startedAt: d("2026-01-05"), targetAt: d("2026-01-15") }];
  const rows = roadmap(stages, "SCREENING", sprints);
  const { dates, closeAt } = schedule(rows, DEFAULT_SPRINTS, d("2026-01-06"));
  assert.deepEqual(dates[0], { start: d("2026-01-01"), end: d("2026-01-05"), projected: false });
  assert.deepEqual(dates[1], { start: d("2026-01-05"), end: d("2026-01-15"), projected: false });
  // Scored 7 + Engaged 14 + Listed 30 + Diligence 45 = 96 days after Jan 15.
  assert.deepEqual(closeAt, d("2026-04-21"));
  assert.equal(schedule(roadmap(stages, "CLOSED", sprints), DEFAULT_SPRINTS).closeAt, null);
});

test("a task's status is one value: done always wins and clears how it was going", () => {
  assert.equal(taskWorkState({ doneAt: null, workState: null }), "NOT_STARTED");
  assert.equal(taskWorkState({ doneAt: null, workState: "STUCK" }), "STUCK");
  assert.equal(taskWorkState({ doneAt: new Date(), workState: "STUCK" }), "DONE");
  const was = d("2026-01-01");
  assert.deepEqual(workStateData("DONE", { doneAt: was }), { doneAt: was, workState: null });
  assert.deepEqual(workStateData("WORKING", { doneAt: was }), { doneAt: null, workState: "WORKING" });
  assert.deepEqual(workStateData("NOT_STARTED", { doneAt: null }), { doneAt: null, workState: null });
});
