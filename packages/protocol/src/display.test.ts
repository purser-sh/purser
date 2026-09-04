import { describe, expect, test } from "bun:test";
import {
  formatMixedSpendLine,
  ledgerCostCompact,
  ledgerCostLabel,
  ledgerTokenLabel,
  modelOptionLabel,
  modelSelectState,
  subscriptionCostExplanation,
} from "./display.ts";

describe("display labels are derived from values", () => {
  test("model label comes from catalog id, not a parallel string", () => {
    const catalog = [{ id: "echo-v1", label: "Echo v1" }];
    expect(modelOptionLabel("echo-v1", catalog)).toBe("Echo v1");
    expect(modelSelectState("echo-v1", catalog)).toBe("resolved");
    expect(modelOptionLabel("sonnet", catalog)).toBe("invalid: sonnet");
    expect(modelSelectState("sonnet", catalog)).toBe("invalid");
    expect(modelOptionLabel("echo-v1", undefined)).toBe("loading…");
  });

  test("subscription and local providers never show a dollar cost", () => {
    expect(ledgerCostLabel(1_000_000, "subscription")).toBe("subscription plan, tokens only");
    expect(ledgerCostCompact(1_000_000, "subscription")).toBe("subscription plan, tokens only");
    expect(ledgerCostLabel(5_000_000, "local")).toBe("local, tokens only");
    expect(ledgerCostCompact(null, "local")).toBe("local, tokens only");
    expect(subscriptionCostExplanation()).toContain("not knowable");
  });

  test("a mixed metered and subscription total never becomes one currency figure", () => {
    const line = formatMixedSpendLine({
      tokens: 10_000,
      tokenSource: "provider_usage",
      meteredCostUsdMicros: 1_500_000,
      hasSubscriptionOrLocal: true,
    });
    expect(line).toContain("metered");
    expect(line).toContain("subscription/local tokens only");
    expect(line).not.toMatch(/^[^·]*\$/);
  });

  test("approximate token counts are never shown as exact", () => {
    expect(ledgerTokenLabel(1234, "estimated")).toBe("≈1,234");
    expect(ledgerTokenLabel(1234, "provider_usage")).toBe("1,234");
  });
});
