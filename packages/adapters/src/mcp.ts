import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type McpToolDef = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

type JsonRpc = {
  jsonrpc: "2.0";
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { message?: string };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

class McpProcess {
  private nextId = 1;
  private buf = Buffer.alloc(0);
  private pending = new Map<number, (value: JsonRpc) => void>();

  constructor(private readonly child: ChildProcessWithoutNullStreams) {
    child.stdout.on("data", (chunk: Buffer) => {
      this.buf = Buffer.concat([this.buf, chunk]);
      this.drain();
    });
  }

  private drain(): void {
    while (true) {
      const headerEnd = this.buf.indexOf("\r\n\r\n");
      if (headerEnd === -1) {
        return;
      }
      const header = this.buf.subarray(0, headerEnd).toString("utf8");
      const match = /Content-Length:\s*(\d+)/i.exec(header);
      if (match === null) {
        this.buf = this.buf.subarray(headerEnd + 4);
        continue;
      }
      const length = Number(match[1]);
      const start = headerEnd + 4;
      if (this.buf.length < start + length) {
        return;
      }
      const body = this.buf.subarray(start, start + length).toString("utf8");
      this.buf = this.buf.subarray(start + length);
      try {
        const parsed = JSON.parse(body) as JsonRpc;
        if (typeof parsed.id === "number") {
          this.pending.get(parsed.id)?.(parsed);
          this.pending.delete(parsed.id);
        }
      } catch {
        continue;
      }
    }
  }

  send(method: string, params?: unknown): Promise<JsonRpc> {
    const id = this.nextId;
    this.nextId += 1;
    const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params });
    const msg = `Content-Length: ${Buffer.byteLength(payload, "utf8")}\r\n\r\n${payload}`;
    return new Promise((resolve, reject) => {
      this.pending.set(id, resolve);
      this.child.stdin.write(msg, (error) => {
        if (error) {
          this.pending.delete(id);
          reject(error);
        }
      });
      setTimeout(() => {
        if (this.pending.delete(id)) {
          reject(new Error(`MCP timeout on ${method}`));
        }
      }, 8000);
    });
  }

  kill(): void {
    this.child.kill("SIGTERM");
  }
}

export type McpHandle = {
  definitions: McpToolDef[];
  call: (name: string, args: Record<string, unknown>) => Promise<{ ok: boolean; output: string }>;
  close: () => void;
};

export async function loadMcpTools(workspaceRoot: string): Promise<McpHandle | null> {
  const configPath = join(workspaceRoot, ".agentdeck", "mcp.json");
  if (!existsSync(configPath)) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(configPath, "utf8"));
  } catch {
    return null;
  }
  if (!isRecord(parsed) || !isRecord(parsed.mcpServers)) {
    return null;
  }
  const processes: McpProcess[] = [];
  const definitions: McpToolDef[] = [];
  const callers = new Map<string, (args: Record<string, unknown>) => Promise<{ ok: boolean; output: string }>>();

  for (const [serverName, spec] of Object.entries(parsed.mcpServers)) {
    if (!isRecord(spec) || typeof spec.command !== "string") {
      continue;
    }
    const args = Array.isArray(spec.args) ? spec.args.map(String) : [];
    const child = spawn(spec.command, args, {
      cwd: workspaceRoot,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });
    const proc = new McpProcess(child);
    processes.push(proc);
    try {
      await proc.send("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "agentdeck", version: "0.1.0" },
      });
      const listed = await proc.send("tools/list", {});
      const tools = isRecord(listed.result) && Array.isArray(listed.result.tools) ? listed.result.tools : [];
      for (const tool of tools) {
        if (!isRecord(tool) || typeof tool.name !== "string") {
          continue;
        }
        const qualified = `mcp__${serverName}__${tool.name}`;
        definitions.push({
          type: "function",
          function: {
            name: qualified,
            description: typeof tool.description === "string" ? tool.description : `MCP ${serverName}.${tool.name}`,
            parameters: isRecord(tool.inputSchema) ? tool.inputSchema : { type: "object", properties: {} },
          },
        });
        callers.set(qualified, async (callArgs) => {
          const result = await proc.send("tools/call", { name: tool.name, arguments: callArgs });
          if (result.error) {
            return { ok: false, output: result.error.message ?? "mcp error" };
          }
          return { ok: true, output: JSON.stringify(result.result ?? {}) };
        });
      }
    } catch {
      proc.kill();
    }
  }

  if (definitions.length === 0) {
    for (const proc of processes) {
      proc.kill();
    }
    return null;
  }

  return {
    definitions,
    call: async (name, args) => {
      const fn = callers.get(name);
      if (fn === undefined) {
        return { ok: false, output: `unknown MCP tool ${name}` };
      }
      return fn(args);
    },
    close: () => {
      for (const proc of processes) {
        proc.kill();
      }
    },
  };
}
