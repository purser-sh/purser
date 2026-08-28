import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PURSER_ENV_VAR_NAMES, resolvePurserEnv, type PurserEnvVarName } from "./index.ts";

const REPO_ROOT = join(import.meta.dir, "../../..");

describe("resolvePurserEnv", () => {
  test("reads documented ports with defaults", () => {
    const env = resolvePurserEnv({});
    expect(env.webPort).toBe(7410);
    expect(env.relayPort).toBe(7430);
    expect(env.port).toBeUndefined();
  });

  test("PURSER_PORT overrides are validated", () => {
    expect(() => resolvePurserEnv({ PURSER_PORT: "0" })).toThrow(/PURSER_PORT/);
    expect(resolvePurserEnv({ PURSER_PORT: "7421" }).port).toBe(7421);
  });
});

describe("README documents only resolved env vars", () => {
  test("every PURSER_* mentioned in README appears in the resolver registry", () => {
    const readme = readFileSync(join(REPO_ROOT, "README.md"), "utf8");
    const mentioned = [...readme.matchAll(/PURSER_[A-Z0-9_]+/g)]
      .map((match) => match[0]!)
      .filter((name) => !name.startsWith("__"));
    const unique = [...new Set(mentioned)];
    expect(unique.length).toBeGreaterThan(0);
    for (const name of unique) {
      expect(PURSER_ENV_VAR_NAMES.includes(name as PurserEnvVarName)).toBe(true);
    }
  });
});
