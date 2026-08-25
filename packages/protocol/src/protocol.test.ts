import { describe, expect, test } from "bun:test";
import {
  AgentEventSchema,
  ClientMessageSchema,
  parseClientMessage,
  parseEnvelope,
  parseServerMessage,
  ProtocolError,
  ServerMessageSchema,
} from "./index.ts";
import type { AgentEvent, ClientMessage, ClientMessageType, ServerMessage, ServerMessageType } from "./index.ts";

const NOW = "2026-08-22T15:43:00.000Z";

const workspace = {
  id: "ws_1",
  name: "AgentDeck",
  absPath: "/home/aksingh/AgentDeck",
  gitRemote: null,
  createdAt: NOW,
};

const session = {
  id: "ses_1",
  workspaceId: "ws_1",
  title: "New session",
  providerId: "echo",
  modelId: "echo-v1",
  providerSessionId: null,
  permissionMode: "ask" as const,
  worktreePath: null,
  status: "idle" as const,
  tokensIn: 0,
  tokensOut: 0,
  costUsd: 0,
  bypassExpiresAt: null,
  bypassRunsRemaining: null,
  createdAt: NOW,
  updatedAt: NOW,
};

const agentEvents: AgentEvent[] = [
  { kind: "session_started", providerSessionId: "echo-1" },
  { kind: "text_delta", text: "Hi" },
  { kind: "text", text: "Hi" },
  { kind: "thinking", text: "considering" },
  {
    kind: "tool_call",
    toolId: "t1",
    name: "read_file",
    input: { path: "README.md" },
    summary: "read README.md",
  },
  { kind: "tool_result", toolId: "t1", ok: true, output: "# hi", ms: 3 },
  {
    kind: "file_diff",
    path: "README.md",
    patch: "@@ -1 +1,2 @@\n+hello\n",
    added: 1,
    removed: 0,
  },
  {
    kind: "permission_request",
    requestId: "p1",
    action: "write_file",
    detail: { path: "README.md" },
  },
  { kind: "usage", inputTokens: 10, outputTokens: 20, cacheReadTokens: null, cacheWriteTokens: null, source: "provider_usage" },
  { kind: "error", message: "boom", fatal: false },
  { kind: "done", status: "ok", summary: "Echoed your message" },
];

const clientMessages: ClientMessage[] = [
  {
    id: "c1",
    type: "hello",
    payload: { token: "secret", clientVersion: "0.0.1", protocolVersion: 2 },
  },
  { id: "c2", type: "get_state", payload: {} },
  {
    id: "c3",
    type: "create_workspace",
    payload: { name: "AgentDeck", absPath: "/home/aksingh/AgentDeck" },
  },
  { id: "c4", type: "delete_workspace", payload: { workspaceId: "ws_1" } },
  { id: "c5", type: "browse_fs", payload: { path: "/home/aksingh" } },
  { id: "c6", type: "read_file", payload: { workspaceId: "ws_1", path: "src/index.ts" } },
  {
    id: "c7",
    type: "create_session",
    payload: { workspaceId: "ws_1", providerId: "echo", permissionMode: "ask" },
  },
  { id: "c8", type: "rename_session", payload: { sessionId: "ses_1", title: "Demo" } },
  { id: "c9", type: "delete_session", payload: { sessionId: "ses_1" } },
  {
    id: "c10",
    type: "set_session_provider",
    payload: { sessionId: "ses_1", providerId: "echo", modelId: "echo-v1" },
  },
  { id: "c11", type: "send_message", payload: { sessionId: "ses_1", text: "hello" } },
  { id: "c12", type: "cancel_run", payload: { runId: "run_1" } },
  { id: "c13", type: "permission_response", payload: { requestId: "p1", allow: true } },
  { id: "c14", type: "list_models", payload: { providerId: "echo" } },
  { id: "c15", type: "check_provider_health", payload: { providerId: "echo" } },
  { id: "c16", type: "voice_start", payload: { mode: "push_to_talk" } },
  {
    id: "c17",
    type: "voice_audio_chunk",
    payload: { pcm16Base64: "AA==", sampleRate: 16000 },
  },
  { id: "c18", type: "voice_stop", payload: {} },
  { id: "c19", type: "tts_speak", payload: { text: "hello" } },
  { id: "c20", type: "tts_stop", payload: {} },
  { id: "c21", type: "diff_response", payload: { sessionId: "ses_1", path: "README.md", approve: true } },
  {
    id: "c22",
    type: "upsert_provider_config",
    payload: {
      providerId: "grok",
      label: "Grok",
      baseUrl: "https://api.x.ai/v1",
      authMode: "keychain",
      settings: {},
    },
  },
  {
    id: "c23",
    type: "upsert_voice_profile",
    payload: {
      name: "Babu",
      wakeWord: "babu",
      sttProvider: "openai",
      ttsProvider: "browser",
      voiceId: null,
      speed: 1,
      language: "en",
      personaPrompt: "",
      verbosity: "summary",
      interruptOnSpeech: true,
      isDefault: true,
    },
  },
  { id: "c24", type: "pair_relay", payload: { relayUrl: "ws://127.0.0.1:7430", code: "ABCDEFGH" } },
  { id: "c25", type: "estimate_prompt", payload: { text: "please refactor this module" } },
  { id: "c25b", type: "estimate_run", payload: { sessionId: "ses_1", text: "please refactor this module" } },
  { id: "c25c", type: "get_spend", payload: { scope: "global", window: "day", groupBy: "provider" } },
  {
    id: "c25d",
    type: "set_budget",
    payload: {
      scope: "global",
      scopeId: null,
      window: "day",
      limitUsdMicros: 5_000_000,
      limitTokens: null,
      action: "hard_stop",
      enabled: true,
    },
  },
  { id: "c25e", type: "delete_budget", payload: { budgetId: "bud_1" } },
  {
    id: "c25f",
    type: "budget_response",
    payload: { requestId: "br_1", decision: "allow_once" },
  },
  {
    id: "c26",
    type: "watch_folder",
    payload: { workspaceId: "ws_1", absPath: "/home/aksingh/inbox" },
  },
  {
    id: "c26b",
    type: "watch_folder",
    payload: { workspaceId: "ws_1", absPath: "~/xyz" },
  },
  {
    id: "c27",
    type: "unwatch_folder",
    payload: { workspaceId: "ws_1", absPath: "/home/aksingh/inbox" },
  },
  {
    id: "c28",
    type: "link_repository",
    payload: { workspaceId: "ws_1", remoteUrl: "https://github.com/acme/app.git", forge: "github" },
  },
];

const emptyState = {
  workspaces: [workspace],
  sessions: [session],
  events: [
    {
      id: "ev_1",
      sessionId: "ses_1",
      seq: 0,
      kind: "user_message",
      role: "user" as const,
      payload: { kind: "user_message" as const, text: "hello" },
      createdAt: NOW,
    },
  ],
  runs: [
    {
      id: "run_1",
      sessionId: "ses_1",
      status: "ok" as const,
      startedAt: NOW,
      endedAt: NOW,
      error: null,
    },
  ],
  providerConfigs: [
    {
      id: "pc_1",
      providerId: "echo",
      label: "Echo",
      baseUrl: null,
      authMode: "none" as const,
      settings: {},
    },
  ],
  voiceProfiles: [
    {
      id: "vp_1",
      name: "Babu",
      wakeWord: null,
      sttProvider: "whisper_cpp",
      ttsProvider: "piper",
      voiceId: null,
      speed: 1,
      language: "en",
      personaPrompt: "",
      verbosity: "summary" as const,
      interruptOnSpeech: true,
      isDefault: true,
    },
  ],
  settings: [{ key: "theme", value: "dark" }],
  folderWatches: [],
  budgets: [],
  protocolVersion: 2 as const,
  spendSummary: {
    generatedAt: NOW,
    today: { tokens: 0, costUsdMicros: null },
    month: { tokens: 0, costUsdMicros: null },
    unpricedModels: [],
    catalogStale: false,
    byWorkspace: [],
  },
};

const serverMessages: ServerMessage[] = [
  { id: "c1", type: "state", payload: emptyState },
  { id: "c3", type: "workspace_created", payload: workspace },
  { id: "c7", type: "session_created", payload: session },
  { id: "s1", type: "run_started", payload: { runId: "run_1", sessionId: "ses_1" } },
  {
    id: "s2",
    type: "agent_event",
    payload: {
      sessionId: "ses_1",
      runId: "run_1",
      seq: 1,
      event: { kind: "text", text: "You said: hello" },
    },
  },
  {
    id: "s3",
    type: "run_finished",
    payload: { runId: "run_1", sessionId: "ses_1", status: "ok" },
  },
  {
    id: "s4",
    type: "permission_request",
    payload: {
      requestId: "p1",
      sessionId: "ses_1",
      runId: "run_1",
      action: "write_file",
      detail: { path: "a.ts" },
    },
  },
  {
    id: "s5",
    type: "models",
    payload: { providerId: "echo", costModel: "local", models: [{ id: "echo-v1", label: "Echo v1" }] },
  },
  {
    id: "s6",
    type: "provider_health",
    payload: { providerId: "echo", ok: true, detail: "echo is always healthy" },
  },
  {
    id: "s7",
    type: "fs_listing",
    payload: {
      path: "/home/aksingh",
      entries: [{ name: "AgentDeck", path: "/home/aksingh/AgentDeck", kind: "dir" }],
    },
  },
  {
    id: "s8",
    type: "file_content",
    payload: {
      workspaceId: "ws_1",
      path: "src/index.ts",
      content: "export {}",
      encoding: "utf8",
      truncated: false,
    },
  },
  { id: "s9", type: "transcript_partial", payload: { text: "hel" } },
  { id: "s10", type: "transcript_final", payload: { text: "hello" } },
  {
    id: "s11",
    type: "tts_audio_chunk",
    payload: { pcm16Base64: "AA==", sampleRate: 16000 },
  },
  { id: "s12", type: "error", payload: { message: "unauthorized", code: "auth" } },
  {
    id: "s13",
    type: "relay_status",
    payload: { connected: true, relayUrl: "ws://127.0.0.1:7430", code: "ABCDEFGH" },
  },
  {
    id: "s14",
    type: "prompt_estimate",
    payload: {
      tokens: 12,
      compactText: "refactor module",
      compactTokens: 4,
      savedTokens: 8,
      notes: ["removed filler"],
    },
  },
  {
    id: "s15",
    type: "sync_event",
    payload: {
      workspaceId: "ws_1",
      sourcePath: "/home/aksingh/inbox/a.ts",
      destPath: ".inbox/a.ts",
      action: "added",
    },
  },
  {
    id: "s16",
    type: "spend_update",
    payload: {
      runId: "run_1",
      sessionId: "ses_1",
      workspaceId: "ws_1",
      tokens: { input: 10, output: 4, cacheRead: 0, cacheWrite: 0 },
      costUsdMicros: null,
      costModel: "local",
      source: "estimated",
      level: "info",
      budgets: [],
    },
  },
  {
    id: "s17",
    type: "budget_request",
    payload: {
      requestId: "br_1",
      runId: "run_1",
      sessionId: "ses_1",
      budget: {
        budgetId: "bud_1",
        scope: "global",
        window: "day",
        spent: 10,
        limit: 10,
        pct: 100,
        action: "ask",
        unit: "tokens",
      },
    },
  },
  {
    id: "s18",
    type: "budget_exceeded",
    payload: {
      runId: "run_1",
      sessionId: "ses_1",
      budget: {
        budgetId: "bud_1",
        scope: "global",
        window: "day",
        spent: 11,
        limit: 10,
        pct: 110,
        action: "hard_stop",
        unit: "tokens",
      },
      outcome: "stopped",
    },
  },
  {
    id: "s19",
    type: "spend_report",
    payload: {
      rows: [
        {
          groupKey: "echo",
          inputTokens: 10,
          outputTokens: 4,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          costUsdMicros: null,
        },
      ],
      totals: {
        groupKey: "totals",
        inputTokens: 10,
        outputTokens: 4,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        costUsdMicros: null,
      },
      generatedAt: NOW,
      unpricedModels: ["echo-v1"],
    },
  },
  {
    id: "s20",
    type: "run_estimate",
    payload: {
      sessionId: "ses_1",
      tokens: 8,
      compactText: "refactor module",
      compactTokens: 4,
      savedTokens: 4,
      notes: ["removed filler"],
      costUsdMicros: null,
      costModel: "local",
      unpriced: true,
      budgets: [],
    },
  },
];

type AssertTrue<T extends true> = T;
type _ClientFixturesCoverAll = AssertTrue<
  Exclude<ClientMessageType, (typeof clientMessages)[number]["type"]> extends never ? true : false
>;
type _ServerFixturesCoverAll = AssertTrue<
  Exclude<ServerMessageType, (typeof serverMessages)[number]["type"]> extends never ? true : false
>;
const _clientFixturesCoverAll: _ClientFixturesCoverAll = true;
const _serverFixturesCoverAll: _ServerFixturesCoverAll = true;

describe("AgentEventSchema", () => {
  test("parses every variant", () => {
    expect(_clientFixturesCoverAll).toBe(true);
    expect(_serverFixturesCoverAll).toBe(true);
    for (const event of agentEvents) {
      expect(AgentEventSchema.parse(event)).toEqual(event);
    }
  });

  test("migrates legacy usage events", () => {
    expect(AgentEventSchema.parse({ kind: "usage", tokensIn: 1, tokensOut: 2 })).toEqual({
      kind: "usage",
      inputTokens: 1,
      outputTokens: 2,
      cacheReadTokens: null,
      cacheWriteTokens: null,
      source: "provider_usage",
    });
  });

  test("rejects unknown kind", () => {
    expect(() => AgentEventSchema.parse({ kind: "nope" })).toThrow();
  });

  test("rejects extra keys", () => {
    expect(() =>
      AgentEventSchema.parse({ kind: "text", text: "hi", extra: true }),
    ).toThrow();
  });
});

describe("ClientMessageSchema", () => {
  test("parses every client type", () => {
    for (const message of clientMessages) {
      expect(ClientMessageSchema.parse(message)).toEqual(message);
    }
  });

  test("rejects a relative workspace path", () => {
    expect(() =>
      ClientMessageSchema.parse({
        id: "x",
        type: "create_workspace",
        payload: { name: "x", absPath: "relative/path" },
      }),
    ).toThrow();
  });

  test("rejects path traversal in read_file", () => {
    expect(() =>
      ClientMessageSchema.parse({
        id: "x",
        type: "read_file",
        payload: { workspaceId: "ws_1", path: "../etc/passwd" },
      }),
    ).toThrow();
  });
});

describe("ServerMessageSchema", () => {
  test("parses every server type", () => {
    for (const message of serverMessages) {
      expect(ServerMessageSchema.parse(message)).toEqual(message);
    }
  });
});

describe("parse helpers", () => {
  test("parseEnvelope accepts a raw frame", () => {
    expect(parseEnvelope({ id: "1", type: "hello", payload: { token: "x" } })).toEqual({
      id: "1",
      type: "hello",
      payload: { token: "x" },
    });
  });

  test("parseClientMessage throws ProtocolError", () => {
    try {
      parseClientMessage({ id: "1", type: "hello", payload: {} });
      throw new Error("expected parse to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ProtocolError);
    }
  });

  test("parseServerMessage accepts state", () => {
    const parsed = parseServerMessage(serverMessages[0]);
    expect(parsed.type).toBe("state");
  });

  test("hello still parses an older protocolVersion so the runner can reject it with a typed error", () => {
    const parsed = ClientMessageSchema.parse({
      id: "old",
      type: "hello",
      payload: { token: "secret", clientVersion: "0.0.1", protocolVersion: 1 },
    });
    expect(parsed.type).toBe("hello");
    if (parsed.type !== "hello") {
      throw new Error("expected hello");
    }
    expect(parsed.payload.protocolVersion).toBe(1);
  });
});
