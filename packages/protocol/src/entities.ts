import { z } from "zod";
import { AgentEventSchema } from "./agent-event.ts";
import { AuthModeSchema, BudgetActionSchema, BudgetScopeSchema, BudgetWindowSchema, EventRoleSchema, PermissionModeSchema, RunStatusSchema, SessionStatusSchema, VoiceVerbositySchema } from "./enums.ts";
import { AbsolutePathSchema, IdSchema, IsoDateTimeSchema } from "./primitives.ts";

export const WorkspaceSchema = z
  .object({
    id: IdSchema,
    name: z.string().min(1),
    absPath: AbsolutePathSchema,
    gitRemote: z.string().min(1).nullable(),
    createdAt: IsoDateTimeSchema,
    /** Opt-in per workspace in Setup. Default off. */
    runBashEnabled: z.boolean().default(false),
    allowDestructiveShell: z.boolean().default(false),
  })
  .strict();
export type Workspace = z.infer<typeof WorkspaceSchema>;

export const SessionSchema = z
  .object({
    id: IdSchema,
    workspaceId: IdSchema,
    title: z.string().min(1),
    providerId: z.string().min(1),
    modelId: z.string().min(1).nullable(),
    providerSessionId: z.string().min(1).nullable(),
    permissionMode: PermissionModeSchema,
    worktreePath: AbsolutePathSchema.nullable(),
    status: SessionStatusSchema,
    tokensIn: z.number().nonnegative(),
    tokensOut: z.number().nonnegative(),
    costUsd: z.number().nonnegative(),
    bypassExpiresAt: IsoDateTimeSchema.nullable(),
    bypassRunsRemaining: z.number().int().nonnegative().nullable(),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .strict();
export type Session = z.infer<typeof SessionSchema>;

export const UserMessagePayloadSchema = z
  .object({
    kind: z.literal("user_message"),
    text: z.string(),
  })
  .strict();
export type UserMessagePayload = z.infer<typeof UserMessagePayloadSchema>;

export const StoredEventPayloadSchema = z.union([
  UserMessagePayloadSchema,
  AgentEventSchema,
]);
export type StoredEventPayload = z.infer<typeof StoredEventPayloadSchema>;

export const StoredEventSchema = z
  .object({
    id: IdSchema,
    sessionId: IdSchema,
    seq: z.number().int().nonnegative(),
    kind: z.string().min(1),
    role: EventRoleSchema,
    payload: StoredEventPayloadSchema,
    createdAt: IsoDateTimeSchema,
  })
  .strict();
export type StoredEvent = z.infer<typeof StoredEventSchema>;

export const RunSchema = z
  .object({
    id: IdSchema,
    sessionId: IdSchema,
    status: RunStatusSchema,
    startedAt: IsoDateTimeSchema,
    endedAt: IsoDateTimeSchema.nullable(),
    error: z.string().min(1).nullable(),
  })
  .strict();
export type Run = z.infer<typeof RunSchema>;

export const ProviderConfigSchema = z
  .object({
    id: IdSchema,
    providerId: z.string().min(1),
    label: z.string().min(1),
    baseUrl: z.string().min(1).nullable(),
    authMode: AuthModeSchema,
    settings: z.record(z.string(), z.unknown()),
  })
  .strict();
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

export const VoiceProfileSchema = z
  .object({
    id: IdSchema,
    name: z.string().min(1),
    wakeWord: z.string().min(1).nullable(),
    sttProvider: z.string().min(1),
    ttsProvider: z.string().min(1),
    voiceId: z.string().min(1).nullable(),
    speed: z.number().positive(),
    language: z.string().min(1),
    personaPrompt: z.string(),
    verbosity: VoiceVerbositySchema,
    interruptOnSpeech: z.boolean(),
    isDefault: z.boolean(),
  })
  .strict();
export type VoiceProfile = z.infer<typeof VoiceProfileSchema>;

export const SettingSchema = z
  .object({
    key: z.string().min(1),
    value: z.unknown(),
  })
  .strict();
export type Setting = z.infer<typeof SettingSchema>;

export const ModelInfoSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
  })
  .strict();
export type ModelInfo = z.infer<typeof ModelInfoSchema>;

export const FsEntrySchema = z
  .object({
    name: z.string().min(1),
    path: z.string().min(1),
    kind: z.enum(["file", "dir"]),
    size: z.number().int().nonnegative().optional(),
  })
  .strict();
export type FsEntry = z.infer<typeof FsEntrySchema>;

export const FolderWatchSchema = z
  .object({
    workspaceId: IdSchema,
    absPath: AbsolutePathSchema,
    enabled: z.boolean(),
  })
  .strict();
export type FolderWatch = z.infer<typeof FolderWatchSchema>;

export const DocumentSettingsSchema = z
  .object({
    tokenThreshold: z.number().int().positive(),
    maxFileBytes: z.number().int().positive(),
    convertTimeoutMs: z.number().int().positive(),
  })
  .strict();
export type DocumentSettings = z.infer<typeof DocumentSettingsSchema>;

export const MarkitdownCapabilitySchema = z
  .object({
    available: z.boolean(),
    installCommand: z.string().min(1).nullable().optional(),
    detail: z.string().min(1).nullable().optional(),
  })
  .strict();
export type MarkitdownCapability = z.infer<typeof MarkitdownCapabilitySchema>;

export const BudgetSchema = z
  .object({
    id: IdSchema,
    scope: BudgetScopeSchema,
    scopeId: IdSchema.nullable(),
    window: BudgetWindowSchema,
    limitUsdMicros: z.number().int().nonnegative().nullable(),
    limitTokens: z.number().int().nonnegative().nullable(),
    action: BudgetActionSchema,
    enabled: z.boolean(),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .strict()
  .refine((value) => value.limitUsdMicros !== null || value.limitTokens !== null, {
    message: "budget needs a USD or token limit",
  });
export type Budget = z.infer<typeof BudgetSchema>;

export const SpendBucketSchema = z
  .object({
    tokens: z.number().int().nonnegative(),
    costUsdMicros: z.number().int().nullable(),
  })
  .strict();
export type SpendBucket = z.infer<typeof SpendBucketSchema>;

export const SpendSummarySchema = z
  .object({
    generatedAt: IsoDateTimeSchema,
    today: SpendBucketSchema,
    month: SpendBucketSchema,
    unpricedModels: z.array(z.string()),
    catalogStale: z.boolean(),
    byWorkspace: z.array(
      z
        .object({
          workspaceId: IdSchema,
          today: SpendBucketSchema,
          month: SpendBucketSchema,
        })
        .strict(),
    ),
  })
  .strict();
export type SpendSummary = z.infer<typeof SpendSummarySchema>;

export const BudgetStatusSchema = z
  .object({
    budgetId: IdSchema,
    scope: BudgetScopeSchema,
    window: BudgetWindowSchema,
    spent: z.number().nonnegative(),
    limit: z.number().positive(),
    pct: z.number().nonnegative(),
    action: BudgetActionSchema,
    unit: z.enum(["usd_micros", "tokens"]),
  })
  .strict();
export type BudgetStatus = z.infer<typeof BudgetStatusSchema>;

export const TokenCountsSchema = z
  .object({
    input: z.number().int().nonnegative(),
    output: z.number().int().nonnegative(),
    cacheRead: z.number().int().nonnegative(),
    cacheWrite: z.number().int().nonnegative(),
  })
  .strict();
export type TokenCounts = z.infer<typeof TokenCountsSchema>;
