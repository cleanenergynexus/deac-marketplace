import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const [pendingLois, pendingSteps, openReqs, applied] = await Promise.all([
    db.loi.count({ where: { status: "PENDING" } }),
    db.dealStep.count({ where: { status: "PENDING" } }),
    db.analysisRequest.count({ where: { status: { not: "DELIVERED" } } }),
    db.user.count({ where: { role: "INVESTOR", status: "PENDING" } }),
  ]);
  const links: [string, string, number?][] = [
    ["/admin", "Dashboard"],
    ["/admin/access", "Access requests", applied],
    ["/admin/investors", "Investor CRM"],
    ["/admin/developers", "Developer CRM"],
    ["/admin/projects", "Listings"],
    ["/admin/lois", "NDAs & LOIs", pendingLois + pendingSteps],
    ["/admin/requests", "Intake requests", openReqs],
    ["/admin/outreach", "Outreach"],
    ["/admin/calculator", "Valuation calculator"],
    ["/admin/scoring", "Scoring settings"],
    ["/admin/team", "Team"],
    ["/admin/account", "My account"],
  ];
  return (
    <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
      <aside className="space-y-1 lg:sticky lg:top-4 lg:self-start">
        {links.map(([href, label, count]) => (
          <Link key={href} href={href} className="flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white hover:shadow-sm">
            {label}
            {!!count && <span className="rounded-full bg-amber-100 px-2 text-xs text-amber-800">{count}</span>}
          </Link>
        ))}
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
