export const PROTOCOL_VERSION = 3 as const;

export const KNOWN_PROVIDER_IDS = [
  "echo",
  "claude_code",
  "codex",
  "cursor_agent",
  "gemini_cli",
  "generic_llm",
  "ollama",
  "grok",
  "perplexity",
] as const;

export type KnownProviderId = (typeof KNOWN_PROVIDER_IDS)[number];
