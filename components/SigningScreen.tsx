import Link from "next/link";
import { loadParties, loadSigner, markViewed, type SignerMatch } from "@/lib/esign-db";
import { dueSlots, fieldsFor, fieldText, parseFields, type SignValues } from "@/lib/esign";
import { SignerView, type OtherField } from "@/components/SignerView";
import { LocalTime } from "@/components/LocalTime";

const names = (xs: { name: string }[]) => xs.map((x) => x.name).join(" and ");

/** What a signer sees for one request: the signing screen while it's their turn, otherwise where things stand. */
export async function SigningScreen({ found, refKey, refValue, backHref }: { found: SignerMatch | null; refKey: "token" | "id"; refValue: string; backHref?: string }) {
  const box = (title: string, body: React.ReactNode) => (
    <div className="mx-auto max-w-md card p-6">
      <h1 className="text-xl font-bold">{title}</h1>
      <div className="mt-2 space-y-3 text-sm text-slate-600">{body}</div>
    </div>
  );
  if (!found) return box("This link isn't valid", <p>It may have been replaced by a newer link. Ask your DEAC contact to send the document again{refKey === "id" ? ", or sign in with the account it was sent to" : ""}.</p>);
  const r = found.request;
  if (found.expired) return box("This signing link has expired", <p>Ask your DEAC contact for a new link to <b>{r.title}</b>.</p>);
  const q = refKey === "token" ? `&t=${encodeURIComponent(refValue)}` : "";
  const isRecipient = found.slot === 0;
  if (r.status === "SIGNED") {
    return box("Signed — thank you", <>
      <p><b>{r.title}</b> was signed{r.signedAt ? <> on <LocalTime value={r.signedAt} /></> : null}. A copy is with the DEAC team.</p>
      <a href={`/api/esign/${r.id}?file=signed${q}`} target="_blank" className="btn">Open the signed copy</a>
      <a href={`/api/esign/${r.id}?file=signed&download${q}`} className="btn-ghost ml-2">Download</a>
      {isRecipient && r.investorId && <p><Link href={r.projectId ? `/marketplace/${r.projectId}` : "/portal"} className="font-semibold text-brand-600">Continue to the DEAC Marketplace →</Link></p>}
      {backHref && <p><Link href={backHref} className="font-semibold text-brand-600">← Back to the document</Link></p>}
    </>);
  }
  if (r.status === "DECLINED") return box(found.cosigner?.status === "DECLINED" || (isRecipient && !found.cosigner) ? "You declined to sign" : "This document was declined", <p>We let the DEAC team know about <b>{r.title}</b>. They&apos;ll be in touch.</p>);
  if (r.status !== "SENT" && r.status !== "VIEWED") return box("This document is no longer available", <p><b>{r.title}</b> was withdrawn by the DEAC team. If you still need to sign it, ask your DEAC contact.</p>);

  const parties = await loadParties(r);
  const me = parties.find((p) => p.slot === found.slot)!;
  const due = dueSlots(parties);
  const pending = parties.filter((p) => !p.signed && p.slot !== me.slot);
  if (me.signed) {
    return box("You've signed — thank you", <>
      <p>Your signature on <b>{r.title}</b> is recorded. We&apos;re waiting for {names(pending)} to sign. Once everyone has signed, we&apos;ll email you the final copy with all signatures.</p>
      {backHref && <p><Link href={backHref} className="font-semibold text-brand-600">← Back to the document</Link></p>}
    </>);
  }
  if (!due.includes(me.slot)) {
    return box("Not your turn yet", <>
      <p><b>{names(parties.filter((p) => due.includes(p.slot)))}</b> sign{due.length === 1 ? "s" : ""} <b>{r.title}</b> first. We&apos;ll email you a link as soon as it&apos;s your turn.</p>
      {backHref && <p><Link href={backHref} className="font-semibold text-brand-600">← Back to the document</Link></p>}
    </>);
  }

  await markViewed(found);
  const p = me.ref ? await loadSigner(me.ref) : null;
  const prefill: SignValues = {
    name: p?.name ?? me.name ?? "", title: p?.title ?? "", company: p?.company ?? me.company ?? "", phone: p?.phone ?? "",
    street: p?.street ?? "", city: p?.city ?? "", region: p?.region ?? "", postalCode: p?.postalCode ?? "", country: p?.country ?? "US",
  };
  const fields = parseFields(r.fields, r.pageCount);
  // Other signers' fields: what they entered once they've signed, otherwise a placeholder with their name.
  const others: OtherField[] = parties.filter((x) => x.slot !== me.slot).flatMap((x) =>
    fieldsFor(fields, x.slot).map((f) => ({
      f, by: x.name, role: x.role,
      img: x.signed ? (f.type === "SIGNATURE" ? x.values.signature : f.type === "INITIALS" ? x.values.initials : undefined) : undefined,
      text: x.signed ? fieldText(f, x.values, x.signedAt) : "",
    })),
  );
  return (
    <SignerView
      refKey={refKey}
      refValue={refValue}
      pdfUrl={`/api/esign/${r.id}?file=original${q}`}
      fields={fieldsFor(fields, me.slot)}
      others={others}
      parties={parties.length > 1 ? parties.map((x) => ({ name: x.name, role: x.role, signed: x.signed, me: x.slot === me.slot })) : []}
      prefill={prefill}
      email={me.email ?? ""}
      signerName={me.name}
      title={r.title}
      message={r.message}
      sender={r.createdBy && r.createdBy !== "Listing NDA (self-serve)" ? r.createdBy : null}
      canSaveProfile={me.cosigner?.signerType !== "TEAM"}
    />
  );
}
