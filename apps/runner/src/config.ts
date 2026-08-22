import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

export const RunnerConfigSchema = z
  .object({
    token: z.string().min(16),
    port: z.number().int().min(1).max(65535),
    allowedRoots: z.array(z.string().min(1)).min(1),
  })
  .strict();

export type RunnerConfig = z.infer<typeof RunnerConfigSchema>;

export const DEFAULT_PORT = 7420;

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
    };
    writeFileSync(path, `${JSON.stringify(created, null, 2)}\n`, { mode: 0o600 });
    return created;
  }

  const parsed = RunnerConfigSchema.parse(JSON.parse(readFileSync(path, "utf8")));
  return parsed;
}
