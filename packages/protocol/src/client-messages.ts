import { z } from "zod";
import {
  BrowseFsPayloadSchema,
  CancelRunPayloadSchema,
  CheckProviderHealthPayloadSchema,
  CreateSessionPayloadSchema,
  CreateWorkspacePayloadSchema,
  DeleteSessionPayloadSchema,
  DeleteWorkspacePayloadSchema,
  GetStatePayloadSchema,
  HelloPayloadSchema,
  ListModelsPayloadSchema,
  PermissionResponsePayloadSchema,
  ReadFilePayloadSchema,
  RenameSessionPayloadSchema,
  SendMessagePayloadSchema,
  SetSessionProviderPayloadSchema,
  TtsSpeakPayloadSchema,
  TtsStopPayloadSchema,
  VoiceAudioChunkPayloadSchema,
  VoiceStartPayloadSchema,
  VoiceStopPayloadSchema,
  DiffResponsePayloadSchema,
  UpsertProviderConfigPayloadSchema,
  UpsertVoiceProfilePayloadSchema,
  PairRelayPayloadSchema,
  EstimatePromptPayloadSchema,
  EstimateRunPayloadSchema,
  GetSpendPayloadSchema,
  SetBudgetPayloadSchema,
  DeleteBudgetPayloadSchema,
  BudgetResponsePayloadSchema,
  WatchFolderPayloadSchema,
  UnwatchFolderPayloadSchema,
  LinkRepositoryPayloadSchema,
} from "./client-payloads.ts";
import { IdSchema } from "./primitives.ts";

function clientFrame<TType extends string, TPayload extends z.ZodType>(
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

export const ClientHelloMessageSchema = clientFrame("hello", HelloPayloadSchema);
export const ClientGetStateMessageSchema = clientFrame("get_state", GetStatePayloadSchema);
export const ClientCreateWorkspaceMessageSchema = clientFrame(
  "create_workspace",
  CreateWorkspacePayloadSchema,
);
export const ClientDeleteWorkspaceMessageSchema = clientFrame(
  "delete_workspace",
  DeleteWorkspacePayloadSchema,
);
export const ClientBrowseFsMessageSchema = clientFrame("browse_fs", BrowseFsPayloadSchema);
export const ClientReadFileMessageSchema = clientFrame("read_file", ReadFilePayloadSchema);
export const ClientCreateSessionMessageSchema = clientFrame(
  "create_session",
  CreateSessionPayloadSchema,
);
export const ClientRenameSessionMessageSchema = clientFrame(
  "rename_session",
  RenameSessionPayloadSchema,
);
export const ClientDeleteSessionMessageSchema = clientFrame(
  "delete_session",
  DeleteSessionPayloadSchema,
);
export const ClientSetSessionProviderMessageSchema = clientFrame(
  "set_session_provider",
  SetSessionProviderPayloadSchema,
);
export const ClientSendMessageMessageSchema = clientFrame("send_message", SendMessagePayloadSchema);
export const ClientCancelRunMessageSchema = clientFrame("cancel_run", CancelRunPayloadSchema);
export const ClientPermissionResponseMessageSchema = clientFrame(
  "permission_response",
  PermissionResponsePayloadSchema,
);
export const ClientListModelsMessageSchema = clientFrame("list_models", ListModelsPayloadSchema);
export const ClientCheckProviderHealthMessageSchema = clientFrame(
  "check_provider_health",
  CheckProviderHealthPayloadSchema,
);
export const ClientVoiceStartMessageSchema = clientFrame("voice_start", VoiceStartPayloadSchema);
export const ClientVoiceAudioChunkMessageSchema = clientFrame(
  "voice_audio_chunk",
  VoiceAudioChunkPayloadSchema,
);
export const ClientVoiceStopMessageSchema = clientFrame("voice_stop", VoiceStopPayloadSchema);
export const ClientTtsSpeakMessageSchema = clientFrame("tts_speak", TtsSpeakPayloadSchema);
export const ClientTtsStopMessageSchema = clientFrame("tts_stop", TtsStopPayloadSchema);
export const ClientDiffResponseMessageSchema = clientFrame("diff_response", DiffResponsePayloadSchema);
export const ClientUpsertProviderConfigMessageSchema = clientFrame(
  "upsert_provider_config",
  UpsertProviderConfigPayloadSchema,
);
export const ClientUpsertVoiceProfileMessageSchema = clientFrame(
  "upsert_voice_profile",
  UpsertVoiceProfilePayloadSchema,
);
export const ClientPairRelayMessageSchema = clientFrame("pair_relay", PairRelayPayloadSchema);
export const ClientEstimatePromptMessageSchema = clientFrame("estimate_prompt", EstimatePromptPayloadSchema);
export const ClientEstimateRunMessageSchema = clientFrame("estimate_run", EstimateRunPayloadSchema);
export const ClientGetSpendMessageSchema = clientFrame("get_spend", GetSpendPayloadSchema);
export const ClientSetBudgetMessageSchema = clientFrame("set_budget", SetBudgetPayloadSchema);
export const ClientDeleteBudgetMessageSchema = clientFrame("delete_budget", DeleteBudgetPayloadSchema);
export const ClientBudgetResponseMessageSchema = clientFrame("budget_response", BudgetResponsePayloadSchema);
export const ClientWatchFolderMessageSchema = clientFrame("watch_folder", WatchFolderPayloadSchema);
export const ClientUnwatchFolderMessageSchema = clientFrame("unwatch_folder", UnwatchFolderPayloadSchema);
export const ClientLinkRepositoryMessageSchema = clientFrame("link_repository", LinkRepositoryPayloadSchema);

export const ClientMessageSchema = z.discriminatedUnion("type", [
  ClientHelloMessageSchema,
  ClientGetStateMessageSchema,
  ClientCreateWorkspaceMessageSchema,
  ClientDeleteWorkspaceMessageSchema,
  ClientBrowseFsMessageSchema,
  ClientReadFileMessageSchema,
  ClientCreateSessionMessageSchema,
  ClientRenameSessionMessageSchema,
  ClientDeleteSessionMessageSchema,
  ClientSetSessionProviderMessageSchema,
  ClientSendMessageMessageSchema,
  ClientCancelRunMessageSchema,
  ClientPermissionResponseMessageSchema,
  ClientListModelsMessageSchema,
  ClientCheckProviderHealthMessageSchema,
  ClientVoiceStartMessageSchema,
  ClientVoiceAudioChunkMessageSchema,
  ClientVoiceStopMessageSchema,
  ClientTtsSpeakMessageSchema,
  ClientTtsStopMessageSchema,
  ClientDiffResponseMessageSchema,
  ClientUpsertProviderConfigMessageSchema,
  ClientUpsertVoiceProfileMessageSchema,
  ClientPairRelayMessageSchema,
  ClientEstimatePromptMessageSchema,
  ClientEstimateRunMessageSchema,
  ClientGetSpendMessageSchema,
  ClientSetBudgetMessageSchema,
  ClientDeleteBudgetMessageSchema,
  ClientBudgetResponseMessageSchema,
  ClientWatchFolderMessageSchema,
  ClientUnwatchFolderMessageSchema,
  ClientLinkRepositoryMessageSchema,
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;
export type ClientMessageType = ClientMessage["type"];
