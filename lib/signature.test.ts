import { test } from "node:test";
import assert from "node:assert/strict";
import { applySignature } from "./signature";

const sig = "Joaquin Rivera\nManaging Partner, DEAC\n+1 (787) 555-0100";

test("replaces the app's sign-off with the team member's signature", () => {
  assert.equal(applySignature("Hi Jane,\n\nSign here:\nhttps://x\n\n— Joaquin, DEAC", sig), `Hi Jane,\n\nSign here:\nhttps://x\n\n${sig}`);
  assert.equal(applySignature("Hi\n\n— DEAC Team", sig), `Hi\n\n${sig}`);
});

test("adds the signature below hand-written emails, once", () => {
  assert.equal(applySignature("Thursday works.\n", sig), `Thursday works.\n\n${sig}`);
  assert.equal(applySignature(`Thursday works.\n\n${sig}`, sig), `Thursday works.\n\n${sig}`);
});

test("leaves the email as it is without a signature", () => {
  assert.equal(applySignature("Hi\n\n— DEAC Team", ""), "Hi\n\n— DEAC Team");
  assert.equal(applySignature("Hi", null), "Hi");
});
