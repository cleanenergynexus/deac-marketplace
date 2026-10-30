import Link from "next/link";
import Image from "next/image";
import { getSession } from "@/lib/auth";
import { COMPANY_URL, COMPANY_LINKS } from "@/lib/site";

// Same header as the company website (deacna.com): logo, main menu, then marketplace account links.
export async function Nav() {
  const s = await getSession();
  const link = "text-[15px] font-medium text-[#A9B6D3] hover:text-white";
  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-brand-900 text-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-5 px-4 py-3.5">
        <a href={COMPANY_URL} className="flex shrink-0 items-center" aria-label="DEAC home">
          <Image src="/brand/deac-logo-white.png" alt="DEAC — Distributed Energy and Compute" width={1200} height={351} priority className="h-[38px] w-auto" />
        </a>
        <nav className="flex items-center gap-6">
          {COMPANY_LINKS.map(([label, href]) => (
            <a key={label} href={href} className={`hidden xl:inline ${link}`}>{label}</a>
          ))}
          <Link href="/" className="text-[15px] font-semibold text-white">Marketplace</Link>
          {s && (s.role === "ADMIN" || s.role === "AGENT" || (s.role === "INVESTOR" && s.status === "APPROVED")) && <Link href="/marketplace" className={link}>Opportunities</Link>}
          {s?.role === "INVESTOR" && <Link href="/portal" className={link}>My Portal</Link>}
          {s?.role === "ADMIN" && <Link href="/admin" className={link}>Admin</Link>}
          {s?.role === "AGENT" && <Link href="/agent" className={link}>Agent portal</Link>}
          {!s && <Link href="/developers/submit" className={`hidden md:inline ${link}`}>Submit a project</Link>}
          {s ? (
            <form action="/logout" method="post"><button className={link}>Sign out</button></form>
          ) : (
            <>
              <Link href="/login" className={`hidden sm:inline ${link}`}>Sign in</Link>
              <Link href="/apply" className="rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-[#3B7FFF]">Request access</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
