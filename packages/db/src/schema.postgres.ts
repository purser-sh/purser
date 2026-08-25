import { boolean, index, integer, jsonb, pgTable, real, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const workspaces = pgTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  absPath: text("abs_path").notNull(),
  gitRemote: text("git_remote"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
});

export const sessions = pgTable("sessions", {
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
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
  bypassExpiresAt: timestamp("bypass_expires_at", { withTimezone: true, mode: "date" }),
  bypassRunsRemaining: integer("bypass_runs_remaining"),
});

export const events = pgTable(
  "events",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    kind: text("kind").notNull(),
    role: text("role", { enum: ["user", "assistant", "system", "tool"] }).notNull(),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [uniqueIndex("events_session_seq_idx").on(table.sessionId, table.seq)],
);

export const runs = pgTable("runs", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id, { onDelete: "cascade" }),
  status: text("status", {
    enum: ["running", "ok", "cancelled", "error"],
  }).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }).notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true, mode: "date" }),
  error: text("error"),
});

export const providerConfigs = pgTable("provider_configs", {
  id: text("id").primaryKey(),
  providerId: text("provider_id").notNull(),
  label: text("label").notNull(),
  baseUrl: text("base_url"),
  authMode: text("auth_mode", {
    enum: ["cli_login", "keychain", "none"],
  }).notNull(),
  settings: jsonb("settings").notNull(),
});

export const voiceProfiles = pgTable("voice_profiles", {
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
  interruptOnSpeech: boolean("interrupt_on_speech").notNull().default(true),
  isDefault: boolean("is_default").notNull().default(false),
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
});

export const tokenLedger = pgTable(
  "token_ledger",
  {
    id: text("id").primaryKey(),
    ts: timestamp("ts", { withTimezone: true, mode: "date" }).notNull(),
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
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [
    index("token_ledger_run_id_idx").on(table.runId),
    index("token_ledger_workspace_ts_idx").on(table.workspaceId, table.ts),
    index("token_ledger_session_ts_idx").on(table.sessionId, table.ts),
    index("token_ledger_ts_idx").on(table.ts),
  ],
);

export const budgets = pgTable("budgets", {
  id: text("id").primaryKey(),
  scope: text("scope").notNull(),
  scopeId: text("scope_id"),
  window: text("window").notNull(),
  limitUsdMicros: integer("limit_usd_micros"),
  limitTokens: integer("limit_tokens"),
  action: text("action").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
});

export const postgresSchema = {
  workspaces,
  sessions,
  events,
  runs,
  providerConfigs,
  voiceProfiles,
  settings,
  tokenLedger,
  budgets,
};
