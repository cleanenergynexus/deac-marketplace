import { test } from "node:test";
import assert from "node:assert/strict";
import { applyHtmlSignature, campaignHtml, fillPlaceholders, mergeTemplate, renderTemplate, TEMPLATE_INFO, TEMPLATE_KEYS } from "./email-templates";
import { buildRaw } from "./gmail";

const S = { appUrl: "https://marketplace.deacna.com/", companyUrl: "https://deacna.com", support: "invest@deacna.com", year: 2026 };
const V = { firstName: "Alex", email: "alex@x.com", sender: "Jordan Lee", link: "https://marketplace.deacna.com/invite/abc", days: 14 };

test("every template renders with logo, button link, steps, support and footer", () => {
  for (const k of TEMPLATE_KEYS) {
    const m = renderTemplate(k, mergeTemplate(k), V, S);
    assert.ok(m.html.includes("https://marketplace.deacna.com/brand/deac-logo.png"), k);
    assert.ok(m.html.includes('href="https://marketplace.deacna.com/invite/abc"'), k);
    assert.ok(m.html.includes("<ol"), k);
    assert.ok(m.html.includes("mailto:invest@deacna.com"), k);
    assert.ok(m.html.includes("© 2026 DEAC"), k);
    assert.ok(!/\{\{\w+\}\}/.test(m.html + m.text + m.subject), `${k} has unfilled placeholders`);
    assert.ok(m.text.includes("https://marketplace.deacna.com/invite/abc"), k);
    assert.ok(m.text.startsWith("Hi Alex,"), k);
  }
});

test("invite mentions the link lifetime and the inviter", () => {
  const m = renderTemplate("INVESTOR_INVITE", mergeTemplate("INVESTOR_INVITE"), V, S);
  assert.match(m.text, /Jordan Lee has invited you/);
  assert.match(m.text, /for 14 days/);
  assert.ok(m.html.includes("/brand/email/set-password.png"));
});

test("saved wording overrides defaults; blanks fall back", () => {
  const t = mergeTemplate("TEAM_LOGIN", { subject: "Hello {{firstName}}", heading: "  " });
  assert.equal(t.subject, "Hello {{firstName}}");
  assert.equal(t.heading, TEMPLATE_INFO.TEAM_LOGIN.defaults.heading);
  assert.equal(renderTemplate("TEAM_LOGIN", t, V, S).subject, "Hello Alex");
});

test("user text is escaped in the HTML", () => {
  const t = mergeTemplate("TEAM_LOGIN", { intro: "Hi <b>{{firstName}}</b> & co" });
  const m = renderTemplate("TEAM_LOGIN", t, V, S);
  assert.ok(m.html.includes("Hi &lt;b&gt;Alex&lt;/b&gt; &amp; co"));
});

test("agent partner box appears only with a partner", () => {
  const without = renderTemplate("AGENT_LOGIN", mergeTemplate("AGENT_LOGIN"), V, S);
  const withP = renderTemplate("AGENT_LOGIN", mergeTemplate("AGENT_LOGIN"), { ...V, partner: { name: "Ana Lopez", email: "ana@deacna.com" } }, S);
  assert.ok(!without.text.includes("DEAC partner"));
  assert.match(withP.text, /Your DEAC partner is Ana Lopez/);
  assert.ok(withP.html.includes("mailto:ana@deacna.com"));
});

test("sender signature replaces the sign-off", () => {
  const m = renderTemplate("INVESTOR_APPROVED", mergeTemplate("INVESTOR_APPROVED"), V, S);
  assert.ok(m.html.includes("Jordan Lee, DEAC"));
  const signed = applyHtmlSignature(m.html, "Jordan Lee\nManaging Director\njordan@deacna.com");
  assert.ok(!signed.includes("Sincerely,"));
  assert.ok(signed.includes("Managing Director<br>"));
  assert.equal(applyHtmlSignature(m.html, "  "), m.html);
});

test("placeholders and campaigns", () => {
  assert.equal(fillPlaceholders("{{a}} {{ b }} {{c}}", { a: "1", b: "2" }), "1 2 {{c}}");
  const h = campaignHtml("Hi Alex,\n\nNew listing\nin Texas.\n\n— Jordan", S);
  assert.ok(h.includes("New listing<br>in Texas."));
  assert.ok(h.includes("Jordan"));
  assert.ok(!h.includes("— Jordan"));
});

test("Gmail message carries both text and HTML", () => {
  const raw = Buffer.from(buildRaw({ from: "j@deacna.com", to: "m@x.com", subject: "Hi", text: "Plain", html: "<p>Rich</p>" }), "base64url").toString("utf8");
  assert.match(raw, /Content-Type: multipart\/alternative; boundary="([^"]+)"/);
  const b = raw.match(/boundary="([^"]+)"/)![1];
  assert.equal(raw.split(`--${b}`).length, 4);
  assert.ok(raw.includes(Buffer.from("<p>Rich</p>").toString("base64")));
  assert.ok(raw.includes('Content-Type: text/plain; charset="UTF-8"'));
});
