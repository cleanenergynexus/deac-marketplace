import { AdminNav, type NavItem } from "@/components/AdminNav";
import { agentView } from "@/lib/auth";
import { exitAgentView } from "@/app/actions/agents-admin";

/** Referral agent portal: only what this agent referred, read-only, plus referrals, imports, uploads and meeting requests. */
export default async function AgentLayout({ children }: { children: React.ReactNode }) {
  const view = await agentView();
  const items: NavItem[] = [
    { href: "/agent", label: "Overview" },
    { href: "/agent/developers", label: "Developer contacts" },
    { href: "/agent/investors", label: "Investor contacts" },
    { href: "/agent/listings", label: "Listings & data rooms", children: [{ href: "/agent/import", label: "Import a listing" }] },
    { href: "/marketplace", label: "Opportunities" },
    { href: "/agent/refer", label: "Refer a contact" },
    { href: "/agent/account", label: "My account" },
  ];
  return (
    <>
    {view.preview && (
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-violet-300 bg-violet-50 px-4 py-3 text-sm text-violet-900">
        <span>You&apos;re viewing the portal as <b>{view.agent.name}</b>{view.agent.status !== "APPROVED" ? " (suspended)" : ""} sees it. It&apos;s a preview: forms and uploads don&apos;t save.</span>
        <form action={exitAgentView}><button className="btn-ghost py-1.5">Exit preview</button></form>
      </div>
    )}
    <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
      <AdminNav items={items} />
      <div className="min-w-0">{children}</div>
    </div>
    </>
  );
}
