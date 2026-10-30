import { AdminNav, type NavItem } from "@/components/AdminNav";
import { requireAgent } from "@/lib/auth";

/** Referral agent portal: only what this agent referred, read-only, plus referrals, imports, uploads and meeting requests. */
export default async function AgentLayout({ children }: { children: React.ReactNode }) {
  await requireAgent();
  const items: NavItem[] = [
    { href: "/agent", label: "Overview" },
    { href: "/agent/developers", label: "Developer contacts" },
    { href: "/agent/investors", label: "Investor contacts" },
    { href: "/agent/listings", label: "Listings & data rooms", children: [{ href: "/agent/import", label: "Import a listing" }] },
    { href: "/agent/refer", label: "Refer a contact" },
    { href: "/agent/account", label: "My account" },
  ];
  return (
    <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
      <AdminNav items={items} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
