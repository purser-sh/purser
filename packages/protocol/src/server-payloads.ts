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
} from "./entities.ts";
import { FileEncodingSchema, RunStatusSchema } from "./enums.ts";
import { AbsolutePathSchema, IdSchema } from "./primitives.ts";

export const StatePayloadSchema = z
  .object({
    workspaces: z.array(WorkspaceSchema),
    sessions: z.array(SessionSchema),
    events: z.array(StoredEventSchema),
    runs: z.array(RunSchema),
    providerConfigs: z.array(ProviderConfigSchema),
    voiceProfiles: z.array(VoiceProfileSchema),
    settings: z.array(SettingSchema),
  })
  .strict();
export type StatePayload = z.infer<typeof StatePayloadSchema>;

export const WorkspaceCreatedPayloadSchema = WorkspaceSchema;
export type WorkspaceCreatedPayload = z.infer<typeof WorkspaceCreatedPayloadSchema>;

export const SessionCreatedPayloadSchema = SessionSchema;
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
    models: z.array(ModelInfoSchema),
  })
  .strict();
export type ModelsPayload = z.infer<typeof ModelsPayloadSchema>;

export const ProviderHealthPayloadSchema = z
  .object({
    providerId: z.string().min(1),
    ok: z.boolean(),
    detail: z.string(),
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
