"use client";
import Link from "next/link";
import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { setDeveloperStage, setProjectPipelineStage } from "@/app/actions/admin";
import type { PipelineStage } from "@/lib/pipeline";
import { num } from "@/lib/format";

type Person = { id: string; name: string; title: string | null; initials: string; lastTouch: string | null; openTasks: number };

/**
 * One tile on the Developer CRM board. It leads with the contact and their company.
 * kind "project": one of the company's projects (each moves on its own). kind "company": a company with no project yet.
 */
export type BoardCard = {
  kind: "project" | "company";
  id: string; // project id, or developer id for "company"
  stage: string;
  developerId: string;
  company: string;
  contact: Person | null;
  contacts: number; // people on file at the company
  project?: { title: string; code: string; mw: number; score: number | null; scoreTone?: "green" | "amber" | "red" };
};

const key = (c: BoardCard) => `${c.kind}:${c.id}`;

/** Kanban board for one funnel. Drag a tile to another column, or use the stage menu on the tile. */
export function PipelineBoard({ cards, stages }: { cards: BoardCard[]; stages: PipelineStage[] }) {
  const [, startTransition] = useTransition();
  const [optimistic, move] = useOptimistic(cards, (list, m: { key: string; stage: string }) => list.map((c) => (key(c) === m.key ? { ...c, stage: m.stage } : c)));
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const setStage = (c: BoardCard, stage: string) => {
    if (c.stage === stage) return;
    const f = new FormData();
    f.set("id", c.id);
    f.set("stage", stage);
    startTransition(async () => {
      move({ key: key(c), stage });
      await (c.kind === "project" ? setProjectPipelineStage(f) : setDeveloperStage(f));
    });
  };

  return (
    <ScrollFrame>
      {stages.map((s) => {
        const col = optimistic.filter((c) => c.stage === s.value);
        return (
          <div
            key={s.value}
            data-stage={s.value}
            onDragOver={(e) => { e.preventDefault(); setOver(s.value); }}
            onDragLeave={() => setOver((o) => (o === s.value ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              const c = optimistic.find((x) => key(x) === e.dataTransfer.getData("text/plain"));
              if (c) setStage(c, s.value);
            }}
            className={`w-64 shrink-0 rounded-lg p-2 transition-colors ${over === s.value && dragging ? "bg-brand-100" : "bg-slate-100"}`}
          >
            <div className="mb-2 flex justify-between px-1 text-xs font-semibold uppercase text-slate-500"><span>{s.label}</span><span>{col.length}</span></div>
            <div className="min-h-12 space-y-2">
              {col.map((c) => (
                <div
                  key={key(c)}
                  draggable
                  onDragStart={(e) => { e.dataTransfer.setData("text/plain", key(c)); e.dataTransfer.effectAllowed = "move"; setDragging(key(c)); }}
                  onDragEnd={() => setDragging(null)}
                  className={`card cursor-grab p-3 text-sm hover:shadow active:cursor-grabbing ${c.kind === "company" ? "border-dashed" : ""} ${dragging === key(c) ? "opacity-50" : ""}`}
                >
                  <Tile c={c} />
                  <select
                    aria-label="Move to stage"
                    value={c.stage}
                    onChange={(e) => setStage(c, e.target.value)}
                    className="mt-2 w-full rounded border border-slate-200 bg-white px-1 py-0.5 text-xs text-slate-600"
                  >
                    {stages.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </ScrollFrame>
  );
}

/**
 * Wide boards scroll sideways. Besides the board's own scrolling (trackpad, shift + wheel), there is a scrollbar above
 * the columns and one below them that stays pinned to the bottom of the window while the board is taller than the
 * screen, plus arrow buttons that move one column at a time. The bars are drawn by us rather than the browser so they
 * stay visible on Macs, which otherwise hide scrollbars until you scroll.
 */
function ScrollFrame({ children }: { children: React.ReactNode }) {
  const board = useRef<HTMLDivElement>(null);
  const [m, setM] = useState({ x: 0, view: 1, total: 1 });

  useEffect(() => {
    const el = board.current;
    if (!el) return;
    const measure = () => setM({ x: el.scrollLeft, view: el.clientWidth, total: el.scrollWidth });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    el.addEventListener("scroll", measure, { passive: true });
    return () => { ro.disconnect(); el.removeEventListener("scroll", measure); };
  }, []);

  const max = Math.max(0, m.total - m.view);
  const overflow = max > 1;
  const step = (dir: 1 | -1) => board.current?.scrollBy({ left: dir * 268, behavior: "smooth" }); // one column (w-64 + gap)
  const arrow = "rounded-md border border-slate-200 bg-white px-2 py-0.5 text-sm text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-40";
  const bar = (where: "top" | "bottom") => <Bar where={where} x={m.x} view={m.view} total={m.total} onScroll={(x) => { if (board.current) board.current.scrollLeft = x; }} />;

  return (
    <div className="relative">
      <div className={`mb-2 flex items-center gap-2 ${overflow ? "" : "hidden"}`}>
        <button type="button" aria-label="Scroll left" onClick={() => step(-1)} disabled={m.x <= 1} className={arrow}>←</button>
        <div className="flex-1">{bar("top")}</div>
        <button type="button" aria-label="Scroll right" onClick={() => step(1)} disabled={m.x >= max - 1} className={arrow}>→</button>
      </div>
      <div ref={board} id="crm-board" className="overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max gap-3">{children}</div>
      </div>
      <div className={`sticky bottom-0 z-10 bg-slate-50/90 py-2 backdrop-blur ${overflow ? "" : "hidden"}`}>{bar("bottom")}</div>
    </div>
  );
}

/** A horizontal scrollbar for the board: drag the thumb, or click the track to jump there. */
function Bar({ where, x, view, total, onScroll }: { where: "top" | "bottom"; x: number; view: number; total: number; onScroll: (x: number) => void }) {
  const track = useRef<HTMLDivElement>(null);
  const max = Math.max(1, total - view);
  const thumb = Math.max(8, Math.min(100, (view / total) * 100)); // % of the track
  const left = (x / max) * (100 - thumb);

  // Track position (0..1 of the free space) -> board scroll position.
  const toScroll = (clientX: number, grab: number) => {
    const r = track.current!.getBoundingClientRect();
    const free = r.width * (1 - thumb / 100);
    return Math.min(max, Math.max(0, ((clientX - r.left - grab) / Math.max(1, free)) * max));
  };
  const drag = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const t = e.currentTarget;
    const grab = e.clientX - t.getBoundingClientRect().left;
    t.setPointerCapture(e.pointerId);
    const onMove = (ev: PointerEvent) => onScroll(toScroll(ev.clientX, grab));
    const onUp = () => { t.removeEventListener("pointermove", onMove); t.removeEventListener("pointerup", onUp); };
    t.addEventListener("pointermove", onMove);
    t.addEventListener("pointerup", onUp);
  };
  const jump = (e: React.PointerEvent<HTMLDivElement>) => {
    const w = track.current!.getBoundingClientRect().width * (thumb / 100);
    onScroll(toScroll(e.clientX, w / 2));
  };

  return (
    <div ref={track} data-scrollbar={where} role="scrollbar" aria-orientation="horizontal" aria-controls="crm-board" aria-valuemin={0} aria-valuemax={Math.round(max)} aria-valuenow={Math.round(x)}
      onPointerDown={jump} className="relative h-2.5 cursor-pointer rounded-full bg-slate-200">
      <div onPointerDown={drag} className="absolute inset-y-0 cursor-grab rounded-full bg-slate-400 hover:bg-slate-500 active:cursor-grabbing" style={{ width: `${thumb}%`, left: `${left}%` }} />
    </div>
  );
}

const SCORE_TONES = { green: "bg-emerald-100 text-emerald-800", amber: "bg-amber-100 text-amber-800", red: "bg-red-100 text-red-700" };

function Tile({ c }: { c: BoardCard }) {
  const p = c.project;
  return (
    <>
      {/* Who: contact + company */}
      <div className="flex items-start gap-2">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white">{c.contact?.initials ?? "?"}</span>
        <div className="min-w-0">
          {c.contact
            ? <Link href={`/admin/developers/contacts/${c.contact.id}`} className="block truncate font-semibold text-slate-900 hover:text-brand-600">{c.contact.name}</Link>
            : <Link href={`/admin/developers/${c.developerId}#contacts`} className="block font-semibold text-slate-500 hover:text-brand-600">Add a contact</Link>}
          <Link href={`/admin/developers/${c.developerId}`} className="block truncate text-xs font-medium text-slate-600 hover:text-brand-600" title={c.contact?.title ? `${c.contact.title}, ${c.company}` : c.company}>
            {c.company}
          </Link>
          {c.contact?.title && <div className="truncate text-xs text-slate-400">{c.contact.title}</div>}
        </div>
      </div>

      {/* What: the project (secondary) */}
      {p ? (
        <div className="mt-2 rounded-md bg-slate-50 px-2 py-1.5 text-xs">
          <Link href={`/admin/projects/${c.id}`} className="line-clamp-2 text-slate-700 hover:text-brand-600">{p.title}</Link>
          <div className="mt-1 flex items-center justify-between">
            <span className="font-mono text-slate-500">{p.code} · {num(p.mw)} MW</span>
            {p.score != null && p.score > 0 && (
              <span className={`rounded-full px-2 py-0.5 font-medium ${SCORE_TONES[p.scoreTone ?? (p.score >= 70 ? "green" : p.score >= 50 ? "amber" : "red")]}`}>{p.score}</span>
            )}
          </div>
        </div>
      ) : (
        <Link href={`/admin/projects/new?developerId=${c.developerId}`} className="mt-2 block text-xs text-brand-600">No projects yet · Add a project</Link>
      )}

      {/* Communications at a glance */}
      {c.contact && (
        <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
          <span>{c.contact.lastTouch ? `Last touch ${c.contact.lastTouch}` : "No touchpoints yet"}</span>
          {c.contact.openTasks > 0 && <Link href={`/admin/developers/contacts/${c.contact.id}?tab=tasks`} className="rounded-full bg-amber-100 px-1.5 font-medium text-amber-800">{c.contact.openTasks} task{c.contact.openTasks === 1 ? "" : "s"}</Link>}
        </div>
      )}
    </>
  );
}
