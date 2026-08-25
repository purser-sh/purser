import { openSqliteDatabase } from "@agentdeck/db";
import { printVerify, verifyAudit } from "./audit.ts";
import { agentdeckDir, configPath, loadOrCreateConfig } from "./config.ts";
import { startServer, type AppContext } from "./server.ts";
import { resolveUiDir } from "./ui-serve.ts";

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
  console.log("AgentDeck companion");
  console.log("  (no args)       start the runner, serve the UI, never print the token");
  console.log("  audit verify    verify ~/.agentdeck/audit.jsonl");
  process.exit(0);
}
if (args[0] === "audit" && args[1] === "verify") {
  const result = verifyAudit(agentdeckDir());
  console.log(printVerify(result));
  process.exit(result.ok ? 0 : 1);
}

const config = loadOrCreateConfig();
const db = openSqliteDatabase(process.env.AGENTDECK_DATABASE_URL);

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

const { port } = await startServer(ctx);
const uiUrl = `http://127.0.0.1:${port}/`;

console.log(`AgentDeck runner listening on ws://127.0.0.1:${port}`);
console.log(`Health check: http://127.0.0.1:${port}/health`);
console.log(`Config: ${configPath()}`);
if (ctx.uiDir !== undefined) {
  console.log(`UI: ${uiUrl}`);
}
console.log("Token is stored in the config file (not printed).");

const packaged = typeof Bun !== "undefined" && Bun.isStandaloneExecutable === true;
if (packaged && process.env.AGENTDECK_NO_BROWSER !== "1") {
  await openBrowser(uiUrl);
}
