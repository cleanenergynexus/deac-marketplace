import Link from "next/link";

/** Switch between the two ways to create a listing. Keeps the developer when started from the Developer CRM. */
export function NewListingTabs({ active, developer }: { active: "manual" | "import"; developer?: { id: string; company: string } | null }) {
  const q = developer ? `?developerId=${developer.id}` : "";
  const tab = (key: "manual" | "import", href: string, label: string, hint: string) => (
    <Link href={href + q} aria-current={active === key ? "page" : undefined}
      className={`flex-1 rounded-lg border p-4 text-sm ${active === key ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500" : "border-slate-200 bg-white hover:border-slate-300"}`}>
      <div className="font-semibold">{label}</div>
      <div className="mt-0.5 text-slate-500">{hint}</div>
    </Link>
  );
  return (
    <div className="mb-6 space-y-3">
      {developer && <Link href={`/admin/developers/${developer.id}`} className="text-sm text-brand-600">← {developer.company}</Link>}
      <div className="flex flex-col gap-3 sm:flex-row">
        {tab("manual", "/admin/projects/new", "Enter the details", "Fill in the listing form yourself.")}
        {tab("import", "/admin/projects/import", "Import from a document", "Upload a teaser or offering memo and Claude prefills the listing.")}
      </div>
    </div>
  );
}
