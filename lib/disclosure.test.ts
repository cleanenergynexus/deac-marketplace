import { test } from "node:test";
import assert from "node:assert/strict";
import { atLeast, DEFAULT_DISCLOSURE, docStage, investorStage, nextStep, parseDisclosure } from "./disclosure";

test("stage only advances on admin-approved steps", () => {
  assert.equal(investorStage({}), "TEASER");
  assert.equal(investorStage({ nda: "PENDING" }), "TEASER");
  assert.equal(investorStage({ nda: "APPROVED" }), "NDA");
  assert.equal(investorStage({ masterNda: true }), "NDA");
  assert.equal(investorStage({ nda: "APPROVED", loi: "PENDING" }), "NDA");
  assert.equal(investorStage({ nda: "APPROVED", loi: "APPROVED" }), "LOI");
  assert.equal(investorStage({ loi: "APPROVED" }), "LOI");
  assert.equal(investorStage({ loi: "APPROVED", diligence: "PENDING" }), "LOI");
  assert.equal(investorStage({ loi: "APPROVED", diligence: "APPROVED" }), "DILIGENCE");
});

test("stage comparison", () => {
  assert.ok(atLeast("LOI", "NDA"));
  assert.ok(atLeast("NDA", "NDA"));
  assert.ok(!atLeast("TEASER", "NDA"));
  assert.ok(!atLeast("LOI", "DILIGENCE"));
});

test("older document access values map to stages", () => {
  assert.equal(docStage("SUMMARY"), "TEASER");
  assert.equal(docStage("DATAROOM"), "LOI");
  assert.equal(docStage("NDA"), "NDA");
  assert.equal(docStage("DILIGENCE"), "DILIGENCE");
  assert.equal(docStage("junk"), "LOI");
});

test("disclosure settings fall back to defaults", () => {
  assert.deepEqual(parseDisclosure(null), DEFAULT_DISCLOSURE);
  assert.deepEqual(parseDisclosure("not json"), DEFAULT_DISCLOSURE);
  assert.deepEqual(parseDisclosure("[]"), DEFAULT_DISCLOSURE);
  const d = parseDisclosure(JSON.stringify({ returns: "NDA", power: "bogus", extra: "LOI" }));
  assert.equal(d.returns, "NDA");
  assert.equal(d.power, DEFAULT_DISCLOSURE.power);
  assert.ok(!("extra" in d));
});

test("next step follows the stage", () => {
  assert.deepEqual(nextStep("TEASER", {}), { step: "NDA", status: "NONE" });
  assert.deepEqual(nextStep("TEASER", { nda: "PENDING" }), { step: "NDA", status: "PENDING" });
  assert.deepEqual(nextStep("NDA", { loi: "DECLINED" }), { step: "LOI", status: "DECLINED" });
  assert.deepEqual(nextStep("LOI", {}), { step: "DILIGENCE", status: "NONE" });
  assert.deepEqual(nextStep("DILIGENCE", {}), { step: null, status: "APPROVED" });
});
