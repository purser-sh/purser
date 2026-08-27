import { modelChoices } from "@purser-sh/protocol";
import type { AgentAdapter, RunInput } from "../types.ts";
import { spawnJsonl } from "./spawn-jsonl.ts";
import { mapJsonlEvent } from "./map-jsonl.ts";
import { which } from "./which.ts";
import { blockedRunEvents, cliReadiness } from "../readiness.ts";

/**
 * Cursor ships both `cursor-agent` and a short `agent` symlink. Prefer the
 * unambiguous name: `agent` collides with other CLIs (Grok) and is a first-run
 * failure for the exact user we most want.
 */
export function resolveCursorCli(env: NodeJS.ProcessEnv = process.env): string | null {
  return which("cursor-agent", env) ?? which("agent", env);
}

export const cursorAgentAdapter: AgentAdapter = {
  id: "cursor_agent",
  label: "Cursor Agent",
  kind: "cli",
  costModel: "subscription",
  async checkHealth() {
    return cliReadiness("cursor_agent", "cursor-agent", resolveCursorCli());
  },
  async listModels() {
    return modelChoices("cursor_agent");
  },
  async *run(input: RunInput) {
    const cli = resolveCursorCli();
    const health = cliReadiness("cursor_agent", "cursor-agent", cli);
    if (!health.ok || cli === null) {
      yield* blockedRunEvents(health);
      return;
    }
    const args = [
      "-p",
      "--output-format",
      "stream-json",
      "--stream-partial-output",
      "--workspace",
      input.cwd,
      "--trust",
    ];
    if (input.permissionMode !== "ask") {
      args.push("--force");
    }
    if (input.modelId) {
      args.push("--model", input.modelId);
    }
    if (input.providerSessionId) {
      args.push("--resume", input.providerSessionId);
    }
    args.push(input.prompt);
    yield { kind: "session_started", providerSessionId: input.providerSessionId ?? `cursor-${input.runId}` };
    let emittedDone = false;
    for await (const event of spawnJsonl({ command: cli, args, cwd: input.cwd, signal: input.signal })) {
      const mapped = mapJsonlEvent(event);
      for (const item of mapped) {
        if (item.kind === "done") emittedDone = true;
        yield item;
      }
    }
    if (!emittedDone) {
      yield { kind: "done", status: "ok", summary: "Cursor agent finished" };
    }
  },
};
