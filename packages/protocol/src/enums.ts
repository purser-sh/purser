import { z } from "zod";

export const CostModelSchema = z.enum(["metered", "subscription", "local"]);
export type CostModel = z.infer<typeof CostModelSchema>;

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

export const BudgetScopeSchema = z.enum(["global", "workspace", "session"]);
export type BudgetScope = z.infer<typeof BudgetScopeSchema>;

export const BudgetWindowSchema = z.enum(["run", "day", "month"]);
export type BudgetWindow = z.infer<typeof BudgetWindowSchema>;

export const BudgetActionSchema = z.enum(["warn", "ask", "hard_stop"]);
export type BudgetAction = z.infer<typeof BudgetActionSchema>;

export const BudgetDecisionSchema = z.enum(["allow_once", "allow_with_headroom", "deny"]);
export type BudgetDecision = z.infer<typeof BudgetDecisionSchema>;

export const TokenizerSourceSchema = z.enum(["tokenizer", "heuristic"]);
export type TokenizerSource = z.infer<typeof TokenizerSourceSchema>;
