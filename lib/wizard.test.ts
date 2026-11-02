import { test } from "node:test";
import assert from "node:assert/strict";
import { briefFor, cleanDraft, effectiveStatus, outputFileName, planSources, projectFactsText, readKind } from "./wizard";
import { PDFDocument } from "pdf-lib";
import { pdfSafe, documentPdf, deckPdf } from "./wizard-export";

test("knows which files it can read", () => {
  assert.equal(readKind("Study.PDF").kind, "pdf");
  assert.equal(readKind("model.xlsm").kind, "xlsx");
  assert.equal(readKind("site.jpeg").kind, "image");
  assert.equal(readKind("notes.docx").kind, "docx");
  assert.equal(readKind("old.xls").kind, null);
  assert.equal(readKind("plan.dwg").kind, null);
});

test("plans sources within the request budget", () => {
  const MB = 1024 * 1024;
  const p = planSources([
    { id: "1", name: "a.pdf", size: 15 * MB },
    { id: "2", name: "b.pdf", size: 10 * MB },
    { id: "3", name: "model.xlsx", size: 30 * MB },
    { id: "4", name: "big.png", size: 6 * MB },
    { id: "5", name: "c.pdf", size: 5 * MB },
    { id: "6", name: "x.dwg", size: 1 },
  ]);
  assert.deepEqual(p.use.map((f) => f.id), ["1", "3", "5"]);
  assert.deepEqual(p.skipped.map((s) => s.name), ["b.pdf", "big.png", "x.dwg"]);
});

test("stale generations count as failed", () => {
  const now = Date.now();
  assert.equal(effectiveStatus("GENERATING", new Date(now - 60_000), now), "GENERATING");
  assert.equal(effectiveStatus("GENERATING", new Date(now - 16 * 60_000), now), "FAILED");
  assert.equal(effectiveStatus("READY", new Date(0), now), "READY");
});

test("briefs", () => {
  const o = { anonymous: true, webResearch: true, instructions: "Stress expansion", audience: "infra funds" };
  const teaser = briefFor("TEASER", o);
  assert.match(teaser, /ANONYMOUS/);
  assert.match(teaser, /Stress expansion/);
  assert.match(teaser, /Web research is ON/);
  assert.match(briefFor("TEASER", { ...o, anonymous: false, webResearch: false }), /Web research is OFF/);
  assert.match(briefFor("CUSTOM", { ...o, instructions: "Summarize the ESA" }), /<brief>\nSummarize the ESA/);
  assert.match(briefFor("DECK", o), /## <Slide title>/);
});

test("cleans drafts and names files", () => {
  assert.equal(cleanDraft("Let me search first.\n# Title\nBody"), "# Title\nBody\n");
  assert.equal(outputFileName("DEAC-TX-001", "TEASER", "x", "pdf"), "DEAC-TX-001 Project Teaser.pdf");
  assert.equal(outputFileName("DEAC-TX-001", "CUSTOM", "ESA: summary/notes", "pdf"), "DEAC-TX-001 ESA- summary-notes.pdf");
});

test("listing facts keep internal valuation labelled", () => {
  const t = projectFactsText({
    code: "DEAC-TX-001", title: "Site", country: "US", state: "TX", county: null, city: "Abilene", mw: 120, facilityType: "Powered Land", dealType: "SALE", fundingNeeded: 96e6,
    projectStatus: "Site Control", summary: "", highlights: "Big\n\nFast", term: null, useOfFunds: "", totalCapex: null, targetIrr: null, equityMultiple: null,
    leaseRateKwMo: null, powerRateCents: 4.5, powerStatus: "Signed", monthsToPower: 18, codDate: null, capitalStack: null, economicsNotes: null, developer: { company: "Acme", website: null },
  }, { score: 82, recommendation: "Buy", perMw: 900000, marketValue: 108e6, low: 91.8e6, high: 118.8e6, askingVsMarket: -0.11 });
  assert.match(t, /Asking price: \$96,000,000/);
  assert.match(t, /Location: Abilene, TX/);
  assert.match(t, /  - Fast/);
  assert.match(t, /internal, never quote it in investor-facing documents/);
  assert.match(t, /-11%/);
});

test("PDF text is limited to what standard fonts can draw", () => {
  assert.equal(pdfSafe("≥ 120 MW → ERCOT – “ok” ≈ 5¢ ☃ é"), ">= 120 MW -> ERCOT – “ok” ~ 5¢  é");
});

test("exports PDFs", async () => {
  const md = "# T\n\n## A\n" + "- item with **bold** and a long line that needs to wrap across the page width\n".repeat(80) + "\n| a | b |\n|--|--|\n" + "| x | y |\n".repeat(60);
  const pdf = Buffer.from(await documentPdf(md, { kindLabel: "Project Report", code: "C" }));
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.ok((await PDFDocument.load(pdf)).getPageCount() >= 3);
  const deck = Buffer.from(await deckPdf("# D\nSub\n\n## S1\n" + "- x\n".repeat(40), { kindLabel: "Pitch Deck", code: "C" }));
  assert.equal((await PDFDocument.load(deck)).getPageCount(), 2);
});
