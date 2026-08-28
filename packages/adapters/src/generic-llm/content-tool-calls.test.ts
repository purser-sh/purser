import { describe, expect, test } from "bun:test";
import { parseContentToolCall } from "./content-tool-calls.ts";

const PATCH = '@@ -1,0 +1,1 @@\n<!-- Purser -->\n';

describe("parseContentToolCall", () => {
  test("parses a bare JSON object with name and arguments", () => {
    const content = JSON.stringify({ name: "apply_patch", arguments: { patch: PATCH } });
    const result = parseContentToolCall(content);
    expect(result).toEqual({
      status: "valid",
      name: "apply_patch",
      arguments: { patch: PATCH },
    });
  });

  test("parses Qwen <tool_call> wrapper", () => {
    const inner = JSON.stringify({ name: "apply_patch", arguments: { patch: PATCH } });
    const content = `<tool_call>\n${inner}\n</tool_call>`;
    const result = parseContentToolCall(content);
    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(result.name).toBe("apply_patch");
      expect(result.arguments).toEqual({ patch: PATCH });
    }
  });

  test("parses a ```json fenced block", () => {
    const inner = JSON.stringify({ name: "apply_patch", arguments: { patch: PATCH } });
    const content = `\`\`\`json\n${inner}\n\`\`\``;
    const result = parseContentToolCall(content);
    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(result.name).toBe("apply_patch");
    }
  });

  test("accepts parameters as an alias for arguments", () => {
    const content = JSON.stringify({ name: "read_file", parameters: { path: "README.md" } });
    const result = parseContentToolCall(content);
    expect(result).toEqual({
      status: "valid",
      name: "read_file",
      arguments: { path: "README.md" },
    });
  });

  test("does not execute JSON embedded in prose", () => {
    const snippet = JSON.stringify({ name: "apply_patch", arguments: { patch: PATCH } });
    const content = `Here is an example config you could use:\n${snippet}\nLet me know if that helps.`;
    expect(parseContentToolCall(content)).toEqual({ status: "none" });
  });

  test("does not execute a fenced JSON block surrounded by prose", () => {
    const inner = JSON.stringify({ name: "apply_patch", arguments: { patch: PATCH } });
    const content = `Try this shape:\n\`\`\`json\n${inner}\n\`\`\`\nHope that helps.`;
    expect(parseContentToolCall(content)).toEqual({ status: "none" });
  });

  test("returns invalid when the tool name is not registered", () => {
    const content = JSON.stringify({ name: "delete_everything", arguments: { path: "." } });
    const result = parseContentToolCall(content);
    expect(result.status).toBe("invalid");
    if (result.status === "invalid") {
      expect(result.attemptedName).toBe("delete_everything");
      expect(result.reason).toContain("Unknown tool");
    }
  });

  test("returns invalid when required arguments are missing", () => {
    const content = JSON.stringify({ name: "apply_patch", arguments: {} });
    const result = parseContentToolCall(content);
    expect(result.status).toBe("invalid");
    if (result.status === "invalid") {
      expect(result.attemptedName).toBe("apply_patch");
      expect(result.reason).toContain("patch");
    }
  });
});
