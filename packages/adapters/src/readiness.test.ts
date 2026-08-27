import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentEvent, ReadinessState } from "@purser-sh/protocol";
import type { AgentAdapter, HealthResult } from "./types.ts";
import { claudeCodeAdapter, createClaudeMapper } from "./claude-code.ts";
import { codexAdapter } from "./cli/codex.ts";
import { cursorAgentAdapter } from "./cli/cursor-agent.ts";
import { geminiCliAdapter } from "./cli/gemini.ts";
import { echoAdapter } from "./echo.ts";
import { grokAdapter, ollamaAdapter, genericLlmAdapter, perplexityAdapter } from "./generic-llm/index.ts";
import { claudeReadiness } from "./readiness.ts";
import { translateVendorFailure } from "./vendor-errors.ts";

const ENV_KEYS = ["PATH", "HOME", "ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN"] as const;
const saved = new Map<string, string | undefined>(ENV_KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const [key, value] of saved) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

function emptyDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

/** A machine with none of the vendor CLIs installed and no credentials anywhere. */
function bareMachine(): void {
  process.env.PATH = emptyDir(".tmp-nopath-");
  process.env.HOME = emptyDir(".tmp-nohome-");
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
}

function fakeCli(name: string): string {
  const dir = emptyDir(".tmp-bin-");
  const path = join(dir, name);
  writeFileSync(path, "#!/bin/sh\nexit 0\n");
  chmodSync(path, 0o755);
  return dir;
}

async function collect(iterable: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of iterable) {
    events.push(event);
  }
  return events;
}

function runOnce(adapter: AgentAdapter): Promise<AgentEvent[]> {
  return collect(
    adapter.run({
      runId: "run_1",
      cwd: process.cwd(),
      workspaceRoot: process.cwd(),
      prompt: "summarise this repo",
      permissionMode: "ask",
      signal: new AbortController().signal,
    }),
  );
}

/**
 * The contract every adapter owes a user whose machine is not set up: exactly
 * one error, phrased for Purser, carrying the fix — and no second copy of it
 * in the `done` summary.
 */
function expectSingleActionableError(events: AgentEvent[]): AgentEvent & { kind: "error" } {
  const errors = events.filter((event): event is AgentEvent & { kind: "error" } => event.kind === "error");
  expect(errors).toHaveLength(1);
  const error = errors[0];
  if (error === undefined) {
    throw new Error("no error event");
  }
  expect(error.fatal).toBe(true);
  expect(error.remedy ?? null).not.toBeNull();
  expect(error.message).toBe(`${error.remedy?.title} ${error.remedy?.fix}`);

  const dones = events.filter((event) => event.kind === "done");
  expect(dones).toHaveLength(1);
  for (const done of dones) {
    if (done.kind === "done") {
      expect(done.status).toBe("error");
      // An empty summary is what keeps the UI from printing the message twice.
      expect(done.summary).toBe("");
    }
  }
  // Nothing else may restate it: no text, no thinking.
  expect(events.some((event) => event.kind === "text" || event.kind === "text_delta")).toBe(false);
  return error;
}

function expectBlocked(health: HealthResult, state: ReadinessState): void {
  expect(health.ok).toBe(false);
  expect(health.state).toBe(state);
  expect(health.remedy).not.toBeNull();
  expect(health.detail).toBe(`${health.remedy?.title} ${health.remedy?.fix}`);
}

describe("claude_code readiness", () => {
  test("a missing SDK names the install command, once", () => {
    const health = claudeReadiness({ sdkPresent: false, cliPath: null, credentials: "absent" });
    expectBlocked(health, "package_missing");
    expect(health.remedy?.command).toBe("bun add @anthropic-ai/claude-agent-sdk");
  });

  test("a missing CLI is reported before credentials", () => {
    const health = claudeReadiness({ sdkPresent: true, cliPath: null, credentials: "absent" });
    expectBlocked(health, "cli_missing");
    expect(health.remedy?.command).toBe("npm install -g @anthropic-ai/claude-code");
  });

  test("not logged in tells the user where /login actually lives", () => {
    const health = claudeReadiness({ sdkPresent: true, cliPath: "/usr/bin/claude", credentials: "absent" });
    expectBlocked(health, "not_authenticated");
    expect(health.detail).toBe(
      "Claude Code isn't authenticated. Run claude in a terminal, use /login, then reload Purser.",
    );
    expect(health.remedy?.command).toBe("claude");
  });

  test("a logged-in machine is ready", () => {
    const health = claudeReadiness({ sdkPresent: true, cliPath: "/usr/bin/claude", credentials: "present" });
    expect(health.ok).toBe(true);
    expect(health.state).toBe("ready");
    expect(health.remedy).toBeNull();
  });

  test("run refuses once when the CLI is installed but nobody has logged in", async () => {
    bareMachine();
    process.env.PATH = fakeCli("claude");
    const error = expectSingleActionableError(await runOnce(claudeCodeAdapter));
    expect(error.message).toContain("Claude Code isn't authenticated");
    expect(error.remedy?.command).toBe("claude");
  });

  test("the mapper reports a vendor login failure once, not three times", () => {
    const mapper = createClaudeMapper();
    const events = [
      ...mapper({ type: "system", subtype: "init", session_id: "abc" }),
      ...mapper({ type: "assistant", message: { content: [{ type: "text", text: "Not logged in · Please run /login" }] } }),
      ...mapper({ type: "result", subtype: "error_during_execution", result: "Not logged in · Please run /login" }),
    ];
    const error = expectSingleActionableError(events);
    expect(error.message).not.toBe("Not logged in · Please run /login");
    expect(error.message).toContain("reload Purser");
    expect(events.filter((event) => event.kind === "session_started")).toHaveLength(1);
  });
});

describe("CLI adapters without their CLI", () => {
  const cases: { adapter: AgentAdapter; expect: string; command: string }[] = [
    { adapter: codexAdapter, expect: "Codex CLI isn't installed", command: "npm install -g @openai/codex" },
    { adapter: cursorAgentAdapter, expect: "Cursor CLI (cursor-agent) isn't installed", command: "curl https://cursor.com/install -fsS | bash" },
    { adapter: geminiCliAdapter, expect: "Gemini CLI isn't installed", command: "npm install -g @google/gemini-cli" },
  ];

  for (const item of cases) {
    test(`${item.adapter.id} reports one actionable error`, async () => {
      bareMachine();
      expectBlocked(await item.adapter.checkHealth(), "cli_missing");
      const error = expectSingleActionableError(await runOnce(item.adapter));
      expect(error.message).toContain(item.expect);
      expect(error.remedy?.command).toBe(item.command);
    });
  }
});

describe("HTTP adapters without a key or an endpoint", () => {
  for (const adapter of [grokAdapter, genericLlmAdapter, perplexityAdapter]) {
    test(`${adapter.id} reports a missing API key without calling out`, async () => {
      const health = await adapter.checkHealth({ baseUrl: null, apiKey: null, settings: {} });
      expectBlocked(health, "api_key_missing");
      expect(health.detail).toContain("Settings");
      const error = expectSingleActionableError(await runOnce(adapter));
      expect(error.message).toContain("has no API key");
    });
  }

  test("ollama that is not running says how to start it", async () => {
    // Port 1 is never listening, so this is a refused connection, not a timeout.
    const health = await ollamaAdapter.checkHealth({
      baseUrl: "http://127.0.0.1:1/v1",
      apiKey: null,
      settings: {},
    });
    expectBlocked(health, "unreachable");
    expect(health.remedy?.command).toBe("ollama serve");
    expect(health.detail).toContain("http://127.0.0.1:1/v1");
  });
});

describe("echo", () => {
  test("needs nothing and stays ready on a bare machine", async () => {
    bareMachine();
    const health = await echoAdapter.checkHealth();
    expect(health.ok).toBe(true);
    expect(health.remedy).toBeNull();
  });
});

describe("vendor error translation", () => {
  test("Claude's own instruction is replaced, not forwarded", () => {
    const remedy = translateVendorFailure({ providerId: "claude_code" }, "Not logged in · Please run /login");
    expect(remedy?.title).toBe("Claude Code isn't authenticated.");
    expect(remedy?.fix).toBe("Run claude in a terminal, use /login, then reload Purser.");
  });

  test("a spawn failure becomes an install instruction for the right CLI", () => {
    const remedy = translateVendorFailure({ providerId: "codex" }, "spawn codex ENOENT");
    expect(remedy?.command).toBe("npm install -g @openai/codex");
  });

  test("an expired CLI login becomes a login instruction", () => {
    expect(translateVendorFailure({ providerId: "gemini_cli" }, "401 Unauthorized")?.command).toBe("gemini");
    expect(translateVendorFailure({ providerId: "cursor_agent" }, "please login first")?.command).toBe("cursor-agent login");
  });

  test("a refused Ollama socket becomes ollama serve", () => {
    const remedy = translateVendorFailure(
      { providerId: "ollama", label: "Ollama", baseUrl: "http://127.0.0.1:11434/v1" },
      "fetch failed: ECONNREFUSED 127.0.0.1:11434",
    );
    expect(remedy?.command).toBe("ollama serve");
  });

  test("a broken Ollama install names the reinstall", () => {
    const remedy = translateVendorFailure(
      { providerId: "ollama", label: "Ollama" },
      "Error: llama-server binary not found",
    );
    expect(remedy?.title).toContain("broken");
    expect(remedy?.command).toContain("ollama.com/install");
  });

  test("a rejected key points at Settings, and an unknown failure is left alone", () => {
    expect(translateVendorFailure({ providerId: "grok", label: "Grok (xAI)" }, "LLM 401: invalid_api_key")?.fix).toContain(
      "Settings",
    );
    expect(translateVendorFailure({ providerId: "grok", label: "Grok (xAI)" }, "the model was overloaded")).toBeNull();
  });
});
