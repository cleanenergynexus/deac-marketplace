import Link from "next/link";
import { db } from "@/lib/db";
import { getScreeningTemplate } from "@/lib/screening-db";
import { DECISION_INFO, effectiveRunStatus, parseAnswers, progress, questionsFor, type Decision } from "@/lib/screening";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { date } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ScreeningList() {
  const [projects, template] = await Promise.all([
    db.project.findMany({
      select: { id: true, code: true, title: true, country: true, mw: true, createdAt: true, developer: { select: { company: true } }, screening: { select: { status: true, startedAt: true, updatedAt: true, answers: true, redFlags: true, decision: true } } },
      orderBy: { createdAt: "desc" },
    }),
    getScreeningTemplate(),
  ]);
  const rows = projects.map((p) => {
    const s = p.screening;
    const prog = s ? progress(questionsFor(template, p.country), parseAnswers(s.answers)) : null;
    return { p, s, prog, flags: s ? (JSON.parse(s.redFlags) as string[]).length : 0, running: s ? effectiveRunStatus(s.status, s.startedAt ?? s.updatedAt) === "RUNNING" : false };
  }).sort((a, b) => (b.s?.updatedAt.getTime() ?? 0) - (a.s?.updatedAt.getTime() ?? 0));

  return (
    <div>
      <PageHeader
        title="Screening"
        subtitle="Qualify each developer project before you take it to investors. Claude pre-researches the project against the screening template, flags gaps and red flags, and drafts the questions for the sponsor."
        action={<Link href="/admin/screening/template" className="btn-ghost">Edit screening template</Link>}
      />
      {!rows.length ? <Empty>No projects yet. Add one from the Developer CRM.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead><tr><th className="th">Project</th><th className="th">Sponsor</th><th className="th">Progress</th><th className="th">Open</th><th className="th">Red flags</th><th className="th">Decision</th><th className="th">Updated</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(({ p, s, prog, flags, running }) => (
                <tr key={p.id} className="text-sm">
                  <td className="td"><Link href={`/admin/projects/${p.id}/screening`} className="font-medium text-brand-600">{p.title}</Link><div className="text-xs text-slate-500">{p.code} · {p.mw} MW · {p.country}</div></td>
                  <td className="td">{p.developer.company}</td>
                  <td className="td">
                    {running ? <Badge tone="blue">AI researching…</Badge> : prog ? (
                      <div className="flex items-center gap-2"><div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-emerald-500" style={{ width: `${prog.percent}%` }} /></div><span className="text-xs text-slate-600">{prog.percent}%</span></div>
                    ) : <Link href={`/admin/projects/${p.id}/screening`} className="text-xs text-brand-600">Start screening →</Link>}
                  </td>
                  <td className="td">{prog ? prog.MISSING + prog.PARTIAL + prog.CONFLICT : "—"}</td>
                  <td className="td">{flags ? <Badge tone="red">🚩 {flags}</Badge> : "—"}</td>
                  <td className="td">{s?.decision ? <Badge tone={DECISION_INFO[s.decision as Exclude<Decision, "">].tone}>{DECISION_INFO[s.decision as Exclude<Decision, "">].label}</Badge> : "—"}</td>
                  <td className="td text-xs text-slate-500">{s ? date(s.updatedAt) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
