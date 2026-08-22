import type { AgentAdapter, RunInput } from "../types.ts";
import { MissingCliError, spawnJsonl } from "./spawn-jsonl.ts";
import { mapJsonlEvent } from "./map-jsonl.ts";
import { which } from "./which.ts";

export const cursorAgentAdapter: AgentAdapter = {
  id: "cursor_agent",
  label: "Cursor Agent",
  kind: "cli",
  async checkHealth() {
    const path = which("agent");
    if (path === null) {
      return {
        ok: false,
        detail: "Cursor CLI (`agent`) is not installed. Install it from https://cursor.com/docs/cli/headless",
      };
    }
    return { ok: true, detail: `agent found at ${path}` };
  },
  async listModels() {
    return [
      { id: "auto", label: "auto" },
      { id: "composer-2", label: "composer-2" },
    ];
  },
  async *run(input: RunInput) {
    if (which("agent") === null) {
      throw new MissingCliError("agent", "Cursor CLI (`agent`) is not installed.");
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
    for await (const event of spawnJsonl({ command: "agent", args, cwd: input.cwd, signal: input.signal })) {
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
