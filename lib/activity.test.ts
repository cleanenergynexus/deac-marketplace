import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanClientEvent, cleanPath, describeEvent, fileIdFromPath, formatDuration, groupVisits, listingIdFromPath, MAX_VIEW_MS, pageName, rollupByListing } from "./activity";

const ID = "cmh1abcdefghijklmnopqrstu";
const names = new Map([[ID, { code: "DEAC-TX-001", title: "120 MW Powered Land" }]]);

test("listing and file ids from paths", () => {
  assert.equal(listingIdFromPath(`/marketplace/${ID}?tab=economics`), ID);
  assert.equal(listingIdFromPath(`/marketplace/${ID}/data-room`), ID);
  assert.equal(listingIdFromPath(`/agent/listings/${ID}`), ID);
  assert.equal(listingIdFromPath("/marketplace"), null);
  assert.equal(listingIdFromPath(null), null);
  assert.equal(fileIdFromPath(`/api/data-room/files/${ID}?download`), ID);
});

test("page names", () => {
  assert.equal(pageName(`/marketplace/${ID}?tab=economics`, names), "DEAC-TX-001 · Economics");
  assert.equal(pageName(`/marketplace/${ID}`, names), "DEAC-TX-001 · Overview");
  assert.equal(pageName(`/marketplace/${ID}/data-room`), "Listing · Data Room");
  assert.equal(pageName("/marketplace"), "Opportunities");
  assert.equal(pageName("/portal"), "My Portal");
  assert.equal(pageName("/somewhere/else"), "/somewhere/else");
});

test("event lines", () => {
  const e = { path: "/marketplace", label: "Site plan.pdf", target: null, projectId: ID };
  assert.equal(describeEvent({ ...e, kind: "DOWNLOAD" }), 'Downloaded "Site plan.pdf"');
  assert.equal(describeEvent({ ...e, kind: "CLICK", label: "View listing", target: `/marketplace/${ID}` }, names), 'Clicked "View listing" → DEAC-TX-001');
  assert.equal(describeEvent({ ...e, kind: "VIEW", path: `/marketplace/${ID}?tab=loi` }, names), "Viewed DEAC-TX-001 · Your Status");
  assert.equal(describeEvent({ ...e, kind: "SELECT", label: "Deal type: Lease" }), "Selected Deal type: Lease");
});

test("durations", () => {
  assert.equal(formatDuration(null), "—");
  assert.equal(formatDuration(400), "<1s");
  assert.equal(formatDuration(35_000), "35s");
  assert.equal(formatDuration(252_000), "4m 12s");
  assert.equal(formatDuration(3_900_000), "1h 05m");
});

test("visits split on 30 minutes of inactivity", () => {
  const at = (m: number, d = 0) => ({ createdAt: new Date(Date.UTC(2026, 10, 14, 10, m)), durationMs: d });
  const v = groupVisits([at(0, 60_000), at(5, 120_000), at(70), at(10)]);
  assert.equal(v.length, 2);
  assert.equal(v[0].events.length, 1); // newest visit first
  assert.equal(v[1].events.length, 3);
  assert.equal(v[1].activeMs, 180_000);
});

test("per-listing rollup", () => {
  const t = new Date();
  const r = rollupByListing([
    { kind: "VIEW", projectId: "a", durationMs: 1000, createdAt: t },
    { kind: "VIEW", projectId: "b", durationMs: 5000, createdAt: t },
    { kind: "DOWNLOAD", projectId: "b", durationMs: null, createdAt: t },
    { kind: "CLICK", projectId: null, durationMs: null, createdAt: t },
  ]);
  assert.deepEqual(r.map((x) => [x.projectId, x.views, x.downloads]), [["b", 1, 1], ["a", 1, 0]]);
});

test("browser events are validated", () => {
  assert.equal(cleanPath("https://evil.com/x"), null);
  assert.equal(cleanPath("//evil.com"), null);
  assert.equal(cleanPath("/a#frag"), "/a");
  const now = Date.UTC(2026, 10, 14, 12);
  assert.deepEqual(cleanClientEvent({ t: "view", id: "abc12345-xyz", path: "/marketplace", at: now - 3000 }, now), { op: "view", clientId: "abc12345-xyz", path: "/marketplace", at: new Date(now - 3000) });
  assert.deepEqual(cleanClientEvent({ t: "view", id: "abc12345-xyz", path: "/", at: 5 }, now), { op: "view", clientId: "abc12345-xyz", path: "/", at: new Date(now) }); // clock way off
  assert.equal(cleanClientEvent({ t: "view", id: "bad id!", path: "/" }), null);
  assert.deepEqual(cleanClientEvent({ t: "time", id: "abc12345", ms: 1e12, scroll: 140 }), { op: "time", clientId: "abc12345", durationMs: MAX_VIEW_MS, scrollPct: 100 });
  assert.equal(cleanClientEvent({ t: "time", id: "abc12345", ms: -5 }), null);
  const click = cleanClientEvent({ t: "click", path: "/marketplace", label: "  Request   access  ", href: "/apply" }, now);
  assert.deepEqual(click, { op: "event", kind: "CLICK", path: "/marketplace", label: "Request access", target: "/apply", at: new Date(now) });
  assert.deepEqual(cleanClientEvent({ t: "out", path: "/", label: "Map", href: "javascript:alert(1)" }, now), { op: "event", kind: "LINK_OUT", path: "/", label: "Map", target: null, at: new Date(now) });
  assert.equal(cleanClientEvent({ t: "hack" }), null);
});
