import { test } from "node:test";
import assert from "node:assert/strict";
import { formatMoneyInput, parseMoney } from "./money";

test("adds thousands separators as you type", () => {
  assert.equal(formatMoneyInput("1"), "1");
  assert.equal(formatMoneyInput("1000"), "1,000");
  assert.equal(formatMoneyInput("1000000"), "1,000,000");
  assert.equal(formatMoneyInput("$12,34567"), "1,234,567");
  assert.equal(formatMoneyInput("250000000.5"), "250,000,000.5");
  assert.equal(formatMoneyInput("1000.567"), "1,000.56");
  assert.equal(formatMoneyInput("007"), "7");
  assert.equal(formatMoneyInput(""), "");
  assert.equal(formatMoneyInput("abc"), "");
});
test("parses back to a plain number", () => {
  assert.equal(parseMoney("1,250,000"), 1250000);
  assert.equal(parseMoney("$2,500.50"), 2500.5);
  assert.equal(parseMoney(""), null);
});
