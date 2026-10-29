"use client";

import { useMemo, useState } from "react";
import type { PersonalLead } from "@/lib/personal-dashboard";
import { CategoryBadge } from "./shared";

export function PersonalPipeline({ leads, refreshedLabel }: { leads: PersonalLead[]; refreshedLabel: string }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [showClosed, setShowClosed] = useState(true);
  const categories = useMemo(() => [...new Set(leads.map((lead) => lead.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "en", { numeric: true })), [leads]);
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return leads.filter((lead) => (showClosed || !lead.closed)
      && (!category || lead.category === category)
      && (!needle || [lead.company, lead.role, lead.recruiter, lead.status, lead.nextAction].join(" ").toLowerCase().includes(needle)));
  }, [leads, query, category, showClosed]);

  return (
    <main className="mx-auto max-w-[96rem] px-4 py-8 sm:px-6">
      <h1 className="text-3xl font-semibold text-foreground">Pipeline</h1>
      <p className="mt-2 text-sm text-muted">Every row of the Pipeline tab, including closed outcomes. Last refreshed {refreshedLabel}.</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input aria-label="Search pipeline" placeholder="Search company, role, recruiter…" value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-64 rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
        <select aria-label="Filter by status category" value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
          <option value="">All categories</option>
          {categories.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" checked={showClosed} onChange={(event) => setShowClosed(event.target.checked)} />Show closed</label>
      </div>
      <p role="status" className="mt-3 text-xs text-muted">{rows.length} of {leads.length} rows</p>
      <div className="mt-3 overflow-x-auto rounded-xl border border-border">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-surface/60 text-xs uppercase tracking-[0.08em] text-muted">
            <tr>{["Company / role", "Status", "Category", "Stage", "Last contact", "Next action", "Follow-up", "Waiting on", "Recruiter", "Outcome"].map((h) => <th key={h} className="px-3 py-2.5 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((lead) => (
              <tr key={lead.id} className={lead.closed ? "opacity-55" : ""}>
                <td className="px-3 py-2.5 align-top"><p className="font-medium text-foreground">{lead.company}</p><p className="text-xs text-muted">{lead.role}</p></td>
                <td className="px-3 py-2.5 align-top text-muted">{lead.status || "—"}{lead.overdue ? <span className="ml-1 text-xs font-semibold text-red-600 dark:text-red-400">OVERDUE</span> : null}</td>
                <td className="px-3 py-2.5 align-top"><CategoryBadge category={lead.category} /></td>
                <td className="px-3 py-2.5 align-top text-muted">{lead.stage}</td>
                <td className="px-3 py-2.5 align-top tabular-nums text-muted">{lead.lastContact}</td>
                <td className="max-w-md px-3 py-2.5 align-top text-muted">{lead.nextAction}</td>
                <td className="px-3 py-2.5 align-top tabular-nums text-muted">{lead.followUpDate}</td>
                <td className="px-3 py-2.5 align-top text-muted">{lead.waitingOn}</td>
                <td className="px-3 py-2.5 align-top text-muted">{lead.recruiter}{lead.recruitingFirm ? <span className="block text-xs text-faint">{lead.recruitingFirm}</span> : null}</td>
                <td className="max-w-xs px-3 py-2.5 align-top text-muted">{lead.outcome}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
