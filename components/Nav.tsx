import Link from "next/link";
import Image from "next/image";
import { getSession } from "@/lib/auth";

export async function Nav() {
  const s = await getSession();
  return (
    <header className="bg-brand-900 text-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex shrink-0 items-center gap-3 font-semibold tracking-tight" aria-label="DEAC Marketplace home">
          <Image src="/brand/deac-logo-white.png" alt="DEAC — Distributed Energy and Compute" width={1200} height={351} priority className="h-9 w-auto" />
          <span className="hidden border-l border-white/25 pl-3 text-sm text-slate-200 sm:inline">Marketplace</span>
        </Link>
        <nav className="flex items-center gap-5 text-sm text-slate-200">
          {s && (s.role === "ADMIN" || s.status === "APPROVED") && <Link href="/marketplace">Opportunities</Link>}
          {s?.role === "INVESTOR" && <Link href="/portal">My Portal</Link>}
          {s?.role === "ADMIN" && <Link href="/admin">Admin</Link>}
          {!s && <Link href="/developers/submit">Submit a Project</Link>}
          {!s && <Link href="/apply">Request Access</Link>}
          {s ? (
            <form action="/logout" method="post"><button className="text-slate-300 hover:text-white">Sign out</button></form>
          ) : (
            <Link href="/login" className="rounded-md bg-white/10 px-3 py-1.5 hover:bg-white/20">Sign in</Link>
          )}
        </nav>
      </div>
    </header>
  );
}
