import type {
  PermissionMode,
  Run,
  ServerMessage,
  Session,
  StatePayload,
  StoredEvent,
  Workspace,
} from "@agentdeck/protocol";
import { create } from "zustand";

export type ConnectionStatus = "idle" | "connecting" | "ready" | "error";

type DeckStore = StatePayload & {
  connection: ConnectionStatus;
  connectionDetail: string | null;
  selectedWorkspaceId: string | null;
  selectedSessionId: string | null;
  liveText: Record<string, string>;
  search: string;
  setSearch: (value: string) => void;
  setConnection: (status: ConnectionStatus, detail?: string) => void;
  applyState: (state: StatePayload) => void;
  applyServerMessage: (message: ServerMessage) => void;
  selectWorkspace: (id: string | null) => void;
  selectSession: (id: string | null) => void;
};

function selectAfterState(state: StatePayload, currentWorkspaceId: string | null, currentSessionId: string | null) {
  const workspaceId =
    currentWorkspaceId !== null && state.workspaces.some((workspace) => workspace.id === currentWorkspaceId)
      ? currentWorkspaceId
      : (state.workspaces[0]?.id ?? null);
  const sessions = state.sessions.filter((session) => session.workspaceId === workspaceId);
  const sessionId =
    currentSessionId !== null && sessions.some((session) => session.id === currentSessionId)
      ? currentSessionId
      : (sessions[0]?.id ?? null);
  return { workspaceId, sessionId };
}

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
  selectedWorkspaceId: null,
  selectedSessionId: null,
  liveText: {},
  search: "",
  setSearch: (value) => set({ search: value }),
  setConnection: (status, detail) => set({ connection: status, connectionDetail: detail ?? null }),
  applyState: (state) => {
    const selected = selectAfterState(state, get().selectedWorkspaceId, get().selectedSessionId);
    set({
      ...state,
      selectedWorkspaceId: selected.workspaceId,
      selectedSessionId: selected.sessionId,
    });
  },
  selectWorkspace: (id) => {
    const sessions = get().sessions.filter((session) => session.workspaceId === id);
    set({ selectedWorkspaceId: id, selectedSessionId: sessions[0]?.id ?? null });
  },
  selectSession: (id) => set({ selectedSessionId: id }),
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
      set({
        sessions: [...current.sessions.filter((item) => item.id !== message.payload.id), message.payload],
        selectedWorkspaceId: message.payload.workspaceId,
        selectedSessionId: message.payload.id,
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
            tokensIn: session.tokensIn + event.tokensIn,
            tokensOut: session.tokensOut + event.tokensOut,
            costUsd: session.costUsd + (event.costUsd ?? 0),
          };
        }
        return session;
      });
      set({
        events: already ? current.events : [...current.events, stored],
        sessions,
        liveText,
      });
    }
  },
}));

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
