import { test } from "node:test";
import assert from "node:assert/strict";
import { markdownTitle, parseInline, parseMarkdown, splitSlides, spansText } from "./markdown";

test("inline styles and links", () => {
  assert.deepEqual(parseInline("**120 MW** on *ERCOT* via [Oncor](https://oncor.com)."), [
    { text: "120 MW", bold: true }, { text: " on " }, { text: "ERCOT", italic: true }, { text: " via " }, { text: "Oncor", href: "https://oncor.com" }, { text: "." },
  ]);
  assert.deepEqual(parseInline("snake_case_name stays"), [{ text: "snake_case_name stays" }]);
  assert.deepEqual(parseInline("**Power secured:** signed"), [{ text: "Power secured:", bold: true }, { text: " signed" }]);
});

test("blocks: headings, lists, tables, quotes", () => {
  const b = parseMarkdown("# Title\n\nIntro line one\nline two\n\n## Key Terms\n\n| Item | Detail |\n|---|---|\n| MW | 120 |\n| State | TX |\n\n- one\n- two\n  continued\n\n1. first\n2. second\n\n> note\n\n---");
  assert.deepEqual(b.map((x) => x.type), ["heading", "paragraph", "heading", "table", "list", "list", "quote", "rule"]);
  assert.equal(spansText((b[1] as Extract<(typeof b)[number], { type: "paragraph" }>).spans), "Intro line one line two");
  const t = b[3] as Extract<(typeof b)[number], { type: "table" }>;
  assert.equal(t.rows.length, 2);
  assert.equal(spansText(t.rows[0][1]), "120");
  const l = b[4] as Extract<(typeof b)[number], { type: "list" }>;
  assert.equal(l.ordered, false);
  assert.equal(spansText(l.items[1]), "two continued");
  assert.equal((b[5] as { ordered: boolean }).ordered, true);
});

test("title and slides", () => {
  const md = "# Big Deck\nSubtitle here\n\n## Slide A\n- x\n\n## Slide B\n| a | b |\n|--|--|\n| 1 | 2 |\n";
  assert.equal(markdownTitle(md), "Big Deck");
  const d = splitSlides(md);
  assert.equal(d.title, "Big Deck");
  assert.equal(d.cover.length, 1);
  assert.deepEqual(d.slides.map((s) => s.title), ["Slide A", "Slide B"]);
  assert.equal(d.slides[1].blocks[0].type, "table");
});
