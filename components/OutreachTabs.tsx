import Link from "next/link";

/** Campaigns and Email Templates live side by side under Outreach. */
export function OutreachTabs({ active }: { active: "campaigns" | "templates" }) {
  const tab = (href: string, label: string, on: boolean) => (
    <Link href={href} className={`border-b-2 px-1 pb-2 text-sm font-medium ${on ? "border-brand-500 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}>{label}</Link>
  );
  return (
    <div className="mb-6 flex gap-6 border-b border-slate-200">
      {tab("/admin/outreach", "Campaigns", active === "campaigns")}
      {tab("/admin/outreach/templates", "Email Templates", active === "templates")}
    </div>
  );
}
