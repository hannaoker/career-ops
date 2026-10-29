// One-at-a-time coordinator for "Refresh from Google Sheet".
// The route injects the real exporter; tests inject fakes.

// How to launch scripts/export-google-sheet.py. uv is preferred: the scripts
// declare their dependencies inline (PEP 723), so `uv run` provides openpyxl.
// launchd has a minimal PATH, so the launch agent sets CAREER_OPS_UV to uv's
// absolute path. CAREER_OPS_PYTHON (an interpreter that already has openpyxl)
// is the fallback; with neither set, `uv` is looked up on PATH.
export function exporterCommand(env, scriptPath) {
  const uv = (env.CAREER_OPS_UV || '').trim();
  const python = (env.CAREER_OPS_PYTHON || '').trim();
  if (uv) return { file: uv, args: ['run', '--quiet', '--script', scriptPath] };
  if (python) return { file: python, args: [scriptPath] };
  return { file: 'uv', args: ['run', '--quiet', '--script', scriptPath] };
}

const ADC_LOGIN = 'gcloud auth application-default login --scopes=openid,https://www.googleapis.com/auth/userinfo.email,https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/spreadsheets.readonly,https://www.googleapis.com/auth/drive.readonly';

// Human-readable, secret-free explanations for the exporter's failure stages.
export const FAILURE_HINTS = {
  config: 'No sheet configured: write the spreadsheet ID to data/google-sheet-id.txt or set CAREER_OPS_SHEET_ID.',
  credentials: `No Google credentials: Application Default Credentials (ADC) are missing. Run: ${ADC_LOGIN} (if Google blocks it, see docs/PERSONAL_GOOGLE_SHEET_DASHBOARD.md)`,
  token: `Google credentials could not be refreshed (expired or revoked). Run: ${ADC_LOGIN}`,
  scopes: `Google credentials lack the Sheets/Drive read-only scopes. Run: ${ADC_LOGIN}`,
  'api-disabled': 'The Google Drive API is not enabled for the credential\'s Cloud project (or no quota project is set).',
  'not-found': 'The sheet was not found or is not shared with the signed-in Google account.',
  download: 'Google did not return the sheet export.',
  import: 'The exported workbook could not be imported (check the Pipeline tab headers).',
  unknown: 'Google Sheet refresh failed; run `uv run scripts/export-google-sheet.py` in the repo for details.',
};

export function createPersonalDashboardSync({ runExporter, readSnapshot, validate }) {
  let inFlight = false;
  return async function sync() {
    if (inFlight) return { status: 409, body: { error: 'A Google Sheet refresh is already running' } };
    inFlight = true;
    try {
      let result;
      try {
        result = await runExporter();
      } catch {
        result = { outcome: 'failed', detail: '' };
      }
      if (result.outcome === 'timeout') return { status: 504, body: { error: 'Google Sheet refresh timed out' } };
      if (result.outcome !== 'ok') {
        const detail = result.detail || '';
        return { status: 502, body: { error: 'Google Sheet refresh failed', detail, hint: FAILURE_HINTS[detail] || FAILURE_HINTS.unknown } };
      }
      try {
        const snapshot = readSnapshot();
        if (!validate(snapshot)) throw new Error('invalid');
        return { status: 200, body: { ok: true, generatedAt: snapshot.generatedAt } };
      } catch {
        return { status: 500, body: { error: 'Google Sheet refresh produced an invalid snapshot' } };
      }
    } finally {
      inFlight = false;
    }
  };
}
