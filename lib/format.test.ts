import { test } from "node:test";
import assert from "node:assert/strict";
import { titleCase } from "./format";

test("title-cases headings and keeps short words and acronyms", () => {
  assert.equal(titleCase("site & real estate"), "Site & Real Estate");
  assert.equal(titleCase("Power & interconnection"), "Power & Interconnection");
  assert.equal(titleCase("import from a web page or document"), "Import from a Web Page or Document");
  assert.equal(titleCase("role for WDC"), "Role for WDC");
  assert.equal(titleCase("pre-research with AI"), "Pre-Research with AI");
  assert.equal(titleCase("what to look for"), "What to Look For");
  assert.equal(titleCase("NDAs, LOIs & diligence"), "NDAs, LOIs & Diligence");
});
