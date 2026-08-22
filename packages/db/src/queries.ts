import { asc, eq, max } from "drizzle-orm";
import type {
  EventRole,
  PermissionMode,
  ProviderConfig,
  Run,
  RunStatus,
  Session,
  SessionStatus,
  Setting,
  StatePayload,
  StoredEvent,
  StoredEventPayload,
  VoiceProfile,
  Workspace,
} from "@agentdeck/protocol";
import { StoredEventPayloadSchema } from "@agentdeck/protocol";
import type { AppDatabase } from "./client.ts";
import { newId } from "./ids.ts";
import { toIso } from "./paths.ts";
import {
  events,
  providerConfigs,
  runs,
  sessions,
  settings,
  voiceProfiles,
  workspaces,
} from "./schema.sqlite.ts";

function mapWorkspace(row: typeof workspaces.$inferSelect): Workspace {
  return {
    id: row.id,
    name: row.name,
    absPath: row.absPath,
    gitRemote: row.gitRemote,
    createdAt: toIso(row.createdAt),
  };
}

function mapSession(row: typeof sessions.$inferSelect): Session {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    title: row.title,
    providerId: row.providerId,
    modelId: row.modelId,
    providerSessionId: row.providerSessionId,
    permissionMode: row.permissionMode,
    worktreePath: row.worktreePath,
    status: row.status,
    tokensIn: row.tokensIn,
    tokensOut: row.tokensOut,
    costUsd: row.costUsd,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function mapEvent(row: typeof events.$inferSelect): StoredEvent {
  const parsed = StoredEventPayloadSchema.parse(row.payload);
  return {
    id: row.id,
    sessionId: row.sessionId,
    seq: row.seq,
    kind: row.kind,
    role: row.role,
    payload: parsed,
    createdAt: toIso(row.createdAt),
  };
}

function mapRun(row: typeof runs.$inferSelect): Run {
  return {
    id: row.id,
    sessionId: row.sessionId,
    status: row.status,
    startedAt: toIso(row.startedAt),
    endedAt: row.endedAt ? toIso(row.endedAt) : null,
    error: row.error,
  };
}

function mapProviderConfig(row: typeof providerConfigs.$inferSelect): ProviderConfig {
  const raw = row.settings;
  const settingsValue =
    raw !== null && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return {
    id: row.id,
    providerId: row.providerId,
    label: row.label,
    baseUrl: row.baseUrl,
    authMode: row.authMode,
    settings: settingsValue,
  };
}

function mapVoiceProfile(row: typeof voiceProfiles.$inferSelect): VoiceProfile {
  return {
    id: row.id,
    name: row.name,
    wakeWord: row.wakeWord,
    sttProvider: row.sttProvider,
    ttsProvider: row.ttsProvider,
    voiceId: row.voiceId,
    speed: row.speed,
    language: row.language,
    personaPrompt: row.personaPrompt,
    verbosity: row.verbosity,
    interruptOnSpeech: row.interruptOnSpeech,
    isDefault: row.isDefault,
  };
}

function mapSetting(row: typeof settings.$inferSelect): Setting {
  return { key: row.key, value: row.value };
}

export async function seedDefaults(db: AppDatabase): Promise<void> {
  const existingEcho = db
    .select()
    .from(providerConfigs)
    .where(eq(providerConfigs.providerId, "echo"))
    .all();
  if (existingEcho.length === 0) {
    db.insert(providerConfigs)
      .values({
        id: newId("pc"),
        providerId: "echo",
        label: "Echo (fake)",
        baseUrl: null,
        authMode: "none",
        settings: {},
      })
      .run();
  }

  const existingVoice = db.select().from(voiceProfiles).all();
  if (existingVoice.length === 0) {
    db.insert(voiceProfiles)
      .values({
        id: newId("vp"),
        name: "Default",
        wakeWord: null,
        sttProvider: "whisper_cpp",
        ttsProvider: "piper",
        voiceId: null,
        speed: 1,
        language: "en",
        personaPrompt: "",
        verbosity: "summary",
        interruptOnSpeech: true,
        isDefault: true,
      })
      .run();
  }

  const theme = db.select().from(settings).where(eq(settings.key, "theme")).all();
  if (theme.length === 0) {
    db.insert(settings).values({ key: "theme", value: "dark" }).run();
  }
}

export function loadState(db: AppDatabase): StatePayload {
  return {
    workspaces: db.select().from(workspaces).orderBy(asc(workspaces.createdAt)).all().map(mapWorkspace),
    sessions: db.select().from(sessions).orderBy(asc(sessions.createdAt)).all().map(mapSession),
    events: db.select().from(events).orderBy(asc(events.createdAt), asc(events.seq)).all().map(mapEvent),
    runs: db.select().from(runs).orderBy(asc(runs.startedAt)).all().map(mapRun),
    providerConfigs: db.select().from(providerConfigs).all().map(mapProviderConfig),
    voiceProfiles: db.select().from(voiceProfiles).all().map(mapVoiceProfile),
    settings: db.select().from(settings).all().map(mapSetting),
  };
}

export function insertWorkspace(
  db: AppDatabase,
  input: { name: string; absPath: string; gitRemote: string | null },
): Workspace {
  const now = new Date();
  const row = {
    id: newId("ws"),
    name: input.name,
    absPath: input.absPath,
    gitRemote: input.gitRemote,
    createdAt: now,
  };
  db.insert(workspaces).values(row).run();
  return mapWorkspace(row);
}

export function deleteWorkspace(db: AppDatabase, workspaceId: string): boolean {
  const existing = db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).get();
  if (existing === undefined) {
    return false;
  }
  db.delete(workspaces).where(eq(workspaces.id, workspaceId)).run();
  return true;
}

export function getWorkspace(db: AppDatabase, workspaceId: string): Workspace | undefined {
  const row = db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).get();
  return row === undefined ? undefined : mapWorkspace(row);
}

export function insertSession(
  db: AppDatabase,
  input: {
    workspaceId: string;
    title: string;
    providerId: string;
    modelId: string | null;
    permissionMode: PermissionMode;
  },
): Session {
  const now = new Date();
  const row = {
    id: newId("ses"),
    workspaceId: input.workspaceId,
    title: input.title,
    providerId: input.providerId,
    modelId: input.modelId,
    providerSessionId: null,
    permissionMode: input.permissionMode,
    worktreePath: null,
    status: "idle" as const,
    tokensIn: 0,
    tokensOut: 0,
    costUsd: 0,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(sessions).values(row).run();
  return mapSession(row);
}

export function getSession(db: AppDatabase, sessionId: string): Session | undefined {
  const row = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
  return row === undefined ? undefined : mapSession(row);
}

export function updateSession(
  db: AppDatabase,
  sessionId: string,
  patch: {
    title?: string;
    providerId?: string;
    modelId?: string | null;
    providerSessionId?: string | null;
    permissionMode?: PermissionMode;
    status?: SessionStatus;
    tokensIn?: number;
    tokensOut?: number;
    costUsd?: number;
  },
): Session | undefined {
  const current = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
  if (current === undefined) {
    return undefined;
  }
  const setValues: Partial<typeof sessions.$inferInsert> = { updatedAt: new Date() };
  if (patch.title !== undefined) setValues.title = patch.title;
  if (patch.providerId !== undefined) setValues.providerId = patch.providerId;
  if (patch.modelId !== undefined) setValues.modelId = patch.modelId;
  if (patch.providerSessionId !== undefined) setValues.providerSessionId = patch.providerSessionId;
  if (patch.permissionMode !== undefined) setValues.permissionMode = patch.permissionMode;
  if (patch.status !== undefined) setValues.status = patch.status;
  if (patch.tokensIn !== undefined) setValues.tokensIn = patch.tokensIn;
  if (patch.tokensOut !== undefined) setValues.tokensOut = patch.tokensOut;
  if (patch.costUsd !== undefined) setValues.costUsd = patch.costUsd;
  db.update(sessions).set(setValues).where(eq(sessions.id, sessionId)).run();
  return getSession(db, sessionId);
}

export function deleteSession(db: AppDatabase, sessionId: string): boolean {
  const existing = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
  if (existing === undefined) {
    return false;
  }
  db.delete(sessions).where(eq(sessions.id, sessionId)).run();
  return true;
}

export function nextEventSeq(db: AppDatabase, sessionId: string): number {
  const row = db
    .select({ value: max(events.seq) })
    .from(events)
    .where(eq(events.sessionId, sessionId))
    .get();
  return (row?.value ?? -1) + 1;
}

export function insertEvent(
  db: AppDatabase,
  input: {
    sessionId: string;
    kind: string;
    role: EventRole;
    payload: StoredEventPayload;
  },
): StoredEvent {
  const seq = nextEventSeq(db, input.sessionId);
  const row = {
    id: newId("ev"),
    sessionId: input.sessionId,
    seq,
    kind: input.kind,
    role: input.role,
    payload: input.payload,
    createdAt: new Date(),
  };
  db.insert(events).values(row).run();
  return mapEvent({ ...row, payload: input.payload });
}

export function insertRun(db: AppDatabase, sessionId: string): Run {
  const row = {
    id: newId("run"),
    sessionId,
    status: "running" as const,
    startedAt: new Date(),
    endedAt: null,
    error: null,
  };
  db.insert(runs).values(row).run();
  return mapRun(row);
}

export function getRun(db: AppDatabase, runId: string): Run | undefined {
  const row = db.select().from(runs).where(eq(runs.id, runId)).get();
  return row === undefined ? undefined : mapRun(row);
}

export function finishRun(
  db: AppDatabase,
  runId: string,
  status: Exclude<RunStatus, "running">,
  error: string | null,
): Run | undefined {
  db.update(runs)
    .set({ status, endedAt: new Date(), error })
    .where(eq(runs.id, runId))
    .run();
  return getRun(db, runId);
}

export function listRunningRuns(db: AppDatabase): Run[] {
  return db.select().from(runs).where(eq(runs.status, "running")).all().map(mapRun);
}
