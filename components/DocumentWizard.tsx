"use client";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { startWizard } from "@/app/actions/wizard";
import { descendantIds, formatBytes, type DrFolder } from "@/lib/dataroom";
import { KIND_INFO, MAX_BINARY_BYTES, WIZARD_KINDS, planSources, readKind, type WizardKind } from "@/lib/wizard";
import { FileIcon, FolderIcon } from "@/components/DataRoomIcons";

type WFile = { id: string; folderId: string | null; name: string; size: number };

const BRIEF_EXAMPLES = [
  "Summarize the interconnection study: capacity, upgrades, costs, timeline and risks.",
  "Compare the two site options in these documents and recommend one.",
  "Research the utility, ISO and power prices for this location and write a power market memo.",
  "List every deadline, milestone and obligation in the selected contracts.",
];

export function DocumentWizard({ projectId, code, folders, files, generatedIds, enabled }: {
  projectId: string; code: string; folders: DrFolder[]; files: WFile[]; generatedIds: string[]; enabled: boolean;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<WizardKind>("TEASER");
  const readable = useMemo(() => files.filter((f) => readKind(f.name).kind), [files]);
  const [checked, setChecked] = useState<Set<string>>(() => new Set(readable.filter((f) => !generatedIds.includes(f.id)).map((f) => f.id)));
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState("");
  const [audience, setAudience] = useState("");
  const [instructions, setInstructions] = useState("");
  const [anonymous, setAnonymous] = useState(true);
  const [webResearch, setWebResearch] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const kids = useMemo(() => {
    const m = new Map<string | null, DrFolder[]>();
    for (const f of folders) m.set(f.parentId, [...(m.get(f.parentId) ?? []), f]);
    for (const l of m.values()) l.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    return m;
  }, [folders]);
  const filesIn = (folderId: string | null) => files.filter((f) => f.folderId === folderId).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const readableUnder = (folderId: string) => { const ids = descendantIds(folders, folderId); return readable.filter((f) => f.folderId && ids.has(f.folderId)); };
  const toggle = (ids: string[], on: boolean) => setChecked((c) => { const n = new Set(c); for (const id of ids) if (on) n.add(id); else n.delete(id); return n; });

  const picked = files.filter((f) => checked.has(f.id));
  const plan = planSources(picked);
  const binary = picked.filter((f) => ["pdf", "image"].includes(readKind(f.name).kind ?? "")).reduce((n, f) => n + f.size, 0);
  const anonApplies = kind === "TEASER" || kind === "DECK";

  const tree = (parent: string | null, depth: number): ReactNode => (
    <>
      {(kids.get(parent) ?? []).map((d) => {
        const under = readableUnder(d.id);
        const all = under.length > 0 && under.every((f) => checked.has(f.id));
        const open = !collapsed.has(d.id);
        const count = under.filter((f) => checked.has(f.id)).length;
        return (
          <div key={d.id}>
            <div className="flex items-center gap-2 rounded py-1 pr-2 text-sm hover:bg-slate-50" style={{ paddingLeft: depth * 16 + 8 }}>
              <input type="checkbox" aria-label={`Select all in ${d.name}`} disabled={!under.length} checked={all} onChange={(e) => toggle(under.map((f) => f.id), e.target.checked)} />
              <button type="button" onClick={() => setCollapsed((c) => { const n = new Set(c); if (n.has(d.id)) n.delete(d.id); else n.add(d.id); return n; })} className="flex min-w-0 items-center gap-1.5">
                <FolderIcon open={open} className="h-4 w-4" /><span className="truncate font-medium">{d.name}</span>
              </button>
              {count > 0 && <span className="ml-auto shrink-0 text-xs text-slate-500">{count} selected</span>}
            </div>
            {open && tree(d.id, depth + 1)}
          </div>
        );
      })}
      {filesIn(parent).map((f) => {
        const r = readKind(f.name);
        return (
          <label key={f.id} className={`flex items-center gap-2 rounded py-1 pr-2 text-sm ${r.kind ? "cursor-pointer hover:bg-slate-50" : "text-slate-400"}`} style={{ paddingLeft: depth * 16 + 8 }} title={r.kind ? undefined : r.reason}>
            <input type="checkbox" disabled={!r.kind} checked={checked.has(f.id)} onChange={(e) => toggle([f.id], e.target.checked)} />
            <FileIcon name={f.name} className="h-4 w-4" />
            <span className="truncate">{f.name}</span>
            {generatedIds.includes(f.id) && <span className="shrink-0 rounded bg-violet-100 px-1.5 text-[11px] text-violet-800">wizard</span>}
            <span className="ml-auto shrink-0 text-xs text-slate-400">{r.kind ? formatBytes(f.size) : "can't read"}</span>
          </label>
        );
      })}
    </>
  );

  const submit = () => {
    setError("");
    start(async () => {
      const r = await startWizard({ projectId, kind, title, fileIds: plan.use.map((f) => f.id), options: { anonymous: anonApplies && anonymous, webResearch, instructions, audience } });
      if (r.error || !r.id) { setError(r.error ?? "Couldn't start."); return; }
      router.push(`/admin/projects/${projectId}/data-room/wizard/${r.id}`);
    });
  };

  return (
    <div className="space-y-5">
      {!enabled && (
        <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
          The Document Wizard uses Claude and needs an Anthropic API key. Add <code>ANTHROPIC_API_KEY</code> in Vercel → Settings → Environment Variables, then redeploy. (It is the same key the listing importer uses.)
        </p>
      )}

      <Step n={1} title="What should Claude write?">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {WIZARD_KINDS.map((k) => (
            <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k}
              className={`rounded-lg border p-4 text-left transition ${kind === k ? "border-brand-600 bg-brand-50 ring-1 ring-brand-600" : "border-slate-200 bg-white hover:border-slate-300"}`}>
              <div className="text-2xl" aria-hidden>{KIND_INFO[k].icon}</div>
              <div className="mt-1 font-semibold">{KIND_INFO[k].label}</div>
              <div className="mt-1 text-xs text-slate-600">{KIND_INFO[k].blurb}</div>
            </button>
          ))}
        </div>
      </Step>

      <Step n={2} title="Which data room files should it read?" aside={<span className="text-xs text-slate-500">{plan.use.length} of {readable.length} readable files · PDFs & images {formatBytes(binary)} of {formatBytes(MAX_BINARY_BYTES)}</span>}>
        {files.length === 0 ? (
          <p className="rounded border border-dashed border-slate-300 p-4 text-sm text-slate-500">This data room is empty. Upload files first{webResearch || kind === "CUSTOM" ? ", or let Claude work from the listing details and the web" : ""}.</p>
        ) : (
          <>
            <div className="mb-2 flex flex-wrap gap-2 text-xs">
              <button type="button" className="btn-ghost py-1 text-xs" onClick={() => setChecked(new Set(readable.map((f) => f.id)))}>Select all</button>
              <button type="button" className="btn-ghost py-1 text-xs" onClick={() => setChecked(new Set())}>Clear</button>
            </div>
            <div className="max-h-80 overflow-y-auto rounded border border-slate-200 p-1">{tree(null, 0)}</div>
            <p className="mt-2 text-xs text-slate-500">Reads PDF, Word (.docx), Excel (.xlsx, values as last saved), PowerPoint (.pptx), images and text files. Older .doc / .xls / .ppt files and drawings can&apos;t be read; save them as PDF.</p>
            {plan.skipped.length > 0 && (
              <div className="mt-2 rounded bg-amber-50 p-2 text-xs text-amber-900">
                <b>Won&apos;t be read:</b>
                <ul className="list-disc pl-5">{plan.skipped.map((s) => <li key={s.name}>{s.name}: {s.reason}</li>)}</ul>
              </div>
            )}
          </>
        )}
      </Step>

      <Step n={3} title="Settings">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="label">Title (optional)</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="input" placeholder={kind === "CUSTOM" ? "e.g. Interconnection study summary" : `${code} ${KIND_INFO[kind].label}`} maxLength={200} />
          </label>
          <label className="block">
            <span className="label">Audience (optional)</span>
            <input value={audience} onChange={(e) => setAudience(e.target.value)} className="input" placeholder="e.g. infrastructure funds, hyperscaler real estate team, lender credit committee" maxLength={300} />
          </label>
        </div>
        <label className="mt-4 block">
          <span className="label">{kind === "CUSTOM" ? "Brief: what should the report cover?" : "Extra instructions (optional)"}</span>
          <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={kind === "CUSTOM" ? 5 : 3} className="input" maxLength={8000}
            placeholder={kind === "CUSTOM" ? "Describe the report, question or summary you need." : "e.g. Emphasize the expansion to 300 MW. Keep it to one page."} />
        </label>
        {kind === "CUSTOM" && (
          <div className="mt-2 flex flex-wrap gap-2">
            {BRIEF_EXAMPLES.map((ex) => <button key={ex} type="button" onClick={() => setInstructions(ex)} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-left text-xs text-slate-600 hover:border-brand-500 hover:text-brand-700">{ex}</button>)}
          </div>
        )}
        <div className="mt-4 space-y-2 text-sm">
          {anonApplies && (
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-0.5" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
              <span><b>Anonymous (blind) version.</b> Hides the sponsor, counterparties, street address and city; location shown by region and state only.</span>
            </label>
          )}
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-0.5" checked={webResearch} onChange={(e) => setWebResearch(e.target.checked)} />
            <span><b>Research the internet too.</b> Claude searches the web for market context (utility and grid, power prices, nearby data center activity, incentives, news) and links every source it uses. Takes longer.</span>
          </label>
        </div>
      </Step>

      {error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn" onClick={submit} disabled={pending || !enabled}>{pending ? "Starting…" : `✨ Write ${KIND_INFO[kind].label}`}</button>
        <span className="text-sm text-slate-500">Claude usually takes 1 to 4 minutes. You can leave the page; the draft appears below when it&apos;s done.</span>
      </div>
    </div>
  );
}

function Step({ n, title, aside, children }: { n: number; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="card p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-xs text-white">{n}</span>{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}
