import type { RunnerClient } from "@/lib/ws";
import { useDeckStore } from "@/lib/store";

function folderName(absPath: string): string {
  return absPath.split("/").filter(Boolean).at(-1) ?? absPath;
}

export async function openFolderWithSession(client: RunnerClient, absPath: string): Promise<void> {
  const existing = useDeckStore.getState().workspaces.find((workspace) => workspace.absPath === absPath);
  let workspaceId = existing?.id;
  if (workspaceId === undefined) {
    const created = await client.request("create_workspace", { name: folderName(absPath), absPath });
    if (created.type !== "workspace_created") {
      throw new Error("could not create workspace");
    }
    workspaceId = created.payload.id;
  }
  const sessions = useDeckStore.getState().sessions.filter((session) => session.workspaceId === workspaceId);
  if (sessions.length > 0) {
    // Prefer the most recently updated session so a restart lands on the one
    // the user was actually using, not the first-created echo session.
    const preferred =
      [...sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? sessions[0];
    useDeckStore.getState().selectWorkspace(workspaceId);
    useDeckStore.getState().selectSession(preferred?.id ?? null);
    return;
  }
  const configs = useDeckStore.getState().providerConfigs;
  const echo = configs.find((config) => config.providerId === "echo");
  await client.request("create_session", {
    workspaceId,
    title: "New session",
    providerId: echo?.providerId ?? configs[0]?.providerId ?? "echo",
    modelId: echo ? "echo-v1" : undefined,
    permissionMode: "ask",
  });
}
