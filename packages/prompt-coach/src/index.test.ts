import { describe, expect, test } from "bun:test";
import { coachPrompt, compactPrompt, estimateTokens } from "./index.ts";

describe("prompt coach", () => {
  test("estimates tokens from character length", () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcdefgh")).toBe(2);
  });

  test("shortens filler-heavy prompts and keeps code fences", () => {
    const original =
      "Please could you actually just really refactor this module. Okay you know I want you to keep behavior.\n```ts\nexport const x = 1;\n```";
    const compact = compactPrompt(original);
    expect(compact.includes("```ts")).toBe(true);
    expect(compact.toLowerCase().includes("please")).toBe(false);
    const estimate = coachPrompt(original);
    expect(estimate.compactTokens).toBeLessThan(estimate.tokens);
    expect(estimate.savedTokens).toBeGreaterThan(0);
  });

  test("does not strip real instructions that contain you/I", () => {
    const compact = compactPrompt("You are a senior engineer. Please refactor auth.");
    expect(compact.toLowerCase().includes("you are a senior engineer")).toBe(true);
    expect(compact.toLowerCase().includes("please")).toBe(false);
  });
});
