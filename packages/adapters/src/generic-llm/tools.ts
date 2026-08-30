import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { which } from "../cli/which.ts";
import { formatMissingPath, resolveRequestedPath } from "../path-suggest.ts";
import { listWorkspaceDir, readWorkspaceFile, SandboxError } from "../sandbox.ts";
import type { GateResult, ToolName } from "../tool-gate.ts";
import type { ApplyPatchArgs, ListDirArgs, ReadFileArgs, RipgrepSearchArgs, WebSearchArgs, WriteFileArgs } from "../tool-gate.ts";
import { buildUnifiedDiff, pathsFromPatch } from "../unified-diff.ts";
import { ApprovedChange, commitToWorkspace, commitToWorkspaceAcknowledged, StagedChange, type SizeDeltaWarning } from "../workspace-write.ts";
import { ApprovedShellCommand, executeApprovedShell } from "../shell-execute.ts";

export const MAX_TOOL_OUTPUT = 32_000;
export const MAX_FILE_BYTES = 256_000;
export const MAX_TURNS = 16;

export type ToolFileDiff = {
  path: string;
  patch: string;
  added: number;
  removed: number;
  staged?: boolean;
  newContent?: string;
  oldContent?: string;
};

export type ToolExecutionResult = {
  ok: boolean;
  output: unknown;
  summary: string;
  fileDiff?: ToolFileDiff;
  sizeDeltaWarning?: SizeDeltaWarning;
};

export type MutationPolicy = "stage-only" | "commit-immediate";

function readExistingFile(cwd: string, path: string): string {
  try {
    return readWorkspaceFile(cwd, path, MAX_FILE_BYTES);
  } catch {
    return "";
  }
}

function stagedFileDiff(staged: StagedChange, stagedFlag: boolean): ToolFileDiff {
  return {
    path: staged.path,
    patch: staged.patch,
    added: staged.added,
    removed: staged.removed,
    ...(stagedFlag
      ? { staged: true as const, newContent: staged.newContent, oldContent: staged.oldContent }
      : {}),
  };
}

function copyTreeFile(srcRoot: string, destRoot: string, relativePath: string): void {
  const src = join(srcRoot, relativePath);
  if (!existsSync(src)) {
    return;
  }
  const dest = join(destRoot, relativePath);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
}

function buildStagedFromPatch(
  cwd: string,
  patch: string,
): ToolExecutionResult | { ok: true; staged: StagedChange } {
  const paths = pathsFromPatch(patch);
  if (paths.length === 0) {
    return {
      ok: false,
      output: "Cannot apply patch: patch has no ---/+++ file headers",
      summary: "patch missing file headers",
    };
  }
  const primaryPath = paths[0]!;
  const tempDir = mkdtempSync(join(tmpdir(), "purser-stage-patch-"));
  try {
    for (const path of paths) {
      copyTreeFile(cwd, tempDir, path);
    }
    const patchPath = join(tempDir, "purser.patch");
    writeFileSync(patchPath, patch);
    const git = which("git");
    if (git === null) {
      return {
        ok: false,
        output: "git is not on PATH for the Purser process. Install git, then retry.",
        summary: "git missing",
      };
    }
    const result = spawnSync(git, ["apply", "--unsafe-paths", patchPath], { cwd: tempDir, encoding: "utf8" });
    if (result.status !== 0) {
      return {
        ok: false,
        output: result.stderr || result.stdout || "git apply failed",
        summary: "apply patch failed",
      };
    }
    const oldContent = readExistingFile(cwd, primaryPath);
    const newContent = readFileSync(join(tempDir, primaryPath), "utf8");
    const diff = buildUnifiedDiff(primaryPath, oldContent, newContent);
    return {
      ok: true,
      staged: StagedChange.create({ path: primaryPath, newContent, oldContent, ...diff }),
    };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function commitStaged(staged: StagedChange, cwd: string, summaryVerb: string): ToolExecutionResult {
  const approved = ApprovedChange.fromImmediate(staged);
  const commit = commitToWorkspace(approved, cwd);
  if (commit.status === "size_delta_warning") {
    return {
      ok: true,
      output: commit.warning.message,
      summary: commit.warning.message,
      fileDiff: stagedFileDiff(staged, false),
      sizeDeltaWarning: commit.warning,
    };
  }
  return {
    ok: true,
    output: `${summaryVerb} ${staged.path}`,
    summary: `${summaryVerb} ${staged.path}`,
    fileDiff: stagedFileDiff(staged, false),
  };
}

export type { ToolName };

export const TOOL_DEFINITIONS = [
  {
    type: "function" as const,
    function: {
      name: "read_file",
      description: "Read a file inside the workspace.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "write_file",
      description: "Write a text file inside the workspace.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" }, content: { type: "string" } },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "apply_patch",
      description: "Apply a unified diff patch inside the workspace using git apply.",
      parameters: {
        type: "object",
        properties: { patch: { type: "string" } },
        required: ["patch"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_dir",
      description: "List a directory inside the workspace.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "ripgrep_search",
      description: "Search file contents with ripgrep (rg) inside the workspace.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" }, glob: { type: "string" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "run_bash",
      description: "Run a bash command with cwd set to the workspace root.",
      parameters: {
        type: "object",
        properties: { command: { type: "string" } },
        required: ["command"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "web_search",
      description: "Search the web. Uses Perplexity when a key is configured.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    },
  },
];

function cap(text: string): string {
  if (text.length <= MAX_TOOL_OUTPUT) {
    return text;
  }
  return `${text.slice(0, MAX_TOOL_OUTPUT)}\n…truncated`;
}

type RipgrepFailure =
  | "empty_query"
  | "rg_not_on_path"
  | "rg_spawn_failed"
  | "rg_regex_error"
  | "rg_glob_error"
  | "rg_exit_error";

function ripgrepFailureMessage(cause: RipgrepFailure, detail: string): string {
  switch (cause) {
    case "empty_query":
      return "Cause: empty query — ripgrep_search needs a non-empty query.";
    case "rg_not_on_path":
      return `Cause: rg not on PATH for the Purser process. ${detail}`;
    case "rg_spawn_failed":
      return `Cause: rg spawn failed. ${detail}`;
    case "rg_regex_error":
      return `Cause: invalid regex pattern. ${detail}`;
    case "rg_glob_error":
      return `Cause: invalid glob pattern. ${detail}`;
    case "rg_exit_error":
      return `Cause: rg exited with an error. ${detail}`;
  }
}

function classifyRipgrepStderr(stderr: string): RipgrepFailure {
  if (/regex parse error/i.test(stderr)) {
    return "rg_regex_error";
  }
  if (/parsing glob/i.test(stderr)) {
    return "rg_glob_error";
  }
  return "rg_exit_error";
}

function ripgrepSearch(
  cwd: string,
  query: string,
  glob: string,
): { ok: boolean; output: unknown; summary: string } {
  if (query.length === 0) {
    return {
      ok: false,
      output: ripgrepFailureMessage("empty_query", ""),
      summary: "Cause: empty query",
    };
  }
  const rg = which("rg");
  if (rg === null) {
    const pathHint = (process.env.PATH ?? "").split(":").slice(0, 4).join(":");
    return {
      ok: false,
      output: ripgrepFailureMessage(
        "rg_not_on_path",
        `Install ripgrep (https://github.com/BurntSushi/ripgrep) or restart Purser from a shell where \`command -v rg\` succeeds. PATH starts with: ${pathHint || "(empty)"}`,
      ),
      summary: "Cause: rg not on PATH",
    };
  }
  const args = ["--color", "never", "-n"];
  if (glob.length > 0) {
    args.push("-g", glob);
  }
  args.push("--", query, ".");
  const result = spawnSync(rg, args, { cwd, encoding: "utf8", env: process.env });
  if (result.error !== undefined) {
    const code = "code" in result.error ? String((result.error as NodeJS.ErrnoException).code ?? "") : "";
    if (code === "ENOENT") {
      return {
        ok: false,
        output: ripgrepFailureMessage(
          "rg_spawn_failed",
          `Binary was resolved at ${rg} but could not be executed (${result.error.message}).`,
        ),
        summary: "Cause: rg spawn failed",
      };
    }
    return {
      ok: false,
      output: ripgrepFailureMessage("rg_spawn_failed", result.error.message),
      summary: "Cause: rg spawn failed",
    };
  }
  if (result.status === 0 || result.status === 1) {
    const text = (result.stdout ?? "").trim();
    return {
      ok: true,
      output: text.length > 0 ? cap(text) : "No matches.",
      summary: `searched ${query}`,
    };
  }
  const detail = (result.stderr || result.stdout || `exit ${result.status}`).trim();
  const cause = classifyRipgrepStderr(detail);
  return {
    ok: false,
    output: ripgrepFailureMessage(cause, detail),
    summary: `Cause: ${cause === "rg_regex_error" ? "invalid regex" : cause === "rg_glob_error" ? "invalid glob" : "rg error"}`,
  };
}

/** Sole executor entry for hosted tools — requires a gate pass; never accepts unvalidated args. */
type GatedPass = Extract<GateResult, { ok: true }>;
type NonShellGatedPass = Extract<GatedPass, { name: Exclude<ToolName, "run_bash"> }>;
type ShellGatedPass = Extract<GatedPass, { name: "run_bash" }>;

type RunGatedToolBase = {
  cwd: string;
  mutationPolicy: MutationPolicy;
  webSearch?: (query: string) => Promise<string>;
};

export type RunGatedToolInput =
  | (RunGatedToolBase & { gate: ShellGatedPass; approvedShell: ApprovedShellCommand })
  | (RunGatedToolBase & { gate: NonShellGatedPass });

export async function runGatedTool(
  input: RunGatedToolBase & { gate: ShellGatedPass; approvedShell: ApprovedShellCommand },
): Promise<ToolExecutionResult>;
export async function runGatedTool(
  input: RunGatedToolBase & { gate: NonShellGatedPass },
): Promise<ToolExecutionResult>;
export async function runGatedTool(input: RunGatedToolInput): Promise<ToolExecutionResult> {
  const gate: GatedPass = input.gate;
  try {
    switch (gate.name) {
      case "read_file": {
        const args = gate.args as ReadFileArgs;
        const resolved = resolveRequestedPath(input.cwd, args.path);
        if (resolved.kind === "missing") {
          const message = formatMissingPath(args.path, resolved.suggestions);
          return { ok: false, output: message, summary: message };
        }
        const output = readWorkspaceFile(input.cwd, resolved.path, MAX_FILE_BYTES);
        const summary =
          resolved.kind === "resolved" ? `read ${resolved.path} (resolved from ${args.path})` : `read ${resolved.path}`;
        return { ok: true, output, summary };
      }
      case "write_file": {
        const args = gate.args as WriteFileArgs;
        const oldContent = readExistingFile(input.cwd, args.path);
        const diff = buildUnifiedDiff(args.path, oldContent, args.content);
        const staged = StagedChange.create({
          path: args.path,
          newContent: args.content,
          oldContent,
          ...diff,
        });
        if (input.mutationPolicy === "stage-only") {
          return {
            ok: true,
            output: `staged write to ${args.path}`,
            summary: `staged ${args.path}`,
            fileDiff: stagedFileDiff(staged, true),
          };
        }
        return commitStaged(staged, input.cwd, "wrote");
      }
      case "apply_patch": {
        const args = gate.args as ApplyPatchArgs;
        const built = buildStagedFromPatch(input.cwd, args.patch);
        if (!("staged" in built)) {
          return built;
        }
        if (input.mutationPolicy === "stage-only") {
          return {
            ok: true,
            output: `staged patch for ${built.staged.path}`,
            summary: `staged ${built.staged.path}`,
            fileDiff: stagedFileDiff(built.staged, true),
          };
        }
        return commitStaged(built.staged, input.cwd, "applied patch for");
      }
      case "list_dir": {
        const args = gate.args as ListDirArgs;
        const asked = args.path.length > 0 ? args.path : ".";
        try {
          const output = listWorkspaceDir(input.cwd, asked);
          return { ok: true, output, summary: `listed ${asked}` };
        } catch (error) {
          if (!(error instanceof SandboxError) && !(error instanceof Error)) {
            throw error;
          }
          const message = error.message;
          if (/ENOENT|no such file/i.test(message)) {
            const resolved = resolveRequestedPath(input.cwd, asked);
            if (resolved.kind === "missing") {
              const tip = formatMissingPath(asked, resolved.suggestions);
              return { ok: false, output: tip, summary: tip };
            }
          }
          throw error;
        }
      }
      case "ripgrep_search": {
        const args = gate.args as RipgrepSearchArgs;
        return ripgrepSearch(input.cwd, args.query, args.glob ?? "");
      }
      case "run_bash": {
        return executeApprovedShell(
          (input as RunGatedToolBase & { gate: ShellGatedPass; approvedShell: ApprovedShellCommand }).approvedShell,
          input.cwd,
        );
      }
      case "web_search": {
        const args = gate.args as WebSearchArgs;
        const output = input.webSearch ? await input.webSearch(args.query) : "web_search is not configured";
        return { ok: true, output, summary: `searched the web for ${args.query}` };
      }
    }
  } catch (error) {
    const message = error instanceof SandboxError || error instanceof Error ? error.message : "tool failed";
    return { ok: false, output: message, summary: message };
  }
}

export function toolSummary(name: string, args: unknown): string {
  if (typeof args !== "object" || args === null || Array.isArray(args)) {
    return name;
  }
  const record = args as Record<string, unknown>;
  if (name === "read_file" && typeof record.path === "string") return `read ${record.path}`;
  if (name === "write_file" && typeof record.path === "string") return `wrote ${record.path}`;
  if (name === "list_dir" && typeof record.path === "string") return `listed ${record.path || "."}`;
  if (name === "run_bash" && typeof record.command === "string") return `ran ${record.command.slice(0, 80)}`;
  if (name === "ripgrep_search" && typeof record.query === "string") return `searched ${record.query}`;
  if (name === "web_search" && typeof record.query === "string") return `searched the web for ${record.query}`;
  if (name === "apply_patch") return "applied patch";
  return name;
}

export { commitToWorkspaceAcknowledged };
