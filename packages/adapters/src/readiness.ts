import type { AgentEvent, ReadinessState, Remedy } from "@purser-sh/protocol";
import type { HealthResult } from "./types.ts";

/**
 * One place that knows what each provider needs before a prompt can be sent,
 * and what the user should do when it is missing. Everything the user reads
 * about a broken provider — the selector, the blocked composer, the error card
 * — is rendered from a `Remedy` built here, so the wording cannot drift.
 */

export function remedyMessage(remedy: Remedy): string {
  return `${remedy.title} ${remedy.fix}`;
}

export function ready(detail: string): HealthResult {
  return { ok: true, detail, state: "ready", remedy: null };
}

export function blocked(state: Exclude<ReadinessState, "ready">, remedy: Remedy): HealthResult {
  return { ok: false, detail: remedyMessage(remedy), state, remedy };
}

const CLAUDE_DOCS = "https://docs.claude.com/en/docs/claude-code/setup";
const CODEX_DOCS = "https://developers.openai.com/codex/cli";
const CURSOR_DOCS = "https://cursor.com/docs/cli/installation";
const GEMINI_DOCS = "https://google-gemini.github.io/gemini-cli/";
const OLLAMA_DOCS = "https://ollama.com/download";

export const REMEDIES = {
  claudeSdkMissing: {
    title: "Purser can't find the Claude Agent SDK.",
    fix: "Install it in packages/adapters, then reload Purser.",
    command: "bun add @anthropic-ai/claude-agent-sdk",
    docsUrl: CLAUDE_DOCS,
  },
  claudeCliMissing: {
    title: "Claude Code isn't installed.",
    fix: "Install the CLI, run claude once to log in, then reload Purser.",
    command: "npm install -g @anthropic-ai/claude-code",
    docsUrl: CLAUDE_DOCS,
  },
  claudeNotAuthenticated: {
    title: "Claude Code isn't authenticated.",
    fix: "Run claude in a terminal, use /login, then reload Purser.",
    command: "claude",
    docsUrl: CLAUDE_DOCS,
  },
  codexCliMissing: {
    title: "The Codex CLI isn't installed.",
    fix: "Install it, run codex login, then reload Purser.",
    command: "npm install -g @openai/codex",
    docsUrl: CODEX_DOCS,
  },
  codexNotAuthenticated: {
    title: "Codex isn't authenticated.",
    fix: "Run codex login in a terminal, then reload Purser.",
    command: "codex login",
    docsUrl: CODEX_DOCS,
  },
  cursorCliMissing: {
    title: "The Cursor CLI (cursor-agent) isn't installed.",
    fix: "Install it, run cursor-agent login, then reload Purser.",
    command: "curl https://cursor.com/install -fsS | bash",
    docsUrl: CURSOR_DOCS,
  },
  cursorNotAuthenticated: {
    title: "The Cursor CLI isn't authenticated.",
    fix: "Run cursor-agent login in a terminal, then reload Purser.",
    command: "cursor-agent login",
    docsUrl: CURSOR_DOCS,
  },
  geminiCliMissing: {
    title: "The Gemini CLI isn't installed.",
    fix: "Install it, run gemini once to sign in, then reload Purser.",
    command: "npm install -g @google/gemini-cli",
    docsUrl: GEMINI_DOCS,
  },
  geminiNotAuthenticated: {
    title: "The Gemini CLI isn't authenticated.",
    fix: "Run gemini in a terminal, use /auth, then reload Purser.",
    command: "gemini",
    docsUrl: GEMINI_DOCS,
  },
} as const satisfies Record<string, Remedy>;

export function ollamaUnreachable(baseUrl: string): Remedy {
  return {
    title: `Ollama isn't answering at ${baseUrl}.`,
    fix: "Start it with ollama serve, then re-check this provider.",
    command: "ollama serve",
    docsUrl: OLLAMA_DOCS,
  };
}

export function apiKeyMissing(label: string, envVar: string | null): Remedy {
  return {
    title: `${label} has no API key.`,
    fix:
      envVar === null
        ? `Add a key in Settings → ${label}, then re-check this provider.`
        : `Add a key in Settings → ${label} or export ${envVar}, then re-check this provider.`,
    command: null,
    docsUrl: null,
  };
}

export function apiKeyRejected(label: string): Remedy {
  return {
    title: `${label} rejected the API key.`,
    fix: `Replace the key in Settings → ${label}, then re-check this provider.`,
    command: null,
    docsUrl: null,
  };
}

export function endpointUnreachable(label: string, baseUrl: string, detail: string): Remedy {
  return {
    title: `${label} is not reachable at ${baseUrl}.`,
    fix: `Check the base URL in Settings → ${label} and that the service is running (${detail}).`,
    command: null,
    docsUrl: null,
  };
}

export function endpointRefused(label: string, status: number): Remedy {
  return {
    title: `${label} answered HTTP ${status}.`,
    fix: `Check the base URL and key in Settings → ${label}, then re-check this provider.`,
    command: null,
    docsUrl: null,
  };
}

/** Env vars that stand in for a key in Settings, mirrored from the runner secret map. */
export const API_KEY_ENV_VARS: Record<string, string | null> = {
  grok: "XAI_API_KEY",
  generic_llm: "OPENAI_API_KEY",
  perplexity: "PERPLEXITY_API_KEY",
};

/** A missing CLI, expressed per provider so the fix names the right installer. */
export function cliMissingRemedy(providerId: string): Remedy {
  if (providerId === "codex") {
    return REMEDIES.codexCliMissing;
  }
  if (providerId === "cursor_agent") {
    return REMEDIES.cursorCliMissing;
  }
  if (providerId === "gemini_cli") {
    return REMEDIES.geminiCliMissing;
  }
  return REMEDIES.claudeCliMissing;
}

/** A CLI that is installed but has no usable credentials. */
export function notAuthenticatedRemedy(providerId: string): Remedy {
  if (providerId === "codex") {
    return REMEDIES.codexNotAuthenticated;
  }
  if (providerId === "cursor_agent") {
    return REMEDIES.cursorNotAuthenticated;
  }
  if (providerId === "gemini_cli") {
    return REMEDIES.geminiNotAuthenticated;
  }
  return REMEDIES.claudeNotAuthenticated;
}

/**
 * Claude Code readiness from probe results. Kept free of I/O so the three
 * prerequisites (package, CLI, credentials) can be asserted independently.
 */
export function claudeReadiness(probe: {
  sdkPresent: boolean;
  cliPath: string | null;
  credentials: "present" | "absent";
}): HealthResult {
  if (!probe.sdkPresent) {
    return blocked("package_missing", REMEDIES.claudeSdkMissing);
  }
  if (probe.cliPath === null) {
    return blocked("cli_missing", REMEDIES.claudeCliMissing);
  }
  if (probe.credentials === "absent") {
    return blocked("not_authenticated", REMEDIES.claudeNotAuthenticated);
  }
  return ready(`Claude Code is logged in (${probe.cliPath}).`);
}

/** CLI-backed providers: the prerequisite we can check cheaply is the binary. */
export function cliReadiness(providerId: string, binary: string, cliPath: string | null): HealthResult {
  if (cliPath === null) {
    return blocked("cli_missing", cliMissingRemedy(providerId));
  }
  return ready(`${binary} is installed (${cliPath}).`);
}

/**
 * A run that never starts, said once: the error carries the fix and `done`
 * carries no summary, so the conversation shows a single card.
 */
export function blockedRunEvents(health: HealthResult): AgentEvent[] {
  return [
    { kind: "error", message: health.detail, fatal: true, remedy: health.remedy },
    { kind: "done", status: "error", summary: "" },
  ];
}
