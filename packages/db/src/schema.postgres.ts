import { boolean, integer, jsonb, pgTable, real, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

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

export const postgresSchema = {
  workspaces,
  sessions,
  events,
  runs,
  providerConfigs,
  voiceProfiles,
  settings,
};
