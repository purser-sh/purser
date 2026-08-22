import { z } from "zod";

export const PermissionModeSchema = z.enum(["ask", "auto_edit", "bypass"]);
export type PermissionMode = z.infer<typeof PermissionModeSchema>;

export const SessionStatusSchema = z.enum(["idle", "running", "error"]);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

export const RunStatusSchema = z.enum(["running", "ok", "cancelled", "error"]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export const ProviderKindSchema = z.enum(["sdk", "cli", "api"]);
export type ProviderKind = z.infer<typeof ProviderKindSchema>;

export const AuthModeSchema = z.enum(["cli_login", "keychain", "none"]);
export type AuthMode = z.infer<typeof AuthModeSchema>;

export const EventRoleSchema = z.enum(["user", "assistant", "system", "tool"]);
export type EventRole = z.infer<typeof EventRoleSchema>;

export const VoiceInputModeSchema = z.enum([
  "push_to_talk",
  "hands_free",
  "wake_word",
]);
export type VoiceInputMode = z.infer<typeof VoiceInputModeSchema>;

export const VoiceVerbositySchema = z.enum(["full", "summary", "ack_only"]);
export type VoiceVerbosity = z.infer<typeof VoiceVerbositySchema>;

export const FsEntryKindSchema = z.enum(["file", "dir"]);
export type FsEntryKind = z.infer<typeof FsEntryKindSchema>;

export const FileEncodingSchema = z.enum(["utf8", "base64"]);
export type FileEncoding = z.infer<typeof FileEncodingSchema>;
