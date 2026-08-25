import { describe, expect, test } from "bun:test";
import { countTokens } from "@agentdeck/pricing";
import { coachPrompt, compactPrompt, estimateTokens } from "./index.ts";

describe("prompt coach", () => {
  test("counts tokens with gpt-tokenizer, not character length / 4", () => {
    const text = "hello deck";
    const counted = estimateTokens(text);
    const viaPricing = countTokens(text, "openai");
    expect(counted.source).toBe("tokenizer");
    expect(counted.value).toBe(viaPricing.value);
    expect(counted.value).not.toBe(Math.ceil(text.length / 4));
  });

  test("shortens filler-heavy prompts and keeps code fences", () => {
    const original =
      "Please could you actually just really refactor this module. Okay you know I want you to keep behavior.\n```ts\nexport const x = 1;\n```";
    const compact = compactPrompt(original);
    expect(compact.includes("```ts")).toBe(true);
    expect(compact.toLowerCase().includes("please")).toBe(false);
    const estimate = coachPrompt(original);
    expect(estimate.source).toBe("tokenizer");
    expect(estimate.compactTokens).toBeLessThan(estimate.tokens);
    expect(estimate.savedTokens).toBeGreaterThan(0);
    expect(estimate.notes.some((note) => note.includes("prompt only"))).toBe(true);
  });

  test("does not strip real instructions that contain you/I", () => {
    const compact = compactPrompt("You are a senior engineer. Please refactor auth.");
    expect(compact.toLowerCase().includes("you are a senior engineer")).toBe(true);
    expect(compact.toLowerCase().includes("please")).toBe(false);
  });
});
