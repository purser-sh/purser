import type { AgentAdapter, RunInput } from "../types.ts";
import { MissingCliError, spawnJsonl } from "./spawn-jsonl.ts";
import { mapJsonlEvent } from "./map-jsonl.ts";
import { which } from "./which.ts";

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
  async checkHealth() {
    const path = which("gemini");
    if (path === null) {
      return { ok: false, detail: "gemini CLI is not installed or not on PATH." };
    }
    return { ok: true, detail: `gemini found at ${path}` };
  },
  async listModels() {
    return [
      { id: "auto", label: "auto" },
      { id: "gemini-2.5-pro", label: "gemini-2.5-pro" },
      { id: "gemini-2.5-flash", label: "gemini-2.5-flash" },
    ];
  },
  async *run(input) {
    if (which("gemini") === null) {
      throw new MissingCliError("gemini");
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
