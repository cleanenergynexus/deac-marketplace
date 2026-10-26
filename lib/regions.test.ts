import { test } from "node:test";
import assert from "node:assert/strict";
import { marketMatches, marketSummary, SUB_REGIONS } from "./regions";
import { US_STATES } from "./constants";

test("no preference matches any listing", () => assert.ok(marketMatches([], [], "TX")));
test("state preference", () => { assert.ok(marketMatches(["TX"], [], "TX")); assert.ok(!marketMatches(["TX"], [], "VA")); });
test("North America covers US states, LatAm & Caribbean covers PR", () => {
  assert.ok(marketMatches([], ["NORTH_AMERICA"], "VA"));
  assert.ok(!marketMatches([], ["NORTH_AMERICA"], "PR"));
  assert.ok(marketMatches([], ["LATAM_CARIB"], "PR"));
  assert.ok(!marketMatches([], ["EAST_ASIA"], "TX"));
});
test("summary", () => {
  assert.equal(marketSummary("", ""), "Any");
  assert.equal(marketSummary(US_STATES.join(","), SUB_REGIONS.map((r) => r.code).join(",")), "All regions; All US states");
  assert.equal(marketSummary("TX", "MENA"), "Middle East & North Africa; TX");
});
