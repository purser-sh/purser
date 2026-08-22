import type { AgentEvent } from "@agentdeck/protocol";
import type { AgentAdapter, RunInput } from "./types.ts";

function assertNotAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    const reason = signal.reason;
    throw reason instanceof Error ? reason : new DOMException("Aborted", "AbortError");
  }
}

export const echoAdapter: AgentAdapter = {
  id: "echo",
  label: "Echo (fake)",
  kind: "api",

  async checkHealth() {
    return { ok: true, detail: "echo is always healthy" };
  },

  async listModels() {
    return [{ id: "echo-v1", label: "Echo v1" }];
  },

  async *run(input: RunInput): AsyncIterable<AgentEvent> {
    assertNotAborted(input.signal);
    const providerSessionId = input.providerSessionId ?? `echo-${input.runId}`;
    yield { kind: "session_started", providerSessionId };
    yield { kind: "text_delta", text: "You said: " };
    yield { kind: "text_delta", text: input.prompt };
    yield { kind: "text", text: `You said: ${input.prompt}` };
    yield {
      kind: "tool_call",
      toolId: "echo-read-1",
      name: "read_file",
      input: { path: "README.md" },
      summary: "read README.md",
    };
    yield {
      kind: "tool_result",
      toolId: "echo-read-1",
      ok: true,
      output: "# AgentDeck\n",
      ms: 1,
    };
    yield {
      kind: "file_diff",
      path: "README.md",
      patch: "@@ -1,1 +1,2 @@\n # AgentDeck\n+# echoed\n",
      added: 1,
      removed: 0,
    };
    yield { kind: "usage", tokensIn: input.prompt.length, tokensOut: input.prompt.length + 10, costUsd: 0 };
    yield { kind: "done", status: "ok", summary: "Echoed your message" };
  },
};
