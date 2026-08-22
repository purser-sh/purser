import type { AgentEvent } from "@agentdeck/protocol";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function mapJsonlEvent(raw: unknown): AgentEvent[] {
  if (!isRecord(raw)) {
    return [];
  }
  if (raw.kind === "non_json" && typeof raw.text === "string") {
    return [{ kind: "text_delta", text: `${raw.text}\n` }];
  }
  const type = asString(raw.type) ?? asString(raw.event) ?? "";
  const events: AgentEvent[] = [];

  const sessionId =
    asString(raw.session_id) ?? asString(raw.thread_id) ?? asString(raw.chatId) ?? asString(raw.id);
  if (type.includes("started") || type === "init" || type === "system") {
    if (sessionId) {
      events.push({ kind: "session_started", providerSessionId: sessionId });
    }
  }

  const delta =
    asString(raw.delta) ??
    asString(raw.text) ??
    (isRecord(raw.message) ? asString(raw.message.content) ?? asString(raw.message.text) : undefined);
  if (type.includes("delta") && delta) {
    events.push({ kind: "text_delta", text: delta });
  } else if ((type === "assistant" || type === "message" || type.includes("agent_message")) && delta) {
    events.push({ kind: "text", text: delta });
  }

  if (type.includes("thinking") && delta) {
    events.push({ kind: "thinking", text: delta });
  }

  if (type.includes("tool") && (type.includes("start") || type === "tool_use" || type === "tool_call")) {
    const name = asString(raw.name) ?? asString(raw.tool) ?? "tool";
    const id = asString(raw.toolId) ?? asString(raw.id) ?? name;
    const args = isRecord(raw.input) ? raw.input : isRecord(raw.args) ? raw.args : raw;
    events.push({
      kind: "tool_call",
      toolId: id,
      name,
      input: args,
      summary: `${name}`,
    });
  }
  if (type.includes("tool") && (type.includes("result") || type.includes("completed"))) {
    const id = asString(raw.toolId) ?? asString(raw.id) ?? "tool";
    events.push({
      kind: "tool_result",
      toolId: id,
      ok: raw.ok !== false,
      output: raw.output ?? raw.result ?? raw,
      ms: typeof raw.ms === "number" ? raw.ms : 0,
    });
  }

  if (type === "result" || type.includes("completed") || type === "turn.completed") {
    const usage = isRecord(raw.usage) ? raw.usage : isRecord(raw.stats) ? raw.stats : undefined;
    if (usage) {
      events.push({
        kind: "usage",
        tokensIn: Number(usage.input_tokens ?? usage.prompt_tokens ?? usage.tokensIn ?? 0),
        tokensOut: Number(usage.output_tokens ?? usage.completion_tokens ?? usage.tokensOut ?? 0),
      });
    }
    const summary = asString(raw.result) ?? asString(raw.response) ?? asString(raw.summary) ?? "done";
    events.push({ kind: "done", status: "ok", summary });
  }
  if (type === "error") {
    events.push({ kind: "error", message: asString(raw.message) ?? "provider error", fatal: false });
  }
  return events;
}
