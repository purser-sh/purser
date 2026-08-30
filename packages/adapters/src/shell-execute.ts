import { spawnSync } from "node:child_process";
import { which } from "./cli/which.ts";
import type { ApprovableShellClassification } from "./shell-permission.ts";

const MAX_TOOL_OUTPUT = 32_000;

/** Only obtainable through explicit approval or auto_edit/bypass for read-only commands. */
export class ApprovedShellCommand {
  private constructor(
    readonly command: string,
    readonly classification: ApprovableShellClassification,
  ) {}

  static fromApproval(command: string, classification: ApprovableShellClassification): ApprovedShellCommand {
    return new ApprovedShellCommand(command, classification);
  }

  /** auto_edit / bypass mint approval without a card click. */
  static fromImmediate(command: string, classification: ApprovableShellClassification): ApprovedShellCommand {
    return new ApprovedShellCommand(command, classification);
  }
}

function cap(text: string): string {
  if (text.length <= MAX_TOOL_OUTPUT) {
    return text;
  }
  return `${text.slice(0, MAX_TOOL_OUTPUT)}\n…truncated`;
}

/** The only function that executes shell commands in a workspace. */
export function executeApprovedShell(approved: ApprovedShellCommand, cwd: string): {
  ok: boolean;
  output: string;
  summary: string;
} {
  const bash = which("bash") ?? "bash";
  const result = spawnSync(bash, ["-lc", approved.command], {
    cwd,
    encoding: "utf8",
    timeout: 30_000,
    env: process.env,
  });
  const output = cap(`${result.stdout ?? ""}${result.stderr ?? ""}`);
  return {
    ok: result.status === 0,
    output,
    summary: approved.classification.kind === "read_only"
      ? `ran ${approved.command.slice(0, 80)}`
      : approved.classification.effect,
  };
}
