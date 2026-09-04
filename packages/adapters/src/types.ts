import type { AgentEvent, CostModel, PermissionMode, ProviderKind, ReadinessState, Remedy } from "@purser-sh/protocol";
import type { LlmHistoryMessage } from "./conversation-history.ts";
import type { DocumentDecision as ProtocolDocumentDecision } from "@purser-sh/protocol";
import type { DocumentSettings } from "./documents/settings.ts";

export type DocumentDecision = ProtocolDocumentDecision;

export interface DocumentApprovalRequest {
  requestId: string;
  path: string;
  format: string;
  tokenCount: number;
  tokenSource: "exact" | "approximate";
  threshold: number;
  costLabel: string | null;
}

export interface PermissionDecision {
  requestId: string;
  action: string;
  detail: unknown;
}

export interface ShellRunOptions {
  enabled: boolean;
  allowDestructive: boolean;
  prepareMutating?: (input: { command: string; restorePointId: string }) => Promise<{
    undoAvailable: boolean;
    undoNote: string;
  }>;
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
  askDocument?: (request: DocumentApprovalRequest) => Promise<DocumentDecision>;
  documentSettings?: DocumentSettings;
  purserHome?: string;
  /** Return a refusal message when adding this many tokens would exceed budget, or null if ok. */
  checkDocumentBudget?: (tokens: number) => string | null;
  estimateDocumentCost?: (tokens: number) => string | null;
  shell?: ShellRunOptions;
  /** Prior turns for generic LLM adapters (OpenAI chat shape). */
  history?: LlmHistoryMessage[];
}

export interface HealthResult {
  ok: boolean;
  /** One sentence, already phrased for the UI. Equals `${remedy.title} ${remedy.fix}` when blocked. */
  detail: string;
  state: ReadinessState;
  remedy: Remedy | null;
}

export interface ModelInfo {
  id: string;
  label: string;
}

export interface AgentAdapter {
  readonly id: string;
  readonly label: string;
  readonly kind: ProviderKind;
  readonly costModel: CostModel;
  checkHealth(config?: AdapterConfig): Promise<HealthResult>;
  listModels(config?: AdapterConfig): Promise<ModelInfo[]>;
  run(input: RunInput): AsyncIterable<AgentEvent>;
}
