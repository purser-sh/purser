/// <reference path="./claude-sdk.d.ts" />
import type { AgentEvent } from "@agentdeck/protocol";
import type { AgentAdapter, RunInput } from "./types.ts";
import { which } from "./cli/which.ts";
import { usageEventFromProvider } from "./usage.ts";

type SdkQuery = (params: {
  prompt: string;
  options?: Record<string, unknown>;
}) => AsyncIterable<Record<string, unknown>> & { interrupt?: () => Promise<void> };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function mapClaudeMessage(msg: Record<string, unknown>): AgentEvent[] {
  const events: AgentEvent[] = [];
  const type = msg.type;
  if (type === "system" && msg.subtype === "init" && typeof msg.session_id === "string") {
    events.push({ kind: "session_started", providerSessionId: msg.session_id });
  }
  if (type === "assistant" && isRecord(msg.message)) {
    const content = msg.message.content;
    if (Array.isArray(content)) {
      for (const block of content) {
        if (!isRecord(block)) continue;
        if (block.type === "text" && typeof block.text === "string") {
          events.push({ kind: "text", text: block.text });
        }
        if (block.type === "thinking" && typeof block.thinking === "string") {
          events.push({ kind: "thinking", text: block.thinking });
        }
        if (block.type === "tool_use" && typeof block.name === "string" && typeof block.id === "string") {
          const input = block.input;
          const path = isRecord(input) && typeof input.path === "string" ? input.path : "";
          events.push({
            kind: "tool_call",
            toolId: block.id,
            name: block.name,
            input,
            summary: path.length > 0 ? `${block.name} ${path}` : block.name,
          });
        }
      }
    }
  }
  if (type === "user" && isRecord(msg.message) && Array.isArray(msg.message.content)) {
    for (const block of msg.message.content) {
      if (!isRecord(block)) continue;
      if (block.type === "tool_result" && typeof block.tool_use_id === "string") {
        events.push({
          kind: "tool_result",
          toolId: block.tool_use_id,
          ok: block.is_error !== true,
          output: block.content ?? block,
          ms: 0,
        });
      }
    }
  }
  if (type === "stream_event" && isRecord(msg.event)) {
    const delta = msg.event.delta;
    if (isRecord(delta) && typeof delta.text === "string") {
      events.push({ kind: "text_delta", text: delta.text });
    }
  }
  if (type === "result") {
    const usage = isRecord(msg.usage) ? msg.usage : undefined;
    if (usage) {
      const event = usageEventFromProvider(usage);
      if (event !== null) {
        events.push(event);
      }
    }
    const subtype = msg.subtype;
    events.push({
      kind: "done",
      status: subtype === "success" ? "ok" : "error",
      summary: typeof msg.result === "string" ? msg.result : "Claude finished",
    });
  }
  return events;
}

export const claudeCodeAdapter: AgentAdapter = {
  id: "claude_code",
  label: "Claude Code",
  kind: "sdk",
  costModel: "subscription",
  async checkHealth() {
    const cli = which("claude");
    try {
      await import("@anthropic-ai/claude-agent-sdk");
      return {
        ok: cli !== null,
        detail:
          cli === null
            ? "SDK is present but `claude` CLI is not on PATH. Log into Claude Code first."
            : `claude CLI at ${cli}`,
      };
    } catch {
      return {
        ok: false,
        detail: "Install @anthropic-ai/claude-agent-sdk and the Claude Code CLI, then log in.",
      };
    }
  },
  async listModels() {
    return [
      { id: "sonnet", label: "Sonnet" },
      { id: "opus", label: "Opus" },
      { id: "haiku", label: "Haiku" },
    ];
  },
  async *run(input: RunInput) {
    let query: SdkQuery;
    try {
      const sdk = (await import("@anthropic-ai/claude-agent-sdk")) as { query: SdkQuery };
      query = sdk.query;
    } catch {
      yield {
        kind: "error",
        message: "Claude Agent SDK is not installed. Run bun add @anthropic-ai/claude-agent-sdk in packages/adapters.",
        fatal: true,
      };
      yield { kind: "done", status: "error", summary: "Claude SDK missing" };
      return;
    }
    const permissionMode =
      input.permissionMode === "bypass"
        ? "bypassPermissions"
        : input.permissionMode === "auto_edit"
          ? "acceptEdits"
          : "default";
    const q = query({
      prompt: [input.extraSystemPrompt, input.prompt].filter(Boolean).join("\n\n"),
      options: {
        cwd: input.cwd,
        model: input.modelId,
        resume: input.providerSessionId,
        permissionMode,
        includePartialMessages: true,
        allowDangerouslySkipPermissions: input.permissionMode === "bypass",
        canUseTool:
          input.permissionMode === "ask" && input.askPermission
            ? async (toolName: string, toolInput: Record<string, unknown>, opts: { requestId: string }) => {
                const allow = await input.askPermission?.({
                  requestId: opts.requestId,
                  action: toolName,
                  detail: toolInput,
                });
                return allow
                  ? { behavior: "allow" as const, updatedInput: toolInput }
                  : { behavior: "deny" as const, message: "User denied" };
              }
            : undefined,
      },
    });
    const onAbort = () => {
      void q.interrupt?.();
    };
    input.signal.addEventListener("abort", onAbort);
    try {
      for await (const msg of q) {
        const mapped = mapClaudeMessage(msg);
        for (const event of mapped) {
          yield event;
        }
      }
    } finally {
      input.signal.removeEventListener("abort", onAbort);
    }
  },
};
