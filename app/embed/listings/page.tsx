import { placeRegion } from "@/lib/location";
import { db } from "@/lib/db";
import { usd, num } from "@/lib/format";
import { dealTypeLabel, isClosedDeal } from "@/lib/constants";
import { ClosedBanner } from "@/components/ClosedBanner";

export const dynamic = "force-dynamic";

/** Public teaser grid for iframing on deacna.com. Shows no names, sponsors or economics. */
export default async function EmbedListings({ searchParams }: { searchParams: Promise<{ limit?: string }> }) {
  // ?limit=6 shows only the first few tiles (deacna.com home page); the full list lives on the marketplace.
  const limit = Number((await searchParams).limit) || undefined;
  const ps = (await db.project.findMany({ where: { visibility: "TEASER" }, orderBy: { updatedAt: "desc" } }))
    .sort((a, b) => Number(isClosedDeal(a.dealStage)) - Number(isClosedDeal(b.dealStage)))
    .slice(0, limit);
  const base = process.env.PUBLIC_APP_URL ?? "";
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {ps.map((p) => {
        const closed = isClosedDeal(p.dealStage);
        return (
        <a key={p.id} href={`${base}/`} target="_top" className={`card relative block overflow-hidden hover:shadow-md ${closed ? "bg-slate-100" : ""}`}>
          {closed && <ClosedBanner compact />}
          <div className={`p-4 ${closed ? "opacity-60 grayscale-[70%]" : ""}`}>
          <div className="flex items-center justify-between text-xs"><span className="font-mono text-slate-500">{p.code}</span><span className="rounded bg-brand-100 px-2 py-0.5 font-semibold text-brand-700">{dealTypeLabel(p.dealType)}</span></div>
          <div className="mt-2 text-3xl font-extrabold">{num(p.mw, 1)} <span className="text-base font-semibold">MW</span></div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
            <div><div className="text-xs text-slate-500">Type</div>{p.facilityType}</div>
            <div><div className="text-xs text-slate-500">Location</div>{placeRegion(p)}</div>
            <div><div className="text-xs text-slate-500">Funding</div>{p.fundingNeeded ? usd(p.fundingNeeded) : "—"}</div>
          </div>
          <div className={`mt-3 text-sm font-semibold ${closed ? "text-red-600" : "text-brand-600"}`}>{closed ? "Closed - Sold" : "View on marketplace →"}</div>
          </div>
        </a>
        );
      })}
    </div>
  );
}
