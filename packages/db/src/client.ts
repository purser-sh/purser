import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Database } from "bun:sqlite";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { sqliteSchema } from "./schema.sqlite.ts";
import { resolveSqliteFilePath } from "./paths.ts";
import { resolveDatabaseDriver } from "./driver.ts";

export type AppDatabase = BunSQLiteDatabase<typeof sqliteSchema> & {
  $client: Database;
};

export function migrationsFolder(): string {
  return new URL("../drizzle", import.meta.url).pathname;
}

export function openSqliteDatabase(url = process.env.AGENTDECK_DATABASE_URL): AppDatabase {
  const resolved = resolveDatabaseDriver(url);
  if (resolved.driver === "postgres") {
    throw new Error(
      "Postgres is selected via AGENTDECK_DATABASE_URL, but the live driver is SQLite in Phase 1. Unset the URL to use ~/.agentdeck/agentdeck.sqlite.",
    );
  }
  const filePath = resolveSqliteFilePath(resolved.url);

  if (filePath !== ":memory:") {
    mkdirSync(dirname(filePath), { recursive: true });
  }

  const client = new Database(filePath, { create: true });
  client.exec("PRAGMA foreign_keys = ON;");
  if (filePath !== ":memory:") {
    client.exec("PRAGMA journal_mode = WAL;");
  }

  const db = drizzle(client, { schema: sqliteSchema });
  migrate(db, { migrationsFolder: migrationsFolder() });
  return db;
}
