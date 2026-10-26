import { test } from "node:test";
import assert from "node:assert/strict";
import { ALL_LEAVES, expandMarkets, marketMatches, marketsOverlap, marketSummary, packMarkets } from "./regions";
import { US_STATES } from "./constants";

test("no preference matches any listing", () => assert.ok(marketMatches([], [], "TX")));
test("state preference", () => { assert.ok(marketMatches(["TX"], [], "TX")); assert.ok(!marketMatches(["TX"], [], "VA")); });
test("region preference", () => {
  assert.ok(marketMatches([], ["NORTH_AMERICA"], "VA"));
  assert.ok(marketMatches([], ["USA"], "VA"));
  assert.ok(!marketMatches([], ["CANADA"], "VA"));
  assert.ok(marketMatches([], ["LATAM_CARIB"], "PR"));
  assert.ok(!marketMatches([], ["EAST_ASIA"], "TX"));
});
test("pack and expand round trip", () => {
  const leaves = new Set([...US_STATES, "MEXICO"]);
  const packed = packMarkets(leaves);
  assert.deepEqual(packed.regions, ["USA", "MEXICO"]);
  assert.equal(packed.states.length, US_STATES.length);
  assert.deepEqual([...expandMarkets(packed.states, packed.regions)].sort(), [...leaves].sort());
  // Old saved data with a parent code still expands to its children.
  assert.ok(expandMarkets([], ["NORTH_AMERICA"]).has("TX"));
  assert.ok(packMarkets(new Set(ALL_LEAVES)).regions.includes("AMERICAS"));
});
test("outreach overlap", () => {
  assert.ok(marketsOverlap(["TX"], [], ["NORTH_AMERICA"]));
  assert.ok(!marketsOverlap(["TX"], [], ["MENA"]));
});
test("summary", () => {
  assert.equal(marketSummary("", ""), "Any");
  assert.equal(marketSummary("", "AMERICAS,EMEA,APAC"), "All regions");
  assert.equal(marketSummary(US_STATES.join(","), "CANADA,MEXICO,MENA"), "North America; Middle East & North Africa");
  assert.equal(marketSummary("TX,VA", "MEXICO"), "TX, VA; Mexico");
  assert.equal(marketSummary(US_STATES.join(","), ""), "All US states");
});
