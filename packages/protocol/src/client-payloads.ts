import { z } from "zod";
import { PROTOCOL_VERSION } from "./constants.ts";
import { PermissionModeSchema, VoiceInputModeSchema } from "./enums.ts";
import { AbsolutePathSchema, IdSchema, UserFsPathSchema, WorkspaceRelativePathSchema } from "./primitives.ts";

export const HelloPayloadSchema = z
  .object({
    token: z.string().min(1),
    clientVersion: z.string().min(1),
    protocolVersion: z.literal(PROTOCOL_VERSION),
  })
  .strict();
export type HelloPayload = z.infer<typeof HelloPayloadSchema>;

export const GetStatePayloadSchema = z.object({}).strict();
export type GetStatePayload = z.infer<typeof GetStatePayloadSchema>;

export const CreateWorkspacePayloadSchema = z
  .object({
    name: z.string().min(1),
    absPath: AbsolutePathSchema,
  })
  .strict();
export type CreateWorkspacePayload = z.infer<typeof CreateWorkspacePayloadSchema>;

export const DeleteWorkspacePayloadSchema = z
  .object({
    workspaceId: IdSchema,
  })
  .strict();
export type DeleteWorkspacePayload = z.infer<typeof DeleteWorkspacePayloadSchema>;

export const BrowseFsPayloadSchema = z
  .object({
    path: AbsolutePathSchema,
  })
  .strict();
export type BrowseFsPayload = z.infer<typeof BrowseFsPayloadSchema>;

export const ReadFilePayloadSchema = z
  .object({
    workspaceId: IdSchema,
    path: WorkspaceRelativePathSchema,
  })
  .strict();
export type ReadFilePayload = z.infer<typeof ReadFilePayloadSchema>;

export const CreateSessionPayloadSchema = z
  .object({
    workspaceId: IdSchema,
    title: z.string().min(1).optional(),
    providerId: z.string().min(1),
    modelId: z.string().min(1).optional(),
    permissionMode: PermissionModeSchema,
  })
  .strict();
export type CreateSessionPayload = z.infer<typeof CreateSessionPayloadSchema>;

export const RenameSessionPayloadSchema = z
  .object({
    sessionId: IdSchema,
    title: z.string().min(1),
  })
  .strict();
export type RenameSessionPayload = z.infer<typeof RenameSessionPayloadSchema>;

export const DeleteSessionPayloadSchema = z
  .object({
    sessionId: IdSchema,
  })
  .strict();
export type DeleteSessionPayload = z.infer<typeof DeleteSessionPayloadSchema>;

export const SetSessionProviderPayloadSchema = z
  .object({
    sessionId: IdSchema,
    providerId: z.string().min(1),
    modelId: z.string().min(1).optional(),
    permissionMode: PermissionModeSchema.optional(),
  })
  .strict();
export type SetSessionProviderPayload = z.infer<typeof SetSessionProviderPayloadSchema>;

export const SendMessagePayloadSchema = z
  .object({
    sessionId: IdSchema,
    text: z.string().min(1),
  })
  .strict();
export type SendMessagePayload = z.infer<typeof SendMessagePayloadSchema>;

export const CancelRunPayloadSchema = z
  .object({
    runId: IdSchema,
  })
  .strict();
export type CancelRunPayload = z.infer<typeof CancelRunPayloadSchema>;

export const PermissionResponsePayloadSchema = z
  .object({
    requestId: IdSchema,
    allow: z.boolean(),
  })
  .strict();
export type PermissionResponsePayload = z.infer<typeof PermissionResponsePayloadSchema>;

export const ListModelsPayloadSchema = z
  .object({
    providerId: z.string().min(1),
  })
  .strict();
export type ListModelsPayload = z.infer<typeof ListModelsPayloadSchema>;

export const CheckProviderHealthPayloadSchema = z
  .object({
    providerId: z.string().min(1),
  })
  .strict();
export type CheckProviderHealthPayload = z.infer<typeof CheckProviderHealthPayloadSchema>;

export const VoiceStartPayloadSchema = z
  .object({
    profileId: IdSchema.optional(),
    mode: VoiceInputModeSchema,
  })
  .strict();
export type VoiceStartPayload = z.infer<typeof VoiceStartPayloadSchema>;

export const VoiceAudioChunkPayloadSchema = z
  .object({
    pcm16Base64: z.string().min(1),
    sampleRate: z.literal(16000),
  })
  .strict();
export type VoiceAudioChunkPayload = z.infer<typeof VoiceAudioChunkPayloadSchema>;

export const VoiceStopPayloadSchema = z.object({}).strict();
export type VoiceStopPayload = z.infer<typeof VoiceStopPayloadSchema>;

export const TtsSpeakPayloadSchema = z
  .object({
    text: z.string().min(1),
    voiceId: z.string().min(1).optional(),
    speed: z.number().positive().optional(),
  })
  .strict();
export type TtsSpeakPayload = z.infer<typeof TtsSpeakPayloadSchema>;

export const TtsStopPayloadSchema = z.object({}).strict();
export type TtsStopPayload = z.infer<typeof TtsStopPayloadSchema>;

export const DiffResponsePayloadSchema = z
  .object({
    sessionId: IdSchema,
    path: z.string().min(1),
    approve: z.boolean(),
  })
  .strict();
export type DiffResponsePayload = z.infer<typeof DiffResponsePayloadSchema>;

export const UpsertProviderConfigPayloadSchema = z
  .object({
    id: IdSchema.optional(),
    providerId: z.string().min(1),
    label: z.string().min(1),
    baseUrl: z.string().min(1).nullable(),
    authMode: z.enum(["cli_login", "keychain", "none"]),
    settings: z.record(z.string(), z.unknown()),
  })
  .strict();
export type UpsertProviderConfigPayload = z.infer<typeof UpsertProviderConfigPayloadSchema>;

export const UpsertVoiceProfilePayloadSchema = z
  .object({
    id: IdSchema.optional(),
    name: z.string().min(1),
    wakeWord: z.string().min(1).nullable(),
    sttProvider: z.string().min(1),
    ttsProvider: z.string().min(1),
    voiceId: z.string().min(1).nullable(),
    speed: z.number().positive(),
    language: z.string().min(1),
    personaPrompt: z.string(),
    verbosity: z.enum(["full", "summary", "ack_only"]),
    interruptOnSpeech: z.boolean(),
    isDefault: z.boolean(),
  })
  .strict();
export type UpsertVoiceProfilePayload = z.infer<typeof UpsertVoiceProfilePayloadSchema>;

export const PairRelayPayloadSchema = z
  .object({
    relayUrl: z.string().min(1),
    code: z.string().min(8),
  })
  .strict();
export type PairRelayPayload = z.infer<typeof PairRelayPayloadSchema>;

export const EstimatePromptPayloadSchema = z
  .object({
    text: z.string().min(1),
    sessionId: IdSchema.optional(),
  })
  .strict();
export type EstimatePromptPayload = z.infer<typeof EstimatePromptPayloadSchema>;

export const WatchFolderPayloadSchema = z
  .object({
    workspaceId: IdSchema,
    absPath: UserFsPathSchema,
  })
  .strict();
export type WatchFolderPayload = z.infer<typeof WatchFolderPayloadSchema>;

export const UnwatchFolderPayloadSchema = z
  .object({
    workspaceId: IdSchema,
    absPath: UserFsPathSchema,
  })
  .strict();
export type UnwatchFolderPayload = z.infer<typeof UnwatchFolderPayloadSchema>;

export const LinkRepositoryPayloadSchema = z
  .object({
    workspaceId: IdSchema,
    remoteUrl: z.string().min(1),
    forge: z.enum(["github", "gitlab", "other"]).optional(),
  })
  .strict();
export type LinkRepositoryPayload = z.infer<typeof LinkRepositoryPayloadSchema>;
