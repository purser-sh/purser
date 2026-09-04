import { describe, expect, test } from "bun:test";
import type { StoredEvent } from "@purser-sh/protocol";
import { llmHistoryFromStoredEvents, priorSessionEvents } from "./conversation-history.ts";

function user(text: string): StoredEvent {
  return {
    id: "ev_user",
    sessionId: "ses_1",
    seq: 0,
    kind: "user_message",
    role: "user",
    payload: { kind: "user_message", text },
    createdAt: new Date().toISOString(),
  };
}

describe("conversation history", () => {
  test("priorSessionEvents drops the live prompt when it is already persisted", () => {
    const events = [user("earlier"), user("current")];
    const prior = priorSessionEvents(events, "current");
    expect(prior).toHaveLength(1);
    expect(prior[0]?.payload).toEqual({ kind: "user_message", text: "earlier" });
  });

  test("llmHistoryFromStoredEvents rebuilds assistant tool turns", () => {
    const events: StoredEvent[] = [
      user("read note"),
      {
        id: "ev_call",
        sessionId: "ses_1",
        seq: 2,
        kind: "tool_call",
        role: "tool",
        payload: {
          kind: "tool_call",
          toolId: "call_1",
          name: "read_file",
          input: { path: "note.txt" },
          summary: "read note.txt",
        },
        createdAt: new Date().toISOString(),
      },
      {
        id: "ev_result",
        sessionId: "ses_1",
        seq: 3,
        kind: "tool_result",
        role: "tool",
        payload: {
          kind: "tool_result",
          toolId: "call_1",
          ok: true,
          output: "hello",
          ms: 1,
        },
        createdAt: new Date().toISOString(),
      },
      {
        id: "ev_text",
        sessionId: "ses_1",
        seq: 4,
        kind: "text",
        role: "assistant",
        payload: { kind: "text", text: "It says hello." },
        createdAt: new Date().toISOString(),
      },
    ];

    const history = llmHistoryFromStoredEvents(events);
    expect(history[0]).toEqual({ role: "user", content: "read note" });
    expect(history[1]?.role).toBe("assistant");
    expect(history[1]?.tool_calls?.[0]?.function.name).toBe("read_file");
    expect(history[2]).toEqual({ role: "tool", tool_call_id: "call_1", content: "hello" });
    expect(history[3]).toEqual({ role: "assistant", content: "It says hello." });
  });
});
