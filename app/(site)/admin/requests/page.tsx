import Link from "next/link";
import { db } from "@/lib/db";
import { updateAnalysisRequest } from "@/app/actions/admin";
import { Badge, PageHeader, Empty, statusTone } from "@/components/ui";
import { date } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Requests() {
  const reqs = await db.analysisRequest.findMany({ include: { investor: true, project: true }, orderBy: [{ status: "asc" }, { createdAt: "desc" }] });
  return (
    <div>
      <PageHeader title="Investor intake requests" subtitle="How each investor wants the data organized. Attach a link to the package you prepare and mark it delivered." />
      {reqs.length ? (
        <div className="space-y-4">{reqs.map((r) => (
          <div key={r.id} className="card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><Link href={`/admin/investors/${r.investorId}`} className="font-semibold text-brand-600">{r.investor.name}</Link> <span className="text-sm text-slate-500">({r.investor.firm})</span> → <Link href={`/admin/projects/${r.projectId}`} className="text-brand-600">{r.project.code}</Link></div>
              <div className="flex items-center gap-2 text-xs text-slate-500">{date(r.createdAt)} <Badge tone={statusTone(r.status)}>{r.status}</Badge></div>
            </div>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-4">
              <div><dt className="text-xs text-slate-500">Focus</dt><dd>{r.focusAreas.split(",").join(", ") || "—"}</dd></div>
              <div><dt className="text-xs text-slate-500">Metric</dt><dd>{r.returnMetric ?? "—"}</dd></div>
              <div><dt className="text-xs text-slate-500">Hold</dt><dd>{r.holdPeriod ?? "—"}</dd></div>
              <div><dt className="text-xs text-slate-500">Format</dt><dd>{r.format ?? "—"}</dd></div>
            </dl>
            {r.questions && <p className="mt-2 rounded bg-slate-50 p-2 text-sm">{r.questions}</p>}
            <form action={updateAnalysisRequest} className="mt-3 flex flex-wrap gap-2">
              <input type="hidden" name="id" value={r.id} />
              <input name="deliverableUrl" defaultValue={r.deliverableUrl ?? ""} placeholder="Link to prepared package" className="input max-w-md" />
              <select name="status" defaultValue={r.status} className="input w-40"><option value="OPEN">Open</option><option value="IN_PROGRESS">In progress</option><option value="DELIVERED">Delivered</option></select>
              <button className="btn-ghost">Update</button>
            </form>
          </div>
        ))}</div>
      ) : <Empty>No intake requests yet.</Empty>}
    </div>
  );
}
