import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { resolvePurserEnv } from "@purser-sh/env";
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

export function openSqliteDatabase(url = resolvePurserEnv().databaseUrl): AppDatabase {
  const resolved = resolveDatabaseDriver(url);
  if (resolved.driver === "postgres") {
    throw new Error(
      "Postgres is selected via PURSER_DATABASE_URL, but the live driver is SQLite in Phase 1. Unset the URL to use ~/.purser/purser.sqlite.",
    );
  }
  const filePath = resolveSqliteFilePath(resolved.url);

  if (filePath !== ":memory:") {
    mkdirSync(dirname(filePath), { recursive: true, mode: 0o700 });
  }

  const client = new Database(filePath, { create: true });
  client.exec("PRAGMA foreign_keys = ON;");
  if (filePath !== ":memory:") {
    client.exec("PRAGMA journal_mode = WAL;");
    client.exec("SELECT 1");
    for (const suffix of ["", "-wal", "-shm"] as const) {
      const path = `${filePath}${suffix}`;
      if (existsSync(path)) {
        chmodSync(path, 0o600);
      }
    }
  }

  const db = drizzle(client, { schema: sqliteSchema });
  migrate(db, { migrationsFolder: migrationsFolder() });
  return db;
}
