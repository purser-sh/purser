import type { Run, Session, StoredEvent } from "@purser-sh/protocol";
import type { BudgetRequestPayload, PermissionRequestPayload, ProviderHealthPayload } from "@purser-sh/protocol";
import { isBlocked } from "@/lib/readiness";

export type ConsoleRunState = "ready" | "running" | "waiting" | "stopped" | "blocked";

export function activeRunForSession(runs: Run[], sessionId: string): Run | undefined {
  return runs.find((run) => run.sessionId === sessionId && run.status === "running");
}

export function sessionHasPendingApproval(
  sessionId: string,
  events: StoredEvent[],
  pendingPermissions: PermissionRequestPayload[],
  pendingBudgets: BudgetRequestPayload[],
): boolean {
  if (pendingPermissions.some((item) => item.sessionId === sessionId)) {
    return true;
  }
  if (pendingBudgets.some((item) => item.sessionId === sessionId)) {
    return true;
  }
  return events.some(
    (event) =>
      event.sessionId === sessionId &&
      event.payload.kind === "file_diff" &&
      event.payload.staged === true,
  );
}

export function consoleRunState(input: {
  session: Session;
  health: ProviderHealthPayload | undefined;
  runs: Run[];
  events: StoredEvent[];
  pendingPermissions: PermissionRequestPayload[];
  pendingBudgets: BudgetRequestPayload[];
}): ConsoleRunState {
  if (isBlocked(input.health)) {
    return "blocked";
  }
  if (input.session.status === "running") {
    if (sessionHasPendingApproval(input.session.id, input.events, input.pendingPermissions, input.pendingBudgets)) {
      return "waiting";
    }
    return "running";
  }
  if (input.session.status === "error") {
    return "stopped";
  }
  return "ready";
}

export function consoleRunStateLabel(state: ConsoleRunState): string {
  switch (state) {
    case "ready":
      return "Ready";
    case "running":
      return "Running";
    case "waiting":
      return "Waiting for you";
    case "stopped":
      return "Stopped";
    case "blocked":
      return "Blocked";
  }
}
