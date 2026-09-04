import type { AgentEvent, PermissionMode } from "@purser-sh/protocol";
import type { RunInput } from "../types.ts";
import { loadMcpTools } from "../mcp.ts";
import { gateToolCall, gateReasonForModel, type GateResult, type RunBashArgs, type ToolName } from "../tool-gate.ts";
import { normalizeProviderResponse } from "../tool-call-normalize.ts";
import { purserHostedTools } from "../tool-catalog.ts";
import { classifyShellCommand } from "../shell-classify.ts";
import { ApprovedShellCommand } from "../shell-execute.ts";
import { shellPermissionDetail, type ApprovableShellClassification } from "../shell-permission.ts";
import { buildWorkspaceContext } from "../workspace-context.ts";
import { runReadDocumentFlow } from "../documents/read-document-flow.ts";
import type { ReadDocumentArgs } from "../tool-gate.ts";
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

function permissionModeBlock(mode: PermissionMode): string {
  switch (mode) {
    case "ask":
      return "Permission mode: ask. Read-only tools run immediately. write_file, apply_patch, and run_bash need user approval before they touch disk.";
    case "auto_edit":
      return "Permission mode: auto_edit. File edits apply immediately after gating.";
    case "bypass":
      return "Permission mode: bypass. All tools run immediately and are audit-logged.";
  }
}

function buildSystemPrompt(input: {
  workspaceRoot: string;
  permissionMode: PermissionMode;
  extraSystemPrompt?: string;
}): string {
  return [
    "You are a coding agent. Tools are attached to this request in the native tools field — use them.",
    "",
    "You have tools. Use them. Never ask the user to paste file contents you can read yourself.",
    "Before answering a question about the codebase, inspect it with list_dir and ripgrep_search.",
    "Never describe a tool. Call it.",
    "",
    permissionModeBlock(input.permissionMode),
    "",
    buildWorkspaceContext(input.workspaceRoot),
    input.extraSystemPrompt ?? "",
  ]
    .filter((part) => part.length > 0)
    .join("\n\n");
}

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

function callFingerprint(call: ToolCall): string {
  return `${call.function.name}:${call.function.arguments}`;
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
  const body: Record<string, unknown> = {
    model: input.model,
    messages: input.messages,
    stream: false,
  };
  if (input.tools !== undefined && input.tools.length > 0) {
    body.tools = input.tools;
    body.tool_choice = "auto";
  }
  const response = await fetch(url, {
    method: "POST",
    headers,
    signal: input.signal,
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`LLM ${response.status}: ${await response.text()}`);
  }
  const payload: unknown = await response.json();
  if (!isLoopRecord(payload) || !Array.isArray(payload.choices)) {
    throw new Error("LLM returned no message");
  }
  const first = payload.choices[0];
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
    usage: isLoopRecord(payload.usage) ? payload.usage : undefined,
  };
}

export async function* runToolLoop(input: RunInput & { allowFiles: boolean }): AsyncIterable<AgentEvent> {
  const baseUrl = input.config?.baseUrl ?? "http://127.0.0.1:11434/v1";
  const model = input.modelId ?? "llama3.2";
  const mcp = await loadMcpTools(input.workspaceRoot);
  const hostedToolNames = new Set(
    purserHostedTools(input.allowFiles, { runBashEnabled: input.shell?.enabled === true }),
  );
  const tools = [
    ...TOOL_DEFINITIONS.filter((tool) => hostedToolNames.has(tool.function.name as never)),
    ...(mcp?.definitions ?? []),
  ];
  const registeredNames = new Set(tools.map((tool) => tool.function.name));
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: buildSystemPrompt({
        workspaceRoot: input.workspaceRoot,
        permissionMode: input.permissionMode,
        extraSystemPrompt: input.extraSystemPrompt,
      }),
    },
    ...(input.history ?? []),
    { role: "user", content: input.prompt },
  ];

  yield { kind: "session_started", providerSessionId: input.providerSessionId ?? `llm-${input.runId}` };

  let lastFingerprint: string | null = null;
  let repeatCount = 0;

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
      yield { kind: "done", status: "ok", summary: "" };
      return;
    }
    if (calls.length === 0) {
      yield { kind: "done", status: "ok", summary: "" };
      return;
    }

    for (const call of calls) {
      const fingerprint = callFingerprint(call);
      if (fingerprint === lastFingerprint) {
        repeatCount += 1;
      } else {
        lastFingerprint = fingerprint;
        repeatCount = 1;
      }
      if (repeatCount >= 3) {
        const message = `Stopped: the model repeated the same tool call three times (${call.function.name}).`;
        yield { kind: "error", message, fatal: true, remedy: null };
        yield { kind: "done", status: "error", summary: message };
        return;
      }
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
      let approvedShell: ApprovedShellCommand | undefined;
      if (gated.name === "run_bash") {
        const command = (gated.args as RunBashArgs).command;
        const classification = classifyShellCommand(command, {
          allowDestructiveShell: input.shell?.allowDestructive === true,
        });
        if (classification.kind === "refused") {
          yield { kind: "tool_call", toolId: call.id, name: call.function.name, input: gated.args, summary };
          const output = `${classification.reason}\n\n${classification.enableHint}`;
          yield { kind: "tool_result", toolId: call.id, ok: false, output, ms: 0 };
          messages.push({ role: "tool", tool_call_id: call.id, content: output });
          continue;
        }
        const approvable = classification as ApprovableShellClassification;
        let restorePointId: string | undefined;
        let undoNote: string | undefined;
        let undoAvailable: boolean | undefined;
        if (approvable.kind === "mutating" && input.shell?.prepareMutating !== undefined) {
          restorePointId = `shell_${crypto.randomUUID()}`;
          const prepared = await input.shell.prepareMutating({ command, restorePointId });
          undoNote = prepared.undoNote;
          undoAvailable = prepared.undoAvailable;
        }
        const detail = shellPermissionDetail({
          command,
          classification: approvable,
          undoAvailable,
          undoNote,
          restorePointId,
        });
        const needsAsk =
          input.permissionMode === "ask" &&
          input.askPermission !== undefined &&
          !isMcp;
        if (needsAsk) {
          const requestId = call.id;
          yield { kind: "permission_request", requestId, action: gated.name, detail };
          const allow = await input.askPermission!({ requestId, action: gated.name, detail });
          if (!allow) {
            messages.push({
              role: "tool",
              tool_call_id: call.id,
              content: "User denied this tool call.",
            });
            continue;
          }
          approvedShell = ApprovedShellCommand.fromApproval(command, approvable);
        } else {
          approvedShell = ApprovedShellCommand.fromImmediate(command, approvable);
        }
      } else if (
        input.permissionMode === "ask" &&
        input.askPermission &&
        gated.name !== "read_file" &&
        gated.name !== "read_document" &&
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
      if (gated.name === "read_document") {
        const started = Date.now();
        const args = gated.args as ReadDocumentArgs;
        const docResult = await runReadDocumentFlow({
          cwd: input.cwd,
          args,
          modelId: input.modelId,
          settings: input.documentSettings,
          home: input.purserHome,
          requestId: call.id,
          askDocument: input.askDocument,
          checkDocumentBudget: input.checkDocumentBudget,
          estimateDocumentCost: input.estimateDocumentCost,
        });
        yield { kind: "tool_call", toolId: call.id, name: gated.name, input: gated.args, summary: docResult.summary };
        yield {
          kind: "tool_result",
          toolId: call.id,
          ok: docResult.ok,
          output: docResult.output,
          ms: Date.now() - started,
        };
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: typeof docResult.output === "string" ? docResult.output : JSON.stringify(docResult.output),
        });
        continue;
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
      } else if (gated.name === "run_bash") {
        executed = await runGatedTool({
          gate: gated as Extract<GateResult, { ok: true; name: "run_bash" }>,
          cwd: input.cwd,
          mutationPolicy: input.permissionMode === "ask" ? "stage-only" : "commit-immediate",
          approvedShell: approvedShell!,
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
      } else {
        executed = await runGatedTool({
          gate: gated as Extract<GateResult, { ok: true; name: Exclude<ToolName, "run_bash"> }>,
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

/** @internal Exported for tests that assert the outbound request shape. */
export function buildLoopRequestBody(input: {
  model: string;
  messages: ChatMessage[];
  tools: Array<{ type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } }>;
}): Record<string, unknown> {
  return {
    model: input.model,
    messages: input.messages,
    tools: input.tools,
    tool_choice: "auto",
    stream: false,
  };
}

/** @internal Exported for tests that assert the system prompt. */
export { buildSystemPrompt };
