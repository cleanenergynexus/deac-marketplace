"use client";
import Link from "next/link";
import { useOptimistic, useTransition, useState } from "react";
import { setDeveloperStage, setProjectPipelineStage } from "@/app/actions/admin";
import { DEVELOPER_STAGES } from "@/lib/constants";
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
                  className={`card cursor-grab p-3 text-sm hover:shadow active:cursor-grabbing ${c.kind === "company" ? "border-dashed" : ""} ${dragging === key(c) ? "opacity-50" : ""}`}
                >
                  <Tile c={c} />
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
