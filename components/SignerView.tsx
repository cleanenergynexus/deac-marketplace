"use client";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PdfPages } from "@/components/PdfPages";
import { declineRequest, signRequest, type SignState } from "@/app/actions/esign";
import { COUNTRIES } from "@/lib/phone";
import { STATE_NAMES } from "@/lib/regions";
import { CONSENT_TEXT, FIELD_TYPES, PROFILE_LABEL, fieldText, initialsOf, missingValues, panelFor, type ProfileKey, type SignField, type SignValues } from "@/lib/esign";

const STATES = Object.entries(STATE_NAMES).sort((a, b) => a[1].localeCompare(b[1]));
const SIG_FONT = '"Dancing Script", "Segoe Script", "Brush Script MT", cursive';

/** Turns typed text into a signature image (PNG data URL) in a handwriting font. */
async function typedToPng(text: string, size = 72) {
  if (!text.trim()) return "";
  try { await document.fonts.load(`600 ${size}px "Dancing Script"`); } catch {}
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d")!;
  ctx.font = `600 ${size}px ${SIG_FONT}`;
  const w = Math.ceil(ctx.measureText(text).width) + size * 0.6;
  c.width = w;
  c.height = Math.ceil(size * 1.5);
  ctx.font = `600 ${size}px ${SIG_FONT}`;
  ctx.fillStyle = "#0b1a5c";
  ctx.textBaseline = "middle";
  ctx.fillText(text, size * 0.3, c.height / 2);
  return c.toDataURL("image/png");
}

/** Another signer's field, shown read-only: what they entered once signed, else a placeholder with their name. */
export type OtherField = { f: SignField; by: string; role: string; img?: string; text: string };

/**
 * The signing screen: the signer's details on the left (prefilled from their record, required ones marked), the
 * document on the right with each field showing what will be printed there, then "I Agree".
 */
export function SignerView({ refKey, refValue, pdfUrl, fields, others = [], parties = [], prefill, email, signerName, title, message, sender, canSaveProfile = true }: {
  refKey: "token" | "id";
  refValue: string;
  pdfUrl: string;
  fields: SignField[];
  others?: OtherField[];
  parties?: { name: string; role: string; signed: boolean; me: boolean }[];
  canSaveProfile?: boolean;
  prefill: SignValues;
  email: string;
  signerName: string;
  title: string;
  message: string | null;
  sender: string | null;
}) {
  const router = useRouter();
  const panel = useMemo(() => panelFor(fields), [fields]);
  const [v, setV] = useState<SignValues>(prefill);
  const [sigMode, setSigMode] = useState<"type" | "draw">("type");
  const [typedSig, setTypedSig] = useState(prefill.name ?? "");
  const [consent, setConsent] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [tried, setTried] = useState(false);
  const [state, action, pending] = useActionState<SignState, FormData>(signRequest, undefined);
  const [dState, dAction, dPending] = useActionState<SignState, FormData>(declineRequest, undefined);
  const now = useMemo(() => new Date(), []);

  useEffect(() => { if (state?.ok || dState?.ok) router.refresh(); }, [state, dState, router]);

  // Typed signature and initials follow the typed name.
  useEffect(() => {
    if (sigMode !== "type") return;
    let live = true;
    const t = setTimeout(async () => {
      const [sig, ini] = await Promise.all([panel.signature ? typedToPng(typedSig) : "", panel.initials ? typedToPng(initialsOf(typedSig || v.name || "")) : ""]);
      if (live) setV((x) => ({ ...x, signature: sig || undefined, initials: ini || undefined }));
    }, 200);
    return () => { live = false; clearTimeout(t); };
  }, [typedSig, sigMode, panel.signature, panel.initials, v.name]);

  const set = (k: ProfileKey, val: string) => setV((x) => ({ ...x, [k]: val }));
  const setCustom = (id: string, val: string) => setV((x) => ({ ...x, custom: { ...x.custom, [id]: val } }));
  const missing = missingValues(fields, v);
  const requiredCount = panel.profile.filter((p) => p.required).length + (panel.signature ? 1 : 0) + (panel.initials ? 1 : 0) + panel.custom.filter((f) => f.required).length;
  const ready = !missing.length && consent;
  const bad = (label: string) => tried && missing.includes(label);
  const focus = (id: string) => { const el = document.getElementById(id); el?.scrollIntoView({ block: "center", behavior: "smooth" }); el?.focus({ preventScroll: true }); };
  const us = (v.country ?? "US") === "US";

  const input = (k: ProfileKey) => {
    const req = panel.profile.find((p) => p.key === k)?.required;
    const id = `sv-${k}`;
    const cls = `input ${bad(PROFILE_LABEL[k]) ? "border-red-400 bg-red-50" : ""}`;
    let control;
    if (k === "email") control = <input id={id} className="input bg-slate-50 text-slate-600" value={email} readOnly />;
    else if (k === "country") control = <select id={id} className={cls} value={v.country ?? ""} onChange={(e) => set("country", e.target.value)}><option value="">—</option>{COUNTRIES.map((c) => <option key={c.iso} value={c.iso}>{c.name}</option>)}</select>;
    else if (k === "region" && us) control = <select id={id} className={cls} value={v.region ?? ""} onChange={(e) => set("region", e.target.value)}><option value="">—</option>{STATES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select>;
    else control = <input id={id} className={cls} value={v[k] ?? ""} onChange={(e) => set(k, e.target.value)} autoComplete={({ name: "name", title: "organization-title", company: "organization", phone: "tel", street: "street-address", city: "address-level2", region: "address-level1", postalCode: "postal-code" } as Record<string, string>)[k]} />;
    return (
      <label key={k} className="block">
        <span className="label">{k === "region" && !us ? "State / region" : k === "postalCode" && us ? "Zip code" : PROFILE_LABEL[k]}{req && <span className="text-red-600"> *</span>}</span>
        {control}
        {bad(PROFILE_LABEL[k]) && <span className="mt-0.5 block text-xs text-red-600">Enter {PROFILE_LABEL[k].toLowerCase()}</span>}
      </label>
    );
  };

  const keys = panel.profile.map((p) => p.key);
  const addressKeys = keys.filter((k) => ["street", "city", "region", "postalCode", "country"].includes(k));
  const otherKeys = keys.filter((k) => !addressKeys.includes(k));

  return (
    <div className="grid gap-0 overflow-hidden rounded-xl border border-slate-200 bg-white lg:h-[calc(100vh-11rem)] lg:grid-cols-[22rem_minmax(0,1fr)]">
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Dancing+Script:wght@600&display=swap" precedence="default" />
      <div className="flex min-h-0 flex-col border-b border-slate-200 lg:border-b-0 lg:border-r">
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <div>
            <h1 className="text-lg font-bold leading-snug">{title}</h1>
            <p className="mt-1 text-xs text-slate-500">{sender ? `Sent by ${sender} at DEAC. ` : ""}Review the document, confirm your details, then click I Agree.</p>
            {message && <p className="mt-2 rounded-md bg-slate-50 p-2 text-sm text-slate-700">{message}</p>}
          </div>
          {parties.length > 1 && (
            <div className="rounded-md border border-slate-200 p-2.5">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Signers</div>
              <ol className="mt-1 space-y-1 text-sm">
                {parties.map((x, i) => (
                  <li key={i} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate"><span className="font-medium">{x.me ? "You" : x.name}</span> <span className="text-xs text-slate-500">· {x.role}</span></span>
                    <span className={`shrink-0 text-xs ${x.signed ? "text-emerald-700" : x.me ? "font-semibold text-amber-700" : "text-slate-400"}`}>{x.signed ? "Signed ✓" : x.me ? "Signing now" : "Waiting"}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {otherKeys.map(input)}
          <p className="text-xs text-slate-500">Not {signerName}? Please don&apos;t sign. Reply to the email so we can send it to the right person.</p>
          {addressKeys.length > 0 && <div className="grid grid-cols-2 gap-3">{addressKeys.map((k) => <div key={k} className={k === "street" || k === "country" ? "col-span-2" : ""}>{input(k)}</div>)}</div>}
          {panel.custom.map((f) => f.type === "CHECKBOX" ? (
            <label key={f.id} className={`flex items-start gap-2 text-sm ${bad(f.label || "Checkbox") ? "text-red-700" : ""}`}>
              <input id={`sv-${f.id}`} type="checkbox" className="mt-1" checked={v.custom?.[f.id] === "yes"} onChange={(e) => setCustom(f.id, e.target.checked ? "yes" : "")} />
              <span>{f.label || "Checkbox"}{f.required && <span className="text-red-600"> *</span>}</span>
            </label>
          ) : (
            <label key={f.id} className="block"><span className="label">{f.label || "Text"}{f.required && <span className="text-red-600"> *</span>}</span>
              <input id={`sv-${f.id}`} className={`input ${bad(f.label || "Text box") ? "border-red-400 bg-red-50" : ""}`} value={v.custom?.[f.id] ?? ""} onChange={(e) => setCustom(f.id, e.target.value)} />
            </label>
          ))}
          {(panel.signature || panel.initials) && (
            <div id="sv-signature" tabIndex={-1} className={`space-y-2 rounded-lg border p-3 ${bad("Signature") ? "border-red-400 bg-red-50" : "border-slate-200"}`}>
              <div className="flex items-center justify-between">
                <span className="label mb-0">Your signature<span className="text-red-600"> *</span></span>
                <div className="flex gap-1 text-xs">
                  {(["type", "draw"] as const).map((m) => <button key={m} type="button" onClick={() => { setSigMode(m); if (m === "draw") setV((x) => ({ ...x, signature: undefined, initials: undefined })); }} className={`rounded px-2 py-0.5 ${sigMode === m ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-700"}`}>{m === "type" ? "Type" : "Draw"}</button>)}
                </div>
              </div>
              {sigMode === "type" ? (
                <>
                  <input className="input" value={typedSig} onChange={(e) => setTypedSig(e.target.value)} aria-label="Type your name to sign" />
                  <div className="flex h-16 items-center overflow-hidden rounded bg-slate-50 px-3 text-3xl text-[#0b1a5c]" style={{ fontFamily: SIG_FONT, fontWeight: 600 }}>{typedSig}</div>
                </>
              ) : (
                <>
                  {panel.signature && <DrawPad label="Draw your signature" onChange={(png) => setV((x) => ({ ...x, signature: png || undefined }))} />}
                  {panel.initials && <DrawPad label="Draw your initials" small onChange={(png) => setV((x) => ({ ...x, initials: png || undefined }))} />}
                </>
              )}
            </div>
          )}
          <label className={`flex items-start gap-2 text-xs ${tried && !consent ? "text-red-700" : "text-slate-600"}`}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
            <span>{CONSENT_TEXT}</span>
          </label>
        </div>
        <div className="border-t border-slate-200 bg-white p-4">
          {declining ? (
            <form action={dAction} className="space-y-2">
              <input type="hidden" name={refKey} value={refValue} />
              <textarea name="reason" className="input min-h-16 text-sm" placeholder="Reason (optional), e.g. our counsel has comments" />
              {dState?.error && <p className="rounded bg-red-50 p-2 text-xs text-red-700">{dState.error}</p>}
              <div className="flex gap-2"><button type="button" className="btn-ghost flex-1 py-1.5" onClick={() => setDeclining(false)}>Back</button><button className="btn-danger flex-1" disabled={dPending}>{dPending ? "…" : "Decline to sign"}</button></div>
            </form>
          ) : (
            <form action={action} onSubmit={(e) => { setTried(true); if (!ready) { e.preventDefault(); const first = missing[0]; if (first) { const k = panel.profile.find((p) => PROFILE_LABEL[p.key] === first)?.key; focus(k ? `sv-${k}` : first === "Signature" || first === "Initials" ? "sv-signature" : `sv-${panel.custom.find((f) => (f.label || FIELD_TYPES[f.type].label) === first)?.id}`); } } }} className="space-y-2">
              <input type="hidden" name={refKey} value={refValue} />
              <input type="hidden" name="values" value={JSON.stringify({ ...v, email })} />
              {consent && <input type="hidden" name="consent" value="on" />}
              {canSaveProfile && <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" name="saveProfile" defaultChecked /> Save my address and phone to my DEAC profile</label>}
              {(state?.error || (tried && !ready)) && <p className="rounded bg-red-50 p-2 text-xs text-red-700">{state?.error ?? (missing.length ? `Please complete: ${missing.join(", ")}.` : "Please tick the box to agree to sign electronically.")}</p>}
              <div className="flex items-center justify-between gap-3">
                <button type="button" className="text-xs text-slate-500 hover:text-red-600" onClick={() => setDeclining(true)}>Decline</button>
                <span className="text-xs text-slate-500">{requiredCount - missing.length}/{requiredCount} required</span>
                <button className="rounded-md bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60" disabled={pending}>{pending ? "Signing…" : "I Agree"}</button>
              </div>
            </form>
          )}
        </div>
      </div>
      <div className="min-h-0 overflow-y-auto bg-slate-600/90 p-3 sm:p-6">
        <div className="mx-auto max-w-4xl">
          <PdfPages
            url={pdfUrl}
            overlay={(page) => [...others.filter((o) => o.f.page === page).map((o) => (
              <div key={`o-${o.f.id}`} title={`${o.by} (${o.role})`}
                className={`pointer-events-none absolute flex items-center overflow-hidden rounded-sm leading-none ${o.img || o.text ? "" : "border border-dashed border-violet-400 bg-violet-50/70"}`}
                style={{ left: `${o.f.x * 100}%`, top: `${o.f.y * 100}%`, width: `${o.f.w * 100}%`, height: `${o.f.h * 100}%` }}>
                {o.img ? <img src={o.img} alt="" className="h-full w-full object-contain object-left" /> : o.text ? (
                  <span className="truncate px-0.5 text-[#0d1a5a]" style={{ fontSize: `${Math.min(o.f.h * 80, 1.39)}cqh` }}>{o.text}</span>
                ) : <span className="truncate px-0.5 text-[9px] font-semibold text-violet-800">{o.by}: {FIELD_TYPES[o.f.type].label}</span>}
              </div>
            )), ...fields.filter((f) => f.page === page).map((f) => {
              const img = f.type === "SIGNATURE" ? v.signature : f.type === "INITIALS" ? v.initials : undefined;
              const text = fieldText(f, v, now);
              const empty = !img && !text;
              const target = f.type === "SIGNATURE" || f.type === "INITIALS" ? "sv-signature" : f.type === "TEXT" || f.type === "CHECKBOX" ? `sv-${f.id}` : `sv-${(FIELD_TYPES[f.type] as { key?: string }).key ?? (f.type === "ADDRESS" ? "street" : "name")}`;
              return (
                <button key={f.id} type="button" onClick={() => focus(target)} title={FIELD_TYPES[f.type].label}
                  className={`absolute flex items-center overflow-hidden rounded-sm text-left leading-none ${empty ? (f.required ? "border border-amber-500 bg-amber-200/80" : "border border-dashed border-slate-400 bg-slate-100/60") : "bg-sky-100/40 hover:bg-sky-100/70"}`}
                  style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%`, width: `${f.w * 100}%`, height: `${f.h * 100}%` }}>
                  {img ? <img src={img} alt="" className="h-full w-full object-contain object-left" /> : (
                    <span className={`truncate px-0.5 ${empty ? "text-[9px] font-semibold uppercase text-amber-900" : "text-[#0d1a5a]"}`} style={empty ? undefined : { fontSize: `${Math.min(f.h * 80, 1.39)}cqh` }}>
                      {empty ? (f.type === "SIGNATURE" ? "Sign here" : f.label || FIELD_TYPES[f.type].label) : text}
                    </span>
                  )}
                </button>
              );
            })]}
          />
        </div>
      </div>
    </div>
  );
}

/** Finger / mouse drawing pad. Reports a PNG data URL ("" when cleared). */
function DrawPad({ label, onChange, small }: { label: string; onChange: (png: string) => void; small?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);
  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * e.currentTarget.width, ((e.clientY - r.top) / r.height) * e.currentTarget.height] as const;
  };
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-slate-500"><span>{label}</span><button type="button" className="text-brand-600" onClick={() => { const c = ref.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); dirty.current = false; onChange(""); }}>Clear</button></div>
      <canvas
        ref={ref}
        width={small ? 240 : 600}
        height={small ? 100 : 160}
        aria-label={label}
        className={`mt-1 w-full touch-none rounded border border-slate-300 bg-white ${small ? "max-w-[10rem]" : ""}`}
        onPointerDown={(e) => {
          drawing.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          const ctx = e.currentTarget.getContext("2d")!;
          const [x, y] = pos(e);
          ctx.beginPath();
          ctx.moveTo(x, y);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const ctx = e.currentTarget.getContext("2d")!;
          ctx.lineWidth = small ? 4 : 4.5;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.strokeStyle = "#0b1a5c";
          const [x, y] = pos(e);
          ctx.lineTo(x, y);
          ctx.stroke();
          dirty.current = true;
        }}
        onPointerUp={(e) => { drawing.current = false; if (dirty.current) onChange(e.currentTarget.toDataURL("image/png")); }}
      />
    </div>
  );
}
