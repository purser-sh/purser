import type { AgentEvent } from "@agentdeck/protocol";
import type { AgentAdapter, RunInput } from "./types.ts";
import { countTokens } from "@agentdeck/pricing";

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
  costModel: "local",

  async checkHealth() {
    return { ok: true, detail: "echo is always healthy" };
  },

  async listModels() {
    return [{ id: "echo-v1", label: "Echo v1" }];
  },

  async *run(input: RunInput): AsyncIterable<AgentEvent> {
    const providerSessionId = input.providerSessionId ?? `echo-${input.runId}`;
    const events: AgentEvent[] = [
      { kind: "session_started", providerSessionId },
      { kind: "text_delta", text: "You said: " },
      { kind: "text_delta", text: input.prompt },
      { kind: "text", text: `You said: ${input.prompt}` },
      {
        kind: "tool_call",
        toolId: "echo-read-1",
        name: "read_file",
        input: { path: "README.md" },
        summary: "read README.md",
      },
      {
        kind: "tool_result",
        toolId: "echo-read-1",
        ok: true,
        output: "# AgentDeck\n",
        ms: 1,
      },
      {
        kind: "file_diff",
        path: "README.md",
        patch: "@@ -1,1 +1,2 @@\n # AgentDeck\n+# echoed\n",
        added: 1,
        removed: 0,
      },
      { kind: "usage", inputTokens: countTokens(input.prompt, "openai").value, outputTokens: countTokens(`You said: ${input.prompt}`, "openai").value, cacheReadTokens: null, cacheWriteTokens: null, source: "estimated" },
      { kind: "done", status: "ok", summary: "Echoed your message" },
    ];

    for (const event of events) {
      assertNotAborted(input.signal);
      yield event;
      await Promise.resolve();
    }
  },
};
