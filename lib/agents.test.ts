import { test } from "node:test";
import assert from "node:assert/strict";
import { agentActivityWhere, agentCompanyWhere, agentContactWhere, agentInvestorWhere, canSeeCompany, canSeeContact, contactActivityWhere, isAgentStatus, meetingRequest, referralSource } from "./agents";

test("an agent sees developer contacts they referred, or anyone at a company they referred", () => {
  const dev = (referredById: string | null) => ({ referredById });
  assert.equal(canSeeContact("a1", { referredById: "a1", developer: dev(null) }), true);
  assert.equal(canSeeContact("a1", { referredById: null, developer: dev("a1") }), true);
  assert.equal(canSeeContact("a1", { referredById: "a2", developer: dev(null) }), false);
  assert.equal(canSeeContact("a1", { referredById: null, developer: dev(null) }), false);
});

test("an agent sees a company (and its projects) they referred or have a referred contact at", () => {
  assert.equal(canSeeCompany("a1", { referredById: "a1", contacts: [] }), true);
  assert.equal(canSeeCompany("a1", { referredById: null, contacts: [{ referredById: null }, { referredById: "a1" }] }), true);
  assert.equal(canSeeCompany("a1", { referredById: "a2", contacts: [{ referredById: "a2" }] }), false);
});

test("database filters are scoped to the agent's id", () => {
  assert.deepEqual(agentInvestorWhere("a1"), { referredById: "a1" });
  assert.deepEqual(agentCompanyWhere("a1"), { OR: [{ referredById: "a1" }, { contacts: { some: { referredById: "a1" } } }] });
  assert.deepEqual(agentContactWhere("a1"), { OR: [{ referredById: "a1" }, { developer: { referredById: "a1" } }] });
  const feed = JSON.stringify(agentActivityWhere("a1"));
  assert.ok(!feed.includes("a2"));
  assert.equal((feed.match(/"a1"/g) ?? []).length, 4);
});

test("primary contacts also carry company-wide history, like the team's contact record", () => {
  assert.deepEqual(contactActivityWhere({ id: "c1", developerId: "d1", isPrimary: false }), { OR: [{ contactId: "c1" }] });
  assert.deepEqual(contactActivityWhere({ id: "c1", developerId: "d1", isPrimary: true }), { OR: [{ contactId: "c1" }, { developerId: "d1", contactId: null }] });
});

test("meeting requests read well as a task for the partner", () => {
  const m = meetingRequest({ agentName: "Ana Ruiz", about: "Joe Dev (Sun Co)", topic: "Intro call", when: "Tue PM" });
  assert.equal(m.subject, "Meeting request from Ana Ruiz · Joe Dev (Sun Co)");
  assert.match(m.body, /Topic: Intro call/);
  assert.match(m.body, /Preferred times: Tue PM/);
  assert.equal(meetingRequest({ agentName: "Ana Ruiz", topic: "Catch up" }).subject, "Meeting request from Ana Ruiz");
});

test("statuses and source labels", () => {
  assert.equal(isAgentStatus("APPROVED"), true);
  assert.equal(isAgentStatus("SUSPENDED"), true);
  assert.equal(isAgentStatus("PENDING"), false);
  assert.equal(referralSource("Ana Ruiz"), "Referral: Ana Ruiz");
});
