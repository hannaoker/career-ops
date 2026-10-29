import type { PersonalDashboard, PersonalLead } from "@/lib/personal-dashboard";
import { RefreshFromSheetButton } from "./refresh-button";
import { CategoryBadge, Section, formatPacific } from "./shared";

function LeadList({ leads, empty }: { leads: PersonalLead[]; empty: string }) {
  if (leads.length === 0) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-border">
      {leads.map((lead) => (
        <li key={lead.id} className="grid gap-1 py-3 md:grid-cols-[14rem_1fr_auto] md:gap-4">
          <div><p className="font-medium text-foreground">{lead.company}</p><p className="text-xs text-muted">{lead.role}</p></div>
          <div className="text-sm text-muted">
            <p>{lead.nextAction || "—"}</p>
            <p className="mt-1 text-xs text-faint">{[lead.waitingOn && `Waiting on: ${lead.waitingOn}`, lead.recruiter && `Recruiter: ${lead.recruiter}`, lead.lastContact && `Last contact: ${lead.lastContact}`].filter(Boolean).join(" · ")}</p>
          </div>
          <div className="flex flex-col items-start gap-1 md:items-end"><CategoryBadge category={lead.category} /><span className="text-xs tabular-nums text-faint">{lead.followUpDate ? `Follow-up ${lead.followUpDate}` : ""}</span></div>
        </li>
      ))}
    </ul>
  );
}

export function PersonalFollowups({ dashboard }: { dashboard: PersonalDashboard }) {
  const interviews = dashboard.leads.filter((lead) => lead.interview);
  const { overdue, upcoming } = dashboard.followups;
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-3xl font-semibold text-foreground">Follow-ups</h1>
          <p className="mt-2 text-sm text-muted">Overdue means the sheet tags the lead “4 Overdue follow-up”. Today is {dashboard.today} (Pacific). Last refreshed {formatPacific(dashboard.generatedAt)}.</p>
        </div>
        <RefreshFromSheetButton />
      </header>
      <Section title={`Overdue (${overdue.length})`}><LeadList leads={overdue} empty="No overdue follow-ups." /></Section>
      <Section title={`Interviews scheduled (${interviews.length})`}><LeadList leads={interviews} empty="No interviews scheduled." /></Section>
      <Section title={`Upcoming follow-ups (${upcoming.length})`}><LeadList leads={upcoming} empty="No upcoming follow-up dates." /></Section>
    </main>
  );
}
