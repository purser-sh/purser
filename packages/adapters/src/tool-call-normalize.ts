/**
 * Stage 1 of the tool-call path: decide whether a provider response *looks like*
 * tool calls and normalize every shape into the same internal candidate list.
 * Validation and execution happen later in tool-gate / runGatedTool — never here.
 */

export type NormalizedToolCall = {
  id: string;
  source: "api" | "content";
  name: string;
  /** Always a JSON string for the gate — never a coerced object. */
  rawArguments: string;
};

export type NormalizeProviderResponse =
  | { kind: "none" }
  | { kind: "calls"; calls: NormalizedToolCall[] }
  | { kind: "malformed_content"; reason: string; attemptedName?: string; raw: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeApiToolCalls(value: unknown): NormalizedToolCall[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: NormalizedToolCall[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.id !== "string" || item.type !== "function") {
      continue;
    }
    if (!isRecord(item.function) || typeof item.function.name !== "string" || typeof item.function.arguments !== "string") {
      continue;
    }
    out.push({
      id: item.id,
      source: "api",
      name: item.function.name,
      rawArguments: item.function.arguments,
    });
  }
  return out;
}

/** Entire trimmed content must be a single <tool_call>…</tool_call> block. */
function stripToolCallWrapper(content: string): string | null {
  const match = content.trim().match(/^<tool_call>\s*([\s\S]*?)\s*<\/tool_call>$/i);
  return match ? match[1]!.trim() : null;
}

/** Entire trimmed content must be one ```json fenced block. */
function stripJsonFence(content: string): string | null {
  const match = content.trim().match(/^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/i);
  return match ? match[1]!.trim() : null;
}

/** Entire trimmed content must be one JSON object. */
function asBareJsonObject(content: string): string | null {
  const trimmed = content.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return null;
  }
  try {
    const value: unknown = JSON.parse(trimmed);
    return isRecord(value) ? trimmed : null;
  } catch {
    return null;
  }
}

function extractExclusivePayload(content: string): string | null {
  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return stripToolCallWrapper(trimmed) ?? stripJsonFence(trimmed) ?? asBareJsonObject(trimmed);
}

function parseToolCallObject(raw: string): { name: string; rawArguments: string } | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value)) {
    return null;
  }
  const name =
    typeof value.name === "string"
      ? value.name
      : isRecord(value.function) && typeof value.function.name === "string"
        ? value.function.name
        : null;
  if (name === null) {
    return null;
  }
  const args = value.arguments ?? value.parameters ?? value.args;
  if (args === undefined) {
    return null;
  }
  let rawArguments: string;
  try {
    rawArguments = typeof args === "string" ? args : JSON.stringify(args);
  } catch {
    return null;
  }
  return { name, rawArguments };
}

function normalizeContentToolCall(content: string, idPrefix: string): NormalizeProviderResponse {
  const payload = extractExclusivePayload(content);
  if (payload === null) {
    return { kind: "none" };
  }
  const parsed = parseToolCallObject(payload);
  if (parsed === null) {
    return {
      kind: "malformed_content",
      reason: "Message looks like a tool call but is not valid JSON with name and arguments",
      raw: payload,
    };
  }
  return {
    kind: "calls",
    calls: [
      {
        id: `${idPrefix}-${crypto.randomUUID()}`,
        source: "content",
        name: parsed.name,
        rawArguments: parsed.rawArguments,
      },
    ],
  };
}

/**
 * Normalize structured tool_calls and/or assistant content into canonical candidates.
 * API tool_calls win when present; content is consulted only when the API field is empty.
 */
export function normalizeProviderResponse(
  input: { tool_calls?: unknown; content?: string | null },
  options?: { contentIdPrefix?: string },
): NormalizeProviderResponse {
  const fromApi = normalizeApiToolCalls(input.tool_calls);
  if (fromApi.length > 0) {
    return { kind: "calls", calls: fromApi };
  }
  const text = input.content ?? "";
  if (text.length === 0) {
    return { kind: "none" };
  }
  return normalizeContentToolCall(text, options?.contentIdPrefix ?? "content");
}
