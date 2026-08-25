import type { AgentAdapter, RunInput } from "../types.ts";
import { MissingCliError, spawnJsonl } from "./spawn-jsonl.ts";
import { mapJsonlEvent } from "./map-jsonl.ts";
import { which } from "./which.ts";

function sandboxFlag(mode: RunInput["permissionMode"]): string[] {
  if (mode === "bypass") {
    return ["--dangerously-bypass-approvals-and-sandbox"];
  }
  return ["-s", "workspace-write"];
}

export const codexAdapter: AgentAdapter = {
  id: "codex",
  label: "OpenAI Codex",
  kind: "cli",
  costModel: "subscription",
  async checkHealth() {
    const path = which("codex");
    if (path === null) {
      return { ok: false, detail: "codex CLI is not installed or not on PATH." };
    }
    return { ok: true, detail: `codex found at ${path}` };
  },
  async listModels() {
    return [
      { id: "gpt-5", label: "gpt-5" },
      { id: "o3", label: "o3" },
      { id: "o4-mini", label: "o4-mini" },
    ];
  },
  async *run(input) {
    if (which("codex") === null) {
      throw new MissingCliError("codex");
    }
    const args =
      input.providerSessionId !== undefined
        ? ["exec", "resume", input.providerSessionId, "--json", "-C", input.cwd, ...sandboxFlag(input.permissionMode), input.prompt]
        : ["exec", "--json", "-C", input.cwd, ...sandboxFlag(input.permissionMode), input.prompt];
    if (input.modelId) {
      args.splice(args.indexOf("--json"), 0, "-m", input.modelId);
    }
    yield { kind: "session_started", providerSessionId: input.providerSessionId ?? `codex-${input.runId}` };
    let emittedDone = false;
    for await (const event of spawnJsonl({ command: "codex", args, cwd: input.cwd, signal: input.signal })) {
      const mapped = mapJsonlEvent(event);
      for (const item of mapped) {
        if (item.kind === "done") emittedDone = true;
        yield item;
      }
    }
    if (!emittedDone) {
      yield { kind: "done", status: "ok", summary: "Codex finished" };
    }
  },
};
