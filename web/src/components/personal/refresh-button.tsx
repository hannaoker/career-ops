"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RefreshFromSheetButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function refresh() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/personal-dashboard/sync", { method: "POST" });
      const body = (await response.json().catch(() => ({}))) as { error?: string; detail?: string; hint?: string };
      if (response.ok) {
        setMessage("Updated from Google Sheet.");
        router.refresh();
      } else {
        setMessage(`${body.error ?? "Refresh failed"}${body.detail ? ` (${body.detail})` : ""}${body.hint ? `: ${body.hint}` : ""}`);
      }
    } catch {
      setMessage("Refresh failed (network error).");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => void refresh()}
        disabled={busy}
        className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:border-brand disabled:opacity-60"
      >
        {busy ? "Refreshing…" : "Refresh from Google Sheet"}
      </button>
      <p role="status" aria-live="polite" className="min-h-4 text-xs text-muted">{message}</p>
    </div>
  );
}
