import type { ToolName } from "./generic-llm/tools.ts";

export type AdapterToolSurface =
  | { kind: "purser_hosted"; tools: ToolName[]; note?: string }
  | { kind: "provider_native"; note: string };

/** Purser-defined OpenAI-style tools sent to generic LLM adapters. */
export function purserHostedTools(
  allowFiles: boolean,
  options: { runBashEnabled?: boolean } = {},
): ToolName[] {
  if (!allowFiles) {
    return ["web_search"];
  }
  const tools: ToolName[] = [
    "read_file",
    "write_file",
    "apply_patch",
    "list_dir",
    "ripgrep_search",
    "web_search",
  ];
  if (options.runBashEnabled === true) {
    tools.splice(5, 0, "run_bash");
  }
  return tools;
}

/** Documented tool surface per adapter id (plus optional MCP tools at runtime). */
export const ADAPTER_TOOL_SURFACES: Record<string, AdapterToolSurface> = {
  echo: {
    kind: "provider_native",
    note: "Scripted demo: fake read_file + file_diff only (no real tool loop).",
  },
  claude_code: {
    kind: "provider_native",
    note: "Claude Code SDK tools (Read, Write, Edit, Bash, Grep, …) — chosen by the CLI.",
  },
  codex: {
    kind: "provider_native",
    note: "OpenAI Codex CLI native tool surface via stream-json.",
  },
  cursor_agent: {
    kind: "provider_native",
    note: "Cursor Agent CLI native tool surface via stream-json.",
  },
  gemini_cli: {
    kind: "provider_native",
    note: "Gemini CLI native tool surface via stream-json.",
  },
  ollama: {
    kind: "purser_hosted",
    tools: purserHostedTools(true),
    note: "All seven Purser tools are sent in /chat/completions. Use a coder-tuned model (e.g. qwen2.5-coder:7b+); generic instruct models often skip write_file/apply_patch.",
  },
  grok: {
    kind: "purser_hosted",
    tools: purserHostedTools(true),
  },
  generic_llm: {
    kind: "purser_hosted",
    tools: purserHostedTools(true),
  },
  perplexity: {
    kind: "purser_hosted",
    tools: purserHostedTools(false),
    note: "Research-only: web_search (+ MCP). No workspace file tools.",
  },
};
