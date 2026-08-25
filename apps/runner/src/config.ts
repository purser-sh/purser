import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

export const DEFAULT_PORT = 7420;
export const DEFAULT_UI_ORIGINS = ["http://127.0.0.1:7410", "http://localhost:7410"] as const;
export const DEFAULT_BYPASS_TTL_MS = 30 * 60 * 1000;
export const DEFAULT_BYPASS_MAX_RUNS = 10;

export const RunnerConfigSchema = z
  .object({
    token: z.string().min(16),
    port: z.number().int().min(1).max(65535),
    allowedRoots: z.array(z.string().min(1)).min(1),
    allowedOrigins: z.array(z.string().min(1)).optional(),
    allowedHosts: z.array(z.string().min(1)).optional(),
    bypassTtlMs: z.number().int().positive().optional(),
    bypassMaxRuns: z.number().int().positive().optional(),
    redactPaths: z.boolean().optional(),
  })
  .strict();

export type RunnerConfig = z.infer<typeof RunnerConfigSchema>;

export function agentdeckDir(): string {
  const override = process.env.AGENTDECK_HOME;
  if (override !== undefined && override.length > 0) {
    return override;
  }
  return join(homedir(), ".agentdeck");
}

export function configPath(): string {
  return join(agentdeckDir(), "config.json");
}

export function logsDir(): string {
  return join(agentdeckDir(), "logs");
}

export function resolvedOrigins(config: RunnerConfig, boundPort?: number): string[] {
  const base = config.allowedOrigins ?? [...DEFAULT_UI_ORIGINS];
  if (boundPort === undefined) {
    return [...base];
  }
  const extra = [`http://127.0.0.1:${boundPort}`, `http://localhost:${boundPort}`];
  return [...new Set([...base, ...extra])];
}

export function resolvedHosts(config: RunnerConfig, boundPort: number): string[] {
  return config.allowedHosts ?? [`127.0.0.1:${boundPort}`, `localhost:${boundPort}`];
}

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function loadOrCreateConfig(): RunnerConfig {
  mkdirSync(agentdeckDir(), { recursive: true, mode: 0o700 });
  mkdirSync(logsDir(), { recursive: true, mode: 0o700 });

  const path = configPath();
  if (!existsSync(path)) {
    const created: RunnerConfig = {
      token: generateToken(),
      port: DEFAULT_PORT,
      allowedRoots: [homedir()],
      allowedOrigins: [...DEFAULT_UI_ORIGINS],
      allowedHosts: [`127.0.0.1:${DEFAULT_PORT}`, `localhost:${DEFAULT_PORT}`],
      bypassTtlMs: DEFAULT_BYPASS_TTL_MS,
      bypassMaxRuns: DEFAULT_BYPASS_MAX_RUNS,
    };
    writeFileSync(path, `${JSON.stringify(created, null, 2)}\n`, { mode: 0o600 });
    return created;
  }

  return RunnerConfigSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}
