import { describe, expect, test } from "bun:test";
import type { Session, SpendReportPayload, StoredEvent } from "@purser-sh/protocol";
import { collapseSpendRows, sessionSpendLabel, sessionSpendRows } from "./session-spend.ts";

const session: Session = {
  id: "ses_abc",
  workspaceId: "ws_1",
  title: "Fix the tests",
  providerId: "echo",
  modelId: "echo-v1",
  providerSessionId: null,
  permissionMode: "ask",
  worktreePath: null,
  status: "idle",
  tokensIn: 0,
  tokensOut: 0,
  costUsd: 0,
  bypassExpiresAt: null,
  bypassRunsRemaining: null,
  createdAt: "2026-08-27T00:00:00.000Z",
  updatedAt: "2026-08-27T00:00:00.000Z",
};

describe("session spend labels", () => {
  test("uses the session title when it is set", () => {
    expect(sessionSpendLabel("ses_abc", [session], [])).toBe("Fix the tests");
  });

  test("uses the first prompt for untitled sessions", () => {
    const untitled = { ...session, title: "New session" };
    const events: StoredEvent[] = [
      {
        id: "ev_1",
        sessionId: "ses_abc",
        seq: 0,
        kind: "user_message",
        role: "user",
        payload: { kind: "user_message", text: "Read the README and summarize" },
        createdAt: "2026-08-27T01:00:00.000Z",
      },
    ];
    expect(sessionSpendLabel("ses_abc", [untitled], events)).toBe("Read the README and summarize");
  });

  test("deleted sessions fall back to the first prompt, never the id", () => {
    const events: StoredEvent[] = [
      {
        id: "ev_1",
        sessionId: "ses_gone",
        seq: 0,
        kind: "user_message",
        role: "user",
        payload: { kind: "user_message", text: "hello" },
        createdAt: "2026-08-27T01:00:00.000Z",
      },
    ];
    expect(sessionSpendLabel("ses_gone", [], events)).toBe("hello");
    expect(sessionSpendLabel("ses_gone", [], [])).toBe("untitled session");
  });

  test("collapses to top 5 with an others row", () => {
    const rows = Array.from({ length: 8 }, (_, index) => ({
      key: `Session ${index}`,
      tokens: 100 - index,
      costUsdMicros: null as number | null,
    }));
    const collapsed = collapseSpendRows(rows);
    expect(collapsed).toHaveLength(6);
    expect(collapsed[5]?.key).toBe("3 others");
    expect(collapsed[5]?.tokens).toBe(100 - 5 + 100 - 6 + 100 - 7);
  });

  test("builds labeled session rows from a spend report", () => {
    const report: SpendReportPayload = {
      rows: [{ groupKey: "ses_abc", inputTokens: 10, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsdMicros: null }],
      totals: {
        groupKey: "totals",
        inputTokens: 10,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        costUsdMicros: null,
      },
      generatedAt: "2026-08-27T00:00:00.000Z",
      unpricedModels: [],
    };
    expect(sessionSpendRows(report, [session], [])[0]?.key).toBe("Fix the tests");
  });
});
