import Link from "next/link";
import { importInvestors } from "@/app/actions/admin";
import { Avatar } from "@/components/CrmIcons";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { INVESTOR_STAGES, INVESTOR_TYPES, stageLabel } from "@/lib/constants";
import { ago, initials } from "@/lib/crm";
import { loadInvestorCrm } from "@/lib/investor-crm-db";
import { memberTone } from "@/lib/investor-crm";
import { funnelStages, pipelineLabel, placeStage } from "@/lib/pipeline";
import { getInvestorPipeline } from "@/lib/pipeline-db";
import { formatPhone } from "@/lib/phone";
import { shortPlace } from "@/lib/address";
import { usd } from "@/lib/format";

export const dynamic = "force-dynamic";

type Search = { q?: string; stage?: string; type?: string; linked?: string; imported?: string };

/** Every investor contact: company, listings they're working and where, membership, last touch and tasks. */
export default async function InvestorContacts({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const q = sp.q?.trim().toLowerCase();
  const [{ firms, investors, lastTouch, openTasks }, pipeline] = await Promise.all([loadInvestorCrm(), getInvestorPipeline()]);
  const firmName = new Map(firms.map((f) => [f.id, f.name]));
  const rows = investors
    .filter((i) => (!sp.stage || i.stage === sp.stage) && (!sp.type || i.investorType === sp.type) && (sp.linked !== "none" || !i.interests.length))
    .filter((i) => !q || [i.name, i.email, i.title, i.firm, i.tags, i.city].some((x) => x?.toLowerCase().includes(q)))
    .sort((a, b) => ((lastTouch.get(b.id) ?? b.lastContactAt)?.getTime() ?? 0) - ((lastTouch.get(a.id) ?? a.lastContactAt)?.getTime() ?? 0) || a.name.localeCompare(b.name));

  return (
    <div>
      <PageHeader title="Contacts" subtitle={`${rows.length} investor contacts${sp.linked === "none" ? " not on a listing yet" : ""}`} action={<Link href="/admin/investors/new" className="btn">Add investor</Link>} />
      {sp.imported && <p className="mb-4 rounded bg-emerald-50 p-3 text-sm text-emerald-800">Imported {sp.imported} new contacts.</p>}
      <form className="card mb-4 flex flex-wrap gap-3 p-3">
        <input name="q" defaultValue={sp.q} placeholder="Search name, company, email, tag" className="input max-w-xs" />
        <select name="stage" defaultValue={sp.stage ?? ""} className="input max-w-[180px]"><option value="">All memberships</option>{INVESTOR_STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
        <select name="type" defaultValue={sp.type ?? ""} className="input max-w-[200px]"><option value="">All types</option>{INVESTOR_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
        <select name="linked" defaultValue={sp.linked ?? ""} className="input max-w-[200px]"><option value="">On a listing or not</option><option value="none">Not on a listing yet</option></select>
        <button className="btn-ghost">Filter</button>
        {(q || sp.stage || sp.type || sp.linked) && <Link href="/admin/investors/contacts" className="btn-ghost">Clear</Link>}
      </form>
      {rows.length ? (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200"><tr><th className="th">Contact</th><th className="th">Company</th><th className="th">Email / phone</th><th className="th">Listings</th><th className="th">Check size</th><th className="th">Membership</th><th className="th">Last touch</th><th className="th">Tasks</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((i) => (
                <tr key={i.id} className="align-top">
                  <td className="td">
                    <Link href={`/admin/investors/${i.id}`} className="flex items-center gap-2">
                      <Avatar name={i.name} initials={initials(i.name)} size="sm" />
                      <span><span className="block whitespace-nowrap font-medium text-brand-600">{i.name}</span>{i.title && <span className="block text-xs text-slate-500">{i.title}</span>}{shortPlace(i) && <span className="block text-xs text-slate-400">{shortPlace(i)}</span>}</span>
                    </Link>
                  </td>
                  <td className="td">{i.firmId ? <Link href={`/admin/investors/companies/${i.firmId}`} className="hover:text-brand-600">{firmName.get(i.firmId) ?? i.firm}</Link> : <span className="text-slate-400">—</span>}{i.investorType && <div className="text-xs text-slate-500">{i.investorType}</div>}</td>
                  <td className="td text-xs"><a href={`mailto:${i.email}`} className="block text-brand-600">{i.email}</a><span className="whitespace-nowrap text-slate-500">{formatPhone(i.phone ?? i.mobile)}</span></td>
                  <td className="td">
                    <ul className="space-y-0.5 text-xs">{i.interests.map((it) => {
                      const st = funnelStages(pipeline, it.project.dealType);
                      return <li key={it.id} className="whitespace-nowrap"><Link href={`/admin/investors?listing=${it.projectId}`} className="font-mono text-slate-700 hover:text-brand-600" title={it.project.title}>{it.project.code}</Link> <span className="text-slate-500">· {pipelineLabel(st, placeStage(st, it.stage))}</span></li>;
                    })}</ul>
                    {!i.interests.length && <span className="text-xs text-slate-400">—</span>}
                  </td>
                  <td className="td whitespace-nowrap text-sm">{i.checkMin || i.checkMax ? `${usd(i.checkMin)}–${usd(i.checkMax)}` : "—"}</td>
                  <td className="td"><Badge tone={memberTone(i.stage)}>{stageLabel(INVESTOR_STAGES, i.stage)}</Badge>{i.user && <div className="mt-0.5 text-[11px] text-slate-500">Login {i.user.status.toLowerCase()}</div>}</td>
                  <td className="td whitespace-nowrap text-xs text-slate-600">{ago(lastTouch.get(i.id) ?? i.lastContactAt) ?? "—"}</td>
                  <td className="td">{openTasks.get(i.id) ? <Link href={`/admin/investors/${i.id}?tab=tasks`}><Badge tone="amber">{openTasks.get(i.id)} open</Badge></Link> : <span className="text-xs text-slate-400">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Empty>{q || sp.stage || sp.type || sp.linked ? "No investors match." : "No investors yet."}</Empty>}

      <details className="card mt-6 p-4">
        <summary className="cursor-pointer text-sm font-semibold">Import contacts from CSV</summary>
        <p className="mt-2 text-xs text-slate-500">Columns (any order): name, email, firm, title, phone, investorType, states, source, tags. Existing emails are skipped; each firm becomes (or joins) a company. Works with exports from LinkedIn Sales Navigator, Apollo, HubSpot, Mailchimp.</p>
        <form action={importInvestors} className="mt-3 flex flex-wrap items-center gap-3">
          <input type="file" name="file" accept=".csv,text/csv" className="text-sm" />
          <button className="btn-ghost">Import</button>
        </form>
      </details>
    </div>
  );
}
