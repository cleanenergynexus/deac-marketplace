"use client";
import Link from "next/link";
import { useOptimistic, useTransition, useState } from "react";
import { setDeveloperStage, setProjectPipelineStage } from "@/app/actions/admin";
import { DEVELOPER_STAGES } from "@/lib/constants";
import { num } from "@/lib/format";

/** One tile on the Developer CRM board: a project, or a developer that has no projects yet. */
export type BoardCard =
  | { kind: "project"; id: string; stage: string; title: string; code: string; mw: number; score: number | null; developerId: string; company: string; siblings: number }
  | { kind: "developer"; id: string; stage: string; company: string; contactName: string };

const key = (c: BoardCard) => `${c.kind}:${c.id}`;

/** Kanban board. Drag a tile to another column, or use the stage menu on the tile. */
export function PipelineBoard({ cards }: { cards: BoardCard[] }) {
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
    <div className="flex gap-3 overflow-x-auto pb-4">
      {DEVELOPER_STAGES.map((s) => {
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
                  className={`card cursor-grab p-3 text-sm hover:shadow active:cursor-grabbing ${c.kind === "developer" ? "border-dashed" : ""} ${dragging === key(c) ? "opacity-50" : ""}`}
                >
                  {c.kind === "project" ? <ProjectCard c={c} /> : <DeveloperCard c={c} />}
                  <select
                    aria-label="Move to stage"
                    value={c.stage}
                    onChange={(e) => setStage(c, e.target.value)}
                    className="mt-2 w-full rounded border border-slate-200 bg-white px-1 py-0.5 text-xs text-slate-600"
                  >
                    {DEVELOPER_STAGES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ProjectCard({ c }: { c: Extract<BoardCard, { kind: "project" }> }) {
  return (
    <>
      <Link href={`/admin/projects/${c.id}`} className="font-semibold text-slate-900 hover:text-brand-600">{c.title}</Link>
      <div className="text-xs text-slate-500">
        <Link href={`/admin/developers/${c.developerId}`} className="hover:text-brand-600">{c.company}</Link>
        {c.siblings > 1 && <span> · {c.siblings} projects</span>}
      </div>
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="font-mono text-slate-500">{c.code} · {num(c.mw)} MW</span>
        {c.score != null && c.score > 0 && (
          <span className={`rounded-full px-2 py-0.5 font-medium ${c.score >= 70 ? "bg-emerald-100 text-emerald-800" : c.score >= 50 ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-700"}`}>Score {c.score}</span>
        )}
      </div>
    </>
  );
}

function DeveloperCard({ c }: { c: Extract<BoardCard, { kind: "developer" }> }) {
  return (
    <>
      <Link href={`/admin/developers/${c.id}`} className="font-semibold text-slate-900 hover:text-brand-600">{c.company}</Link>
      <div className="text-xs text-slate-500">{c.contactName}</div>
      <Link href={`/admin/projects/new?developerId=${c.id}`} className="mt-2 block text-xs text-brand-600">No projects yet · Add a project</Link>
    </>
  );
}
