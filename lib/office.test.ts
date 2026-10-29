import { test } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { decodeXml, docxText, pptxText, xlsxText } from "./office";
import { deckPptx } from "./wizard-export";

const zip = async (files: Record<string, string>) => {
  const z = new JSZip();
  for (const [n, c] of Object.entries(files)) z.file(n, c);
  return z.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
};

test("decodes XML entities", () => {
  assert.equal(decodeXml("A &amp; B &lt;5&gt; &#8211; &#x2014; &amp;lt;"), "A & B <5> – — &lt;");
});

test("reads Word paragraphs and tables", async () => {
  const buf = await zip({ "word/document.xml": `<w:document><w:body><w:p><w:r><w:t>Site: 210 acres</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>MW</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t xml:space="preserve">120 &amp; more</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>` });
  const t = docxText(buf);
  assert.match(t, /Site: 210 acres/);
  assert.match(t, /MW\s*\n?\s*\|\s*120 & more/);
});

test("reads Excel values with shared strings and row numbers", async () => {
  const buf = await zip({
    "xl/workbook.xml": `<workbook><sheets><sheet name="Model" sheetId="1" r:id="rId1"/><sheet name="Hidden" sheetId="2" state="hidden" r:id="rId2"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="/xl/worksheets/sheet2.xml"/></Relationships>`,
    "xl/sharedStrings.xml": `<sst><si><t>Capex</t></si><si><r><t>Power</t></r><r><t xml:space="preserve"> rate</t></r></si></sst>`,
    "xl/worksheets/sheet1.xml": `<worksheet><sheetData><row r="2"><c r="A2" t="s"><v>0</v></c><c r="C2"><f>SUM(X1)</f><v>96000000.0000001</v></c></row><row r="3"><c r="A3" t="s"><v>1</v></c><c r="B3" t="inlineStr"><is><t>4.5</t></is></c></row></sheetData></worksheet>`,
    "xl/worksheets/sheet2.xml": `<worksheet><sheetData><row r="1"><c r="A1" t="b"><v>1</v></c></row></sheetData></worksheet>`,
  });
  const t = xlsxText(buf);
  assert.match(t, /=== Sheet: Model ===\n2\tCapex\t\t96000000\n3\tPower rate\t4\.5/);
  assert.match(t, /=== Sheet: Hidden \(hidden\) ===\n1\tTRUE/);
});

test("reads PowerPoint slides in order (round trip through the deck export)", async () => {
  const pptx = await deckPptx("# Deck\nSub\n\n## First\n- **Bold** lead in\n\n## Second\nPlain text", { kindLabel: "Pitch Deck", code: "DEAC-TX-1" });
  const t = pptxText(pptx);
  assert.ok(t.indexOf("First") < t.indexOf("Second"));
  assert.match(t, /Bold lead in/);
  // Each paragraph has one set of paragraph settings (PowerPoint rejects more).
  const z = await JSZip.loadAsync(pptx);
  const xml = await z.file("ppt/slides/slide2.xml")!.async("string");
  assert.doesNotMatch(xml, /<\/a:r><a:pPr/);
});
