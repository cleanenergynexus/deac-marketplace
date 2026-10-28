import type { Developer } from "@prisma/client";
import { Field, Select } from "@/components/ui";
import type { PipelineStage } from "@/lib/pipeline";
import { SaveButton } from "@/components/SaveButton";

export function DeveloperForm({ dev, action, stages }: { dev?: Developer; action: (f: FormData) => Promise<void>; stages?: PipelineStage[] }) {
  return (
    <form action={action} className="space-y-4">
      {dev && <input type="hidden" name="id" value={dev.id} />}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Company"><input name="company" defaultValue={dev?.company} required className="input" /></Field>
        {/* A new company starts with its primary contact. Afterwards people are managed as contact records. */}
        {!dev && <>
          <Field label="Contact name"><input name="contactName" required className="input" /></Field>
          <Field label="Contact title"><input name="contactTitle" className="input" placeholder="e.g. CEO" /></Field>
          <Field label="Email"><input name="email" type="email" required className="input" /></Field>
          <Field label="Phone"><input name="phone" className="input" /></Field>
        </>}
        <Field label="Website"><input name="website" defaultValue={dev?.website ?? ""} className="input" /></Field>
        <Field label="HQ"><input name="hq" defaultValue={dev?.hq ?? ""} className="input" /></Field>
        <Field label="MW delivered"><input name="mwDelivered" defaultValue={dev?.mwDelivered ?? ""} className="input" /></Field>
        <Field label="Source"><input name="source" defaultValue={dev?.source ?? ""} className="input" /></Field>
        <Field label="Relationship owner"><input name="owner" defaultValue={dev?.owner ?? ""} className="input" /></Field>
        {!dev && stages && <Field label="Stage"><Select name="stage" options={stages} /></Field>}
      </div>
      <Field label="Experience / track record (shown to investors)"><textarea name="experience" rows={4} defaultValue={dev?.experience ?? ""} className="input" /></Field>
      <Field label="Internal notes"><textarea name="notes" rows={2} defaultValue={dev?.notes ?? ""} className="input" /></Field>
      {dev ? <SaveButton label="Save changes" /> : <button className="btn">Create company</button>}
    </form>
  );
}
