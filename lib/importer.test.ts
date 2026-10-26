import { test } from "node:test";
import assert from "node:assert/strict";
import { EXTRACTION_SCHEMA, matchDeveloper, toImportResult, type Extraction } from "./importer";

// What Claude returns for the Pittsburgh Powered Shell teaser (the wizard's reference document).
const pittsburgh: Extraction = {
  title: "Pittsburgh Powered Shell – 3.5 MW",
  sponsorCompany: "Five9s Digital",
  sponsorWebsite: "",
  contacts: [
    { name: "Doug Hollidge", company: "Five9s Digital", role: "Sponsor", email: "Doug@Five9sDigital.com", phone: "704.651.2210" },
    { name: "John Bilyak", company: "Colliers", role: "Broker", email: "John.Bilyak@Colliers.com", phone: "412.638.1753" },
  ],
  state: "PA",
  city: "Pittsburgh",
  address: "5400 Campbells Run Road, Pittsburgh, PA",
  mw: 3.5,
  expansionMw: 40,
  acres: -1,
  buildingSqft: 130000,
  facilityType: "Powered Shell",
  dealType: "SALE",
  fundingNeeded: -1,
  projectStatus: "Power Secured",
  summary: "130,000 SF former Verizon operations center with 3.5 MW on site.",
  highlights: ["● 3.5 MW on site", "Scalable +40 MW in 2 years", ""],
  totalCapex: -1,
  targetIrr: -1,
  equityMultiple: -1,
  leaseRateKwMo: -1,
  powerRateCents: -1,
  powerStatus: "Live",
  monthsToPower: 0,
  codDate: "",
  capitalStack: "",
  economicsNotes: "Available for sale or lease.",
  utility: "Duquesne Light",
  scoring: { marketTier: "Secondary", infrastructure: "", environmentalRisk: "", sellerMotivation: "", fiber: "Excellent", water: "", entitlements: "", backupPower: "Yes", substation: "On-Site", density: "", transmission: "" },
  missing: ["asking price", "power rate"],
};

test("turns the Pittsburgh extraction into a listing draft", () => {
  const r = toImportResult(pittsburgh, [{ id: "d1", company: "Lone Star Power Partners" }]);
  assert.equal(r.listing.state, "PA");
  assert.equal(r.listing.mw, "3.5");
  assert.equal(r.listing.facilityType, "Powered Shell");
  assert.equal(r.listing.fundingNeeded, "");
  assert.equal(r.listing.monthsToPower, "0");
  assert.equal(r.listing.powerRateCents, "");
  assert.equal(r.listing.highlights, "3.5 MW on site\nScalable +40 MW in 2 years");
  assert.match(r.listing.economicsNotes, /130,000 SF building/);
  assert.match(r.listing.economicsNotes, /Duquesne Light/);
  assert.match(r.listing.economicsNotes, /\+40 MW/);
  assert.doesNotMatch(r.listing.economicsNotes, /acres/);
  assert.deepEqual(r.blank, ["fundingNeeded"]);
  assert.deepEqual(r.developer, { company: "Five9s Digital", contactName: "Doug Hollidge", email: "Doug@Five9sDigital.com", phone: "704.651.2210", website: "" });
  assert.equal(r.developerMatchId, null);
  assert.deepEqual(r.valuation, { assetType: "Powered Shell", mw: 3.5, powerStatus: "Live", monthsToPower: 0, expansionMw: 40, marketTier: "Secondary", fiber: "Excellent", backupPower: "Yes", substation: "On-Site" });
});

test("drops values outside the allowed choices", () => {
  const r = toImportResult({ ...pittsburgh, state: "Pennsylvania", facilityType: "Warehouse", dealType: "LEASE", fundingNeeded: 12_500_000 }, []);
  assert.equal(r.listing.state, "");
  assert.equal(r.listing.facilityType, "");
  assert.equal(r.listing.fundingNeeded, "12500000");
  assert.equal(r.valuation.askingPrice, undefined); // only a sale price feeds the calculator
  assert.deepEqual(r.blank, ["state", "facilityType"]);
});

test("matches an existing developer by company name", () => {
  const devs = [{ id: "a", company: "Five9s Digital, LLC" }, { id: "b", company: "Colliers" }];
  assert.equal(matchDeveloper("Five9s Digital", devs), "a");
  assert.equal(matchDeveloper("five9s digital llc", devs), "a");
  assert.equal(matchDeveloper("Acme", devs), null);
});

test("schema stays inside the structured-output limits", () => {
  const json = JSON.stringify(EXTRACTION_SCHEMA);
  assert.equal(json.includes("anyOf"), false); // max 16 union-typed fields per request
  const walk = (o: { properties?: Record<string, unknown>; required?: readonly string[]; items?: unknown }): void => {
    if (o.properties) assert.deepEqual([...(o.required ?? [])].sort(), Object.keys(o.properties).sort());
    for (const v of Object.values(o.properties ?? {})) walk(v as never);
    if (o.items) walk(o.items as never);
  };
  walk(EXTRACTION_SCHEMA as never);
});
