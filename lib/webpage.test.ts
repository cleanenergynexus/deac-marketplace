import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeEntities, htmlToText, isPrivateAddress, parseUrl } from "./webpage";

test("parseUrl adds https and rejects other schemes", () => {
  assert.equal(parseUrl("example.com/listing").toString(), "https://example.com/listing");
  assert.equal(parseUrl(" http://example.com ").protocol, "http:");
  assert.throws(() => parseUrl("ftp://example.com/x"));
  assert.throws(() => parseUrl("javascript:alert(1)"));
  assert.throws(() => parseUrl("https://user:pw@example.com"));
});

test("isPrivateAddress blocks internal networks", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) assert.ok(isPrivateAddress(ip), ip);
  for (const ip of ["8.8.8.8", "172.32.0.1", "2606:4700::1111"]) assert.ok(!isPrivateAddress(ip), ip);
});

test("decodeEntities", () => {
  assert.equal(decodeEntities("3.5&nbsp;MW &amp; 130,000 ft&sup2; &#8211; &#x2014; &bogus;"), "3.5 MW & 130,000 ft² – — &bogus;");
});

test("htmlToText keeps the readable parts of a listing page", () => {
  const html = `<!doctype html><html><head><title>Pittsburgh Powered Shell | Colliers</title>
    <meta name="description" content="130,000 SF former Verizon ops center with 3.5 MW">
    <style>.x{color:red}</style><script>var secret = 1;</script></head>
    <body><nav><a href="/">Home</a></nav>
    <h1>Pittsburgh Powered Shell</h1><p>3.5&nbsp;MW on site.<br>Scalable +40 MW.</p>
    <ul><li>130,000 SF</li><li>Zoned industrial</li></ul>
    <table><tr><th>Price</th><td>$12,500,000</td></tr></table>
    <p>Contact <a href="mailto:John.Bilyak@Colliers.com?subject=Hi">John Bilyak</a>, <a href="tel:+14126381753">call</a></p>
    <a href="/docs/OM.pdf">Offering memo</a><img src="a.png" alt="Aerial view"></body></html>`;
  const t = htmlToText(html, new URL("https://www.colliers.com/listing/pgh"));
  assert.match(t, /Page title: Pittsburgh Powered Shell \| Colliers/);
  assert.match(t, /description: 130,000 SF former Verizon/);
  assert.match(t, /3\.5 MW on site\.\nScalable \+40 MW\./);
  assert.match(t, /• 130,000 SF/);
  assert.match(t, /Price \| \$12,500,000/);
  assert.match(t, /John Bilyak \(John\.Bilyak@Colliers\.com\)/);
  assert.match(t, /call \(\+14126381753\)/);
  assert.match(t, /https:\/\/www\.colliers\.com\/docs\/OM\.pdf/);
  assert.match(t, /Aerial view/);
  assert.doesNotMatch(t, /secret|color:red/);
});
