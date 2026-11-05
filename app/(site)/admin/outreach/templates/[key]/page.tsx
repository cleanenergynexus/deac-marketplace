import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { EmailTemplateEditor } from "@/components/EmailTemplateEditor";
import { isTemplateKey, mergeTemplate, TEMPLATE_INFO } from "@/lib/email-templates";
import { emailSettings } from "@/lib/email-templates-db";
import { date } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function EditEmailTemplate({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!isTemplateKey(key)) notFound();
  const me = await requireAdmin();
  const row = await db.emailTemplate.findUnique({ where: { key } });
  const info = TEMPLATE_INFO[key];
  return (
    <div className="space-y-4">
      <Link href="/admin/outreach/templates" className="text-sm text-brand-600">← Email Templates</Link>
      <PageHeader title={info.name} subtitle={<>{info.when} {row ? `Last edited ${date(row.updatedAt)}${row.updatedBy ? ` by ${row.updatedBy}` : ""}.` : "Using the default wording."}</>} />
      <EmailTemplateEditor key={row?.updatedAt.toISOString() ?? "default"} templateKey={key} initial={mergeTemplate(key, row)} defaults={info.defaults} edited={!!row} settings={emailSettings()} sender={me.name} />
    </div>
  );
}
