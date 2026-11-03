"use client";
import { useActionState, useEffect, useMemo, useState } from "react";
import { renewLink, sendEnvelope, type SendState } from "@/app/actions/esign";

export type SignerOption = { ref: string; name: string; email: string | null; company: string | null; kind: string };

/** Search investors, developer contacts and referral agents; picks one or several. Posts `signer` values. */
export function SignerPicker({ options, initial = [], multiple = true }: { options: SignerOption[]; initial?: string[]; multiple?: boolean }) {
  const [picked, setPicked] = useState<string[]>(initial.filter((r) => options.some((o) => o.ref === r)));
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const byRef = useMemo(() => new Map(options.map((o) => [o.ref, o])), [options]);
  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    return options.filter((o) => (!kind || o.kind === kind) && !picked.includes(o.ref) && (!t || `${o.name} ${o.email ?? ""} ${o.company ?? ""}`.toLowerCase().includes(t))).slice(0, 40);
  }, [options, q, kind, picked]);
  const add = (ref: string) => { setPicked((p) => (multiple ? [...p, ref] : [ref])); setQ(""); };
  const kinds = [...new Set(options.map((o) => o.kind))];
  return (
    <div className="space-y-2">
      {picked.map((r) => <input key={r} type="hidden" name="signer" value={r} />)}
      {picked.length > 0 && (
        <ul className="space-y-1">
          {picked.map((r) => {
            const o = byRef.get(r);
            return (
              <li key={r} className="flex items-center justify-between gap-2 rounded-md bg-brand-50 px-2 py-1.5 text-sm">
                <span className="min-w-0"><span className="font-medium">{o?.name}</span> <span className="text-xs text-slate-500">{o?.kind} · {o?.email ?? "no email"}{o?.company ? ` · ${o.company}` : ""}</span></span>
                <button type="button" className="text-xs text-slate-500 hover:text-red-600" aria-label={`Remove ${o?.name}`} onClick={() => setPicked((p) => p.filter((x) => x !== r))}>✕</button>
              </li>
            );
          })}
        </ul>
      )}
      {(multiple || !picked.length) && (
        <>
          <div className="flex gap-2">
            <input className="input flex-1" placeholder="Search name, email or company" value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="input !w-auto shrink-0" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Signer type"><option value="">All</option>{kinds.map((k) => <option key={k}>{k}</option>)}</select>
          </div>
          <ul className="max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-200">
            {matches.map((o) => (
              <li key={o.ref}><button type="button" onClick={() => add(o.ref)} className="w-full px-2 py-1.5 text-left text-sm hover:bg-slate-50">
                <span className="font-medium">{o.name}</span> <span className="text-xs text-slate-500">{o.kind}{o.company ? ` · ${o.company}` : ""} · {o.email ?? <span className="text-red-600">no email</span>}</span>
              </button></li>
            ))}
            {!matches.length && <li className="px-2 py-2 text-xs text-slate-500">No matches.</li>}
          </ul>
        </>
      )}
    </div>
  );
}

function Links({ sent }: { sent: NonNullable<NonNullable<SendState>["sent"]> }) {
  const [copied, setCopied] = useState<string | null>(null);
  return (
    <div className="space-y-3 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-900">
      {sent.map((x) => (
        <div key={`${x.id}-${x.slot}`} className="space-y-1">
          <p className="font-medium">{x.name}: {x.emailed ? `emailed to ${x.email}.` : "share this signing link:"}</p>
          <div className="flex gap-2">
            <input readOnly value={x.link} aria-label={`Signing link for ${x.name}`} className="input flex-1 bg-white py-1 font-mono text-[11px]" onFocus={(e) => e.currentTarget.select()} />
            <button type="button" className="btn px-2 py-1" onClick={async () => { await navigator.clipboard.writeText(x.link); setCopied(x.link); }}>{copied === x.link ? "Copied ✓" : "Copy"}</button>
          </div>
          <a href={`/admin/signatures/${x.id}`} className="font-semibold text-brand-700">Open request →</a>
        </div>
      ))}
      <p className="text-emerald-800">Each link is personal and works for 30 days. Signers who sign later get their link by email when it&apos;s their turn. It isn&apos;t shown again; create a new one from the request if it gets lost. Investors can also sign from My Portal.</p>
    </div>
  );
}

const linksKey = (id: string) => `esign-links-${id}`;

/**
 * Links just sent from a draft. Sending turns the page read-only (the send form goes away), so the form hands the
 * links over through this tab's session storage and they show here once.
 */
export function JustSentLinks({ id }: { id: string }) {
  const [sent, setSent] = useState<NonNullable<SendState>["sent"] | null>(null);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(linksKey(id));
      if (raw) { setSent(JSON.parse(raw)); sessionStorage.removeItem(linksKey(id)); }
    } catch {}
  }, [id]);
  if (!sent?.length) return null;
  return <div className="card p-4"><h2 className="mb-2 font-semibold">Sent</h2><Links sent={sent} /></div>;
}

/** Send a draft or template to one or more signers. */
export function SendPanel({ id, options, initial, isTemplate }: { id: string; options: SignerOption[]; initial?: string[]; isTemplate: boolean }) {
  const [state, action, pending] = useActionState<SendState, FormData>(async (prev, f) => {
    const res = await sendEnvelope(prev, f);
    // A sent draft turns read-only and this form unmounts, so hand the links to the page (JustSentLinks).
    if (!isTemplate && res?.sent?.length) try { sessionStorage.setItem(linksKey(id), JSON.stringify(res.sent)); } catch {}
    return res;
  }, undefined);
  if (state?.sent?.length && !isTemplate) return <Links sent={state.sent} />;
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <SignerPicker key={state?.sent?.length ?? 0} options={options} initial={initial} />
      {state?.error && <p className="rounded bg-red-50 p-2 text-sm text-red-700">{state.error}</p>}
      <button className="btn w-full" disabled={pending}>{pending ? "Sending…" : "Send for signature"}</button>
      {state?.sent?.length ? <Links sent={state.sent} /> : null}
    </form>
  );
}

/** A new signing link for an open request. */
export function RenewLinkPanel({ id, slot = 0, name }: { id: string; slot?: number; name?: string }) {
  const [state, action, pending] = useActionState<SendState, FormData>(renewLink, undefined);
  if (state?.sent?.length) return <Links sent={state.sent} />;
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="slot" value={slot} />
      <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" name="email" defaultChecked /> Email the new link to {name ?? "the signer"}</label>
      <button className="btn-ghost w-full py-1.5" disabled={pending}>{pending ? "Creating…" : `Resend / new signing link${name ? ` for ${name.split(" ")[0]}` : ""}`}</button>
      {state?.error && <p className="rounded bg-red-50 p-2 text-xs text-red-700">{state.error}</p>}
    </form>
  );
}
