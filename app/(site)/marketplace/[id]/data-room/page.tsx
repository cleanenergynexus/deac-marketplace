import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { hasDataRoomAccess, requireMember } from "@/lib/auth";
import { PageHeader, Empty } from "@/components/ui";
import { date } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DataRoom({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireMember();
  const { id } = await params;
  const p = await db.project.findUnique({ where: { id }, include: { documents: { orderBy: [{ category: "asc" }, { name: "asc" }] } } });
  if (!p) notFound();
  if (u.role !== "ADMIN" && !(await hasDataRoomAccess(id, u.investorId))) redirect(`/marketplace/${id}`);
  const groups = p.documents.reduce<Record<string, typeof p.documents>>((acc, d) => ((acc[d.category] ??= []).push(d), acc), {});
  return (
    <div>
      <Link href={`/marketplace/${id}`} className="text-sm text-brand-600">← {p.title}</Link>
      <PageHeader title="Data room" subtitle={`${p.code} · ${p.documents.length} documents · Confidential`} />
      {Object.keys(groups).length ? (
        <div className="space-y-4">
          {Object.entries(groups).map(([cat, docs]) => (
            <div key={cat} className="card">
              <div className="border-b border-slate-100 px-4 py-2 text-sm font-semibold">📁 {cat}</div>
              <ul className="divide-y divide-slate-100">
                {docs.map((d) => (
                  <li key={d.id} className="flex items-center justify-between px-4 py-2 text-sm">
                    <span>{d.name}</span>
                    <span className="flex items-center gap-4 text-xs text-slate-500">{date(d.createdAt)}<a href={d.url} target="_blank" className="font-semibold text-brand-600">Open</a></span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : <Empty>Documents are being uploaded.</Empty>}
    </div>
  );
}
