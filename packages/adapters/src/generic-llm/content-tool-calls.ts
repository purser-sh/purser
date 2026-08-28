import { gateToolCall } from "../tool-gate.ts";
import { normalizeProviderResponse } from "../tool-call-normalize.ts";
import { TOOL_DEFINITIONS } from "./tools.ts";

export type ContentToolCallParseResult =
  | { status: "none" }
  | { status: "valid"; name: string; arguments: Record<string, unknown> }
  | { status: "invalid"; reason: string; attemptedName?: string; raw: string };

type RegisteredTool = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

/**
 * Parse assistant message content that local models emit as prose instead of tool_calls.
 * Normalizer decides shape; gate decides validity — neither executes.
 */
export function parseContentToolCall(
  content: string,
  registered: RegisteredTool[] = TOOL_DEFINITIONS,
): ContentToolCallParseResult {
  const normalized = normalizeProviderResponse({ content }, { contentIdPrefix: "content" });
  if (normalized.kind === "none") {
    return { status: "none" };
  }
  if (normalized.kind === "malformed_content") {
    return {
      status: "invalid",
      reason: normalized.reason,
      raw: normalized.raw,
    };
  }
  const call = normalized.calls[0];
  if (call === undefined) {
    return { status: "none" };
  }
  const registeredNames = new Set(registered.map((tool) => tool.function.name));
  const validated = gateToolCall(call.name, call.rawArguments, registeredNames);
  if (!validated.ok) {
    return {
      status: "invalid",
      reason: validated.reason,
      attemptedName: call.name,
      raw: call.rawArguments,
    };
  }
  return {
    status: "valid",
    name: validated.name,
    arguments: validated.args as Record<string, unknown>,
  };
}
