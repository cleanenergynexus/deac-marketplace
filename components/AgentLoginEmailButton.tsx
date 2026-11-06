"use client";
import { useActionState, useState } from "react";
import { sendAgentLoginEmail, type LoginEmailState } from "@/app/actions/agents-admin";

/** "Send Login Email" on a referral agent: emails the branded login email with a new one-time link to set a password. */
export function AgentLoginEmailButton({ id, name }: { id: string; name: string }) {
  const [state, action, pending] = useActionState<LoginEmailState, FormData>(sendAgentLoginEmail, undefined);
  const [copied, setCopied] = useState(false);
  if (state?.link && !state.error) {
    return (
      <div className="mt-3 space-y-2 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-900">
        <p className="font-medium">{state.emailed ? `Login email sent to ${name}${state.from ? ` from your Gmail (${state.from})` : ""}.` : `No email provider is connected, so nothing was sent. Send ${name} this link yourself:`}</p>
        <input readOnly value={state.link} aria-label="Set-password link" className="input w-full bg-white py-1 font-mono text-[11px]" onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className="btn-ghost w-full py-1" onClick={async () => { await navigator.clipboard.writeText(state.link!); setCopied(true); }}>{copied ? "Copied ✓" : "Copy link"}</button>
        <p className="text-emerald-800">The link works once and expires in 14 days. Their current password keeps working until they use it.</p>
      </div>
    );
  }
  return (
    <form action={action} className="mt-3">
      <input type="hidden" name="id" value={id} />
      <button className="btn-ghost py-1.5" disabled={pending}>{pending ? "Sending…" : "Send Login Email"}</button>
      {state?.error && <p className="mt-2 break-all rounded bg-red-50 p-2 text-xs text-red-700">{state.error}</p>}
    </form>
  );
}
