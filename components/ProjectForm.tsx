import type { ReactNode } from "react";
import type { Developer, Project } from "@prisma/client";
import type { ListingDraft } from "@/lib/importer";
import { Field, Select } from "@/components/ui";
import { DEAL_STAGES, DEAL_TYPES, FACILITY_TYPES, PROJECT_STATUSES, US_STATES } from "@/lib/constants";
import { OPTIONS } from "@/lib/valuation";
import { SaveButton } from "@/components/SaveButton";
import { MoneyInput } from "@/components/MoneyInput";
import { DeleteListingButton, DocumentsEditor } from "@/components/DocumentsEditor";
import type { DocRow } from "@/lib/documents";
import Link from "next/link";

type Props = {
  p?: Project;
  developers: Pick<Developer, "id" | "company">[];
  developerId?: string;
  action: (f: FormData) => Promise<void>;
  /** Prefilled values for a new listing (import wizard). */
  draft?: ListingDraft;
  /** Replaces the developer dropdown (import wizard). */
  developerField?: ReactNode;
  /** Extra hidden inputs or sections rendered before the submit button. */
  children?: ReactNode;
  submitLabel?: string;
  /** Editable document list (saved with the listing). */
  documents?: DocRow[];
  /** Shows a Delete Listing button that submits to this action. */
  deleteAction?: (f: FormData) => Promise<void>;
};

export function ProjectForm({ p, developers, developerId, action, draft, developerField, children, submitLabel = "Create listing", documents, deleteAction }: Props) {
  const v = (x: unknown) => (x == null ? "" : String(x));
  const d = (draft ?? {}) as Partial<ListingDraft>;
  // On an imported draft, a value the document didn't give stays empty until the admin picks one.
  const pickFirst = draft ? { placeholder: "Choose…", required: true } : {};
  return (
    <form action={action} className="space-y-6">
      {p && <input type="hidden" name="id" value={p.id} />}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Title" className="sm:col-span-2"><input name="title" defaultValue={p ? p.title : d.title} required className="input" /></Field>
        <Field label="Visibility">
          <select name="visibility" defaultValue={p?.visibility ?? "DRAFT"} className="input">
            <option value="DRAFT">Draft (team only)</option>
            <option value="PRIVATE">Private (approved investors)</option>
            <option value="TEASER">Private + public teaser on deacna.com</option>
          </select>
        </Field>
        {developerField ?? <Field label="Developer"><Select name="developerId" options={developers.map((x) => ({ value: x.id, label: x.company }))} defaultValue={p?.developerId ?? developerId} required /></Field>}
        <Field label="State"><Select name="state" options={US_STATES} defaultValue={p ? p.state : d.state} required {...pickFirst} /></Field>
        <Field label="City / county"><input name="city" defaultValue={p ? v(p.city) : d.city} className="input" /></Field>
        <Field label="Capacity (MW)"><input name="mw" defaultValue={p ? v(p.mw) : d.mw} required className="input" /></Field>
        <Field label="Facility type"><Select name="facilityType" options={FACILITY_TYPES} defaultValue={p ? p.facilityType : d.facilityType} {...pickFirst} /></Field>
        <Field label="Deal type"><Select name="dealType" options={DEAL_TYPES} defaultValue={p ? p.dealType : d.dealType} {...pickFirst} /></Field>
        <Field label="Funding needed ($)"><MoneyInput name="fundingNeeded" defaultValue={p ? v(p.fundingNeeded) : d.fundingNeeded} required /></Field>
        <Field label="Project status"><Select name="projectStatus" options={PROJECT_STATUSES} defaultValue={p ? p.projectStatus : d.projectStatus} {...pickFirst} /></Field>
        <Field label="Term"><input name="term" defaultValue={v(p?.term)} className="input" placeholder="e.g. 24 mo" /></Field>
        <Field label="Deal stage (shown to investors)"><Select name="dealStage" options={DEAL_STAGES.map((x) => ({ value: x.value, label: `${x.label} (${x.status})` }))} defaultValue={p?.dealStage ?? "MARKETING"} /></Field>
        <Field label="Cover image URL"><input name="coverImageUrl" defaultValue={v(p?.coverImageUrl)} className="input" /></Field>
        <Field label="Summary" className="sm:col-span-3"><textarea name="summary" rows={4} defaultValue={p ? p.summary : d.summary} className="input" /></Field>
        <Field label="Highlights (one per line)" className="sm:col-span-3"><textarea name="highlights" rows={3} defaultValue={p ? p.highlights : d.highlights} className="input" /></Field>
        <Field label="Use of funds (one per line, e.g. Equipment & EPC: $3.1M)" className="sm:col-span-3"><textarea name="useOfFunds" rows={3} defaultValue={v(p?.useOfFunds)} className="input" placeholder={"Equipment & EPC: $3.1M\nInterconnection: $0.4M\nSoft costs / contingency: $0.7M"} /></Field>
      </div>
      <h3 className="font-semibold">Economics</h3>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Total capex ($)"><MoneyInput name="totalCapex" defaultValue={p ? v(p.totalCapex) : d.totalCapex} /></Field>
        <Field label="Target IRR (%)"><input name="targetIrr" defaultValue={p ? v(p.targetIrr) : d.targetIrr} className="input" /></Field>
        <Field label="Equity multiple (x)"><input name="equityMultiple" defaultValue={p ? v(p.equityMultiple) : d.equityMultiple} className="input" /></Field>
        <Field label="Lease rate ($/kW/mo)"><input name="leaseRateKwMo" defaultValue={p ? v(p.leaseRateKwMo) : d.leaseRateKwMo} className="input" /></Field>
        <Field label="Power rate (¢/kWh)"><input name="powerRateCents" defaultValue={p ? v(p.powerRateCents) : d.powerRateCents} className="input" /></Field>
        <Field label="Power status"><Select name="powerStatus" options={OPTIONS.powerStatus} defaultValue={p ? p.powerStatus : d.powerStatus} placeholder="—" /></Field>
        <Field label="Months to power"><input name="monthsToPower" defaultValue={p ? v(p.monthsToPower) : d.monthsToPower} className="input" /></Field>
        <Field label="Target COD"><input name="codDate" defaultValue={p ? v(p.codDate) : d.codDate} className="input" placeholder="Q3 2027" /></Field>
        <Field label="Capital stack"><input name="capitalStack" defaultValue={p ? v(p.capitalStack) : d.capitalStack} className="input" /></Field>
        <Field label="Economics notes" className="sm:col-span-3"><textarea name="economicsNotes" rows={2} defaultValue={p ? v(p.economicsNotes) : d.economicsNotes} className="input" /></Field>
      </div>
      {documents && (
        <>
          <h3 className="font-semibold">Documents</h3>
          {/* Remount from the saved rows after each save, so new rows pick up their ids. */}
          <DocumentsEditor key={documents.map((d) => `${d.id}:${d.name}:${d.url}:${d.access}`).join("|")} initial={documents} />
        </>
      )}
      {children}
      {p ? (
        <div className="flex flex-wrap items-center gap-3">
          <SaveButton label="Save Listing" savedText="Listing saved" />
          <Link href={`/marketplace/${p.id}`} className="btn-ghost">Preview on Marketplace</Link>
          {deleteAction && <DeleteListingButton action={deleteAction} title={p.title} />}
        </div>
      ) : <button className="btn">{submitLabel}</button>}
    </form>
  );
}
