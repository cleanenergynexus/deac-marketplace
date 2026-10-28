import Link from "next/link";
import { Badge, Empty, PageHeader, statusTone } from "@/components/ui";
import { StageSelect } from "@/components/StageSelect";
import { ProjectContactSelect } from "@/components/ProjectContactSelect";
import { loadCrm } from "@/lib/contacts-db";
import { projectContactId } from "@/lib/crm";
import { DEVELOPER_STAGES, projectPipelineStage, stageLabel } from "@/lib/constants";
import { num, usd } from "@/lib/format";
import { recommendation } from "@/lib/valuation";
import { getScoring } from "@/lib/scoring-db";

export const dynamic = "force-dynamic";

export default async function CrmProjects({ searchParams }: { searchParams: Promise<{ stage?: string; q?: string }> }) {
  const sp = await searchParams;
  const q = sp.q?.trim().toLowerCase();
  const [{ developers }, scoring] = await Promise.all([loadCrm(), getScoring()]);
  const rows = developers.flatMap((d) => d.projects.map((p) => ({ p, d, stage: projectPipelineStage(p, d.stage), contactId: projectContactId(p, d.contacts) })))
    .filter((r) => (!sp.stage || r.stage === sp.stage) && (!q || [r.p.title, r.p.code, r.d.company, ...r.d.contacts.map((c) => c.name)].some((x) => x.toLowerCase().includes(q))));

  return (
    <div>
      <PageHeader title="Projects" subtitle={`${rows.length} developer projects${sp.stage ? ` · ${stageLabel(DEVELOPER_STAGES, sp.stage)}` : ""}`} action={
        <div className="flex flex-wrap gap-2">
          <form className="flex gap-2">
            <select name="stage" defaultValue={sp.stage ?? ""} className="input w-44 py-1.5">
              <option value="">All stages</option>
              {DEVELOPER_STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <input name="q" defaultValue={sp.q} placeholder="Search project, company, contact" className="input w-60 py-1.5" />
            <button className="btn-ghost">Filter</button>
          </form>
          <Link href="/admin/projects/new" className="btn">Add a project</Link>
        </div>} />
      {!rows.length ? <Empty>No projects match.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200"><tr><th className="th">Project</th><th className="th">Company</th><th className="th">Contact</th><th className="th">CRM stage</th><th className="th">MW</th><th className="th">Raise</th><th className="th">Score</th><th className="th">Listing</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(({ p, d, stage, contactId }) => (
                <tr key={p.id}>
                  <td className="td"><Link href={`/admin/projects/${p.id}`} className="font-medium text-brand-600">{p.title}</Link><div className="font-mono text-xs text-slate-500">{p.code}</div></td>
                  <td className="td"><Link href={`/admin/developers/${d.id}`} className="hover:text-brand-600">{d.company}</Link></td>
                  <td className="td"><ProjectContactSelect projectId={p.id} contactId={contactId} contacts={d.contacts} className="min-w-36" /></td>
                  <td className="td"><StageSelect projectId={p.id} stage={stage} className="min-w-36" /></td>
                  <td className="td">{num(p.mw)}</td>
                  <td className="td">{usd(p.fundingNeeded)}</td>
                  <td className="td">{p.valueScore != null ? <Badge tone={recommendation(p.valueScore, scoring).tone}>{p.valueScore} · {recommendation(p.valueScore, scoring).label}</Badge> : <Link href={`/admin/projects/${p.id}#valuation`} className="text-xs text-brand-600">Score it</Link>}</td>
                  <td className="td"><Badge tone={statusTone(p.visibility)}>{p.visibility}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
