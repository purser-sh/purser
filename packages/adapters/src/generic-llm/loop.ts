import type { AgentEvent } from "@purser-sh/protocol";
import type { RunInput } from "../types.ts";
import { loadMcpTools } from "../mcp.ts";
import { executeTool, MAX_TURNS, TOOL_DEFINITIONS, toolSummary } from "./tools.ts";
import { usageEventFromProvider } from "../usage.ts";

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
};

type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

function parseArgs(raw: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(raw);
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  } catch {
    return { raw };
  }
  return { raw };
}

function isLoopRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseToolCalls(value: unknown): ToolCall[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const out: ToolCall[] = [];
  for (const item of value) {
    if (!isLoopRecord(item) || typeof item.id !== "string" || item.type !== "function") {
      continue;
    }
    if (!isLoopRecord(item.function) || typeof item.function.name !== "string" || typeof item.function.arguments !== "string") {
      continue;
    }
    out.push({
      id: item.id,
      type: "function",
      function: { name: item.function.name, arguments: item.function.arguments },
    });
  }
  return out.length > 0 ? out : undefined;
}

async function complete(input: {
  baseUrl: string;
  apiKey: string | null;
  model: string;
  messages: ChatMessage[];
  tools: Array<{ type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } }> | undefined;
  signal: AbortSignal;
}): Promise<{ message: ChatMessage; usage?: unknown }> {
  const url = `${input.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (input.apiKey) {
    headers.authorization = `Bearer ${input.apiKey}`;
  }
  const response = await fetch(url, {
    method: "POST",
    headers,
    signal: input.signal,
    body: JSON.stringify({
      model: input.model,
      messages: input.messages,
      tools: input.tools,
      stream: false,
    }),
  });
  if (!response.ok) {
    throw new Error(`LLM ${response.status}: ${await response.text()}`);
  }
  const body: unknown = await response.json();
  if (!isLoopRecord(body) || !Array.isArray(body.choices)) {
    throw new Error("LLM returned no message");
  }
  const first = body.choices[0];
  const message = isLoopRecord(first) && isLoopRecord(first.message) ? first.message : undefined;
  if (message === undefined) {
    throw new Error("LLM returned no message");
  }
  return {
    message: {
      role: "assistant",
      content: typeof message.content === "string" ? message.content : null,
      tool_calls: parseToolCalls(message.tool_calls),
    },
    usage: isLoopRecord(body.usage) ? body.usage : undefined,
  };
}

export async function* runToolLoop(input: RunInput & { allowFiles: boolean }): AsyncIterable<AgentEvent> {
  const baseUrl = input.config?.baseUrl ?? "http://127.0.0.1:11434/v1";
  const model = input.modelId ?? "llama3.2";
  const mcp = await loadMcpTools(input.workspaceRoot);
  const tools = [
    ...(input.allowFiles ? TOOL_DEFINITIONS : TOOL_DEFINITIONS.filter((tool) => tool.function.name === "web_search")),
    ...(mcp?.definitions ?? []),
  ];
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: [
        "You are a coding agent. Use tools to inspect and edit the workspace.",
        "When the user asks you to change files, you must call write_file or apply_patch — reading or searching alone is not enough.",
        "Never escape the workspace root.",
        input.extraSystemPrompt ?? "",
      ]
        .filter((part) => part.length > 0)
        .join("\n\n"),
    },
    { role: "user", content: input.prompt },
  ];

  yield { kind: "session_started", providerSessionId: input.providerSessionId ?? `llm-${input.runId}` };

  try {
  for (let turn = 0; turn < MAX_TURNS; turn += 1) {
    if (input.signal.aborted) {
      yield { kind: "done", status: "cancelled", summary: "Run cancelled" };
      return;
    }
    const result = await complete({
      baseUrl,
      apiKey: input.config?.apiKey ?? null,
      model,
      messages,
      tools,
      signal: input.signal,
    });
    const usage = usageEventFromProvider(result.usage);
    if (usage !== null) {
      yield usage;
    }
    const assistant = result.message;
    messages.push(assistant);
    const text = assistant.content ?? "";
    if (text.length > 0) {
      yield { kind: "text_delta", text };
      yield { kind: "text", text };
    }
    const calls = assistant.tool_calls ?? [];
    if (calls.length === 0) {
      yield { kind: "done", status: "ok", summary: text.slice(0, 160) || "Finished" };
      return;
    }
    for (const call of calls) {
      const args = parseArgs(call.function.arguments);
      const summary = toolSummary(call.function.name, args);
      if (input.permissionMode === "ask" && input.askPermission && call.function.name !== "read_file" && call.function.name !== "list_dir" && call.function.name !== "ripgrep_search" && call.function.name !== "web_search") {
        const requestId = call.id;
        yield { kind: "permission_request", requestId, action: call.function.name, detail: args };
        const allow = await input.askPermission({ requestId, action: call.function.name, detail: args });
        if (!allow) {
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: "User denied this tool call.",
          });
          continue;
        }
      }
      yield { kind: "tool_call", toolId: call.id, name: call.function.name, input: args, summary };
      const started = Date.now();
      const executed = call.function.name.startsWith("mcp__")
        ? await (mcp?.call(call.function.name, args) ?? Promise.resolve({ ok: false, output: "MCP is not loaded" }))
        : await executeTool({
            name: call.function.name,
            args,
            cwd: input.cwd,
            webSearch: async (query) => {
              const key =
                typeof input.config?.settings.perplexityApiKey === "string"
                  ? input.config.settings.perplexityApiKey
                  : (input.config?.apiKey ?? null);
              if (key === null || key.length === 0) {
                return "Perplexity is not configured. Set PERPLEXITY_API_KEY or a key in Settings.";
              }
              return webSearchPerplexity(key, query, input.signal);
            },
          });
      yield {
        kind: "tool_result",
        toolId: call.id,
        ok: executed.ok,
        output: executed.output,
        ms: Date.now() - started,
      };
      if (call.function.name === "write_file" || call.function.name === "apply_patch") {
        const path = typeof args.path === "string" ? args.path : "patch";
        yield { kind: "file_diff", path, patch: String(executed.output), added: 1, removed: 0 };
      }
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: typeof executed.output === "string" ? executed.output : JSON.stringify(executed.output),
      });
    }
  }
  yield { kind: "done", status: "error", summary: "Turn cap reached" };
  } finally {
    mcp?.close();
  }
}

async function webSearchPerplexity(apiKey: string, query: string, signal: AbortSignal): Promise<string> {
  const response = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    signal,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "sonar",
      messages: [{ role: "user", content: query }],
    }),
  });
  if (!response.ok) {
    return `Perplexity error ${response.status}`;
  }
  const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return body.choices?.[0]?.message?.content ?? "no result";
}
