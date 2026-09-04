import { z } from "zod";
import { AgentEventSchema } from "./agent-event.ts";
import {
  FsEntrySchema,
  ModelInfoSchema,
  ProviderConfigSchema,
  RunSchema,
  SessionSchema,
  SettingSchema,
  StoredEventSchema,
  VoiceProfileSchema,
  WorkspaceSchema,
  FolderWatchSchema,
  BudgetSchema,
  BudgetStatusSchema,
  SpendSummarySchema,
  TokenCountsSchema,
  DocumentSettingsSchema,
  MarkitdownCapabilitySchema,
} from "./entities.ts";
import {
  CostModelSchema,
  FileEncodingSchema,
  RunStatusSchema,
  TokenCountSchema,
} from "./enums.ts";
import { PROTOCOL_VERSION } from "./constants.ts";
import { ReadinessStateSchema, RemedySchema } from "./readiness.ts";
import { AbsolutePathSchema, IdSchema, IsoDateTimeSchema } from "./primitives.ts";

export const StatePayloadSchema = z
  .object({
    workspaces: z.array(WorkspaceSchema),
    sessions: z.array(SessionSchema),
    events: z.array(StoredEventSchema),
    runs: z.array(RunSchema),
    providerConfigs: z.array(ProviderConfigSchema),
    voiceProfiles: z.array(VoiceProfileSchema),
    settings: z.array(SettingSchema),
    folderWatches: z.array(FolderWatchSchema).default([]),
    budgets: z.array(BudgetSchema).default([]),
    spendSummary: SpendSummarySchema,
    documentSettings: DocumentSettingsSchema.default({
      tokenThreshold: 10_000,
      maxFileBytes: 50 * 1024 * 1024,
      convertTimeoutMs: 30_000,
    }),
    documentCacheBytes: z.number().int().nonnegative().default(0),
    markitdown: MarkitdownCapabilitySchema.default({ available: false }),
    protocolVersion: z.literal(PROTOCOL_VERSION),
  })
  .strict();
export type StatePayload = z.infer<typeof StatePayloadSchema>;

export const WorkspaceCreatedPayloadSchema = WorkspaceSchema;
export type WorkspaceCreatedPayload = z.infer<typeof WorkspaceCreatedPayloadSchema>;

export const SessionCreatedPayloadSchema = z
  .object({
    session: SessionSchema,
    notice: z.string().min(1).optional(),
  })
  .strict();
export type SessionCreatedPayload = z.infer<typeof SessionCreatedPayloadSchema>;

export const RunStartedPayloadSchema = z
  .object({
    runId: IdSchema,
    sessionId: IdSchema,
  })
  .strict();
export type RunStartedPayload = z.infer<typeof RunStartedPayloadSchema>;

export const AgentEventPayloadSchema = z
  .object({
    sessionId: IdSchema,
    runId: IdSchema,
    seq: z.number().int().nonnegative(),
    event: AgentEventSchema,
  })
  .strict();
export type AgentEventPayload = z.infer<typeof AgentEventPayloadSchema>;

export const RunFinishedPayloadSchema = z
  .object({
    runId: IdSchema,
    sessionId: IdSchema,
    status: RunStatusSchema,
  })
  .strict();
export type RunFinishedPayload = z.infer<typeof RunFinishedPayloadSchema>;

export const PermissionRequestPayloadSchema = z
  .object({
    requestId: IdSchema,
    sessionId: IdSchema,
    runId: IdSchema,
    action: z.string().min(1),
    detail: z.unknown(),
  })
  .strict();
export type PermissionRequestPayload = z.infer<typeof PermissionRequestPayloadSchema>;

export const ModelsPayloadSchema = z
  .object({
    providerId: z.string().min(1),
    costModel: CostModelSchema,
    models: z.array(ModelInfoSchema),
  })
  .strict();
export type ModelsPayload = z.infer<typeof ModelsPayloadSchema>;

export const ProviderHealthPayloadSchema = z
  .object({
    providerId: z.string().min(1),
    ok: z.boolean(),
    detail: z.string(),
    state: ReadinessStateSchema,
    remedy: RemedySchema.nullable(),
  })
  .strict();
export type ProviderHealthPayload = z.infer<typeof ProviderHealthPayloadSchema>;

export const FsListingPayloadSchema = z
  .object({
    path: AbsolutePathSchema,
    entries: z.array(FsEntrySchema),
  })
  .strict();
export type FsListingPayload = z.infer<typeof FsListingPayloadSchema>;

/** Response to `read_file`. Not in the original type list; see protocol notes. */
export const FileContentPayloadSchema = z
  .object({
    workspaceId: IdSchema,
    path: z.string().min(1),
    content: z.string(),
    encoding: FileEncodingSchema,
    truncated: z.boolean(),
  })
  .strict();
export type FileContentPayload = z.infer<typeof FileContentPayloadSchema>;

export const TranscriptPartialPayloadSchema = z
  .object({
    text: z.string(),
  })
  .strict();
export type TranscriptPartialPayload = z.infer<typeof TranscriptPartialPayloadSchema>;

export const TranscriptFinalPayloadSchema = z
  .object({
    text: z.string(),
  })
  .strict();
export type TranscriptFinalPayload = z.infer<typeof TranscriptFinalPayloadSchema>;

export const TtsAudioChunkPayloadSchema = z
  .object({
    pcm16Base64: z.string().min(1),
    sampleRate: z.literal(16000),
  })
  .strict();
export type TtsAudioChunkPayload = z.infer<typeof TtsAudioChunkPayloadSchema>;

export const ErrorPayloadSchema = z
  .object({
    message: z.string().min(1),
    code: z.string().min(1).optional(),
    fatal: z.boolean().optional(),
    remedy: RemedySchema.nullable().optional(),
  })
  .strict();
export type ErrorPayload = z.infer<typeof ErrorPayloadSchema>;

export const RelayStatusPayloadSchema = z
  .object({
    connected: z.boolean(),
    relayUrl: z.string().nullable(),
    code: z.string().nullable(),
  })
  .strict();
export type RelayStatusPayload = z.infer<typeof RelayStatusPayloadSchema>;

export const PromptEstimatePayloadSchema = z
  .object({
    tokens: TokenCountSchema,
    compactText: z.string(),
    compactTokens: TokenCountSchema,
    savedTokens: z.number().int(),
    notes: z.array(z.string()),
  })
  .strict();
export type PromptEstimatePayload = z.infer<typeof PromptEstimatePayloadSchema>;

export const SyncEventPayloadSchema = z
  .object({
    workspaceId: IdSchema,
    sourcePath: AbsolutePathSchema,
    destPath: z.string().min(1),
    action: z.enum(["added", "updated", "removed", "error"]),
    detail: z.string().optional(),
  })
  .strict();
export type SyncEventPayload = z.infer<typeof SyncEventPayloadSchema>;

export const SpendUpdatePayloadSchema = z
  .object({
    runId: IdSchema,
    sessionId: IdSchema,
    workspaceId: IdSchema,
    tokens: TokenCountsSchema,
    costUsdMicros: z.number().int().nullable(),
    costModel: CostModelSchema,
    source: z.enum(["provider_usage", "estimated"]),
    level: z.enum(["info", "warning"]),
    budgets: z.array(BudgetStatusSchema),
  })
  .strict();
export type SpendUpdatePayload = z.infer<typeof SpendUpdatePayloadSchema>;

export const BudgetRequestPayloadSchema = z
  .object({
    requestId: IdSchema,
    runId: IdSchema.nullable(),
    sessionId: IdSchema,
    budget: BudgetStatusSchema,
  })
  .strict();
export type BudgetRequestPayload = z.infer<typeof BudgetRequestPayloadSchema>;

export const DocumentRequestPayloadSchema = z
  .object({
    requestId: IdSchema,
    runId: IdSchema,
    sessionId: IdSchema,
    path: z.string().min(1),
    format: z.string().min(1),
    tokenCount: z.number().int().nonnegative(),
    tokenSource: z.enum(["exact", "approximate"]),
    threshold: z.number().int().positive(),
    costLabel: z.string().nullable(),
  })
  .strict();
export type DocumentRequestPayload = z.infer<typeof DocumentRequestPayloadSchema>;

export const BudgetExceededPayloadSchema = z
  .object({
    runId: IdSchema.nullable(),
    sessionId: IdSchema,
    budget: BudgetStatusSchema,
    outcome: z.enum(["warned", "stopped", "overridden"]),
  })
  .strict();
export type BudgetExceededPayload = z.infer<typeof BudgetExceededPayloadSchema>;

export const SpendReportRowSchema = z
  .object({
    groupKey: z.string().min(1),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    cacheReadTokens: z.number().int().nonnegative(),
    cacheWriteTokens: z.number().int().nonnegative(),
    costUsdMicros: z.number().int().nullable(),
  })
  .strict();
export type SpendReportRow = z.infer<typeof SpendReportRowSchema>;

export const SpendReportPayloadSchema = z
  .object({
    rows: z.array(SpendReportRowSchema),
    totals: SpendReportRowSchema.omit({ groupKey: true }).extend({ groupKey: z.literal("totals") }),
    generatedAt: IsoDateTimeSchema,
    unpricedModels: z.array(z.string()),
  })
  .strict();
export type SpendReportPayload = z.infer<typeof SpendReportPayloadSchema>;

export const RunEstimatePayloadSchema = z
  .object({
    sessionId: IdSchema,
    tokens: TokenCountSchema,
    compactText: z.string(),
    compactTokens: TokenCountSchema,
    savedTokens: z.number().int(),
    notes: z.array(z.string()),
    costUsdMicros: z.number().int().nullable(),
    costModel: CostModelSchema,
    unpriced: z.boolean(),
    budgets: z.array(BudgetStatusSchema),
  })
  .strict();
export type RunEstimatePayload = z.infer<typeof RunEstimatePayloadSchema>;
