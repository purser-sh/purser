import { describe, expect, test } from "bun:test";
import type { StoredEvent } from "@purser-sh/protocol";
import { buildRenderItems } from "./ChatPane.tsx";

function textEvent(text: string): StoredEvent {
  return {
    id: "ev_text",
    sessionId: "ses_1",
    seq: 1,
    kind: "text",
    role: "assistant",
    payload: { kind: "text", text },
    createdAt: new Date().toISOString(),
  };
}

describe("assistant transcript rendering", () => {
  test("one assistant text turn produces one render item", () => {
    const items = buildRenderItems([textEvent("Hello there.")]);
    const assistantItems = items.filter((item) => item.kind === "event" && item.event.payload.kind === "text");
    expect(assistantItems).toHaveLength(1);
  });
});
