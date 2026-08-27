import type { Remedy } from "@purser-sh/protocol";
import {
  apiKeyMissing,
  apiKeyRejected,
  API_KEY_ENV_VARS,
  cliMissingRemedy,
  endpointUnreachable,
  notAuthenticatedRemedy,
  ollamaUnreachable,
  REMEDIES,
  remedyMessage,
} from "./readiness.ts";

/**
 * Vendors describe failures in their own console's terms: Claude Code answers
 * "Not logged in · Please run /login", which is an instruction for a terminal
 * the user is not looking at. These matchers turn the ones we know about into
 * something a Purser user can act on.
 */

export interface VendorFailureContext {
  providerId: string;
  label?: string;
  baseUrl?: string | null;
}

const MISSING_BINARY = /\bENOENT\b|command not found|not recognized as|no such file or directory/i;
const NOT_AUTHENTICATED =
  /not logged ?in|please (?:run )?\/?login|\/login\b|log ?in (?:first|to)|unauthenticated|authentication_error|oauth token (?:has )?expired|credentials (?:are )?(?:missing|invalid|expired)|\b401\b|\b403\b/i;
const BAD_API_KEY = /invalid[_ ]api[_ ]key|incorrect api key|api key (?:is )?(?:invalid|expired|not valid)/i;
const NO_API_KEY = /missing api key|no api key|api key (?:is )?(?:missing|required|not set)/i;
const UNREACHABLE = /ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ETIMEDOUT|fetch failed|connection refused|network error|socket hang up/i;
const SDK_MISSING = /cannot find (?:module|package) ['"]?@anthropic-ai\/claude-agent-sdk|claude-agent-sdk.*not (?:installed|found)/i;
const OLLAMA_BROKEN_INSTALL = /llama-server(?:\.exe)? (?:binary )?not found|could not find llama-server|ollama.*broken install/i;

const CLI_PROVIDERS = new Set(["claude_code", "codex", "cursor_agent", "gemini_cli"]);

/** The known-failure matcher. Returns null when we have nothing better to say than the vendor did. */
export function translateVendorFailure(context: VendorFailureContext, raw: string): Remedy | null {
  const text = raw.trim();
  if (text.length === 0) {
    return null;
  }
  if (context.providerId === "claude_code" && SDK_MISSING.test(text)) {
    return REMEDIES.claudeSdkMissing;
  }
  if (CLI_PROVIDERS.has(context.providerId)) {
    if (MISSING_BINARY.test(text)) {
      return cliMissingRemedy(context.providerId);
    }
    if (NOT_AUTHENTICATED.test(text) || BAD_API_KEY.test(text)) {
      return notAuthenticatedRemedy(context.providerId);
    }
    return null;
  }
  const label = context.label ?? context.providerId;
  if (context.providerId === "ollama" && OLLAMA_BROKEN_INSTALL.test(text)) {
    return {
      title: "Ollama's install is broken.",
      fix: "Reinstall Ollama from https://ollama.com so llama-server is on PATH, then run ollama serve.",
      command: "curl -fsSL https://ollama.com/install.sh | sh",
      docsUrl: "https://ollama.com",
    };
  }
  if (context.providerId === "ollama" && UNREACHABLE.test(text)) {
    return ollamaUnreachable(context.baseUrl ?? "http://127.0.0.1:11434/v1");
  }
  if (NO_API_KEY.test(text)) {
    return apiKeyMissing(label, API_KEY_ENV_VARS[context.providerId] ?? null);
  }
  if (BAD_API_KEY.test(text) || NOT_AUTHENTICATED.test(text)) {
    return apiKeyRejected(label);
  }
  if (UNREACHABLE.test(text)) {
    return endpointUnreachable(label, context.baseUrl ?? "the configured base URL", firstLine(text));
  }
  return null;
}

/**
 * What the run should report. Falls back to the vendor's own text when we do
 * not recognise the failure, so nothing is swallowed.
 */
export function describeVendorFailure(
  context: VendorFailureContext,
  raw: string,
): { message: string; remedy: Remedy | null } {
  const remedy = translateVendorFailure(context, raw);
  if (remedy === null) {
    return { message: firstLine(raw) || "The provider failed without a message.", remedy: null };
  }
  return { message: remedyMessage(remedy), remedy };
}

function firstLine(text: string): string {
  const line = text.trim().split("\n")[0] ?? "";
  return line.length > 400 ? `${line.slice(0, 400)}…` : line;
}
