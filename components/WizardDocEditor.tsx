"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { deleteWizardDoc, regenerateWizard, saveDraft, saveToDataRoom } from "@/app/actions/wizard";
import { MarkdownView } from "@/components/MarkdownView";
import { KIND_INFO, type WizardKind, type WizardOptions, type WizardStatus } from "@/lib/wizard";

type Doc = {
  id: string; projectId: string; kind: WizardKind; title: string; markdown: string; error: string | null; status: WizardStatus;
  options: WizardOptions; sourceNotes: { name: string; status: "read" | "skipped"; reason?: string }[]; sourceCount: number;
  webSources: { title: string; url: string }[]; savedAt: string | null; saved: { name: string; url: string }[];
};

type View = "split" | "preview" | "edit";

export function WizardDocEditor({ doc, storageReady }: { doc: Doc; storageReady: boolean }) {
  const router = useRouter();
  const [title, setTitle] = useState(doc.title);
  const [markdown, setMarkdown] = useState(doc.markdown);
  const [view, setView] = useState<View>("split");
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const dirty = title !== doc.title || markdown !== doc.markdown;

  // A new draft from the server (first finish, or "Write again") replaces the editor text.
  useEffect(() => { setTitle(doc.title); setMarkdown(doc.markdown); }, [doc.title, doc.markdown]);

  // While Claude writes, check back every few seconds.
  useEffect(() => {
    if (doc.status !== "GENERATING") return;
    const t = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(t);
  }, [doc.status, router]);

  // Warn before leaving with unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const run = (fn: () => Promise<{ error?: string }>, ok?: string) => start(async () => {
    setMsg(null);
    const r = await fn();
    if (r.error) setMsg({ tone: "error", text: r.error });
    else { if (ok) setMsg({ tone: "ok", text: ok }); router.refresh(); }
  });

  const save = () => run(() => saveDraft(doc.id, { title, markdown }), "Draft saved.");
  const toDataRoom = () => run(async () => {
    if (dirty) { const r = await saveDraft(doc.id, { title, markdown }); if (r.error) return r; }
    return saveToDataRoom(doc.id);
  }, doc.kind === "DECK" ? "Saved to the data room as PDF and PowerPoint." : "Saved to the data room as PDF.");
  const again = () => {
    if (!confirm("Claude will write this document again from the same files and settings. Your edits to the current draft will be replaced. Continue?")) return;
    run(() => regenerateWizard(doc.id));
  };
  const remove = () => {
    if (!confirm("Delete this draft? Files already saved to the data room stay there.")) return;
    start(async () => { await deleteWizardDoc(doc.id); router.push(`/admin/projects/${doc.projectId}/data-room/wizard`); });
  };

  if (doc.status === "GENERATING") {
    return (
      <div className="card flex items-start gap-4 p-6">
        <span className="mt-1 inline-block h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" aria-hidden />
        <div className="text-sm">
          <p className="font-semibold">Claude is writing your {KIND_INFO[doc.kind].label.toLowerCase()}…</p>
          <p className="mt-1 text-slate-600">
            Reading {doc.sourceCount} data room file{doc.sourceCount === 1 ? "" : "s"}{doc.options.webResearch ? " and researching the web" : ""}. This usually takes 1 to 4 minutes{doc.options.webResearch ? ", a bit longer with web research" : ""}. You can leave this page and come back; it updates by itself.
          </p>
        </div>
      </div>
    );
  }

  if (doc.status === "FAILED") {
    return (
      <div className="card space-y-3 p-6 text-sm">
        <p className="font-semibold text-red-700">Claude couldn&apos;t finish this document.</p>
        <p className="text-slate-700">{doc.error ?? "It took too long or the server stopped. Try again, with fewer files or without web research."}</p>
        <Sources doc={doc} />
        <div className="flex gap-2">
          <button className="btn" onClick={again} disabled={pending}>Try again</button>
          <button className="btn-danger" onClick={remove} disabled={pending}>Delete</button>
        </div>
        {msg && <p className={msg.tone === "error" ? "text-red-700" : "text-emerald-700"}>{msg.text}</p>}
      </div>
    );
  }

  const deck = doc.kind === "DECK";
  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-2 p-3">
        <input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Title" className="input max-w-sm" />
        <div className="flex overflow-hidden rounded-md border border-slate-300 text-sm" role="group" aria-label="View">
          {(["split", "preview", "edit"] as View[]).map((v) => (
            <button key={v} type="button" onClick={() => setView(v)} aria-pressed={view === v} className={`px-3 py-1.5 ${view === v ? "bg-brand-600 text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}>
              {v === "split" ? "Side by side" : v === "preview" ? "Preview" : "Edit text"}
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <button className="btn-ghost" onClick={save} disabled={pending || !dirty}>{dirty ? "Save draft" : "Draft saved"}</button>
          <button className="btn" onClick={toDataRoom} disabled={pending || !storageReady || !markdown.trim()} title={storageReady ? undefined : "Connect file storage first (see the data room page)"}>
            {pending ? "Working…" : doc.saved.length ? "Update in data room" : "Save to data room"}
          </button>
        </div>
      </div>
      {msg && <p className={`rounded p-3 text-sm ${msg.tone === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}>{msg.text}</p>}

      <div className={`grid gap-4 ${view === "split" ? "lg:grid-cols-2" : ""}`}>
        {view !== "preview" && (
          <div className="card flex flex-col p-3">
            <p className="mb-2 text-xs text-slate-500">
              Markdown: <code># Title</code>, <code>## Section</code>{deck ? " (one per slide)" : ""}, <code>- bullet</code>, <code>**bold**</code>, <code>| table | rows |</code>. Text in [To confirm: …] marks gaps Claude found.
            </p>
            <textarea value={markdown} onChange={(e) => setMarkdown(e.target.value)} aria-label="Document text" spellCheck className="input min-h-[70vh] flex-1 font-mono text-xs leading-relaxed" />
          </div>
        )}
        {view !== "edit" && (
          <div className={deck ? "" : "card p-8"}>
            <MarkdownView markdown={markdown} deck={deck} />
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card space-y-3 p-4 text-sm">
          <h3 className="font-semibold">In the data room</h3>
          {doc.saved.length ? (
            <>
              <ul className="space-y-1">{doc.saved.map((f) => <li key={f.url}><a href={f.url} target="_blank" rel="noreferrer" className="text-brand-600 underline">{f.name}</a></li>)}</ul>
              <p className="text-xs text-slate-500">{dirty ? "You have unsaved edits. " : ""}&quot;Update in data room&quot; replaces these files and keeps their place and any listing sharing.</p>
            </>
          ) : (
            <p className="text-slate-600">Not saved yet. Saving files it in <b>{KIND_INFO[doc.kind].folder}</b> (or a matching folder that already exists){deck ? " as PDF and PowerPoint" : " as a PDF"}.</p>
          )}
          <p className="text-xs text-slate-500">To show it to investors, open the <Link href={`/admin/projects/${doc.projectId}/data-room`} className="text-brand-600">data room</Link> and use <b>Share on listing</b> on the file.</p>
          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
            <button className="btn-ghost" onClick={again} disabled={pending}>↻ Write again</button>
            <button className="btn-danger" onClick={remove} disabled={pending}>Delete draft</button>
          </div>
        </div>
        <div className="card p-4 text-sm"><Sources doc={doc} /></div>
      </div>
    </div>
  );
}

function Sources({ doc }: { doc: Doc }) {
  const read = doc.sourceNotes.filter((n) => n.status === "read");
  const skipped = doc.sourceNotes.filter((n) => n.status === "skipped");
  return (
    <div className="space-y-2">
      <h3 className="font-semibold">What Claude used</h3>
      <p className="text-xs text-slate-500">
        {[doc.options.anonymous && "Anonymous version", doc.options.webResearch ? "Web research on" : "Data room only", doc.options.audience && `Audience: ${doc.options.audience}`].filter(Boolean).join(" · ")}
      </p>
      {doc.options.instructions && <p className="rounded bg-slate-50 p-2 text-xs text-slate-600"><b>{doc.kind === "CUSTOM" ? "Brief" : "Instructions"}:</b> {doc.options.instructions}</p>}
      {read.length > 0 && <ul className="list-disc space-y-0.5 pl-5 text-xs">{read.map((n) => <li key={n.name}>{n.name}{n.reason && <span className="text-amber-700"> ({n.reason})</span>}</li>)}</ul>}
      {!read.length && !doc.webSources.length && <p className="text-xs text-slate-500">Only the listing details.</p>}
      {skipped.length > 0 && <div className="rounded bg-amber-50 p-2 text-xs text-amber-900"><b>Skipped:</b><ul className="list-disc pl-5">{skipped.map((n) => <li key={n.name}>{n.name}: {n.reason}</li>)}</ul></div>}
      {doc.webSources.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer font-medium">{doc.webSources.length} web page{doc.webSources.length === 1 ? "" : "s"} found</summary>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">{doc.webSources.map((w) => <li key={w.url}><a href={w.url} target="_blank" rel="noreferrer noopener" className="text-brand-600 underline">{w.title || w.url}</a></li>)}</ul>
        </details>
      )}
    </div>
  );
}
