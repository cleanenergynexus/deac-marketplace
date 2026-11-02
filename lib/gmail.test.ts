import { test } from "node:test";
import assert from "node:assert/strict";
import { addressQueries, addresses, attachmentNames, authUrl, buildRaw, displayName, messageText, missingScopes, stripQuoted, type GmailMessage } from "./gmail";
import { open, seal } from "./secret-box";

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");

test("reads addresses from headers", () => {
  assert.deepEqual(addresses(`"Doe, Jane" <Jane@X.com>, bob@y.com, Ana <ana@z.io>`), ["jane@x.com", "bob@y.com", "ana@z.io"]);
  assert.deepEqual(addresses(null), []);
  assert.deepEqual(addresses("undisclosed-recipients:;"), []);
  assert.equal(displayName(`"Jane Doe" <jane@x.com>`), "Jane Doe");
  assert.equal(displayName("jane@x.com"), "jane@x.com");
});

test("builds the Google consent URL for offline Gmail access", () => {
  const u = new URL(authUrl({ clientId: "cid", redirectUri: "https://m.example/api/google/callback", state: "abc", loginHint: "me@x.com" }));
  assert.equal(u.searchParams.get("access_type"), "offline");
  assert.equal(u.searchParams.get("prompt"), "consent");
  assert.equal(u.searchParams.get("state"), "abc");
  assert.match(u.searchParams.get("scope")!, /gmail\.readonly/);
  assert.match(u.searchParams.get("scope")!, /gmail\.send/);
  assert.deepEqual(missingScopes("openid https://www.googleapis.com/auth/gmail.send"), ["https://www.googleapis.com/auth/gmail.readonly"]);
});

test("searches for mail with CRM addresses in chunks", () => {
  const q = addressQueries(["A@x.com", "a@x.com", "b@y.com", "not an email", "c@z.com"], 2);
  assert.deepEqual(q, ["{from:a@x.com to:a@x.com cc:a@x.com from:b@y.com to:b@y.com cc:b@y.com}", "{from:c@z.com to:c@z.com cc:c@z.com}"]);
});

test("drops the quoted thread from replies", () => {
  assert.equal(stripQuoted("Sounds good, send the NDA.\n\nOn Mon, Nov 2, 2026 at 9:00 AM Jane <j@x.com> wrote:\n> Earlier text"), "Sounds good, send the NDA.");
  assert.equal(stripQuoted("Thanks!\n\nFrom: Bob\nSent: Monday\nOld stuff"), "Thanks!");
  assert.equal(stripQuoted("Hi\n> quoted\nBye"), "Hi\nBye");
});

test("takes the plain-text part, or HTML as text, and lists attachments", () => {
  const m: GmailMessage = {
    id: "1", threadId: "t",
    payload: {
      mimeType: "multipart/mixed",
      parts: [
        { mimeType: "multipart/alternative", parts: [{ mimeType: "text/plain", body: { data: b64("Hello Maria\r\n\r\nOn Tue, Bob wrote:\r\n> hi") } }, { mimeType: "text/html", body: { data: b64("<p>Hello</p>") } }] },
        { mimeType: "application/pdf", filename: "NDA.pdf", body: { size: 10 } },
      ],
    },
  };
  assert.equal(messageText(m), "Hello Maria");
  assert.deepEqual(attachmentNames(m), ["NDA.pdf"]);
  const html: GmailMessage = { id: "2", threadId: "t", payload: { mimeType: "text/html", body: { data: b64("<div>Hi&nbsp;there</div><br><b>Site</b> tour &amp; LOI") } } };
  assert.equal(messageText(html), "Hi there\n\nSite tour & LOI");
});

test("builds a UTF-8 message Gmail can send", () => {
  const raw = Buffer.from(buildRaw({ from: "j@deacna.com", fromName: "Joaquín", to: "m@x.com", toName: "Maria", subject: "Términos\r\nBcc: evil@x.com", text: "Hola\nAdiós" }), "base64url").toString("utf8");
  const [head, body] = raw.split("\r\n\r\n");
  assert.match(head, /^From: =\?UTF-8\?B\?.+\?= <j@deacna\.com>/);
  assert.match(head, /To: "Maria" <m@x\.com>/);
  assert.doesNotMatch(head, /^Bcc:/m);
  const subject = head.match(/Subject: =\?UTF-8\?B\?(.+)\?=/)![1];
  assert.equal(Buffer.from(subject, "base64").toString("utf8"), "Términos Bcc: evil@x.com");
  assert.equal(Buffer.from(body.replace(/\r\n/g, ""), "base64").toString("utf8"), "Hola\r\nAdiós");
});

test("seals and opens tokens, and rejects tampering or the wrong key", () => {
  const key = "x".repeat(40);
  const s1 = seal("1//refresh-token", key);
  assert.notEqual(seal("1//refresh-token", key), s1);
  assert.equal(open(s1, key), "1//refresh-token");
  assert.throws(() => open(s1, "y".repeat(40)));
  const parts = s1.split(".");
  parts[3] = b64("tampered");
  assert.throws(() => open(parts.join("."), key));
  const b64key = Buffer.alloc(32, 7).toString("base64");
  assert.equal(open(seal("t", b64key), b64key), "t");
});
