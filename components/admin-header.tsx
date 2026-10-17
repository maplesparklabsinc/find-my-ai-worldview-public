// The header on every admin page: the site name, a "read only" tag, the admin
// pages, and whatever the page adds on the right.
import type { ReactNode } from "react";

const PAGES = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/research", label: "Research checks" },
  { href: "/admin/responses", label: "Responses" },
  { href: "/admin/perspectives", label: "Perspectives" },
  { href: "/admin/download", label: "Download data" },
] as const;

export function AdminHeader({ current, children }: { current: (typeof PAGES)[number]["href"]; children?: ReactNode }) {
  return (
    <header className="flex flex-col border-b border-line wrap-anywhere">
      <div className="flex min-h-16 flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-[1.0625rem] font-bold">Find My AI Worldview</span>
          <span className="rounded-pill border border-line-strong px-2 py-0.5 text-sm font-semibold text-ink-muted">
            Admin · read only
          </span>
        </div>
        {children && <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink-muted">{children}</div>}
      </div>
      <nav aria-label="Admin pages">
        <ul className="flex flex-wrap gap-x-6">
          {PAGES.map((p) => (
            <li key={p.href}>
              <a
                href={p.href}
                aria-current={p.href === current ? "page" : undefined}
                className="inline-flex min-h-11 items-center border-b-2 border-transparent font-semibold text-ink-muted no-underline aria-[current=page]:border-accent aria-[current=page]:text-ink"
              >
                {p.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
