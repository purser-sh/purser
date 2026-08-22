import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { logsDir } from "./config.ts";
import { redact } from "./redact.ts";

export function appendRunLog(runId: string, raw: unknown): void {
  mkdirSync(logsDir(), { recursive: true, mode: 0o700 });
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    runId,
    raw: redact(raw),
  });
  appendFileSync(join(logsDir(), `${runId}.jsonl`), `${line}\n`, { mode: 0o600 });
}
