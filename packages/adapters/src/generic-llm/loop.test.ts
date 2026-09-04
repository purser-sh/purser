import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildLoopRequestBody, buildSystemPrompt, runToolLoop } from "./loop.ts";

const PATCH = '@@ -1,0 +1,1 @@\n<!-- Purser -->\n';

function readFileContent(path: string): string {
  return JSON.stringify({ name: "read_file", arguments: { path } });
}

function mockFetchResponse(content: string): typeof fetch {
  let calls = 0;
  return (async () => {
    calls += 1;
    if (calls > 1) {
      return new Response(
        JSON.stringify({
          choices: [{ message: { role: "assistant", content: "Done." } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response(
      JSON.stringify({
        choices: [{ message: { role: "assistant", content } }],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as unknown as typeof fetch;
}

async function collectEvents(input: Parameters<typeof runToolLoop>[0]) {
  const events: Array<{ kind?: string; name?: string; text?: string; ok?: boolean }> = [];
  for await (const event of runToolLoop(input)) {
    events.push(event as { kind?: string; name?: string; text?: string; ok?: boolean });
  }
  return events;
}

describe("generic LLM tool loop", () => {
  test("sends write_file and apply_patch to the model when allowFiles is true", async () => {
    const originalFetch = globalThis.fetch;
    let capturedBody: Record<string, unknown> | undefined;
    globalThis.fetch = (async (_url: string | URL, init?: RequestInit) => {
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
    }) as unknown as typeof fetch;

    try {
      const events = await collectEvents({
        allowFiles: true,
        runId: "run_test",
        cwd: process.cwd(),
        workspaceRoot: process.cwd(),
        prompt: "add a comment to README.md",
        modelId: "llama3.2",
        permissionMode: "auto_edit",
        signal: AbortSignal.timeout(5000),
        config: { baseUrl: "http://127.0.0.1:11434/v1", apiKey: null, settings: {} },
      });
      expect(events.some((event) => event.kind === "done")).toBe(true);
      const tools = capturedBody?.tools as Array<{ function: { name: string } }> | undefined;
      expect(tools?.map((tool) => tool.function.name)).toEqual(
        expect.arrayContaining(["read_file", "write_file", "apply_patch", "ripgrep_search"]),
      );
      expect(capturedBody?.tool_choice).toBe("auto");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("executes read_file emitted as bare JSON content", async () => {
    const root = mkdtempSync(join(tmpdir(), "purser-loop-"));
    writeFileSync(join(root, "note.txt"), "hello\n", "utf8");
    const content = readFileContent("note.txt");
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetchResponse(content);

    try {
      const events = await collectEvents({
        allowFiles: true,
        runId: "run_bare_json",
        cwd: root,
        workspaceRoot: root,
        prompt: "read note.txt",
        modelId: "qwen2.5-coder:7b",
        permissionMode: "auto_edit",
        signal: AbortSignal.timeout(5000),
        config: { baseUrl: "http://127.0.0.1:11434/v1", apiKey: null, settings: {} },
      });
      expect(events.some((event) => event.kind === "text" && event.text?.includes('"name"'))).toBe(false);
      expect(events.some((event) => event.kind === "tool_call" && event.name === "read_file")).toBe(true);
      expect(events.some((event) => event.kind === "tool_result" && event.ok === true)).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("executes read_file inside a <tool_call> wrapper", async () => {
    const root = mkdtempSync(join(tmpdir(), "purser-loop-"));
    writeFileSync(join(root, "note.txt"), "hello\n", "utf8");
    const inner = readFileContent("note.txt");
    const content = `<tool_call>\n${inner}\n</tool_call>`;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetchResponse(content);

    try {
      const events = await collectEvents({
        allowFiles: true,
        runId: "run_tool_call_tag",
        cwd: root,
        workspaceRoot: root,
        prompt: "read note.txt",
        modelId: "qwen2.5-coder:7b",
        permissionMode: "auto_edit",
        signal: AbortSignal.timeout(5000),
        config: { baseUrl: "http://127.0.0.1:11434/v1", apiKey: null, settings: {} },
      });
      expect(events.some((event) => event.kind === "tool_call" && event.name === "read_file")).toBe(true);
      expect(events.some((event) => event.kind === "text" && event.text?.includes("<tool_call>"))).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("executes read_file inside a ```json fenced block", async () => {
    const root = mkdtempSync(join(tmpdir(), "purser-loop-"));
    writeFileSync(join(root, "note.txt"), "hello\n", "utf8");
    const inner = readFileContent("note.txt");
    const content = `\`\`\`json\n${inner}\n\`\`\``;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetchResponse(content);

    try {
      const events = await collectEvents({
        allowFiles: true,
        runId: "run_json_fence",
        cwd: root,
        workspaceRoot: root,
        prompt: "read note.txt",
        modelId: "qwen2.5-coder:7b",
        permissionMode: "auto_edit",
        signal: AbortSignal.timeout(5000),
        config: { baseUrl: "http://127.0.0.1:11434/v1", apiKey: null, settings: {} },
      });
      expect(events.some((event) => event.kind === "tool_call" && event.name === "read_file")).toBe(true);
      expect(events.some((event) => event.kind === "text" && event.text?.includes("```"))).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("does not execute JSON embedded in a prose answer", async () => {
    const snippet = JSON.stringify({ name: "apply_patch", arguments: { patch: PATCH } });
    const content = `You can structure it like this:\n${snippet}\nBut I would use write_file instead.`;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetchResponse(content);

    try {
      const events = await collectEvents({
        allowFiles: true,
        runId: "run_prose_json",
        cwd: process.cwd(),
        workspaceRoot: process.cwd(),
        prompt: "how should I edit a file?",
        modelId: "qwen2.5-coder:7b",
        permissionMode: "auto_edit",
        signal: AbortSignal.timeout(5000),
        config: { baseUrl: "http://127.0.0.1:11434/v1", apiKey: null, settings: {} },
      });
      expect(events.some((event) => event.kind === "tool_call")).toBe(false);
      expect(events.some((event) => event.kind === "text" && event.text?.includes("write_file"))).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("ask mode write_file emits a staged diff without writing to disk", async () => {
    const root = mkdtempSync(join(tmpdir(), "purser-loop-ask-"));
    writeFileSync(join(root, "README.md"), "before\n", "utf8");
    const content = JSON.stringify({ name: "write_file", arguments: { path: "README.md", content: "after\n" } });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetchResponse(content);

    try {
      const events = await collectEvents({
        allowFiles: true,
        runId: "run_ask_stage",
        cwd: root,
        workspaceRoot: root,
        prompt: "edit README",
        modelId: "qwen2.5-coder:7b",
        permissionMode: "ask",
        askPermission: async () => true,
        signal: AbortSignal.timeout(5000),
        config: { baseUrl: "http://127.0.0.1:11434/v1", apiKey: null, settings: {} },
      });
      const diff = events.find((event) => event.kind === "file_diff") as
        | { patch?: string; staged?: boolean }
        | undefined;
      expect(diff?.staged).toBe(true);
      expect(diff?.patch).toContain("+after");
      expect(await Bun.file(join(root, "README.md")).text()).toBe("before\n");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("shows invalid content tool calls as a failed tool row, not prose", async () => {
    const content = JSON.stringify({ name: "apply_patch", arguments: {} });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetchResponse(content);

    try {
      const events = await collectEvents({
        allowFiles: true,
        runId: "run_invalid_call",
        cwd: process.cwd(),
        workspaceRoot: process.cwd(),
        prompt: "patch README",
        modelId: "qwen2.5-coder:7b",
        permissionMode: "auto_edit",
        signal: AbortSignal.timeout(5000),
        config: { baseUrl: "http://127.0.0.1:11434/v1", apiKey: null, settings: {} },
      });
      expect(events.some((event) => event.kind === "text" && event.text === content)).toBe(false);
      expect(events.some((event) => event.kind === "tool_call" && event.name === "apply_patch")).toBe(true);
      expect(events.some((event) => event.kind === "tool_result" && event.ok === false)).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("system prompt includes workspace filenames", async () => {
    const root = mkdtempSync(join(tmpdir(), "purser-loop-context-"));
    writeFileSync(join(root, "README.md"), "# demo\n", "utf8");
    writeFileSync(join(root, "package.json"), "{}\n", "utf8");
    const originalFetch = globalThis.fetch;
    let capturedBody: Record<string, unknown> | undefined;
    globalThis.fetch = (async (_url: string | URL, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          choices: [{ message: { role: "assistant", content: "Done." } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    try {
      await collectEvents({
        allowFiles: true,
        runId: "run_context",
        cwd: root,
        workspaceRoot: root,
        prompt: "what is here?",
        modelId: "qwen2.5-coder:7b",
        permissionMode: "ask",
        signal: AbortSignal.timeout(5000),
        config: { baseUrl: "http://127.0.0.1:11434/v1", apiKey: null, settings: {} },
      });
      const messages = capturedBody?.messages as Array<{ role: string; content: string }>;
      const system = messages?.find((message) => message.role === "system")?.content ?? "";
      expect(system).toContain("README.md");
      expect(system).toContain("You have tools. Use them.");
      expect(system.includes("tools section")).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("loops: second provider request includes the first tool result", async () => {
    const root = mkdtempSync(join(tmpdir(), "purser-loop-turns-"));
    writeFileSync(join(root, "note.txt"), "hello\n", "utf8");
    const originalFetch = globalThis.fetch;
    let calls = 0;
    const bodies: Record<string, unknown>[] = [];
    globalThis.fetch = (async (_url: string | URL, init?: RequestInit) => {
      calls += 1;
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      bodies.push(body);
      if (calls === 1) {
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: null,
                  tool_calls: [
                    {
                      id: "call_read_1",
                      type: "function",
                      function: {
                        name: "read_file",
                        arguments: JSON.stringify({ path: "note.txt" }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          choices: [{ message: { role: "assistant", content: "The file says hello." } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    try {
      const events = await collectEvents({
        allowFiles: true,
        runId: "run_loop",
        cwd: root,
        workspaceRoot: root,
        prompt: "read note.txt",
        modelId: "qwen2.5-coder:7b",
        permissionMode: "auto_edit",
        signal: AbortSignal.timeout(5000),
        config: { baseUrl: "http://127.0.0.1:11434/v1", apiKey: null, settings: {} },
      });
      expect(calls).toBe(2);
      const secondMessages = bodies[1]?.messages as Array<{ role: string; content?: string; tool_call_id?: string }>;
      expect(secondMessages?.some((message) => message.role === "tool" && message.content?.includes("hello"))).toBe(true);
      expect(events.some((event) => event.kind === "tool_call" && event.name === "read_file")).toBe(true);
      expect(events.some((event) => event.kind === "text" && event.text?.includes("hello"))).toBe(true);
      expect(events.filter((event) => event.kind === "text")).toHaveLength(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("buildLoopRequestBody keeps tools in the native field", () => {
    const body = buildLoopRequestBody({
      model: "qwen2.5-coder:7b",
      messages: [{ role: "system", content: "x" }],
      tools: [{ type: "function", function: { name: "list_dir", description: "list", parameters: { type: "object", properties: {} } } }],
    });
    expect(body.tools).toBeDefined();
    expect(body.tool_choice).toBe("auto");
  });

  test("buildSystemPrompt states tool-use rules plainly", () => {
    const root = mkdtempSync(join(tmpdir(), "purser-prompt-"));
    writeFileSync(join(root, "main.ts"), "export {}\n", "utf8");
    const prompt = buildSystemPrompt({ workspaceRoot: root, permissionMode: "ask" });
    expect(prompt).toContain("Never describe a tool. Call it.");
    expect(prompt).toContain("main.ts");
  });
});
