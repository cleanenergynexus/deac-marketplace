import { test } from "node:test";
import assert from "node:assert/strict";
import { STEP_STAGE, advanceStage, firmKey, fitsMandate, stepFromHistory } from "./investor-crm";
import { DEFAULT_INVESTOR_PIPELINE, normalizePipeline, parsePipeline } from "./pipeline";
import { INVESTOR_PIPELINE_STAGES } from "./constants";

const stages = DEFAULT_INVESTOR_PIPELINE.funnels.FINANCING;

test("investor funnels start with the investor journey, separate from the developer stages", () => {
  for (const k of ["LEASE", "FINANCING", "SALE"]) assert.deepEqual(DEFAULT_INVESTOR_PIPELINE.funnels[k].map((s) => s.value), INVESTOR_PIPELINE_STAGES.map((s) => s.value));
  assert.equal(parsePipeline(null, DEFAULT_INVESTOR_PIPELINE), DEFAULT_INVESTOR_PIPELINE);
  assert.equal(normalizePipeline({ funnels: { LEASE: [] } }, DEFAULT_INVESTOR_PIPELINE).funnels.LEASE[0].value, "INTERESTED");
  // Every automatic step targets a starting column.
  for (const v of Object.values(STEP_STAGE)) assert.ok(stages.some((s) => s.value === v), v);
});

test("marketplace steps only move tiles forward", () => {
  assert.equal(advanceStage(stages, null, "INTERESTED"), "INTERESTED");
  assert.equal(advanceStage(stages, "INTERESTED", "LOI_SUBMITTED"), "LOI_SUBMITTED");
  assert.equal(advanceStage(stages, "IN_DILIGENCE", "NDA_SIGNED"), "IN_DILIGENCE");
  assert.equal(advanceStage(stages, "PASSED", "LOI_SUBMITTED"), "PASSED");
  // Funnel without the target column: a new tile goes to the first column, an existing one stays.
  const custom = [{ value: "A", label: "A" }, { value: "B", label: "B" }];
  assert.equal(advanceStage(custom, null, "NDA_SIGNED"), "A");
  assert.equal(advanceStage(custom, "B", "NDA_SIGNED"), "B");
  // Tile whose column was removed is placed again.
  assert.equal(advanceStage(custom, "GONE", "B"), "B");
});

test("existing NDA / LOI history places a tile", () => {
  assert.equal(stepFromHistory({ nda: "APPROVED", loi: "APPROVED", diligence: "APPROVED" }), "DILIGENCE");
  assert.equal(stepFromHistory({ nda: "APPROVED", loi: "APPROVED", diligence: "PENDING" }), "LOI_APPROVED");
  assert.equal(stepFromHistory({ loi: "PENDING" }), "LOI");
  assert.equal(stepFromHistory({ nda: "PENDING" }), "NDA");
  assert.equal(stepFromHistory({ loi: "DECLINED", intake: true }), "INTAKE");
  assert.equal(stepFromHistory({}), "ADDED");
});

test("mandate fit", () => {
  const inv = { preferredStates: "TX,AZ", preferredRegions: "", dealTypes: "FINANCING", facilityTypes: "", mwMin: 50, mwMax: null };
  assert.equal(fitsMandate(inv, { country: "US", state: "TX", dealType: "FINANCING", facilityType: "Powered Land", mw: 120 }), true);
  assert.equal(fitsMandate(inv, { country: "US", state: "TX", dealType: "LEASE", facilityType: "Powered Land", mw: 120 }), false);
  assert.equal(fitsMandate(inv, { country: "US", state: "PR", dealType: "FINANCING", facilityType: "Powered Land", mw: 120 }), false);
  assert.equal(fitsMandate(inv, { country: "US", state: "TX", dealType: "FINANCING", facilityType: "Powered Land", mw: 20 }), false);
  const open = { preferredStates: "", preferredRegions: "", dealTypes: "", facilityTypes: "", mwMin: null, mwMax: null };
  assert.equal(fitsMandate(open, { country: "US", state: "WV", dealType: "SALE", facilityType: "Industrial Conversion", mw: 60 }), true);
});

test("firm names match without case or spacing", () => {
  assert.equal(firmKey("  Meridian   Infrastructure Partners "), firmKey("meridian infrastructure partners"));
});

test("mandate markets cover listings outside the US", () => {
  const eu = { preferredStates: "", preferredRegions: "W_C_EUROPE", dealTypes: "", facilityTypes: "", mwMin: null, mwMax: null };
  assert.equal(fitsMandate(eu, { country: "ES", state: "Madrid", dealType: "SALE", facilityType: "Powered Land", mw: 50 }), true);
  assert.equal(fitsMandate(eu, { country: "US", state: "TX", dealType: "SALE", facilityType: "Powered Land", mw: 50 }), false);
});
