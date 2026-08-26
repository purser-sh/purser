import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listWorkspaceDir, readWorkspaceFile, SandboxError, writeWorkspaceFile } from "../sandbox.ts";

export const MAX_TOOL_OUTPUT = 32_000;
export const MAX_FILE_BYTES = 256_000;
export const MAX_TURNS = 16;

export type ToolName =
  | "read_file"
  | "write_file"
  | "apply_patch"
  | "list_dir"
  | "ripgrep_search"
  | "run_bash"
  | "web_search";

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

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export async function executeTool(input: {
  name: string;
  args: Record<string, unknown>;
  cwd: string;
  webSearch?: (query: string) => Promise<string>;
}): Promise<{ ok: boolean; output: unknown; summary: string }> {
  try {
    switch (input.name as ToolName) {
      case "read_file": {
        const path = str(input.args.path);
        const output = readWorkspaceFile(input.cwd, path, MAX_FILE_BYTES);
        return { ok: true, output, summary: `read ${path}` };
      }
      case "write_file": {
        const path = str(input.args.path);
        writeWorkspaceFile(input.cwd, path, str(input.args.content));
        return { ok: true, output: `wrote ${path}`, summary: `wrote ${path}` };
      }
      case "apply_patch": {
        const patchPath = join(tmpdir(), `purser-patch-${crypto.randomUUID()}.diff`);
        writeFileSync(patchPath, str(input.args.patch));
        const result = spawnSync("git", ["apply", "--unsafe-paths", patchPath], {
          cwd: input.cwd,
          encoding: "utf8",
        });
        if (result.status !== 0) {
          return { ok: false, output: result.stderr || result.stdout, summary: "apply patch failed" };
        }
        return { ok: true, output: "patch applied", summary: "applied patch" };
      }
      case "list_dir": {
        const path = str(input.args.path) || ".";
        const output = listWorkspaceDir(input.cwd, path);
        return { ok: true, output, summary: `listed ${path}` };
      }
      case "ripgrep_search": {
        const query = str(input.args.query);
        const glob = str(input.args.glob);
        const args = ["--color", "never", "-n", query];
        if (glob.length > 0) {
          args.push("-g", glob);
        }
        args.push(".");
        const result = spawnSync("rg", args, { cwd: input.cwd, encoding: "utf8" });
        return { ok: true, output: cap(result.stdout || result.stderr), summary: `searched ${query}` };
      }
      case "run_bash": {
        const command = str(input.args.command);
        const result = spawnSync("bash", ["-lc", command], {
          cwd: input.cwd,
          encoding: "utf8",
          timeout: 30_000,
        });
        const output = cap(`${result.stdout}${result.stderr}`);
        return { ok: result.status === 0, output, summary: `ran ${command.slice(0, 80)}` };
      }
      case "web_search": {
        const query = str(input.args.query);
        const output = input.webSearch ? await input.webSearch(query) : "web_search is not configured";
        return { ok: true, output, summary: `searched the web for ${query}` };
      }
      default:
        return { ok: false, output: `unknown tool ${input.name}`, summary: `unknown tool ${input.name}` };
    }
  } catch (error) {
    const message = error instanceof SandboxError || error instanceof Error ? error.message : "tool failed";
    return { ok: false, output: message, summary: message };
  }
}

export function toolSummary(name: string, args: Record<string, unknown>): string {
  if (name === "read_file") return `read ${str(args.path)}`;
  if (name === "write_file") return `wrote ${str(args.path)}`;
  if (name === "list_dir") return `listed ${str(args.path) || "."}`;
  if (name === "run_bash") return `ran ${str(args.command).slice(0, 80)}`;
  if (name === "ripgrep_search") return `searched ${str(args.query)}`;
  if (name === "web_search") return `searched the web for ${str(args.query)}`;
  if (name === "apply_patch") return "applied patch";
  return name;
}
