import Link from "next/link";
import { formatPhone } from "@/lib/phone";
import { db } from "@/lib/db";
import { setInvestorStage } from "@/app/actions/admin";
import { PageHeader, Empty } from "@/components/ui";
import { usd, date } from "@/lib/format";
import { dealTypeLabel } from "@/lib/constants";
import { marketSummary } from "@/lib/regions";

export const dynamic = "force-dynamic";

export default async function AccessRequests() {
  const pending = await db.user.findMany({ where: { role: "INVESTOR", status: "PENDING" }, include: { investor: true }, orderBy: { createdAt: "asc" } });
  return (
    <div>
      <PageHeader title="Access requests" subtitle="Investors who applied through the website. Approving unlocks the private portfolio for them." />
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
        <Empty>No one is waiting for approval.</Empty>
      )}
    </div>
  );
}
