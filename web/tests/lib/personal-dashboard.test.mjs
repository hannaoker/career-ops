import assert from 'node:assert/strict';
import test from 'node:test';

import {
  derivePersonalDashboard,
  hasTerminalState,
  isClosed,
  isOverdue,
  localToday,
  validatePersonalSnapshot,
} from '../../src/lib/personal-dashboard.mjs';
import { createPersonalDashboardSync, exporterCommand } from '../../src/lib/personal-dashboard-sync.mjs';

const TODAY = '2026-10-28';
const CAT = 'Status category (2026-10-28)';

function snap(Pipeline, extra = {}) {
  return { schemaVersion: 1, generatedAt: '2026-10-29T06:00:00Z', sheets: { Pipeline, '2026 Jobs V4': [], ...extra } };
}

test('validates the minimal snapshot contract', () => {
  assert.equal(validatePersonalSnapshot(snap([])), true);
  assert.equal(validatePersonalSnapshot({ schemaVersion: 2, generatedAt: 'x', sheets: { Pipeline: [] } }), false);
  assert.equal(validatePersonalSnapshot({ schemaVersion: 1, generatedAt: '2026-10-29T06:00:00Z', sheets: {} }), false);
});

test('closed prefers category, then status, then outcome; hedged wording never closes', () => {
  assert.equal(isClosed({ [CAT]: '1 Rejection/closed', 'Pipeline status': 'Waiting on me' }), true);
  assert.equal(isClosed({ [CAT]: '6 On hold', 'Pipeline status': 'Closed' }), false);
  assert.equal(isClosed({ 'Pipeline status': 'Closed', Outcome: 'whatever' }), true);
  assert.equal(isClosed({ 'Pipeline status': 'Waiting on recruiter', Outcome: 'Rejected for other role' }), false);
  assert.equal(isClosed({ Outcome: 'Rejected after onsite' }), true);
  assert.equal(isClosed({ Outcome: 'Likely declined' }), false);
  assert.equal(hasTerminalState('Stalled, not rejected; no offer'), false);
  assert.equal(hasTerminalState('Waiting on rejection decision'), false);
});

test('overdue = category 4 only; date rule only without a category; closed never overdue', () => {
  assert.equal(isOverdue({ [CAT]: '4 Overdue follow-up owed by me', 'Follow-up date': '2026-12-01' }, TODAY), true);
  assert.equal(isOverdue({ [CAT]: '2 Awaiting my decision', 'Follow-up date': '2026-07-01' }, TODAY), false);
  assert.equal(isOverdue({ 'Pipeline status': 'Applied', 'Follow-up date': '2026-10-27' }, TODAY), true);
  assert.equal(isOverdue({ 'Pipeline status': 'Applied', 'Follow-up date': '2026-10-28' }, TODAY), false);
  assert.equal(isOverdue({ 'Pipeline status': 'Closed', 'Follow-up date': '2026-07-01' }, TODAY), false);
  assert.equal(isOverdue({ [CAT]: '1 Rejection/closed', 'Follow-up date': '2026-07-01' }, TODAY), false);
});

test('derived dashboard: counts, on hold, action queue, follow-ups and ranking stay consistent', () => {
  const pipeline = [
    { Company: 'Acme Robotics', 'Pipeline status': 'Waiting on me', 'Follow-up date': '2026-10-27', [CAT]: '4 Overdue follow-up owed by me', 'Next action / event': 'OVERDUE: send resume' },
    { Company: 'Globex', 'Pipeline status': 'Stalled / Hold', Outcome: 'Stalled, not rejected', [CAT]: '6 On hold' },
    { Company: 'Initech', 'Pipeline status': 'On hold', Outcome: 'Likely declined', [CAT]: '6 On hold' },
    { Company: 'Umbrella', 'Pipeline status': 'Closed', 'Follow-up date': '2026-07-01', [CAT]: '1 Rejection/closed' },
    { Company: 'Stale', 'Pipeline status': 'Waiting on me', 'Waiting on': 'Me', 'Follow-up date': '2026-07-20', [CAT]: '2 Awaiting my decision' },
    { Company: 'Hooli', 'Pipeline status': 'Interview scheduled', 'Follow-up date': '2026-11-02', [CAT]: '5 Interview scheduled' },
    { Company: 'Stark Labs', 'Pipeline status': 'Waiting on recruiter', 'Follow-up date': '2026-11-05', [CAT]: '3 Awaiting recruiter' },
  ];
  const opportunities = [
    { Company: 'Umbrella', 'Opportunity rank': 1, Gate: 'Closed - rejected' },
    { Company: 'Stark Labs', 'Opportunity rank': 2, Tier: 'S', 'Weighted score': 4.1, Gate: 'Conditional' },
  ];
  const d = derivePersonalDashboard(snap(pipeline, { '2026 Jobs V4': opportunities }), { today: TODAY });
  assert.deepEqual(d.metrics, { total: 7, active: 6, closed: 1, overdue: 1, waitingOnMe: 2, interviews: 1, onHold: 2 });
  assert.deepEqual(d.followups.overdue.map((l) => l.company), ['Acme Robotics']);
  assert.deepEqual(d.followups.upcoming.map((l) => l.company), ['Stark Labs']);
  assert.deepEqual(d.actions.map((a) => [a.kind, a.company]), [['overdue', 'Acme Robotics'], ['interview', 'Hooli'], ['waiting-on-me', 'Stale']]);
  assert.equal(d.leads.find((l) => l.company === 'Stale').overdue, false); // past date but categorized
  assert.deepEqual(d.leads.filter((l) => l.onHold).map((l) => l.company), ['Globex', 'Initech']);
  assert.deepEqual(d.topRanked.map((r) => r.company), ['Stark Labs']);
  assert.ok(d.categoryCounts.some((c) => c.label === '6 On hold' && c.count === 2));
});

test('localToday uses the Pacific calendar day', () => {
  assert.equal(localToday(new Date('2026-10-29T06:30:00Z')), '2026-10-28');
});

test('sync coordinator: single flight, failure detail, invalid snapshot', async () => {
  let release;
  const slow = createPersonalDashboardSync({
    runExporter: () => new Promise((resolve) => { release = () => resolve({ outcome: 'ok' }); }),
    readSnapshot: () => snap([]),
    validate: validatePersonalSnapshot,
  });
  const first = slow();
  assert.equal((await slow()).status, 409);
  release();
  assert.equal((await first).status, 200);

  const failing = createPersonalDashboardSync({ runExporter: async () => ({ outcome: 'failed', detail: 'credentials' }), readSnapshot: () => null, validate: () => false });
  const failed = await failing();
  assert.equal(failed.status, 502);
  assert.equal(failed.body.detail, 'credentials');
  assert.match(failed.body.hint, /Application Default Credentials.*gcloud auth application-default login .*drive\.readonly/);

  const invalid = createPersonalDashboardSync({ runExporter: async () => ({ outcome: 'ok' }), readSnapshot: () => ({}), validate: validatePersonalSnapshot });
  assert.equal((await invalid()).status, 500);
});

test('exporter command prefers uv, falls back to CAREER_OPS_PYTHON, then uv on PATH', () => {
  const script = '/repo/scripts/export-google-sheet.py';
  assert.deepEqual(exporterCommand({ CAREER_OPS_UV: '/u/bin/uv', CAREER_OPS_PYTHON: '/usr/bin/python3' }, script),
    { file: '/u/bin/uv', args: ['run', '--quiet', '--script', script] });
  assert.deepEqual(exporterCommand({ CAREER_OPS_PYTHON: '/usr/bin/python3' }, script), { file: '/usr/bin/python3', args: [script] });
  assert.deepEqual(exporterCommand({}, script), { file: 'uv', args: ['run', '--quiet', '--script', script] });
});
