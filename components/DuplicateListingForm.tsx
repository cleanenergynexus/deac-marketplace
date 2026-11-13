"use client";
import { useState } from "react";
import { DEAL_TYPES } from "@/lib/constants";
import { duplicateTitle } from "@/lib/listing-links";
import { MoneyInput } from "@/components/MoneyInput";

/** "Duplicate Listing" form: the same project as a linked listing under another deal type. */
export function DuplicateListingForm({ id, title, dealType, fundingNeeded, used, action }: {
  id: string; title: string; dealType: string; fundingNeeded: number; used: string[]; action: (f: FormData) => Promise<void>;
}) {
  const first = DEAL_TYPES.find((t) => !used.includes(t.value))?.value ?? DEAL_TYPES[0].value;
  const [type, setType] = useState<string>(first);
  const [name, setName] = useState(duplicateTitle(title, dealType, first));
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <form action={action} onSubmit={() => setBusy(true)} className="grid items-end gap-3 sm:grid-cols-6">
      <input type="hidden" name="id" value={id} />
      <label className="block sm:col-span-2">
        <span className="label">New listing&apos;s deal type</span>
        <select name="dealType" value={type} className="input" onChange={(e) => { setType(e.target.value); if (!touched) setName(duplicateTitle(title, dealType, e.target.value)); }}>
          {DEAL_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}{used.includes(t.value) ? " (already listed)" : ""}</option>)}
        </select>
      </label>
      <label className="block sm:col-span-2">
        <span className="label">Title</span>
        <input name="title" value={name} required className="input" onChange={(e) => { setName(e.target.value); setTouched(true); }} />
      </label>
      <label className="block">
        <span className="label">{type === "SALE" ? "Asking price ($)" : type === "LEASE" ? "Funding needed ($)" : "Raise ($)"}</span>
        <MoneyInput name="fundingNeeded" defaultValue={String(fundingNeeded)} />
      </label>
      <div><button className="btn w-full" disabled={busy}>{busy ? "Duplicating…" : "Duplicate"}</button></div>
    </form>
  );
}
