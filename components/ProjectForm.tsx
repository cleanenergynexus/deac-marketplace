import type { ReactNode } from "react";
import type { Developer, Project } from "@prisma/client";
import type { ListingDraft } from "@/lib/importer";
import { Field, Select } from "@/components/ui";
import { DEAL_STAGES, DEAL_TYPES, FACILITY_TYPES, PROJECT_STATUSES } from "@/lib/constants";
import { ListingLocationFields } from "@/components/ListingLocationFields";
import { OPTIONS } from "@/lib/valuation";
import { SaveButton } from "@/components/SaveButton";
import { MoneyInput } from "@/components/MoneyInput";
import { DeleteListingButton, DocumentsEditor, type DataRoomIndex } from "@/components/DocumentsEditor";
import type { DocRow } from "@/lib/documents";
import Link from "next/link";
import { SYNCED_LABELS } from "@/lib/listing-links";

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
  /** The project's data room, so documents can be picked from it. */
  dataRoom?: DataRoomIndex;
  /** Shows a Delete Listing button that submits to this action. */
  deleteAction?: (f: FormData) => Promise<void>;
  /** Referral agents: hide what only the DEAC team decides (visibility, deal stage, cover image). */
  hideTeamFields?: boolean;
  /** Number of linked listings (same project, other deal types). Marks the synced fields with 🔗. */
  linkedCount?: number;
};

export function ProjectForm({ p, developers, developerId, action, draft, developerField, children, submitLabel = "Create listing", documents, dataRoom, deleteAction, hideTeamFields = false, linkedCount = 0 }: Props) {
  const v = (x: unknown) => (x == null ? "" : String(x));
  const d = (draft ?? {}) as Partial<ListingDraft>;
  // On an imported draft, a value the document didn't give stays empty until the admin picks one.
  const pickFirst = draft ? { placeholder: "Choose…", required: true } : {};
  // Linked listings: label the project facts that saving copies to the other listings.
  const L = (label: string) => (linkedCount && SYNCED_LABELS.has(label) ? `${label} 🔗` : label);
  return (
    <form action={action} className="space-y-6">
      {p && <input type="hidden" name="id" value={p.id} />}
      {linkedCount > 0 && (
        <p className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-2 text-sm text-slate-700">🔗 This project has {linkedCount} linked listing{linkedCount > 1 ? "s" : ""} (<a href="#linked" className="text-brand-600">see below</a>). Fields marked 🔗, plus the location, update {linkedCount > 1 ? "all of them" : "it"} when you save.</p>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Title" className="sm:col-span-2"><input name="title" defaultValue={p ? p.title : d.title} required className="input" /></Field>
        {!hideTeamFields && <Field label="Visibility">
          <select name="visibility" defaultValue={p?.visibility ?? "DRAFT"} className="input">
            <option value="DRAFT">Draft (team only)</option>
            <option value="PRIVATE">Private (approved investors)</option>
            <option value="TEASER">Private + public teaser on deacna.com</option>
          </select>
        </Field>}
        {developerField ?? <Field label={L("Developer")}><Select name="developerId" options={developers.map((x) => ({ value: x.id, label: x.company }))} defaultValue={p?.developerId ?? developerId} required /></Field>}
        <ListingLocationFields value={p ?? { country: d.country || null, state: d.state, county: d.county, city: d.city }} pickCountry={!!draft && !d.country} />
        <Field label={L("Capacity (MW)")}><input name="mw" defaultValue={p ? v(p.mw) : d.mw} required className="input" /></Field>
        <Field label={L("Facility type")}><Select name="facilityType" options={FACILITY_TYPES} defaultValue={p ? p.facilityType : d.facilityType} {...pickFirst} /></Field>
        <Field label="Deal type"><Select name="dealType" options={DEAL_TYPES} defaultValue={p ? p.dealType : d.dealType} {...pickFirst} /></Field>
        <Field label="Funding needed ($)"><MoneyInput name="fundingNeeded" defaultValue={p ? v(p.fundingNeeded) : d.fundingNeeded} required /></Field>
        <Field label={L("Project status")}><Select name="projectStatus" options={PROJECT_STATUSES} defaultValue={p ? p.projectStatus : d.projectStatus} {...pickFirst} /></Field>
        <Field label="Term"><input name="term" defaultValue={v(p?.term)} className="input" placeholder="e.g. 24 mo" /></Field>
        {!hideTeamFields && <>
          <Field label="Deal stage (shown to investors)"><Select name="dealStage" options={DEAL_STAGES.map((x) => ({ value: x.value, label: `${x.label} (${x.status})` }))} defaultValue={p?.dealStage ?? "MARKETING"} /></Field>
          <Field label={L("Cover image URL")}><input name="coverImageUrl" defaultValue={v(p?.coverImageUrl)} className="input" /></Field>
        </>}
        <Field label={L("Summary")} className="sm:col-span-3"><textarea name="summary" rows={4} defaultValue={p ? p.summary : d.summary} className="input" /></Field>
        <Field label={L("Highlights (one per line)")} className="sm:col-span-3"><textarea name="highlights" rows={3} defaultValue={p ? p.highlights : d.highlights} className="input" /></Field>
        <Field label="Use of funds (one per line, e.g. Equipment & EPC: $3.1M)" className="sm:col-span-3"><textarea name="useOfFunds" rows={3} defaultValue={v(p?.useOfFunds)} className="input" placeholder={"Equipment & EPC: $3.1M\nInterconnection: $0.4M\nSoft costs / contingency: $0.7M"} /></Field>
      </div>
      <h3 className="font-semibold">Economics</h3>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={L("Total capex ($)")}><MoneyInput name="totalCapex" defaultValue={p ? v(p.totalCapex) : d.totalCapex} /></Field>
        <Field label="Target IRR (%)"><input name="targetIrr" defaultValue={p ? v(p.targetIrr) : d.targetIrr} className="input" /></Field>
        <Field label="Equity multiple (x)"><input name="equityMultiple" defaultValue={p ? v(p.equityMultiple) : d.equityMultiple} className="input" /></Field>
        <Field label="Lease rate ($/kW/mo)"><input name="leaseRateKwMo" defaultValue={p ? v(p.leaseRateKwMo) : d.leaseRateKwMo} className="input" /></Field>
        <Field label={L("Power rate (¢/kWh)")}><input name="powerRateCents" defaultValue={p ? v(p.powerRateCents) : d.powerRateCents} className="input" /></Field>
        <Field label={L("Power status")}><Select name="powerStatus" options={OPTIONS.powerStatus} defaultValue={p ? p.powerStatus : d.powerStatus} placeholder="—" /></Field>
        <Field label={L("Months to power")}><input name="monthsToPower" defaultValue={p ? v(p.monthsToPower) : d.monthsToPower} className="input" /></Field>
        <Field label={L("Target COD")}><input name="codDate" defaultValue={p ? v(p.codDate) : d.codDate} className="input" placeholder="Q3 2027" /></Field>
        <Field label="Capital stack"><input name="capitalStack" defaultValue={p ? v(p.capitalStack) : d.capitalStack} className="input" /></Field>
        <Field label="Economics notes" className="sm:col-span-3"><textarea name="economicsNotes" rows={2} defaultValue={p ? v(p.economicsNotes) : d.economicsNotes} className="input" /></Field>
      </div>
      {documents && (
        <>
          <h3 id="documents" className="scroll-mt-4 font-semibold">Documents</h3>
          {/* Remount from the saved rows after each save, so new rows pick up their ids. */}
          <DocumentsEditor key={documents.map((d) => `${d.id}:${d.name}:${d.url}:${d.access}`).join("|")} initial={documents} dataRoom={dataRoom} />
        </>
      )}
      {children}
      {p ? (
        <div className="flex flex-wrap items-center gap-3">
          <SaveButton label="Save Listing" savedText="Listing saved" />
          <Link href={`/marketplace/${p.id}`} className="btn-ghost">Preview on Marketplace</Link>
          {deleteAction && <DeleteListingButton action={deleteAction} title={p.title} linked={linkedCount > 0} />}
        </div>
      ) : <button className="btn">{submitLabel}</button>}
    </form>
  );
}
