import { describe, expect, test } from "bun:test";
import { usageEventFromProvider } from "./usage.ts";

describe("usageEventFromProvider", () => {
  test("maps recorded OpenAI-style usage without inventing zeros", () => {
    expect(
      usageEventFromProvider({ prompt_tokens: 12, completion_tokens: 3, prompt_tokens_details: { cached_tokens: 2 } }),
    ).toEqual({
      kind: "usage",
      inputTokens: 12,
      outputTokens: 3,
      cacheReadTokens: 2,
      cacheWriteTokens: null,
      source: "provider_usage",
    });
    expect(usageEventFromProvider({ input_tokens: 4 })).toEqual({
      kind: "usage",
      inputTokens: 4,
      outputTokens: null,
      cacheReadTokens: null,
      cacheWriteTokens: null,
      source: "provider_usage",
    });
    expect(usageEventFromProvider({})).toBeNull();
  });
});
