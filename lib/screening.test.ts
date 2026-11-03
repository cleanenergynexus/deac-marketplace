import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SCREENING, SCREENING_SCHEMA, effectiveAnswer, mergeAi, normalizeTemplate, parseAnswers, parseTemplate, progress, questionsFor,
  resultToAi, screeningMarkdown, sponsorQuestions, sponsorQuestionsText, type ScreeningAnswers,
} from "./screening";

const count = (cats: { questions: unknown[] }[]) => cats.reduce((n, c) => n + c.questions.length, 0);

test("default template covers the seven categories, with Canada-only questions", () => {
  assert.deepEqual(DEFAULT_SCREENING.categories.map((c) => c.id), ["sponsor", "site", "power", "fiber", "permitting", "engineering", "capital"]);
  const us = questionsFor(DEFAULT_SCREENING, "US");
  const ca = questionsFor(DEFAULT_SCREENING, "ca");
  assert.equal(count(ca) - count(us), 2);
  assert.ok(ca.flatMap((c) => c.questions).some((q) => q.id === "site-ca-nation"));
  assert.ok(!us.flatMap((c) => c.questions).some((q) => q.scope === "CA"));
});

test("partner name fills {partner}", () => {
  const qs = questionsFor(DEFAULT_SCREENING, "US").flatMap((c) => c.questions);
  assert.match(qs.find((q) => q.id === "cap-partner-role")!.text, /role you envision for WDC\./);
  const other = questionsFor({ ...DEFAULT_SCREENING, partnerName: "" }, "US").flatMap((c) => c.questions);
  assert.match(other.find((q) => q.id === "cap-partner-role")!.text, /for the partner\./);
});

test("normalizeTemplate keeps ids, drops empties, makes ids unique and safe", () => {
  const t = normalizeTemplate({
    partnerName: "  WDC  ",
    categories: [
      { id: "a", title: " Power ", note: "", questions: [{ id: "x", text: "One", scope: "CA" }, { id: "x", text: "Two" }, { text: "   " }, { id: "BAD ID!", text: "Three", scope: "nope" }] },
      { id: "a", title: "", questions: [{ text: "orphan" }] },
    ],
  });
  assert.equal(t.partnerName, "WDC");
  assert.equal(t.categories.length, 1);
  const ids = t.categories[0].questions.map((q) => q.id);
  assert.deepEqual(ids.slice(0, 2), ["x", "x-2"]);
  assert.match(ids[2], /^[a-z0-9-]+$/);
  assert.equal(t.categories[0].questions[0].scope, "CA");
  assert.equal(t.categories[0].questions[2].scope, "ALL");
  assert.equal(parseTemplate("not json"), DEFAULT_SCREENING);
  assert.deepEqual(parseTemplate(JSON.stringify(DEFAULT_SCREENING)), DEFAULT_SCREENING);
});

const cats = questionsFor(DEFAULT_SCREENING, "US");

test("Claude's answers merge with the team's, and the team wins", () => {
  const prev: ScreeningAnswers = { "power-utility": { ai: null, team: { status: "ANSWERED", answer: "Oncor", verified: true } } };
  const ai = resultToAi(cats, {
    summary: "s", redFlags: [],
    answers: [
      { id: "power-utility", status: "PARTIAL", answer: "Probably Oncor", sources: "web", followUp: "Confirm utility" },
      { id: "[power-capacity]", status: "ANSWERED", answer: "50 MW by Q3 2027", sources: "IX study p.2", followUp: "" },
      { id: "made-up", status: "ANSWERED", answer: "x", sources: "", followUp: "" },
    ],
  });
  assert.equal(ai["power-capacity"].status, "ANSWERED");
  assert.equal(ai["made-up"], undefined);
  assert.equal(ai["occ-operator"].status, "MISSING"); // skipped by Claude → gap with the template question as follow-up
  assert.equal(ai["occ-operator"].followUp, "Occupancy: any identified operator or customer?");
  const merged = mergeAi(prev, ai);
  assert.equal(merged["power-utility"].team.answer, "Oncor");
  assert.deepEqual(effectiveAnswer(merged["power-utility"]), { status: "ANSWERED", answer: "Oncor", byTeam: true });
  assert.equal(effectiveAnswer(merged["power-capacity"]).byTeam, false);
  // Verified-only team entry keeps Claude's status and answer.
  const v = { ai: ai["power-capacity"], team: { status: "" as const, answer: "", verified: true } };
  assert.deepEqual(effectiveAnswer(v), { status: "ANSWERED", answer: "50 MW by Q3 2027", byTeam: false });
  assert.deepEqual(parseAnswers(JSON.stringify(merged)), merged);
  assert.deepEqual(parseAnswers("{bad"), {});
});

test("progress, sponsor questions and the report", () => {
  const answers: ScreeningAnswers = {
    "sponsor-location": { ai: { status: "ANSWERED", answer: "Abilene, TX", sources: "listing", followUp: "" }, team: { status: "", answer: "", verified: true } },
    "sponsor-owner": { ai: { status: "CONFLICT", answer: "Deed says A, deck says B", sources: "deed; deck", followUp: "Who holds title today?" }, team: { status: "", answer: "", verified: false } },
    "gen-technology": { ai: { status: "NA", answer: "Grid only", sources: "deck", followUp: "" }, team: { status: "", answer: "", verified: false } },
  };
  const total = count(cats);
  const p = progress(cats, answers);
  assert.equal(p.total, total);
  assert.equal(p.ANSWERED, 1);
  assert.equal(p.CONFLICT, 1);
  assert.equal(p.NA, 1);
  assert.equal(p.MISSING, total - 3);
  assert.equal(p.verified, 1);
  assert.equal(p.percent, Math.round((2 / total) * 100));

  const groups = sponsorQuestions(cats, answers);
  const all = groups.flatMap((g) => g.items);
  assert.equal(all.length, total - 2);
  assert.equal(all.find((i) => i.id === "sponsor-owner")!.text, "Who holds title today?");
  assert.ok(!all.some((i) => i.id === "gen-technology" || i.id === "sponsor-location"));
  const text = sponsorQuestionsText(cats, answers, "Abilene 100 MW");
  assert.match(text, /^Screening questions: Abilene 100 MW/);
  assert.match(text, /\n1\. Who holds title today\?/);

  const md = screeningMarkdown(cats, answers, { code: "DEAC-TX-001", title: "Abilene | 100 MW", summary: "Good site.", redFlags: ["Title dispute"], decision: "HOLD", decisionNote: "", webSources: [{ title: "Oncor", url: "https://oncor.com" }] });
  assert.match(md, /^# Project Screening: Abilene \| 100 MW/);
  assert.match(md, /Decision: \*\*Hold\*\*/);
  assert.match(md, /## Red flags\n\n- Title dispute/);
  assert.match(md, /\| Location of the project\. \| \*\*Answered\*\*: Abilene, TX \| listing \|/);
  assert.match(md, /## Open questions for the sponsor/);
  assert.match(md, /- Oncor: https:\/\/oncor\.com/);
});

test("schema stays within structured-output limits (no nullable or union fields)", () => {
  const s = JSON.stringify(SCREENING_SCHEMA);
  assert.ok(!s.includes("null"));
  assert.ok(!s.includes("anyOf"));
});
