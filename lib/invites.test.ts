import { test } from "node:test";
import assert from "node:assert/strict";
import { hashInviteToken, inviteExpired, inviteUrl, loginState, newInvite, stageAfterInvite } from "./invites";

test("new invites are random, hashed and expire in 14 days", () => {
  const now = new Date("2026-10-30T00:00:00Z");
  const a = newInvite(now), b = newInvite(now);
  assert.notEqual(a.token, b.token);
  assert.equal(a.hash, hashInviteToken(a.token));
  assert.notEqual(a.hash, a.token);
  assert.equal(a.expiresAt.toISOString(), "2026-11-13T00:00:00.000Z");
  assert.match(a.token, /^[A-Za-z0-9_-]{40,}$/);
});

test("invite link and expiry", () => {
  assert.equal(inviteUrl("https://marketplace.deacna.com/", "abc"), "https://marketplace.deacna.com/invite/abc");
  const now = new Date("2026-10-30T00:00:00Z");
  assert.equal(inviteExpired(null, now), true);
  assert.equal(inviteExpired(new Date("2026-10-29T00:00:00Z"), now), true);
  assert.equal(inviteExpired(new Date("2026-10-31T00:00:00Z"), now), false);
});

test("login state", () => {
  const now = new Date("2026-10-30T00:00:00Z");
  assert.equal(loginState(null, now), "NONE");
  assert.equal(loginState({ status: "APPROVED", inviteTokenHash: "h", inviteExpiresAt: new Date("2026-11-01") }, now), "INVITED");
  assert.equal(loginState({ status: "APPROVED", inviteTokenHash: "h", inviteExpiresAt: new Date("2026-10-01") }, now), "INVITE_EXPIRED");
  assert.equal(loginState({ status: "APPROVED", inviteTokenHash: null, inviteExpiresAt: null }, now), "APPROVED");
  assert.equal(loginState({ status: "PENDING", inviteTokenHash: null, inviteExpiresAt: null }, now), "PENDING");
  assert.equal(loginState({ status: "REJECTED", inviteTokenHash: null, inviteExpiresAt: null }, now), "REJECTED");
});

test("inviting approves the CRM stage unless they're already a member", () => {
  assert.equal(stageAfterInvite("PROSPECT"), "APPROVED");
  assert.equal(stageAfterInvite("APPLIED"), "APPROVED");
  assert.equal(stageAfterInvite("ACTIVE"), "ACTIVE");
});
