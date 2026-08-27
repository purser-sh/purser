import { describe, expect, test } from "bun:test";
import { defaultModelId, isModelCoherent, modelChoices, modelOwners, resolveModelId } from "./models.ts";

describe("provider/model coherence", () => {
  test("a model id is never carried across a provider switch", () => {
    // The reported bug: a session on echo switched to claude_code.
    expect(resolveModelId("claude_code", "echo-v1")).toBe("sonnet");
    expect(resolveModelId("echo", "sonnet")).toBe("echo-v1");
  });

  test("an explicit, valid choice survives", () => {
    expect(resolveModelId("claude_code", "opus")).toBe("opus");
    expect(resolveModelId("codex", "o3")).toBe("o3");
  });

  test("providers that list models at runtime resolve to no selection", () => {
    expect(resolveModelId("ollama", null)).toBeNull();
    expect(resolveModelId("ollama", "llama3.2")).toBe("llama3.2");
    // Another provider's id is still refused, even by an open provider.
    expect(resolveModelId("ollama", "echo-v1")).toBeNull();
  });

  test("impossible pairs are not coherent", () => {
    expect(isModelCoherent("claude_code", "echo-v1")).toBe(false);
    expect(isModelCoherent("codex", "sonnet")).toBe(false);
    expect(isModelCoherent("claude_code", "sonnet")).toBe(true);
    expect(isModelCoherent("claude_code", "")).toBe(false);
  });

  test("a null model means the provider default, which is not impossible", () => {
    expect(isModelCoherent("claude_code", null)).toBe(true);
  });

  test("defaults and ownership come from one table", () => {
    expect(defaultModelId("claude_code")).toBe("sonnet");
    expect(defaultModelId("grok")).toBeNull();
    expect(modelOwners("echo-v1")).toEqual(["echo"]);
    expect(modelOwners("auto").sort()).toEqual(["cursor_agent", "gemini_cli"]);
    expect(modelOwners("llama3.2")).toEqual([]);
    expect(modelChoices("claude_code").map((model) => model.id)).toEqual(["sonnet", "opus", "haiku"]);
  });
});
