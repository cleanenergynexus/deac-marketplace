import { Nav } from "@/components/Nav";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-500">
        DEAC Marketplace · Private network. Listings are confidential and provided to qualified investors only.
      </footer>
    </>
  );
}
