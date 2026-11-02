"use client";
import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { syncMyGmail, syncRecordEmails, unlinkGmail } from "@/app/actions/gmail";
import { ConfirmButton } from "@/components/ConfirmButton";
import { LocalTime } from "@/components/LocalTime";

type Linked = { email: string; lastSyncAt: Date | null; lastSyncError: string | null; lastSyncAdded: number };

/** My account → Gmail: link, sync now, unlink. */
export function GmailPanel({ linked, missing }: { linked: Linked | null; missing: string[] }) {
  const [state, sync, pending] = useActionState(syncMyGmail, undefined);
  if (!linked) {
    return (
      <div className="space-y-3 text-sm">
        <p className="text-slate-600">
          Link your Gmail to send emails (signature requests, emails from a contact&apos;s Activity) from your own address, and to pull your
          emails with investors, developer contacts and referral agents onto their records.
        </p>
        {missing.length ? (
          <p className="rounded bg-amber-50 p-3 text-amber-900">Gmail linking isn&apos;t set up on the server yet. Missing in Vercel: <b>{missing.join(", ")}</b>. See the README section &quot;Gmail&quot;.</p>
        ) : (
          <a href="/api/google/connect" className="btn inline-flex items-center gap-2"><GoogleMark /> Link Gmail</a>
        )}
      </div>
    );
  }
  return (
    <div className="space-y-3 text-sm">
      <p>
        Linked to <b>{linked.email}</b>. Emails you send from the marketplace go out from this address and show in your Gmail Sent folder.
      </p>
      <p className="text-slate-600">
        {linked.lastSyncAt ? <>Last sync <LocalTime value={linked.lastSyncAt} />: {linked.lastSyncAdded} new email{linked.lastSyncAdded === 1 ? "" : "s"} filed.</> : "Not synced yet."}{" "}
        New email syncs every night, and whenever you open a contact&apos;s record.
      </p>
      {linked.lastSyncError && <p className="rounded bg-red-50 p-3 text-red-700">{linked.lastSyncError}</p>}
      {state?.error && <p className="rounded bg-red-50 p-3 text-red-700">{state.error}</p>}
      {state?.ok && <p className="rounded bg-emerald-50 p-3 text-emerald-800">{state.ok}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <form action={sync}><button className="btn" disabled={pending}>{pending ? "Syncing…" : "Sync now"}</button></form>
        {linked.lastSyncError && <a href="/api/google/connect" className="btn-ghost">Link again</a>}
        <form action={unlinkGmail}>
          <ConfirmButton message="Unlink your Gmail? Emails already on contact records stay there. New emails will go out from DEAC's address with replies to you." className="text-sm text-red-600">Unlink Gmail</ConfirmButton>
        </form>
      </div>
      <p className="text-xs text-slate-500">
        Only emails with people in the CRM are copied (investor contacts, developer contacts and referral agents, matched by email address). Synced emails are
        visible to the DEAC team on the contact&apos;s record, not to referral agents.
      </p>
    </div>
  );
}

/** Opening a contact record pulls the latest emails with them from the viewer's Gmail, then refreshes the timeline if anything was new. */
export function GmailRecordSync({ investorId, contactId }: { investorId?: string; contactId?: string }) {
  const router = useRouter();
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    syncRecordEmails({ investorId, contactId }).then((n) => { if (n) router.refresh(); }).catch(() => {});
  }, [investorId, contactId, router]);
  return null;
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path fill="#fff" d="M21.35 11.1H12v2.98h5.35c-.23 1.43-1.66 4.2-5.35 4.2-3.22 0-5.85-2.67-5.85-5.96S8.78 6.36 12 6.36c1.83 0 3.06.78 3.76 1.45l2.57-2.47C16.68 3.8 14.55 2.9 12 2.9 6.98 2.9 2.9 6.98 2.9 12s4.08 9.1 9.1 9.1c5.25 0 8.73-3.69 8.73-8.89 0-.6-.07-1.06-.15-1.51z" />
    </svg>
  );
}
