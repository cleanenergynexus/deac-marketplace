import { test } from "node:test";
import assert from "node:assert/strict";
import { flag, formatPhone, normalizePhone, parsePhone, phoneFromForm, telHref } from "./phone";

test("US numbers without a country code are assumed US", () => {
  for (const raw of ["2145550142", "214-555-0142", "(214) 555 0142", "1 214 555 0142", "214.555.0142"])
    assert.equal(normalizePhone(raw), "+12145550142", raw);
  assert.equal(formatPhone("2145550142"), "+1 (214) 555-0142");
  assert.equal(formatPhone("+1 214 555 0142"), "+1 (214) 555-0142");
});

test("international numbers keep their country", () => {
  assert.equal(normalizePhone("+44 (0)20 7946 0958"), "+442079460958");
  assert.equal(formatPhone("+442079460958"), "+44 20 7946 0958");
  assert.equal(formatPhone("+447911123456"), "+44 7911 123456");
  assert.equal(formatPhone("+525512345678"), "+52 55 1234 5678");
  assert.equal(formatPhone("0034 912 345 678"), "+34 912 345 678");
  assert.equal(formatPhone("011 971 50 123 4567"), "+971 50 123 4567");
  assert.equal(formatPhone("+39 06 1234 5678"), "+39 06 1234 5678");
  assert.equal(normalizePhone("06 1234 5678", "IT"), "+390612345678");
});

test("national numbers in the picked country", () => {
  assert.equal(normalizePhone("020 7946 0958", "GB"), "+442079460958");
  assert.equal(normalizePhone("55 1234 5678", "MX"), "+525512345678");
  assert.equal(normalizePhone("+44 20 7946 0958", "US"), "+442079460958"); // a typed + wins over the picker
});

test("Puerto Rico and Canada share +1", () => {
  assert.equal(parsePhone("+1 787 555 0110")?.country.iso, "PR");
  assert.equal(formatPhone("+17875550110"), "+1 (787) 555-0110");
  assert.equal(parsePhone("416 555 0199", "CA")?.country.iso, "CA");
});

test("extensions", () => {
  assert.equal(normalizePhone("214-555-0142 x12"), "+12145550142 ext. 12");
  assert.equal(formatPhone("+12145550142 ext. 12"), "+1 (214) 555-0142 ext. 12");
  assert.equal(telHref("+12145550142 ext. 12"), "tel:+12145550142,12");
});

test("text that isn't a number is kept as typed", () => {
  assert.equal(normalizePhone("call the office"), "call the office");
  assert.equal(normalizePhone("555-0142"), "555-0142");
  assert.equal(formatPhone("555-0142"), "555-0142");
  assert.equal(normalizePhone("  "), null);
  assert.equal(formatPhone(null), "");
});

test("normalizing twice changes nothing", () => {
  for (const raw of ["+12145550142", "+442079460958 ext. 4", "+390612345678", "+6591234567"]) assert.equal(normalizePhone(raw), raw);
});

test("form fields", () => {
  const f = new FormData();
  f.set("phone", "020 7946 0958");
  f.set("phoneCountry", "GB");
  f.set("mobile", "(214) 555-0177");
  assert.equal(phoneFromForm(f, "phone"), "+442079460958");
  assert.equal(phoneFromForm(f, "mobile"), "+12145550177");
  assert.equal(phoneFromForm(f, "fax"), null);
});

test("flags", () => assert.equal(flag("us"), "🇺🇸"));
