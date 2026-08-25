import { describe, expect, test } from "bun:test";
import { agentdeckConfigStatus, handleAgentdeckConfigRoute } from "./dev-config.ts";

describe("dev config route", () => {
  test("production mode is 404", () => {
    expect(agentdeckConfigStatus("production")).toBe(404);
    expect(agentdeckConfigStatus("development")).toBe(200);
  });

  test("a production-mode handler returns 404 and never CORS", () => {
    const headers = new Map<string, string>();
    let body = "";
    const res = {
      statusCode: 200,
      setHeader(name: string, value: number | string | readonly string[]) {
        headers.set(name.toLowerCase(), String(value));
      },
      end(chunk?: unknown) {
        if (typeof chunk === "string") {
          body = chunk;
        }
      },
    };
    handleAgentdeckConfigRoute({
      mode: "production",
      req: {
        headers: {
          origin: "http://127.0.0.1:7410",
          host: "127.0.0.1:7410",
          "sec-fetch-site": "same-origin",
        },
      },
      res,
      repoRoot: "/home/aksingh/AgentDeck",
    });
    expect(res.statusCode).toBe(404);
    expect(headers.get("access-control-allow-origin")).toBeUndefined();
    expect(body.includes("token")).toBe(false);
  });

  test("development rejects a missing Origin and never sets CORS", () => {
    const headers = new Map<string, string>();
    const res = {
      statusCode: 200,
      setHeader(name: string, value: number | string | readonly string[]) {
        headers.set(name.toLowerCase(), String(value));
      },
      end(_chunk?: unknown) {},
    };
    handleAgentdeckConfigRoute({
      mode: "development",
      req: { headers: { host: "127.0.0.1:7410" } },
      res,
      repoRoot: "/home/aksingh/AgentDeck",
    });
    expect(res.statusCode).toBe(403);
    expect(headers.get("access-control-allow-origin")).toBeUndefined();
    expect(headers.get("cache-control")).toBe("no-store");
  });
});
