import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { db } from "@/lib/db";
import { listingAccess, requireMember } from "@/lib/auth";
import { requestDiligence, submitAnalysisRequest, submitLoi, submitNda } from "@/app/actions/member";
import { ActionForm } from "@/components/ActionForm";
import { Checks } from "@/components/Checks";
import { DealProgress, Locked } from "@/components/DealProgress";
import { Badge, Field, Section, statusTone } from "@/components/ui";
import { dealTypeLabel, FOCUS_AREAS } from "@/lib/constants";
import { atLeast, docStage, isStage, nextStep, parseDisclosure, STAGES, STAGE_INFO, stageRank, type Stage, type StepStatus } from "@/lib/disclosure";
import { usd, num, date } from "@/lib/format";
import { MoneyInput } from "@/components/MoneyInput";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "site", label: "Site & power" },
  { key: "financials", label: "Financials" },
  { key: "sponsor", label: "Sponsor" },
  { key: "documents", label: "Data room" },
  { key: "intake", label: "Analysis request" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const minStage = (...s: Stage[]) => s.reduce((a, b) => (stageRank(b) < stageRank(a) ? b : a));

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; as?: string }> }) {
  const u = await requireMember();
  const { id } = await params;
  const sp = await searchParams;
  const p = await db.project.findUnique({ where: { id }, include: { developer: { include: { team: { orderBy: { sortOrder: "asc" } } } }, documents: { orderBy: [{ category: "asc" }, { name: "asc" }] } } });
  if (!p || (p.visibility === "DRAFT" && u.role !== "ADMIN")) notFound();

  const isAdmin = u.role === "ADMIN";
  const access = await listingAccess(id, u);
  // Admins can preview the listing as an investor at any stage.
  const stage: Stage = isAdmin && isStage(sp.as) ? sp.as : access.stage;
  const can = (need: Stage) => atLeast(stage, need);
  const show = parseDisclosure(p.disclosure);
  const tab: TabKey = TABS.some((t) => t.key === sp.tab) ? (sp.tab as TabKey) : "overview";
  const tabNeeds: Record<TabKey, Stage> = {
    overview: "TEASER",
    site: show.power,
    financials: minStage(show.returns, show.capital),
    sponsor: show.sponsor,
    documents: "TEASER",
    intake: "TEASER",
  };
  const href = (t: TabKey) => `/marketplace/${p.id}?tab=${t}${isAdmin && isStage(sp.as) ? `&as=${sp.as}` : ""}`;

  const status = { nda: access.nda?.status as StepStatus | undefined, loi: access.loi?.status as StepStatus | undefined, diligence: access.diligence?.status as StepStatus | undefined };
  const next = nextStep(stage, status);
  const requests = u.investorId && tab === "intake" ? await db.analysisRequest.findMany({ where: { projectId: id, investorId: u.investorId }, orderBy: { createdAt: "desc" } }) : [];

  const docs = p.documents.map((d) => ({ ...d, stage: docStage(d.access) }));
  const fact = (k: string, v: ReactNode) => <div key={k}><dt className="text-xs text-slate-500">{k}</dt><dd className="font-semibold">{v}</dd></div>;

  let body: ReactNode;
  if (tab === "overview") {
    body = (
      <div className="space-y-6">
        <Section title="Opportunity at a glance">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {fact("Capacity", `${num(p.mw, 1)} MW`)}
            {fact("Facility", p.facilityType)}
            {fact("Deal type", dealTypeLabel(p.dealType))}
            {fact("Location", [p.city, p.state].filter(Boolean).join(", "))}
            {fact("Funding needed", p.fundingNeeded ? usd(p.fundingNeeded) : "—")}
            {fact("Development stage", p.projectStatus)}
          </dl>
        </Section>
        <Section title="Summary">
          {can(show.overview) ? (
            <>
              <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{p.summary}</p>
              {p.highlights && <ul className="mt-4 list-disc space-y-1 pl-5 text-sm">{p.highlights.split("\n").filter(Boolean).map((h, i) => <li key={i}>{h}</li>)}</ul>}
            </>
          ) : <Locked need={show.overview} what="The project summary" />}
        </Section>
        <Section title="What opens at each stage">
          <ul className="space-y-2 text-sm">
            {STAGES.map((s) => {
              const tabs = TABS.filter((t) => t.key !== "documents" && t.key !== "intake" && t.key !== "overview" && tabNeeds[t.key] === s).map((t) => t.label);
              const n = docs.filter((d) => d.stage === s).length;
              const items = [...(s === "TEASER" ? ["Overview"] : []), ...tabs, n ? `${n} document${n === 1 ? "" : "s"}` : null].filter(Boolean);
              return (
                <li key={s} className="flex items-start gap-3">
                  <span className={`mt-0.5 w-5 ${can(s) ? "text-emerald-600" : "text-slate-400"}`}>{can(s) ? "✓" : "🔒"}</span>
                  <span><span className="font-semibold">{STAGE_INFO[s].step}:</span> <span className="text-slate-600">{items.length ? items.join(" · ") : "—"}</span></span>
                </li>
              );
            })}
          </ul>
        </Section>
      </div>
    );
  } else if (tab === "site") {
    body = (
      <Section title="Site & power">
        {can(show.power) ? (
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {fact("Location", [p.city, p.state].filter(Boolean).join(", "))}
            {fact("Capacity", `${num(p.mw, 1)} MW`)}
            {fact("Power status", p.powerStatus ?? "—")}
            {fact("Power rate", p.powerRateCents != null ? `${p.powerRateCents}¢/kWh` : "—")}
            {fact("Months to power", p.monthsToPower != null ? String(p.monthsToPower) : "—")}
            {fact("Target COD", p.codDate ?? "—")}
          </dl>
        ) : <Locked need={show.power} what="Power and schedule details" />}
      </Section>
    );
  } else if (tab === "financials") {
    body = (
      <div className="space-y-6">
        <Section title="Returns">
          {can(show.returns) ? (
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {fact("Total capex", usd(p.totalCapex))}
              {fact("Funding needed", usd(p.fundingNeeded))}
              {fact("Target IRR", p.targetIrr != null ? `${p.targetIrr}%` : "—")}
              {fact("Equity multiple", p.equityMultiple != null ? `${p.equityMultiple}x` : "—")}
              {fact("Lease rate", p.leaseRateKwMo != null ? `$${p.leaseRateKwMo}/kW/mo` : "—")}
            </dl>
          ) : <Locked need={show.returns} what="Returns" />}
        </Section>
        <Section title="Capital stack">
          {can(show.capital) ? (
            p.capitalStack || p.economicsNotes ? (
              <div className="space-y-2 text-sm">
                {p.capitalStack && <p className="whitespace-pre-line">{p.capitalStack}</p>}
                {p.economicsNotes && <p className="whitespace-pre-line text-slate-600">{p.economicsNotes}</p>}
              </div>
            ) : <p className="text-sm text-slate-500">Capital stack details will be posted shortly.</p>
          ) : <Locked need={show.capital} what="The capital stack" />}
        </Section>
      </div>
    );
  } else if (tab === "sponsor") {
    body = (
      <Section title="Project sponsor">
        {can(show.sponsor) ? (
          <>
            <div className="text-lg font-semibold">{p.developer.company}</div>
            <div className="text-sm text-slate-500">{[p.developer.hq, p.developer.mwDelivered ? `${num(p.developer.mwDelivered)} MW delivered` : null].filter(Boolean).join(" · ")}</div>
            {p.developer.experience && <p className="mt-3 whitespace-pre-line text-sm text-slate-700">{p.developer.experience}</p>}
            {p.developer.team.length > 0 && (
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                {p.developer.team.map((m) => (
                  <div key={m.id} className="rounded-lg border border-slate-200 p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-700">{m.name.split(" ").map((x) => x[0]).join("").slice(0, 2)}</div>
                      <div><div className="font-semibold">{m.name}</div><div className="text-xs text-slate-500">{m.title}</div></div>
                    </div>
                    <p className="mt-3 text-sm text-slate-600">{m.bio}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : <Locked need={show.sponsor} what="Sponsor identity and team" />}
      </Section>
    );
  } else if (tab === "documents") {
    body = (
      <div className="space-y-4">
        {STAGES.map((s) => {
          const list = docs.filter((d) => d.stage === s);
          if (!list.length) return null;
          const open = can(s);
          const groups = list.reduce<Record<string, typeof list>>((acc, d) => ((acc[d.category] ??= []).push(d), acc), {});
          return (
            <div key={s} className="card">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
                <span className="text-sm font-semibold">{open ? "📂" : "🔒"} {STAGE_INFO[s].step}</span>
                <span className="text-xs text-slate-500">{list.length} document{list.length === 1 ? "" : "s"}</span>
              </div>
              {open ? (
                <div className="divide-y divide-slate-100">
                  {Object.entries(groups).map(([cat, ds]) => (
                    <div key={cat} className="px-4 py-2">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{cat}</div>
                      <ul>{ds.map((d) => (
                        <li key={d.id} className="flex items-center justify-between py-1.5 text-sm">
                          <span>{d.name}</span>
                          <span className="flex items-center gap-4 text-xs text-slate-500">{date(d.createdAt)}<a href={d.url} target="_blank" rel="noreferrer" className="font-semibold text-brand-600">Open</a></span>
                        </li>
                      ))}</ul>
                    </div>
                  ))}
                </div>
              ) : <p className="px-4 py-3 text-sm text-slate-500">{STAGE_INFO[s].unlock}.</p>}
            </div>
          );
        })}
        {!docs.length && <p className="card p-6 text-center text-sm text-slate-500">Documents are being uploaded.</p>}
      </div>
    );
  } else {
    body = (
      <Section title="Analysis request">
        <p className="mb-3 text-sm text-slate-600">Tell us how you underwrite and we'll package the data room for your analysis.</p>
        {requests.map((r) => (
          <div key={r.id} className="mb-3 rounded border border-slate-200 p-2 text-xs">
            <Badge tone={statusTone(r.status)}>{r.status}</Badge> <span className="ml-1">{r.focusAreas.split(",").join(", ")}</span>
            {r.deliverableUrl && <a href={r.deliverableUrl} target="_blank" rel="noreferrer" className="mt-1 block text-brand-600">Download package</a>}
          </div>
        ))}
        {u.investorId ? (
          <ActionForm action={submitAnalysisRequest} submitLabel="Submit request" success="Got it. Our team will organize the materials for you." className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="projectId" value={p.id} />
            <Field label="Focus areas" group className="sm:col-span-2"><Checks name="focusAreas" options={FOCUS_AREAS} /></Field>
            <Field label="Key return metric"><select name="returnMetric" className="input"><option>Levered IRR</option><option>Unlevered IRR</option><option>Cash-on-cash yield</option><option>Cap rate / NOI</option><option>DSCR</option><option>Equity multiple</option></select></Field>
            <Field label="Hold period"><input name="holdPeriod" className="input" placeholder="e.g. 5–7 years" /></Field>
            <Field label="Preferred format"><select name="format" className="input"><option>Excel model</option><option>PDF investment memo</option><option>Data tape (CSV)</option><option>Call with sponsor</option></select></Field>
            <Field label="Specific questions" className="sm:col-span-2"><textarea name="questions" rows={3} className="input" /></Field>
          </ActionForm>
        ) : <p className="text-sm text-slate-500">Investors fill this in. Admin preview.</p>}
      </Section>
    );
  }

  return (
    <div className="space-y-6">
      <Link href="/marketplace" className="text-sm text-brand-600">← All opportunities</Link>
      <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-brand-900 to-brand-600 p-8 text-white">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded bg-white/15 px-2 py-0.5 font-mono">{p.code}</span>
          <span className="rounded bg-white/15 px-2 py-0.5">{dealTypeLabel(p.dealType)}</span>
          <span className="rounded bg-white/15 px-2 py-0.5">{p.projectStatus}</span>
          <span className="rounded bg-emerald-500/30 px-2 py-0.5">Your access: {STAGE_INFO[stage].label}</span>
        </div>
        <h1 className="mt-3 text-3xl font-bold">{p.title}</h1>
        <p className="mt-1 text-slate-200">{[p.city, p.state].filter(Boolean).join(", ")}</p>
        <div className="mt-6 grid max-w-2xl grid-cols-3 gap-6">
          <div><div className="text-3xl font-extrabold">{num(p.mw, 1)} MW</div><div className="text-xs text-slate-300">Capacity</div></div>
          <div><div className="text-3xl font-extrabold">{usd(p.fundingNeeded)}</div><div className="text-xs text-slate-300">Funding needed</div></div>
          <div><div className="text-xl font-bold">{p.facilityType}</div><div className="text-xs text-slate-300">Facility</div></div>
        </div>
      </div>

      {isAdmin && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-900">
          <span className="font-semibold">Admin preview: see this listing as an investor at</span>
          {STAGES.map((s) => (
            <Link key={s} href={`/marketplace/${p.id}?tab=${tab}&as=${s}`} scroll={false} className={`rounded-full px-3 py-0.5 ${sp.as === s ? "bg-amber-600 text-white" : "bg-white hover:bg-amber-100"}`}>{STAGE_INFO[s].step}</Link>
          ))}
          <Link href={`/marketplace/${p.id}?tab=${tab}`} scroll={false} className={`rounded-full px-3 py-0.5 ${!isStage(sp.as) ? "bg-amber-600 text-white" : "bg-white hover:bg-amber-100"}`}>Everything</Link>
          <Link href={`/admin/projects/${p.id}#disclosure`} className="ml-auto text-amber-800 underline">Edit what each stage shows</Link>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <nav className="flex gap-1 overflow-x-auto border-b border-slate-200">
            {TABS.map((t) => {
              const locked = !can(tabNeeds[t.key]);
              return (
                <Link key={t.key} href={href(t.key)} scroll={false}
                  className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${tab === t.key ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
                  {locked && <span className="mr-1">🔒</span>}{t.label}
                </Link>
              );
            })}
          </nav>
          {body}
        </div>

        <div className="space-y-6">
          <Section title="Your access">
            <DealProgress stage={stage} pending={next.status === "PENDING" ? next.step : null} />
            <div className="mt-5 border-t border-slate-100 pt-4">
              <NextStep projectId={p.id} ndaUrl={p.ndaUrl} next={next} isInvestor={!!u.investorId} preview={isAdmin} access={access} />
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

type Access = Awaited<ReturnType<typeof listingAccess>>;

function NextStep({ projectId, ndaUrl, next, isInvestor, preview, access }: { projectId: string; ndaUrl: string | null; next: ReturnType<typeof nextStep>; isInvestor: boolean; preview: boolean; access: Access }) {
  if (!next.step) return <p className="text-sm text-emerald-700">The full data room is open. The DEAC team will coordinate next steps with you directly.</p>;
  if (!isInvestor) return <p className="text-sm text-slate-500">{preview ? `Investors at this stage see the "${STAGE_INFO[next.step].step}" step here.` : ""}</p>;
  const declined = next.status === "DECLINED" && <p className="mb-3 rounded bg-red-50 p-2 text-xs text-red-700">Your last request wasn't approved. Contact the DEAC team, or submit again.</p>;

  if (next.step === "NDA") {
    if (next.status === "PENDING") return <p className="text-sm text-slate-600">NDA signed by <span className="font-semibold">{access.nda?.signerName}</span> on {date(access.nda?.createdAt)}. The DEAC team is confirming it; you&apos;ll get an email when the confidential details open.</p>;
    return (
      <>
        {declined}
        <h3 className="text-sm font-semibold">Step 2: Sign the NDA</h3>
        <p className="mt-1 text-xs text-slate-500">Signing unlocks the confidential project details and NDA-level documents once the DEAC team confirms it.</p>
        <ActionForm action={submitNda} submitLabel="Sign NDA" success="NDA signed. We'll email you when it's confirmed." className="mt-3 space-y-3">
          <input type="hidden" name="projectId" value={projectId} />
          {ndaUrl && <a href={ndaUrl} target="_blank" rel="noreferrer" className="block text-sm font-semibold text-brand-600">Read the NDA →</a>}
          <Field label="Full name (signature)"><input name="signerName" required className="input" /></Field>
          <Field label="Title"><input name="signerTitle" className="input" /></Field>
          <label className="flex items-start gap-2 text-xs text-slate-600"><input type="checkbox" name="agree" required className="mt-0.5" /> I agree to keep all information about this project confidential under the {ndaUrl ? "NDA above" : "DEAC Marketplace confidentiality terms"}, on behalf of myself and my firm.</label>
        </ActionForm>
      </>
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
      <>
        {declined}
        <h3 className="text-sm font-semibold">Step 3: Submit a letter of interest</h3>
        <ActionForm action={submitLoi} submitLabel="Submit letter of interest" success="Letter of interest submitted. We'll be in touch shortly." className="mt-3 space-y-3">
          <input type="hidden" name="projectId" value={projectId} />
          <Field label="Indicative amount ($)"><MoneyInput name="amount" /></Field>
          <Field label="Structure"><select name="structure" className="input"><option>Equity</option><option>Debt</option><option>Lease</option><option>Acquisition</option><option>JV / Partnership</option></select></Field>
          <Field label="Timeline"><input name="timeline" className="input" placeholder="e.g. close in Q1" /></Field>
          <Field label="Message"><textarea name="message" rows={3} className="input" /></Field>
          <p className="text-xs text-slate-500">Non-binding.</p>
        </ActionForm>
      </>
    );
  }

  if (next.status === "PENDING") return <p className="text-sm text-slate-600">You&apos;ve confirmed your interest. The DEAC team is opening the full data room and will email you when it&apos;s ready.</p>;
  return (
    <>
      {declined}
      <h3 className="text-sm font-semibold">Step 4: Confirm interest for full diligence</h3>
      <p className="mt-1 text-xs text-slate-500">Your LOI was accepted. Confirm you&apos;re moving forward to open the complete data room.</p>
      <ActionForm action={requestDiligence} submitLabel="Confirm interest & request full data room" success="Thanks. We'll email you when the full data room is open." className="mt-3 space-y-3">
        <input type="hidden" name="projectId" value={projectId} />
        <Field label="Anything we should prepare? (optional)"><textarea name="message" rows={3} className="input" placeholder="e.g. site visit, call with the sponsor, lender package" /></Field>
      </ActionForm>
    </>
  );
}
