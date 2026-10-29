import "server-only";

import fs from "node:fs";
import path from "node:path";
import { careerOpsRoot } from "@/lib/career-ops";
import { derivePersonalDashboard } from "@/lib/personal-dashboard.mjs";

export type PersonalLead = {
  id: number;
  company: string;
  role: string;
  status: string;
  category: string;
  categoryNumber: number | null;
  stage: string;
  lastContact: string;
  nextAction: string;
  followUpDate: string;
  waitingOn: string;
  recruiter: string;
  recruitingFirm: string;
  outcome: string;
  liveRank: number | null;
  conversationLink: string;
  closed: boolean;
  onHold: boolean;
  overdue: boolean;
  waitingOnMe: boolean;
  interview: boolean;
};

export type PersonalAction = {
  kind: "overdue" | "interview" | "waiting-on-me";
  priority: number;
  id: number;
  company: string;
  role: string;
  nextAction: string;
  dueDate: string;
  category: string;
};

export type PersonalDashboard = {
  generatedAt: string;
  today: string;
  sectionSources: Record<string, string>;
  metrics: { total: number; active: number; closed: number; overdue: number; waitingOnMe: number; interviews: number; onHold: number };
  categoryCounts: Array<{ label: string; count: number }>;
  actions: PersonalAction[];
  followups: { overdue: PersonalLead[]; upcoming: PersonalLead[] };
  leads: PersonalLead[];
  topRanked: Array<{ company: string; rank: number; tier: string; score: number | null; gate: string; rationale: string }>;
};

export function personalSnapshotPath(): string {
  return path.join(careerOpsRoot(), "data", "personal-dashboard.json");
}

/** Read and derive the private snapshot on every request; null when absent or invalid. */
export function loadPersonalDashboard(): PersonalDashboard | null {
  try {
    const snapshot = JSON.parse(fs.readFileSync(personalSnapshotPath(), "utf8"));
    return derivePersonalDashboard(snapshot) as PersonalDashboard;
  } catch {
    return null;
  }
}
