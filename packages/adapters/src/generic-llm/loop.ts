import type { AgentEvent } from "@purser-sh/protocol";
import type { RunInput } from "../types.ts";
import { loadMcpTools } from "../mcp.ts";
import { gateToolCall, gateReasonForModel, type GateResult } from "../tool-gate.ts";
import { normalizeProviderResponse } from "../tool-call-normalize.ts";
import { MAX_TURNS, runGatedTool, TOOL_DEFINITIONS, toolSummary, type ToolExecutionResult } from "./tools.ts";
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

function parseMcpArguments(raw: string): { ok: true; args: unknown } | { ok: false; reason: string } {
  try {
    return { ok: true, args: JSON.parse(raw) as unknown };
  } catch {
    return { ok: false, reason: "Invalid JSON in MCP tool arguments." };
  }
}

function isLoopRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function toToolCalls(normalized: Extract<ReturnType<typeof normalizeProviderResponse>, { kind: "calls" }>): ToolCall[] {
  return normalized.calls.map((call) => ({
    id: call.id,
    type: "function" as const,
    function: { name: call.name, arguments: call.rawArguments },
  }));
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
      tool_calls: message.tool_calls as ToolCall[] | undefined,
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
  const registeredNames = new Set(tools.map((tool) => tool.function.name));
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
    const text = assistant.content ?? "";
    const normalized = normalizeProviderResponse(
      { tool_calls: assistant.tool_calls, content: text },
      { contentIdPrefix: `content-${turn}` },
    );
    let calls: ToolCall[] = [];
    let emitText = text;
    let invalidContentCall: { reason: string; attemptedName?: string; raw: string } | null = null;

    if (normalized.kind === "calls") {
      calls = toToolCalls(normalized);
      if (normalized.calls.some((call) => call.source === "content")) {
        assistant.tool_calls = calls;
        assistant.content = null;
        emitText = "";
      }
    } else if (normalized.kind === "malformed_content") {
      invalidContentCall = normalized;
      emitText = "";
    }

    messages.push(assistant);
    if (emitText.length > 0) {
      yield { kind: "text_delta", text: emitText };
      yield { kind: "text", text: emitText };
    }
    if (invalidContentCall !== null) {
      const toolId = `content-${turn}-invalid-${crypto.randomUUID()}`;
      const name = invalidContentCall.attemptedName ?? "tool_call";
      yield {
        kind: "tool_call",
        toolId,
        name,
        input: {},
        summary: invalidContentCall.reason,
      };
      yield {
        kind: "tool_result",
        toolId,
        ok: false,
        output: `${invalidContentCall.reason}\n\n${invalidContentCall.raw}`,
        ms: 0,
      };
      yield { kind: "done", status: "ok", summary: invalidContentCall.reason };
      return;
    }
    if (calls.length === 0) {
      yield { kind: "done", status: "ok", summary: emitText.slice(0, 160) || "Finished" };
      return;
    }
    for (const call of calls) {
      const isMcp = call.function.name.startsWith("mcp__");
      const gated = isMcp
        ? (() => {
            if (!registeredNames.has(call.function.name)) {
              return { ok: false as const, reason: `Unknown tool "${call.function.name}".` };
            }
            const parsed = parseMcpArguments(call.function.arguments);
            if (!parsed.ok) {
              return parsed;
            }
            return { ok: true as const, name: call.function.name, args: parsed.args };
          })()
        : gateToolCall(call.function.name, call.function.arguments, registeredNames);
      if (!gated.ok) {
        const reason = gateReasonForModel(gated);
        yield {
          kind: "tool_call",
          toolId: call.id,
          name: call.function.name,
          input: {},
          summary: gated.reason,
        };
        yield { kind: "tool_result", toolId: call.id, ok: false, output: reason, ms: 0 };
        messages.push({ role: "tool", tool_call_id: call.id, content: reason });
        continue;
      }
      const summary = toolSummary(gated.name, gated.args);
      if (
        input.permissionMode === "ask" &&
        input.askPermission &&
        gated.name !== "read_file" &&
        gated.name !== "list_dir" &&
        gated.name !== "ripgrep_search" &&
        gated.name !== "web_search" &&
        !isMcp
      ) {
        const requestId = call.id;
        yield { kind: "permission_request", requestId, action: gated.name, detail: gated.args };
        const allow = await input.askPermission({ requestId, action: gated.name, detail: gated.args });
        if (!allow) {
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: "User denied this tool call.",
          });
          continue;
        }
      }
      yield { kind: "tool_call", toolId: call.id, name: call.function.name, input: gated.args, summary };
      const started = Date.now();
      let executed: ToolExecutionResult;
      if (isMcp) {
        executed = {
          ...(await (mcp?.call(call.function.name, gated.args as Record<string, unknown>) ??
            Promise.resolve({ ok: false, output: "MCP is not loaded" }))),
          summary: call.function.name,
        };
      } else {
        executed = await runGatedTool({
          gate: gated as Extract<GateResult, { ok: true }>,
          cwd: input.cwd,
          mutationPolicy: input.permissionMode === "ask" ? "stage-only" : "commit-immediate",
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
      }
      yield {
        kind: "tool_result",
        toolId: call.id,
        ok: executed.ok,
        output: executed.output,
        ms: Date.now() - started,
      };
      if (executed.fileDiff !== undefined) {
        const diff = executed.fileDiff;
        yield {
          kind: "file_diff",
          path: diff.path,
          patch: diff.patch,
          added: diff.added,
          removed: diff.removed,
          ...(diff.staged
            ? { staged: true, newContent: diff.newContent, oldContent: diff.oldContent }
            : {}),
          ...(executed.sizeDeltaWarning ? { sizeDeltaWarning: executed.sizeDeltaWarning } : {}),
        };
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
