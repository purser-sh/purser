import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";

export class MissingCliError extends Error {
  constructor(public readonly binary: string, extra?: string) {
    super(
      extra ??
        `${binary} is not installed or not on PATH. Install the CLI and log in, then retry.`,
    );
    this.name = "MissingCliError";
  }
}

export async function* spawnJsonl(input: {
  command: string;
  args: string[];
  cwd: string;
  signal: AbortSignal;
  env?: NodeJS.ProcessEnv;
}): AsyncGenerator<unknown> {
  const child: ChildProcess = spawn(input.command, input.args, {
    cwd: input.cwd,
    env: { ...process.env, ...input.env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stderr: string[] = [];
  child.stderr?.on("data", (chunk: Buffer) => {
    stderr.push(chunk.toString());
  });
  const onAbort = () => {
    child.kill("SIGTERM");
  };
  input.signal.addEventListener("abort", onAbort);
  try {
    if (child.stdout === null) {
      throw new Error(`${input.command} produced no stdout`);
    }
    const lines = createInterface({ input: child.stdout });
    for await (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length === 0) {
        continue;
      }
      try {
        yield JSON.parse(trimmed) as unknown;
      } catch {
        yield { kind: "non_json", text: trimmed };
      }
    }
    const code: number | null = await new Promise((resolve, reject) => {
      const emitter = child as unknown as NodeJS.EventEmitter;
      emitter.on("error", reject);
      emitter.on("close", (exitCode: number | null) => resolve(exitCode));
    });
    if (code !== 0 && code !== null) {
      const detail = stderr.join("").trim();
      throw new Error(detail.length > 0 ? detail : `${input.command} exited with ${code}`);
    }
  } finally {
    input.signal.removeEventListener("abort", onAbort);
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }
}
