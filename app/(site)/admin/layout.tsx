import { AdminNav, type NavItem } from "@/components/AdminNav";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await requireAdmin();
  const [pendingLois, pendingSteps, openReqs, applied, myTasks, awaitingSignature] = await Promise.all([
    db.loi.count({ where: { status: "PENDING" } }),
    db.dealStep.count({ where: { status: "PENDING" } }),
    db.analysisRequest.count({ where: { status: { not: "DELIVERED" } } }),
    db.user.count({ where: { role: "INVESTOR", status: "PENDING" } }),
    db.activity.count({ where: { kind: "TASK", assigneeId: me.id, doneAt: null } }),
    db.signatureRequest.count({ where: { status: { in: ["SENT", "VIEWED"] } } }),
  ]);
  const items: NavItem[] = [
    { href: "/admin", label: "Dashboard" },
    { href: "/admin/tasks", label: "Tasks", count: myTasks },
    { href: "/admin/access", label: "Access Requests", count: applied },
    {
      href: "/admin/investors",
      label: "Investor CRM",
      children: [
        { href: "/admin/investors/companies", label: "Companies" },
        { href: "/admin/investors/contacts", label: "Contacts" },
        { href: "/admin/investors/listings", label: "Listings" },
        { href: "/admin/investors/funnels", label: "Funnels" },
      ],
    },
    {
      href: "/admin/developers",
      label: "Developer CRM",
      children: [
        { href: "/admin/developers/companies", label: "Companies" },
        { href: "/admin/developers/contacts", label: "Contacts" },
        { href: "/admin/developers/projects", label: "Projects" },
        { href: "/admin/screening", label: "Screening" },
        { href: "/admin/developers/funnels", label: "Funnels" },
      ],
    },
    { href: "/admin/projects", label: "Listings", children: [{ href: "/admin/data-room-template", label: "Data Room Template" }] },
    { href: "/admin/lois", label: "NDAs & LOIs", count: pendingLois + pendingSteps },
    { href: "/admin/signatures", label: "E-Signatures", count: awaitingSignature },
    { href: "/admin/requests", label: "Intake Requests", count: openReqs },
    { href: "/admin/outreach", label: "Outreach" },
    { href: "/admin/calculator", label: "Valuation Calculator", children: [{ href: "/admin/scoring", label: "Scoring Settings" }] },
    { href: "/admin/team", label: "Team", children: [{ href: "/admin/agents", label: "Referral Agents" }] },
    { href: "/admin/account", label: "My Account" },
  ];
  return (
    <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
      <AdminNav items={items} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
