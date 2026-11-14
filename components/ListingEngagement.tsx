import Link from "next/link";
import { LocalTime } from "@/components/LocalTime";
import { Badge, Section } from "@/components/ui";
import { formatDuration } from "@/lib/activity";
import { listingEngagement, personHref } from "@/lib/activity-db";

/** Admin listing page: who looked at this listing, for how long, and which files they opened. */
export async function ListingEngagement({ projectId }: { projectId: string }) {
  const { rows, downloads, total } = await listingEngagement([projectId]);
  return (
    <div id="engagement" className="scroll-mt-4">
      <Section title="Engagement" action={<Link href="/admin/activity" className="text-sm text-brand-600">Platform activity</Link>}>
        {!rows.length ? <p className="text-sm text-slate-500">No investor or referral agent has opened this listing yet.</p> : (
          <>
            <p className="mb-3 text-sm text-slate-600">{total.people} {total.people === 1 ? "person" : "people"} · {total.views} page view{total.views === 1 ? "" : "s"} · {formatDuration(total.activeMs)} on the listing · {total.downloads} file{total.downloads === 1 ? "" : "s"} opened</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr><th className="th">Person</th><th className="th">Views</th><th className="th">Time</th><th className="th">Files</th><th className="th">Clicks</th><th className="th">First seen</th><th className="th">Last seen</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => (
                    <tr key={r.userId}>
                      <td className="td"><Link href={personHref(r.user!)} className="text-brand-600">{r.user!.name}</Link> {r.user!.role === "AGENT" && <Badge tone="purple">Agent</Badge>}<div className="text-xs text-slate-500">{r.user!.investor?.firm ?? r.user!.company ?? ""}</div></td>
                      <td className="td">{r.views}</td>
                      <td className="td whitespace-nowrap">{formatDuration(r.activeMs)}</td>
                      <td className="td" title={[...r.files].join(", ")}>{r.downloads}</td>
                      <td className="td">{r.clicks}</td>
                      <td className="td whitespace-nowrap text-xs text-slate-500"><LocalTime value={r.first} time={false} /></td>
                      <td className="td whitespace-nowrap text-xs text-slate-500"><LocalTime value={r.last} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {downloads.length > 0 && (
              <details className="mt-4 rounded-lg border border-slate-200 p-3">
                <summary className="cursor-pointer text-sm font-semibold">Recent File Opens ({downloads.length})</summary>
                <ul className="mt-2 divide-y divide-slate-100 text-sm">
                  {downloads.map((d, i) => (
                    <li key={i} className="flex flex-wrap justify-between gap-2 py-1.5">
                      <span>{d.user ? <Link href={personHref(d.user)} className="text-brand-600">{d.user.name}</Link> : "Someone"} {d.kind === "DOWNLOAD" ? "downloaded" : "opened"} <span className="text-emerald-700">{d.label}</span></span>
                      <span className="text-xs text-slate-500"><LocalTime value={d.createdAt} /></span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </Section>
    </div>
  );
}
