"use client";
import { setProjectContact } from "@/app/actions/contacts";

/** Picks which contact at the company is the point of contact for a project. Saves on change. */
export function ProjectContactSelect({ projectId, contactId, contacts, className = "" }: { projectId: string; contactId: string | null; contacts: { id: string; name: string }[]; className?: string }) {
  return (
    <form action={setProjectContact}>
      <input type="hidden" name="projectId" value={projectId} />
      <select name="contactId" defaultValue={contactId ?? ""} key={contactId} aria-label="Project contact" onChange={(e) => e.currentTarget.form?.requestSubmit()} className={`input py-1 text-sm ${className}`}>
        {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </form>
  );
}
