export type DatabaseDriver = "sqlite" | "postgres";

const POSTGRES_PREFIXES = ["postgres://", "postgresql://"] as const;

export function resolveDatabaseDriver(url: string | undefined): {
  driver: DatabaseDriver;
  url: string;
} {
  if (url === undefined || url.length === 0) {
    return { driver: "sqlite", url: "sqlite://~/.agentdeck/agentdeck.sqlite" };
  }
  const normalized = url.trim();
  if (POSTGRES_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    return { driver: "postgres", url: normalized };
  }
  return { driver: "sqlite", url: normalized };
}
