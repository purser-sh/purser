import { describe, expect, test } from "bun:test";
import {
  ledgerCostCompact,
  ledgerCostLabel,
  ledgerTokenLabel,
  modelOptionLabel,
  modelSelectState,
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

  test("subscription providers never show a dollar cost", () => {
    expect(ledgerCostLabel(1_000_000, "subscription")).toBe("included in plan");
    expect(ledgerCostCompact(1_000_000, "subscription")).toBe("included in plan");
  });

  test("approximate token counts are never shown as exact", () => {
    expect(ledgerTokenLabel(1234, "estimated")).toBe("≈1,234");
    expect(ledgerTokenLabel(1234, "provider_usage")).toBe("1,234");
  });
});
