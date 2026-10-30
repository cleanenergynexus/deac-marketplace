"use client";
import { useActionState } from "react";
import { updateAgent } from "@/app/actions/agents-admin";
import { AGENT_STATUSES } from "@/lib/agents";
import { PhoneInput } from "@/components/PhoneInput";

type Props = { id: string; partnerId: string | null; status: string; company: string | null; phone: string | null; partners: { id: string; name: string }[] };

/** Inline editor on the Referral agents page: DEAC partner, status, company, phone, new password. */
export function AgentEditForm({ id, partnerId, status, company, phone, partners }: Props) {
  const [state, action, pending] = useActionState(updateAgent, undefined);
  return (
    <form action={action} className="grid gap-2 sm:grid-cols-2">
      <input type="hidden" name="id" value={id} />
      <label className="block text-xs text-slate-500">DEAC partner
        <select name="partnerId" defaultValue={partnerId ?? ""} className="input mt-1 py-1.5">
          <option value="">No partner yet</option>
          {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <label className="block text-xs text-slate-500">Status
        <select name="status" defaultValue={status} className="input mt-1 py-1.5">{AGENT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
      </label>
      <label className="block text-xs text-slate-500">Company<input name="company" defaultValue={company ?? ""} className="input mt-1 py-1.5" /></label>
      <div className="text-xs text-slate-500">Phone<div className="mt-1"><PhoneInput name="phone" defaultValue={phone} /></div></div>
      <label className="block text-xs text-slate-500 sm:col-span-2">New temporary password (leave blank to keep)<input name="password" type="text" minLength={10} autoComplete="off" className="input mt-1 py-1.5" /></label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button className="btn-ghost py-1.5" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
        {state?.error && <span className="text-xs text-red-600">{state.error}</span>}
        {state?.ok && !pending && <span className="text-xs text-emerald-700">Saved</span>}
      </div>
    </form>
  );
}
