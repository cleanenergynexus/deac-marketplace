import { db } from "@/lib/db";
import { usd, num } from "@/lib/format";
import { dealTypeLabel } from "@/lib/constants";

export const dynamic = "force-dynamic";

/** Public teaser grid for iframing on deacna.com. Shows no names, sponsors or economics. */
export default async function EmbedListings() {
  const ps = await db.project.findMany({ where: { visibility: "TEASER" }, orderBy: { updatedAt: "desc" } });
  const base = process.env.PUBLIC_APP_URL ?? "";
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {ps.map((p) => (
        <a key={p.id} href={`${base}/apply`} target="_top" className="card block p-4 hover:shadow-md">
          <div className="flex items-center justify-between text-xs"><span className="font-mono text-slate-500">{p.code}</span><span className="rounded bg-brand-100 px-2 py-0.5 font-semibold text-brand-700">{dealTypeLabel(p.dealType)}</span></div>
          <div className="mt-2 text-3xl font-extrabold">{num(p.mw, 1)} <span className="text-base font-semibold">MW</span></div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
            <div><div className="text-xs text-slate-500">Type</div>{p.facilityType}</div>
            <div><div className="text-xs text-slate-500">State</div>{p.state}</div>
            <div><div className="text-xs text-slate-500">Funding</div>{p.fundingNeeded ? usd(p.fundingNeeded) : "—"}</div>
          </div>
          <div className="mt-3 text-sm font-semibold text-brand-600">Request access →</div>
        </a>
      ))}
    </div>
  );
}
