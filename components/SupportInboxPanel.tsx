"use client";
import { useActionState } from "react";
import { checkSupportNow, saveSupportMember } from "@/app/actions/support";
import { LocalTime } from "@/components/LocalTime";

type Props = {
  team: { id: string; name: string; email: string }[];
  member: { id: string; name: string; email: string; since: Date | null } | null;
  gmail: { email: string; supportSyncAt: Date | null; supportError: string | null } | null;
  openTasks: number;
  setupMissing: string[];
  canEdit: boolean;
};

/** Team → Technical Support: who receives support email, their Gmail link, and Check now. */
export function SupportInboxPanel({ team, member, gmail, openTasks, setupMissing, canEdit }: Props) {
  const [saved, save, saving] = useActionState(saveSupportMember, undefined);
  const [checked, check, checking] = useActionState(checkSupportNow, undefined);
  const address = member?.email;
  const alias = !!gmail && !!member && gmail.email.toLowerCase() !== member.email.toLowerCase();
  return (
    <div className="space-y-4 text-sm">
      <p className="text-slate-600">
        Every email sent to the Technical Support member&apos;s address becomes a task assigned to them, with the sender, subject and message. When the sender is
        an investor or developer contact in the CRM, the task is linked to their record. Replies in the same conversation are added to the open task. Their
        address is also the &quot;Contact Support&quot; address in the marketplace&apos;s branded emails.
      </p>

      {canEdit && (
        <form action={save} className="flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Technical Support member</span>
            <select name="userId" defaultValue={member?.id ?? ""} className="input !w-72">
              <option value="">Nobody (support inbox off)</option>
              {team.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.email}</option>)}
            </select>
          </label>
          <button className="btn-ghost" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
          {saved?.error && <span className="w-full text-xs text-red-600">{saved.error}</span>}
          {saved?.ok && !saving && <span className="w-full text-xs text-emerald-700">{saved.ok}</span>}
        </form>
      )}

      {!member ? (
        <p className="rounded bg-slate-50 p-3 text-slate-600">
          No support inbox yet. {canEdit ? "Add a team member such as \"Technical Support\" with the support email address (e.g. support@deacna.com) below, then pick them here." : "An Admin can set one up here."}
        </p>
      ) : !gmail ? (
        <div className="rounded bg-amber-50 p-3 text-amber-900">
          <p><b>{member.name}</b> is Technical Support, but their Gmail isn&apos;t linked, so emails can&apos;t be read yet.</p>
          {setupMissing.length ? (
            <p className="mt-1">Gmail linking isn&apos;t set up on the server yet. Missing in Vercel: <b>{setupMissing.join(", ")}</b>.</p>
          ) : canEdit ? (
            <p className="mt-2"><a href="/api/google/connect?for=support" className="btn inline-flex">Link {member.email} Gmail</a> <span className="ml-2 text-xs">Sign in to Google as the support mailbox on the next screen.</span></p>
          ) : (
            <p className="mt-1">An Admin can link it here, or {member.name} can under My account.</p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <p>
            Support address: <b>{address}</b> · assigned to <b>{member.name}</b> · <a href={`/admin/tasks?scope=all&who=${member.id}`} className="text-brand-600">{openTasks} open support task{openTasks === 1 ? "" : "s"}</a>
          </p>
          <p className="text-slate-600">
            {gmail.supportSyncAt ? <>Last checked <LocalTime value={gmail.supportSyncAt} />.</> : "Not checked yet."} The inbox is checked every few minutes while the team is using the admin pages, and every night.
            {member.since && <> Email from <LocalTime value={member.since} /> on becomes tasks.</>}
          </p>
          {alias && (
            <p className="rounded bg-slate-50 p-3 text-slate-600">
              Read from the <b>{gmail.email}</b> Gmail, where {address} is an alias. Only emails sent to <b>{address}</b> become tasks; the rest of that inbox is ignored.
            </p>
          )}
                    {gmail.supportError && <p className="rounded bg-red-50 p-3 text-red-700">{gmail.supportError}{canEdit && <> <a href="/api/google/connect?for=support" className="font-medium underline">Link again</a></>}</p>}
          {checked?.error && <p className="rounded bg-red-50 p-3 text-red-700">{checked.error}</p>}
          {checked?.ok && <p className="rounded bg-emerald-50 p-3 text-emerald-800">{checked.ok}</p>}
          <form action={check}><button className="btn" disabled={checking}>{checking ? "Checking…" : "Check now"}</button></form>
        </div>
      )}
    </div>
  );
}
