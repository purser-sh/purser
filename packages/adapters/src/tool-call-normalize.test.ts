import { describe, expect, test } from "bun:test";
import { normalizeProviderResponse } from "./tool-call-normalize.ts";

const PATCH = '@@ -1,0 +1,1 @@\n<!-- Purser -->\n';

describe("normalizeProviderResponse", () => {
  test("normalizes structured API tool_calls", () => {
    const result = normalizeProviderResponse({
      tool_calls: [
        {
          id: "call_1",
          type: "function",
          function: { name: "read_file", arguments: '{"path":"README.md"}' },
        },
      ],
    });
    expect(result).toEqual({
      kind: "calls",
      calls: [
        {
          id: "call_1",
          source: "api",
          name: "read_file",
          rawArguments: '{"path":"README.md"}',
        },
      ],
    });
  });

  test("API tool_calls win over content that also looks like a call", () => {
    const inner = JSON.stringify({ name: "apply_patch", arguments: { patch: PATCH } });
    const result = normalizeProviderResponse({
      tool_calls: [
        {
          id: "call_api",
          type: "function",
          function: { name: "read_file", arguments: '{"path":"a"}' },
        },
      ],
      content: inner,
    });
    expect(result.kind).toBe("calls");
    if (result.kind === "calls") {
      expect(result.calls[0]?.source).toBe("api");
      expect(result.calls[0]?.name).toBe("read_file");
    }
  });

  test("parses bare JSON content", () => {
    const content = JSON.stringify({ name: "apply_patch", arguments: { patch: PATCH } });
    const result = normalizeProviderResponse({ content });
    expect(result.kind).toBe("calls");
    if (result.kind === "calls") {
      expect(result.calls[0]?.name).toBe("apply_patch");
      expect(JSON.parse(result.calls[0]!.rawArguments)).toEqual({ patch: PATCH });
    }
  });

  test("parses <tool_call> wrapper content", () => {
    const inner = JSON.stringify({ name: "apply_patch", arguments: { patch: PATCH } });
    const result = normalizeProviderResponse({ content: `<tool_call>\n${inner}\n</tool_call>` });
    expect(result.kind).toBe("calls");
    if (result.kind === "calls") {
      expect(result.calls[0]?.name).toBe("apply_patch");
    }
  });

  test("does not treat JSON embedded in prose as a tool call", () => {
    const snippet = JSON.stringify({ name: "apply_patch", arguments: { patch: PATCH } });
    expect(normalizeProviderResponse({ content: `Example:\n${snippet}\nThanks.` })).toEqual({ kind: "none" });
  });

  test("returns malformed_content when shape is close but invalid", () => {
    const result = normalizeProviderResponse({ content: '{"name":"apply_patch"}' });
    expect(result.kind).toBe("malformed_content");
  });
});
