import type { ReactNode } from "react";

export function formatPacific(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", dateStyle: "medium", timeStyle: "short" }).format(date) + " PT";
}

export function CategoryBadge({ category }: { category: string }) {
  if (!category) return <span className="text-faint">—</span>;
  const n = Number.parseInt(category, 10);
  const tone =
    n === 1 ? "border-border text-faint"
    : n === 4 ? "border-red-500/50 text-red-600 dark:text-red-400"
    : n === 5 ? "border-emerald-500/50 text-emerald-700 dark:text-emerald-400"
    : n === 6 ? "border-amber-500/50 text-amber-700 dark:text-amber-400"
    : n === 2 ? "border-brand/60 text-brand"
    : "border-border text-muted";
  return <span className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-xs ${tone}`}>{category}</span>;
}

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="mt-6 rounded-2xl border border-border bg-surface/40 p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}
