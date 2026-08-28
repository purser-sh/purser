import { describe, expect, test } from "bun:test";
import { isOllamaCoderModel, ollamaModelEditWarning } from "./ollama-models.ts";

describe("ollama model hints", () => {
  test("treats coder models as safe for edits", () => {
    expect(isOllamaCoderModel("qwen2.5-coder:7b")).toBe(true);
    expect(isOllamaCoderModel("deepseek-coder-v2")).toBe(true);
  });

  test("warns on instruct models", () => {
    expect(isOllamaCoderModel("qwen2.5:7b-instruct")).toBe(false);
    expect(ollamaModelEditWarning("qwen2.5:7b-instruct")).toContain("qwen2.5-coder");
  });

  test("returns null for coder models", () => {
    expect(ollamaModelEditWarning("qwen2.5-coder:14b")).toBeNull();
  });
});
