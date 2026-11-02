import { placeFull } from "@/lib/location";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { db } from "@/lib/db";
import { listingAccess, requireMember } from "@/lib/auth";
import { requestDiligence, submitAnalysisRequest, submitLoi, submitNda } from "@/app/actions/member";
import { ActionForm } from "@/components/ActionForm";
import { Checks } from "@/components/Checks";
import { Blurred, DealProgress } from "@/components/DealProgress";
import { Badge, Field, statusTone } from "@/components/ui";
import { DEAL_STAGES, dealStageIndex, dealTypeLabel, isClosedDeal, FOCUS_AREAS, parseUseOfFunds } from "@/lib/constants";
import { atLeast, docStage, isStage, nextStep, parseDisclosure, STAGES, STAGE_INFO, stageRank, type Stage, type StepStatus } from "@/lib/disclosure";
import { usd, num, date } from "@/lib/format";
import { MoneyInput } from "@/components/MoneyInput";
import { FavoriteButton } from "@/components/FavoriteButton";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "sponsor", label: "Sponsor" },
  { key: "economics", label: "Economics" },
  { key: "documents", label: "Documents" },
  { key: "loi", label: "Letter of Interest" },
] as const;
type TabKey = (typeof TABS)[number]["key"];
// Links from before the tabs were renamed.
const OLD_TABS: Record<string, TabKey> = { site: "economics", financials: "economics", intake: "documents" };

const DOC_BADGE: Record<Stage, { label: string; cls: string }> = {
  TEASER: { label: "Open", cls: "border-emerald-500 text-emerald-700" },
  NDA: { label: "After NDA", cls: "border-amber-500 text-amber-700" },
  LOI: { label: "After LOI", cls: "border-red-400 text-red-600" },
  DILIGENCE: { label: "Full data room", cls: "border-violet-400 text-violet-700" },
};

const minStage = (...s: Stage[]) => s.reduce((a, b) => (stageRank(b) < stageRank(a) ? b : a));

function Facts({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k} className="border-b border-slate-200 py-3">
          <dt className="text-xs uppercase tracking-wide text-slate-500">{k}</dt>
          <dd className="mt-1 text-lg">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
const H = ({ children }: { children: ReactNode }) => <h3 className="mt-6 text-sm font-bold uppercase tracking-wide text-slate-600 first:mt-0">{children}</h3>;

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; as?: string }> }) {
  const u = await requireMember();
  const { id } = await params;
  const sp = await searchParams;
  const p = await db.project.findUnique({ where: { id }, include: { developer: { include: { team: { orderBy: { sortOrder: "asc" } } } }, documents: { orderBy: [{ category: "asc" }, { name: "asc" }] } } });
  if (!p || (p.visibility === "DRAFT" && u.role !== "ADMIN")) notFound();

  const isAdmin = u.role === "ADMIN";
  const isAgent = u.role === "AGENT";
  const access = await listingAccess(id, u);
  const originated = "originated" in access && !!access.originated;
  // Admins can preview the listing as an investor at any stage.
  const asStage = isAdmin && isStage(sp.as) ? sp.as : null;
  const stage: Stage = asStage ?? access.stage;
  const can = (need: Stage) => atLeast(stage, need);
  const show = parseDisclosure(p.disclosure);
  const tab: TabKey = TABS.some((t) => t.key === sp.tab) ? (sp.tab as TabKey) : OLD_TABS[sp.tab ?? ""] ?? "overview";
  const tabNeeds: Record<TabKey, Stage> = { overview: "TEASER", sponsor: show.sponsor, economics: minStage(show.power, show.returns, show.capital), documents: "TEASER", loi: "TEASER" };
  const href = (t: TabKey) => `/marketplace/${p.id}?tab=${t}${asStage ? `&as=${asStage}` : ""}`;
  const unlockHref = href("loi");

  const status = { nda: access.nda?.status as StepStatus | undefined, loi: access.loi?.status as StepStatus | undefined, diligence: access.diligence?.status as StepStatus | undefined };
  const next = nextStep(stage, status);
  const favorite = u.investorId ? !!(await db.favorite.findUnique({ where: { investorId_projectId: { investorId: u.investorId, projectId: id } } })) : false;
  const requests = u.investorId && tab === "documents" ? await db.analysisRequest.findMany({ where: { projectId: id, investorId: u.investorId }, orderBy: { createdAt: "desc" } }) : [];

  const docs = p.documents.map((d) => ({ ...d, stage: docStage(d.access) })).sort((a, b) => stageRank(a.stage) - stageRank(b.stage));
  const location = placeFull(p);
  const dealIdx = dealStageIndex(p.dealStage);
  const funds = parseUseOfFunds(p.useOfFunds);

  let body: ReactNode;
  if (tab === "overview") {
    body = (
      <div className="space-y-6">
        {can(show.overview) ? (
          <>
            <p className="whitespace-pre-line leading-relaxed text-slate-700">{p.summary}</p>
            {p.highlights && <ul className="list-disc space-y-1 pl-5 text-sm">{p.highlights.split("\n").filter(Boolean).map((h, i) => <li key={i}>{h}</li>)}</ul>}
          </>
        ) : <Blurred need={show.overview} what="The project summary and highlights" labels={["Summary", "Highlights"]} href={unlockHref} />}
        <ol className="flex flex-wrap items-center gap-2 text-sm">
          {DEAL_STAGES.map((s, i) => (
            <li key={s.value} className="flex items-center gap-2">
              {i > 0 && <span className="text-slate-300">→</span>}
              <span className={`rounded-full border px-3 py-1 ${i < dealIdx ? "border-brand-500 text-brand-700" : i === dealIdx ? "border-brand-600 bg-brand-50 font-semibold text-brand-700" : "border-slate-200 text-slate-400"}`}>{s.label}</span>
            </li>
          ))}
        </ol>
        <div>
          <H>Use of funds</H>
          <Facts items={[...funds, ["Capacity", `${num(p.mw, 1)} MW`], ...(funds.length ? [] : [["Funding needed", p.fundingNeeded ? usd(p.fundingNeeded) : "—"]] as [string, string][])]} />
        </div>
      </div>
    );
  } else if (tab === "sponsor") {
    const lead = p.developer.team[0];
    body = can(show.sponsor) ? (
      <div className="space-y-5">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-lg font-semibold text-brand-700">{(lead?.name ?? p.developer.company).split(" ").map((x) => x[0]).join("").slice(0, 2)}</div>
          <div>
            <div className="text-lg font-semibold">{lead?.name ?? p.developer.company}</div>
            <div className="text-sm text-slate-500">{lead ? `${lead.title}, ${p.developer.company}` : p.developer.hq}</div>
          </div>
        </div>
        {p.developer.experience && <p className="whitespace-pre-line leading-relaxed text-slate-700">{p.developer.experience}</p>}
        <div>
          <H>Track record</H>
          <Facts items={[["Total capacity delivered", p.developer.mwDelivered ? `${num(p.developer.mwDelivered)} MW` : "—"], ["Headquarters", p.developer.hq ?? "—"]]} />
        </div>
        {p.developer.team.length > 1 && (
          <div>
            <H>Team</H>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {p.developer.team.map((m) => (
                <div key={m.id} className="rounded-lg border border-slate-200 p-4">
                  <div className="font-semibold">{m.name}</div><div className="text-xs text-slate-500">{m.title}</div>
                  <p className="mt-2 text-sm text-slate-600">{m.bio}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    ) : <Blurred need={show.sponsor} what="Sponsor identity, track record and team" labels={["Sponsor", "Title", "Projects completed", "Total capacity delivered", "Capital raised to date", "Headquarters"]} href={unlockHref} />;
  } else if (tab === "economics") {
    body = (
      <div>
        <H>Power & schedule</H>
        {can(show.power) ? (
          <Facts items={[["Power status", p.powerStatus ?? "—"], ["Power rate", p.powerRateCents != null ? `${p.powerRateCents}¢/kWh` : "—"], ["Months to power", p.monthsToPower != null ? String(p.monthsToPower) : "—"], ["Target COD", p.codDate ?? "—"]]} />
        ) : <Blurred need={show.power} what="Power and schedule details" labels={["Power status", "Power rate", "Months to power", "Target COD"]} href={unlockHref} />}
        <H>Returns</H>
        {can(show.returns) ? (
          <Facts items={[["Total capex", usd(p.totalCapex)], ["Target IRR", p.targetIrr != null ? `${p.targetIrr}%` : "—"], ["Equity multiple", p.equityMultiple != null ? `${p.equityMultiple}x` : "—"], ["Lease rate", p.leaseRateKwMo != null ? `$${p.leaseRateKwMo}/kW/mo` : "—"]]} />
        ) : <Blurred need={show.returns} what="Full returns" labels={["Total capex", "Target IRR", "Equity multiple", "Lease rate"]} href={unlockHref} />}
        <H>Capital stack</H>
        {can(show.capital) ? (
          p.capitalStack || p.economicsNotes ? (
            <div className="mt-3 space-y-2 text-sm">
              {p.capitalStack && <p className="whitespace-pre-line">{p.capitalStack}</p>}
              {p.economicsNotes && <p className="whitespace-pre-line text-slate-600">{p.economicsNotes}</p>}
            </div>
          ) : <p className="mt-3 text-sm text-slate-500">Capital stack details will be posted shortly.</p>
        ) : <Blurred need={show.capital} what="The capital stack" labels={["Senior debt", "Equity / mezzanine", "Sponsor equity", "Notes"]} href={unlockHref} />}
      </div>
    );
  } else if (tab === "documents") {
    body = (
      <div className="space-y-8">
        <div>
          <p className="text-slate-700">Documents are released in tiers as you move through the NDA, letter of interest and full diligence. Each one opens here as soon as its tier is unlocked.</p>
          {docs.length ? (
            <ul className="mt-3 divide-y divide-slate-200 border-b border-slate-200">
              {docs.map((d) => {
                const open = can(d.stage);
                return (
                  <li key={d.id} className="flex items-center justify-between gap-4 py-3">
                    <span>{open && d.url && d.url !== "#" ? <a href={d.url} target="_blank" rel="noreferrer" className="font-medium text-brand-600 hover:underline">{d.name}</a> : <span className="text-slate-700">{d.name}</span>}{d.category !== "Other" && <span className="ml-2 text-xs text-slate-400">{d.category}</span>}{open && (!d.url || d.url === "#") && <span className="ml-2 text-xs text-slate-400">· being uploaded</span>}</span>
                    <span className="flex items-center gap-3">
                      {open && d.stage !== "TEASER" && <span className="text-xs text-emerald-600">Unlocked</span>}
                      <span className={`whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${DOC_BADGE[d.stage].cls}`}>{open ? "" : "🔒 "}{DOC_BADGE[d.stage].label}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : <p className="mt-3 text-sm text-slate-500">Documents are being uploaded.</p>}
        </div>
        <div className="rounded-lg bg-slate-50 p-5">
          <h3 className="font-semibold">Need the materials packaged for your analysis?</h3>
          <p className="mb-3 text-sm text-slate-600">Tell us how you underwrite and we&apos;ll organize the data room for you.</p>
          {requests.map((r) => (
            <div key={r.id} className="mb-3 rounded border border-slate-200 bg-white p-2 text-xs">
              <Badge tone={statusTone(r.status)}>{r.status}</Badge> <span className="ml-1">{r.focusAreas.split(",").join(", ")}</span>
              {r.deliverableUrl && <a href={r.deliverableUrl} target="_blank" rel="noreferrer" className="mt-1 block text-brand-600">Download package</a>}
            </div>
          ))}
          {u.investorId ? (
            <details>
              <summary className="cursor-pointer text-sm font-semibold text-brand-600">Request an analysis package</summary>
              <ActionForm action={submitAnalysisRequest} submitLabel="Submit request" success="Got it. Our team will organize the materials for you." className="mt-3 grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="projectId" value={p.id} />
                <Field label="Focus areas" group className="sm:col-span-2"><Checks name="focusAreas" options={FOCUS_AREAS} /></Field>
                <Field label="Key return metric"><select name="returnMetric" className="input"><option>Levered IRR</option><option>Unlevered IRR</option><option>Cash-on-cash yield</option><option>Cap rate / NOI</option><option>DSCR</option><option>Equity multiple</option></select></Field>
                <Field label="Hold period"><input name="holdPeriod" className="input" placeholder="e.g. 5–7 years" /></Field>
                <Field label="Preferred format"><select name="format" className="input"><option>Excel model</option><option>PDF investment memo</option><option>Data tape (CSV)</option><option>Call with sponsor</option></select></Field>
                <Field label="Specific questions" className="sm:col-span-2"><textarea name="questions" rows={3} className="input" /></Field>
              </ActionForm>
            </details>
          ) : <p className="text-sm text-slate-500">Investors fill this in.</p>}
        </div>
      </div>
    );
  } else {
    body = (
      <div className="space-y-6">
        <DealProgress stage={stage} pending={next.status === "PENDING" ? next.step : null} />
        <div className="border-t border-slate-200 pt-5">
          {isAgent ? (
            <p className="text-sm text-slate-600">{originated
              ? "You originated this listing, so you see all of it. Investors move through NDA, letter of interest and diligence here; your DEAC partner keeps you posted."
              : "As a referral agent you see this listing at the Teaser level. Your DEAC partner can share more with you or your investors."}</p>
          ) : <NextStep projectId={p.id} ndaUrl={p.ndaUrl} next={next} isInvestor={!!u.investorId} preview={isAdmin} access={access} />}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link href="/marketplace" className="text-sm text-brand-600">← All opportunities</Link>
      {isAdmin && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-900">
          <span className="font-semibold">Preview as an investor at</span>
          {STAGES.map((s) => (
            <Link key={s} href={`/marketplace/${p.id}?tab=${tab}&as=${s}`} scroll={false} className={`rounded-full px-3 py-0.5 ${asStage === s ? "bg-amber-600 text-white" : "bg-white hover:bg-amber-100"}`}>{STAGE_INFO[s].step}</Link>
          ))}
          <Link href={`/marketplace/${p.id}?tab=${tab}`} scroll={false} className={`rounded-full px-3 py-0.5 ${!asStage ? "bg-amber-600 text-white" : "bg-white hover:bg-amber-100"}`}>Everything</Link>
          <Link href={`/admin/projects/${p.id}#disclosure`} className="ml-auto text-amber-800 underline">Edit what each stage shows</Link>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="relative bg-gradient-to-br from-brand-900 to-brand-600 p-8 text-white">
          {u.investorId && !isClosedDeal(p.dealStage) && <FavoriteButton projectId={p.id} initial={favorite} variant="button" className="absolute right-6 top-6" />}
          {isAdmin && <Link href={`/admin/projects/${p.id}`} className="absolute right-6 top-6 rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-brand-900 shadow hover:bg-brand-50">✎ Edit Listing</Link>}
          <div className="flex flex-wrap items-center gap-2 pr-48 text-xs">
            <span className="rounded-full border border-white/30 px-2.5 py-0.5 font-semibold uppercase tracking-wide">{dealTypeLabel(p.dealType)}</span>
            <span className="rounded bg-white/15 px-2 py-0.5 font-mono">{p.code}</span>
            {isClosedDeal(p.dealStage) && <span className="rounded bg-red-600 px-2.5 py-0.5 font-black uppercase tracking-widest text-white shadow">Closed - Sold</span>}
            <span className="rounded bg-emerald-500/30 px-2 py-0.5">{isAdmin && !asStage ? "DEAC team view" : originated ? "Your listing: full access" : `Your access: ${STAGE_INFO[stage].label}`}</span>
          </div>
          <h1 className="mt-3 text-3xl font-bold">{p.title}</h1>
          <p className="mt-1 text-slate-200">{[location, p.facilityType].filter(Boolean).join(" · ")}</p>
          <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-4">
            {([["Amount", p.fundingNeeded ? usd(p.fundingNeeded) : "—"], ["Type", dealTypeLabel(p.dealType)], ["Capacity", `${num(p.mw, 1)} MW`], ["Term", p.term || "—"], ["Status", DEAL_STAGES[dealIdx].status]] as const).map(([k, v]) => (
              <div key={k}><dt className="text-xs uppercase tracking-wide text-slate-300">{k}</dt><dd className="mt-0.5 text-xl font-bold">{v}</dd></div>
            ))}
          </dl>
        </div>
        <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-slate-50 px-4">
          {TABS.map((t) => (
            <Link key={t.key} href={href(t.key)} scroll={false}
              className={`-mb-px whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium ${tab === t.key ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
              {!can(tabNeeds[t.key]) && <span className="mr-1 text-xs">🔒</span>}{t.label}
            </Link>
          ))}
        </nav>
        <div className="p-6 sm:p-8">{body}</div>
      </div>
    </div>
  );
}

type Access = Awaited<ReturnType<typeof listingAccess>>;

function NextStep({ projectId, ndaUrl, next, isInvestor, preview, access }: { projectId: string; ndaUrl: string | null; next: ReturnType<typeof nextStep>; isInvestor: boolean; preview: boolean; access: Access }) {
  if (!next.step) return <p className="text-emerald-700">The full data room is open. The DEAC team will coordinate next steps with you directly.</p>;
  if (!isInvestor) return <p className="text-sm text-slate-500">{preview ? `Investors at this stage see the "${STAGE_INFO[next.step].step}" step here.` : ""}</p>;
  const declined = next.status === "DECLINED" && <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">Your last request wasn&apos;t approved. Contact the DEAC team, or submit again.</p>;

  if (next.step === "NDA") {
    if (next.status === "PENDING") return <p className="text-slate-700">NDA signed by <span className="font-semibold">{access.nda?.signerName}</span> on {date(access.nda?.createdAt)}. The DEAC team is confirming it; you&apos;ll get an email when the confidential details open.</p>;
    return (
      <div id="nda">
        {declined}
        <p className="text-slate-700">Before a letter of interest, sign the NDA for this project. It takes about a minute, and once the DEAC team confirms it the sponsor, economics and NDA-tier documents open.</p>
        <ActionForm action={submitNda} submitLabel="Sign NDA" success="NDA signed. We'll email you when it's confirmed." className="mt-4 max-w-md space-y-3">
          <input type="hidden" name="projectId" value={projectId} />
          {ndaUrl && <a href={ndaUrl} target="_blank" rel="noreferrer" className="block text-sm font-semibold text-brand-600">Read the NDA →</a>}
          <Field label="Full name (signature)"><input name="signerName" required className="input" /></Field>
          <Field label="Title"><input name="signerTitle" className="input" /></Field>
          <label className="flex items-start gap-2 text-xs text-slate-600"><input type="checkbox" name="agree" required className="mt-0.5" /> I agree to keep all information about this project confidential under the {ndaUrl ? "NDA above" : "DEAC Marketplace confidentiality terms"}, on behalf of myself and my firm.</label>
        </ActionForm>
      </div>
    );
  }

  if (next.step === "LOI") {
    if (next.status === "PENDING") return (
      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-2">Letter of interest: <Badge tone="amber">PENDING</Badge></div>
        {access.loi?.amount && <div>Amount: {usd(access.loi.amount)}</div>}
        <p className="text-slate-500">The DEAC team is reviewing your letter. You&apos;ll be notified when more of the data room opens.</p>
      </div>
    );
    return (
      <div>
        {declined}
        <p className="text-slate-700">Submitting a letter of interest is non-binding. It goes to the DEAC deal team, who review it and open the next tier of the data room.</p>
        <details className="mt-4 group">
          <summary className="btn cursor-pointer list-none rounded-full px-6 group-open:hidden">Start Letter of Interest</summary>
          <ActionForm action={submitLoi} submitLabel="Submit letter of interest" success="Letter of interest submitted. We'll be in touch shortly." className="max-w-md space-y-3">
            <input type="hidden" name="projectId" value={projectId} />
            <Field label="Indicative amount ($)"><MoneyInput name="amount" /></Field>
            <Field label="Structure"><select name="structure" className="input"><option>Equity</option><option>Debt</option><option>Lease</option><option>Acquisition</option><option>JV / Partnership</option></select></Field>
            <Field label="Timeline"><input name="timeline" className="input" placeholder="e.g. close in Q1" /></Field>
            <Field label="Message"><textarea name="message" rows={3} className="input" /></Field>
          </ActionForm>
        </details>
      </div>
    );
  }

  if (next.status === "PENDING") return <p className="text-slate-700">You&apos;ve confirmed your interest. The DEAC team is opening the full data room and will email you when it&apos;s ready.</p>;
  return (
    <div>
      {declined}
      <p className="text-slate-700">Your letter of interest was accepted. Confirm you&apos;re moving forward to open the complete data room.</p>
      <ActionForm action={requestDiligence} submitLabel="Confirm interest & open full data room" success="Thanks. We'll email you when the full data room is open." className="mt-4 max-w-md space-y-3">
        <input type="hidden" name="projectId" value={projectId} />
        <Field label="Anything we should prepare? (optional)"><textarea name="message" rows={3} className="input" placeholder="e.g. site visit, call with the sponsor, lender package" /></Field>
      </ActionForm>
    </div>
  );
}
