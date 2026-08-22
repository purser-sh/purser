import { describe, expect, test } from "bun:test";
import { AgentEventSchema } from "@agentdeck/protocol";
import { echoAdapter } from "./echo.ts";

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iterable) {
    items.push(item);
  }
  return items;
}

describe("echoAdapter", () => {
  test("reports health and models", async () => {
    expect(echoAdapter.id).toBe("echo");
    expect(await echoAdapter.checkHealth()).toEqual({
      ok: true,
      detail: "echo is always healthy",
    });
    expect(await echoAdapter.listModels()).toEqual([{ id: "echo-v1", label: "Echo v1" }]);
  });

  test("emits text, a tool call, a diff, and done", async () => {
    const events = await collect(
      echoAdapter.run({
        runId: "run_1",
        cwd: "/tmp",
        prompt: "hello",
        permissionMode: "ask",
        signal: new AbortController().signal,
      }),
    );
    const kinds = events.map((event) => event.kind);
    expect(kinds).toContain("text");
    expect(kinds).toContain("tool_call");
    expect(kinds).toContain("file_diff");
    expect(kinds.at(-1)).toBe("done");
    for (const event of events) {
      expect(AgentEventSchema.parse(event)).toEqual(event);
    }
  });

  test("reuses providerSessionId when resuming", async () => {
    const events = await collect(
      echoAdapter.run({
        runId: "run_2",
        cwd: "/tmp",
        prompt: "again",
        providerSessionId: "echo-run_1",
        permissionMode: "ask",
        signal: new AbortController().signal,
      }),
    );
    const started = events.find((event) => event.kind === "session_started");
    expect(started).toEqual({
      kind: "session_started",
      providerSessionId: "echo-run_1",
    });
  });
});
