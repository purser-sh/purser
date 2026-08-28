/**
 * Every PURSER_* variable documented in README must appear here.
 * Runtime code reads config only through resolvePurserEnv().
 */

export const PURSER_ENV_VAR_NAMES = [
  "PURSER_HOME",
  "PURSER_PORT",
  "PURSER_WEB_PORT",
  "PURSER_RELAY_PORT",
  "PURSER_RELAY_HOST",
  "PURSER_DATABASE_URL",
  "PURSER_UI_DIR",
  "PURSER_NO_BROWSER",
  "PURSER_REPO",
  "PURSER_VERSION",
  "PURSER_PREFIX",
  "PURSER_XAI_API_KEY",
  "PURSER_OPENAI_API_KEY",
  "PURSER_PERPLEXITY_API_KEY",
] as const;

export type PurserEnvVarName = (typeof PURSER_ENV_VAR_NAMES)[number];

export type PurserEnv = {
  home: string | undefined;
  port: number | undefined;
  webPort: number;
  relayPort: number;
  relayHost: string;
  databaseUrl: string | undefined;
  uiDir: string | undefined;
  noBrowser: boolean;
  repo: string | undefined;
  version: string | undefined;
  prefix: string | undefined;
  xaiApiKey: string | undefined;
  openaiApiKey: string | undefined;
  perplexityApiKey: string | undefined;
};

function optionalString(raw: string | undefined): string | undefined {
  if (raw === undefined || raw.trim().length === 0) {
    return undefined;
  }
  return raw;
}

function optionalPort(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim().length === 0) {
    return undefined;
  }
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PURSER_PORT must be an integer 1–65535, got ${JSON.stringify(raw)}`);
  }
  return port;
}

function requiredPort(raw: string | undefined, name: string, fallback: number): number {
  if (raw === undefined || raw.trim().length === 0) {
    return fallback;
  }
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${name} must be an integer 1–65535, got ${JSON.stringify(raw)}`);
  }
  return port;
}

function flag(raw: string | undefined): boolean {
  return raw === "1" || raw?.toLowerCase() === "true";
}

/** Resolve every PURSER_* knob from a process environment object. */
export function resolvePurserEnv(env: NodeJS.ProcessEnv = process.env): PurserEnv {
  return {
    home: optionalString(env.PURSER_HOME),
    port: optionalPort(env.PURSER_PORT),
    webPort: requiredPort(env.PURSER_WEB_PORT, "PURSER_WEB_PORT", 7410),
    relayPort: requiredPort(env.PURSER_RELAY_PORT, "PURSER_RELAY_PORT", 7430),
    relayHost: optionalString(env.PURSER_RELAY_HOST) ?? "127.0.0.1",
    databaseUrl: optionalString(env.PURSER_DATABASE_URL),
    uiDir: optionalString(env.PURSER_UI_DIR),
    noBrowser: flag(env.PURSER_NO_BROWSER),
    repo: optionalString(env.PURSER_REPO),
    version: optionalString(env.PURSER_VERSION),
    prefix: optionalString(env.PURSER_PREFIX),
    xaiApiKey: optionalString(env.PURSER_XAI_API_KEY),
    openaiApiKey: optionalString(env.PURSER_OPENAI_API_KEY),
    perplexityApiKey: optionalString(env.PURSER_PERPLEXITY_API_KEY),
  };
}

/** Provider secret env names checked after vendor-native variables. */
export function purserSecretEnvKeys(providerId: string): string[] {
  switch (providerId) {
    case "grok":
      return ["PURSER_XAI_API_KEY"];
    case "generic_llm":
    case "openai":
      return ["PURSER_OPENAI_API_KEY"];
    case "perplexity":
      return ["PURSER_PERPLEXITY_API_KEY"];
    default:
      return [`PURSER_${providerId.toUpperCase()}_API_KEY`];
  }
}
