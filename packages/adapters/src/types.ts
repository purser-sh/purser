import type { AgentEvent, PermissionMode, ProviderKind } from "@agentdeck/protocol";

export interface PermissionDecision {
  requestId: string;
  action: string;
  detail: unknown;
}

export interface AdapterConfig {
  baseUrl: string | null;
  apiKey: string | null;
  settings: Record<string, unknown>;
}

export interface RunInput {
  runId: string;
  cwd: string;
  workspaceRoot: string;
  prompt: string;
  modelId?: string;
  providerSessionId?: string;
  permissionMode: PermissionMode;
  signal: AbortSignal;
  extraSystemPrompt?: string;
  config?: AdapterConfig;
  askPermission?: (request: PermissionDecision) => Promise<boolean>;
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
  checkHealth(config?: AdapterConfig): Promise<HealthResult>;
  listModels(config?: AdapterConfig): Promise<ModelInfo[]>;
  run(input: RunInput): AsyncIterable<AgentEvent>;
}
