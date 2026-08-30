import type { ShellCardSeverity, ShellClassification } from "./shell-classify.ts";
import { shellCardSeverity } from "./shell-classify.ts";

export type ApprovableShellClassification = Exclude<ShellClassification, { kind: "refused" }>;

export type ShellPermissionDetail = {
  kind: "shell";
  command: string;
  severity: ShellCardSeverity;
  effect: string;
  undoAvailable?: boolean;
  undoNote?: string;
  restorePointId?: string;
};

export function isShellPermissionDetail(detail: unknown): detail is ShellPermissionDetail {
  return (
    detail !== null &&
    typeof detail === "object" &&
    !Array.isArray(detail) &&
    (detail as { kind?: unknown }).kind === "shell" &&
    typeof (detail as { command?: unknown }).command === "string" &&
    typeof (detail as { effect?: unknown }).effect === "string"
  );
}

export function shellPermissionDetail(input: {
  command: string;
  classification: ApprovableShellClassification;
  undoAvailable?: boolean;
  undoNote?: string;
  restorePointId?: string;
}): ShellPermissionDetail {
  return {
    kind: "shell",
    command: input.command,
    severity: shellCardSeverity(input.classification),
    effect: input.classification.effect,
    undoAvailable: input.undoAvailable,
    undoNote: input.undoNote,
    restorePointId: input.restorePointId,
  };
}

export function shellCardTitle(detail: ShellPermissionDetail): string {
  if (detail.severity === "read_only") {
    return "Allow run_bash?";
  }
  if (detail.severity === "network") {
    return "run_bash will contact the network";
  }
  return `run_bash will modify your workspace`;
}
