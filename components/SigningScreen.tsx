import Link from "next/link";
import { loadSigner, markViewed, signerRef } from "@/lib/esign-db";
import { parseFields, type SignValues } from "@/lib/esign";
import { SignerView } from "@/components/SignerView";
import { LocalTime } from "@/components/LocalTime";

type Found = NonNullable<Awaited<ReturnType<typeof import("@/lib/esign-db").findForSigner>>>;

/** What a signer sees for one request: the signing screen while it's open, otherwise its outcome. */
export async function SigningScreen({ found, refKey, refValue }: { found: Found | null; refKey: "token" | "id"; refValue: string }) {
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
  if (r.status === "SIGNED") {
    return box("Signed — thank you", <>
      <p><b>{r.title}</b> was signed{r.signedAt ? <> on <LocalTime value={r.signedAt} /></> : null}. A copy is with the DEAC team.</p>
      <a href={`/api/esign/${r.id}?file=signed${q}`} target="_blank" className="btn">Open your signed copy</a>
      <a href={`/api/esign/${r.id}?file=signed&download${q}`} className="btn-ghost ml-2">Download</a>
      {r.investorId && <p><Link href={r.projectId ? `/marketplace/${r.projectId}` : "/portal"} className="font-semibold text-brand-600">Continue to the DEAC Marketplace →</Link></p>}
    </>);
  }
  if (r.status === "DECLINED") return box("You declined to sign", <p>We let the DEAC team know about <b>{r.title}</b>. They&apos;ll be in touch.</p>);
  if (r.status !== "SENT" && r.status !== "VIEWED") return box("This document is no longer available", <p><b>{r.title}</b> was withdrawn by the DEAC team. If you still need to sign it, ask your DEAC contact.</p>);

  await markViewed({ [refKey]: refValue });
  const p = await loadSigner(signerRef(r));
  const prefill: SignValues = {
    name: p?.name ?? r.signerName ?? "", title: p?.title ?? "", company: p?.company ?? r.signerCompany ?? "", phone: p?.phone ?? "",
    street: p?.street ?? "", city: p?.city ?? "", region: p?.region ?? "", postalCode: p?.postalCode ?? "", country: p?.country ?? "US",
  };
  return (
    <SignerView
      refKey={refKey}
      refValue={refValue}
      pdfUrl={`/api/esign/${r.id}?file=original${q}`}
      fields={parseFields(r.fields, r.pageCount)}
      prefill={prefill}
      email={r.signerEmail ?? ""}
      signerName={r.signerName ?? ""}
      title={r.title}
      message={r.message}
      sender={r.createdBy && r.createdBy !== "Listing NDA (self-serve)" ? r.createdBy : null}
    />
  );
}
