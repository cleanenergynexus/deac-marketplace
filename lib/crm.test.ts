import { test } from "node:test";
import assert from "node:assert/strict";
import { activityTitle, ago, contactTab, groupByMonth, initials, parseWhen, projectContactId, taskState } from "./crm";

test("initials", () => {
  assert.equal(initials("Maria Alvarez"), "MA");
  assert.equal(initials("  luis  de la Rivera "), "LR");
  assert.equal(initials("Cher"), "C");
  assert.equal(initials(""), "?");
});

test("timeline titles", () => {
  assert.equal(activityTitle({ kind: "EMAIL", outcome: "SENT", subject: "Teaser" }), "Email sent: Teaser");
  assert.equal(activityTitle({ kind: "EMAIL", outcome: "RECEIVED" }), "Email received");
  assert.equal(activityTitle({ kind: "CALL", outcome: "VOICEMAIL" }), "Call: Left voicemail");
  assert.equal(activityTitle({ kind: "TASK", subject: "Send NDA" }), "Send NDA");
  assert.equal(activityTitle({ kind: "SYSTEM" }), "Update");
});

test("how long ago", () => {
  const now = new Date(2026, 9, 28, 10);
  assert.equal(ago(null, now), null);
  assert.equal(ago(new Date(2026, 9, 28, 1), now), "today");
  assert.equal(ago(new Date(2026, 9, 27, 23), now), "yesterday");
  assert.equal(ago(new Date(2026, 9, 20), now), "8 days ago");
  assert.equal(ago(new Date(2026, 8, 30), now), "4 weeks ago");
});

test("task state", () => {
  const now = new Date(2026, 9, 28, 10);
  assert.equal(taskState({ dueAt: new Date(2026, 9, 27), doneAt: null }, now), "overdue");
  assert.equal(taskState({ dueAt: new Date(2026, 9, 28, 18) }, now), "due-today");
  assert.equal(taskState({ dueAt: new Date(2026, 9, 30) }, now), "open");
  assert.equal(taskState({ dueAt: new Date(2026, 9, 1), doneAt: new Date() }, now), "done");
  assert.equal(taskState({}, now), "open");
});

test("groups by month in order", () => {
  const g = groupByMonth([{ createdAt: new Date(2026, 9, 20) }, { createdAt: new Date(2026, 9, 2) }, { createdAt: new Date(2026, 7, 9) }]);
  assert.deepEqual(g.map((x) => [x.month, x.items.length]), [["October 2026", 2], ["August 2026", 1]]);
});

test("project falls back to the primary contact", () => {
  const contacts = [{ id: "a", isPrimary: false }, { id: "b", isPrimary: true }];
  assert.equal(projectContactId({ contactId: "a" }, contacts), "a");
  assert.equal(projectContactId({ contactId: null }, contacts), "b");
  assert.equal(projectContactId({ contactId: "gone" }, contacts), "b");
  assert.equal(projectContactId({ contactId: null }, [{ id: "z", isPrimary: false }]), "z");
  assert.equal(projectContactId({ contactId: null }, []), null);
});

test("dates typed in the browser's time zone", () => {
  // Puerto Rico is UTC-4: getTimezoneOffset() = 240.
  assert.equal(parseWhen("2026-10-28T09:30", 240)?.toISOString(), "2026-10-28T13:30:00.000Z");
  assert.equal(parseWhen("2026-10-28", 240)?.toISOString(), "2026-10-28T16:00:00.000Z");
  assert.equal(parseWhen("", 240), null);
  assert.equal(parseWhen("tomorrow"), null);
});

test("unknown tab falls back to activity", () => {
  assert.equal(contactTab("calls").log, "CALL");
  assert.equal(contactTab("nope").value, "activity");
});
