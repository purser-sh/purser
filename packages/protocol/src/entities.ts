import { z } from "zod";
import { AgentEventSchema } from "./agent-event.ts";
import { AuthModeSchema, EventRoleSchema, PermissionModeSchema, RunStatusSchema, SessionStatusSchema, VoiceVerbositySchema } from "./enums.ts";
import { AbsolutePathSchema, IdSchema, IsoDateTimeSchema } from "./primitives.ts";

export const WorkspaceSchema = z
  .object({
    id: IdSchema,
    name: z.string().min(1),
    absPath: AbsolutePathSchema,
    gitRemote: z.string().min(1).nullable(),
    createdAt: IsoDateTimeSchema,
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
