export type Region = "eu-west" | "us-east" | "ap-south";

export type TenantCell = {
  tenantId: string;
  cellId: string;
  region: Region;
};

export type ScaleGate = {
  users: number;
  datastore: string;
  compute: string;
};

/**
 * Cloud scale is cell-based: each cell is an independent stack
 * (API, Postgres, object store, queue). Users are routed by tenant id,
 * not by a global SQLite file. Local Purser remains cell zero:
 * one machine, one runner, no multi-tenant sharing.
 */
export const SCALE_GATES = {
  local: { users: 1, datastore: "sqlite", compute: "laptop runner" } satisfies ScaleGate,
  team: { users: 10_000, datastore: "postgres + object storage", compute: "k8s runners" } satisfies ScaleGate,
  planet: {
    users: 10_000_000,
    datastore: "sharded postgres + object store",
    compute: "regional cells",
  } satisfies ScaleGate,
} as const;

export const ISOLATION_RULES = [
  "Hosted cells run one tenant per runner process. Do not multiplex orgs on one agent process.",
  "Cloud APIs accept workspace ids and git remotes. They never accept host filesystem paths.",
  "Secrets live in a 0600 file locally, or KMS in a cell. Never in the session database.",
  "The token ledger is append-only per tenant. Prompt coaching happens before the run is billed.",
  "Folder watch stays on the companion. Cells ingest git and object-store uploads instead.",
] as const;

export type TokenLedgerEntry = {
  tenantId: string;
  sessionId: string;
  providerId: string;
  estimatedTokens: number;
  compacted: boolean;
  tokensIn: number;
  tokensOut: number;
  createdAt: string;
};

function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function routeTenant(tenantId: string, region: Region): TenantCell {
  const cellIndex = fnv1a(`${region}:${tenantId}`) % 16;
  return {
    tenantId,
    region,
    cellId: `${region}-cell-${cellIndex.toString(16)}`,
  };
}
