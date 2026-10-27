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
