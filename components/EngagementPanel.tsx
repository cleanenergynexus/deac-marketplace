import Link from "next/link";
import { LocalTime } from "@/components/LocalTime";
import { Empty } from "@/components/ui";
import { describeEvent, formatDuration, groupVisits, listingIdFromPath, rollupByListing } from "@/lib/activity";
import { loadEvents, projectNames, type TrackWhere } from "@/lib/activity-db";

const ICON: Record<string, string> = { VIEW: "👁", CLICK: "🖱", SELECT: "☑", LINK_OUT: "↗", OPEN: "📄", DOWNLOAD: "⬇", UPLOAD: "⬆", LOGIN: "🔑" };
const TONE: Record<string, string> = { OPEN: "text-emerald-700", DOWNLOAD: "text-emerald-700", UPLOAD: "text-violet-700", LOGIN: "text-brand-700" };

/** Small summary for a record's sidebar: last seen and time on the platform. */
export async function EngagementSummary({ where, href }: { where: TrackWhere; href: string }) {
  const events = await loadEvents(where, 1500);
  if (!events.length) return <p className="text-xs text-slate-500">No platform activity yet.</p>;
  const views = events.filter((e) => e.kind === "VIEW");
  const monthAgo = Date.now() - 30 * 86_400_000;
  const recent = events.filter((e) => e.createdAt.getTime() >= monthAgo);
  return (
    <dl className="space-y-1 text-xs">
      <div className="flex justify-between gap-2"><dt className="text-slate-500">Last seen</dt><dd><LocalTime value={events[0].createdAt} /></dd></div>
      <div className="flex justify-between gap-2"><dt className="text-slate-500">Visits (30 days)</dt><dd>{groupVisits(recent).length}</dd></div>
      <div className="flex justify-between gap-2"><dt className="text-slate-500">Time (30 days)</dt><dd>{formatDuration(recent.reduce((s, e) => s + (e.kind === "VIEW" ? e.durationMs ?? 0 : 0), 0))}</dd></div>
      <div className="flex justify-between gap-2"><dt className="text-slate-500">Pages viewed</dt><dd>{views.length}</dd></div>
      <div className="flex justify-between gap-2"><dt className="text-slate-500">Files opened</dt><dd>{events.filter((e) => e.kind === "OPEN" || e.kind === "DOWNLOAD").length}</dd></div>
      <Link href={href} className="block pt-1 text-brand-600">See full activity</Link>
    </dl>
  );
}

/**
 * A person's platform activity: totals, the listings they spent time on, and every visit with the pages they viewed
 * (and for how long), what they clicked and selected, and the files they opened or downloaded.
 */
export async function EngagementPanel({ where, name, visits: maxVisits = 25 }: { where: TrackWhere; name: string; visits?: number }) {
  const events = await loadEvents(where);
  if (!events.length) {
    return <Empty>No platform activity for {name} yet. Pages viewed, time on page, clicks and files opened show here once they use the marketplace.</Empty>;
  }
  const projects = await projectNames(events, events.map((e) => (e.kind === "CLICK" ? listingIdFromPath(e.target) : null)).filter((x): x is string => !!x));
  const visits = groupVisits(events);
  const listings = rollupByListing(events);
  const views = events.filter((e) => e.kind === "VIEW");
  const files = events.filter((e) => e.kind === "OPEN" || e.kind === "DOWNLOAD");
  const totalMs = views.reduce((s, e) => s + (e.durationMs ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          ["Last seen", <LocalTime key="l" value={events[0].createdAt} />],
          ["Visits", visits.length],
          ["Time on platform", formatDuration(totalMs)],
          ["Pages viewed", views.length],
          ["Files opened", files.length],
        ].map(([label, value]) => (
          <div key={String(label)} className="card p-3">
            <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
            <div className="mt-0.5 text-sm font-semibold">{value}</div>
          </div>
        ))}
      </div>

      {listings.length > 0 && (
        <section className="card overflow-x-auto p-4">
          <h3 className="mb-2 text-sm font-semibold">Listings {name} Looked At</h3>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500"><tr><th className="py-1 pr-3 font-medium">Listing</th><th className="pr-3 font-medium">Views</th><th className="pr-3 font-medium">Time</th><th className="pr-3 font-medium">Files</th><th className="pr-3 font-medium">Clicks</th><th className="font-medium">Last</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {listings.map((l) => {
                const p = projects.get(l.projectId);
                return (
                  <tr key={l.projectId}>
                    <td className="py-1.5 pr-3"><Link href={`/admin/projects/${l.projectId}#engagement`} className="text-brand-700 hover:underline"><span className="font-mono text-xs">{p?.code ?? "Deleted"}</span> {p?.title}</Link></td>
                    <td className="pr-3">{l.views}</td>
                    <td className="pr-3 whitespace-nowrap">{formatDuration(l.activeMs)}</td>
                    <td className="pr-3">{l.downloads}</td>
                    <td className="pr-3">{l.clicks}</td>
                    <td className="whitespace-nowrap text-xs text-slate-500"><LocalTime value={l.last} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      <section className="card p-4">
        <h3 className="mb-2 text-sm font-semibold">Visits</h3>
        <ol className="space-y-2">
          {visits.slice(0, maxVisits).map((v, i) => {
            const opened = v.events.filter((e) => e.kind === "OPEN" || e.kind === "DOWNLOAD").length;
            const pages = v.events.filter((e) => e.kind === "VIEW").length;
            return (
              <li key={v.start.toISOString()}>
                <details open={i === 0} className="rounded-lg border border-slate-200">
                  <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="font-medium"><LocalTime value={v.start} /></span>
                    <span className="text-xs text-slate-500">{formatDuration(v.activeMs)} active · {pages} page{pages === 1 ? "" : "s"}{opened ? ` · ${opened} file${opened === 1 ? "" : "s"}` : ""}</span>
                  </summary>
                  <ul className="divide-y divide-slate-100 border-t border-slate-100 text-sm">
                    {v.events.map((e) => {
                      const text = describeEvent(e, projects);
                      const code = e.kind !== "VIEW" && e.projectId ? projects.get(e.projectId)?.code : undefined;
                      return (
                        <li key={e.id} className="flex items-start gap-2 px-3 py-1.5">
                          <span className="w-16 shrink-0 text-xs text-slate-400"><LocalTime value={e.createdAt} timeOnly /></span>
                          <span aria-hidden className="w-5 shrink-0 text-center">{ICON[e.kind] ?? "•"}</span>
                          <span className={`min-w-0 flex-1 break-words ${TONE[e.kind] ?? (e.kind === "VIEW" ? "text-slate-900" : "text-slate-600")}`}>
                            {text}
                            {code && !text.includes(code) && <span className="ml-1 font-mono text-[11px] text-slate-400">{code}</span>}
                          </span>
                          {e.kind === "VIEW" && <span className="shrink-0 whitespace-nowrap text-xs text-slate-500">{formatDuration(e.durationMs)}{e.scrollPct != null ? ` · ${e.scrollPct}% read` : ""}</span>}
                        </li>
                      );
                    })}
                  </ul>
                </details>
              </li>
            );
          })}
        </ol>
        {visits.length > maxVisits && <p className="mt-2 text-xs text-slate-500">Showing the latest {maxVisits} of {visits.length} visits.</p>}
      </section>
    </div>
  );
}
