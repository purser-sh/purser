import { describe, expect, test } from "bun:test";
import { resolveDatabaseDriver } from "./driver.ts";

describe("resolveDatabaseDriver", () => {
  test("defaults to sqlite", () => {
    expect(resolveDatabaseDriver(undefined).driver).toBe("sqlite");
    expect(resolveDatabaseDriver("").driver).toBe("sqlite");
  });

  test("detects postgres URLs", () => {
    expect(resolveDatabaseDriver("postgres://localhost/agentdeck").driver).toBe("postgres");
    expect(resolveDatabaseDriver("postgresql://localhost/agentdeck").driver).toBe("postgres");
  });

  test("treats file URLs as sqlite", () => {
    expect(resolveDatabaseDriver("file:./agentdeck.sqlite").driver).toBe("sqlite");
  });
});
