import { test } from "node:test";
import assert from "node:assert/strict";
import type { GmailMessage } from "./gmail";
import { appendReply, emailBlock, MAX_TASK_BODY, skipReason, supportQuery, supportSender, supportSince, supportTaskTitle } from "./support";

const msg = (headers: Record<string, string>, labelIds = ["INBOX"]): GmailMessage => ({
  id: "m1",
  threadId: "t1",
  labelIds,
  payload: { headers: Object.entries(headers).map(([name, value]) => ({ name, value })) },
});

const BOX = "support@deacna.com";

test("people's emails to the support inbox become tasks", () => {
  assert.equal(skipReason(msg({ From: `"Jane Doe" <Jane@Acme.com>` }), BOX), null);
  assert.equal(skipReason(msg({ From: "ops@deacna.com" }), BOX), null, "team members can raise tickets too");
});

test("skips the inbox's own mail, promotions, bounces, auto-replies and lists", () => {
  assert.match(skipReason(msg({ From: "Support <SUPPORT@deacna.com>" }), BOX)!, /support inbox/);
  assert.match(skipReason(msg({ From: "a@b.com" }, ["INBOX", "CATEGORY_PROMOTIONS"]), BOX)!, /PROMOTIONS/);
  assert.match(skipReason(msg({ From: "a@b.com" }, ["SENT"]), BOX)!, /SENT/);
  assert.match(skipReason(msg({ From: "MAILER-DAEMON@google.com" }), BOX)!, /automated/);
  assert.match(skipReason(msg({ From: "no-reply@vercel.com" }), BOX)!, /automated/);
  assert.match(skipReason(msg({ From: "a@b.com", "Auto-Submitted": "auto-replied" }), BOX)!, /auto-reply/);
  assert.equal(skipReason(msg({ From: "a@b.com", "Auto-Submitted": "no" }), BOX), null);
  assert.match(skipReason(msg({ From: "a@b.com", Precedence: "bulk" }), BOX)!, /bulk/);
  assert.match(skipReason(msg({}), BOX)!, /no sender/);
});

test("checks start an hour before the last check, never before the inbox was turned on", () => {
  const on = new Date("2026-11-05T10:00:00Z");
  assert.equal(supportSince({ supportSince: on, lastSync: null }).toISOString(), on.toISOString());
  assert.equal(supportSince({ supportSince: on, lastSync: new Date("2026-11-05T10:30:00Z") }).toISOString(), on.toISOString());
  assert.equal(supportSince({ supportSince: on, lastSync: new Date("2026-11-06T10:00:00Z") }).toISOString(), "2026-11-06T09:00:00.000Z");
  assert.match(supportQuery(on), /^in:inbox after:1793872800 /);
});

test("task title and body carry the sender, subject and text", () => {
  const sender = supportSender(msg({ From: `"Jane Doe" <jane@acme.com>` }));
  assert.deepEqual(sender, { email: "jane@acme.com", name: "Jane Doe" });
  assert.equal(supportTaskTitle("  Can't   sign in ", sender), "Support: Can't sign in");
  assert.equal(supportTaskTitle("", sender), "Support: email from Jane Doe");
  const block = emailBlock({ sender, at: new Date("2026-11-05T12:34:00Z"), text: "Hi, the data room won't open.", attachments: ["error.png"] });
  assert.equal(block, "From: Jane Doe <jane@acme.com>\nReceived: 2026-11-05 12:34 UTC\n\nHi, the data room won't open.\n\nAttachments: error.png");
});

test("replies are added to the open task, keeping the newest text", () => {
  assert.equal(appendReply("first", "second"), "first\n\n──── Reply ────\nsecond");
  const long = appendReply("x".repeat(MAX_TASK_BODY), "latest reply");
  assert.equal(long.length, MAX_TASK_BODY);
  assert.ok(long.startsWith("…") && long.endsWith("latest reply"));
});
