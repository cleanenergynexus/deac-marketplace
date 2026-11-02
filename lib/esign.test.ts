import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { cleanValues, fieldText, missingValues, normalizeFields, panelFor, signedFileName, splitName, initialsOf, type SignField } from "./esign";
import { buildSignedPdf, inspectPdf, sha256 } from "./esign-pdf";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

test("normalizes editor fields", () => {
  const f = normalizeFields([
    { id: "a", type: "SIGNATURE", page: 0, x: 0.95, y: -1, w: 0.2, h: 0.05 },
    { id: "a", type: "NAME", page: 1, x: 0.1, y: 0.1 },
    { type: "BOGUS", page: 0 },
    { type: "NAME", page: 5 },
    { type: "CHECKBOX", page: 0, x: 0, y: 0, label: "  I am accredited  " },
  ], 2);
  assert.equal(f.length, 3);
  assert.equal(f[0].x, 0.8); // pulled back inside the page
  assert.equal(f[0].y, 0);
  assert.equal(f[0].required, true);
  assert.notEqual(f[1].id, "a"); // duplicate id renamed
  assert.equal(f[1].w, 0.24); // default size
  assert.equal(f[2].required, false); // checkboxes are optional unless set
  assert.equal(f[2].label, "I am accredited");
  assert.deepEqual(normalizeFields("nope", 1), []);
});

const fields: SignField[] = [
  { id: "s", type: "SIGNATURE", page: 0, x: 0.1, y: 0.8, w: 0.3, h: 0.05, required: true },
  { id: "d", type: "DATE", page: 0, x: 0.5, y: 0.8, w: 0.2, h: 0.03, required: true },
  { id: "a", type: "ADDRESS", page: 0, x: 0.1, y: 0.2, w: 0.5, h: 0.03, required: true },
  { id: "c", type: "COMPANY", page: 0, x: 0.1, y: 0.25, w: 0.3, h: 0.03, required: false },
  { id: "x", type: "CHECKBOX", page: 0, x: 0.1, y: 0.3, w: 0.02, h: 0.02, required: true, label: "1031 exchange" },
];

test("panel asks for what the fields need, name always", () => {
  const p = panelFor(fields);
  assert.deepEqual(p.profile.map((x) => `${x.key}:${x.required}`), ["name:true", "company:false", "street:true", "city:true", "region:false", "postalCode:true", "country:true"]);
  assert.equal(p.signature, true);
  assert.equal(p.initials, false);
  assert.equal(p.custom.length, 1);
});

test("lists what's missing, then nothing", () => {
  assert.deepEqual(missingValues(fields, {}), ["Full name", "Address", "City", "Zip / postal code", "Country", "Signature", "1031 exchange"]);
  const v = { name: "Ana Ruiz", street: "1 Main St", city: "Austin", region: "TX", postalCode: "78741", country: "US", signature: PNG, custom: { x: "yes" } };
  assert.deepEqual(missingValues(fields, v), []);
  assert.equal(fieldText(fields[2], v, null), "1 Main St, Austin, TX 78741, United States");
  assert.equal(fieldText(fields[1], v, new Date("2026-11-02T15:00:00Z")), "November 2, 2026");
  assert.equal(fieldText(fields[4], v, null), "X");
});

test("cleanValues drops what wasn't asked and bad images", () => {
  const v = cleanValues(fields, { name: "  Ana  ", title: "CEO", signature: "data:image/svg+xml;base64,AAAA", country: "us", custom: { x: "yes", zz: "hack" } } as never);
  assert.equal(v.name, "Ana");
  assert.equal(v.title, undefined);
  assert.equal(v.signature, undefined);
  assert.equal(v.country, "US");
  assert.deepEqual(v.custom, { x: "yes" });
});

test("names", () => {
  assert.deepEqual(splitName("Joaquin de la Altenberg"), { first: "Joaquin de la", last: "Altenberg" });
  assert.equal(initialsOf("ana maria ruiz"), "AMR");
  assert.equal(signedFileName("NDA: Project/Alpha", "Ana Ruiz"), "NDA Project Alpha - Ana Ruiz - signed.pdf");
});

test("stamps the fields and appends a certificate", async () => {
  const src = await PDFDocument.create();
  src.addPage([612, 792]);
  const bytes = await src.save();
  assert.deepEqual(await inspectPdf(bytes), { pageCount: 1 });
  assert.ok("error" in (await inspectPdf(new TextEncoder().encode("hello"))));
  const v = { name: "Ana Ruiz", street: "1 Main St", city: "Austin", region: "TX", postalCode: "78741", country: "US", signature: PNG, company: "Fondo “Ñ” 中", custom: { x: "yes" } };
  const out = await buildSignedPdf(bytes, fields, v, new Date("2026-11-02T15:00:00Z"), {
    requestId: "req1", title: "Confidentiality Agreement", sourceName: "nda.pdf", sourceHash: sha256(bytes), consent: "I agree.",
    signer: { name: "Ana Ruiz", email: "ana@example.com", company: "Fondo", kind: "Investor" },
    events: [{ at: new Date(), action: "SENT", detail: "To Ana", ip: "1.2.3.4", userAgent: "Test" }, { at: new Date(), action: "SIGNED" }],
  });
  const signed = await PDFDocument.load(out);
  assert.equal(signed.getPageCount(), 2);
  assert.equal(signed.getTitle(), "Confidentiality Agreement");
});
