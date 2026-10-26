import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluate, evaluateOperating, DEFAULT_INPUTS, DEFAULT_OPERATING } from "./valuation";

// Expected numbers are the cached results saved in Interactive_Powered_Asset_Bid_Calculator_DEAC_v2.xlsx.
test("Bid Calculator sheet matches the workbook example", () => {
  const r = evaluate(DEFAULT_INPUTS);
  assert.equal(r.base, 420000);
  assert.equal(r.adjustmentFactor, 3.35);
  assert.equal(Math.round(r.adjustedValueMw), 1407000);
  assert.equal(Math.round(r.perMw.good), 1195950);
  assert.equal(Math.round(r.perMw.high), 1547700);
  assert.equal(r.total, null); // MW blank in the workbook
  assert.equal(r.score, 116);
  assert.equal(r.recommendation.label, "Buy");
  assert.equal(r.factors.expansion.weight, 1.05);
  assert.equal(r.factors.expansion.adj, 0.05);
});

test("totals appear once MW is entered, and expansion uses the MW ratio", () => {
  const r = evaluate({ ...DEFAULT_INPUTS, mw: 20 });
  assert.equal(Math.round(r.factors.expansion.weight * 10000), 10375); // 1 + 10/20*0.075
  assert.ok(r.total && r.total.market > 0);
});

test("weak site → Walk Away", () => {
  const r = evaluate({ ...DEFAULT_INPUTS, powerStatus: "Speculative", monthsToPower: 48, powerRateCents: 8, infrastructure: "None", expansionMw: 0, environmentalRisk: "High", fiber: "Fair", water: "Fair", entitlements: "None", backupPower: "None", substation: "Distant", density: "Limited", transmission: "Low" });
  assert.equal(r.recommendation.label, "Walk Away");
});

test("Operating DC Value sheet matches the workbook example", () => {
  const r = evaluateOperating(DEFAULT_OPERATING);
  assert.equal(Math.round(r.revenue), 19950000);
  assert.equal(Math.round(r.powerCost), 4577100);
  assert.equal(Math.round(r.opex), 3591000);
  assert.equal(Math.round(r.noi), 11781900);
  assert.equal(r.adjCapRate, 5.5);
  assert.equal(Math.round(r.value!), 214216364);
});
