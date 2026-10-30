import { formatPhone, telHref } from "@/lib/phone";

export type Partner = { name: string; email: string; phone: string | null; bookingUrl: string | null };

/** The referral agent's DEAC partner: who supports their deals and schedules their meetings. */
export function PartnerCard({ partner }: { partner: Partner | null }) {
  if (!partner) {
    return (
      <div className="card p-5 text-sm">
        <h2 className="font-semibold">Your DEAC partner</h2>
        <p className="mt-2 text-slate-600">A partner hasn&apos;t been assigned yet. Meeting requests go to the DEAC team in the meantime.</p>
      </div>
    );
  }
  return (
    <div className="card p-5 text-sm">
      <h2 className="font-semibold">Your DEAC partner</h2>
      <p className="mt-1 text-slate-500">Supports your transactions and schedules your meetings.</p>
      <div className="mt-3 text-base font-semibold">{partner.name}</div>
      <a href={`mailto:${partner.email}`} className="block truncate text-brand-600">{partner.email}</a>
      {partner.phone && <a href={telHref(partner.phone)} className="block text-slate-700">{formatPhone(partner.phone)}</a>}
      {partner.bookingUrl && <a href={partner.bookingUrl} target="_blank" rel="noreferrer" className="btn mt-3 w-full">Book a meeting</a>}
    </div>
  );
}
