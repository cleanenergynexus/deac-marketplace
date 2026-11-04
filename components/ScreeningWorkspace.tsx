"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveScreeningAnswer, saveScreeningDecision, saveScreeningReport, startScreening } from "@/app/actions/screening";
import { MarkdownView } from "@/components/MarkdownView";
import { SourceFilePicker, SourceSummary, type PickFile } from "@/components/SourceFilePicker";
import { Badge } from "@/components/ui";
import type { DrFolder } from "@/lib/dataroom";
import { planSources, readKind } from "@/lib/wizard";
import {
  ANSWER_STATUSES, DECISIONS, DECISION_INFO, STATUS_INFO, effectiveAnswer, progress, sponsorQuestions, sponsorQuestionsText,
  type AnswerStatus, type Decision, type RunStatus, type ScreeningAnswers, type ScreeningCategory, type ScreeningOptions,
} from "@/lib/screening";

export type WorkspaceProps = {
  projectId: string; code: string; title: string; country: string;
  categories: ScreeningCategory[]; answers: ScreeningAnswers;
  run: { status: RunStatus; error: string | null; ranAt: string | null; ranBy: string | null; options: ScreeningOptions; sourceIds: string[] };
  summary: string; redFlags: string[]; researchNotes: string; webSources: { title: string; url: string }[];
  sourceNotes: { name: string; status: "read" | "skipped"; reason?: string }[];
  decision: Decision; decisionNote: string;
  saved: { url: string; at: string } | null;
  folders: DrFolder[]; files: PickFile[];
  sponsorEmail: string | null; sponsorName: string | null;
  aiEnabled: boolean; storageReady: boolean;
};

const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export function ScreeningWorkspace(props: WorkspaceProps) {
  const { projectId, categories, answers, run } = props;
  const router = useRouter();
  const p = progress(categories, answers);
  const [openOnly, setOpenOnly] = useState(false);
  const [showRun, setShowRun] = useState(run.status === "IDLE" && !run.ranAt);

  // While Claude researches, check back every few seconds.
  useEffect(() => {
    if (run.status !== "RUNNING") return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [run.status, router]);

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Screening progress: {p.percent}%</div>
            <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
              {(["ANSWERED", "PARTIAL", "MISSING", "CONFLICT", "NA"] as AnswerStatus[]).filter((s) => p[s]).map((s) => <Badge key={s} tone={STATUS_INFO[s].tone}>{p[s]} {STATUS_INFO[s].label.toLowerCase()}</Badge>)}
              <Badge tone="blue">{p.verified} of {p.total} verified by the team</Badge>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {run.status !== "RUNNING" && <button type="button" className="btn" onClick={() => setShowRun((v) => !v)}>{run.ranAt ? "✨ Research again with AI" : "✨ Pre-research with AI"}</button>}
            <ReportButton {...props} />
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden>
          <div className="h-full bg-emerald-500" style={{ width: `${p.percent}%` }} />
        </div>
        {run.ranAt && run.status !== "RUNNING" && <p className="mt-2 text-xs text-slate-500">Claude last researched this project {fmt(run.ranAt)}{run.ranBy ? ` (started by ${run.ranBy})` : ""}{run.options.webResearch ? ", including the web" : ""}.</p>}
      </div>

      <RunPanel {...props} open={showRun} onStarted={() => setShowRun(false)} />

      {(props.summary || props.redFlags.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
          {props.summary && <section className="card p-5"><h2 className="mb-2 font-semibold">AI Screening Summary</h2><p className="whitespace-pre-line text-sm text-slate-700">{props.summary}</p></section>}
          {props.redFlags.length > 0 && (
            <section className="card border-red-200 bg-red-50/40 p-5">
              <h2 className="mb-2 font-semibold text-red-800">🚩 Red Flags</h2>
              <ul className="list-disc space-y-1 pl-5 text-sm text-red-900">{props.redFlags.map((f, i) => <li key={i}>{f}</li>)}</ul>
            </section>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Screening Questions</h2>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} /> Only show open questions</label>
      </div>
      {categories.map((c, ci) => {
        const qs = c.questions.filter((x) => !openOnly || !["ANSWERED", "NA"].includes(effectiveAnswer(answers[x.id]).status));
        if (!qs.length) return null;
        return (
          <section key={c.id} className="card p-5">
            <h3 className="flex items-center gap-2 font-semibold"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-xs text-white">{ci + 1}</span>{c.title}</h3>
            {c.note && <p className="mt-1 text-xs italic text-slate-500">{c.note}</p>}
            <ul className="mt-3 divide-y divide-slate-100">{qs.map((x) => <QuestionRow key={x.id} projectId={projectId} id={x.id} text={x.text} scope={x.scope} item={answers[x.id]} />)}</ul>
          </section>
        );
      })}

      <SponsorPanel {...props} />
      <DecisionPanel {...props} />
      <SourcesPanel {...props} />
    </div>
  );
}

function RunPanel(props: WorkspaceProps & { open: boolean; onStarted: () => void }) {
  const { run, files, folders, projectId } = props;
  const router = useRouter();
  const readable = useMemo(() => files.filter((f) => readKind(f.name).kind), [files]);
  const [checked, setChecked] = useState<Set<string>>(() => new Set(run.sourceIds.length ? run.sourceIds : readable.map((f) => f.id)));
  const [notes, setNotes] = useState(run.options.notes);
  const [web, setWeb] = useState(run.ranAt ? run.options.webResearch : true);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  if (run.status === "RUNNING") {
    return (
      <div className="card flex items-start gap-4 p-5">
        <span className="mt-1 inline-block h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" aria-hidden />
        <div className="text-sm">
          <p className="font-semibold">Claude is researching this project…</p>
          <p className="mt-1 text-slate-600">Reading {run.sourceIds.length} data room file{run.sourceIds.length === 1 ? "" : "s"}, the listing and your CRM notes{run.options.webResearch ? ", and searching the web" : ""}, then answering each screening question. This usually takes 2 to 5 minutes. You can keep editing answers or leave the page; it updates by itself.</p>
        </div>
      </div>
    );
  }

  const failed = run.status === "FAILED" && (
    <p className="rounded bg-red-50 p-3 text-sm text-red-700"><b>The last AI research didn&apos;t finish.</b> {run.error ?? "It took too long and was stopped. Try again with fewer files or without web research."}</p>
  );
  if (!props.open) return failed || null;

  const go = () => {
    setError("");
    start(async () => {
      const r = await startScreening({ projectId, fileIds: planSources(files.filter((f) => checked.has(f.id))).use.map((f) => f.id), options: { webResearch: web, notes } });
      if (r.error) { setError(r.error); return; }
      props.onStarted();
      router.refresh();
    });
  };

  return (
    <section className="card space-y-4 p-5">
      {failed}
      <div>
        <h2 className="font-semibold">Pre-Research with AI</h2>
        <p className="mt-1 text-sm text-slate-600">Claude reads what the sponsor gave you (listing details, the files you pick and the notes logged in the CRM), optionally researches the web, and answers each screening question with its sources. Anything it can&apos;t confirm becomes a gap with a ready-to-send question for the sponsor. Answers your team already entered are kept.</p>
      </div>
      {!props.aiEnabled && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">AI research needs an Anthropic API key: add <code>ANTHROPIC_API_KEY</code> in Vercel → Settings → Environment Variables, then redeploy. You can still fill in the screening by hand below.</p>}
      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><span className="label mb-0">Data room files to read</span><SourceSummary files={files} checked={checked} /></div>
        <SourceFilePicker folders={folders} files={files} checked={checked} onChange={setChecked} emptyText="This data room is empty. Claude will work from the listing, your notes and the web. Upload the sponsor's documents to the data room for a better screening." />
      </div>
      <label className="block">
        <span className="label">Notes for Claude (optional)</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={20000} className="input" placeholder="Paste what the sponsor told you on the intro call or by email, or tell Claude what to focus on." />
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5" checked={web} onChange={(e) => setWeb(e.target.checked)} />
        <span><b>Research the internet too.</b> Claude searches for the sponsor, site, utility and interconnection queue, permits, Nation / landowner approvals and announced customers, and lists every source. Takes a few minutes longer.</span>
      </label>
      {error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn" onClick={go} disabled={pending || !props.aiEnabled}>{pending ? "Starting…" : "✨ Start AI research"}</button>
        <button type="button" className="btn-ghost" onClick={props.onStarted}>Cancel</button>
      </div>
    </section>
  );
}

function QuestionRow({ projectId, id, text, scope, item }: { projectId: string; id: string; text: string; scope: string; item: ScreeningAnswers[string] | undefined }) {
  const router = useRouter();
  const e = effectiveAnswer(item);
  const ai = item?.ai ?? null;
  const team = item?.team;
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<string>(team?.status ?? "");
  const [answer, setAnswer] = useState(team?.answer ?? "");
  const [verified, setVerified] = useState(team?.verified ?? false);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();

  const save = (t: { status: string; answer: string; verified: boolean }) => start(async () => {
    setErr("");
    const r = await saveScreeningAnswer(projectId, id, t);
    if (r.error) { setErr(r.error); return; }
    setEditing(false);
    router.refresh();
  });
  const openEditor = () => { setStatus(team?.status || ai?.status || ""); setAnswer(team?.answer || ai?.answer || ""); setVerified(team?.verified ?? false); setEditing(true); };

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{text}{scope === "CA" && <span className="ml-2 rounded bg-slate-100 px-1.5 text-[11px] font-normal text-slate-600">Canada</span>}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {team?.verified && <span title="Verified by the team" className="text-xs font-medium text-emerald-700">✓ Verified</span>}
          <Badge tone={STATUS_INFO[e.status].tone}>{STATUS_INFO[e.status].label}</Badge>
        </div>
      </div>

      {!editing && (
        <div className="mt-2 space-y-2 text-sm">
          {e.byTeam && team?.answer.trim() && (
            <div className="rounded border-l-4 border-brand-500 bg-brand-50/50 px-3 py-2"><div className="text-[11px] font-semibold uppercase text-brand-700">Team</div><p className="whitespace-pre-line">{team.answer}</p></div>
          )}
          {ai && (ai.answer || ai.sources) && (
            <div className={`rounded border-l-4 border-violet-300 bg-violet-50/40 px-3 py-2 ${e.byTeam && team?.answer.trim() ? "opacity-70" : ""}`}>
              <div className="text-[11px] font-semibold uppercase text-violet-700">Claude · {STATUS_INFO[ai.status].label}</div>
              {ai.answer && <p className="whitespace-pre-line">{ai.answer}</p>}
              {ai.sources && <p className="mt-1 text-xs text-slate-500">Source: {ai.sources}</p>}
            </div>
          )}
          {!["ANSWERED", "NA"].includes(e.status) && ai?.followUp && <p className="text-xs text-amber-800"><b>Ask the sponsor:</b> {ai.followUp}</p>}
          {!ai && !e.byTeam && <p className="text-xs text-slate-400">Not researched yet.</p>}
          <div className="flex flex-wrap gap-2">
            {ai && !team?.verified && <button type="button" disabled={pending} className="rounded px-2 py-0.5 text-xs text-emerald-700 hover:bg-emerald-50" onClick={() => save({ status: team?.status ?? "", answer: team?.answer ?? "", verified: true })}>✓ Mark verified</button>}
            {team?.verified && <button type="button" disabled={pending} className="rounded px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-100" onClick={() => save({ status: team.status, answer: team.answer, verified: false })}>Unverify</button>}
            <button type="button" className="rounded px-2 py-0.5 text-xs text-brand-600 hover:bg-brand-50" onClick={openEditor}>{e.byTeam ? "Edit team answer" : "✎ Answer / correct"}</button>
            {e.byTeam && <button type="button" disabled={pending} className="rounded px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-100" onClick={() => { if (confirm("Clear the team's answer and go back to Claude's?")) save({ status: "", answer: "", verified: false }); }}>Clear team answer</button>}
          </div>
          {err && <p className="text-xs text-red-700">{err}</p>}
        </div>
      )}

      {editing && (
        <div className="mt-2 space-y-2 rounded border border-slate-200 bg-slate-50 p-3">
          <textarea value={answer} onChange={(ev) => setAnswer(ev.target.value)} rows={3} className="input text-sm" placeholder="The answer, e.g. from the sponsor's reply or your call notes." autoFocus />
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2">Status
              <span className="w-44"><select value={status} onChange={(ev) => setStatus(ev.target.value)} className="input py-1 text-sm">
                <option value="">{ai ? `Claude's (${STATUS_INFO[ai.status].label})` : "Not set"}</option>
                {ANSWER_STATUSES.map((s) => <option key={s} value={s}>{STATUS_INFO[s].label}</option>)}
              </select></span>
            </label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={verified} onChange={(ev) => setVerified(ev.target.checked)} /> Verified</label>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn py-1 text-sm" disabled={pending} onClick={() => save({ status, answer, verified })}>{pending ? "Saving…" : "Save"}</button>
            <button type="button" className="btn-ghost py-1 text-sm" onClick={() => setEditing(false)}>Cancel</button>
          </div>
          {err && <p className="text-xs text-red-700">{err}</p>}
        </div>
      )}
    </li>
  );
}

function SponsorPanel({ categories, answers, title, sponsorEmail, sponsorName }: WorkspaceProps) {
  const groups = sponsorQuestions(categories, answers);
  const [copied, setCopied] = useState(false);
  const text = sponsorQuestionsText(categories, answers, title);
  const copy = async () => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked */ } };
  const mailto = sponsorEmail ? `mailto:${encodeURIComponent(sponsorEmail)}?subject=${encodeURIComponent(`Screening questions: ${title}`)}&body=${encodeURIComponent(`${sponsorName ? `Hi ${sponsorName.split(" ")[0]},\n\n` : ""}${text}`)}` : null;
  let n = 0;
  return (
    <section className="card p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Questions for the Sponsor</h2>
        {groups.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-ghost" onClick={copy}>{copied ? "✓ Copied" : "Copy questions"}</button>
            {mailto && <a className="btn-ghost" href={mailto}>Draft email to {sponsorName ?? sponsorEmail}</a>}
          </div>
        )}
      </div>
      {!groups.length ? <p className="text-sm text-slate-500">No open questions. Every question is answered or marked not applicable.</p> : (
        <div className="space-y-3 text-sm">
          <p className="text-slate-600">Every question that isn&apos;t answered yet, using Claude&apos;s specific follow-up where it wrote one. Copy them into your email, or answer them above as replies come in.</p>
          {groups.map((g) => (
            <div key={g.title}>
              <div className="font-semibold">{g.title}</div>
              {g.note && <div className="text-xs italic text-slate-500">{g.note}</div>}
              <ol className="mt-1 space-y-1">{g.items.map((i) => <li key={i.id} className="flex gap-2"><span className="w-6 shrink-0 text-right text-slate-400">{++n}.</span><span>{i.text} <Badge tone={STATUS_INFO[i.status].tone}>{STATUS_INFO[i.status].label}</Badge></span></li>)}</ol>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function DecisionPanel({ projectId, decision, decisionNote }: WorkspaceProps) {
  const router = useRouter();
  const [d, setD] = useState<Decision>(decision);
  const [note, setNote] = useState(decisionNote);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pending, start] = useTransition();
  return (
    <section className="card p-5">
      <h2 className="mb-3 text-lg font-semibold">Screening Decision</h2>
      <div className="flex flex-wrap gap-2">
        {DECISIONS.filter((x): x is Exclude<Decision, ""> => !!x).map((x) => (
          <button key={x} type="button" aria-pressed={d === x} onClick={() => { setD(d === x ? "" : x); setMsg({}); }}
            className={`rounded-lg border px-4 py-2 text-sm font-medium ${d === x ? (x === "ADVANCE" ? "border-emerald-600 bg-emerald-50 text-emerald-800" : x === "HOLD" ? "border-amber-500 bg-amber-50 text-amber-800" : "border-red-600 bg-red-50 text-red-700") : "border-slate-200 bg-white hover:border-slate-300"}`}>
            {DECISION_INFO[x].label}
          </button>
        ))}
      </div>
      <textarea value={note} onChange={(e) => { setNote(e.target.value); setMsg({}); }} rows={2} maxLength={5000} className="input mt-3 text-sm" placeholder="Why (optional): e.g. advance once the utility confirms 50 MW load service." />
      <div className="mt-2 flex items-center gap-3">
        <button type="button" className="btn-ghost" disabled={pending} onClick={() => start(async () => { const r = await saveScreeningDecision(projectId, d, note); setMsg(r); router.refresh(); })}>{pending ? "Saving…" : "Save decision"}</button>
        {msg.ok && <span role="status" className="text-sm font-medium text-emerald-700">✓ {msg.ok}</span>}
        {msg.error && <span role="alert" className="text-sm text-red-700">{msg.error}</span>}
      </div>
    </section>
  );
}

function SourcesPanel({ sourceNotes, webSources, researchNotes }: WorkspaceProps) {
  if (!sourceNotes.length && !webSources.length && !researchNotes) return null;
  const read = sourceNotes.filter((s) => s.status === "read");
  const skipped = sourceNotes.filter((s) => s.status === "skipped");
  return (
    <section className="card space-y-3 p-5 text-sm">
      <h2 className="text-lg font-semibold">What Claude Looked At</h2>
      {read.length > 0 && <div><b>Data room files read:</b><ul className="list-disc pl-5 text-slate-700">{read.map((s) => <li key={s.name}>{s.name}{s.reason ? ` (${s.reason})` : ""}</li>)}</ul></div>}
      {skipped.length > 0 && <div className="text-amber-900"><b>Skipped:</b><ul className="list-disc pl-5">{skipped.map((s) => <li key={s.name}>{s.name}: {s.reason}</li>)}</ul></div>}
      {webSources.length > 0 && <div><b>Web sources:</b><ul className="list-disc pl-5">{webSources.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">{s.title || s.url}</a></li>)}</ul></div>}
      {researchNotes && (
        <details className="rounded border border-slate-200 p-3">
          <summary className="cursor-pointer font-medium">Web Research Notes</summary>
          <div className="mt-2"><MarkdownView markdown={researchNotes} /></div>
        </details>
      )}
    </section>
  );
}

function ReportButton({ projectId, saved, storageReady }: WorkspaceProps) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok?: string; error?: string; url?: string }>({});
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" className="btn-ghost" disabled={pending || !storageReady} title={storageReady ? undefined : "File storage isn't connected yet"}
        onClick={() => start(async () => { const r = await saveScreeningReport(projectId); setMsg(r); router.refresh(); })}>
        {pending ? "Saving…" : saved ? "Update PDF in data room" : "Save PDF to data room"}
      </button>
      {msg.error && <span role="alert" className="text-xs text-red-700">{msg.error}</span>}
      {(msg.url || saved) && <a href={msg.url ?? saved!.url} target="_blank" rel="noreferrer" className="text-xs text-brand-600">{msg.ok ? `✓ ${msg.ok} Open` : `Open saved PDF (${fmt(saved!.at)})`}</a>}
    </div>
  );
}
