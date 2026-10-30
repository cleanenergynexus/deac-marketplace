import Link from "next/link";
import Image from "next/image";
import { getSession } from "@/lib/auth";
import { COMPANY_URL, COMPANY_LINKS } from "@/lib/site";
import { MarketplaceTabs, type Tab } from "@/components/MarketplaceTabs";

// Same header as the company website (deacna.com), plus a second row with the marketplace pages.
export async function Nav() {
  const s = await getSession();
  const link = "text-[15px] font-medium text-[#A9B6D3] hover:text-white";
  const tabs: Tab[] = [{ label: "Overview", href: "/" }];
  if (s && (s.role === "ADMIN" || s.role === "AGENT" || (s.role === "INVESTOR" && s.status === "APPROVED"))) tabs.push({ label: "Opportunities", href: "/marketplace" });
  if (s?.role === "INVESTOR") tabs.push({ label: "My Portal", href: "/portal" });
  if (s?.role === "AGENT") tabs.push({ label: "Agent portal", href: "/agent" });
  if (s?.role === "ADMIN") tabs.push({ label: "Admin", href: "/admin" });
  if (!s) tabs.push({ label: "Submit a project", href: "/developers/submit" });
  return (
    <header className="sticky top-0 z-20">
      <div className="border-b border-white/10 bg-brand-900 text-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-5 px-4 py-3.5">
        <a href={COMPANY_URL} className="flex shrink-0 items-center" aria-label="DEAC home">
          <Image src="/brand/deac-logo-white.png" alt="DEAC — Distributed Energy and Compute" width={1200} height={351} priority className="h-[38px] w-auto" />
        </a>
        <nav className="flex items-center gap-6">
          {COMPANY_LINKS.map(([label, href]) => (
            <a key={label} href={href} className={`hidden xl:inline ${link}`}>{label}</a>
          ))}
          {/* The section you're in; the row below shows which marketplace page. */}
          <Link href="/" className="border-b-2 border-brand-500 pb-0.5 text-[15px] font-semibold text-white">Marketplace</Link>
          {s ? (
            <form action="/logout" method="post"><button className={link}>Sign out</button></form>
          ) : (
            <>
              <Link href="/login" className={`hidden sm:inline ${link}`}>Sign in</Link>
              <Link href="/apply" className="whitespace-nowrap rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-[#3B7FFF]">Request access</Link>
            </>
          )}
        </nav>
      </div>
      </div>
      <MarketplaceTabs tabs={tabs} />
    </header>
  );
}
