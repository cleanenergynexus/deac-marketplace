import { test } from "node:test";
import assert from "node:assert/strict";
import { canAssign, canSeeTask, checkStaffChange, sortTasks, staffLevel, taskScope, taskScopes, visibleAssigneeIds, visibleStaff, type Staff } from "./tasks";

const ana: Staff = { id: "ana", name: "Ana", staffLevel: "ADMIN", managerId: null };
const max: Staff = { id: "max", name: "Max", staffLevel: "MANAGER", managerId: "ana" };
const sue: Staff = { id: "sue", name: "Sue", staffLevel: "SUPPORT", managerId: "max" };
const tom: Staff = { id: "tom", name: "Tom", staffLevel: "SUPPORT", managerId: "max" };
const zoe: Staff = { id: "zoe", name: "Zoe", staffLevel: "SUPPORT", managerId: null };
const team = [ana, max, sue, tom, zoe];

test("older logins without a level are Admins", () => {
  assert.equal(staffLevel(undefined), "ADMIN");
  assert.equal(staffLevel("nonsense"), "ADMIN");
  assert.equal(staffLevel("SUPPORT"), "SUPPORT");
});

test("who sees whose tasks", () => {
  assert.equal(visibleAssigneeIds(ana, team), null);
  assert.deepEqual(visibleStaff(max, team).map((u) => u.id), ["max", "sue", "tom"]);
  assert.deepEqual(visibleAssigneeIds(sue, team), ["sue"]);
  assert.equal(canSeeTask(ana, team, { assigneeId: null }), true);
  assert.equal(canSeeTask(max, team, { assigneeId: null }), false);
  assert.equal(canSeeTask(max, team, { assigneeId: "tom" }), true);
  assert.equal(canSeeTask(max, team, { assigneeId: "zoe" }), false);
  assert.equal(canSeeTask(sue, team, { assigneeId: "tom" }), false);
  assert.equal(canSeeTask(sue, team, { assigneeId: "sue" }), true);
});

test("who can assign to whom", () => {
  assert.equal(canAssign(ana, team, "zoe"), true);
  assert.equal(canAssign(ana, team, null), true);
  assert.equal(canAssign(max, team, "sue"), true);
  assert.equal(canAssign(max, team, "zoe"), false);
  assert.equal(canAssign(max, team, null), false);
  assert.equal(canAssign(sue, team, "sue"), true);
  assert.equal(canAssign(sue, team, "tom"), false);
});

test("task page views by level", () => {
  assert.deepEqual(taskScopes("ADMIN").map((s) => s.value), ["mine", "all"]);
  assert.deepEqual(taskScopes("MANAGER").map((s) => s.value), ["mine", "team"]);
  assert.deepEqual(taskScopes("SUPPORT").map((s) => s.value), ["mine"]);
  assert.equal(taskScope("all", "SUPPORT"), "mine");
  assert.equal(taskScope("team", "MANAGER"), "team");
});

test("team changes keep an Admin and a sane reporting line", () => {
  assert.equal(checkStaffChange(team, { id: "ana", staffLevel: "MANAGER", managerId: null }), "Keep at least one Admin on the team.");
  assert.equal(checkStaffChange(team, { id: "sue", staffLevel: "SUPPORT", managerId: "sue" }), "A team member can't report to themselves.");
  assert.match(checkStaffChange(team, { id: "tom", staffLevel: "SUPPORT", managerId: "sue" }) ?? "", /Support access/);
  assert.match(checkStaffChange(team, { id: "max", staffLevel: "SUPPORT", managerId: "ana" }) ?? "", /reports/);
  assert.equal(checkStaffChange(team, { id: "zoe", staffLevel: "SUPPORT", managerId: "max" }), null);
  assert.equal(checkStaffChange(team, { id: "zoe", staffLevel: "BOSS", managerId: null }), "Pick an access level.");
});

test("task order: open soonest first, undated after, then done newest first", () => {
  const d = (n: number) => new Date(2026, 9, n);
  const out = sortTasks([
    { id: "done-old", dueAt: null, doneAt: d(1), createdAt: d(1) },
    { id: "undated", dueAt: null, doneAt: null, createdAt: d(1) },
    { id: "late", dueAt: d(30), doneAt: null, createdAt: d(1) },
    { id: "soon", dueAt: d(29), doneAt: null, createdAt: d(1) },
    { id: "done-new", dueAt: null, doneAt: d(5), createdAt: d(1) },
  ]);
  assert.deepEqual(out.map((t) => t.id), ["soon", "late", "undated", "done-new", "done-old"]);
});
