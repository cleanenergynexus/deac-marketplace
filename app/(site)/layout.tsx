import Image from "next/image";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { COMPANY_URL, COMPANY_LINKS } from "@/lib/site";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
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
          <span>© 2026 DEAC. Listings are confidential and provided to qualified investors only.</span>
        </div>
      </footer>
    </>
  );
}
