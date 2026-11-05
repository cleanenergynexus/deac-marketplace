import Link from "next/link";
import { formatPhone } from "@/lib/phone";
import { db } from "@/lib/db";
import { setInvestorStage } from "@/app/actions/admin";
import { PageHeader, Empty, Section } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmButton } from "@/components/ConfirmButton";
import { approveAgentApplication, declineAgentApplication } from "@/app/actions/agents-admin";
import { agentFocusLabel } from "@/lib/agents";
import { requireAdmin } from "@/lib/auth";
import { staffLevel } from "@/lib/tasks";
import { usd, date } from "@/lib/format";
import { dealTypeLabel } from "@/lib/constants";
import { marketSummary } from "@/lib/regions";

export const dynamic = "force-dynamic";

export default async function AccessRequests() {
  const me = await requireAdmin();
  const isAdmin = staffLevel(me.staffLevel) === "ADMIN";
  const [pending, agentApps, partners] = await Promise.all([
    db.user.findMany({ where: { role: "INVESTOR", status: "PENDING" }, include: { investor: true }, orderBy: { createdAt: "asc" } }),
    db.agentApplication.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" } }),
    db.user.findMany({ where: { role: "ADMIN" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <div className="space-y-8">
      <div>
      <PageHeader title="Access Requests" subtitle="Investors and referral agents who applied through the website. Approving an investor unlocks the private portfolio for them." />
      {pending.length ? (
        <div className="space-y-4">
          {pending.map(({ id, investor: i, createdAt }) =>
            i ? (
              <div key={id} className="card p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <Link href={`/admin/investors/${i.id}`} className="text-lg font-semibold text-brand-600">{i.name}</Link>
                    <div className="text-sm text-slate-600">{[[i.title, i.firm].filter(Boolean).join(", "), i.email, formatPhone(i.phone)].filter(Boolean).join(" · ")}</div>
                    <div className="mt-1 text-xs text-slate-500">Applied {date(createdAt)}{i.source ? ` · via ${i.source}` : ""}</div>
                  </div>
                  <div className="flex gap-2">
                    <form action={setInvestorStage}><input type="hidden" name="id" value={i.id} /><input type="hidden" name="stage" value="APPROVED" /><button className="btn">Approve</button></form>
                    <form action={setInvestorStage}><input type="hidden" name="id" value={i.id} /><input type="hidden" name="stage" value="DECLINED" /><button className="btn-danger">Decline</button></form>
                  </div>
                </div>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-4">
                  <div><dt className="text-xs text-slate-500">Type</dt><dd>{i.investorType ?? "—"}</dd></div>
                  <div><dt className="text-xs text-slate-500">Check size</dt><dd>{i.checkMin || i.checkMax ? `${usd(i.checkMin)}–${usd(i.checkMax)}` : "—"}</dd></div>
                  <div><dt className="text-xs text-slate-500">Deal types</dt><dd>{i.dealTypes.split(",").filter(Boolean).map(dealTypeLabel).join(", ") || "Any"}</dd></div>
                  <div><dt className="text-xs text-slate-500">Accredited</dt><dd>{i.accredited ? "Yes (self-certified)" : "Not confirmed"}</dd></div>
                  <div className="sm:col-span-4"><dt className="text-xs text-slate-500">Markets</dt><dd>{marketSummary(i.preferredStates, i.preferredRegions)}</dd></div>
                  {i.notes && <div className="sm:col-span-4"><dt className="text-xs text-slate-500">Mandate notes</dt><dd className="whitespace-pre-line">{i.notes}</dd></div>}
                </dl>
              </div>
            ) : null,
          )}
        </div>
      ) : (
        <Empty>No investors are waiting for approval.</Empty>
      )}
      </div>

      <Section title={`Referral Agent Applications (${agentApps.length})`}>
        <p className="mb-4 text-sm text-slate-600">People who applied through <b>Become a Referral Agent</b> on the website. Approving creates their agent login with the password they chose, assigns their DEAC partner and emails them. Manage approved agents under <Link href="/admin/agents" className="text-brand-600">Referral Agents</Link>.</p>
        {agentApps.length ? (
          <div className="space-y-4">
            {agentApps.map((a) => (
              <div key={a.id} className="rounded-lg border border-slate-200 p-5">
                <div className="text-lg font-semibold">{a.name}</div>
                <div className="text-sm text-slate-600">{[[a.title, a.company].filter(Boolean).join(", "), a.email, formatPhone(a.phone)].filter(Boolean).join(" · ")}</div>
                <div className="mt-1 text-xs text-slate-500">Applied {date(a.createdAt)}{a.source ? ` · heard about us via ${a.source}` : ""}</div>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <div><dt className="text-xs text-slate-500">Based in</dt><dd>{a.location ?? "—"}</dd></div>
                  <div><dt className="text-xs text-slate-500">Would refer</dt><dd>{agentFocusLabel(a.focus) || "—"}</dd></div>
                  {a.experience && <div className="sm:col-span-2"><dt className="text-xs text-slate-500">Background and network</dt><dd className="whitespace-pre-line">{a.experience}</dd></div>}
                </dl>
                {isAdmin ? (
                  <div className="mt-4 flex flex-wrap items-end gap-4">
                    <ActionForm action={approveAgentApplication} submitLabel="Approve agent" success={`${a.name} is approved. Their agent login is ready and they've been emailed.`} className="flex flex-wrap items-end gap-3 [&>button]:mt-0">
                      <input type="hidden" name="id" value={a.id} />
                      <label className="block text-xs text-slate-500">DEAC partner
                        <select name="partnerId" defaultValue={me.id} className="input mt-1 py-1.5"><option value="">No partner yet</option>{partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                      </label>
                    </ActionForm>
                    <form action={declineAgentApplication}>
                      <input type="hidden" name="id" value={a.id} />
                      <ConfirmButton message={`Decline ${a.name}'s referral agent application? They won't get a login.`} className="btn-danger">Decline</ConfirmButton>
                    </form>
                  </div>
                ) : <p className="mt-4 text-xs text-slate-500">Only Admins can approve referral agents.</p>}
              </div>
            ))}
          </div>
        ) : <Empty>No referral agent applications waiting.</Empty>}
      </Section>
    </div>
  );
}
