import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PIPELINE, allStages, funnelStages, normalizePipeline, normalizeStages, parsePipeline, placeStage, projectStage, projectStageLabel, stageValue } from "./pipeline";
import { DEVELOPER_STAGES } from "./constants";

test("every funnel starts with the original eight stages", () => {
  for (const k of ["LEASE", "FINANCING", "SALE"]) assert.deepEqual(DEFAULT_PIPELINE.funnels[k].map((s) => s.value), DEVELOPER_STAGES.map((s) => s.value));
  assert.equal(parsePipeline(null), DEFAULT_PIPELINE);
  assert.equal(parsePipeline("not json"), DEFAULT_PIPELINE);
});

test("new columns get a stored value; renamed columns keep theirs", () => {
  const out = normalizeStages([{ value: "LEAD", label: "  New lead " }, { value: "", label: "Term sheet out!" }, { label: "Term Sheet Out" }, { value: "LEAD", label: "Dup value" }, { label: "   " }]);
  assert.deepEqual(out, [
    { value: "LEAD", label: "New lead" },
    { value: "TERM_SHEET_OUT", label: "Term sheet out!" },
    { value: "TERM_SHEET_OUT_2", label: "Term Sheet Out" },
    { value: "DUP_VALUE", label: "Dup value" },
  ]);
  assert.equal(stageValue("Négociation", new Set()), "NEGOCIATION");
});

test("an emptied funnel falls back to defaults and unknown funnels are dropped", () => {
  const cfg = normalizePipeline({ funnels: { LEASE: [], SALE: [{ label: "Offer" }], BOGUS: [{ label: "x" }] } });
  assert.equal(cfg.funnels.LEASE.length, 8);
  assert.deepEqual(cfg.funnels.SALE, [{ value: "OFFER", label: "Offer" }]);
  assert.equal(Object.keys(cfg.funnels).length, 3);
});

test("tiles in a removed column sit in the first column; legacy projects follow their developer", () => {
  const cfg = normalizePipeline({ funnels: { SALE: [{ value: "OFFER", label: "Offer" }, { value: "CLOSED", label: "Sold" }] } });
  assert.equal(placeStage(cfg.funnels.SALE, "SCREENING"), "OFFER");
  assert.equal(projectStage(cfg, { dealType: "SALE", pipelineStage: "CLOSED" }, "LEAD"), "CLOSED");
  assert.equal(projectStage(cfg, { dealType: "SALE", pipelineStage: null }, "CLOSED"), "CLOSED");
  assert.equal(projectStage(cfg, { dealType: "LEASE", pipelineStage: null }, "SCORED"), "SCORED");
  assert.equal(projectStageLabel(cfg, { dealType: "SALE", pipelineStage: "CLOSED" }, "LEAD"), "Sold");
  assert.equal(funnelStages(cfg, "SOMETHING_ELSE"), cfg.funnels.FINANCING);
  assert.ok(allStages(cfg).some((s) => s.value === "OFFER"));
  assert.equal(allStages(cfg).filter((s) => s.value === "CLOSED").length, 1);
});
