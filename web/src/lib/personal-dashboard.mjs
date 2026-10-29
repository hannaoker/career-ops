// Pure derivation for the personal job-search dashboard.
//
// Input: the private snapshot written by scripts/sync-google-sheet.py
// (data/personal-dashboard.json). Output: plain JSON the pages render.
// No I/O here so the rules stay unit-testable.
//
// Rules (agreed with the owner, 2026-10-28):
// - Closed: status category starts with "1"; otherwise the Pipeline status
//   says closed/rejected/declined/...; the free-text Outcome is consulted only
//   when both are empty. Hedged wording ("not rejected", "Likely declined")
//   never closes a lead.
// - On hold: status category "6", or a status that says hold.
// - Overdue: status category starts with "4". The past-follow-up-date rule is
//   used only for rows that have no category at all. Closed is never overdue.

export const PERSONAL_TIME_ZONE = 'America/Los_Angeles';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeHeader(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function text(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

/** First column whose normalized header equals one of the aliases. */
function read(row, ...aliases) {
  if (!isPlainObject(row)) return '';
  const wanted = new Set(aliases.map(normalizeHeader));
  const entry = Object.entries(row).find(([key]) => wanted.has(normalizeHeader(key)));
  return entry ? entry[1] : '';
}

/** First column whose normalized header starts with the prefix (e.g. dated headers). */
function readPrefix(row, prefix) {
  if (!isPlainObject(row)) return '';
  const wanted = normalizeHeader(prefix);
  const entry = Object.entries(row).find(([key]) => {
    const header = normalizeHeader(key);
    return header === wanted || header.startsWith(`${wanted} `);
  });
  return entry ? entry[1] : '';
}

function numberOrNull(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number.parseFloat(text(value));
  return Number.isFinite(parsed) ? parsed : null;
}

/** "YYYY-MM-DD" (optionally followed by a time) -> "YYYY-MM-DD", else "". */
export function isoDay(value) {
  const match = text(value).match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/);
  if (!match) return '';
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (date.getUTCFullYear() !== Number(y) || date.getUTCMonth() !== Number(m) - 1 || date.getUTCDate() !== Number(d)) return '';
  return `${y}-${m}-${d}`;
}

/** Today's calendar date in the owner's time zone, as YYYY-MM-DD. */
export function localToday(now = new Date(), timeZone = PERSONAL_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (type) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

const TERMINAL_WORDS = '(?:accepted|closed|declined|hired|rejected|withdrawn|passed)';
const HEDGED_TERMINAL = new RegExp(
  `\\b(?:not|never|no|likely|possibly|probably|maybe|perhaps|potentially|if|unless|pending)\\s+(?:yet\\s+|been\\s+|be\\s+)*${TERMINAL_WORDS}\\b`,
  'g',
);
const TERMINAL = new RegExp(`\\b${TERMINAL_WORDS}\\b`);

export function hasTerminalState(value) {
  const lower = text(value).toLowerCase();
  if (!lower) return false;
  if (/\bnot\s+pursuing\b/.test(lower)) return true;
  return TERMINAL.test(lower.replace(HEDGED_TERMINAL, ' '));
}

export function statusCategory(row) {
  return text(readPrefix(row, 'status category'));
}

export function categoryNumber(row) {
  const match = statusCategory(row).match(/^(\d+)/);
  return match ? Number(match[1]) : null;
}

function statusOf(row) {
  return text(read(row, 'pipeline status', 'status'));
}

export function isClosed(row) {
  const category = categoryNumber(row);
  if (category !== null) return category === 1;
  const status = statusOf(row);
  if (status) return hasTerminalState(status);
  return hasTerminalState(read(row, 'outcome'));
}

export function isOnHold(row) {
  if (isClosed(row)) return false;
  if (categoryNumber(row) === 6) return true;
  return /\b(?:on hold|hold)\b/.test(statusOf(row).toLowerCase());
}

function followUpDay(row) {
  return isoDay(read(row, 'follow-up date', 'follow up date', 'next follow-up'));
}

export function isOverdue(row, today) {
  if (isClosed(row)) return false;
  const category = categoryNumber(row);
  if (category !== null) return category === 4;
  const due = followUpDay(row);
  return Boolean(due) && due < today;
}

export function waitsOnMe(row) {
  const status = statusOf(row).toLowerCase().replace(/\s+/g, ' ');
  if (/^waiting on me(?:$|[\s\u2010-\u2015-])/u.test(status)) return true;
  const owner = text(read(row, 'waiting on')).toLowerCase();
  return owner === 'me' || /^me\s*[\u2010-\u2015-]\s*\S/u.test(owner);
}

export function isInterview(row) {
  const category = categoryNumber(row);
  if (category !== null) return category === 5;
  return /\binterview scheduled\b/.test(statusOf(row).toLowerCase());
}

function companyKey(value) {
  return text(value).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function validatePersonalSnapshot(value) {
  return isPlainObject(value)
    && value.schemaVersion === 1
    && typeof value.generatedAt === 'string'
    && !Number.isNaN(Date.parse(value.generatedAt))
    && isPlainObject(value.sheets)
    && Array.isArray(value.sheets.Pipeline)
    && value.sheets.Pipeline.every(isPlainObject);
}

function toLead(row, index, today) {
  const closed = isClosed(row);
  return {
    id: index,
    company: text(read(row, 'company')),
    role: text(read(row, 'role')),
    status: statusOf(row),
    category: statusCategory(row),
    categoryNumber: categoryNumber(row),
    stage: text(read(row, 'current stage', 'stage')),
    lastContact: isoDay(read(row, 'last contact')) || text(read(row, 'last contact')),
    nextAction: text(read(row, 'next action / event', 'next action')),
    followUpDate: followUpDay(row),
    waitingOn: text(read(row, 'waiting on')),
    recruiter: text(read(row, 'primary recruiter', 'recruiter')),
    recruitingFirm: text(read(row, 'recruiting firm')),
    outcome: text(read(row, 'outcome')),
    liveRank: numberOrNull(read(row, 'main rank (live)', 'live rank')),
    conversationLink: text(read(row, 'conversation link')),
    closed,
    onHold: isOnHold(row),
    overdue: isOverdue(row, today),
    waitingOnMe: !closed && waitsOnMe(row),
    interview: !closed && isInterview(row),
  };
}

function byDueThenCompany(a, b) {
  return (a.followUpDate || '9999').localeCompare(b.followUpDate || '9999') || a.company.localeCompare(b.company);
}

export function derivePersonalDashboard(snapshot, options = {}) {
  if (!validatePersonalSnapshot(snapshot)) throw new TypeError('Invalid personal dashboard snapshot');
  const now = options.now instanceof Date ? options.now : new Date();
  const today = options.today || localToday(now);

  const leads = snapshot.sheets.Pipeline
    .map((row, index) => toLead(row, index, today))
    .filter((lead) => lead.company);
  const active = leads.filter((lead) => !lead.closed);

  const categoryCounts = {};
  for (const lead of leads) {
    const label = lead.category || 'Uncategorized';
    categoryCounts[label] = (categoryCounts[label] ?? 0) + 1;
  }

  const metrics = {
    total: leads.length,
    active: active.length,
    closed: leads.length - active.length,
    overdue: active.filter((lead) => lead.overdue).length,
    waitingOnMe: active.filter((lead) => lead.waitingOnMe).length,
    interviews: active.filter((lead) => lead.interview).length,
    onHold: active.filter((lead) => lead.onHold).length,
  };

  const actions = active.flatMap((lead) => {
    let kind;
    let priority;
    if (lead.overdue) [kind, priority] = ['overdue', 0];
    else if (lead.interview) [kind, priority] = ['interview', 1];
    else if (lead.waitingOnMe && !lead.onHold) [kind, priority] = ['waiting-on-me', 2];
    else return [];
    return [{ kind, priority, id: lead.id, company: lead.company, role: lead.role, nextAction: lead.nextAction, dueDate: lead.followUpDate, category: lead.category }];
  }).sort((a, b) => a.priority - b.priority || byDueThenCompany(a, b));

  const overdue = active.filter((lead) => lead.overdue).sort(byDueThenCompany);
  const upcoming = active
    .filter((lead) => !lead.overdue && !lead.onHold && !lead.interview && lead.followUpDate && lead.followUpDate >= today)
    .sort(byDueThenCompany);

  const closedCompanies = new Set();
  const activeCompanies = new Set(active.map((lead) => companyKey(lead.company)));
  for (const lead of leads) if (lead.closed) closedCompanies.add(companyKey(lead.company));
  const opportunities = Array.isArray(snapshot.sheets['2026 Jobs V4']) ? snapshot.sheets['2026 Jobs V4'] : [];
  const topRanked = opportunities
    .filter(isPlainObject)
    .map((row) => ({
      company: text(read(row, 'company')),
      rank: numberOrNull(read(row, 'opportunity rank', 'rank')),
      tier: text(read(row, 'tier')),
      score: numberOrNull(read(row, 'weighted score', 'combined score', 'score')),
      gate: text(read(row, 'gate')),
      rationale: text(read(row, 'decision rationale', 'rationale')),
    }))
    .filter((item) => item.company && item.rank !== null)
    .filter((item) => !/^closed\b/i.test(item.gate))
    .filter((item) => {
      const key = companyKey(item.company);
      return !(closedCompanies.has(key) && !activeCompanies.has(key));
    })
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 8);

  return {
    generatedAt: snapshot.generatedAt,
    today,
    sectionSources: isPlainObject(snapshot.sectionSources) ? snapshot.sectionSources : {},
    metrics,
    categoryCounts: Object.entries(categoryCounts)
      .sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }))
      .map(([label, count]) => ({ label, count })),
    actions,
    followups: { overdue, upcoming },
    leads,
    topRanked,
  };
}
