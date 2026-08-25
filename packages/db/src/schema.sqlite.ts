import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  absPath: text("abs_path").notNull(),
  gitRemote: text("git_remote"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  providerId: text("provider_id").notNull(),
  modelId: text("model_id"),
  providerSessionId: text("provider_session_id"),
  permissionMode: text("permission_mode", {
    enum: ["ask", "auto_edit", "bypass"],
  }).notNull(),
  worktreePath: text("worktree_path"),
  status: text("status", { enum: ["idle", "running", "error"] }).notNull(),
  tokensIn: integer("tokens_in").notNull().default(0),
  tokensOut: integer("tokens_out").notNull().default(0),
  costUsd: real("cost_usd").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  bypassExpiresAt: integer("bypass_expires_at", { mode: "timestamp_ms" }),
  bypassRunsRemaining: integer("bypass_runs_remaining"),
});

export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    kind: text("kind").notNull(),
    role: text("role", { enum: ["user", "assistant", "system", "tool"] }).notNull(),
    payload: text("payload", { mode: "json" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [uniqueIndex("events_session_seq_idx").on(table.sessionId, table.seq)],
);

export const runs = sqliteTable("runs", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id, { onDelete: "cascade" }),
  status: text("status", {
    enum: ["running", "ok", "cancelled", "error"],
  }).notNull(),
  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
  endedAt: integer("ended_at", { mode: "timestamp_ms" }),
  error: text("error"),
});

export const providerConfigs = sqliteTable("provider_configs", {
  id: text("id").primaryKey(),
  providerId: text("provider_id").notNull(),
  label: text("label").notNull(),
  baseUrl: text("base_url"),
  authMode: text("auth_mode", {
    enum: ["cli_login", "keychain", "none"],
  }).notNull(),
  settings: text("settings", { mode: "json" }).notNull(),
});

export const voiceProfiles = sqliteTable("voice_profiles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  wakeWord: text("wake_word"),
  sttProvider: text("stt_provider").notNull(),
  ttsProvider: text("tts_provider").notNull(),
  voiceId: text("voice_id"),
  speed: real("speed").notNull().default(1),
  language: text("language").notNull(),
  personaPrompt: text("persona_prompt").notNull().default(""),
  verbosity: text("verbosity", {
    enum: ["full", "summary", "ack_only"],
  }).notNull(),
  interruptOnSpeech: integer("interrupt_on_speech", { mode: "boolean" })
    .notNull()
    .default(true),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).notNull(),
});

export const tokenLedger = sqliteTable(
  "token_ledger",
  {
    id: text("id").primaryKey(),
    ts: integer("ts", { mode: "timestamp_ms" }).notNull(),
    workspaceId: text("workspace_id").notNull(),
    sessionId: text("session_id").notNull(),
    runId: text("run_id").notNull(),
    providerId: text("provider_id").notNull(),
    model: text("model"),
    costModel: text("cost_model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
    costUsdMicros: integer("cost_usd_micros"),
    source: text("source").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("token_ledger_run_id_idx").on(table.runId),
    index("token_ledger_workspace_ts_idx").on(table.workspaceId, table.ts),
    index("token_ledger_session_ts_idx").on(table.sessionId, table.ts),
    index("token_ledger_ts_idx").on(table.ts),
  ],
);

export const sqliteSchema = {
  workspaces,
  sessions,
  events,
  runs,
  providerConfigs,
  voiceProfiles,
  settings,
  tokenLedger,
};
