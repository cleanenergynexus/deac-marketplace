import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { Badge, Empty, PageHeader, Section } from "@/components/ui";
import { LocalTime } from "@/components/LocalTime";
import { EngagementPanel } from "@/components/EngagementPanel";
import { describeEvent, formatDuration, listingIdFromPath } from "@/lib/activity";
import { personHref, projectNames } from "@/lib/activity-db";

export const dynamic = "force-dynamic";

const ROLES = [
  { value: "", label: "Everyone" },
  { value: "INVESTOR", label: "Investors" },
  { value: "AGENT", label: "Referral agents" },
  { value: "VISITOR", label: "Visitors" },
] as const;
const DAYS = [7, 30, 90] as const;
const roleLabel = (r: string | null) => (r === "INVESTOR" ? "Investor" : r === "AGENT" ? "Referral agent" : "Visitor");

/** Platform Activity: who is using the marketplace, what they look at, for how long, and what they download. */
export default async function PlatformActivity({ searchParams }: { searchParams: Promise<{ user?: string; role?: string; days?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;

  if (sp.user) {
    const u = await db.user.findUnique({ where: { id: sp.user }, select: { id: true, name: true, email: true, role: true, investorId: true, company: true } });
    if (!u || u.role === "ADMIN") notFound();
    return (
      <div className="space-y-4">
        <Link href="/admin/activity" className="text-sm text-brand-600">← Platform Activity</Link>
        <PageHeader title={u.name} subtitle={<>{roleLabel(u.role)}{u.company ? ` · ${u.company}` : ""} · {u.email}{u.investorId && <> · <Link href={`/admin/investors/${u.investorId}`} className="text-brand-600">CRM record</Link></>}</>} />
        <EngagementPanel where={{ userId: u.id }} name={u.name.split(" ")[0]} visits={60} />
      </div>
    );
  }

  const role = ROLES.some((r) => r.value === sp.role) ? sp.role! : "";
  const days = DAYS.includes(Number(sp.days) as (typeof DAYS)[number]) ? Number(sp.days) : 30;
  const since = new Date(Date.now() - days * 86_400_000);
  const who = role === "VISITOR" ? { userId: null } : role ? { role } : {};
  const where = { createdAt: { gte: since }, ...who };

  const [perUser, visitors, feed, files] = await Promise.all([
    role === "VISITOR" ? Promise.resolve([]) : db.trackEvent.groupBy({ by: ["userId", "kind"], where: { ...where, userId: { not: null } }, _count: { _all: true }, _sum: { durationMs: true }, _max: { createdAt: true } }),
    role && role !== "VISITOR" ? Promise.resolve(0) : db.trackEvent.findMany({ where: { createdAt: { gte: since }, userId: null }, distinct: ["visitorId"], select: { visitorId: true } }).then((r) => r.length),
    db.trackEvent.findMany({ where: { ...where, kind: { not: "VIEW" } }, orderBy: { createdAt: "desc" }, take: 40, include: { user: { select: { id: true, name: true, role: true, investorId: true } } } }),
    db.trackEvent.findMany({ where: { ...where, kind: { in: ["OPEN", "DOWNLOAD"] } }, orderBy: { createdAt: "desc" }, take: 25, include: { user: { select: { id: true, name: true, role: true, investorId: true } } } }),
  ]);
  const views = await db.trackEvent.findMany({ where: { ...where, kind: "VIEW" }, orderBy: { createdAt: "desc" }, take: 40, include: { user: { select: { id: true, name: true, role: true, investorId: true } } } });

  // Most engaged people in the period.
  const people = new Map<string, { userId: string; views: number; activeMs: number; files: number; actions: number; last: Date }>();
  for (const g of perUser) {
    const r = people.get(g.userId!) ?? { userId: g.userId!, views: 0, activeMs: 0, files: 0, actions: 0, last: g._max.createdAt! };
    if (g.kind === "VIEW") { r.views += g._count._all; r.activeMs += g._sum.durationMs ?? 0; }
    else if (g.kind === "OPEN" || g.kind === "DOWNLOAD") r.files += g._count._all;
    else r.actions += g._count._all;
    if (g._max.createdAt! > r.last) r.last = g._max.createdAt!;
    people.set(g.userId!, r);
  }
  const users = await db.user.findMany({ where: { id: { in: [...people.keys()] } }, select: { id: true, name: true, role: true, investorId: true, company: true, investor: { select: { firm: true } } } });
  const byId = new Map(users.map((u) => [u.id, u]));
  const ranked = [...people.values()].filter((r) => byId.has(r.userId)).sort((a, b) => b.activeMs - a.activeMs || b.views - a.views).slice(0, 50);
  const all = [...feed, ...views, ...files];
  const projects = await projectNames(all, all.map((e) => listingIdFromPath(e.target)).filter((x): x is string => !!x));
  const merged = [...feed, ...views].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 60);
  const q = (o: { role?: string; days?: number }) => `?${new URLSearchParams({ ...(o.role ?? role ? { role: o.role ?? role } : {}), days: String(o.days ?? days) })}`;
  const person = (u: { id: string; name: string; role: string; investorId: string | null } | null) =>
    u ? <Link href={personHref(u)} className="font-medium text-brand-700 hover:underline">{u.name}</Link> : <span className="text-slate-500">Visitor</span>;

  return (
    <div className="space-y-6">
      <PageHeader title="Platform Activity" subtitle="What investors, referral agents and visitors do on the marketplace: pages viewed and active time on them, clicks and selections, and files opened or downloaded. The DEAC team isn't tracked." />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {ROLES.map((r) => <Link key={r.value} href={q({ role: r.value })} className={`rounded-full px-3 py-1 ${role === r.value ? "bg-brand-600 text-white" : "bg-white ring-1 ring-slate-200 hover:ring-brand-500"}`}>{r.label}</Link>)}
        <span className="mx-2 text-slate-300">|</span>
        {DAYS.map((d) => <Link key={d} href={q({ days: d })} className={`rounded-full px-3 py-1 ${days === d ? "bg-brand-600 text-white" : "bg-white ring-1 ring-slate-200 hover:ring-brand-500"}`}>Last {d} days</Link>)}
      </div>

      {role !== "VISITOR" && (
        <Section title="Most Engaged">
          {!ranked.length ? <Empty>No activity from signed-in members in the last {days} days.</Empty> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-slate-500"><tr><th className="py-1 pr-3 font-medium">Person</th><th className="pr-3 font-medium">Type</th><th className="pr-3 font-medium">Time</th><th className="pr-3 font-medium">Pages</th><th className="pr-3 font-medium">Files</th><th className="pr-3 font-medium">Clicks &amp; selections</th><th className="font-medium">Last seen</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {ranked.map((r) => {
                    const u = byId.get(r.userId)!;
                    return (
                      <tr key={r.userId}>
                        <td className="py-1.5 pr-3">{person(u)}<span className="block text-xs text-slate-500">{u.investor?.firm ?? u.company ?? ""}</span></td>
                        <td className="pr-3"><Badge tone={u.role === "AGENT" ? "purple" : "blue"}>{roleLabel(u.role)}</Badge></td>
                        <td className="whitespace-nowrap pr-3">{formatDuration(r.activeMs)}</td>
                        <td className="pr-3">{r.views}</td>
                        <td className="pr-3">{r.files}</td>
                        <td className="pr-3">{r.actions}</td>
                        <td className="whitespace-nowrap text-xs text-slate-500"><LocalTime value={r.last} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {!role && visitors > 0 && <p className="mt-3 text-xs text-slate-500">Plus {visitors} visitor session{visitors === 1 ? "" : "s"} that weren&apos;t signed in. <Link href={q({ role: "VISITOR" })} className="text-brand-600">See visitors</Link></p>}
        </Section>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Files Opened & Downloaded">
          {!files.length ? <Empty>No files opened in the last {days} days.</Empty> : (
            <ul className="divide-y divide-slate-100 text-sm">
              {files.map((e) => (
                <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-2 py-1.5">
                  <span className="min-w-0">{person(e.user)} <span className="text-slate-600">{e.kind === "DOWNLOAD" ? "downloaded" : "opened"}</span> <span className="text-emerald-700">{e.label}</span>{e.projectId && projects.get(e.projectId) && <span className="ml-1 font-mono text-[11px] text-slate-400">{projects.get(e.projectId)!.code}</span>}</span>
                  <span className="text-xs text-slate-500"><LocalTime value={e.createdAt} /></span>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Live Feed">
          {!merged.length ? <Empty>Nothing yet.</Empty> : (
            <ul className="divide-y divide-slate-100 text-sm">
              {merged.map((e) => (
                <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-2 py-1.5">
                  <span className="min-w-0">{person(e.user)} <span className="text-slate-600">{describeEvent(e, projects).replace(/^./, (c) => c.toLowerCase())}</span>{e.kind === "VIEW" && e.durationMs ? <span className="ml-1 text-xs text-slate-400">{formatDuration(e.durationMs)}</span> : null}</span>
                  <span className="text-xs text-slate-500"><LocalTime value={e.createdAt} /></span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}
