#!/usr/bin/env python3
# /// script
# requires-python = ">=3.9"
# dependencies = []
# ///
"""One-time read-only Google Drive authorization for the personal dashboard.

Usage:
    uv run scripts/authorize-google-sheet.py client.json

client.json is the OAuth client JSON you download from Google Cloud Console
(APIs & Services -> Credentials). Use a "Desktop app" client: Google allows any
loopback port for those, so this script listens on a free 127.0.0.1 port and
never collides with the dashboard on :3000. Enable the Google Drive API in the
same project.

The script opens the consent page (scope: drive.readonly), receives the code on
the loopback redirect, exchanges it (PKCE) for a refresh token, and stores
{client_id, client_secret, refresh_token, scope} in the macOS Keychain
(service "career-ops-google-sheet-oauth", account "google-sheet-readonly").
Nothing secret is printed. Compatible with Python 3.6+.
"""

import base64
import hashlib
import json
import secrets
import subprocess
import sys
import urllib.parse
import urllib.request
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer

DRIVE_READONLY_SCOPE = "https://www.googleapis.com/auth/drive.readonly"
AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
KEYCHAIN_SERVICE = "career-ops-google-sheet-oauth"
KEYCHAIN_ACCOUNT = "google-sheet-readonly"
CALLBACK_TIMEOUT_SECONDS = 300


def load_client(path):
    with open(path, "r") as handle:
        document = json.load(handle)
    client = document.get("installed") or document.get("web") or {}
    if not client.get("client_id") or not client.get("client_secret"):
        raise ValueError("Client file has no client_id/client_secret")
    return client


def receive_code(expected_state):
    result = {}

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):  # noqa: N802 (http.server API)
            query = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            if query.get("state", [""])[0] == expected_state and query.get("code"):
                result["code"] = query["code"][0]
                message = b"Authorized. You can close this tab."
            else:
                result.setdefault("error", query.get("error", ["invalid callback"])[0])
                message = b"Authorization failed. You can close this tab."
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(message)

        def log_message(self, *args):
            pass

    server = HTTPServer(("127.0.0.1", 0), Handler)
    server.timeout = CALLBACK_TIMEOUT_SECONDS
    return server, result


def authorize(client_path):
    client = load_client(client_path)
    verifier = base64.urlsafe_b64encode(secrets.token_bytes(48)).rstrip(b"=").decode("ascii")
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode("ascii")).digest()).rstrip(b"=").decode("ascii")
    state = secrets.token_urlsafe(24)
    server, result = receive_code(state)
    redirect_uri = "http://127.0.0.1:{}/".format(server.server_address[1])
    url = AUTHORIZATION_ENDPOINT + "?" + urllib.parse.urlencode({
        "client_id": client["client_id"],
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": DRIVE_READONLY_SCOPE,
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
    })
    print("Opening Google consent page. If it does not open, visit:\n" + url, file=sys.stderr)
    webbrowser.open(url)
    try:
        server.handle_request()
    finally:
        server.server_close()
    if "code" not in result:
        raise RuntimeError("No authorization code received ({})".format(result.get("error", "timeout")))

    data = urllib.parse.urlencode({
        "grant_type": "authorization_code",
        "code": result["code"],
        "client_id": client["client_id"],
        "client_secret": client["client_secret"],
        "redirect_uri": redirect_uri,
        "code_verifier": verifier,
    }).encode("ascii")
    request = urllib.request.Request(TOKEN_ENDPOINT, data=data, method="POST",
                                     headers={"Content-Type": "application/x-www-form-urlencoded"})
    with urllib.request.urlopen(request, timeout=30) as response:
        payload = json.loads(response.read(65536).decode("utf-8"))
    refresh_token = payload.get("refresh_token")
    if not refresh_token:
        raise RuntimeError("Google returned no refresh token")
    credential = json.dumps({
        "client_id": client["client_id"],
        "client_secret": client["client_secret"],
        "refresh_token": refresh_token,
        "scope": DRIVE_READONLY_SCOPE,
    })
    subprocess.run(
        ["security", "add-generic-password", "-U", "-s", KEYCHAIN_SERVICE, "-a", KEYCHAIN_ACCOUNT, "-w", credential],
        check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )


def main(argv=None):
    args = sys.argv[1:] if argv is None else argv
    if len(args) != 1:
        print("Usage: uv run scripts/authorize-google-sheet.py client.json", file=sys.stderr)
        return 2
    try:
        authorize(args[0])
    except Exception as exc:
        print(json.dumps({"ok": False, "error": type(exc).__name__ + ": " + str(exc)[:200]}), file=sys.stderr)
        return 1
    print(json.dumps({"ok": True}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
