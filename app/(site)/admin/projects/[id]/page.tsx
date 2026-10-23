import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { addDocument, deleteDocument, saveValuation, updateProject } from "@/app/actions/admin";
import { ProjectForm } from "@/components/ProjectForm";
import { Calculator } from "@/components/Calculator";
import { Badge, Field, PageHeader, Section, Select, statusTone } from "@/components/ui";
import { DOC_CATEGORIES } from "@/lib/constants";
import { DEFAULT_INPUTS, parseInputs, type ValuationInputs } from "@/lib/valuation";
import { usd } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ProjectAdmin({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [p, developers] = await Promise.all([
    db.project.findUnique({ where: { id }, include: { documents: true, lois: { include: { investor: true } }, developer: true } }),
    db.developer.findMany({ select: { id: true, company: true }, orderBy: { company: "asc" } }),
  ]);
  if (!p) notFound();

  // Pre-fill the calculator from listing data when it hasn't been scored yet.
  const assetMap: Record<string, string> = { "Powered Land": "Powered Land", "Powered Shell": "Powered Shell", "Mining Facility": "Mining Facility", "Industrial Conversion": "Industrial Conversion", "Old Data Center": "Old Data Center" };
  const initial: ValuationInputs = parseInputs(p.valuationInputs) ?? {
    ...DEFAULT_INPUTS,
    assetType: assetMap[p.facilityType] ?? "Powered Shell",
    mw: p.mw,
    powerStatus: p.powerStatus ?? DEFAULT_INPUTS.powerStatus,
    monthsToPower: p.monthsToPower ?? DEFAULT_INPUTS.monthsToPower,
    powerRateCents: p.powerRateCents ?? DEFAULT_INPUTS.powerRateCents,
    askingPrice: p.dealType === "SALE" ? p.fundingNeeded : 0,
  };
  const save = async (inputs: ValuationInputs) => { "use server"; return saveValuation(id, inputs); };

  return (
    <div className="space-y-6">
      <Link href="/admin/projects" className="text-sm text-brand-600">← Listings</Link>
      <PageHeader title={p.title} subtitle={<>{p.code} · <Link href={`/admin/developers/${p.developerId}`} className="text-brand-600">{p.developer.company}</Link> · <Badge tone={statusTone(p.visibility)}>{p.visibility}</Badge></>}
        action={<Link href={`/marketplace/${p.id}`} className="btn-ghost">Preview as investor</Link>} />
      <Section title="Listing"><ProjectForm p={p} developers={developers} action={updateProject} /></Section>

      <Section title="Documents">
        <table className="w-full"><thead><tr><th className="th">Name</th><th className="th">Category</th><th className="th">Access</th><th className="th"></th></tr></thead>
          <tbody className="divide-y divide-slate-100">{p.documents.map((d) => (
            <tr key={d.id}><td className="td"><a href={d.url} target="_blank" className="text-brand-600">{d.name}</a></td><td className="td">{d.category}</td><td className="td"><Badge tone={d.access === "SUMMARY" ? "blue" : "purple"}>{d.access === "SUMMARY" ? "All members" : "Data room"}</Badge></td>
              <td className="td text-right"><form action={deleteDocument}><input type="hidden" name="id" value={d.id} /><button className="text-xs text-red-600">Remove</button></form></td></tr>
          ))}</tbody></table>
        <form action={addDocument} className="mt-4 grid gap-3 sm:grid-cols-5">
          <input type="hidden" name="projectId" value={p.id} />
          <Field label="Name"><input name="name" required className="input" /></Field>
          <Field label="Link (Drive, SharePoint, S3…)" className="sm:col-span-2"><input name="url" required className="input" /></Field>
          <Field label="Category"><Select name="category" options={DOC_CATEGORIES} /></Field>
          <Field label="Access"><select name="access" className="input"><option value="DATAROOM">Data room (after LOI)</option><option value="SUMMARY">All approved members</option></select></Field>
          <div><button className="btn-ghost">Add document</button></div>
        </form>
      </Section>

      <Section title="LOIs">
        {p.lois.length ? <ul className="divide-y divide-slate-100 text-sm">{p.lois.map((l) => <li key={l.id} className="flex justify-between py-2"><Link href={`/admin/investors/${l.investorId}`} className="text-brand-600">{l.investor.name} ({l.investor.firm})</Link><span>{usd(l.amount)} <Badge tone={statusTone(l.status)}>{l.status}</Badge></span></li>)}</ul> : <p className="text-sm text-slate-500">None yet.</p>}
      </Section>

      <div id="valuation">
        <Section title="Valuation & lead score (internal only)">
          <Calculator initial={initial} onSave={save} />
        </Section>
      </div>
    </div>
  );
}
