import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { purserDir } from "./config.ts";
import { purserSecretEnvKeys } from "@purser-sh/env";

const ENV_MAP: Record<string, string[]> = {
  grok: ["XAI_API_KEY", ...purserSecretEnvKeys("grok")],
  generic_llm: ["OPENAI_API_KEY", ...purserSecretEnvKeys("generic_llm")],
  ollama: [],
  perplexity: ["PERPLEXITY_API_KEY", ...purserSecretEnvKeys("perplexity")],
  openai: ["OPENAI_API_KEY", ...purserSecretEnvKeys("openai")],
  deepgram: ["DEEPGRAM_API_KEY"],
  elevenlabs: ["ELEVENLABS_API_KEY"],
};

function secretsPath(): string {
  return join(purserDir(), "secrets.json");
}

function readStore(): Record<string, string> {
  const path = secretsPath();
  if (!existsSync(path)) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      const out: Record<string, string> = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === "string" && value.length > 0) {
          out[key] = value;
        }
      }
      return out;
    }
  } catch {
    return {};
  }
  return {};
}

function writeStore(store: Record<string, string>): void {
  mkdirSync(purserDir(), { recursive: true, mode: 0o700 });
  writeFileSync(secretsPath(), `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
}

export function getSecret(providerId: string): string | null {
  const keys = ENV_MAP[providerId] ?? purserSecretEnvKeys(providerId);
  for (const key of keys) {
    const value = process.env[key];
    if (value !== undefined && value.length > 0) {
      return value;
    }
  }
  return readStore()[providerId] ?? null;
}

export function setSecret(providerId: string, apiKey: string | null): void {
  const store = readStore();
  if (apiKey === null || apiKey.length === 0) {
    delete store[providerId];
  } else {
    store[providerId] = apiKey;
  }
  writeStore(store);
}

export function takeApiKeyFromSettings(settings: Record<string, unknown>): {
  settings: Record<string, unknown>;
  apiKey: string | null;
} {
  const next = { ...settings };
  const raw = next.apiKey;
  delete next.apiKey;
  return { settings: next, apiKey: typeof raw === "string" && raw.length > 0 ? raw : null };
}
