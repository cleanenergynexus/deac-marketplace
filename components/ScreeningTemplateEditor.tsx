"use client";
import { useState, useTransition, type FormEvent } from "react";
import { DEFAULT_SCREENING, PARTNER_TOKEN, QUESTION_SCOPES, SCOPE_LABEL, type QuestionScope, type ScreeningCategory, type ScreeningTemplate } from "@/lib/screening";

type State = { error?: string; ok?: string } | undefined;

let seq = 0;
const newId = (p: string) => `${p}-new-${Date.now().toString(36)}-${++seq}`;
const swap = <T,>(xs: T[], i: number, j: number) => { if (j < 0 || j >= xs.length) return xs; const n = [...xs]; [n[i], n[j]] = [n[j], n[i]]; return n; };

/** Editor for the screening template: categories, their questions, and which projects each question applies to. */
export function ScreeningTemplateEditor({ initial, action }: { initial: ScreeningTemplate; action: (s: State, f: FormData) => Promise<State> }) {
  const [partnerName, setPartnerName] = useState(initial.partnerName);
  const [cats, setCats] = useState<ScreeningCategory[]>(initial.categories);
  const [state, setState] = useState<State>(undefined);
  const [pending, start] = useTransition();
  const edit = (fn: (cs: ScreeningCategory[]) => ScreeningCategory[]) => { setCats(fn); setState(undefined); };
  const editCat = (ci: number, patch: Partial<ScreeningCategory>) => edit((cs) => cs.map((c, i) => (i === ci ? { ...c, ...patch } : c)));
  const editQs = (ci: number, fn: (qs: ScreeningCategory["questions"]) => ScreeningCategory["questions"]) => edit((cs) => cs.map((c, i) => (i === ci ? { ...c, questions: fn(c.questions) } : c)));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const fd = new FormData();
    fd.set("config", JSON.stringify({ partnerName, categories: cats }));
    start(async () => setState(await action(undefined, fd)));
  };

  const btn = "h-7 w-7 shrink-0 rounded text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30";
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="card p-5">
        <label className="block max-w-sm">
          <span className="label">Partner name</span>
          <input value={partnerName} onChange={(e) => { setPartnerName(e.target.value); setState(undefined); }} className="input" placeholder="e.g. WDC" maxLength={80} />
        </label>
        <p className="mt-1 text-xs text-slate-500">Replaces <code>{PARTNER_TOKEN}</code> in any question, e.g. &quot;the specific role you envision for {PARTNER_TOKEN}&quot;.</p>
      </div>

      {cats.map((c, ci) => (
        <div key={c.id} className="card p-5">
          <div className="flex items-center gap-1">
            <span className="mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs text-white">{ci + 1}</span>
            <div className="min-w-0 flex-1"><input value={c.title} onChange={(e) => editCat(ci, { title: e.target.value })} aria-label="Category name" placeholder="Category name" className="input font-semibold" /></div>
            <button type="button" title="Move category up" aria-label="Move category up" onClick={() => edit((cs) => swap(cs, ci, ci - 1))} disabled={ci === 0} className={btn}>↑</button>
            <button type="button" title="Move category down" aria-label="Move category down" onClick={() => edit((cs) => swap(cs, ci, ci + 1))} disabled={ci === cats.length - 1} className={btn}>↓</button>
            <button type="button" title="Remove category" aria-label={`Remove ${c.title}`} className={`${btn} hover:!text-red-600`}
              onClick={() => { if (!c.questions.length || confirm(`Remove "${c.title || "this category"}" and its ${c.questions.length} question(s)? Answers already given stay saved but are hidden.`)) edit((cs) => cs.filter((_, i) => i !== ci)); }}>×</button>
          </div>
          <input value={c.note} onChange={(e) => editCat(ci, { note: e.target.value })} aria-label="Guidance for this category" placeholder="Guidance for the sponsor (optional), e.g. Please distinguish total site load from IT load." className="input mt-2 text-sm" />
          <ol className="mt-3 space-y-2">
            {c.questions.map((x, qi) => (
              <li key={x.id} className="flex items-start gap-1">
                <span className="w-6 shrink-0 pt-2 text-right text-xs text-slate-400">{qi + 1}.</span>
                <div className="min-w-0 flex-1">
                  <textarea value={x.text} rows={2} onChange={(e) => editQs(ci, (qs) => qs.map((y, j) => (j === qi ? { ...y, text: e.target.value } : y)))} aria-label="Question" placeholder="Question" className="input resize-y py-1.5 text-sm" />
                </div>
                <div className="w-36 shrink-0">
                  <select value={x.scope} onChange={(e) => editQs(ci, (qs) => qs.map((y, j) => (j === qi ? { ...y, scope: e.target.value as QuestionScope } : y)))} aria-label="Applies to" className="input py-1.5 text-sm">
                    {QUESTION_SCOPES.map((s) => <option key={s} value={s}>{SCOPE_LABEL[s]}</option>)}
                  </select>
                </div>
                <button type="button" title="Move up" aria-label="Move up" onClick={() => editQs(ci, (qs) => swap(qs, qi, qi - 1))} disabled={qi === 0} className={btn}>↑</button>
                <button type="button" title="Move down" aria-label="Move down" onClick={() => editQs(ci, (qs) => swap(qs, qi, qi + 1))} disabled={qi === c.questions.length - 1} className={btn}>↓</button>
                <button type="button" title="Remove question" aria-label="Remove question" onClick={() => editQs(ci, (qs) => qs.filter((_, j) => j !== qi))} className={`${btn} hover:!text-red-600`}>×</button>
              </li>
            ))}
          </ol>
          <button type="button" onClick={() => editQs(ci, (qs) => [...qs, { id: newId(c.id.slice(0, 12)), text: "", scope: "ALL" }])} className="mt-2 rounded px-2 py-1 text-sm text-brand-600 hover:bg-brand-50">+ Question</button>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => edit((cs) => [...cs, { id: newId("cat"), title: "", note: "", questions: [{ id: newId("q"), text: "", scope: "ALL" }] }])} className="btn-ghost">+ Category</button>
        <button type="button" onClick={() => { if (confirm("Replace the template with the DEAC default screening questions?")) { setPartnerName(DEFAULT_SCREENING.partnerName); edit(() => DEFAULT_SCREENING.categories); } }} className="btn-ghost">Restore DEAC default</button>
      </div>
      <div className="flex items-center gap-3">
        <button className="btn" disabled={pending}>{pending ? "Saving…" : "Save template"}</button>
        {state?.ok && <span role="status" className="text-sm font-medium text-emerald-700">✓ {state.ok}</span>}
        {state?.error && <span role="alert" className="text-sm text-red-700">{state.error}</span>}
      </div>
    </form>
  );
}
