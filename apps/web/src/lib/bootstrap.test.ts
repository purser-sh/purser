import { describe, expect, test } from "bun:test";
import { parseBootstrap, readInjectedBootstrap } from "./bootstrap.ts";

describe("bootstrap", () => {
  test("prefers the injected window payload over a config route", () => {
    const injected = readInjectedBootstrap({
      __PURSER_BOOTSTRAP__: {
        wsUrl: "ws://127.0.0.1:7420",
        token: "injected-token",
        allowedRoots: ["/home/me"],
      },
    });
    expect(injected).toEqual({
      wsUrl: "ws://127.0.0.1:7420",
      token: "injected-token",
      allowedRoots: ["/home/me"],
      defaultWorkspace: undefined,
    });
  });

  test("rejects a payload that is missing the token", () => {
    expect(parseBootstrap({ wsUrl: "ws://127.0.0.1:7420" })).toBeUndefined();
  });
});
