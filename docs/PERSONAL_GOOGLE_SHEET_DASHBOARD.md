# Personal Google Sheet dashboard

This branch replaces the web dashboard's `/`, `/pipeline` and `/followups`
pages with a view of a personal job-search Google Sheet whenever
`data/personal-dashboard.json` exists. Without that file the original
career-ops pages are shown.

- `/` — counts by status category, overdue / on-hold / interview tiles, an
  action queue and the top-ranked opportunities.
- `/pipeline` — every row (search, category filter, "Show closed").
- `/followups` — overdue, interviews scheduled and upcoming follow-ups.
- "Refresh from Google Sheet" calls `POST /api/personal-dashboard/sync`, which
  exports the sheet read-only and rebuilds the snapshot.

Status rules: a row is **closed** when its status category starts with `1`
(otherwise status `Closed`, otherwise a terminal outcome when both are empty);
**on hold** for category `6` or an "on hold" status; **overdue** only for
category `4` (rows with no category fall back to a past follow-up date).
Closed rows are never overdue.

## Requirements

Python runs through [uv](https://docs.astral.sh/uv/). Each script declares its
own dependencies inline (PEP 723), so there is no virtualenv to manage:

```bash
uv run scripts/export-google-sheet.py      # export + import (needs ADC, see below)
uv run scripts/sync-google-sheet.py FILE.xlsx   # import a manual XLSX export
```

## One-time setup

1. Tell the exporter which sheet to read (kept out of git):

   ```bash
   echo YOUR_SPREADSHEET_ID > data/google-sheet-id.txt
   ```

   or set `CAREER_OPS_SHEET_ID` in the server's environment.

2. Sign in with Google Application Default Credentials (ADC). The exporter
   calls `google.auth.default()` with the `spreadsheets.readonly` and
   `drive.readonly` scopes, so the ADC file
   (`~/.config/gcloud/application_default_credentials.json`) must be created
   with those scopes. Each login **replaces** the ADC file, so keep
   `cloud-platform` in the list if other tools rely on ADC:

   ```bash
   gcloud auth application-default login \
     --scopes=openid,https://www.googleapis.com/auth/userinfo.email,https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/spreadsheets.readonly,https://www.googleapis.com/auth/drive.readonly
   ```

   **If Google shows "This app is blocked" / "Access blocked"** (gcloud warns
   that `drive.readonly` and `spreadsheets.readonly` "will be blocked soon for
   the default client ID"), use your own OAuth client instead. In Google Cloud
   Console: enable the **Google Drive API**, configure the OAuth consent screen
   (External, add yourself as a test user), then Credentials → Create
   credentials → OAuth client ID → **Desktop app** → Download JSON, saved as
   `client.json` in the repo root (gitignored). Then:

   ```bash
   cd ~/Projects/career-ops && gcloud auth application-default login \
     --client-id-file=client.json \
     --scopes=openid,https://www.googleapis.com/auth/userinfo.email,https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/spreadsheets.readonly,https://www.googleapis.com/auth/drive.readonly
   ```

   With `--client-id-file`, the client's own Cloud project is used for quota,
   so the Drive API must be enabled in that project. With the default client,
   if the export fails with `api-disabled`, enable the Drive API in a project
   you own and run
   `gcloud auth application-default set-quota-project PROJECT_ID`.

3. Check it: `uv run scripts/export-google-sheet.py` prints `{"ok": true}`, or a
   one-line JSON error whose `stage` says what is wrong (`credentials` = no
   ADC, `scopes` = ADC without the Sheets/Drive scopes, `api-disabled` = quota
   project / Drive API, `not-found` = sheet not shared or wrong ID).

**Fallback (no gcloud):** `uv run scripts/authorize-google-sheet.py client.json`
stores a read-only refresh token in the macOS Keychain (service
`career-ops-google-sheet-oauth`, account `google-sheet-readonly`); the exporter
uses it only when no ADC file is found.

## Running the server (launchd)

The launch agent runs `npm run dev -- -H 127.0.0.1` in `web/`. launchd has a
minimal PATH, so set uv's absolute path in its environment:

- `CAREER_OPS_UV` — e.g. `/Users/you/.local/bin/uv` (preferred)
- `CAREER_OPS_PYTHON` — fallback interpreter that already has `openpyxl`

## Tests

```bash
uv run --with openpyxl python -m unittest tests/test_personal_google_sheet.py
cd web && npm test && npm run typecheck
```
