import Image from "next/image";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { Suspense } from "react";
import { COMPANY_URL, COMPANY_LINKS } from "@/lib/site";
import { getSession } from "@/lib/auth";
import { ActivityTracker } from "@/components/ActivityTracker";
import { TRACK_VISITORS } from "@/lib/activity";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  // Platform activity (lib/activity.ts): investors, referral agents and visitors. The DEAC team isn't tracked.
  const s = await getSession();
  const track = s ? s.role !== "ADMIN" : TRACK_VISITORS;
  return (
    <>
      {track && <Suspense fallback={null}><ActivityTracker visitor={!s} /></Suspense>}
      <Nav />
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
      {/* Same footer as the company website. */}
      <footer className="mt-10 bg-brand-900 text-sm text-[#A9B6D3]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-5 px-4 py-7">
          <a href={COMPANY_URL} aria-label="DEAC home"><Image src="/brand/deac-logo-white.png" alt="DEAC" width={1200} height={351} className="h-[30px] w-auto" /></a>
          <nav className="flex flex-wrap gap-5">
            {COMPANY_LINKS.map(([label, href]) => <a key={label} href={href} className="hover:text-white">{label}</a>)}
            <Link href="/" className="hover:text-white">Marketplace</Link>
          </nav>
          <span>© 2026 DEAC. Listings are confidential and provided to qualified investors only. We record activity on the marketplace (pages viewed, time on page, clicks and documents opened) to support your deals.</span>
        </div>
      </footer>
    </>
  );
}
