"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export type NavItem = { href: string; label: string; count?: number; children?: { href: string; label: string }[] };

const linkCls = "flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white hover:shadow-sm";

/** Admin side menu. An item with children shows a chevron that expands its sub-pages; it opens by itself while you're on one of them. */
export function AdminNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  return (
    <aside className="space-y-1 lg:sticky lg:top-4 lg:self-start">
      {items.map((it) => {
        if (!it.children) {
          return (
            <Link key={it.href} href={it.href} className={linkCls}>
              {it.label}
              {!!it.count && <span className="rounded-full bg-amber-100 px-2 text-xs text-amber-800">{it.count}</span>}
            </Link>
          );
        }
        const inside = path.startsWith(it.href) || it.children.some((c) => path.startsWith(c.href));
        const expanded = open[it.href] ?? inside;
        return (
          <div key={it.href}>
            <div className="flex items-center">
              <Link href={it.href} onClick={() => setOpen((o) => ({ ...o, [it.href]: true }))} className={`${linkCls} flex-1`}>{it.label}</Link>
              <button type="button" aria-label={`${expanded ? "Collapse" : "Expand"} ${it.label}`} aria-expanded={expanded} onClick={() => setOpen((o) => ({ ...o, [it.href]: !expanded }))} className="rounded-md px-2 py-2 text-slate-500 hover:bg-white hover:shadow-sm">
                <svg viewBox="0 0 20 20" className={`h-4 w-4 transition-transform ${expanded ? "rotate-90" : ""}`} fill="currentColor" aria-hidden><path d="M7 5l6 5-6 5z" /></svg>
              </button>
            </div>
            {expanded && (
              <div className="ml-3 space-y-1 border-l border-slate-200 pl-2">
                {it.children.map((c) => (
                  <Link key={c.href} href={c.href} className={`${linkCls} py-1.5 ${path.startsWith(c.href) ? "bg-white text-brand-700 shadow-sm" : ""}`}>{c.label}</Link>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </aside>
  );
}
