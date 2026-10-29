#!/usr/bin/env python3
# /// script
# requires-python = ">=3.9"
# dependencies = [
#     "openpyxl>=3.0",
#     "google-auth>=2.20",
#     "requests>=2.28",
# ]
# ///
"""Refresh the private dashboard snapshot from one fixed Google Sheet (read-only).

Flow: get a short-lived access token -> export the sheet as XLSX through the
Drive API -> run sync-google-sheet.py on it -> delete the XLSX.

Credentials, in order:
1. Google Application Default Credentials (google.auth.default), normally the
   file written by `gcloud auth application-default login`
   (~/.config/gcloud/application_default_credentials.json). It must carry the
   spreadsheets.readonly + drive.readonly scopes; see
   docs/PERSONAL_GOOGLE_SHEET_DASHBOARD.md for the exact command.
2. Fallback: the OAuth credential stored in the macOS Keychain by
   scripts/authorize-google-sheet.py, if present.

The spreadsheet ID is read from $CAREER_OPS_SHEET_ID or, failing that, from
data/google-sheet-id.txt (gitignored), so it never lives in the repo.

Run with: uv run scripts/export-google-sheet.py

On failure it prints one secret-free JSON line to stderr with a "stage"
(config | credentials | token | scopes | api-disabled | not-found | download |
import) and exits 1.
Compatible with Python 3.6+.
"""

import json
import os
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
IMPORTER_SCRIPT = PROJECT_ROOT / "scripts" / "sync-google-sheet.py"
DEFAULT_OUTPUT = PROJECT_ROOT / "data" / "personal-dashboard.json"
SHEET_ID_FILE = PROJECT_ROOT / "data" / "google-sheet-id.txt"
XLSX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
DRIVE_READONLY_SCOPE = "https://www.googleapis.com/auth/drive.readonly"
SHEETS_READONLY_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly"
ADC_SCOPES = [SHEETS_READONLY_SCOPE, DRIVE_READONLY_SCOPE]
ADC_LOGIN_HINT = "run: gcloud auth application-default login --scopes=openid,https://www.googleapis.com/auth/userinfo.email,https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/spreadsheets.readonly,https://www.googleapis.com/auth/drive.readonly (see docs/PERSONAL_GOOGLE_SHEET_DASHBOARD.md if Google blocks it)"
TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
KEYCHAIN_SERVICE = "career-ops-google-sheet-oauth"
KEYCHAIN_ACCOUNT = "google-sheet-readonly"
KEYCHAIN_FIND_ARGV = ["security", "find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", KEYCHAIN_ACCOUNT, "-w"]
MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024
HTTP_TIMEOUT_SECONDS = 30
PROCESS_TIMEOUT_SECONDS = 90
# capture_output/text need Python 3.7; spell them out for 3.6.
CAPTURE_TEXT = {"stdout": subprocess.PIPE, "stderr": subprocess.PIPE, "universal_newlines": True}


class ExportError(RuntimeError):
    def __init__(self, stage, message):
        super(ExportError, self).__init__(message)
        self.stage = stage


def spreadsheet_id(environ=None, id_file=None):
    environ = os.environ if environ is None else environ
    value = (environ.get("CAREER_OPS_SHEET_ID") or "").strip()
    if not value:
        try:
            value = Path(id_file or SHEET_ID_FILE).read_text().strip()
        except OSError:
            value = ""
    if not value or not all(ch.isalnum() or ch in "-_" for ch in value):
        raise ExportError("config", "Set CAREER_OPS_SHEET_ID or write the sheet ID to data/google-sheet-id.txt")
    return value


def read_credential(runner=subprocess.run):
    try:
        result = runner(KEYCHAIN_FIND_ARGV, check=True, timeout=PROCESS_TIMEOUT_SECONDS, **CAPTURE_TEXT)
        credential = json.loads(result.stdout)
    except Exception:
        raise ExportError("credentials", "No Google credentials: Application Default Credentials not found and no Keychain credential; " + ADC_LOGIN_HINT)
    required = ("client_id", "client_secret", "refresh_token")
    if not isinstance(credential, dict) or any(not credential.get(key) for key in required):
        raise ExportError("credentials", "Stored Google credential is incomplete; re-run scripts/authorize-google-sheet.py")
    return credential


def adc_token(default=None, request_factory=None):
    """Access token from Application Default Credentials, or None when ADC is absent."""
    try:
        if default is None:
            import google.auth
            default = google.auth.default
        if request_factory is None:
            from google.auth.transport.requests import Request as request_factory
    except ImportError:
        return None  # e.g. CAREER_OPS_PYTHON without google-auth: use the Keychain fallback
    try:
        credentials, _project = default(scopes=ADC_SCOPES)
    except Exception as exc:
        if type(exc).__name__ == "DefaultCredentialsError":
            return None
        raise ExportError("credentials", "Application Default Credentials could not be loaded; " + ADC_LOGIN_HINT)
    try:
        credentials.refresh(request_factory())
        token = credentials.token
    except Exception:
        raise ExportError("token", "Application Default Credentials could not be refreshed (expired or revoked); " + ADC_LOGIN_HINT)
    if not isinstance(token, str) or not token:
        raise ExportError("token", "Application Default Credentials returned no access token; " + ADC_LOGIN_HINT)
    return {"token": token, "quota_project": getattr(credentials, "quota_project_id", None)}


def classify_http_error(status, body):
    """Map a Drive API error to a stage + secret-free hint."""
    text = body.decode("utf-8", "replace") if isinstance(body, bytes) else str(body or "")
    if status == 403 and ("SCOPE_INSUFFICIENT" in text or "insufficientPermissions" in text or "insufficient authentication scopes" in text):
        return ExportError("scopes", "The Google credential lacks the Drive/Sheets read-only scopes; " + ADC_LOGIN_HINT)
    if status == 403 and ("SERVICE_DISABLED" in text or "accessNotConfigured" in text or "has not been used in project" in text
                          or "USER_PROJECT_DENIED" in text or "quota project" in text):
        return ExportError("api-disabled", "The Google Drive API is not enabled for the credential's project (or no quota project is set); "
                           "enable the Drive API in the OAuth client's Cloud project, or run: gcloud auth application-default set-quota-project PROJECT_ID")
    if status == 404:
        return ExportError("not-found", "Sheet not found or not shared with this Google account; check data/google-sheet-id.txt")
    return ExportError("download", "Unable to export the Google Sheet as XLSX (HTTP {})".format(status))


def access_token(credential, urlopen=urllib.request.urlopen):
    data = urllib.parse.urlencode({
        "grant_type": "refresh_token",
        "client_id": credential["client_id"],
        "client_secret": credential["client_secret"],
        "refresh_token": credential["refresh_token"],
    }).encode("ascii")
    request = urllib.request.Request(TOKEN_ENDPOINT, data=data, method="POST",
                                     headers={"Content-Type": "application/x-www-form-urlencoded"})
    try:
        with urlopen(request, timeout=HTTP_TIMEOUT_SECONDS) as response:
            payload = json.loads(response.read(65536).decode("utf-8"))
        token = payload["access_token"]
        if not isinstance(token, str) or not token:
            raise ValueError("empty token")
        return token
    except Exception:
        raise ExportError("token", "Unable to refresh Google access token; re-run scripts/authorize-google-sheet.py")


def download_xlsx(token, destination, sheet_id, urlopen=urllib.request.urlopen, quota_project=None):
    query = urllib.parse.urlencode({"mimeType": XLSX_MIME_TYPE})
    url = "https://www.googleapis.com/drive/v3/files/{}/export?{}".format(sheet_id, query)
    headers = {"Authorization": "Bearer " + token}
    if quota_project:
        headers["x-goog-user-project"] = quota_project
    request = urllib.request.Request(url, headers=headers)
    try:
        with urlopen(request, timeout=HTTP_TIMEOUT_SECONDS) as response:
            body = response.read(MAX_DOWNLOAD_BYTES + 1)
    except urllib.error.HTTPError as exc:
        try:
            detail = exc.read(65536)
        except Exception:
            detail = b""
        raise classify_http_error(exc.code, detail)
    except Exception:
        raise ExportError("download", "Unable to export the Google Sheet as XLSX")
    if len(body) > MAX_DOWNLOAD_BYTES or not body.startswith(b"PK\x03\x04"):
        raise ExportError("download", "Google did not return a valid XLSX workbook")
    Path(destination).write_bytes(body)


def get_token(runner=subprocess.run, urlopen=urllib.request.urlopen, adc=adc_token):
    found = adc()
    if found:
        return found["token"], found.get("quota_project")
    return access_token(read_credential(runner), urlopen), None


def export_and_sync(output_path=DEFAULT_OUTPUT, runner=subprocess.run, urlopen=urllib.request.urlopen, sheet_id=None, adc=adc_token):
    sheet_id = sheet_id or spreadsheet_id()
    token, quota_project = get_token(runner, urlopen, adc)
    handle = tempfile.NamedTemporaryFile(prefix="career-ops-sheet-", suffix=".xlsx", delete=False)
    handle.close()
    temporary = Path(handle.name)
    try:
        download_xlsx(token, temporary, sheet_id, urlopen, quota_project)
        try:
            runner([sys.executable, str(IMPORTER_SCRIPT), str(temporary), str(output_path)],
                   check=True, timeout=PROCESS_TIMEOUT_SECONDS, **CAPTURE_TEXT)
        except Exception:
            raise ExportError("import", "Unable to import the exported workbook")
    finally:
        if temporary.exists():
            temporary.unlink()


def main():
    try:
        export_and_sync()
    except ExportError as exc:
        print(json.dumps({"ok": False, "stage": exc.stage, "error": str(exc)}), file=sys.stderr)
        return 1
    except Exception:
        print(json.dumps({"ok": False, "stage": "unknown", "error": "Google Sheet refresh failed"}), file=sys.stderr)
        return 1
    print(json.dumps({"ok": True}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
