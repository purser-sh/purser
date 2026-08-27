import type {
  BudgetRequestPayload,
  CostModel,
  ModelInfo,
  PermissionMode,
  PermissionRequestPayload,
  ProviderHealthPayload,
  RelayStatusPayload,
  Run,
  ServerMessage,
  Session,
  SpendSummary,
  SpendUpdatePayload,
  StatePayload,
  StoredEvent,
  SyncEventPayload,
  Workspace,
} from "@purser-sh/protocol";
import { PROTOCOL_VERSION } from "@purser-sh/protocol";
import { create } from "zustand";
import { useToastStore } from "@/lib/toast";

export type ConnectionStatus = "idle" | "connecting" | "ready" | "error";
export type RightPanelTab = "spend" | "files" | "setup";

type DeckStore = StatePayload & {
  connection: ConnectionStatus;
  connectionDetail: string | null;
  selectedWorkspaceId: string | null;
  selectedSessionId: string | null;
  rightPanelTab: RightPanelTab;
  commandPaletteOpen: boolean;
  liveText: Record<string, string>;
  search: string;
  modelsByProvider: Record<string, ModelInfo[]>;
  costModelByProvider: Record<string, CostModel>;
  healthByProvider: Record<string, ProviderHealthPayload>;
  pendingPermissions: PermissionRequestPayload[];
  pendingBudgets: BudgetRequestPayload[];
  lastSpendBySession: Record<string, SpendUpdatePayload>;
  relayStatus: RelayStatusPayload | null;
  transcriptPartial: string;
  transcriptFinal: string;
  lastSyncEvent: SyncEventPayload | null;
  voiceActive: boolean;
  setSearch: (value: string) => void;
  setRightPanelTab: (tab: RightPanelTab) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setConnection: (status: ConnectionStatus, detail?: string) => void;
  applyState: (state: StatePayload) => void;
  applyServerMessage: (message: ServerMessage) => void;
  selectWorkspace: (id: string | null) => void;
  selectSession: (id: string | null) => void;
  setVoiceActive: (active: boolean) => void;
  clearPermission: (requestId: string) => void;
  clearBudget: (requestId: string) => void;
};

const SELECTION_KEY = "purser.selection";

function readStoredSelection(): { workspaceId: string | null; sessionId: string | null } {
  try {
    const raw = localStorage.getItem(SELECTION_KEY);
    if (raw === null) {
      return { workspaceId: null, sessionId: null };
    }
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { workspaceId: null, sessionId: null };
    }
    const record = parsed as Record<string, unknown>;
    return {
      workspaceId: typeof record.workspaceId === "string" ? record.workspaceId : null,
      sessionId: typeof record.sessionId === "string" ? record.sessionId : null,
    };
  } catch {
    return { workspaceId: null, sessionId: null };
  }
}

function writeStoredSelection(workspaceId: string | null, sessionId: string | null): void {
  try {
    localStorage.setItem(SELECTION_KEY, JSON.stringify({ workspaceId, sessionId }));
  } catch {
    // private mode — selection just will not survive a reload
  }
}

function selectAfterState(state: StatePayload, currentWorkspaceId: string | null, currentSessionId: string | null) {
  const stored = readStoredSelection();
  const preferredWorkspace = currentWorkspaceId ?? stored.workspaceId;
  const preferredSession = currentSessionId ?? stored.sessionId;
  const workspaceId =
    preferredWorkspace !== null && state.workspaces.some((workspace) => workspace.id === preferredWorkspace)
      ? preferredWorkspace
      : (state.workspaces[0]?.id ?? null);
  const sessions = state.sessions.filter((session) => session.workspaceId === workspaceId);
  const sessionId =
    preferredSession !== null && sessions.some((session) => session.id === preferredSession)
      ? preferredSession
      : (sessions[0]?.id ?? null);
  return { workspaceId, sessionId };
}

const emptySpendSummary: SpendSummary = {
  generatedAt: "1970-01-01T00:00:00.000Z",
  today: { tokens: 0, costUsdMicros: null },
  month: { tokens: 0, costUsdMicros: null },
  unpricedModels: [],
  catalogStale: false,
  byWorkspace: [],
};

export const useDeckStore = create<DeckStore>((set, get) => ({
  connection: "idle",
  connectionDetail: null,
  workspaces: [],
  sessions: [],
  events: [],
  runs: [],
  providerConfigs: [],
  voiceProfiles: [],
  settings: [],
  folderWatches: [],
  budgets: [],
  spendSummary: emptySpendSummary,
  protocolVersion: PROTOCOL_VERSION,
  selectedWorkspaceId: null,
  selectedSessionId: null,
  rightPanelTab: "spend",
  commandPaletteOpen: false,
  liveText: {},
  search: "",
  modelsByProvider: {},
  costModelByProvider: {},
  healthByProvider: {},
  pendingPermissions: [],
  pendingBudgets: [],
  lastSpendBySession: {},
  relayStatus: null,
  transcriptPartial: "",
  transcriptFinal: "",
  lastSyncEvent: null,
  voiceActive: false,
  setSearch: (value) => set({ search: value }),
  setRightPanelTab: (tab) => set({ rightPanelTab: tab }),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  setVoiceActive: (active) => set({ voiceActive: active }),
  clearPermission: (requestId) =>
    set({ pendingPermissions: get().pendingPermissions.filter((item) => item.requestId !== requestId) }),
  clearBudget: (requestId) =>
    set({ pendingBudgets: get().pendingBudgets.filter((item) => item.requestId !== requestId) }),
  setConnection: (status, detail) => set({ connection: status, connectionDetail: detail ?? null }),
  applyState: (state) => {
    const selected = selectAfterState(state, get().selectedWorkspaceId, get().selectedSessionId);
    writeStoredSelection(selected.workspaceId, selected.sessionId);
    set({
      ...state,
      selectedWorkspaceId: selected.workspaceId,
      selectedSessionId: selected.sessionId,
    });
  },
  selectWorkspace: (id) => {
    const sessions = get().sessions.filter((session) => session.workspaceId === id);
    const sessionId = sessions[0]?.id ?? null;
    writeStoredSelection(id, sessionId);
    set({ selectedWorkspaceId: id, selectedSessionId: sessionId });
  },
  selectSession: (id) => {
    const session = get().sessions.find((item) => item.id === id);
    writeStoredSelection(session?.workspaceId ?? get().selectedWorkspaceId, id);
    set({ selectedSessionId: id });
  },
  applyServerMessage: (message) => {
    const current = get();
    if (message.type === "state") {
      get().applyState(message.payload);
      return;
    }
    if (message.type === "workspace_created") {
      const workspaces = [...current.workspaces.filter((item) => item.id !== message.payload.id), message.payload];
      set({
        workspaces,
        selectedWorkspaceId: message.payload.id,
        selectedSessionId: null,
      });
      return;
    }
    if (message.type === "session_created") {
      const session = message.payload.session;
      if (message.payload.notice !== undefined) {
        useToastStore.getState().push(message.payload.notice, "block");
      }
      writeStoredSelection(session.workspaceId, session.id);
      set({
        sessions: [...current.sessions.filter((item) => item.id !== session.id), session],
        selectedWorkspaceId: session.workspaceId,
        selectedSessionId: session.id,
      });
      return;
    }
    if (message.type === "run_started") {
      const run: Run = {
        id: message.payload.runId,
        sessionId: message.payload.sessionId,
        status: "running",
        startedAt: new Date().toISOString(),
        endedAt: null,
        error: null,
      };
      set({
        runs: [...current.runs.filter((item) => item.id !== run.id), run],
        sessions: current.sessions.map((session) =>
          session.id === run.sessionId ? { ...session, status: "running" } : session,
        ),
      });
      return;
    }
    if (message.type === "run_finished") {
      set({
        runs: current.runs.map((run) =>
          run.id === message.payload.runId
            ? { ...run, status: message.payload.status, endedAt: new Date().toISOString() }
            : run,
        ),
        sessions: current.sessions.map((session) =>
          session.id === message.payload.sessionId ? { ...session, status: "idle" } : session,
        ),
        liveText: { ...current.liveText, [message.payload.sessionId]: "" },
      });
      return;
    }
    if (message.type === "permission_request") {
      set({
        pendingPermissions: [
          ...current.pendingPermissions.filter((item) => item.requestId !== message.payload.requestId),
          message.payload,
        ],
      });
      return;
    }
    if (message.type === "budget_request") {
      set({
        pendingBudgets: [
          ...current.pendingBudgets.filter((item) => item.requestId !== message.payload.requestId),
          message.payload,
        ],
      });
      return;
    }
    if (message.type === "spend_update") {
      set({
        lastSpendBySession: { ...current.lastSpendBySession, [message.payload.sessionId]: message.payload },
      });
      return;
    }
    if (message.type === "budget_exceeded" || message.type === "spend_report" || message.type === "run_estimate") {
      return;
    }
    if (message.type === "models") {
      set({
        modelsByProvider: { ...current.modelsByProvider, [message.payload.providerId]: message.payload.models },
        costModelByProvider: { ...current.costModelByProvider, [message.payload.providerId]: message.payload.costModel },
      });
      return;
    }
    if (message.type === "provider_health") {
      set({
        healthByProvider: { ...current.healthByProvider, [message.payload.providerId]: message.payload },
      });
      return;
    }
    if (message.type === "relay_status") {
      set({ relayStatus: message.payload });
      return;
    }
    if (message.type === "transcript_partial") {
      set({ transcriptPartial: message.payload.text });
      return;
    }
    if (message.type === "transcript_final") {
      const text = message.payload.text;
      if (text.startsWith("SPEAK:")) {
        const spoken = text.slice("SPEAK:".length);
        if (typeof window !== "undefined" && "speechSynthesis" in window) {
          const utterance = new SpeechSynthesisUtterance(spoken);
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(utterance);
        }
        return;
      }
      set({ transcriptFinal: text, transcriptPartial: "" });
      return;
    }
    if (message.type === "tts_audio_chunk") {
      void playPcm16(message.payload.pcm16Base64, message.payload.sampleRate);
      return;
    }
    if (message.type === "sync_event") {
      set({ lastSyncEvent: message.payload });
      return;
    }
    if (message.type === "prompt_estimate") {
      return;
    }
    if (message.type === "agent_event") {
      const event = message.payload.event;
      if (event.kind === "text_delta") {
        const prev = current.liveText[message.payload.sessionId] ?? "";
        set({ liveText: { ...current.liveText, [message.payload.sessionId]: prev + event.text } });
        return;
      }
      const liveText =
        event.kind === "text"
          ? { ...current.liveText, [message.payload.sessionId]: "" }
          : current.liveText;
      const stored: StoredEvent = {
        id: message.id,
        sessionId: message.payload.sessionId,
        seq: message.payload.seq,
        kind: event.kind,
        role: event.kind === "tool_call" || event.kind === "tool_result" ? "tool" : "assistant",
        payload: event,
        createdAt: new Date().toISOString(),
      };
      const already = current.events.some(
        (item) => item.sessionId === stored.sessionId && item.seq === stored.seq && item.kind === stored.kind,
      );
      const sessions = current.sessions.map((session) => {
        if (session.id !== message.payload.sessionId) {
          return session;
        }
        if (event.kind === "session_started") {
          return { ...session, providerSessionId: event.providerSessionId };
        }
        if (event.kind === "usage") {
          return {
            ...session,
            tokensIn: session.tokensIn + (event.inputTokens ?? 0),
            tokensOut: session.tokensOut + (event.outputTokens ?? 0),
          };
        }
        return session;
      });
      const pendingPermissions =
        event.kind === "permission_request"
          ? [
              ...current.pendingPermissions.filter((item) => item.requestId !== event.requestId),
              {
                requestId: event.requestId,
                sessionId: message.payload.sessionId,
                runId: message.payload.runId,
                action: event.action,
                detail: event.detail,
              },
            ]
          : current.pendingPermissions;
      set({
        events: already ? current.events : [...current.events, stored],
        sessions,
        liveText,
        pendingPermissions,
      });
    }
  },
}));

async function playPcm16(base64: string, sampleRate: number): Promise<void> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const samples = new Int16Array(bytes.buffer);
  const ctx = new AudioContext({ sampleRate });
  const buffer = ctx.createBuffer(1, samples.length, sampleRate);
  const channel = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i += 1) {
    channel[i] = (samples[i] ?? 0) / 32768;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start();
}

export function workspaceSessions(sessions: Session[], workspaceId: string | null): Session[] {
  return sessions.filter((session) => session.workspaceId === workspaceId);
}

export function sessionEvents(events: StoredEvent[], sessionId: string | null): StoredEvent[] {
  return events
    .filter((event) => event.sessionId === sessionId)
    .slice()
    .sort((a, b) => a.seq - b.seq);
}

export function selectedWorkspace(workspaces: Workspace[], id: string | null): Workspace | undefined {
  return workspaces.find((workspace) => workspace.id === id);
}

export function selectedSession(sessions: Session[], id: string | null): Session | undefined {
  return sessions.find((session) => session.id === id);
}

export const PERMISSION_MODES: { id: PermissionMode; label: string }[] = [
  { id: "ask", label: "Ask" },
  { id: "auto_edit", label: "Auto edit" },
  { id: "bypass", label: "Bypass" },
];
