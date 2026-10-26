import Link from "next/link";
import { db } from "@/lib/db";
import { importInvestors } from "@/app/actions/admin";
import { Badge, PageHeader, Empty } from "@/components/ui";
import { INVESTOR_STAGES, INVESTOR_TYPES, stageLabel } from "@/lib/constants";
import { usd, date } from "@/lib/format";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function Investors({ searchParams }: { searchParams: Promise<{ q?: string; stage?: string; type?: string; imported?: string }> }) {
  const sp = await searchParams;
  const where: Prisma.InvestorWhereInput = {};
  if (sp.stage) where.stage = sp.stage;
  if (sp.type) where.investorType = sp.type;
  if (sp.q) where.OR = (["name", "firm", "email", "tags"] as const).map((k) => ({ [k]: { contains: sp.q, mode: "insensitive" } }));
  const investors = await db.investor.findMany({ where, orderBy: { updatedAt: "desc" }, include: { _count: { select: { lois: true } } } });
  return (
    <div>
      <PageHeader title="Investor CRM" subtitle={`${investors.length} contacts`} action={<Link href="/admin/investors/new" className="btn">Add investor</Link>} />
      {sp.imported && <p className="mb-4 rounded bg-emerald-50 p-3 text-sm text-emerald-800">Imported {sp.imported} new contacts.</p>}
      <form className="card mb-4 flex flex-wrap gap-3 p-3">
        <input name="q" defaultValue={sp.q} placeholder="Search name, firm, email, tag" className="input max-w-xs" />
        <select name="stage" defaultValue={sp.stage ?? ""} className="input max-w-[180px]"><option value="">All stages</option>{INVESTOR_STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
        <select name="type" defaultValue={sp.type ?? ""} className="input max-w-[200px]"><option value="">All types</option>{INVESTOR_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
        <button className="btn-ghost">Filter</button>
      </form>
      {investors.length ? (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200"><tr><th className="th">Name</th><th className="th">Type</th><th className="th">Check size</th><th className="th">Markets</th><th className="th">Stage</th><th className="th">LOIs</th><th className="th">Last contact</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {investors.map((i) => (
                <tr key={i.id} className="hover:bg-slate-50">
                  <td className="td"><Link href={`/admin/investors/${i.id}`} className="font-medium text-brand-600">{i.name}</Link><div className="text-xs text-slate-500">{i.firm}</div></td>
                  <td className="td">{i.investorType ?? "—"}</td>
                  <td className="td">{i.checkMin || i.checkMax ? `${usd(i.checkMin)}–${usd(i.checkMax)}` : "—"}</td>
                  <td className="td text-xs">{i.preferredStates || "Any"}</td>
                  <td className="td"><Badge tone={i.stage === "APPLIED" ? "amber" : ["APPROVED", "ACTIVE"].includes(i.stage) ? "green" : i.stage === "DECLINED" ? "red" : "slate"}>{stageLabel(INVESTOR_STAGES, i.stage)}</Badge></td>
                  <td className="td">{i._count.lois}</td>
                  <td className="td text-xs">{date(i.lastContactAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Empty>No investors found.</Empty>}

      <details className="card mt-6 p-4">
        <summary className="cursor-pointer text-sm font-semibold">Import contacts from CSV</summary>
        <p className="mt-2 text-xs text-slate-500">Columns (any order): name, email, firm, title, phone, investorType, states, source, tags. Existing emails are skipped. Works with exports from LinkedIn Sales Navigator, Apollo, HubSpot, Mailchimp.</p>
        <form action={importInvestors} className="mt-3 flex flex-wrap items-center gap-3">
          <input type="file" name="file" accept=".csv,text/csv" className="text-sm" />
          <button className="btn-ghost">Import</button>
        </form>
      </details>
    </div>
  );
}
