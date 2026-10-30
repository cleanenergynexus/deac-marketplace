"use client";
import { useEffect, useRef } from "react";

/**
 * Wraps the embed content and tells the page framing it (deacna.com) how tall the content is,
 * so the iframe fits it. Measures the content itself: the document's scrollHeight never drops
 * below the iframe's current height, which left an empty gap under the tiles.
 */
export function EmbedResize({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.parent === window) return;
    const send = () => window.parent.postMessage({ type: "deac-embed-height", height: el.getBoundingClientRect().height }, "*");
    send();
    const ro = new ResizeObserver(send);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return <div ref={ref} className={className}>{children}</div>;
}
