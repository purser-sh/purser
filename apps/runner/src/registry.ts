import { echoAdapter, type AgentAdapter } from "@agentdeck/adapters";

const adapters = new Map<string, AgentAdapter>([[echoAdapter.id, echoAdapter]]);

export function getAdapter(providerId: string): AgentAdapter | undefined {
  return adapters.get(providerId);
}

export function listAdapters(): AgentAdapter[] {
  return [...adapters.values()];
}
