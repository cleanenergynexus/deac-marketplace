"use client";
import { useEffect } from "react";

/** Tells the page framing this embed (deacna.com) how tall the content is, so it can size the iframe. */
export function EmbedResize() {
  useEffect(() => {
    if (window.parent === window) return;
    const send = () => window.parent.postMessage({ type: "deac-embed-height", height: document.documentElement.scrollHeight }, "*");
    send();
    const ro = new ResizeObserver(send);
    ro.observe(document.body);
    return () => ro.disconnect();
  }, []);
  return null;
}
