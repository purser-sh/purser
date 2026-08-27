import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Claude Code keeps its token in `~/.claude/.credentials.json` on Linux and in
 * the login keychain on macOS, where the signed-in account is still recorded in
 * `~/.claude.json`. Either is evidence of a login; neither being present is the
 * state our users hit on a fresh machine.
 */
export function claudeCredentialState(env: NodeJS.ProcessEnv = process.env): "present" | "absent" {
  if ((env.ANTHROPIC_API_KEY ?? "").length > 0 || (env.CLAUDE_CODE_OAUTH_TOKEN ?? "").length > 0) {
    return "present";
  }
  const home = env.HOME ?? homedir();
  if (existsSync(join(home, ".claude", ".credentials.json"))) {
    return "present";
  }
  return hasOauthAccount(join(home, ".claude.json")) ? "present" : "absent";
}

export async function claudeSdkPresent(): Promise<boolean> {
  try {
    await import("@anthropic-ai/claude-agent-sdk");
    return true;
  } catch {
    return false;
  }
}

function hasOauthAccount(path: string): boolean {
  if (!existsSync(path)) {
    return false;
  }
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    return parsed !== null && typeof parsed === "object" && "oauthAccount" in parsed;
  } catch {
    return false;
  }
}
