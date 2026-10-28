import { AdminNav, type NavItem } from "@/components/AdminNav";
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
  const items: NavItem[] = [
    { href: "/admin", label: "Dashboard" },
    { href: "/admin/access", label: "Access requests", count: applied },
    { href: "/admin/investors", label: "Investor CRM" },
    {
      href: "/admin/developers",
      label: "Developer CRM",
      children: [
        { href: "/admin/developers/companies", label: "Companies" },
        { href: "/admin/developers/contacts", label: "Contacts" },
        { href: "/admin/developers/projects", label: "Projects" },
        { href: "/admin/developers/funnels", label: "Funnels" },
      ],
    },
    { href: "/admin/projects", label: "Listings" },
    { href: "/admin/lois", label: "NDAs & LOIs", count: pendingLois + pendingSteps },
    { href: "/admin/requests", label: "Intake requests", count: openReqs },
    { href: "/admin/outreach", label: "Outreach" },
    { href: "/admin/calculator", label: "Valuation calculator", children: [{ href: "/admin/scoring", label: "Scoring settings" }] },
    { href: "/admin/team", label: "Team" },
    { href: "/admin/account", label: "My account" },
  ];
  return (
    <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
      <AdminNav items={items} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
