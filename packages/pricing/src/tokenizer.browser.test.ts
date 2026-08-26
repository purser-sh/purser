import { describe, expect, test } from "bun:test";
import { countTokens } from "./tokenizer.browser.ts";

describe("browser tokenizer", () => {
  test("Anthropic model ids are approximate without WASM", () => {
    const count = countTokens("hello world", "claude-sonnet-4-20250514");
    expect(count.source).toBe("approximate");
    expect(count.providerFamily).toBe("anthropic");
    expect(count.value).toBeGreaterThan(0);
  });

  test("OpenAI model ids stay exact via gpt-tokenizer", () => {
    const count = countTokens("hello world", "gpt-4o");
    expect(count.source).toBe("exact");
    expect(count.providerFamily).toBe("openai");
  });
});
