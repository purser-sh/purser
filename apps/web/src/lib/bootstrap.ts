export type Bootstrap = {
  wsUrl: string;
  token: string;
  allowedRoots: string[];
  defaultWorkspace?: { name: string; absPath: string };
  pair?: { role: "phone" | "runner"; code: string };
};

export type AgentdeckWindow = {
  __AGENTDECK_BOOTSTRAP__?: unknown;
};

declare global {
  interface Window {
    __AGENTDECK_BOOTSTRAP__?: unknown;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseBootstrap(value: unknown): Bootstrap | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  if (typeof value.wsUrl !== "string" || typeof value.token !== "string") {
    return undefined;
  }
  const defaultWorkspaceRaw = value.defaultWorkspace;
  const defaultWorkspace =
    isRecord(defaultWorkspaceRaw) &&
    typeof defaultWorkspaceRaw.name === "string" &&
    typeof defaultWorkspaceRaw.absPath === "string"
      ? { name: defaultWorkspaceRaw.name, absPath: defaultWorkspaceRaw.absPath }
      : undefined;
  return {
    wsUrl: value.wsUrl,
    token: value.token,
    allowedRoots: Array.isArray(value.allowedRoots)
      ? value.allowedRoots.filter((item): item is string => typeof item === "string")
      : [],
    defaultWorkspace,
  };
}

export function readInjectedBootstrap(globalObject: AgentdeckWindow): Bootstrap | undefined {
  return parseBootstrap(globalObject.__AGENTDECK_BOOTSTRAP__);
}
