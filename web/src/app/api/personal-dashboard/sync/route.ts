import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

import { careerOpsRoot } from "@/lib/career-ops";
import { personalSnapshotPath } from "@/lib/personal-dashboard";
import { validatePersonalSnapshot } from "@/lib/personal-dashboard.mjs";
import { createPersonalDashboardSync, exporterCommand } from "@/lib/personal-dashboard-sync.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYNC_TIMEOUT_MS = 180_000;

// The exporter prints only a short, secret-free JSON error on failure, e.g.
// {"ok": false, "error": "...", "stage": "credentials"}; surface its stage.
function failureDetail(stderr: string): string {
  try {
    const parsed = JSON.parse(stderr.trim().split("\n").pop() || "{}");
    return typeof parsed.stage === "string" ? parsed.stage : "";
  } catch {
    return "";
  }
}

function runExporter(): Promise<{ outcome: "ok" | "timeout" | "failed"; detail: string }> {
  const root = careerOpsRoot();
  const command = exporterCommand(process.env, path.join(root, "scripts", "export-google-sheet.py"));
  return new Promise((resolve) => {
    execFile(
      command.file,
      command.args,
      { cwd: root, timeout: SYNC_TIMEOUT_MS, maxBuffer: 64_000 },
      (error, _stdout, stderr) => {
        if (!error) return resolve({ outcome: "ok", detail: "" });
        const child = error as typeof error & { killed?: boolean };
        resolve({ outcome: child.killed ? "timeout" : "failed", detail: failureDetail(String(stderr ?? "")) });
      },
    );
  });
}

const sync = createPersonalDashboardSync({
  runExporter,
  readSnapshot: () => JSON.parse(fs.readFileSync(personalSnapshotPath(), "utf8")),
  validate: validatePersonalSnapshot,
});

export async function POST() {
  const response = await sync();
  return NextResponse.json(response.body, { status: response.status });
}
