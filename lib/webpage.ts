import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/** What a fetched web page becomes before Claude reads it. */
export type WebSource =
  | { kind: "pdf"; base64: string; name: string }
  | { kind: "image"; base64: string; mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif"; name: string }
  | { kind: "text"; text: string; name: string };

export class WebPageError extends Error {}

const MAX_BYTES = 15_000_000;
const MAX_TEXT_CHARS = 150_000;
const TIMEOUT_MS = 20_000;
const MAX_REDIRECTS = 5;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

/** Checks the address the user typed and adds https:// when it is missing. */
export function parseUrl(input: string): URL {
  const raw = input.trim();
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw new WebPageError("That doesn't look like a web address. Paste the full link, e.g. https://example.com/listing.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new WebPageError("Only http and https links can be imported.");
  if (url.username || url.password) throw new WebPageError("Links with a username or password can't be imported.");
  return url;
}

/** True for loopback, private, link-local and other addresses that are not on the public internet. */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19));
  }
  if (v === 6) {
    const s = ip.toLowerCase();
    const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return s === "::" || s === "::1" || s.startsWith("fc") || s.startsWith("fd") ||
      /^fe[89ab]/.test(s) || s.startsWith("ff") || s.startsWith("64:ff9b:");
  }
  return true;
}

/** Refuses links that point at this server or a private network. */
async function assertPublicHost(url: URL) {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    throw new WebPageError("That link points at a private address and can't be imported.");
  }
  const addrs = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (!addrs.length) throw new WebPageError(`Couldn't find the website ${host}. Check the link.`);
  if (addrs.some(isPrivateAddress)) throw new WebPageError("That link points at a private address and can't be imported.");
}

async function readCapped(res: Response): Promise<Buffer> {
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > MAX_BYTES) throw new WebPageError("That page is too large to import (over 15 MB).");
  if (!res.body) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) { await reader.cancel(); throw new WebPageError("That page is too large to import (over 15 MB)."); }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/** Downloads a web page (or a PDF/image link) so Claude can read it. */
export async function fetchWebPage(input: string): Promise<WebSource> {
  let url = parseUrl(input);
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  let res: Response | undefined;
  try {
    for (let hop = 0; ; hop++) {
      await assertPublicHost(url);
      res = await fetch(url, {
        redirect: "manual",
        signal,
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; DEACMarketplaceImporter/1.0; +https://marketplace.deacna.com)",
          accept: "text/html,application/xhtml+xml,application/pdf,text/plain;q=0.9,image/*;q=0.8,*/*;q=0.5",
          "accept-language": "en-US,en;q=0.9",
        },
      });
      const next = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
      if (!next) break;
      if (hop >= MAX_REDIRECTS) throw new WebPageError("That link redirects too many times.");
      url = parseUrl(new URL(next, url).toString());
    }
  } catch (e) {
    if (e instanceof WebPageError) throw e;
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) throw new WebPageError("The website took too long to respond. Try again, or paste the page text instead.");
    throw new WebPageError("Couldn't reach that website. Check the link, or paste the page text instead.");
  }

  if (res.status === 401 || res.status === 403) throw new WebPageError(`The website refused the request (${res.status}). If the page needs a login or blocks bots, open it yourself and paste the text, or save it as PDF and upload it.`);
  if (res.status === 404) throw new WebPageError("That page wasn't found (404). Check the link.");
  if (!res.ok) throw new WebPageError(`The website returned an error (${res.status}). Try again, or paste the page text instead.`);

  const name = url.hostname.replace(/^www\./, "") + (url.pathname !== "/" ? url.pathname : "");
  const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const buf = await readCapped(res);

  if (type === "application/pdf" || (buf.subarray(0, 5).toString("latin1") === "%PDF-")) {
    return { kind: "pdf", base64: buf.toString("base64"), name };
  }
  const img = IMAGE_TYPES.find((t) => t === type);
  if (img) return { kind: "image", base64: buf.toString("base64"), mediaType: img, name };

  const body = buf.toString("utf8");
  const text = type.includes("html") || /^\s*<(!doctype|html|head|body)/i.test(body) ? htmlToText(body, url) : body;
  if (text.replace(/\s+/g, " ").trim().length < 80) {
    throw new WebPageError("That page has almost no readable text. It may load its content with JavaScript or need a login. Open it in your browser and paste the text, or save it as PDF and upload it.");
  }
  return { kind: "text", text: `Source: ${url.toString()}\n\n${text.slice(0, MAX_TEXT_CHARS)}`, name };
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…", bull: "•", middot: "·", copy: "©", reg: "®", trade: "™", deg: "°", sup2: "²" };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Turns an HTML page into readable text, keeping the title, description, email/phone links and PDF links. */
export function htmlToText(html: string, base?: URL): string {
  const attr = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"))?.slice(1).find((v) => v !== undefined);
  const head: string[] = [];
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  if (title) head.push(`Page title: ${decodeEntities(title).trim()}`);
  for (const meta of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = (attr(meta, "name") ?? attr(meta, "property") ?? "").toLowerCase();
    if (["description", "og:title", "og:description"].includes(key)) {
      const c = attr(meta, "content");
      if (c) head.push(`${key}: ${decodeEntities(c).trim()}`);
    }
  }

  const docLinks = new Set<string>();
  let s = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|iframe|canvas)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<head\b[\s\S]*?<\/head\s*>/i, " ");
  // Keep the targets of email, phone and document links; they often hold the contacts and the offering memo.
  s = s.replace(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi, (_m, attrs: string, inner: string) => {
    const href = decodeEntities(attr(`<a ${attrs}>`, "href") ?? "").trim();
    if (/^(mailto|tel):/i.test(href)) return `${inner} (${href.replace(/^(mailto|tel):/i, "").split("?")[0]})`;
    if (/\.pdf($|[?#])/i.test(href)) {
      try { docLinks.add(new URL(href, base).toString()); } catch { /* ignore bad links */ }
    }
    return inner;
  });
  s = s
    .replace(/<img\b[^>]*>/gi, (tag) => { const alt = attr(tag, "alt"); return alt ? ` ${alt} ` : " "; })
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n• ")
    .replace(/<\/(td|th)\s*>/gi, " | ")
    .replace(/<\/?(p|div|section|article|header|footer|main|aside|nav|h[1-6]|ul|ol|tr|table|blockquote|dl|dt|dd|figure|figcaption|form|pre)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  s = decodeEntities(s)
    .split("\n")
    .map((l) => l.replace(/[ \t\f\v ]+/g, " ").trim())
    .filter((l, i, all) => l !== "" || (i > 0 && all[i - 1] !== ""))
    .join("\n")
    .trim();

  const parts = [head.join("\n"), s];
  if (docLinks.size) parts.push(`PDF documents linked from the page:\n${[...docLinks].slice(0, 20).join("\n")}`);
  return parts.filter(Boolean).join("\n\n");
}
