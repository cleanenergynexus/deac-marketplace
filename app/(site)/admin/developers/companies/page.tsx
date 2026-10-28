import Link from "next/link";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { loadCrm } from "@/lib/contacts-db";
import { ago } from "@/lib/crm";
import { allStages, pipelineLabel, projectStageLabel } from "@/lib/pipeline";
import { getPipeline } from "@/lib/pipeline-db";
import { num, usd } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Companies({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  const q = sp.q?.trim().toLowerCase();
  const [{ developers, lastTouch }, pipeline] = await Promise.all([loadCrm(), getPipeline()]);
  const rows = developers.filter((d) => !q || [d.company, d.hq, ...d.contacts.map((c) => c.name)].some((x) => x?.toLowerCase().includes(q)));

  return (
    <div>
      <PageHeader title="Companies" subtitle={`${rows.length} development companies`} action={
        <div className="flex gap-2">
          <form><input name="q" defaultValue={sp.q} placeholder="Search company, HQ, contact" className="input w-64 py-1.5" /></form>
          <Link href="/admin/developers/new" className="btn">Add company</Link>
        </div>} />
      {!rows.length ? <Empty>{q ? "No companies match." : "No companies yet."}</Empty> : (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200"><tr><th className="th">Company</th><th className="th">Primary contact</th><th className="th">Contacts</th><th className="th">Projects & stages</th><th className="th">MW</th><th className="th">Raise</th><th className="th">Last touch</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((d) => {
                const primary = d.contacts[0];
                const last = d.contacts.map((c) => lastTouch.get(c.id)).filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0];
                return (
                  <tr key={d.id}>
                    <td className="td align-top"><Link href={`/admin/developers/${d.id}`} className="font-medium text-brand-600">{d.company}</Link>{d.hq && <div className="text-xs text-slate-500">{d.hq}</div>}</td>
                    <td className="td align-top">{primary ? <Link href={`/admin/developers/contacts/${primary.id}`} className="hover:text-brand-600">{primary.name}</Link> : "—"}{primary?.title && <div className="text-xs text-slate-500">{primary.title}</div>}</td>
                    <td className="td align-top">{d.contacts.length}</td>
                    <td className="td">
                      {d.projects.length ? (
                        <ul className="space-y-1">{d.projects.map((p) => (
                          <li key={p.id} className="flex items-center gap-2 text-sm"><Link href={`/admin/projects/${p.id}`} className="text-slate-700 hover:text-brand-600">{p.title}</Link><Badge>{projectStageLabel(pipeline, p, d.stage)}</Badge></li>
                        ))}</ul>
                      ) : <span className="text-sm text-slate-500">No projects · <Badge>{pipelineLabel(allStages(pipeline), d.stage)}</Badge></span>}
                    </td>
                    <td className="td align-top">{num(d.projects.reduce((a, p) => a + p.mw, 0))}</td>
                    <td className="td align-top">{usd(d.projects.reduce((a, p) => a + p.fundingNeeded, 0))}</td>
                    <td className="td align-top text-xs text-slate-600">{ago(last) ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
