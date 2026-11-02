import { test } from "node:test";
import assert from "node:assert/strict";
import { codeRegion, locationFromForm, placeFull, placeRegion, placeShort } from "./location";

const form = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

test("reads the listing location form", () => {
  assert.deepEqual(locationFromForm(form({ country: "us", state: "tx", county: "", city: " Abilene " })), { country: "US", state: "TX", county: null, city: "Abilene" });
  assert.deepEqual(locationFromForm(form({ country: "ES", state: "Comunidad de Madrid" })), { country: "ES", state: "Comunidad de Madrid", county: null, city: null });
  assert.equal(locationFromForm(form({ country: "US", state: "Ontario" })).state, ""); // not a US state
});

test("formats places", () => {
  assert.equal(placeShort({ country: "US", state: "TX" }), "TX");
  assert.equal(placeShort({ country: "US", state: "" }), "United States");
  assert.equal(placeShort({ country: "CA", state: "Ontario" }), "Ontario, Canada");
  assert.equal(placeShort({ country: "ES", state: "" }), "Spain");
  assert.equal(placeFull({ country: "US", state: "TX", county: "Taylor County", city: "Abilene" }), "Abilene, Taylor County, TX");
  assert.equal(placeFull({ country: "MX", state: "Querétaro", city: null }), "Querétaro, Mexico");
});

test("tile region", () => {
  assert.equal(placeRegion({ country: "US", state: "TX" }), "TX");
  assert.equal(placeRegion({ country: "ES", state: "Comunidad de Madrid" }), "Spain");
});

test("listing codes", () => {
  assert.equal(codeRegion({ country: "US", state: "TX" }), "TX");
  assert.equal(codeRegion({ country: "US", state: "" }), "US");
  assert.equal(codeRegion({ country: "es", state: "Madrid" }), "ES");
});
