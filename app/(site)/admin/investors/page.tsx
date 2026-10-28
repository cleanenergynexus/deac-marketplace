import Link from "next/link";
import { addInterest } from "@/app/actions/investors";
import { AutoSubmitSelect } from "@/components/AutoSubmitSelect";
import { PipelineBoard, type BoardCard } from "@/components/PipelineBoard";
import { Badge, Empty, PageHeader, statusTone } from "@/components/ui";
import { db } from "@/lib/db";
import { DEAL_TYPES, dealTypeLabel } from "@/lib/constants";
import { ago, initials } from "@/lib/crm";
import { fitsMandate } from "@/lib/investor-crm";
import { loadInvestorCrm } from "@/lib/investor-crm-db";
import { FUNNEL_KEYS, funnelKey, pipelineLabel, placeStage } from "@/lib/pipeline";
import { getInvestorPipeline } from "@/lib/pipeline-db";
import { getScoring } from "@/lib/scoring-db";
import { num, usd } from "@/lib/format";
import { recommendation } from "@/lib/valuation";

export const dynamic = "force-dynamic";

type Search = { funnel?: string; listing?: string; stage?: string; q?: string };

/**
 * Investor CRM board. Each tile is an investor contact and their company working one listing, so the same investor
 * can be in diligence on one listing and passed on another. Funnels per deal type, like the Developer CRM.
 * Picking a listing shows only that listing's investors, plus who else fits it.
 */
export default async function InvestorBoard({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const [{ firms, investors, lastTouch, openTasks }, pipeline, scoring, listings] = await Promise.all([
    loadInvestorCrm(),
    getInvestorPipeline(),
    getScoring(),
    db.project.findMany({ select: { id: true, code: true, title: true, mw: true, state: true, city: true, dealType: true, facilityType: true, fundingNeeded: true, visibility: true, valueScore: true, developer: { select: { id: true, company: true } } }, orderBy: { code: "asc" } }),
  ]);
  const q = sp.q?.trim().toLowerCase();
  const listing = listings.find((p) => p.id === sp.listing) ?? null;
  const tiles = investors.flatMap((i) => i.interests.map((it) => ({ i, it })));
  const perFunnel = Object.fromEntries(FUNNEL_KEYS.map((k) => [k, tiles.filter((t) => funnelKey(t.it.project.dealType) === k).length]));
  // One listing picked: its deal type decides the funnel. Otherwise default to the first funnel with tiles.
  const funnel = listing ? funnelKey(listing.dealType) : sp.funnel && FUNNEL_KEYS.includes(sp.funnel) ? sp.funnel : FUNNEL_KEYS.find((k) => perFunnel[k] > 0) ?? FUNNEL_KEYS[0];
  const stages = pipeline.funnels[funnel];
  const firmName = new Map(firms.map((f) => [f.id, f.name]));
  const people = new Map<string, number>();
  for (const i of investors) if (i.firmId) people.set(i.firmId, (people.get(i.firmId) ?? 0) + 1);
  const scoreOf = new Map(listings.map((p) => [p.id, p.valueScore]));

  const cards: BoardCard[] = tiles
    .filter(({ it }) => funnelKey(it.project.dealType) === funnel && (!listing || it.projectId === listing.id))
    .map(({ i, it }) => {
      const score = scoreOf.get(it.projectId) ?? null;
      return {
        kind: "interest", id: it.id, projectId: it.projectId, stage: placeStage(stages, it.stage),
        companyId: i.firmId, company: (i.firmId && firmName.get(i.firmId)) || i.firm || "No company on file", contacts: i.firmId ? people.get(i.firmId) ?? 1 : 1,
        contact: { id: i.id, name: i.name, title: i.title, initials: initials(i.name), lastTouch: ago(lastTouch.get(i.id) ?? i.lastContactAt), openTasks: openTasks.get(i.id) ?? 0 },
        project: { title: it.project.title, code: it.project.code, mw: it.project.mw, score, scoreTone: score != null ? recommendation(score, scoring).tone : undefined, note: i.checkMin || i.checkMax ? `Check ${usd(i.checkMin)}–${usd(i.checkMax)}` : null },
      } satisfies BoardCard;
    })
    .filter((c) => (!sp.stage || c.stage === sp.stage) && (!q || [c.contact?.name, c.company, c.project?.title, c.project?.code].some((x) => x?.toLowerCase().includes(q))));

  const unlinked = investors.filter((i) => !i.interests.length).length;
  const params = (next: Partial<Search>) => {
    const p = new URLSearchParams(Object.entries({ funnel: listing ? undefined : funnel, listing: listing?.id, q: sp.q, ...next }).filter(([, v]) => v) as [string, string][]);
    return `?${p}`;
  };

  // Listing view: who is on it, and who fits it but isn't yet.
  const onListing = listing ? new Set(tiles.filter((t) => t.it.projectId === listing.id).map((t) => t.i.id)) : new Set<string>();
  const others = listing ? investors.filter((i) => !onListing.has(i.id)).sort((a, b) => Number(fitsMandate(b, listing)) - Number(fitsMandate(a, listing)) || a.name.localeCompare(b.name)) : [];
  const suggested = listing ? others.filter((i) => fitsMandate(i, listing) && i.stage !== "DECLINED").slice(0, 6) : [];
  const perStage = listing ? stages.map((s) => ({ ...s, n: tiles.filter((t) => t.it.projectId === listing.id && placeStage(stages, t.it.stage) === s.value).length })) : [];

  return (
    <div>
      <PageHeader title="Investor CRM" subtitle={`${firms.length} companies · ${investors.length} contacts · ${tiles.length} investor-listing links${sp.stage ? ` · ${pipelineLabel(stages, sp.stage)}` : ""}`} action={
        <div className="flex flex-wrap gap-2">
          <form className="flex gap-2">
            {listing ? <input type="hidden" name="listing" value={listing.id} /> : <input type="hidden" name="funnel" value={funnel} />}
            {sp.stage && <input type="hidden" name="stage" value={sp.stage} />}
            <input name="q" defaultValue={sp.q} placeholder="Search investor, company, listing" className="input w-64 py-1.5" />
          </form>
          {(sp.stage || q) && <Link href={params({ q: undefined, stage: undefined })} className="btn-ghost">Clear</Link>}
          <Link href="/admin/investors/funnels" className="btn-ghost">Edit funnels</Link>
          <Link href={`/admin/investors/new${listing ? `?projectId=${listing.id}` : ""}`} className="btn">Add investor</Link>
        </div>} />

      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <nav aria-label="Funnel" className="inline-flex rounded-lg bg-slate-100 p-1 text-sm">
          {DEAL_TYPES.map((d) => (
            <Link key={d.value} href={`?funnel=${d.value}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ""}`} aria-current={!listing && d.value === funnel ? "page" : undefined}
              className={`rounded-md px-3 py-1.5 font-medium ${d.value === funnel ? (listing ? "bg-white/60 text-slate-500" : "bg-white text-slate-900 shadow-sm") : "text-slate-500 hover:text-slate-800"}`}>
              {d.label} <span className="ml-1 text-xs text-slate-400">{perFunnel[d.value]}</span>
            </Link>
          ))}
        </nav>
        <form className="flex items-center gap-2">
          {sp.q && <input type="hidden" name="q" value={sp.q} />}
          <AutoSubmitSelect name="listing" label="Show one listing" defaultValue={listing?.id} className="w-80"
            options={[{ value: "", label: "All listings" }, ...listings.map((p) => ({ value: p.id, label: `${p.code} · ${p.title}` }))]} />
          <noscript><button className="btn-ghost">Show</button></noscript>
        </form>
        <span className="text-sm text-slate-500">{stages.length} columns · <Link href={`/admin/investors/funnels?funnel=${funnel}`} className="text-brand-600">rename or add columns</Link></span>
      </div>

      {listing && (
        <section className="card mb-4 p-4" aria-label="Listing">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/admin/projects/${listing.id}`} className="text-lg font-semibold text-slate-900 hover:text-brand-600">{listing.title}</Link>
                <Badge tone={statusTone(listing.visibility)}>{listing.visibility}</Badge>
              </div>
              <div className="text-sm text-slate-500">
                <span className="font-mono">{listing.code}</span> · {num(listing.mw)} MW {listing.facilityType} · {[listing.city, listing.state].filter(Boolean).join(", ")} · {dealTypeLabel(listing.dealType)}{listing.fundingNeeded ? ` · ${usd(listing.fundingNeeded)}` : ""} · <Link href={`/admin/developers/${listing.developer.id}`} className="text-brand-600">{listing.developer.company}</Link>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                {perStage.filter((s) => s.n).map((s) => <Link key={s.value} href={params({ stage: sp.stage === s.value ? undefined : s.value })} className={`rounded-full px-2 py-0.5 ${sp.stage === s.value ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>{s.label} {s.n}</Link>)}
                {!onListing.size && <span className="text-slate-500">No investors on this listing yet.</span>}
              </div>
            </div>
            <Link href={`?funnel=${funnel}`} className="btn-ghost">All listings</Link>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <form action={addInterest} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="projectId" value={listing.id} />
              <label className="min-w-0 flex-1 text-xs text-slate-500">Add an investor to this listing
                <select name="investorId" required defaultValue="" className="input mt-1 py-1.5">
                  <option value="" disabled>Pick an investor…</option>
                  {others.map((i) => <option key={i.id} value={i.id}>{i.name}{i.firm ? ` · ${i.firm}` : ""}{fitsMandate(i, listing) ? " ✓ fits mandate" : ""}</option>)}
                </select>
              </label>
              <label className="text-xs text-slate-500">Starting column
                <select name="stage" defaultValue={stages[0].value} className="input mt-1 w-40 py-1.5">{stages.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
              </label>
              <button className="btn">Add</button>
            </form>
            {suggested.length > 0 && (
              <div>
                <div className="mb-1 text-xs text-slate-500">Fits their mandate, not on this listing yet</div>
                <ul className="flex flex-wrap gap-2">
                  {suggested.map((i) => (
                    <li key={i.id}>
                      <form action={addInterest} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white py-0.5 pl-3 pr-1 text-xs">
                        <input type="hidden" name="projectId" value={listing.id} />
                        <input type="hidden" name="investorId" value={i.id} />
                        <Link href={`/admin/investors/${i.id}`} className="font-medium text-slate-800 hover:text-brand-600">{i.name}</Link>
                        <span className="text-slate-400">{i.firm}</span>
                        <button className="rounded-full bg-brand-50 px-2 py-0.5 font-medium text-brand-700 hover:bg-brand-100" aria-label={`Add ${i.name} to ${listing.code}`}>+ Add</button>
                      </form>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      {!investors.length ? <Empty>No investors yet. <Link href="/admin/investors/new" className="text-brand-600">Add one</Link> or import a CSV on the Contacts page.</Empty> : (
        <>
          <p className="mb-3 text-sm text-slate-500">
            Each tile is an investor and their company working one listing. Listings show in the funnel for their deal type; pick a listing above to see only its investors. Drag a tile to another column or pick a stage on it.
            {unlinked > 0 && <> {" "}<Link href="/admin/investors/contacts?linked=none" className="text-brand-600">{unlinked} investor{unlinked === 1 ? " isn't" : "s aren't"} on a listing yet.</Link></>}
          </p>
          {!cards.length && !q && !sp.stage
            ? <Empty>{listing ? "Add investors to this listing above, or they appear here when they sign its NDA or send an LOI." : `No investors on ${dealTypeLabel(funnel).toLowerCase()} listings yet. Link investors to a listing from their record or from a listing view.`}</Empty>
            : <PipelineBoard key={`${funnel}:${listing?.id ?? ""}`} cards={cards} stages={stages} />}
        </>
      )}
    </div>
  );
}
