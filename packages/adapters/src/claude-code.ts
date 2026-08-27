/// <reference path="./claude-sdk.d.ts" />
import { modelChoices, type AgentEvent } from "@purser-sh/protocol";
import type { AgentAdapter, HealthResult, RunInput } from "./types.ts";
import { which } from "./cli/which.ts";
import { usageEventFromProvider } from "./usage.ts";
import { claudeCredentialState, claudeSdkPresent } from "./claude-auth.ts";
import { blockedRunEvents, claudeReadiness } from "./readiness.ts";
import { describeVendorFailure, translateVendorFailure } from "./vendor-errors.ts";

type SdkQuery = (params: {
  prompt: string;
  options?: Record<string, unknown>;
}) => AsyncIterable<Record<string, unknown>> & { interrupt?: () => Promise<void> };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Claude Code reports a failed login three times in one turn: as an assistant
 * message, as the result text, and by ending the turn in error. The mapper
 * keeps one flag so Purser reports it once, in Purser's own words.
 */
export function createClaudeMapper(): (msg: Record<string, unknown>) => AgentEvent[] {
  let reported = false;

  function reportFailure(raw: string): AgentEvent[] {
    if (reported) {
      return [];
    }
    reported = true;
    const described = describeVendorFailure({ providerId: "claude_code" }, raw);
    return [{ kind: "error", message: described.message, fatal: true, remedy: described.remedy }];
  }

  return function mapClaudeMessage(msg: Record<string, unknown>): AgentEvent[] {
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
            if (translateVendorFailure({ providerId: "claude_code" }, block.text) !== null) {
              events.push(...reportFailure(block.text));
              continue;
            }
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
      const failed = msg.subtype !== "success";
      const result = typeof msg.result === "string" ? msg.result : "";
      if (failed) {
        events.push(...reportFailure(result));
        // The error carries the message; an empty summary keeps the UI to one line.
        events.push({ kind: "done", status: "error", summary: "" });
      } else {
        events.push({ kind: "done", status: "ok", summary: result.length > 0 ? result : "Claude finished" });
      }
    }
    return events;
  };
}

async function claudeHealth(): Promise<HealthResult> {
  return claudeReadiness({
    sdkPresent: await claudeSdkPresent(),
    cliPath: which("claude"),
    credentials: claudeCredentialState(),
  });
}

export const claudeCodeAdapter: AgentAdapter = {
  id: "claude_code",
  label: "Claude Code",
  kind: "sdk",
  costModel: "subscription",
  checkHealth: claudeHealth,
  async listModels() {
    return modelChoices("claude_code");
  },
  async *run(input: RunInput) {
    const health = await claudeHealth();
    if (!health.ok) {
      yield* blockedRunEvents(health);
      return;
    }
    const sdk = (await import("@anthropic-ai/claude-agent-sdk")) as { query: SdkQuery };
    const query = sdk.query;
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
    const mapClaudeMessage = createClaudeMapper();
    try {
      for await (const msg of q) {
        for (const event of mapClaudeMessage(msg)) {
          yield event;
        }
      }
    } finally {
      input.signal.removeEventListener("abort", onAbort);
    }
  },
};
