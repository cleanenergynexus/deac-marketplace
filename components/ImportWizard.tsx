"use client";
import { useActionState, useState } from "react";
import type { Developer } from "@prisma/client";
import { extractProject, type ExtractState } from "@/app/actions/import";
import { createImportedProject } from "@/app/actions/admin";
import { ProjectForm } from "@/components/ProjectForm";
import { Field } from "@/components/ui";
import type { ImportResult } from "@/lib/importer";

const LABELS: Record<string, string> = { title: "Title", state: "State", mw: "Capacity (MW)", facilityType: "Facility type", dealType: "Deal type", fundingNeeded: "Funding needed", projectStatus: "Project status", summary: "Summary" };

export function ImportWizard({ developers, developerId, enabled }: { developers: Pick<Developer, "id" | "company">[]; developerId?: string; enabled: boolean }) {
  const [state, extract, pending] = useActionState<ExtractState, FormData>(extractProject, undefined);
  const result = state?.result;

  return (
    <div className="space-y-6">
      <Steps step={result ? 2 : 1} />
      {!enabled && (
        <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
          The importer needs an Anthropic API key. Add <code>ANTHROPIC_API_KEY</code> in Vercel → Settings → Environment Variables, then redeploy.
        </p>
      )}
      {!result ? (
        <form action={extract} className="card space-y-4 p-6">
          <Field label="Deal document">
            <input type="file" name="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.md,.csv,.html,application/pdf,image/*,text/*" className="input" />
            <span className="mt-1 block text-xs text-slate-500">PDF teaser, offering memo or broker flyer (up to 4.4 MB), a screenshot, or a text file. Save Word or PowerPoint as PDF first.</span>
          </Field>
          <Field label="Or paste text (email, notes…)">
            <textarea name="text" rows={5} className="input" placeholder="Paste a deal email or notes. You can combine this with a file." />
          </Field>
          {state?.error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{state.error}</p>}
          <div className="flex items-center gap-3">
            <button className="btn" disabled={pending || !enabled}>{pending ? "Reading document…" : "Extract project details"}</button>
            {pending && <span className="text-sm text-slate-500">Claude is reading the document. This usually takes under a minute.</span>}
          </div>
        </form>
      ) : (
        <Review result={result} sourceName={state?.sourceName ?? "document"} developers={developers} developerId={developerId} onRestart={() => window.location.reload()} />
      )}
    </div>
  );
}

function Steps({ step }: { step: 1 | 2 }) {
  const item = (n: number, label: string) => (
    <li className={`flex items-center gap-2 ${step === n ? "font-semibold text-slate-900" : "text-slate-500"}`}>
      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${step >= n ? "bg-brand-600 text-white" : "bg-slate-200"}`}>{n}</span>
      {label}
    </li>
  );
  return <ol className="flex flex-wrap gap-6 text-sm">{item(1, "Upload document")}{item(2, "Review & create listing")}</ol>;
}

function Review({ result, sourceName, developers, developerId, onRestart }: { result: ImportResult; sourceName: string; developers: Pick<Developer, "id" | "company">[]; developerId?: string; onRestart: () => void }) {
  // Started from a developer's page: keep that developer, whatever the document names.
  const [devChoice, setDevChoice] = useState(developerId ?? result.developerMatchId ?? (result.developer.company ? "__new__" : ""));
  const contactsNote = result.contacts.map((c) => [c.name, c.role && `(${c.role})`, c.company, c.email, c.phone].filter(Boolean).join(" ")).join("; ");
  const scoringCount = Object.keys(result.valuation).length;

  const developerField = (
    <Field label="Developer / sponsor" group>
      <select name="developerId" value={devChoice} onChange={(e) => setDevChoice(e.target.value)} className="input" required>
        <option value="">Choose…</option>
        <option value="__new__">+ New developer{result.developer.company ? `: ${result.developer.company}` : ""}</option>
        {developers.map((d) => <option key={d.id} value={d.id}>{d.company}</option>)}
      </select>
      {developerId && devChoice === developerId ? <span className="mt-1 block text-xs text-slate-500">Linked to the developer you started from.</span>
        : result.developerMatchId && <span className="mt-1 block text-xs text-emerald-700">Matched an existing developer.</span>}
    </Field>
  );

  return (
    <div className="space-y-4">
      <div className="card space-y-2 p-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p>Read from <b>{sourceName}</b>. Check every field before creating the listing. It is saved as a <b>Draft</b> unless you change visibility.</p>
          <button type="button" onClick={onRestart} className="btn-ghost">Start over</button>
        </div>
        {result.blank.length > 0 && (
          <p className="rounded bg-amber-50 p-2 text-amber-900">Not found in the document, fill in: {result.blank.map((k) => LABELS[k] ?? k).join(", ")}.</p>
        )}
        {result.missing.length > 0 && <p className="text-slate-600">Investors will likely ask for: {result.missing.join(", ")}.</p>}
      </div>
      <div className="card p-6">
        <ProjectForm developers={developers} action={createImportedProject} draft={result.listing} developerField={developerField} submitLabel="Create listing">
          <input type="hidden" name="sourceName" value={sourceName} />
          <input type="hidden" name="contactsNote" value={contactsNote} />
          <input type="hidden" name="valuation" value={JSON.stringify(result.valuation)} />
          {devChoice === "__new__" && (
            <>
              <h3 className="font-semibold">New developer</h3>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Company"><input name="devCompany" defaultValue={result.developer.company} required className="input" /></Field>
                <Field label="Contact name"><input name="devContactName" defaultValue={result.developer.contactName} className="input" /></Field>
                <Field label="Email"><input name="devEmail" type="email" defaultValue={result.developer.email} className="input" /></Field>
                <Field label="Phone"><input name="devPhone" defaultValue={result.developer.phone} className="input" /></Field>
                <Field label="Website"><input name="devWebsite" defaultValue={result.developer.website} className="input" /></Field>
              </div>
            </>
          )}
          {result.contacts.length > 0 && (
            <div className="text-sm">
              <h3 className="font-semibold">Contacts found</h3>
              <ul className="mt-1 list-disc pl-5 text-slate-600">{result.contacts.map((c, i) => <li key={i}>{[c.name, c.role && `(${c.role})`, c.company, c.email, c.phone].filter(Boolean).join(" · ")}</li>)}</ul>
              <p className="mt-1 text-xs text-slate-500">Saved to the developer&apos;s activity log.</p>
            </div>
          )}
          {scoringCount > 0 && <p className="text-sm text-slate-600">{scoringCount} valuation calculator inputs were also found. They prefill the calculator on the listing page, where you can review them and save a score.</p>}
        </ProjectForm>
      </div>
    </div>
  );
}
