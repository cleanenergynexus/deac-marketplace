import type { Developer, Project } from "@prisma/client";
import { Field, Select } from "@/components/ui";
import { DEAL_TYPES, FACILITY_TYPES, PROJECT_STATUSES, US_STATES } from "@/lib/constants";
import { OPTIONS } from "@/lib/valuation";
import { SaveButton } from "@/components/SaveButton";

export function ProjectForm({ p, developers, developerId, action }: { p?: Project; developers: Pick<Developer, "id" | "company">[]; developerId?: string; action: (f: FormData) => Promise<void> }) {
  const v = (x: unknown) => (x == null ? "" : String(x));
  return (
    <form action={action} className="space-y-6">
      {p && <input type="hidden" name="id" value={p.id} />}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Title" className="sm:col-span-2"><input name="title" defaultValue={p?.title} required className="input" /></Field>
        <Field label="Visibility">
          <select name="visibility" defaultValue={p?.visibility ?? "DRAFT"} className="input">
            <option value="DRAFT">Draft (team only)</option>
            <option value="PRIVATE">Private (approved investors)</option>
            <option value="TEASER">Private + public teaser on deacna.com</option>
          </select>
        </Field>
        <Field label="Developer"><Select name="developerId" options={developers.map((d) => ({ value: d.id, label: d.company }))} defaultValue={p?.developerId ?? developerId} required /></Field>
        <Field label="State"><Select name="state" options={US_STATES} defaultValue={p?.state} required /></Field>
        <Field label="City / county"><input name="city" defaultValue={v(p?.city)} className="input" /></Field>
        <Field label="Capacity (MW)"><input name="mw" defaultValue={v(p?.mw)} required className="input" /></Field>
        <Field label="Facility type"><Select name="facilityType" options={FACILITY_TYPES} defaultValue={p?.facilityType} /></Field>
        <Field label="Deal type"><Select name="dealType" options={DEAL_TYPES} defaultValue={p?.dealType} /></Field>
        <Field label="Funding needed ($)"><input name="fundingNeeded" defaultValue={v(p?.fundingNeeded)} required className="input" /></Field>
        <Field label="Project status"><Select name="projectStatus" options={PROJECT_STATUSES} defaultValue={p?.projectStatus} /></Field>
        <Field label="Cover image URL"><input name="coverImageUrl" defaultValue={v(p?.coverImageUrl)} className="input" /></Field>
        <Field label="Summary" className="sm:col-span-3"><textarea name="summary" rows={4} defaultValue={p?.summary} className="input" /></Field>
        <Field label="Highlights (one per line)" className="sm:col-span-3"><textarea name="highlights" rows={3} defaultValue={p?.highlights} className="input" /></Field>
      </div>
      <h3 className="font-semibold">Economics</h3>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Total capex ($)"><input name="totalCapex" defaultValue={v(p?.totalCapex)} className="input" /></Field>
        <Field label="Target IRR (%)"><input name="targetIrr" defaultValue={v(p?.targetIrr)} className="input" /></Field>
        <Field label="Equity multiple (x)"><input name="equityMultiple" defaultValue={v(p?.equityMultiple)} className="input" /></Field>
        <Field label="Lease rate ($/kW/mo)"><input name="leaseRateKwMo" defaultValue={v(p?.leaseRateKwMo)} className="input" /></Field>
        <Field label="Power rate (¢/kWh)"><input name="powerRateCents" defaultValue={v(p?.powerRateCents)} className="input" /></Field>
        <Field label="Power status"><Select name="powerStatus" options={OPTIONS.powerStatus} defaultValue={p?.powerStatus} placeholder="—" /></Field>
        <Field label="Months to power"><input name="monthsToPower" defaultValue={v(p?.monthsToPower)} className="input" /></Field>
        <Field label="Target COD"><input name="codDate" defaultValue={v(p?.codDate)} className="input" placeholder="Q3 2027" /></Field>
        <Field label="Capital stack"><input name="capitalStack" defaultValue={v(p?.capitalStack)} className="input" /></Field>
        <Field label="Economics notes" className="sm:col-span-3"><textarea name="economicsNotes" rows={2} defaultValue={v(p?.economicsNotes)} className="input" /></Field>
      </div>
      {p ? <SaveButton label="Save listing" savedText="Listing saved" /> : <button className="btn">Create listing</button>}
    </form>
  );
}
