import type { AgentEvent, PermissionMode, ProviderKind } from "@agentdeck/protocol";

export interface RunInput {
  runId: string;
  cwd: string;
  prompt: string;
  modelId?: string;
  providerSessionId?: string;
  permissionMode: PermissionMode;
  signal: AbortSignal;
}

export interface HealthResult {
  ok: boolean;
  detail: string;
}

export interface ModelInfo {
  id: string;
  label: string;
}

export interface AgentAdapter {
  readonly id: string;
  readonly label: string;
  readonly kind: ProviderKind;
  checkHealth(): Promise<HealthResult>;
  listModels(): Promise<ModelInfo[]>;
  run(input: RunInput): AsyncIterable<AgentEvent>;
}
