// Read-only pieces of a listing's collaboration with its referral agent(s): the discussion and the edit log.
// Used on the agent's listing page and on the team's listing page.
import { LocalTime } from "@/components/LocalTime";
import { initials } from "@/lib/crm";
import { editLabel, showValue } from "@/lib/listing-collab";
import type { ListingCollab } from "@/lib/listing-collab-db";

/** The discussion, oldest first, like a chat. `meId` marks the viewer's own messages. */
export function Discussion({ comments, meId, empty }: { comments: ListingCollab["comments"]; meId?: string; empty: string }) {
  if (!comments.length) return <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">{empty}</p>;
  return (
    <ul className="space-y-3">
      {comments.map((c) => {
        const mine = c.authorId === meId;
        return (
          <li key={c.id} className="flex gap-3 text-sm">
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${c.fromAgent ? "bg-violet-100 text-violet-800" : "bg-brand-50 text-brand-700"}`}>{initials(c.authorName)}</span>
            <div className={`min-w-0 flex-1 rounded-lg border p-3 ${mine ? "border-brand-200 bg-brand-50/40" : "border-slate-200"}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs text-slate-500">
                <span><b className="text-slate-900">{c.authorName}</b> · {c.fromAgent ? "Referral agent" : "DEAC team"}</span>
                <LocalTime value={c.createdAt} />
              </div>
              <p className="mt-1 whitespace-pre-wrap text-slate-700">{c.body}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Every edit a referral agent saved on the listing: who, when, and each field's old and new value. */
export function EditLog({ edits, empty }: { edits: ListingCollab["edits"]; empty: string }) {
  if (!edits.length) return <p className="text-sm text-slate-500">{empty}</p>;
  return (
    <ul className="space-y-3">
      {edits.map((e) => (
        <li key={e.id} className="rounded-lg border border-slate-200 p-3 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs text-slate-500">
            <span><b className="text-slate-900">{e.agentName}</b> changed {e.changes.length} field{e.changes.length === 1 ? "" : "s"}</span>
            <LocalTime value={e.createdAt} />
          </div>
          {e.note && <p className="mt-1 text-slate-700">“{e.note}”</p>}
          <table className="mt-2 w-full text-left text-xs">
            <thead><tr className="text-slate-500"><th className="py-1 pr-3 font-medium">Field</th><th className="py-1 pr-3 font-medium">Before</th><th className="py-1 font-medium">After</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {e.changes.map((c) => (
                <tr key={c.field} className="align-top">
                  <td className="py-1 pr-3 font-medium text-slate-700">{editLabel(c.field)}</td>
                  <td className="max-w-[16rem] py-1 pr-3 text-slate-500 line-through decoration-slate-300"><span className="line-clamp-3 whitespace-pre-wrap">{showValue(c.field, c.from)}</span></td>
                  <td className="max-w-[16rem] py-1 text-slate-900"><span className="line-clamp-3 whitespace-pre-wrap">{showValue(c.field, c.to)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </li>
      ))}
    </ul>
  );
}
