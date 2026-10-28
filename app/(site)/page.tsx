import Link from "next/link";
import { db } from "@/lib/db";
import { ProjectTile } from "@/components/ProjectTile";
import { usd, num } from "@/lib/format";
import { isClosedDeal } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function Home() {
  // Open teasers first; closed ones only fill leftover slots, at the end.
  const teasers = (await db.project.findMany({ where: { visibility: "TEASER" }, orderBy: { updatedAt: "desc" } }))
    .sort((a, b) => Number(isClosedDeal(a.dealStage)) - Number(isClosedDeal(b.dealStage)))
    .slice(0, 6);
  const agg = await db.project.aggregate({ where: { visibility: { in: ["TEASER", "PRIVATE"] }, dealStage: { not: "CLOSED" } }, _sum: { mw: true, fundingNeeded: true }, _count: true });
  return (
    <div className="space-y-14">
      <section className="overflow-hidden rounded-2xl bg-brand-900 px-8 py-14 text-white">
        <p className="text-sm font-semibold uppercase tracking-widest text-brand-100">Private investor network</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-extrabold leading-tight md:text-5xl">Curated data center opportunities for lease, financing and sale.</h1>
        <p className="mt-4 max-w-2xl text-slate-300">DEAC sources and screens powered land, shells and operating facilities from vetted developers, then presents them to a selected network of qualified investors.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/apply" className="btn bg-white text-brand-900 hover:bg-slate-100">Request investor access</Link>
          <Link href="/developers/submit" className="btn-ghost border-white/30 bg-transparent text-white hover:bg-white/10">Submit a project</Link>
        </div>
        <div className="mt-10 grid max-w-xl grid-cols-3 gap-6 text-center">
          <div><div className="text-3xl font-bold">{agg._count}</div><div className="text-xs text-slate-400">Active opportunities</div></div>
          <div><div className="text-3xl font-bold">{num(agg._sum.mw)}</div><div className="text-xs text-slate-400">Total MW</div></div>
          <div><div className="text-3xl font-bold">{usd(agg._sum.fundingNeeded)}</div><div className="text-xs text-slate-400">Capital sought</div></div>
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-xl font-bold">Featured opportunities</h2>
        <p className="mb-5 text-sm text-slate-600">Live opportunities from the DEAC portfolio. Project names, sponsors and economics are visible to approved members only. Already a member? <Link href="/login" className="text-brand-600">Sign in</Link>.</p>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {teasers.map((p) => <ProjectTile key={p.id} p={p} href="/apply" hideTitle />)}
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-3">
        {[
          ["1. Apply", "Tell us about your mandate: check size, markets, deal types. Our team reviews every application."],
          ["2. Review opportunities", "Approved members see full listings: sponsor, team bios, economics, status and summary documents."],
          ["3. Submit an LOI", "Issue a letter of interest to unlock the full data room, and tell us how you want the data packaged for your analysis."],
        ].map(([t, d]) => (
          <div key={t} className="card p-6"><h3 className="font-semibold">{t}</h3><p className="mt-2 text-sm text-slate-600">{d}</p></div>
        ))}
      </section>
    </div>
  );
}
