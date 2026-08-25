export type GitForge = "github" | "gitlab" | "other";

export type LinkedRepository = {
  forge: GitForge;
  remoteUrl: string;
  owner?: string;
  name?: string;
};

export function parseRemote(remoteUrl: string): LinkedRepository {
  const github = /github\.com[:/](?<owner>[^/]+)\/(?<name>[^/.]+)(?:\.git)?/i.exec(remoteUrl);
  if (github?.groups) {
    return { forge: "github", remoteUrl, owner: github.groups.owner, name: github.groups.name };
  }
  const gitlab = /gitlab\.com[:/](?<owner>[^/]+)\/(?<name>[^/.]+)(?:\.git)?/i.exec(remoteUrl);
  if (gitlab?.groups) {
    return { forge: "gitlab", remoteUrl, owner: gitlab.groups.owner, name: gitlab.groups.name };
  }
  return { forge: "other", remoteUrl };
}

export type IdeHost = "vscode" | "cursor" | "web" | "phone";

export type IdeBridgeHello = {
  host: IdeHost;
  clientVersion: string;
};

/**
 * VS Code and Cursor both speak the same AgentDeck websocket protocol.
 * Extensions are thin: they open the runner socket and forward editor context
 * (cwd, selection, active file) as extraSystemPrompt — they do not own agents.
 */
export const IDE_BRIDGE_NOTES = [
  "Cursor and VS Code are clients, not control planes.",
  "The runner remains the only process allowed to touch the local filesystem.",
  "Cloud control plane never receives raw disk paths; it receives workspace ids.",
] as const;

export {
  SCALE_GATES,
  ISOLATION_RULES,
  routeTenant,
  type Region,
  type TenantCell,
  type TokenLedgerEntry,
} from "./control-plane.ts";

export {
  checkSameOriginHttp,
  checkWebsocketUpgrade,
  CONFIG_ROUTE_HEADERS,
  hostAllowed,
  originAllowed,
  type GuardDecision,
  type HttpGuardPolicy,
} from "./http-guard.ts";

export type { PairRole } from "./pairing.ts";

export {
  canonicalizePairingCode,
  generatePairingCode,
  isCanonicalPairingCode,
  pairingCodesEqual,
  PairingDesk,
  PAIRING_CODE_LENGTH,
  PAIRING_TTL_MS,
  PAIRING_MAX_ATTEMPTS_PER_CODE,
  PAIRING_MAX_ATTEMPTS_PER_SOURCE_PER_MINUTE,
  CROCKFORD,
} from "./pairing.ts";

export { deriveRelayKey, isSealedFrame, openSealed, sealJson, type SealedFrame } from "./relay-seal.ts";

export { timingSafeEqualString } from "./timing.ts";

