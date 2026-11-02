import { test } from "node:test";
import assert from "node:assert/strict";
import { matchOwner, ownerCc } from "./owner";

const team = [
  { id: "1", name: "Joaquin Rivera", email: "joaquin@deacna.com" },
  { id: "2", name: "Ana Diaz", email: "ana@deacna.com" },
  { id: "3", name: "Ana Lopez", email: "alopez@deacna.com" },
];

test("matches the relationship owner to a team member", () => {
  assert.equal(matchOwner("Joaquin", team)?.id, "1");
  assert.equal(matchOwner(" joaquin rivera ", team)?.id, "1");
  assert.equal(matchOwner("ANA@deacna.com", team)?.id, "2");
  assert.equal(matchOwner("Ana Lopez", team)?.id, "3");
  assert.equal(matchOwner("Ana", team), null); // two Anas
  assert.equal(matchOwner("Bob", team), null);
  assert.equal(matchOwner("", team), null);
});

test("copies the owner unless they send it or receive it", () => {
  const o = team[0];
  assert.deepEqual(ownerCc(o, { to: "jane@fund.com", senderId: "2" }), ["joaquin@deacna.com"]);
  assert.deepEqual(ownerCc(o, { to: "jane@fund.com", senderId: "1" }), []);
  assert.deepEqual(ownerCc(o, { to: "Joaquin@deacna.com" }), []);
  assert.deepEqual(ownerCc(null, { to: "jane@fund.com" }), []);
});
