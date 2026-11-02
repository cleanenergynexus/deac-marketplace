"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

type PdfDoc = { numPages: number; getPage: (n: number) => Promise<PdfPage>; destroy: () => Promise<void> };
type PdfPage = { getViewport: (o: { scale: number }) => { width: number; height: number }; render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void>; cancel: () => void } };

/**
 * Renders every page of a PDF (pdf.js) at the width of its container. `overlay(page)` draws on top of each page,
 * positioned with percentages, so field boxes line up at any zoom.
 */
export function PdfPages({ url, overlay, onPageClick, onLoaded, className = "" }: {
  url: string;
  overlay?: (page: number) => ReactNode;
  /** Click on an empty part of a page, as fractions of the page (top-left origin). */
  onPageClick?: (page: number, x: number, y: number) => void;
  onLoaded?: (pageCount: number) => void;
  className?: string;
}) {
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [sizes, setSizes] = useState<{ w: number; h: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const loadedRef = useRef(onLoaded);
  loadedRef.current = onLoaded;

  useEffect(() => {
    let cancelled = false;
    let loaded: PdfDoc | null = null;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        loaded = (await pdfjs.getDocument({ url, withCredentials: true }).promise) as unknown as PdfDoc;
        const s: { w: number; h: number }[] = [];
        for (let i = 1; i <= loaded.numPages; i++) {
          const v = (await loaded.getPage(i)).getViewport({ scale: 1 });
          s.push({ w: v.width, h: v.height });
        }
        if (cancelled) return;
        setSizes(s);
        setDoc(loaded);
        loadedRef.current?.(loaded.numPages);
      } catch (e) {
        console.error(e);
        if (!cancelled) setError("The document couldn't be displayed. Reload the page, or download it instead.");
      }
    })();
    return () => { cancelled = true; void loaded?.destroy(); };
  }, [url]);

  if (error) return <div className="rounded-lg bg-red-50 p-6 text-sm text-red-700">{error}</div>;
  if (!doc) return <div className="flex h-96 items-center justify-center text-sm text-slate-400">Loading document…</div>;
  return (
    <div className={`space-y-4 ${className}`}>
      {sizes.map((sz, i) => (
        <PageCanvas key={i} doc={doc} index={i} ratio={sz.h / sz.w} overlay={overlay?.(i)} onClick={onPageClick} />
      ))}
    </div>
  );
}

function PageCanvas({ doc, index, ratio, overlay, onClick }: { doc: PdfDoc; index: number; ratio: number; overlay?: ReactNode; onClick?: (page: number, x: number, y: number) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!width || !canvas.current) return;
    let task: { promise: Promise<void>; cancel: () => void } | null = null;
    let stop = false;
    const t = setTimeout(async () => {
      const page = await doc.getPage(index + 1);
      if (stop || !canvas.current) return;
      const base = page.getViewport({ scale: 1 });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({ scale: (width / base.width) * dpr });
      const c = canvas.current;
      c.width = Math.floor(viewport.width);
      c.height = Math.floor(viewport.height);
      task = page.render({ canvasContext: c.getContext("2d")!, viewport });
      task.promise.catch(() => {});
    }, 60);
    return () => { stop = true; clearTimeout(t); task?.cancel(); };
  }, [doc, index, width]);

  return (
    <div
      ref={box}
      data-page={index}
      className="relative w-full bg-white shadow-md ring-1 ring-slate-200 [container-type:size]"
      style={{ aspectRatio: `1 / ${ratio}` }}
      onClick={onClick ? (e) => {
        if (e.target !== e.currentTarget && e.target !== canvas.current) return;
        const r = e.currentTarget.getBoundingClientRect();
        onClick(index, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
      } : undefined}
    >
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
      {overlay}
      <div className="pointer-events-none absolute bottom-1 right-2 text-[10px] text-slate-400">Page {index + 1}</div>
    </div>
  );
}
