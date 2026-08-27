import { modelChoices } from "@purser-sh/protocol";
import type { AgentAdapter, RunInput } from "../types.ts";
import { spawnJsonl } from "./spawn-jsonl.ts";
import { mapJsonlEvent } from "./map-jsonl.ts";
import { which } from "./which.ts";
import { blockedRunEvents, cliReadiness } from "../readiness.ts";

function approvalFlag(mode: RunInput["permissionMode"]): string[] {
  if (mode === "bypass") {
    return ["--approval-mode", "yolo"];
  }
  if (mode === "auto_edit") {
    return ["--approval-mode", "auto_edit"];
  }
  return ["--approval-mode", "default"];
}

export const geminiCliAdapter: AgentAdapter = {
  id: "gemini_cli",
  label: "Gemini CLI",
  kind: "cli",
  costModel: "subscription",
  async checkHealth() {
    return cliReadiness("gemini_cli", "gemini", which("gemini"));
  },
  async listModels() {
    return modelChoices("gemini_cli");
  },
  async *run(input) {
    const health = cliReadiness("gemini_cli", "gemini", which("gemini"));
    if (!health.ok) {
      yield* blockedRunEvents(health);
      return;
    }
    const args = ["--prompt", input.prompt, "--output-format", "stream-json", ...approvalFlag(input.permissionMode)];
    if (input.modelId) {
      args.push("--model", input.modelId);
    }
    yield { kind: "session_started", providerSessionId: input.providerSessionId ?? `gemini-${input.runId}` };
    let emittedDone = false;
    for await (const event of spawnJsonl({ command: "gemini", args, cwd: input.cwd, signal: input.signal })) {
      const mapped = mapJsonlEvent(event);
      for (const item of mapped) {
        if (item.kind === "done") emittedDone = true;
        yield item;
      }
    }
    if (!emittedDone) {
      yield { kind: "done", status: "ok", summary: "Gemini finished" };
    }
  },
};
