"use client";
import { useActionState, useMemo, useState } from "react";
import { resetEmailTemplate, saveEmailTemplate, sendTestEmail } from "@/app/actions/email-templates";
import { renderTemplate, SAMPLE_VARS, TEMPLATE_INFO, type EmailSettings, type EmailTemplate, type TemplateKey } from "@/lib/email-templates";

const FIELDS: { k: keyof EmailTemplate; label: string; rows?: number; hint?: string }[] = [
  { k: "subject", label: "Subject" },
  { k: "heading", label: "Heading" },
  { k: "intro", label: "Message", rows: 8, hint: "Leave a blank line between paragraphs." },
  { k: "buttonLabel", label: "Button Text" },
  { k: "steps", label: "Steps", rows: 5, hint: "One step per line." },
  { k: "closing", label: "Support Line", rows: 2 },
  { k: "footerNote", label: "Footer Note", rows: 2 },
];

/** Edits a branded email's wording with a live preview, filled with sample details. */
export function EmailTemplateEditor({ templateKey, initial, defaults, edited, settings, sender }: { templateKey: TemplateKey; initial: EmailTemplate; defaults: EmailTemplate; edited: boolean; settings: EmailSettings; sender: string }) {
  const [t, setT] = useState(initial);
  const [saved, save, saving] = useActionState(saveEmailTemplate, undefined);
  const [tested, test, testing] = useActionState(sendTestEmail, undefined);
  const info = TEMPLATE_INFO[templateKey];
  const preview = useMemo(() => {
    const link = info.screen === "SET_PASSWORD" ? SAMPLE_VARS.link : `${settings.appUrl}/login`;
    return renderTemplate(templateKey, t, { ...SAMPLE_VARS, sender, link, partner: templateKey.startsWith("AGENT") ? { name: sender, email: settings.support } : null }, settings);
  }, [t, templateKey, settings, sender, info.screen]);
  const status = tested ?? saved;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_640px]">
      <form action={save} className="card space-y-3 p-5">
        <input type="hidden" name="key" value={templateKey} />
        {FIELDS.map(({ k, label, rows, hint }) => (
          <label key={k} className="block">
            <span className="label">{label}</span>
            {rows ? (
              <textarea name={k} rows={rows} value={t[k]} onChange={(e) => setT({ ...t, [k]: e.target.value })} className="input font-sans text-sm" />
            ) : (
              <input name={k} value={t[k]} onChange={(e) => setT({ ...t, [k]: e.target.value })} className="input" />
            )}
            {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
          </label>
        ))}
        <p className="text-xs text-slate-500">
          Placeholders: {[...info.placeholders, "support"].map((p) => <code key={p} className="mr-1 rounded bg-slate-100 px-1">{`{{${p}}}`}</code>)}
          {templateKey.startsWith("AGENT") && " The agent's DEAC partner is added in a highlighted box when one is assigned."}
        </p>
        {status?.error && <p className="rounded bg-red-50 p-2 text-sm text-red-700">{status.error}</p>}
        {status?.ok && <p className="rounded bg-emerald-50 p-2 text-sm text-emerald-800">{status.message}</p>}
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <button className="btn" disabled={saving}>{saving ? "Saving…" : "Save Template"}</button>
          <button formAction={test} className="btn-ghost" disabled={testing}>{testing ? "Sending…" : "Send Me a Test"}</button>
          <button type="button" className="text-sm text-slate-500 hover:text-slate-700" onClick={() => setT(defaults)}>Restore default wording</button>
          {edited && <button formAction={resetEmailTemplate} formNoValidate className="ml-auto text-sm text-red-600 hover:text-red-700">Reset to default</button>}
        </div>
      </form>
      <div>
        <div className="mb-2 text-sm text-slate-600"><span className="font-semibold text-slate-800">Preview:</span> {preview.subject} <span className="text-slate-400">(sample recipient Alex)</span></div>
        <iframe title="Email preview" srcDoc={preview.html} className="h-[1100px] w-full rounded-lg border border-slate-200 bg-white" />
      </div>
    </div>
  );
}
