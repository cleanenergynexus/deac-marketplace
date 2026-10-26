import Link from "next/link";
import { getSession } from "@/lib/auth";

export async function Nav() {
  const s = await getSession();
  return (
    <header className="bg-brand-900 text-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-bold tracking-tight">
          <span className="rounded bg-brand-500 px-1.5 py-0.5 text-xs">DEAC</span> Marketplace
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
