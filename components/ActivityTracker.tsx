"use client";
import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { IDLE_MS, VISITOR_COOKIE, type ClientEvent } from "@/lib/activity";

const ENDPOINT = "/api/track";
const FLUSH_MS = 5000;
const HEARTBEAT_MS = 30000;
// Clicks on these are recorded by the server when the file is served (with the file's name).
const SERVER_TRACKED = /^\/api\/(data-room\/files|esign)\//;
const CLICKABLE = "a,button,[role=tab],[role=button],[role=menuitem],[role=option],summary,[data-track]";

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);
// Leading arrows/icons (▶, ★...) are dropped from labels.
const text = (s: string | null | undefined, n = 100) => (s ?? "").replace(/\s+/g, " ").trim().replace(/^[^\p{L}\p{N}"$]+/u, "").slice(0, n);

function ensureVisitorCookie() {
  if (document.cookie.split("; ").some((c) => c.startsWith(`${VISITOR_COOKIE}=`))) return;
  // Browser-session cookie: no expiry, so it's gone when the browser closes.
  document.cookie = `${VISITOR_COOKIE}=${newId()}; path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
}

function labelOf(el: Element): string {
  const h = el as HTMLElement;
  return text(h.dataset.track || el.getAttribute("aria-label") || el.getAttribute("title") || h.innerText || el.textContent || (el as HTMLInputElement).value);
}

function fieldLabel(el: HTMLInputElement | HTMLSelectElement): string {
  const own = el.getAttribute("aria-label") || el.dataset.track;
  if (own) return text(own);
  const lab = (el.labels && el.labels[0]) || el.closest("label");
  const t = lab ? text((lab as HTMLElement).innerText, 80) : "";
  return t || text(el.name, 60) || "option";
}

/**
 * Records what a signed-in investor or referral agent (or a visitor) does on the marketplace: each page viewed, active
 * time on it (tab visible and not idle) and scroll depth, clicks on links, buttons, tabs and folders, and choices in
 * drop-downs, checkboxes and radio buttons. Typed text is never recorded. Mark an area data-track-ignore to skip it,
 * or give an element data-track="name" to name it in the timeline.
 */
export function ActivityTracker({ visitor }: { visitor: boolean }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const queue = useRef<ClientEvent[]>([]);
  const view = useRef<{ id: string; path: string; ms: number; sent: number; scroll: number } | null>(null);
  const lastInput = useRef(Date.now());
  const lastTick = useRef(Date.now());

  const flush = (beacon = false) => {
    if (!queue.current.length) return;
    const body = JSON.stringify({ events: queue.current.splice(0, 40) });
    try {
      if (beacon && navigator.sendBeacon?.(ENDPOINT, new Blob([body], { type: "application/json" }))) return;
      void fetch(ENDPOINT, { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" }, credentials: "same-origin" }).catch(() => null);
    } catch { /* tracking must never break the page */ }
  };
  const reportTime = () => {
    const v = view.current;
    if (v && Math.round(v.ms / 1000) !== Math.round(v.sent / 1000)) {
      queue.current.push({ t: "time", id: v.id, ms: Math.round(v.ms), scroll: v.scroll });
      v.sent = v.ms;
    }
  };
  const here = () => location.pathname + location.search;

  // Page views: one per path + query (listing tabs are ?tab=...).
  const path = pathname + (search.toString() ? `?${search.toString()}` : "");
  useEffect(() => {
    if (visitor) ensureVisitorCookie();
    reportTime();
    view.current = { id: newId(), path, ms: 0, sent: 0, scroll: 0 };
    lastTick.current = Date.now();
    lastInput.current = Date.now();
    queue.current.push({ t: "view", id: view.current.id, path, at: Date.now() });
    flush();
  }, [path]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const active = () => document.visibilityState === "visible" && Date.now() - lastInput.current < IDLE_MS;
    const tick = () => {
      const now = Date.now();
      if (view.current && active()) view.current.ms += Math.min(now - lastTick.current, 5000);
      lastTick.current = now;
    };
    const onInput = () => { tick(); lastInput.current = Date.now(); };
    const onScroll = () => {
      onInput();
      const v = view.current;
      if (!v) return;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const pct = max <= 0 ? 100 : Math.round((window.scrollY / max) * 100);
      if (pct > v.scroll) v.scroll = Math.min(100, pct);
    };
    const onClick = (ev: MouseEvent) => {
      onInput();
      const el = (ev.target as Element | null)?.closest?.(CLICKABLE);
      if (!el || el.closest("[data-track-ignore]")) return;
      if (el instanceof HTMLAnchorElement && el.href) {
        let url: URL;
        try { url = new URL(el.href, location.href); } catch { return; }
        if (url.origin === location.origin) {
          if (SERVER_TRACKED.test(url.pathname)) return;
          queue.current.push({ t: "click", at: Date.now(), path: here(), label: labelOf(el), href: url.pathname + url.search });
        } else if (/^https?:$/.test(url.protocol)) {
          queue.current.push({ t: "out", at: Date.now(), path: here(), label: labelOf(el), href: url.href });
          flush(true);
          return;
        } else {
          queue.current.push({ t: "click", at: Date.now(), path: here(), label: labelOf(el) || url.protocol.replace(":", "") });
        }
      } else {
        queue.current.push({ t: "click", at: Date.now(), path: here(), label: labelOf(el) });
      }
    };
    const onChange = (ev: Event) => {
      const el = ev.target as HTMLInputElement | HTMLSelectElement | null;
      if (!el || el.closest("[data-track-ignore]")) return;
      if (el instanceof HTMLSelectElement) {
        const chosen = [...el.selectedOptions].map((o) => text(o.text, 60)).join(", ");
        queue.current.push({ t: "select", at: Date.now(), path: here(), label: `${fieldLabel(el)}: ${chosen || "(none)"}` });
      } else if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
        if (el.type === "radio" && !el.checked) return;
        queue.current.push({ t: "select", at: Date.now(), path: here(), label: `${fieldLabel(el)}${el.type === "checkbox" && !el.checked ? " (unticked)" : ""}` });
      }
    };
    const onHide = () => {
      tick();
      if (document.visibilityState === "hidden") { reportTime(); flush(true); }
    };
    const onLeave = () => { tick(); reportTime(); flush(true); };

    const clock = window.setInterval(tick, 1000);
    const send = window.setInterval(() => flush(), FLUSH_MS);
    const beat = window.setInterval(() => { tick(); reportTime(); }, HEARTBEAT_MS);
    document.addEventListener("click", onClick, true);
    document.addEventListener("change", onChange, true);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onLeave);
    window.addEventListener("scroll", onScroll, { passive: true });
    for (const t of ["mousemove", "keydown", "touchstart", "wheel"] as const) window.addEventListener(t, onInput, { passive: true });
    return () => {
      window.clearInterval(clock); window.clearInterval(send); window.clearInterval(beat);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("change", onChange, true);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onLeave);
      window.removeEventListener("scroll", onScroll);
      for (const t of ["mousemove", "keydown", "touchstart", "wheel"] as const) window.removeEventListener(t, onInput);
      onLeave();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
