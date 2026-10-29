import { Fragment, type ReactNode } from "react";
import { parseMarkdown, splitSlides, type Block, type Span } from "@/lib/markdown";

const safeHref = (h: string) => (/^(https?:|mailto:)/i.test(h) ? h : undefined);

function Inline({ spans }: { spans: Span[] }) {
  return (
    <>
      {spans.map((s, i) => {
        let n: ReactNode = s.text;
        if (s.italic) n = <em>{n}</em>;
        if (s.bold) n = <strong className="font-semibold text-slate-900">{n}</strong>;
        const href = s.href && safeHref(s.href);
        if (href) n = <a href={href} target="_blank" rel="noreferrer noopener" className="text-brand-600 underline">{n}</a>;
        return <Fragment key={i}>{n}</Fragment>;
      })}
    </>
  );
}

function Blocks({ blocks, slide = false }: { blocks: Block[]; slide?: boolean }) {
  return (
    <>
      {blocks.map((b, i) => {
        if (b.type === "heading") {
          if (b.level === 1) return <h1 key={i} className="mb-3 border-b-2 border-brand-600 pb-2 text-2xl font-bold text-brand-900"><Inline spans={b.spans} /></h1>;
          if (b.level === 2) return <h2 key={i} className={`mb-2 border-b border-slate-200 pb-1 font-semibold text-brand-900 ${slide ? "text-base" : "mt-6 text-lg"}`}><Inline spans={b.spans} /></h2>;
          return <h3 key={i} className="mb-1 mt-4 font-semibold text-brand-900"><Inline spans={b.spans} /></h3>;
        }
        if (b.type === "paragraph") return <p key={i} className="mb-3 leading-relaxed"><Inline spans={b.spans} /></p>;
        if (b.type === "quote") return <blockquote key={i} className="mb-3 border-l-4 border-brand-500 bg-brand-50 px-3 py-2 text-brand-900"><Inline spans={b.spans} /></blockquote>;
        if (b.type === "rule") return <hr key={i} className="my-4 border-slate-200" />;
        if (b.type === "list") {
          const L = b.ordered ? "ol" : "ul";
          return <L key={i} className={`mb-3 space-y-1 pl-5 ${b.ordered ? "list-decimal" : "list-disc"} marker:text-brand-600`}>{b.items.map((it, j) => <li key={j}><Inline spans={it} /></li>)}</L>;
        }
        return (
          <div key={i} className="mb-4 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              {b.header.some((h) => h.length) && <thead><tr className="bg-brand-50 text-left text-brand-900">{b.header.map((h, j) => <th key={j} className="border-b border-slate-200 px-2 py-1.5 font-semibold"><Inline spans={h} /></th>)}</tr></thead>}
              <tbody>{b.rows.map((r, j) => <tr key={j} className="border-b border-slate-200">{r.map((c, k) => <td key={k} className="px-2 py-1.5 align-top"><Inline spans={c} /></td>)}</tr>)}</tbody>
            </table>
          </div>
        );
      })}
    </>
  );
}

/** Live preview of a wizard draft: a page for documents, 16:9 slide cards for pitch decks. */
export function MarkdownView({ markdown, deck = false }: { markdown: string; deck?: boolean }) {
  if (!deck) return <article className="text-sm text-slate-700"><Blocks blocks={parseMarkdown(markdown)} /></article>;
  const { title, cover, slides } = splitSlides(markdown);
  return (
    <div className="space-y-4">
      <div className="flex aspect-video flex-col justify-center rounded-lg bg-brand-900 p-8 text-white shadow">
        <div className="mb-auto text-sm font-bold">DEAC</div>
        <div className="mb-3 h-1 w-12 bg-brand-500" />
        <div className="text-2xl font-bold">{title || "Untitled deck"}</div>
        <div className="mt-2 text-sm text-slate-300">{cover.map((b, i) => (b.type === "paragraph" ? <Inline key={i} spans={b.spans} /> : null))}</div>
        <div className="mt-auto text-xs text-slate-400">Slide 1 · cover</div>
      </div>
      {slides.map((s, i) => (
        <div key={i} className="flex aspect-video flex-col overflow-hidden rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-700 shadow">
          <div className="mb-1 text-lg font-bold text-brand-900">{s.title}</div>
          <div className="mb-3 h-1 w-10 bg-brand-600" />
          <div className="min-h-0 flex-1 overflow-hidden"><Blocks blocks={s.blocks} slide /></div>
          <div className="mt-2 text-right text-xs text-slate-400">{i + 2} / {slides.length + 1}</div>
        </div>
      ))}
    </div>
  );
}
