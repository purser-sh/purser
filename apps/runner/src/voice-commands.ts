import type { VoiceProfile } from "@purser-sh/protocol";
import {
  getSession,
  insertSession,
  listRunningRuns,
  loadState,
  type AppDatabase,
} from "@purser-sh/db";

export type LocalCommand =
  | { kind: "stop" }
  | { kind: "cancel" }
  | { kind: "repeat" }
  | { kind: "volume"; delta: number }
  | { kind: "approve" }
  | { kind: "reject" }
  | { kind: "new_session" }
  | { kind: "switch_provider"; providerId: string }
  | { kind: "open_workspace" }
  | { kind: "whats_running" }
  | { kind: "read_last" }
  | { kind: "chat"; text: string };

export function parseLocalCommand(text: string): LocalCommand {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  if (lower === "stop") return { kind: "stop" };
  if (lower === "cancel") return { kind: "cancel" };
  if (lower === "repeat") return { kind: "repeat" };
  if (lower === "louder") return { kind: "volume", delta: 0.1 };
  if (lower === "quieter") return { kind: "volume", delta: -0.1 };
  if (lower === "approve") return { kind: "approve" };
  if (lower === "reject") return { kind: "reject" };
  if (lower === "new session") return { kind: "new_session" };
  if (lower.startsWith("switch provider ")) {
    return { kind: "switch_provider", providerId: trimmed.slice("switch provider ".length).trim() };
  }
  if (lower === "open workspace") return { kind: "open_workspace" };
  if (lower === "what's running" || lower === "whats running" || lower === "what is running") {
    return { kind: "whats_running" };
  }
  if (lower === "read last message") return { kind: "read_last" };
  return { kind: "chat", text: trimmed };
}

export function lastAssistantText(db: AppDatabase, sessionId: string): string {
  const events = loadState(db).events.filter((event) => event.sessionId === sessionId);
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const payload = events[i]?.payload;
    if (payload !== undefined && payload.kind === "text") {
      return payload.text;
    }
  }
  return "";
}

export function describeRunning(db: AppDatabase): string {
  const runs = listRunningRuns(db);
  if (runs.length === 0) {
    return "Nothing is running.";
  }
  return runs
    .map((run) => {
      const session = getSession(db, run.sessionId);
      return `${session?.title ?? run.sessionId} is running`;
    })
    .join(". ");
}

export function createVoiceSession(db: AppDatabase, workspaceId: string, profile: VoiceProfile | undefined) {
  return insertSession(db, {
    workspaceId,
    title: "Voice session",
    providerId: "echo",
    modelId: profile?.name ?? "echo-v1",
    permissionMode: "ask",
  });
}
