import { describe, expect, test } from "bun:test";
import { runToolLoop } from "./loop.ts";

describe("generic LLM tool loop", () => {
  test("sends write_file and apply_patch to the model when allowFiles is true", async () => {
    const originalFetch = globalThis.fetch;
    let capturedBody: Record<string, unknown> | undefined;
    globalThis.fetch = (async (_url, init) => {
      capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                role: "assistant",
                content: "Done.",
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;

    try {
      const events: unknown[] = [];
      for await (const event of runToolLoop({
        allowFiles: true,
        runId: "run_test",
        cwd: process.cwd(),
        workspaceRoot: process.cwd(),
        prompt: "add a comment to README.md",
        modelId: "llama3.2",
        permissionMode: "auto_edit",
        signal: AbortSignal.timeout(5000),
        config: { baseUrl: "http://127.0.0.1:11434/v1", apiKey: null, settings: {} },
      })) {
        events.push(event);
      }
      expect(events.some((event) => (event as { kind?: string }).kind === "done")).toBe(true);
      const tools = capturedBody?.tools as Array<{ function: { name: string } }> | undefined;
      expect(tools?.map((tool) => tool.function.name)).toEqual(
        expect.arrayContaining(["read_file", "write_file", "apply_patch", "ripgrep_search"]),
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
