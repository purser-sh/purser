import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { resolveInRoot, SandboxError } from "./sandbox.ts";

export class StagedChange {
  private constructor(
    readonly path: string,
    readonly newContent: string,
    readonly oldContent: string,
    readonly patch: string,
    readonly added: number,
    readonly removed: number,
  ) {}

  static create(input: {
    path: string;
    newContent: string;
    oldContent: string;
    patch: string;
    added: number;
    removed: number;
  }): StagedChange {
    return new StagedChange(input.path, input.newContent, input.oldContent, input.patch, input.added, input.removed);
  }

  priorBytes(): number {
    return Buffer.byteLength(this.oldContent, "utf8");
  }

  newBytes(): number {
    return Buffer.byteLength(this.newContent, "utf8");
  }
}

export type Approve = { kind: "approve" };

/** Only obtainable through explicit approval or auto_edit/bypass permission minting. */
export class ApprovedChange {
  private constructor(
    readonly path: string,
    readonly content: string,
    readonly priorBytes: number,
  ) {}

  /** auto_edit and bypass: permission step mints approval to write immediately. */
  static fromImmediate(staged: StagedChange): ApprovedChange {
    return new ApprovedChange(staged.path, staged.newContent, staged.priorBytes());
  }

  /** User clicked Approve on a diff card. */
  static fromApproval(staged: StagedChange, _decision: Approve): ApprovedChange {
    return new ApprovedChange(staged.path, staged.newContent, staged.priorBytes());
  }
}

export type SizeDeltaWarning = {
  severity: "high";
  message: string;
  priorBytes: number;
  newBytes: number;
};

export function checkSizeDelta(priorBytes: number, newBytes: number): SizeDeltaWarning | null {
  if (priorBytes > 0 && newBytes === 0) {
    return {
      severity: "high",
      message: `This will replace ${priorBytes.toLocaleString()} bytes with 0.`,
      priorBytes,
      newBytes,
    };
  }
  if (priorBytes > 0 && newBytes < priorBytes * 0.1) {
    return {
      severity: "high",
      message: `This will replace ${priorBytes.toLocaleString()} bytes with ${newBytes.toLocaleString()}.`,
      priorBytes,
      newBytes,
    };
  }
  return null;
}

export type CommitResult =
  | { status: "committed" }
  | { status: "size_delta_warning"; warning: SizeDeltaWarning; change: ApprovedChange };

function writeWorkspacePath(root: string, relativePath: string, content: string): void {
  const target = resolveInRoot(root, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content, "utf8");
}

/** The only function that writes file content into a user workspace root. */
export function commitToWorkspace(change: ApprovedChange, root: string): CommitResult {
  const newBytes = Buffer.byteLength(change.content, "utf8");
  const warning = checkSizeDelta(change.priorBytes, newBytes);
  if (warning !== null) {
    return { status: "size_delta_warning", warning, change };
  }
  writeWorkspacePath(root, change.path, change.content);
  return { status: "committed" };
}

/** Write after the user acknowledged a size-delta warning card. */
export function commitToWorkspaceAcknowledged(change: ApprovedChange, root: string): void {
  writeWorkspacePath(root, change.path, change.content);
}

export { SandboxError };
