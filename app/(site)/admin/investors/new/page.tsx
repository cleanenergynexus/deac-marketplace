import Link from "next/link";
import { db } from "@/lib/db";
import { createInvestor } from "@/app/actions/admin";
import { InvestorForm } from "@/components/InvestorForm";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

/** New investor contact. From a company page the company is filled in; from a listing view the investor is linked to that listing. */
export default async function NewInvestor({ searchParams }: { searchParams: Promise<{ firmId?: string; projectId?: string }> }) {
  const sp = await searchParams;
  const [firms, firm, project] = await Promise.all([
    db.investorFirm.findMany({ select: { name: true }, orderBy: { name: "asc" } }),
    sp.firmId ? db.investorFirm.findUnique({ where: { id: sp.firmId }, select: { name: true } }) : null,
    sp.projectId ? db.project.findUnique({ where: { id: sp.projectId }, select: { id: true, code: true, title: true } }) : null,
  ]);
  return (
    <div>
      <Link href={project ? `/admin/investors?listing=${project.id}` : "/admin/investors/contacts"} className="text-sm text-brand-600">← {project ? project.code : "Contacts"}</Link>
      <PageHeader title="Add investor" subtitle={project ? `They'll be added to ${project.code} · ${project.title} on the board.` : "An investor contact. Type their company: an existing one is picked, a new name creates it."} />
      <div className="card p-6"><InvestorForm action={createInvestor} firms={firms.map((f) => f.name)} firm={firm?.name} projectId={project?.id} /></div>
    </div>
  );
}
