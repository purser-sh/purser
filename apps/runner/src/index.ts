import { openSqliteDatabase } from "@purser-sh/db";
import { resolvePurserEnv } from "@purser-sh/env";
import { printVerify, verifyAudit } from "./audit.ts";
import { purserDir, configPath, loadOrCreateConfig } from "./config.ts";
import { formatListenError } from "./listen-error.ts";
import { startServer, type AppContext } from "./server.ts";
import { hasEmbeddedUi, resolveUiDir } from "./ui-serve.ts";

import { augmentProcessPath } from "@purser-sh/adapters";

function userArgv(): string[] {
  const standalone = typeof Bun !== "undefined" && Bun.isStandaloneExecutable === true;
  return process.argv.slice(standalone ? 1 : 2);
}

async function openBrowser(url: string): Promise<void> {
  const platform = process.platform;
  try {
    if (platform === "darwin") {
      await Bun.spawn(["open", url], { stdout: "ignore", stderr: "ignore" }).exited;
      return;
    }
    if (platform === "win32") {
      await Bun.spawn(["cmd", "/c", "start", "", url], { stdout: "ignore", stderr: "ignore" }).exited;
      return;
    }
    await Bun.spawn(["xdg-open", url], { stdout: "ignore", stderr: "ignore" }).exited;
  } catch {
    // First-run still works; the user can open the printed URL.
  }
}

const args = userArgv();
if (args[0] === "--help" || args[0] === "-h") {
  console.log("Purser companion");
  console.log("  (no args)       start the runner, serve the UI, never print the token");
  console.log("  audit verify    verify ~/.purser/audit.jsonl");
  process.exit(0);
}
if (args[0] === "audit" && args[1] === "verify") {
  const result = verifyAudit(purserDir());
  console.log(printVerify(result));
  process.exit(result.ok ? 0 : 1);
}

const config = loadOrCreateConfig();
augmentProcessPath();
const purserEnv = resolvePurserEnv();
const db = openSqliteDatabase(purserEnv.databaseUrl);

const ctx: AppContext = {
  config,
  db,
  clients: new Set(),
  activeRuns: new Map(),
  pendingPermissions: new Map(),
  pendingBudgets: new Map(),
  relay: null,
  voice: null,
  folderWatch: null,
  uiDir: resolveUiDir(import.meta.dir),
};

const { port } = await startServer(ctx).catch((error: unknown) => {
  console.error(formatListenError(error, ctx.config.port));
  process.exit(1);
});
const uiUrl = `http://127.0.0.1:${port}/`;

console.log(`Purser runner listening on ws://127.0.0.1:${port}`);
console.log(`Health check: http://127.0.0.1:${port}/health`);
console.log(`Config: ${configPath()}`);
if (ctx.uiDir !== undefined || hasEmbeddedUi()) {
  console.log(`UI: ${uiUrl}`);
}
console.log("Token is stored in the config file (not printed).");

const packaged = typeof Bun !== "undefined" && Bun.isStandaloneExecutable === true;
if (packaged && !purserEnv.noBrowser && (ctx.uiDir !== undefined || hasEmbeddedUi())) {
  await openBrowser(uiUrl);
}
