import { describe, expect, test } from "bun:test";
import { parseLocalCommand } from "./voice-commands.ts";

describe("local voice commands", () => {
  test("parses stop, approve, and chat", () => {
    expect(parseLocalCommand("stop")).toEqual({ kind: "stop" });
    expect(parseLocalCommand("Approve")).toEqual({ kind: "approve" });
    expect(parseLocalCommand("switch provider grok")).toEqual({
      kind: "switch_provider",
      providerId: "grok",
    });
    expect(parseLocalCommand("fix the tests")).toEqual({ kind: "chat", text: "fix the tests" });
  });
});
