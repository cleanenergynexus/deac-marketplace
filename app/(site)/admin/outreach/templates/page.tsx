import Link from "next/link";
import { db } from "@/lib/db";
import { Badge, PageHeader } from "@/components/ui";
import { OutreachTabs } from "@/components/OutreachTabs";
import { TEMPLATE_INFO, TEMPLATE_KEYS, mergeTemplate } from "@/lib/email-templates";
import { date } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function EmailTemplates() {
  const rows = await db.emailTemplate.findMany();
  const saved = new Map(rows.map((r) => [r.key, r]));
  return (
    <div>
      <PageHeader title="Outreach" subtitle="Branded DEAC emails the marketplace sends when it invites or welcomes someone. Edit the wording here; the logo, layout and footer stay the same." />
      <OutreachTabs active="templates" />
      <div className="card"><table className="w-full"><thead className="border-b border-slate-200"><tr><th className="th">Email</th><th className="th">Subject</th><th className="th">When It Is Sent</th><th className="th">Wording</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{TEMPLATE_KEYS.map((k) => {
          const row = saved.get(k);
          return (
            <tr key={k}>
              <td className="td"><Link href={`/admin/outreach/templates/${k}`} className="font-medium text-brand-600">{TEMPLATE_INFO[k].name}</Link></td>
              <td className="td text-sm">{mergeTemplate(k, row).subject}</td>
              <td className="td text-xs text-slate-600">{TEMPLATE_INFO[k].when}</td>
              <td className="td text-xs">{row ? <span title={row.updatedBy ?? ""}><Badge tone="blue">Edited</Badge> {date(row.updatedAt)}</span> : <Badge>Default</Badge>}</td>
            </tr>
          );
        })}</tbody></table></div>
    </div>
  );
}
