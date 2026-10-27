import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_INPUTS, OPTIONS, evaluate, valueScore, type ValuationInputs } from "./valuation";
import { DEFAULT_SCORING, maxRawScore, normalizeScoring, parseScoring } from "./scoring";

// The workbook's B38 formula, as it was hard-coded before scoring became editable.
function workbookScore(i: ValuationInputs) {
  const pick = (v: string, m: Record<string, number>, f: number) => (v in m ? m[v] : f);
  const s =
    pick(i.powerStatus, { Live: 25, Signed: 18, Queued: 9 }, 3) +
    Math.max(0, 16 - i.monthsToPower * 0.35) +
    Math.max(0, 14 - i.powerRateCents * 1.8) +
    pick(i.marketTier, { Primary: 6, Secondary: 7 }, 4) +
    (i.infrastructure === "Substation+Fiber+Roads" ? 11 : 8) +
    Math.min(9, i.expansionMw * 0.3) +
    pick(i.environmentalRisk, { Low: 7, Moderate: 4 }, 1) +
    (i.fiber === "Excellent" ? 7 : 4) + (i.water === "Excellent" ? 5 : 3) + (i.entitlements === "Fully Entitled" ? 8 : 5) +
    (i.backupPower === "Yes" ? 6 : 3) + (i.substation === "On-Site" ? 7 : 4) + (i.density === "Liquid Capable" ? 7 : 4) + (i.transmission === "High" ? 6 : 3);
  return Math.round(s + Number.EPSILON);
}

test("default settings reproduce the workbook score for every selection", () => {
  for (const [k, opts] of Object.entries(OPTIONS)) {
    for (const o of opts) {
      for (const [m, r, e] of [[0, 4.5, 10], [7, 3, 0], [24, 6.2, 40], [60, 9, 5]]) {
        const i = { ...DEFAULT_INPUTS, [k]: o, monthsToPower: m, powerRateCents: r, expansionMw: e };
        assert.equal(valueScore(i), workbookScore(i), `${k}=${o} m=${m} r=${r} e=${e}`);
      }
    }
  }
  assert.equal(maxRawScore(DEFAULT_SCORING), 135);
});

test("edited points, weights and thresholds change the score", () => {
  const cfg = normalizeScoring({ ...DEFAULT_SCORING, levels: { ...DEFAULT_SCORING.levels, infrastructure: { weight: 2, points: { ...DEFAULT_SCORING.levels.infrastructure.points, None: 0 } } } });
  const none = { ...DEFAULT_INPUTS, infrastructure: "None" };
  assert.equal(valueScore(none, cfg), valueScore(none) - 8); // None now 0 instead of 8
  assert.equal(valueScore(DEFAULT_INPUTS, cfg), valueScore(DEFAULT_INPUTS) + 11); // all three now 22 instead of 11
  const strict = normalizeScoring({ thresholds: { buy: 200, negotiate: 100 } });
  assert.equal(evaluate(DEFAULT_INPUTS, strict).recommendation.label, "Negotiate");
});

test("scale to 100 puts the best possible site at 100", () => {
  const cfg = normalizeScoring({ scaleTo100: true });
  const best = { ...DEFAULT_INPUTS, marketTier: "Secondary", fiber: "Excellent", water: "Excellent", monthsToPower: 0, powerRateCents: 0, expansionMw: 100 };
  assert.equal(valueScore(best, cfg), 100);
  assert.equal(valueScore(DEFAULT_INPUTS, cfg), Math.round((valueScore(DEFAULT_INPUTS) / 135) * 100));
});

test("bad or partial saved settings fall back to defaults", () => {
  assert.deepEqual(parseScoring("not json"), DEFAULT_SCORING);
  assert.deepEqual(parseScoring(null), DEFAULT_SCORING);
  const c = normalizeScoring({ levels: { fiber: { weight: "x", points: { Excellent: 9 } } }, numeric: { expansion: { max: -5 } } });
  assert.equal(c.levels.fiber.points.Excellent, 9);
  assert.equal(c.levels.fiber.points.Good, 4);
  assert.equal(c.levels.fiber.weight, 1);
  assert.equal(c.numeric.expansion.max, 0);
});
