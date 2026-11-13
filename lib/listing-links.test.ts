import { test } from "node:test";
import assert from "node:assert/strict";
import { duplicateTitle, freeDealTypes, groupRootId, syncedData, SYNCED_FIELDS } from "./listing-links";

test("only project facts sync; the deal stays per listing", () => {
  const data = { title: "Abilene Sale", developerId: "d1", mw: 120, facilityType: "Powered Shell", dealType: "SALE", fundingNeeded: 5e7, summary: "s", visibility: "PRIVATE", dealStage: "MARKETING", leaseRateKwMo: 140, monthsToPower: null, country: "US", state: "TX" };
  assert.deepEqual(syncedData(data), { developerId: "d1", mw: 120, facilityType: "Powered Shell", monthsToPower: null, country: "US", state: "TX" });
  for (const k of ["title", "summary", "highlights", "dealType", "fundingNeeded", "visibility", "dealStage", "leaseRateKwMo", "term", "disclosure", "ndaUrl", "code", "pipelineStage"]) {
    assert.ok(!(SYNCED_FIELDS as readonly string[]).includes(k), `${k} must stay per listing`);
  }
});

test("skips undefined values so a partial update doesn't blank the others", () => {
  assert.deepEqual(syncedData({ mw: undefined, valueScore: 72 }), { valueScore: 72 });
});

test("the original listing owns the group", () => {
  assert.equal(groupRootId({ id: "a", linkedToId: null }), "a");
  assert.equal(groupRootId({ id: "b", linkedToId: "a" }), "a");
});

test("suggests the deal types not used yet", () => {
  assert.deepEqual(freeDealTypes(["SALE"], ["LEASE", "FINANCING", "SALE"]), ["LEASE", "FINANCING"]);
  assert.deepEqual(freeDealTypes(["SALE", "LEASE", "FINANCING"], ["LEASE", "FINANCING", "SALE"]), []);
});

test("titles the duplicate by its deal type", () => {
  assert.equal(duplicateTitle("Abilene Powered Shell - Sale", "SALE", "LEASE"), "Abilene Powered Shell - Lease");
  assert.equal(duplicateTitle("Abilene Campus for sale", "SALE", "FINANCING"), "Abilene Campus for Financing");
  assert.equal(duplicateTitle("Abilene Campus", "SALE", "LEASE"), "Abilene Campus (Lease)");
});
