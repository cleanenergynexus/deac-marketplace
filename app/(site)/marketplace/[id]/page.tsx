import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { submitAnalysisRequest, submitLoi } from "@/app/actions/member";
import { ActionForm } from "@/components/ActionForm";
import { Checks } from "@/components/Checks";
import { Badge, Field, Section, statusTone } from "@/components/ui";
import { dealTypeLabel, FOCUS_AREAS } from "@/lib/constants";
import { usd, num } from "@/lib/format";
import { MoneyInput } from "@/components/MoneyInput";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireMember();
  const { id } = await params;
  const p = await db.project.findUnique({ where: { id }, include: { developer: { include: { team: { orderBy: { sortOrder: "asc" } } } }, documents: true } });
  if (!p || (p.visibility === "DRAFT" && u.role !== "ADMIN")) notFound();
  const loi = u.investorId ? await db.loi.findUnique({ where: { projectId_investorId: { projectId: id, investorId: u.investorId } } }) : null;
  const requests = u.investorId ? await db.analysisRequest.findMany({ where: { projectId: id, investorId: u.investorId }, orderBy: { createdAt: "desc" } }) : [];
  const unlocked = u.role === "ADMIN" || loi?.status === "APPROVED";
  const summaryDocs = p.documents.filter((d) => d.access === "SUMMARY");
  const roomCount = p.documents.filter((d) => d.access === "DATAROOM").length;

  const econ: [string, string][] = [
    ["Total capex", usd(p.totalCapex)],
    ["Funding needed", usd(p.fundingNeeded)],
    ["Target IRR", p.targetIrr != null ? `${p.targetIrr}%` : "—"],
    ["Equity multiple", p.equityMultiple != null ? `${p.equityMultiple}x` : "—"],
    ["Lease rate", p.leaseRateKwMo != null ? `$${p.leaseRateKwMo}/kW/mo` : "—"],
    ["Power rate", p.powerRateCents != null ? `${p.powerRateCents}¢/kWh` : "—"],
    ["Power status", p.powerStatus ?? "—"],
    ["Months to power", p.monthsToPower != null ? String(p.monthsToPower) : "—"],
    ["Target COD", p.codDate ?? "—"],
  ];

  return (
    <div className="space-y-6">
      <Link href="/marketplace" className="text-sm text-brand-600">← All opportunities</Link>
      <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-brand-900 to-brand-600 p-8 text-white">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded bg-white/15 px-2 py-0.5 font-mono">{p.code}</span>
          <span className="rounded bg-white/15 px-2 py-0.5">{dealTypeLabel(p.dealType)}</span>
          <span className="rounded bg-white/15 px-2 py-0.5">{p.projectStatus}</span>
        </div>
        <h1 className="mt-3 text-3xl font-bold">{p.title}</h1>
        <p className="mt-1 text-slate-200">{[p.city, p.state].filter(Boolean).join(", ")}</p>
        <div className="mt-6 grid max-w-2xl grid-cols-3 gap-6">
          <div><div className="text-3xl font-extrabold">{num(p.mw, 1)} MW</div><div className="text-xs text-slate-300">Capacity</div></div>
          <div><div className="text-3xl font-extrabold">{usd(p.fundingNeeded)}</div><div className="text-xs text-slate-300">Funding needed</div></div>
          <div><div className="text-xl font-bold">{p.facilityType}</div><div className="text-xs text-slate-300">Facility</div></div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Section title="Overview">
            <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{p.summary}</p>
            {p.highlights && (
              <ul className="mt-4 list-disc space-y-1 pl-5 text-sm">{p.highlights.split("\n").filter(Boolean).map((h, i) => <li key={i}>{h}</li>)}</ul>
            )}
          </Section>

          <Section title="Economics">
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {econ.map(([k, v]) => <div key={k}><dt className="text-xs text-slate-500">{k}</dt><dd className="font-semibold">{v}</dd></div>)}
            </dl>
            {p.capitalStack && <p className="mt-4 text-sm"><span className="font-semibold">Capital stack: </span>{p.capitalStack}</p>}
            {p.economicsNotes && <p className="mt-2 text-sm text-slate-600">{p.economicsNotes}</p>}
          </Section>

          <Section title="Project sponsor">
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
          </Section>

          <Section title="Key documents">
            {summaryDocs.length ? (
              <ul className="divide-y divide-slate-100">{summaryDocs.map((d) => (
                <li key={d.id} className="flex items-center justify-between py-2 text-sm"><span>{d.name} <span className="text-xs text-slate-500">· {d.category}</span></span><a href={d.url} target="_blank" className="text-brand-600">Open</a></li>
              ))}</ul>
            ) : <p className="text-sm text-slate-500">Summary documents will be posted shortly.</p>}
            <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
              🔒 {roomCount} more documents in the data room
              {unlocked ? <> — <Link href={`/marketplace/${p.id}/data-room`} className="font-semibold text-brand-600">open data room</Link></> : " unlock after your letter of interest is accepted."}
            </div>
          </Section>
        </div>

        <div className="space-y-6">
          <Section title="Letter of interest">
            {loi ? (
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">Status: <Badge tone={statusTone(loi.status)}>{loi.status}</Badge></div>
                {loi.amount && <div>Amount: {usd(loi.amount)}</div>}
                {loi.status === "APPROVED" && <Link href={`/marketplace/${p.id}/data-room`} className="btn mt-2 w-full">Open data room</Link>}
                {loi.status === "PENDING" && <p className="text-slate-500">The DEAC team is reviewing your letter. You'll be notified when the data room is unlocked.</p>}
              </div>
            ) : u.investorId ? (
              <ActionForm action={submitLoi} submitLabel="Submit letter of interest" success="Letter of interest submitted. We'll be in touch shortly." className="space-y-3">
                <input type="hidden" name="projectId" value={p.id} />
                <Field label="Indicative amount ($)"><MoneyInput name="amount" /></Field>
                <Field label="Structure"><select name="structure" className="input"><option>Equity</option><option>Debt</option><option>Lease</option><option>Acquisition</option><option>JV / Partnership</option></select></Field>
                <Field label="Timeline"><input name="timeline" className="input" placeholder="e.g. close in Q1" /></Field>
                <Field label="Message"><textarea name="message" rows={3} className="input" /></Field>
                <p className="text-xs text-slate-500">Non-binding. Submitting confirms your NDA obligations for this project.</p>
              </ActionForm>
            ) : <p className="text-sm text-slate-500">Admin preview.</p>}
          </Section>

          {u.investorId && (
            <Section title="Analysis intake">
              <p className="mb-3 text-sm text-slate-600">Tell us how you underwrite and we'll package the data room for your analysis.</p>
              {requests.map((r) => (
                <div key={r.id} className="mb-3 rounded border border-slate-200 p-2 text-xs">
                  <Badge tone={statusTone(r.status)}>{r.status}</Badge> <span className="ml-1">{r.focusAreas.split(",").join(", ")}</span>
                  {r.deliverableUrl && <a href={r.deliverableUrl} target="_blank" className="mt-1 block text-brand-600">Download package</a>}
                </div>
              ))}
              <ActionForm action={submitAnalysisRequest} submitLabel="Submit intake" success="Got it. Our team will organize the materials for you." className="space-y-3">
                <input type="hidden" name="projectId" value={p.id} />
                <Field label="Focus areas"><Checks name="focusAreas" options={FOCUS_AREAS} /></Field>
                <Field label="Key return metric"><select name="returnMetric" className="input"><option>Levered IRR</option><option>Unlevered IRR</option><option>Cash-on-cash yield</option><option>Cap rate / NOI</option><option>DSCR</option><option>Equity multiple</option></select></Field>
                <Field label="Hold period"><input name="holdPeriod" className="input" placeholder="e.g. 5–7 years" /></Field>
                <Field label="Preferred format"><select name="format" className="input"><option>Excel model</option><option>PDF investment memo</option><option>Data tape (CSV)</option><option>Call with sponsor</option></select></Field>
                <Field label="Specific questions"><textarea name="questions" rows={3} className="input" /></Field>
              </ActionForm>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}
