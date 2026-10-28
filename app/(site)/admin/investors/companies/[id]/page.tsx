import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { deleteFirm, updateFirm } from "@/app/actions/investors";
import { ActivityFeed } from "@/components/ActivityFeed";
import { Avatar } from "@/components/CrmIcons";
import { ConfirmButton } from "@/components/ConfirmButton";
import { FirmForm } from "@/components/FirmForm";
import { StageSelect } from "@/components/StageSelect";
import { Badge, PageHeader, Section, statusTone } from "@/components/ui";
import { INVESTOR_STAGES, dealTypeLabel, stageLabel } from "@/lib/constants";
import { ago, initials } from "@/lib/crm";
import { memberTone } from "@/lib/investor-crm";
import { ensureFirms, ensureInterests } from "@/lib/investor-crm-db";
import { funnelStages, placeStage } from "@/lib/pipeline";
import { getInvestorPipeline } from "@/lib/pipeline-db";
import { formatPhone } from "@/lib/phone";
import { addressLines, hasAddress, mapsHref, shortPlace } from "@/lib/address";
import { num, usd } from "@/lib/format";
import { requireAdmin } from "@/lib/auth";
import { getTeam, visibleTimelineWhere } from "@/lib/tasks-db";

export const dynamic = "force-dynamic";

/** An investor company: its people, every listing they're working and where, and everything logged with them. */
export default async function InvestorCompany({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await ensureFirms();
  await ensureInterests();
  const [me, team, pipeline] = await Promise.all([requireAdmin(), getTeam(), getInvestorPipeline()]);
  const firm = await db.investorFirm.findUnique({
    where: { id },
    include: {
      investors: {
        orderBy: { name: "asc" },
        include: {
          interests: { include: { project: { select: { id: true, code: true, title: true, mw: true, dealType: true, visibility: true } } }, orderBy: { createdAt: "asc" } },
          lois: { select: { projectId: true, status: true, amount: true } },
        },
      },
    },
  });
  if (!firm) notFound();
  const ids = firm.investors.map((i) => i.id);
  const [activities, touches] = await Promise.all([
    db.activity.findMany({ where: { AND: [{ investorId: { in: ids } }, visibleTimelineWhere(me, team)] }, orderBy: { createdAt: "desc" }, take: 50, include: { investor: { select: { id: true, name: true } }, project: { select: { id: true, code: true, title: true } }, assignee: { select: { id: true, name: true } } } }),
    db.activity.groupBy({ by: ["investorId"], where: { investorId: { in: ids }, kind: { in: ["NOTE", "EMAIL", "CALL", "MEETING", "TASK"] } }, _max: { createdAt: true } }),
  ]);
  const lastTouch = new Map(touches.map((t) => [t.investorId!, t._max.createdAt]));
  const interests = firm.investors.flatMap((i) => i.interests.map((it) => ({ it, who: i, loi: i.lois.find((l) => l.projectId === it.projectId) })));

  return (
    <div className="space-y-6">
      <Link href="/admin/investors/companies" className="text-sm text-brand-600">← Companies</Link>
      <PageHeader title={firm.name} subtitle={[firm.investorType, shortPlace(firm), firm.website?.replace(/^https?:\/\//, ""), firm.aum ? `${usd(firm.aum)} AUM` : null, `${firm.investors.length} contact${firm.investors.length === 1 ? "" : "s"}`].filter(Boolean).join(" · ")} />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <section id="contacts" className="card p-5">
            <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">Contacts</h2><Link href={`/admin/investors/new?firmId=${firm.id}`} className="btn-ghost">Add a contact</Link></div>
            {!firm.investors.length && <p className="text-sm text-slate-500">Nobody at {firm.name} yet.</p>}
            <ul className="grid gap-3 sm:grid-cols-2">
              {firm.investors.map((i) => (
                <li key={i.id}>
                  <Link href={`/admin/investors/${i.id}`} className="flex gap-3 rounded-lg border border-slate-200 p-3 hover:border-brand-500">
                    <Avatar name={i.name} initials={initials(i.name)} />
                    <span className="min-w-0 text-sm">
                      <span className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">{i.name}<Badge tone={memberTone(i.stage)}>{stageLabel(INVESTOR_STAGES, i.stage)}</Badge></span>
                      {i.title && <span className="block text-xs text-slate-500">{i.title}</span>}
                      <span className="block truncate text-xs text-slate-500">{[i.email, formatPhone(i.phone ?? i.mobile)].filter(Boolean).join(" · ")}</span>
                      <span className="block text-xs text-slate-400">{lastTouch.get(i.id) ?? i.lastContactAt ? `Last touch ${ago(lastTouch.get(i.id) ?? i.lastContactAt)}` : "No touchpoints yet"}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <Section title={`Listings (${interests.length})`}>
            {!interests.length ? <p className="text-sm text-slate-500">{firm.name} isn&apos;t on a listing yet. Open a contact to link them to the listings they&apos;re interested in.</p> : (
              <div className="overflow-x-auto"><table className="w-full">
                <thead><tr><th className="th">Listing</th><th className="th">Contact</th><th className="th">CRM stage</th><th className="th">LOI</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{interests.map(({ it, who, loi }) => {
                  const st = funnelStages(pipeline, it.project.dealType);
                  return (
                    <tr key={it.id}>
                      <td className="td min-w-48"><Link href={`/admin/investors?listing=${it.projectId}`} className="text-brand-600">{it.project.title}</Link><div className="text-xs text-slate-500"><span className="font-mono">{it.project.code}</span> · {num(it.project.mw)} MW · {dealTypeLabel(it.project.dealType)}</div></td>
                      <td className="td whitespace-nowrap"><Link href={`/admin/investors/${who.id}`} className="hover:text-brand-600">{who.name}</Link></td>
                      <td className="td"><StageSelect interestId={it.id} stage={placeStage(st, it.stage)} stages={st} className="min-w-36" /></td>
                      <td className="td whitespace-nowrap text-sm">{loi ? <Badge tone={statusTone(loi.status)}>{loi.status}{loi.amount ? ` · ${usd(loi.amount)}` : ""}</Badge> : "—"}</td>
                    </tr>
                  );
                })}</tbody>
              </table></div>
            )}
          </Section>

          <Section title="Company profile">
            {hasAddress(firm) && (
              <a href={mapsHref(firm)} target="_blank" rel="noreferrer" className="mb-4 block text-sm text-slate-700 hover:text-brand-600">
                {addressLines(firm).map((l) => <span key={l} className="block">{l}</span>)}
              </a>
            )}
            <FirmForm firm={firm} action={updateFirm} />
            <form action={deleteFirm} className="mt-4 border-t border-slate-100 pt-4">
              <input type="hidden" name="id" value={firm.id} />
              <ConfirmButton message={`Delete ${firm.name}? Its ${firm.investors.length} contact(s) stay in the CRM with no company.`} className="text-xs text-red-600">Delete company</ConfirmButton>
            </form>
          </Section>
        </div>
        <Section title="Activity">
          <p className="mb-3 text-xs text-slate-500">Everything logged with {firm.name}&apos;s people. Open a contact to log a note, email, call, meeting or task.</p>
          <ActivityFeed items={activities} showContact />
        </Section>
      </div>
    </div>
  );
}
