import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { setInvestorStage, updateInvestor } from "@/app/actions/admin";
import { InvestorForm } from "@/components/InvestorForm";
import { Timeline } from "@/components/Timeline";
import { Badge, PageHeader, Section, statusTone } from "@/components/ui";
import { INVESTOR_STAGES, stageLabel } from "@/lib/constants";
import { usd, csv } from "@/lib/format";
import { marketMatches } from "@/lib/regions";

export const dynamic = "force-dynamic";

export default async function InvestorDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inv = await db.investor.findUnique({ where: { id }, include: { user: true, lois: { include: { project: true } }, activities: { orderBy: { createdAt: "desc" } }, analysisRequests: { include: { project: true } } } });
  if (!inv) notFound();
  // Suggested matches: listings fitting this investor's mandate.
  const states = csv(inv.preferredStates), regions = csv(inv.preferredRegions), deals = csv(inv.dealTypes), types = csv(inv.facilityTypes);
  const matches = (await db.project.findMany({ where: { visibility: { not: "DRAFT" } } })).filter(
    (p) => marketMatches(states, regions, p.state) && (!deals.length || deals.includes(p.dealType)) && (!types.length || types.includes(p.facilityType)) && (inv.mwMin == null || p.mw >= inv.mwMin) && (inv.mwMax == null || p.mw <= inv.mwMax),
  );
  return (
    <div className="space-y-6">
      <Link href="/admin/investors" className="text-sm text-brand-600">← Investor CRM</Link>
      <PageHeader
        title={inv.name}
        subtitle={<>{inv.firm} · {inv.email} · Login: {inv.user ? <Badge tone={statusTone(inv.user.status)}>{inv.user.status}</Badge> : "none"}</>}
        action={
          <form action={setInvestorStage} className="flex items-center gap-2">
            <input type="hidden" name="id" value={inv.id} />
            <select name="stage" defaultValue={inv.stage} className="input w-48">{INVESTOR_STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
            <button className="btn">Update stage</button>
          </form>
        }
      />
      {inv.stage === "APPLIED" && (
        <div className="flex items-center justify-between rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
          <span>This investor applied for membership. Approving grants access to the private portfolio.</span>
          <span className="flex gap-2">
            <form action={setInvestorStage}><input type="hidden" name="id" value={inv.id} /><input type="hidden" name="stage" value="APPROVED" /><button className="btn">Approve</button></form>
            <form action={setInvestorStage}><input type="hidden" name="id" value={inv.id} /><input type="hidden" name="stage" value="DECLINED" /><button className="btn-danger">Decline</button></form>
          </span>
        </div>
      )}
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Section title="Profile"><InvestorForm inv={inv} action={updateInvestor} /></Section>
        </div>
        <div className="space-y-6">
          <Section title={`Matching listings (${matches.length})`}>
            <ul className="space-y-1 text-sm">{matches.map((p) => <li key={p.id}><Link href={`/admin/projects/${p.id}`} className="text-brand-600">{p.code}</Link> · {p.mw} MW {p.facilityType}, {p.state}</li>)}</ul>
          </Section>
          <Section title="LOIs">
            <ul className="space-y-2 text-sm">{inv.lois.map((l) => <li key={l.id} className="flex justify-between"><span>{l.project.code} · {usd(l.amount)}</span><Badge tone={statusTone(l.status)}>{l.status}</Badge></li>)}</ul>
          </Section>
          <Section title="Intake requests">
            <ul className="space-y-2 text-sm">{inv.analysisRequests.map((r) => <li key={r.id} className="flex justify-between"><span>{r.project.code} · {r.format}</span><Badge tone={statusTone(r.status)}>{r.status}</Badge></li>)}</ul>
          </Section>
          <Section title="Activity"><Timeline items={inv.activities} investorId={inv.id} /></Section>
        </div>
      </div>
      <p className="text-xs text-slate-400">Stage: {stageLabel(INVESTOR_STAGES, inv.stage)}</p>
    </div>
  );
}
