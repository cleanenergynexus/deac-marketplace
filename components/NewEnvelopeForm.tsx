"use client";
import { useActionState, useState } from "react";
import { createEnvelope, uploadSigned, type CreateState } from "@/app/actions/esign";
import { DOC_KINDS } from "@/lib/esign";
import { SignerPicker, type SignerOption } from "@/components/SignerPicker";

type Listing = { id: string; label: string };
type DrPdf = { id: string; name: string; projectId: string; folder: string };
type Template = { id: string; title: string; kind: string; project: string | null };

/** Step 1 of sending a document (or making a template): where the PDF comes from. */
export function NewEnvelopeForm({ asTemplate, listings, pdfs, templates, signers, initial }: {
  asTemplate: boolean; listings: Listing[]; pdfs: DrPdf[]; templates: Template[]; signers: SignerOption[];
  initial: { projectId?: string; signer?: string; kind?: string; templateId?: string };
}) {
  const [state, action, pending] = useActionState<CreateState, FormData>(createEnvelope, undefined);
  const [source, setSource] = useState<"upload" | "dataroom" | "template">(initial.templateId ? "template" : !asTemplate && templates.length ? "template" : "upload");
  const [projectId, setProjectId] = useState(initial.projectId ?? "");
  const [kind, setKind] = useState(initial.kind ?? "NDA");
  const roomPdfs = pdfs.filter((p) => p.projectId === projectId);
  const tab = (k: typeof source, label: string) => (
    <button type="button" onClick={() => setSource(k)} className={`rounded-md px-3 py-1.5 text-sm font-medium ${source === k ? "bg-brand-600 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200"}`}>{label}</button>
  );
  return (
    <form action={action} className="card max-w-2xl space-y-4 p-5">
      {asTemplate && <input type="hidden" name="asTemplate" value="on" />}
      <div>
        <span className="label">PDF</span>
        <div className="flex flex-wrap gap-2">
          {!asTemplate && templates.length > 0 && tab("template", "From a template")}
          {tab("upload", "Upload a PDF")}
          {tab("dataroom", "From a listing's data room")}
        </div>
      </div>
      {source === "template" && (
        <label className="block"><span className="label">Template</span>
          <select name="templateId" className="input" required defaultValue={initial.templateId ?? ""}>
            <option value="" disabled>Choose a template</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.title} ({t.kind}{t.project ? ` · ${t.project}` : ""})</option>)}
          </select>
          <span className="mt-1 block text-xs text-slate-500">The fields come with it; you can still adjust them before sending.</span>
        </label>
      )}
      {source === "upload" && (
        <label className="block"><span className="label">PDF file (up to 4.4 MB)</span><input type="file" name="file" accept="application/pdf,.pdf" required className="input" /></label>
      )}
      {source !== "template" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="label">Title</span><input name="title" className="input" placeholder="Defaults to the file name" /></label>
          <label className="block"><span className="label">Type</span><select name="kind" className="input" value={kind} onChange={(e) => setKind(e.target.value)}>{DOC_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</select></label>
        </div>
      )}
      {source !== "template" && (
        <label className="block"><span className="label">Listing {source === "dataroom" ? "" : "(optional)"}</span>
          <select name="projectId" className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)} required={source === "dataroom"}>
            <option value="">{asTemplate ? "Any listing" : "None"}</option>
            {listings.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
          {(kind === "NDA" || kind === "LOI") && <span className="mt-1 block text-xs text-slate-500">An NDA or LOI signed by an investor for a listing moves them through that listing&apos;s NDA / LOI step. An NDA with no listing is a master NDA.</span>}
        </label>
      )}
      {source === "dataroom" && (
        <label className="block"><span className="label">PDF in the data room</span>
          <select name="fileId" className="input" required disabled={!projectId}>
            <option value="">{projectId ? (roomPdfs.length ? "Choose a PDF" : "No PDFs in this data room") : "Choose a listing first"}</option>
            {roomPdfs.map((p) => <option key={p.id} value={p.id}>{p.folder ? `${p.folder} / ` : ""}{p.name}</option>)}
          </select>
        </label>
      )}
      {!asTemplate && (
        <div>
          <span className="label">Signer (optional now, you choose before sending)</span>
          <SignerPicker options={signers} initial={initial.signer ? [initial.signer] : []} multiple={false} />
        </div>
      )}
      {state?.error && <p className="rounded bg-red-50 p-2 text-sm text-red-700">{state.error}</p>}
      <button className="btn" disabled={pending}>{pending ? "Preparing…" : "Next: place fields"}</button>
    </form>
  );
}

/** File a document that was already signed (on paper or another e-sign tool) on a contact's record. */
export function UploadSignedForm({ listings, signers, initial }: { listings: Listing[]; signers: SignerOption[]; initial: { projectId?: string; signer?: string; kind?: string } }) {
  const [state, action, pending] = useActionState<CreateState, FormData>(uploadSigned, undefined);
  const [kind, setKind] = useState(initial.kind ?? "NDA");
  const [projectId, setProjectId] = useState(initial.projectId ?? "");
  const today = new Date().toISOString().slice(0, 10);
  return (
    <form action={action} className="card max-w-2xl space-y-4 p-5">
      <div><span className="label">Whose document</span><SignerPicker options={signers} initial={initial.signer ? [initial.signer] : []} multiple={false} /></div>
      <label className="block"><span className="label">Signed file (PDF, Word or image, up to 4.4 MB)</span><input type="file" name="file" required className="input" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" /></label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block sm:col-span-2"><span className="label">Title</span><input name="title" className="input" placeholder="Defaults to the file name" /></label>
        <label className="block"><span className="label">Signed on</span><input type="date" name="signedAt" defaultValue={today} max={today} className="input" /></label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block"><span className="label">Type</span><select name="kind" className="input" value={kind} onChange={(e) => setKind(e.target.value)}>{DOC_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</select></label>
        <label className="block"><span className="label">Listing (optional)</span>
          <select name="projectId" className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}><option value="">None</option>{listings.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</select>
        </label>
      </div>
      {(kind === "NDA" || kind === "LOI") && (
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" name="autoApprove" defaultChecked className="mt-1" />
          <span>If this is an investor, {kind === "NDA" ? (projectId ? "confirm their NDA on this listing (opens the NDA tier)" : "record it as their master NDA (counts for every listing)") : "accept their letter of interest on this listing"}.</span>
        </label>
      )}
      <label className="block"><span className="label">Notes</span><textarea name="notes" className="input min-h-16" placeholder="Optional, e.g. signed in person at the site visit" /></label>
      {state?.error && <p className="rounded bg-red-50 p-2 text-sm text-red-700">{state.error}</p>}
      <button className="btn" disabled={pending}>{pending ? "Filing…" : "File signed document"}</button>
    </form>
  );
}
