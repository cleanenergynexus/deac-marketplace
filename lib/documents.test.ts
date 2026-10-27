import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDocRows, planDocChanges } from "./documents";

test("parses editor rows and drops blank names", () => {
  assert.equal(parseDocRows(null), null);
  assert.equal(parseDocRows("nope"), null);
  assert.equal(parseDocRows("{}"), null);
  assert.deepEqual(parseDocRows(JSON.stringify([
    { id: "a", name: " Teaser ", url: " https://x ", access: "TEASER" },
    { id: "", name: "  ", url: "", access: "NDA" },
    { name: "Model", access: "bogus" },
  ])), [
    { id: "a", name: "Teaser", url: "https://x", access: "TEASER" },
    { id: "", name: "Model", url: "", access: "LOI" },
  ]);
});

test("plans creates, updates and removals", () => {
  const existing = [
    { id: "a", name: "Teaser", url: "u1", access: "SUMMARY" },
    { id: "b", name: "Model", url: "u2", access: "LOI" },
    { id: "c", name: "ESA", url: "u3", access: "DILIGENCE" },
  ];
  const plan = planDocChanges(existing, [
    { id: "a", name: "Teaser", url: "u1", access: "TEASER" }, // legacy value rewritten
    { id: "b", name: "Model", url: "u2", access: "LOI" }, // unchanged
    { id: "", name: "Site plan", url: "", access: "NDA" },
    { id: "zzz", name: "Unknown id", url: "", access: "LOI" }, // treated as new
  ]);
  assert.deepEqual(plan.update.map((r) => r.id), ["a"]);
  assert.deepEqual(plan.create.map((r) => r.name), ["Site plan", "Unknown id"]);
  assert.deepEqual(plan.remove, ["c"]);
});

test("an empty list removes everything", () => {
  assert.deepEqual(planDocChanges([{ id: "a", name: "x", url: "", access: "LOI" }], []).remove, ["a"]);
});

test("data room rows keep their file and ignore links", () => {
  assert.deepEqual(parseDocRows(JSON.stringify([{ id: "", name: "ESA", url: "https://x", access: "NDA", fileId: "f1" }])), [
    { id: "", name: "ESA", url: "", access: "NDA", fileId: "f1" },
  ]);
  const existing = [{ id: "a", name: "ESA", url: "/api/data-room/files/f1", access: "NDA", fileId: "f1" }];
  assert.deepEqual(planDocChanges(existing, [{ id: "a", name: "ESA", url: "", access: "NDA" }]), { create: [], update: [], remove: [] });
  const plan = planDocChanges(existing, [{ id: "a", name: "Phase I ESA", url: "", access: "LOI" }, { id: "", name: "SIS", url: "", access: "LOI", fileId: "f2" }]);
  assert.deepEqual(plan.update, [{ id: "a", name: "Phase I ESA", url: "/api/data-room/files/f1", access: "LOI", fileId: "f1" }]);
  assert.deepEqual(plan.create, [{ name: "SIS", url: "", access: "LOI", fileId: "f2" }]);
});
