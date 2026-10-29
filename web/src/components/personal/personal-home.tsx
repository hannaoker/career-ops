import Link from "next/link";
import type { PersonalDashboard } from "@/lib/personal-dashboard";
import { RefreshFromSheetButton } from "./refresh-button";
import { CategoryBadge, Section, formatPacific } from "./shared";

const ACTION_LABEL: Record<string, string> = { overdue: "Overdue", interview: "Interview", "waiting-on-me": "Waiting on me" };

export function PersonalHome({ dashboard }: { dashboard: PersonalDashboard }) {
  const { metrics } = dashboard;
  const tiles: Array<[string, number, string]> = [
    ["Active", metrics.active, "/pipeline"],
    ["Overdue follow-ups", metrics.overdue, "/followups"],
    ["Waiting on me", metrics.waitingOnMe, "/followups"],
    ["Interviews scheduled", metrics.interviews, "/followups"],
    ["On hold", metrics.onHold, "/pipeline"],
    ["Closed", metrics.closed, "/pipeline"],
  ];
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="flex flex-col justify-between gap-4 rounded-2xl border border-border bg-surface/40 p-6 sm:flex-row sm:items-end">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-brand">Personal job search</p>
          <h1 className="mt-2 text-3xl font-semibold text-foreground">Your job search, at a glance</h1>
          <p className="mt-2 text-sm text-muted">Read-only snapshot of the “2026 Jobs V4” Google Sheet. Last refreshed {formatPacific(dashboard.generatedAt)}.</p>
        </div>
        <RefreshFromSheetButton />
      </header>

      <section aria-label="Pipeline metrics" className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {tiles.map(([label, value, href]) => (
          <Link key={label} href={href} className="rounded-xl border border-border bg-background/50 p-4 hover:border-brand">
            <p className="text-xs uppercase tracking-[0.1em] text-muted">{label}</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums text-foreground" data-metric={label}>{value}</p>
          </Link>
        ))}
      </section>

      <Section title="By status category">
        <ul className="flex flex-wrap gap-2">
          {dashboard.categoryCounts.map(({ label, count }) => (
            <li key={label} className="flex items-center gap-2 rounded-lg border border-border bg-background/50 px-3 py-1.5 text-sm">
              <CategoryBadge category={label === "Uncategorized" ? "" : label} />
              {label === "Uncategorized" ? <span className="text-muted">Uncategorized</span> : null}
              <span className="tabular-nums text-foreground">{count}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Prioritized action queue" aside={<Link href="/followups" className="text-xs text-brand">All follow-ups →</Link>}>
        {dashboard.actions.length === 0 ? <p className="text-sm text-muted">Nothing needs you right now.</p> : (
          <ol className="divide-y divide-border">
            {dashboard.actions.map((action) => (
              <li key={`${action.kind}-${action.id}`} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-baseline sm:gap-4">
                <span className={`w-28 shrink-0 text-xs font-medium uppercase tracking-[0.08em] ${action.kind === "overdue" ? "text-red-600 dark:text-red-400" : action.kind === "interview" ? "text-emerald-700 dark:text-emerald-400" : "text-muted"}`}>{ACTION_LABEL[action.kind]}</span>
                <span className="w-56 shrink-0 font-medium text-foreground">{action.company}</span>
                <span className="flex-1 text-sm text-muted">{action.nextAction || action.role}</span>
                <span className="shrink-0 text-xs tabular-nums text-faint">{action.dueDate}</span>
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Section title="Top ranked opportunities">
        {dashboard.topRanked.length === 0 ? <p className="text-sm text-muted">No ranked opportunities in the snapshot.</p> : (
          <ul className="grid gap-3 md:grid-cols-2">
            {dashboard.topRanked.map((item) => (
              <li key={`${item.rank}-${item.company}`} className="rounded-xl border border-border bg-background/50 p-4">
                <p className="text-sm text-foreground"><span className="mr-2 tabular-nums text-brand">#{item.rank}</span><span className="font-medium">{item.company}</span>{item.tier ? <span className="ml-2 text-xs text-muted">Tier {item.tier}</span> : null}{item.score !== null ? <span className="ml-2 text-xs text-muted">score {item.score}</span> : null}</p>
                {item.gate ? <p className="mt-1 text-xs text-muted">Gate: {item.gate}</p> : null}
                {item.rationale ? <p className="mt-1 line-clamp-3 text-xs text-faint">{item.rationale}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </main>
  );
}
