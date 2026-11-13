import { test } from "node:test";
import assert from "node:assert/strict";
import { agentAssigneeOptions, changesToData, diffListingEdit, parseChanges, readValue, showValue, AGENT_EDIT_FIELDS } from "./listing-collab";

const listing = { title: "Dallas Campus", summary: "Powered land", highlights: "", mw: 40, projectStatus: "Permitting", state: "TX", county: null, city: "Dallas", fundingNeeded: 12_000_000, term: null, totalCapex: null, powerStatus: "Signed", monthsToPower: 18, visibility: "PRIVATE", dealType: "SALE" };

test("only changed fields are saved", () => {
  const { changes, invalid } = diffListingEdit(listing, { title: "Dallas Campus", summary: "Powered land\r\n", mw: "45", fundingNeeded: "$12,000,000", city: "Dallas ", monthsToPower: "12", county: "" });
  assert.deepEqual(invalid, []);
  assert.deepEqual(changes, [
    { field: "mw", from: 40, to: 45 },
    { field: "monthsToPower", from: 18, to: 12 },
  ]);
});

test("invalid values are reported by label", () => {
  const { changes, invalid } = diffListingEdit(listing, { mw: "lots", projectStatus: "Done", title: "  " });
  assert.deepEqual(changes, []);
  assert.deepEqual(invalid.sort(), ["Capacity (MW)", "Listing title", "Project status"]);
});

test("fields agents can not touch are ignored, even if posted", () => {
  const { changes } = diffListingEdit(listing, { visibility: "TEASER", dealType: "LEASE", valueScore: "99", city: "Fort Worth" });
  assert.deepEqual(changes, [{ field: "city", from: "Dallas", to: "Fort Worth" }]);
  assert.ok(!AGENT_EDIT_FIELDS.some((f) => ["visibility", "dealType", "dealStage", "developerId", "valuationInputs", "disclosure"].includes(f.key)));
});

test("clearing an optional field saves it empty", () => {
  const { changes } = diffListingEdit({ ...listing, term: "15-yr lease", state: "TX" }, { term: "", state: "" });
  assert.deepEqual(changes, [{ field: "state", from: "TX", to: "" }, { field: "term", from: "15-yr lease", to: null }]);
});

test("logged edits are re-checked before they are written", () => {
  const stored = JSON.stringify([{ field: "mw", from: 40, to: 45 }, { field: "visibility", from: "DRAFT", to: "TEASER" }, { field: "powerStatus", from: null, to: "Nonsense" }, { field: "city", from: "Dallas", to: "Plano" }]);
  const changes = parseChanges(stored);
  assert.equal(changes.length, 3); // visibility dropped
  assert.deepEqual(changesToData(changes), { mw: 45, city: "Plano" }); // bad power status dropped
  assert.deepEqual(changesToData(changes, new Set(["city"])), { city: "Plano" });
  assert.deepEqual(parseChanges("not json"), []);
});

test("values read for the review table", () => {
  assert.equal(showValue("fundingNeeded", 12_000_000), "$12,000,000");
  assert.equal(showValue("county", null), "—");
  assert.equal(showValue("mw", 45), "45");
  assert.equal(readValue(AGENT_EDIT_FIELDS.find((f) => f.key === "monthsToPower")!, "6.6"), 7);
});

test("agents assign to themselves, their partner, then the rest of the team", () => {
  const team = [{ id: "zed", name: "Zed" }, { id: "ana", name: "Ana" }, { id: "pat", name: "Pat" }];
  assert.deepEqual(agentAssigneeOptions({ id: "ag", name: "Jo Agent", partnerId: "pat" }, team).map((o) => o.name), ["Me (Jo Agent)", "Pat (your DEAC partner)", "Ana", "Zed"]);
  assert.deepEqual(agentAssigneeOptions({ id: "ag", name: "Jo", partnerId: null }, team).map((o) => o.id), ["ag", "ana", "pat", "zed"]);
});
