import {
  claudeCodeAdapter,
  codexAdapter,
  cursorAgentAdapter,
  echoAdapter,
  geminiCliAdapter,
  genericLlmAdapter,
  grokAdapter,
  ollamaAdapter,
  perplexityAdapter,
  type AgentAdapter,
} from "@agentdeck/adapters";

const adapters = new Map<string, AgentAdapter>(
  [
    echoAdapter,
    claudeCodeAdapter,
    codexAdapter,
    cursorAgentAdapter,
    geminiCliAdapter,
    genericLlmAdapter,
    ollamaAdapter,
    grokAdapter,
    perplexityAdapter,
  ].map((adapter) => [adapter.id, adapter]),
);

export function getAdapter(providerId: string): AgentAdapter | undefined {
  return adapters.get(providerId);
}

export function listAdapters(): AgentAdapter[] {
  return [...adapters.values()];
}
