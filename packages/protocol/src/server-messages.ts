import { z } from "zod";
import { IdSchema } from "./primitives.ts";
import {
  AgentEventPayloadSchema,
  ErrorPayloadSchema,
  FileContentPayloadSchema,
  FsListingPayloadSchema,
  ModelsPayloadSchema,
  PermissionRequestPayloadSchema,
  ProviderHealthPayloadSchema,
  RunFinishedPayloadSchema,
  RunStartedPayloadSchema,
  SessionCreatedPayloadSchema,
  StatePayloadSchema,
  TranscriptFinalPayloadSchema,
  TranscriptPartialPayloadSchema,
  TtsAudioChunkPayloadSchema,
  WorkspaceCreatedPayloadSchema,
  RelayStatusPayloadSchema,
  PromptEstimatePayloadSchema,
  SyncEventPayloadSchema,
  SpendUpdatePayloadSchema,
  BudgetRequestPayloadSchema,
  BudgetExceededPayloadSchema,
  DocumentRequestPayloadSchema,
  SpendReportPayloadSchema,
  RunEstimatePayloadSchema,
} from "./server-payloads.ts";

function serverFrame<TType extends string, TPayload extends z.ZodType>(
  type: TType,
  payload: TPayload,
) {
  return z
    .object({
      id: IdSchema,
      type: z.literal(type),
      payload,
    })
    .strict();
}

export const ServerStateMessageSchema = serverFrame("state", StatePayloadSchema);
export const ServerWorkspaceCreatedMessageSchema = serverFrame(
  "workspace_created",
  WorkspaceCreatedPayloadSchema,
);
export const ServerSessionCreatedMessageSchema = serverFrame(
  "session_created",
  SessionCreatedPayloadSchema,
);
export const ServerRunStartedMessageSchema = serverFrame("run_started", RunStartedPayloadSchema);
export const ServerAgentEventMessageSchema = serverFrame("agent_event", AgentEventPayloadSchema);
export const ServerRunFinishedMessageSchema = serverFrame("run_finished", RunFinishedPayloadSchema);
export const ServerPermissionRequestMessageSchema = serverFrame(
  "permission_request",
  PermissionRequestPayloadSchema,
);
export const ServerModelsMessageSchema = serverFrame("models", ModelsPayloadSchema);
export const ServerProviderHealthMessageSchema = serverFrame(
  "provider_health",
  ProviderHealthPayloadSchema,
);
export const ServerFsListingMessageSchema = serverFrame("fs_listing", FsListingPayloadSchema);
export const ServerFileContentMessageSchema = serverFrame("file_content", FileContentPayloadSchema);
export const ServerTranscriptPartialMessageSchema = serverFrame(
  "transcript_partial",
  TranscriptPartialPayloadSchema,
);
export const ServerTranscriptFinalMessageSchema = serverFrame(
  "transcript_final",
  TranscriptFinalPayloadSchema,
);
export const ServerTtsAudioChunkMessageSchema = serverFrame(
  "tts_audio_chunk",
  TtsAudioChunkPayloadSchema,
);
export const ServerErrorMessageSchema = serverFrame("error", ErrorPayloadSchema);
export const ServerRelayStatusMessageSchema = serverFrame("relay_status", RelayStatusPayloadSchema);
export const ServerPromptEstimateMessageSchema = serverFrame("prompt_estimate", PromptEstimatePayloadSchema);
export const ServerSyncEventMessageSchema = serverFrame("sync_event", SyncEventPayloadSchema);
export const ServerSpendUpdateMessageSchema = serverFrame("spend_update", SpendUpdatePayloadSchema);
export const ServerBudgetRequestMessageSchema = serverFrame("budget_request", BudgetRequestPayloadSchema);
export const ServerBudgetExceededMessageSchema = serverFrame("budget_exceeded", BudgetExceededPayloadSchema);
export const ServerDocumentRequestMessageSchema = serverFrame("document_request", DocumentRequestPayloadSchema);
export const ServerSpendReportMessageSchema = serverFrame("spend_report", SpendReportPayloadSchema);
export const ServerRunEstimateMessageSchema = serverFrame("run_estimate", RunEstimatePayloadSchema);

export const ServerMessageSchema = z.discriminatedUnion("type", [
  ServerStateMessageSchema,
  ServerWorkspaceCreatedMessageSchema,
  ServerSessionCreatedMessageSchema,
  ServerRunStartedMessageSchema,
  ServerAgentEventMessageSchema,
  ServerRunFinishedMessageSchema,
  ServerPermissionRequestMessageSchema,
  ServerModelsMessageSchema,
  ServerProviderHealthMessageSchema,
  ServerFsListingMessageSchema,
  ServerFileContentMessageSchema,
  ServerTranscriptPartialMessageSchema,
  ServerTranscriptFinalMessageSchema,
  ServerTtsAudioChunkMessageSchema,
  ServerErrorMessageSchema,
  ServerRelayStatusMessageSchema,
  ServerPromptEstimateMessageSchema,
  ServerSyncEventMessageSchema,
  ServerSpendUpdateMessageSchema,
  ServerBudgetRequestMessageSchema,
  ServerBudgetExceededMessageSchema,
  ServerDocumentRequestMessageSchema,
  ServerSpendReportMessageSchema,
  ServerRunEstimateMessageSchema,
]);

export type ServerMessage = z.infer<typeof ServerMessageSchema>;
export type ServerMessageType = ServerMessage["type"];
