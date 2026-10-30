"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type Tab = { label: string; href: string };

/** Second header row: the marketplace's own pages, with the current one underlined. */
export function MarketplaceTabs({ tabs }: { tabs: Tab[] }) {
  const path = usePathname();
  const isActive = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));
  return (
    <div className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center gap-6 overflow-x-auto px-4">
        <span className="hidden shrink-0 text-xs font-semibold uppercase tracking-widest text-brand-500 sm:inline">Marketplace ›</span>
        <nav className="flex gap-6" aria-label="Marketplace">
          {tabs.map((t) => {
            const on = isActive(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={on ? "page" : undefined}
                className={`shrink-0 border-b-2 py-3 text-sm ${on ? "border-brand-500 font-semibold text-brand-900" : "border-transparent font-medium text-slate-500 hover:text-brand-900"}`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
