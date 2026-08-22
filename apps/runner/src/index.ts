import { openSqliteDatabase } from "@agentdeck/db";
import { configPath, loadOrCreateConfig } from "./config.ts";
import { startServer, type AppContext } from "./server.ts";

const config = loadOrCreateConfig();
const db = openSqliteDatabase(process.env.AGENTDECK_DATABASE_URL);

const ctx: AppContext = {
  config,
  db,
  clients: new Set(),
  activeRuns: new Map(),
  pendingPermissions: new Map(),
  relay: null,
  voice: null,
};

const { port } = await startServer(ctx);

console.log(`AgentDeck runner listening on ws://127.0.0.1:${port}`);
console.log(`Health check: http://127.0.0.1:${port}/health`);
console.log(`Config: ${configPath()}`);
console.log("Token is stored in the config file (not printed).");
