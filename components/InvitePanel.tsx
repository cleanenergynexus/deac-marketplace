"use client";
import { useActionState, useState } from "react";
import { inviteInvestor, type InviteState } from "@/app/actions/invites";

/** "Invite to marketplace" on an investor contact record: creates an approved login and shows a copyable one-time link. */
export function InvitePanel({ investorId, label }: { investorId: string; label: string }) {
  const [state, action, pending] = useActionState<InviteState, FormData>(inviteInvestor, undefined);
  const [copied, setCopied] = useState(false);
  if (state?.link) {
    return (
      <div className="space-y-2 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-900">
        <p className="font-medium">{state.name} is approved. {state.emailed ? "We emailed them this link." : "Send them this link to set a password:"}</p>
        <input readOnly value={state.link} aria-label="Invite link" className="input w-full bg-white py-1 font-mono text-[11px]" onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className="btn w-full py-1" onClick={async () => { await navigator.clipboard.writeText(state.link!); setCopied(true); }}>{copied ? "Copied ✓" : "Copy invite link"}</button>
        <p className="text-emerald-800">The link works once and expires in 14 days. It isn&apos;t shown again; create a new one if it gets lost.</p>
      </div>
    );
  }
  return (
    <form action={action}>
      <input type="hidden" name="investorId" value={investorId} />
      <button className="btn w-full py-1.5" disabled={pending}>{pending ? "Creating invite…" : label}</button>
      {state?.error && <p className="mt-2 rounded bg-red-50 p-2 text-xs text-red-700">{state.error}</p>}
    </form>
  );
}
