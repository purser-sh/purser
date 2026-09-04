import { describe, expect, test } from "bun:test";
import { gateToolCall, gateReasonForModel } from "./tool-gate.ts";

const REGISTERED = new Set([
  "read_file",
  "read_document",
  "write_file",
  "apply_patch",
  "list_dir",
  "ripgrep_search",
  "run_bash",
  "web_search",
]);

describe("gateToolCall", () => {
  test("rejects the exact malformed JS-expression payload that erased a file", () => {
    const raw = `{ "path": "README.md", "content": "<!-- Purser -->\\n" + (read_file("README.md") ?? "") }`;
    const result = gateToolCall("write_file", raw, REGISTERED);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("Invalid JSON");
      expect(gateReasonForModel(result)).toContain("Fix the arguments");
    }
  });

  test("passes a valid read_document call", () => {
    const result = gateToolCall("read_document", JSON.stringify({ path: "spec.pdf" }), REGISTERED);
    expect(result.ok).toBe(true);
  });

  test("passes a valid write_file call", () => {
    const result = gateToolCall(
      "write_file",
      JSON.stringify({ path: "README.md", content: "<!-- Purser -->\n" }),
      REGISTERED,
    );
    expect(result).toEqual({
      ok: true,
      name: "write_file",
      args: { path: "README.md", content: "<!-- Purser -->\n" },
    });
  });

  test("rejects an unregistered tool name", () => {
    const result = gateToolCall("delete_everything", JSON.stringify({ path: "." }), REGISTERED);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("Unknown tool");
    }
  });

  test("rejects an extra field under strict schema", () => {
    const result = gateToolCall(
      "write_file",
      JSON.stringify({ path: "README.md", content: "hi", force: true }),
      REGISTERED,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason.toLowerCase()).toContain("unrecognized");
    }
  });

  test("rejects wrong argument types without coercing", () => {
    const result = gateToolCall("write_file", JSON.stringify({ path: "README.md", content: 42 }), REGISTERED);
    expect(result.ok).toBe(false);
  });
});
