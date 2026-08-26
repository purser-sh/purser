import { describe, expect, test } from "bun:test";
import { BUILTIN_CATALOG } from "./catalog.ts";
import { tokensToUsdMicros, usdToMicros } from "./money.ts";
import { mergeCatalog, priceFor } from "./price.ts";
import { countTokens, formatTokenCount, makeTokenCount, TOKENIZER_GPT } from "./tokenizer.ts";

describe("money", () => {
  test("parses decimal USD into micro-USD without floats", () => {
    expect(usdToMicros("2.00")).toBe(2_000_000);
    expect(usdToMicros("0.50")).toBe(500_000);
    expect(tokensToUsdMicros(1_000_000, "2.00")).toBe(2_000_000);
    expect(tokensToUsdMicros(500_000, "2.00")).toBe(1_000_000);
  });
});

describe("priceFor", () => {
  test("prices grok-4.6 from the official row", () => {
    const priced = priceFor("grok", "grok-4.6", {
      inputTokens: 1_000,
      outputTokens: 0,
      cacheReadTokens: null,
      cacheWriteTokens: null,
    });
    expect(priced.kind).toBe("priced");
    if (priced.kind === "priced") {
      expect(priced.usdMicros).toBe(tokensToUsdMicros(1_000, "2.00"));
    }
  });

  test("returns unpriced, never zero, for an unknown model", () => {
    const result = priceFor("generic_llm", "mystery-model", {
      inputTokens: 10,
      outputTokens: 10,
      cacheReadTokens: null,
      cacheWriteTokens: null,
    });
    expect(result).toEqual({ kind: "unpriced", reason: "no catalog row for generic_llm/mystery-model" });
  });

  test("uses the published long-context grok rates at 200k input", () => {
    const priced = priceFor("grok", "grok-4.6", {
      inputTokens: 200_000,
      outputTokens: 0,
      cacheReadTokens: null,
      cacheWriteTokens: null,
    });
    expect(priced.kind).toBe("priced");
    if (priced.kind === "priced") {
      expect(priced.usdMicros).toBe(tokensToUsdMicros(200_000, "4.00"));
    }
  });

  test("deep-merges user overrides on top of the catalog", () => {
    const catalog = mergeCatalog([
      {
        providerId: "grok",
        model: "grok-4.6",
        inputPerMTokUsd: "1.00",
        outputPerMTokUsd: "3.00",
        cacheReadPerMTokUsd: "0.50",
        cacheWritePerMTokUsd: null,
        asOf: "2026-08-25",
        sourceUrl: "file://~/.agentdeck/pricing.json",
      },
    ]);
    const priced = priceFor(
      "grok",
      "grok-4.6",
      { inputTokens: 1_000, outputTokens: 0, cacheReadTokens: null, cacheWriteTokens: null },
      catalog,
    );
    expect(priced.kind).toBe("priced");
    if (priced.kind === "priced") {
      expect(priced.usdMicros).toBe(tokensToUsdMicros(1_000, "1.00"));
    }
  });

  test("builtin catalog only contains rows with a sourceUrl", () => {
    expect(BUILTIN_CATALOG.length).toBeGreaterThan(0);
    for (const row of BUILTIN_CATALOG) {
      expect(row.sourceUrl.startsWith("https://")).toBe(true);
    }
  });
});

describe("tokenizer", () => {
  test("openai family through gpt-tokenizer is exact", () => {
    const result = countTokens("hello deck", "openai");
    expect(result.source).toBe("exact");
    expect(result.tokenizer).toBe("gpt-tokenizer");
    expect(result.providerFamily).toBe("openai");
    expect(result.value).toBeGreaterThan(0);
  });

  test("anthropic prompt through gpt-tokenizer is approximate", () => {
    const mismatched = makeTokenCount(10, TOKENIZER_GPT, "anthropic", "openai");
    expect(mismatched.source).toBe("approximate");
    expect(mismatched.tokenizer).toBe("gpt-tokenizer");
    expect(formatTokenCount(mismatched).startsWith("≈")).toBe(true);
  });

  test("anthropic family through @anthropic-ai/tokenizer is exact", () => {
    const result = countTokens("hello deck", "anthropic");
    expect(result.source).toBe("exact");
    expect(result.tokenizer).toBe("@anthropic-ai/tokenizer");
    expect(result.providerFamily).toBe("anthropic");
    expect(result.value).toBeGreaterThan(0);
  });

  test("google family through gpt-tokenizer is approximate", () => {
    const google = countTokens("hello deck", "google");
    expect(google.source).toBe("approximate");
    expect(google.tokenizer).toBe("gpt-tokenizer");
  });

  test("formatTokenCount rejects a bare number at compile time", () => {
    type FormatArg = Parameters<typeof formatTokenCount>[0];
    type BareNumberRejected = number extends FormatArg ? false : true;
    const bareNumberRejected: BareNumberRejected = true;
    expect(bareNumberRejected).toBe(true);
    // @ts-expect-error bare numbers must not reach the render layer
    const _illegal: FormatArg = 1240;
    void _illegal;
    expect(formatTokenCount(countTokens("hello", "openai")).includes("≈")).toBe(false);
    expect(formatTokenCount(countTokens("hello", "google")).startsWith("≈")).toBe(true);
  });
});
