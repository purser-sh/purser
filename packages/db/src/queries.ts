import { and, asc, eq, gte, inArray, lt, max } from "drizzle-orm";
import type {
  Budget,
  BudgetAction,
  BudgetScope,
  BudgetWindow,
  CostModel,
  DocumentSettings,
  EventRole,
  FolderWatch,
  PermissionMode,
  ProviderConfig,
  Run,
  RunStatus,
  Session,
  SessionStatus,
  Setting,
  SpendBucket,
  SpendSummary,
  StatePayload,
  StoredEvent,
  StoredEventPayload,
  VoiceProfile,
  Workspace,
} from "@purser-sh/protocol";
import {
  PROTOCOL_VERSION,
  StoredEventPayloadSchema,
  describeIncoherentPair,
  isModelCoherent,
} from "@purser-sh/protocol";
import type { AppDatabase } from "./client.ts";
import { newId } from "./ids.ts";
import { toIso } from "./paths.ts";
import {
  events,
  providerConfigs,
  runs,
  sessions,
  settings,
  tokenLedger,
  budgets,
  voiceProfiles,
  workspaces,
} from "./schema.sqlite.ts";

const FOLDER_WATCHES_KEY = "folder_watches";
const WORKSPACE_SHELL_KEY = "workspace_shell";
const DOCUMENT_SETTINGS_KEY = "document_settings";

const DOCUMENT_SETTINGS_DEFAULT = {
  tokenThreshold: 10_000,
  maxFileBytes: 50 * 1024 * 1024,
  convertTimeoutMs: 30_000,
} satisfies DocumentSettings;

export type WorkspaceShellSettings = {
  runBashEnabled: boolean;
  allowDestructiveShell: boolean;
};

function loadWorkspaceShellMap(db: AppDatabase): Record<string, WorkspaceShellSettings> {
  const row = db.select().from(settings).where(eq(settings.key, WORKSPACE_SHELL_KEY)).get();
  if (row === undefined || row.value === null || typeof row.value !== "object" || Array.isArray(row.value)) {
    return {};
  }
  const out: Record<string, WorkspaceShellSettings> = {};
  for (const [workspaceId, raw] of Object.entries(row.value as Record<string, unknown>)) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      continue;
    }
    const record = raw as Record<string, unknown>;
    out[workspaceId] = {
      runBashEnabled: record.runBashEnabled === true,
      allowDestructiveShell: record.allowDestructiveShell === true,
    };
  }
  return out;
}

export function getWorkspaceShellSettings(db: AppDatabase, workspaceId: string): WorkspaceShellSettings {
  return loadWorkspaceShellMap(db)[workspaceId] ?? { runBashEnabled: false, allowDestructiveShell: false };
}

export function updateWorkspaceShellSettings(
  db: AppDatabase,
  workspaceId: string,
  patch: Partial<WorkspaceShellSettings>,
): WorkspaceShellSettings {
  const map = loadWorkspaceShellMap(db);
  const current = map[workspaceId] ?? { runBashEnabled: false, allowDestructiveShell: false };
  const next = {
    runBashEnabled: patch.runBashEnabled ?? current.runBashEnabled,
    allowDestructiveShell: patch.allowDestructiveShell ?? current.allowDestructiveShell,
  };
  map[workspaceId] = next;
  upsertSetting(db, WORKSPACE_SHELL_KEY, map);
  return next;
}

export function getDocumentSettings(db: AppDatabase): DocumentSettings {
  const row = db.select().from(settings).where(eq(settings.key, DOCUMENT_SETTINGS_KEY)).get();
  if (row === undefined || row.value === null || typeof row.value !== "object" || Array.isArray(row.value)) {
    return { ...DOCUMENT_SETTINGS_DEFAULT };
  }
  const record = row.value as Record<string, unknown>;
  return {
    tokenThreshold:
      typeof record.tokenThreshold === "number" && Number.isFinite(record.tokenThreshold)
        ? Math.trunc(record.tokenThreshold)
        : DOCUMENT_SETTINGS_DEFAULT.tokenThreshold,
    maxFileBytes:
      typeof record.maxFileBytes === "number" && Number.isFinite(record.maxFileBytes)
        ? Math.trunc(record.maxFileBytes)
        : DOCUMENT_SETTINGS_DEFAULT.maxFileBytes,
    convertTimeoutMs:
      typeof record.convertTimeoutMs === "number" && Number.isFinite(record.convertTimeoutMs)
        ? Math.trunc(record.convertTimeoutMs)
        : DOCUMENT_SETTINGS_DEFAULT.convertTimeoutMs,
  };
}

export function updateDocumentSettings(db: AppDatabase, patch: Partial<DocumentSettings>): DocumentSettings {
  const current = getDocumentSettings(db);
  const next: DocumentSettings = {
    tokenThreshold: patch.tokenThreshold ?? current.tokenThreshold,
    maxFileBytes: patch.maxFileBytes ?? current.maxFileBytes,
    convertTimeoutMs: patch.convertTimeoutMs ?? current.convertTimeoutMs,
  };
  upsertSetting(db, DOCUMENT_SETTINGS_KEY, next);
  return next;
}

function mapWorkspace(
  row: typeof workspaces.$inferSelect,
  shell: WorkspaceShellSettings = { runBashEnabled: false, allowDestructiveShell: false },
): Workspace {
  return {
    id: row.id,
    name: row.name,
    absPath: row.absPath,
    gitRemote: row.gitRemote,
    createdAt: toIso(row.createdAt),
    runBashEnabled: shell.runBashEnabled,
    allowDestructiveShell: shell.allowDestructiveShell,
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
    bypassExpiresAt: row.bypassExpiresAt ? toIso(row.bypassExpiresAt) : null,
    bypassRunsRemaining: row.bypassRunsRemaining ?? null,
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

const DEFAULT_PROVIDERS: Array<{
  providerId: string;
  label: string;
  baseUrl: string | null;
  authMode: "cli_login" | "keychain" | "none";
}> = [
  { providerId: "echo", label: "Echo (fake)", baseUrl: null, authMode: "none" },
  { providerId: "claude_code", label: "Claude Code", baseUrl: null, authMode: "cli_login" },
  { providerId: "codex", label: "OpenAI Codex", baseUrl: null, authMode: "cli_login" },
  { providerId: "cursor_agent", label: "Cursor Agent", baseUrl: null, authMode: "cli_login" },
  { providerId: "gemini_cli", label: "Gemini CLI", baseUrl: null, authMode: "cli_login" },
  { providerId: "ollama", label: "Ollama", baseUrl: "http://127.0.0.1:11434/v1", authMode: "none" },
  { providerId: "grok", label: "Grok (xAI)", baseUrl: "https://api.x.ai/v1", authMode: "keychain" },
  {
    providerId: "generic_llm",
    label: "OpenAI compatible",
    baseUrl: "http://127.0.0.1:11434/v1",
    authMode: "keychain",
  },
  {
    providerId: "perplexity",
    label: "Perplexity (research)",
    baseUrl: "https://api.perplexity.ai",
    authMode: "keychain",
  },
];

export async function seedDefaults(db: AppDatabase): Promise<void> {
  const existing = db.select().from(providerConfigs).all();
  const have = new Set(existing.map((row) => row.providerId));
  for (const seed of DEFAULT_PROVIDERS) {
    if (have.has(seed.providerId)) {
      continue;
    }
    db.insert(providerConfigs)
      .values({
        id: newId("pc"),
        providerId: seed.providerId,
        label: seed.label,
        baseUrl: seed.baseUrl,
        authMode: seed.authMode,
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
  const shellByWorkspace = loadWorkspaceShellMap(db);
  return {
    workspaces: db
      .select()
      .from(workspaces)
      .orderBy(asc(workspaces.createdAt))
      .all()
      .map((row) => mapWorkspace(row, shellByWorkspace[row.id])),
    sessions: db.select().from(sessions).orderBy(asc(sessions.createdAt)).all().map(mapSession),
    events: db.select().from(events).orderBy(asc(events.createdAt), asc(events.seq)).all().map(mapEvent),
    runs: db.select().from(runs).orderBy(asc(runs.startedAt)).all().map(mapRun),
    providerConfigs: db.select().from(providerConfigs).all().map(mapProviderConfig),
    voiceProfiles: db.select().from(voiceProfiles).all().map(mapVoiceProfile),
    settings: db
      .select()
      .from(settings)
      .all()
      .map(mapSetting)
      .filter(
        (setting) =>
          setting.key !== FOLDER_WATCHES_KEY &&
          setting.key !== WORKSPACE_SHELL_KEY &&
          setting.key !== DOCUMENT_SETTINGS_KEY,
      ),
    folderWatches: listFolderWatches(db),
    budgets: listBudgets(db),
    spendSummary: loadSpendSummary(db),
    documentSettings: getDocumentSettings(db),
    documentCacheBytes: 0,
    markitdown: { available: false },
    protocolVersion: PROTOCOL_VERSION,
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
  return mapWorkspace(row, { runBashEnabled: false, allowDestructiveShell: false });
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
    bypassExpiresAt: null,
    bypassRunsRemaining: null,
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
    worktreePath?: string | null;
    status?: SessionStatus;
    tokensIn?: number;
    tokensOut?: number;
    costUsd?: number;
    bypassExpiresAt?: string | null;
    bypassRunsRemaining?: number | null;
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
  if (patch.worktreePath !== undefined) setValues.worktreePath = patch.worktreePath;
  if (patch.status !== undefined) setValues.status = patch.status;
  if (patch.tokensIn !== undefined) setValues.tokensIn = patch.tokensIn;
  if (patch.tokensOut !== undefined) setValues.tokensOut = patch.tokensOut;
  if (patch.costUsd !== undefined) setValues.costUsd = patch.costUsd;
  if (patch.bypassExpiresAt !== undefined) {
    setValues.bypassExpiresAt = patch.bypassExpiresAt === null ? null : new Date(patch.bypassExpiresAt);
  }
  if (patch.bypassRunsRemaining !== undefined) setValues.bypassRunsRemaining = patch.bypassRunsRemaining;
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

export function getProviderConfig(db: AppDatabase, providerId: string): ProviderConfig | undefined {
  const row = db.select().from(providerConfigs).where(eq(providerConfigs.providerId, providerId)).get();
  return row === undefined ? undefined : mapProviderConfig(row);
}

export function upsertProviderConfig(
  db: AppDatabase,
  input: {
    id?: string;
    providerId: string;
    label: string;
    baseUrl: string | null;
    authMode: ProviderConfig["authMode"];
    settings: Record<string, unknown>;
  },
): ProviderConfig {
  const existing =
    input.id !== undefined
      ? db.select().from(providerConfigs).where(eq(providerConfigs.id, input.id)).get()
      : db.select().from(providerConfigs).where(eq(providerConfigs.providerId, input.providerId)).get();
  if (existing === undefined) {
    const row = {
      id: input.id ?? newId("pc"),
      providerId: input.providerId,
      label: input.label,
      baseUrl: input.baseUrl,
      authMode: input.authMode,
      settings: input.settings,
    };
    db.insert(providerConfigs).values(row).run();
    return mapProviderConfig(row);
  }
  db.update(providerConfigs)
    .set({
      providerId: input.providerId,
      label: input.label,
      baseUrl: input.baseUrl,
      authMode: input.authMode,
      settings: input.settings,
    })
    .where(eq(providerConfigs.id, existing.id))
    .run();
  const updated = db.select().from(providerConfigs).where(eq(providerConfigs.id, existing.id)).get();
  if (updated === undefined) {
    throw new Error("provider config missing after update");
  }
  return mapProviderConfig(updated);
}

export function upsertVoiceProfile(
  db: AppDatabase,
  input: {
    id?: string;
    name: string;
    wakeWord: string | null;
    sttProvider: string;
    ttsProvider: string;
    voiceId: string | null;
    speed: number;
    language: string;
    personaPrompt: string;
    verbosity: VoiceProfile["verbosity"];
    interruptOnSpeech: boolean;
    isDefault: boolean;
  },
): VoiceProfile {
  if (input.isDefault) {
    for (const row of db.select().from(voiceProfiles).all()) {
      if (row.isDefault) {
        db.update(voiceProfiles).set({ isDefault: false }).where(eq(voiceProfiles.id, row.id)).run();
      }
    }
  }
  const existing =
    input.id !== undefined
      ? db.select().from(voiceProfiles).where(eq(voiceProfiles.id, input.id)).get()
      : undefined;
  if (existing === undefined) {
    const row = {
      id: input.id ?? newId("vp"),
      name: input.name,
      wakeWord: input.wakeWord,
      sttProvider: input.sttProvider,
      ttsProvider: input.ttsProvider,
      voiceId: input.voiceId,
      speed: input.speed,
      language: input.language,
      personaPrompt: input.personaPrompt,
      verbosity: input.verbosity,
      interruptOnSpeech: input.interruptOnSpeech,
      isDefault: input.isDefault,
    };
    db.insert(voiceProfiles).values(row).run();
    return mapVoiceProfile(row);
  }
  db.update(voiceProfiles)
    .set({
      name: input.name,
      wakeWord: input.wakeWord,
      sttProvider: input.sttProvider,
      ttsProvider: input.ttsProvider,
      voiceId: input.voiceId,
      speed: input.speed,
      language: input.language,
      personaPrompt: input.personaPrompt,
      verbosity: input.verbosity,
      interruptOnSpeech: input.interruptOnSpeech,
      isDefault: input.isDefault,
    })
    .where(eq(voiceProfiles.id, existing.id))
    .run();
  const updated = db.select().from(voiceProfiles).where(eq(voiceProfiles.id, existing.id)).get();
  if (updated === undefined) {
    throw new Error("voice profile missing after update");
  }
  return mapVoiceProfile(updated);
}

export function upsertSetting(db: AppDatabase, key: string, value: unknown): Setting {
  const existing = db.select().from(settings).where(eq(settings.key, key)).get();
  if (existing === undefined) {
    db.insert(settings).values({ key, value }).run();
  } else {
    db.update(settings).set({ value }).where(eq(settings.key, key)).run();
  }
  return { key, value };
}

export function listFolderWatches(db: AppDatabase): FolderWatch[] {
  const row = db.select().from(settings).where(eq(settings.key, FOLDER_WATCHES_KEY)).get();
  if (row === undefined) {
    return [];
  }
  if (!Array.isArray(row.value)) {
    return [];
  }
  const out: FolderWatch[] = [];
  for (const item of row.value) {
    if (
      item !== null &&
      typeof item === "object" &&
      "workspaceId" in item &&
      "absPath" in item &&
      typeof (item as { workspaceId: unknown }).workspaceId === "string" &&
      typeof (item as { absPath: unknown }).absPath === "string"
    ) {
      out.push({
        workspaceId: (item as { workspaceId: string }).workspaceId,
        absPath: (item as { absPath: string }).absPath,
        enabled: (item as { enabled?: unknown }).enabled !== false,
      });
    }
  }
  return out;
}

export function saveFolderWatches(db: AppDatabase, watches: FolderWatch[]): FolderWatch[] {
  upsertSetting(db, FOLDER_WATCHES_KEY, watches);
  return watches;
}

export function updateWorkspace(
  db: AppDatabase,
  workspaceId: string,
  patch: { gitRemote?: string | null },
): Workspace | undefined {
  const current = db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).get();
  if (current === undefined) {
    return undefined;
  }
  if (patch.gitRemote !== undefined) {
    db.update(workspaces).set({ gitRemote: patch.gitRemote }).where(eq(workspaces.id, workspaceId)).run();
  }
  return getWorkspace(db, workspaceId);
}

export type LedgerSource = "provider_usage" | "estimated";

/**
 * The ledger is the source of truth for spend, so it refuses rows that
 * describe a run that could not have happened. Callers resolve the model
 * against the provider before they get here.
 */
export class LedgerIntegrityError extends Error {
  constructor(detail: string) {
    super(`ledger rejected the entry: ${detail}`);
    this.name = "LedgerIntegrityError";
  }
}

export type LedgerEntry = {
  id: string;
  ts: Date;
  workspaceId: string;
  sessionId: string;
  runId: string;
  providerId: string;
  model: string | null;
  costModel: CostModel;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsdMicros: number | null;
  source: LedgerSource;
  createdAt: Date;
};

function mapLedger(row: typeof tokenLedger.$inferSelect): LedgerEntry {
  const source: LedgerSource = row.source === "estimated" ? "estimated" : "provider_usage";
  const costModel: CostModel =
    row.costModel === "subscription" || row.costModel === "local" || row.costModel === "metered"
      ? row.costModel
      : "local";
  return {
    id: row.id,
    ts: row.ts,
    workspaceId: row.workspaceId,
    sessionId: row.sessionId,
    runId: row.runId,
    providerId: row.providerId,
    model: row.model,
    costModel,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    cacheReadTokens: row.cacheReadTokens,
    cacheWriteTokens: row.cacheWriteTokens,
    costUsdMicros: row.costUsdMicros,
    source,
    createdAt: row.createdAt,
  };
}

export function appendLedgerEntry(
  db: AppDatabase,
  input: {
    workspaceId: string;
    sessionId: string;
    runId: string;
    providerId: string;
    model: string | null;
    costModel: CostModel;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    costUsdMicros: number | null;
    source: LedgerSource;
    ts?: Date;
  },
): LedgerEntry {
  if (!isModelCoherent(input.providerId, input.model)) {
    throw new LedgerIntegrityError(describeIncoherentPair(input.providerId, input.model ?? ""));
  }
  const now = input.ts ?? new Date();
  const row = {
    id: newId("led"),
    ts: now,
    workspaceId: input.workspaceId,
    sessionId: input.sessionId,
    runId: input.runId,
    providerId: input.providerId,
    model: input.model,
    costModel: input.costModel,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    cacheReadTokens: input.cacheReadTokens,
    cacheWriteTokens: input.cacheWriteTokens,
    costUsdMicros: input.costUsdMicros,
    source: input.source,
    createdAt: now,
  };
  db.insert(tokenLedger).values(row).run();
  return mapLedger(row);
}

export function listLedgerByRun(db: AppDatabase, runId: string): LedgerEntry[] {
  return db.select().from(tokenLedger).where(eq(tokenLedger.runId, runId)).all().map(mapLedger);
}

export function listLedgerBySession(db: AppDatabase, sessionId: string): LedgerEntry[] {
  return db.select().from(tokenLedger).where(eq(tokenLedger.sessionId, sessionId)).all().map(mapLedger);
}

export function listLedgerByWorkspace(db: AppDatabase, workspaceId: string): LedgerEntry[] {
  return db.select().from(tokenLedger).where(eq(tokenLedger.workspaceId, workspaceId)).all().map(mapLedger);
}

export function listLedger(db: AppDatabase): LedgerEntry[] {
  return db.select().from(tokenLedger).all().map(mapLedger);
}

function asBudgetScope(value: string): BudgetScope {
  if (value === "workspace" || value === "session" || value === "global") {
    return value;
  }
  return "global";
}

function asBudgetWindow(value: string): BudgetWindow {
  if (value === "run" || value === "day" || value === "month") {
    return value;
  }
  return "day";
}

function asBudgetAction(value: string): BudgetAction {
  if (value === "warn" || value === "ask" || value === "hard_stop") {
    return value;
  }
  return "warn";
}

function mapBudget(row: typeof budgets.$inferSelect): Budget {
  return {
    id: row.id,
    scope: asBudgetScope(row.scope),
    scopeId: row.scopeId,
    window: asBudgetWindow(row.window),
    limitUsdMicros: row.limitUsdMicros,
    limitTokens: row.limitTokens,
    action: asBudgetAction(row.action),
    enabled: row.enabled,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

export function listBudgets(db: AppDatabase): Budget[] {
  return db.select().from(budgets).orderBy(asc(budgets.createdAt)).all().map(mapBudget);
}

export function getBudget(db: AppDatabase, budgetId: string): Budget | undefined {
  const row = db.select().from(budgets).where(eq(budgets.id, budgetId)).get();
  return row === undefined ? undefined : mapBudget(row);
}

export function upsertBudget(
  db: AppDatabase,
  input: {
    id?: string;
    scope: BudgetScope;
    scopeId: string | null;
    window: BudgetWindow;
    limitUsdMicros: number | null;
    limitTokens: number | null;
    action: BudgetAction;
    enabled: boolean;
  },
): Budget {
  const now = new Date();
  const existing = input.id === undefined ? undefined : db.select().from(budgets).where(eq(budgets.id, input.id)).get();
  if (existing !== undefined) {
    db.update(budgets)
      .set({
        scope: input.scope,
        scopeId: input.scopeId,
        window: input.window,
        limitUsdMicros: input.limitUsdMicros,
        limitTokens: input.limitTokens,
        action: input.action,
        enabled: input.enabled,
        updatedAt: now,
      })
      .where(eq(budgets.id, existing.id))
      .run();
    const updated = getBudget(db, existing.id);
    if (updated === undefined) {
      throw new Error("budget missing after update");
    }
    return updated;
  }
  const row = {
    id: input.id ?? newId("bud"),
    scope: input.scope,
    scopeId: input.scopeId,
    window: input.window,
    limitUsdMicros: input.limitUsdMicros,
    limitTokens: input.limitTokens,
    action: input.action,
    enabled: input.enabled,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(budgets).values(row).run();
  return mapBudget(row);
}

export function deleteBudget(db: AppDatabase, budgetId: string): boolean {
  const existing = db.select().from(budgets).where(eq(budgets.id, budgetId)).get();
  if (existing === undefined) {
    return false;
  }
  db.delete(budgets).where(eq(budgets.id, budgetId)).run();
  return true;
}

export function listRunsStartedBetween(db: AppDatabase, start: Date, end: Date): Run[] {
  return db
    .select()
    .from(runs)
    .where(and(gte(runs.startedAt, start), lt(runs.startedAt, end)))
    .all()
    .map(mapRun);
}

export type LedgerTotals = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  tokens: number;
  costUsdMicros: number | null;
  unpricedModels: string[];
  source: "provider_usage" | "estimated";
};

export function emptyLedgerTotals(): LedgerTotals {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    tokens: 0,
    costUsdMicros: null,
    unpricedModels: [],
    source: "provider_usage",
  };
}

export function sumLedgerRows(rows: LedgerEntry[]): LedgerTotals {
  const totals = emptyLedgerTotals();
  const unpriced = new Set<string>();
  let estimated = false;
  let priced = false;
  let usd = 0;
  for (const row of rows) {
    totals.inputTokens += row.inputTokens;
    totals.outputTokens += row.outputTokens;
    totals.cacheReadTokens += row.cacheReadTokens;
    totals.cacheWriteTokens += row.cacheWriteTokens;
    if (row.source === "estimated") {
      estimated = true;
    }
    if (row.costUsdMicros === null) {
      if (row.model !== null && row.model.length > 0) {
        unpriced.add(`${row.providerId}/${row.model}`);
      }
    } else {
      priced = true;
      usd += row.costUsdMicros;
    }
  }
  totals.tokens = totals.inputTokens + totals.outputTokens + totals.cacheReadTokens + totals.cacheWriteTokens;
  totals.costUsdMicros = priced ? usd : null;
  totals.unpricedModels = [...unpriced];
  totals.source = estimated ? "estimated" : "provider_usage";
  return totals;
}

export function listLedgerForRuns(db: AppDatabase, runIds: string[]): LedgerEntry[] {
  if (runIds.length === 0) {
    return [];
  }
  return db.select().from(tokenLedger).where(inArray(tokenLedger.runId, runIds)).all().map(mapLedger);
}

export function utcDayStart(ts: Date): Date {
  return new Date(Date.UTC(ts.getUTCFullYear(), ts.getUTCMonth(), ts.getUTCDate()));
}

export function utcMonthStart(ts: Date): Date {
  return new Date(Date.UTC(ts.getUTCFullYear(), ts.getUTCMonth(), 1));
}

export function nextUtcDay(ts: Date): Date {
  const start = utcDayStart(ts);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

export function nextUtcMonth(ts: Date): Date {
  return new Date(Date.UTC(ts.getUTCFullYear(), ts.getUTCMonth() + 1, 1));
}

/** Local calendar day start — what "Today" means in the Spend UI. */
export function localDayStart(ts: Date): Date {
  return new Date(ts.getFullYear(), ts.getMonth(), ts.getDate());
}

export function nextLocalDay(ts: Date): Date {
  const start = localDayStart(ts);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

export function localMonthStart(ts: Date): Date {
  return new Date(ts.getFullYear(), ts.getMonth(), 1);
}

export function nextLocalMonth(ts: Date): Date {
  return new Date(ts.getFullYear(), ts.getMonth() + 1, 1);
}

function bucketFromRows(rows: LedgerEntry[]): SpendBucket {
  const totals = sumLedgerRows(rows);
  return { tokens: totals.tokens, costUsdMicros: totals.costUsdMicros };
}

/**
 * Day/month totals come from ledger row timestamps in the local calendar, not
 * from the runs table. Bucketing through runs left orphaned ledger rows (and a
 * stale UI that never refreshed after spend_update) showing Today = 0 while
 * This run showed thousands of tokens.
 */
export function loadSpendSummary(db: AppDatabase, now = new Date()): SpendSummary {
  const dayStart = localDayStart(now);
  const dayEnd = nextLocalDay(now);
  const monthStart = localMonthStart(now);
  const monthEnd = nextLocalMonth(now);
  const all = listLedger(db);
  const dayRows = all.filter((row) => row.ts >= dayStart && row.ts < dayEnd);
  const monthRows = all.filter((row) => row.ts >= monthStart && row.ts < monthEnd);
  const workspaceIds = new Set<string>();
  for (const row of monthRows) {
    workspaceIds.add(row.workspaceId);
  }
  const byWorkspace = [...workspaceIds].map((workspaceId) => ({
    workspaceId,
    today: bucketFromRows(dayRows.filter((row) => row.workspaceId === workspaceId)),
    month: bucketFromRows(monthRows.filter((row) => row.workspaceId === workspaceId)),
  }));
  const unpriced = new Set<string>();
  for (const row of monthRows) {
    if (row.costUsdMicros === null && row.model !== null) {
      unpriced.add(`${row.providerId}/${row.model}`);
    }
  }
  return {
    generatedAt: toIso(now),
    today: bucketFromRows(dayRows),
    month: bucketFromRows(monthRows),
    unpricedModels: [...unpriced],
    catalogStale: false,
    byWorkspace,
  };
}
