import { placeRegion } from "@/lib/location";
import Link from "next/link";
import type { ReactNode } from "react";
import { usd, num } from "@/lib/format";
import { dealTypeLabel, isClosedDeal } from "@/lib/constants";
import { ClosedBanner } from "@/components/ClosedBanner";

type P = { id: string; code: string; title: string; mw: number; facilityType: string; fundingNeeded: number; country: string; state: string; city: string | null; dealType: string; projectStatus: string; coverImageUrl: string | null; dealStage?: string | null };

const dealTone: Record<string, string> = { LEASE: "bg-sky-600", FINANCING: "bg-emerald-600", SALE: "bg-amber-600" };

/** `corner` (e.g. a favorite star) is drawn over the bottom-right of the cover image, outside the link. */
export function ProjectTile({ p, href, hideTitle = false, corner }: { p: P; href: string; hideTitle?: boolean; corner?: ReactNode }) {
  const tile = <Tile p={p} href={href} hideTitle={hideTitle} />;
  if (!corner) return tile;
  return (
    <div className="relative flex flex-col [&>a]:flex-1">
      {tile}
      <div className="absolute right-3 top-24 z-10">{corner}</div>
    </div>
  );
}

function Tile({ p, href, hideTitle }: { p: P; href: string; hideTitle: boolean }) {
  const closed = isClosedDeal(p.dealStage);
  return (
    <Link href={href} className={`card group relative flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-md ${closed ? "bg-slate-100" : ""}`}>
      {closed && <ClosedBanner />}
      <div className={`flex flex-1 flex-col ${closed ? "opacity-60 grayscale-[70%]" : ""}`}>
      <div className="relative h-36 bg-gradient-to-br from-brand-900 via-brand-700 to-brand-500">
        {p.coverImageUrl && <img src={p.coverImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-70" />}
        <span className={`absolute left-3 top-3 rounded px-2 py-0.5 text-xs font-semibold text-white ${dealTone[p.dealType] ?? "bg-slate-600"}`}>{dealTypeLabel(p.dealType)}</span>
        <span className="absolute right-3 top-3 rounded bg-black/40 px-2 py-0.5 text-xs font-mono text-white">{p.code}</span>
        <div className="absolute bottom-3 left-3 text-4xl font-extrabold text-white drop-shadow">
          {num(p.mw, 1)}<span className="ml-1 text-lg font-semibold">MW</span>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        {!hideTitle && <div className="font-semibold leading-snug group-hover:text-brand-600">{p.title}</div>}
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
          <div><dt className="text-xs text-slate-500">Facility</dt><dd className="font-medium">{p.facilityType}</dd></div>
          <div><dt className="text-xs text-slate-500">Location</dt><dd className="font-medium">{placeRegion(p)}{p.city && !hideTitle ? ` · ${p.city}` : ""}</dd></div>
          <div><dt className="text-xs text-slate-500">Funding needed</dt><dd className="font-medium">{p.fundingNeeded ? usd(p.fundingNeeded) : "—"}</dd></div>
          <div><dt className="text-xs text-slate-500">Status</dt><dd className="font-medium">{p.projectStatus}</dd></div>
        </dl>
        {closed ? (
          <div className="mt-auto border-t border-slate-200 pt-3 text-sm font-semibold text-red-600">Closed - Sold</div>
        ) : hideTitle && <div className="mt-auto border-t border-slate-100 pt-3 text-sm font-semibold text-brand-600">🔒 Request access to view details →</div>}
      </div>
      </div>
    </Link>
  );
}
