import { describe, expect, test } from "bun:test";
import { checkSameOriginHttp, checkUiHttp, checkWebsocketUpgrade } from "./http-guard.ts";
import { generatePairingCode, isCanonicalPairingCode, PairingDesk, PAIRING_CODE_LENGTH, PAIRING_MAX_ATTEMPTS_PER_CODE, PAIRING_MAX_ATTEMPTS_PER_SOURCE_PER_MINUTE, CROCKFORD } from "./pairing.ts";
import { deriveRelayKey, isSealedFrame, openSealed, sealJson } from "./relay-seal.ts";
import { parseRemote, routeTenant } from "./index.ts";

const policy = {
  allowedOrigins: ["http://127.0.0.1:7410", "http://localhost:7410"],
  allowedHosts: ["127.0.0.1:7420", "localhost:7420"],
};

describe("git forge parser", () => {
  test("detects GitHub and GitLab remotes", () => {
    expect(parseRemote("https://github.com/acme/app.git")).toEqual({
      forge: "github",
      remoteUrl: "https://github.com/acme/app.git",
      owner: "acme",
      name: "app",
    });
    expect(parseRemote("git@gitlab.com:acme/app.git").forge).toBe("gitlab");
  });
});

describe("cell routing", () => {
  test("is stable for the same tenant and region", () => {
    const a = routeTenant("org_acme", "eu-west");
    const b = routeTenant("org_acme", "eu-west");
    expect(a).toEqual(b);
    expect(a.cellId.startsWith("eu-west-cell-")).toBe(true);
  });
});

describe("websocket upgrade guard", () => {
  const token = "test-token-1234567890";

  test("rejects a foreign Origin", () => {
    const result = checkWebsocketUpgrade({
      origin: "https://evil.example",
      host: "127.0.0.1:7420",
      authorization: undefined,
      tokenQuery: undefined,
      runnerToken: token,
      policy,
    });
    expect(result.ok).toBe(false);
  });

  test("rejects a rebound Host", () => {
    const result = checkWebsocketUpgrade({
      origin: "http://127.0.0.1:7410",
      host: "evil.example",
      authorization: undefined,
      tokenQuery: undefined,
      runnerToken: token,
      policy,
    });
    expect(result.ok).toBe(false);
  });

  test("allows the real UI origin", () => {
    const result = checkWebsocketUpgrade({
      origin: "http://127.0.0.1:7410",
      host: "127.0.0.1:7420",
      authorization: undefined,
      tokenQuery: undefined,
      runnerToken: token,
      policy,
    });
    expect(result).toEqual({ ok: true, kind: "browser" });
  });

  test("allows a token-only client with no Origin", () => {
    const result = checkWebsocketUpgrade({
      origin: undefined,
      host: "127.0.0.1:7420",
      authorization: `Bearer ${token}`,
      tokenQuery: undefined,
      runnerToken: token,
      policy,
    });
    expect(result).toEqual({ ok: true, kind: "token-client" });
  });

  test("rejects a token-only client with no token", () => {
    const result = checkWebsocketUpgrade({
      origin: undefined,
      host: "127.0.0.1:7420",
      authorization: undefined,
      tokenQuery: undefined,
      runnerToken: token,
      policy,
    });
    expect(result.ok).toBe(false);
  });

  test("rejects a token-only client with a wrong token", () => {
    const result = checkWebsocketUpgrade({
      origin: undefined,
      host: "127.0.0.1:7420",
      authorization: "Bearer wrong-token-00000000",
      tokenQuery: undefined,
      runnerToken: token,
      policy,
    });
    expect(result.ok).toBe(false);
  });
});

describe("same-origin HTTP guard", () => {
  test("rejects cross-site Sec-Fetch-Site", () => {
    const result = checkSameOriginHttp({
      origin: "http://127.0.0.1:7410",
      host: "127.0.0.1:7410",
      secFetchSite: "cross-site",
      policy: {
        allowedOrigins: ["http://127.0.0.1:7410"],
        allowedHosts: ["127.0.0.1:7410"],
      },
    });
    expect(result.ok).toBe(false);
  });

  test("allows same-origin fetch from the UI", () => {
    const result = checkSameOriginHttp({
      origin: "http://127.0.0.1:7410",
      host: "127.0.0.1:7410",
      secFetchSite: "same-origin",
      policy: {
        allowedOrigins: ["http://127.0.0.1:7410"],
        allowedHosts: ["127.0.0.1:7410"],
      },
    });
    expect(result.ok).toBe(true);
  });
});

describe("embedded UI HTTP guard", () => {
  const uiPolicy = {
    allowedOrigins: ["http://127.0.0.1:7420"],
    allowedHosts: ["127.0.0.1:7420"],
  };

  test("allows a document navigation with Sec-Fetch-Site none and no Origin", () => {
    const result = checkUiHttp({
      origin: undefined,
      host: "127.0.0.1:7420",
      secFetchSite: "none",
      policy: uiPolicy,
    });
    expect(result).toEqual({ ok: true, kind: "browser" });
  });

  test("rejects curl without Origin or Sec-Fetch-Site", () => {
    const result = checkUiHttp({
      origin: undefined,
      host: "127.0.0.1:7420",
      secFetchSite: undefined,
      policy: uiPolicy,
    });
    expect(result.ok).toBe(false);
  });

  test("rejects a foreign Origin", () => {
    const result = checkUiHttp({
      origin: "https://evil.example",
      host: "127.0.0.1:7420",
      secFetchSite: "cross-site",
      policy: uiPolicy,
    });
    expect(result.ok).toBe(false);
  });
});

describe("pairing codes", () => {
  test("generates Crockford codes of length 8", () => {
    const code = generatePairingCode();
    expect(code.length).toBe(PAIRING_CODE_LENGTH);
    expect(isCanonicalPairingCode(code)).toBe(true);
  });

  test("TTL, single use, and per-code attempt burn", () => {
    let now = 1_000;
    const desk = new PairingDesk(() => now, 120_000);
    const first = desk.pair("ABCDEFGH", "runner", "10.0.0.1");
    expect(first.ok).toBe(true);
    const second = desk.pair("ABCDEFGH", "phone", "10.0.0.2");
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.complete).toBe(true);
    }
    const reuse = desk.pair("ABCDEFGH", "phone", "10.0.0.3");
    expect(reuse.ok).toBe(false);
    if (!reuse.ok) {
      expect(reuse.burned).toBe(true);
    }

    now = 1_000;
    const expiredDesk = new PairingDesk(() => now, 50);
    expiredDesk.pair("XYZXYZXY", "runner", "10.0.0.1");
    now = 1_100;
    const late = expiredDesk.pair("XYZXYZXY", "phone", "10.0.0.2");
    expect(late.ok).toBe(false);
    if (!late.ok) {
      expect(late.reason).toBe("expired");
    }
  });

  test("burns a code after five attempts", () => {
    const desk = new PairingDesk(() => 1_000, 120_000);
    for (let i = 0; i < PAIRING_MAX_ATTEMPTS_PER_CODE; i += 1) {
      const result = desk.pair("ABCDEFGH", "runner", `10.0.1.${i}`);
      expect(result.ok).toBe(true);
    }
    const sixth = desk.pair("ABCDEFGH", "phone", "10.0.1.9");
    expect(sixth.ok).toBe(false);
    if (!sixth.ok) {
      expect(sixth.burned).toBe(true);
    }
  });

  test("rate-limits a source and burns the code it was trying", () => {
    const desk = new PairingDesk(() => 1_000, 120_000);
    for (let i = 0; i < PAIRING_MAX_ATTEMPTS_PER_SOURCE_PER_MINUTE; i += 1) {
      const code = `AAAAAAA${CROCKFORD.charAt(i)}`;
      const result = desk.pair(code, "runner", "10.0.0.9");
      expect(result.ok).toBe(true);
    }
    const blocked = desk.pair("BBBBBBBB", "runner", "10.0.0.9");
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.burned).toBe(true);
    }
  });
});

describe("relay seal", () => {
  test("roundtrips JSON so the relay cannot read the payload", async () => {
    const key = await deriveRelayKey("ABCDEFGH");
    const sealed = await sealJson(key, { id: "1", type: "hello", payload: { token: "secret" } });
    expect(isSealedFrame(sealed)).toBe(true);
    expect(JSON.stringify(sealed).includes("secret")).toBe(false);
    const opened = await openSealed(key, sealed);
    expect(opened).toEqual({ id: "1", type: "hello", payload: { token: "secret" } });
  });
});
