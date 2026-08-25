import { openSqliteDatabase } from "@agentdeck/db";
import { printVerify, verifyAudit } from "./audit.ts";
import { agentdeckDir, configPath, loadOrCreateConfig } from "./config.ts";
import { startServer, type AppContext } from "./server.ts";

const args = process.argv.slice(2);
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
};

const { port } = await startServer(ctx);

console.log(`AgentDeck runner listening on ws://127.0.0.1:${port}`);
console.log(`Health check: http://127.0.0.1:${port}/health`);
console.log(`Config: ${configPath()}`);
console.log("Token is stored in the config file (not printed).");
